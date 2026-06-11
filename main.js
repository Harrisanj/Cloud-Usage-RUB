'use strict';

const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen, nativeImage, net } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { loadAllEntries } = require('./parser');

function getClaudeHome() {
  let home = path.join(os.homedir(), '.claude');
  if (!fs.existsSync(path.join(home, 'projects'))) {
    const wslPath = '\\\\wsl$\\Ubuntu\\home\\harrisan\\.claude';
    if (fs.existsSync(path.join(wslPath, 'projects'))) {
      home = wslPath;
    }
  }
  return home;
}

// Apply proxy from ~/.claude/settings.json before app ready
try {
  const claudeSettings = JSON.parse(fs.readFileSync(
    path.join(getClaudeHome(), 'settings.json'), 'utf8'
  ));
  const proxy = claudeSettings.env?.HTTPS_PROXY || claudeSettings.env?.HTTP_PROXY;
  if (proxy) app.commandLine.appendSwitch('proxy-server', proxy.replace(/^https?:\/\//, ''));
} catch (_) {}

// ── Statusline reader ──────────────────────────────────────────────────────
// Claude Code writes server-reported rate_limits here via statusline-writer.js.
// Returns { five_hour_pct, seven_day_pct, resets_at_5h, resets_at_7d } or null.

const STATUSLINE_FILE = 'statusline-latest.json';

function readStatuslineLatest() {
  const STATUSLINE_PATH = path.join(getClaudeHome(), STATUSLINE_FILE);
  try {
    const json = JSON.parse(fs.readFileSync(STATUSLINE_PATH, 'utf8'));
    const rl = json.rate_limits;
    if (!rl) return null;
    const fh = rl.five_hour;
    const sd = rl.seven_day;
    const now = Date.now();
    // Anthropic occasionally returns stale snapshots where resets_at is already in
    // the past — that means the percentage refers to a window that has already
    // closed, so drop it and let the log-based computation take over.
    const reset5h = fh?.resets_at != null ? fh.resets_at * 1000 : null;
    const reset7d = sd?.resets_at != null ? sd.resets_at * 1000 : null;
    const stale5h = reset5h != null && reset5h <= now;
    const stale7d = reset7d != null && reset7d <= now;
    return {
      five_hour_pct:  stale5h ? null : (fh?.used_percentage ?? null),
      seven_day_pct:  stale7d ? null : (sd?.used_percentage ?? null),
      resets_at_5h:   stale5h ? null : reset5h,
      resets_at_7d:   stale7d ? null : reset7d,
    };
  } catch (_) {
    return null;
  }
}

// ── Claude.ai usage API ────────────────────────────────────────────────────
// Fetches server-reported per-model usage from claude.ai (requires OAuth token).
// Uses Electron net.request() — Chromium networking stack, passes Cloudflare.


// ── Constants ──────────────────────────────────────────────────────────────

const ALL_TARIFFS = {
  'Max 5×': { session5h: 88, weeklyAll: 2400, weeklySonnet: 1800 },
  'Max 20×': { session5h: 352, weeklyAll: 9600, weeklySonnet: 7200 },
  'Pro': { session5h: 8.8, weeklyAll: 240, weeklySonnet: 180 }
};

const TARIFF_STATE_PATH = path.join(app.getPath('userData'), 'tariff-state.json');

function loadConfig() {
  try {
    const data = JSON.parse(fs.readFileSync(TARIFF_STATE_PATH, 'utf8'));
    return {
      tariff: ALL_TARIFFS[data.tariff] ? data.tariff : 'Max 5×',
      currency: data.currency === 'RUB' ? 'RUB' : 'USD'
    };
  } catch (_) {}
  return { tariff: 'Max 5×', currency: 'USD' };
}

function saveConfig(tariff, currency) {
  try {
    fs.writeFileSync(TARIFF_STATE_PATH, JSON.stringify({ tariff, currency }), 'utf8');
  } catch (_) {}
}

function getLimits() {
  return ALL_TARIFFS[loadConfig().tariff];
}

let exchangeRateUSD = 100; // Fallback

function updateExchangeRate() {
  if (!app.isReady()) return;
  const request = net.request('https://www.cbr-xml-daily.ru/daily_json.js');
  request.on('response', (response) => {
    let body = '';
    response.on('data', (chunk) => body += chunk);
    response.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (data.Valute && data.Valute.USD) {
          exchangeRateUSD = data.Valute.USD.Value;
        }
      } catch (_) {}
    });
  });
  request.on('error', () => {});
  request.end();
}

const PRICING = {
  opus:   { input: 5,    output: 25,   cacheRead: 0.50, cacheCreate: 6.25 },
  sonnet: { input: 3,    output: 15,   cacheRead: 0.30, cacheCreate: 3.75 },
  haiku:  { input: 1,    output: 5,    cacheRead: 0.10, cacheCreate: 1.25 },
  unknown:{ input: 3,    output: 15,   cacheRead: 0.30, cacheCreate: 3.75 },
};

const WIN_STATE_PATH    = path.join(app.getPath('userData'), 'window-state.json');
const RESET_STATE_PATH  = path.join(app.getPath('userData'), 'weekly-reset.json');
const WINDOW_W = 380;
const WINDOW_H = 580;

// ── Weekly reset state ─────────────────────────────────────────────────────
// Stores { ts: number } — timestamp when the user last confirmed a reset happened.

function loadWeeklyReset() {
  try {
    const data = JSON.parse(fs.readFileSync(RESET_STATE_PATH, 'utf8'));
    return data.ts || null;
  } catch (_) {
    return null;
  }
}

function saveWeeklyReset(ts) {
  fs.writeFileSync(RESET_STATE_PATH, JSON.stringify({ ts }), 'utf8');
}

function getWeeklyStart() {
  const saved = loadWeeklyReset();
  if (saved) {
    // Use saved reset time. If it's more than 8 days ago, reset may have happened again —
    // but we don't know when, so keep using last saved until user marks a new one.
    return saved;
  }
  // Fallback: last Friday 3:00 AM local (matches Claude dashboard "Resets Fri 3:00 AM")
  const now = new Date();
  const day = now.getDay(); // 0=Sun … 5=Fri
  const daysFromFri = (day >= 5) ? day - 5 : day + 2;
  const fri3am = new Date(now);
  fri3am.setDate(fri3am.getDate() - daysFromFri);
  fri3am.setHours(3, 0, 0, 0);
  // If that computed time is still in the future (e.g. today IS Friday but it's 1 AM) — go back a week
  if (fri3am.getTime() > now.getTime()) fri3am.setDate(fri3am.getDate() - 7);
  return fri3am.getTime();
}

// ── Cost helpers ───────────────────────────────────────────────────────────

function entryCost(e) {
  const p = PRICING[e.model] || PRICING.unknown;
  return (e.input / 1_000_000)       * p.input
       + (e.output / 1_000_000)      * p.output
       + (e.cacheRead / 1_000_000)   * p.cacheRead
       + (e.cacheCreate / 1_000_000) * p.cacheCreate;
}

// ── Aggregators ────────────────────────────────────────────────────────────

function getSession5h(entries) {
  const now = Date.now();
  const SESSION_DUR = 5 * 60 * 60 * 1000;

  if (entries.length === 0) return { cost: 0, opus: 0, sonnet: 0, haiku: 0, resetInMs: 0, projects: [] };

  // entries is sorted ascending by ts (from loadAllEntries).
  // Walk forward: new session starts when an entry falls outside the current session's
  // hour-aligned expiry window (T_hour + 5h), matching Claude's fixed-window model.
  let sessionStart = entries[0].ts;
  for (let i = 1; i < entries.length; i++) {
    const hourTs = sessionStart - (sessionStart % (60 * 60 * 1000));
    if (entries[i].ts >= hourTs + SESSION_DUR) {
      sessionStart = entries[i].ts;
    }
  }

  // Claude aligns session expiry to the UTC hour boundary of the first request.
  // e.g. first request at 17:04 UTC → session expires at 17:00 UTC + 5h = 22:00 UTC.
  const sessionHourTs = sessionStart - (sessionStart % (60 * 60 * 1000));
  const sessionExpiry = sessionHourTs + SESSION_DUR;

  if (sessionExpiry <= now) {
    return { cost: 0, opus: 0, sonnet: 0, haiku: 0, resetInMs: 0, projects: [] };
  }

  const result = { cost: 0, opus: 0, sonnet: 0, haiku: 0, resetInMs: 0 };
  const projectCosts = new Map();
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].ts < sessionStart) break;
    const c = entryCost(entries[i]);
    result.cost += c;
    if (entries[i].model === 'opus' || entries[i].model === 'sonnet' || entries[i].model === 'haiku') {
      result[entries[i].model] += c;
    }
    const proj = entries[i].project || 'unknown';
    projectCosts.set(proj, (projectCosts.get(proj) || 0) + c);
  }

  result.projects = [...projectCosts.entries()]
    .map(([name, cost]) => ({ name, cost }))
    .sort((a, b) => b.cost - a.cost);

  result.resetInMs = sessionExpiry - now;
  return result;
}

function getWeekly(entries) {
  const since = getWeeklyStart();
  const sub = entries.filter(e => e.ts >= since);

  const result = { cost: 0, sonnetCost: 0, resetInMs: 0 };
  for (const e of sub) {
    const c = entryCost(e);
    result.cost += c;
    if (e.model === 'sonnet') result.sonnetCost += c;
  }

  const nextReset = since + 7 * 24 * 60 * 60 * 1000;
  result.resetInMs = nextReset - Date.now();
  result.weekStart = since;
  return result;
}

function getLast24HoursByHour(entries) {
  const now = Date.now();
  const buckets = new Array(24).fill(0);
  const since = now - 24 * 60 * 60 * 1000;
  for (const e of entries) {
    if (e.ts < since || e.ts > now) continue;
    const hourAgo = Math.floor((now - e.ts) / 3_600_000);
    if (hourAgo < 24) buckets[23 - hourAgo] += entryCost(e);
  }
  return buckets;
}

function getLast7Days(entries) {
  const now = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const dayEnd = new Date(d);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    days.push({
      day: dayNames[d.getDay()],
      start: d.getTime(),
      end: dayEnd.getTime(),
      opus: 0, sonnet: 0, haiku: 0,
    });
  }

  for (const e of entries) {
    for (const bucket of days) {
      if (e.ts >= bucket.start && e.ts < bucket.end) {
        const c = entryCost(e);
        if (e.model === 'opus' || e.model === 'sonnet' || e.model === 'haiku') {
          bucket[e.model] += c;
        }
        break;
      }
    }
  }

  return days.map(({ day, opus, sonnet, haiku }) => ({ day, opus, sonnet, haiku }));
}

// ── Window state ───────────────────────────────────────────────────────────

function loadWindowState() {
  try { return JSON.parse(fs.readFileSync(WIN_STATE_PATH, 'utf8')); }
  catch (_) { return null; }
}

function saveWindowState(win) {
  try {
    const [x, y] = win.getPosition();
    fs.writeFileSync(WIN_STATE_PATH, JSON.stringify({ x, y }), 'utf8');
  } catch (_) {}
}

function getDefaultPosition() {
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  return { x: width - WINDOW_W - 20, y: 20 };
}

// ── Tray icon ──────────────────────────────────────────────────────────────

function createTrayIcon() {
  const size = 16;
  const pixels = Buffer.alloc(size * size * 4); // RGBA, zeroed = transparent
  const cx = size / 2, cy = size / 2, r = size / 2 - 0.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5, dy = y - cy + 0.5;
      if (Math.sqrt(dx * dx + dy * dy) > r) continue;
      const i = (y * size + x) * 4;
      pixels[i]     = 0xD9; // R  — Claude orange #D97757
      pixels[i + 1] = 0x77; // G
      pixels[i + 2] = 0x57; // B
      pixels[i + 3] = 0xFF; // A
    }
  }

  return nativeImage.createFromBitmap(pixels, { width: size, height: size });
}

// ── Main ───────────────────────────────────────────────────────────────────

let mainWindow = null;
let tray = null;
let updateInterval = null;

function createWindow() {
  const saved = loadWindowState();
  const pos = saved || getDefaultPosition();

  mainWindow = new BrowserWindow({
    width: WINDOW_W,
    height: WINDOW_H,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('moved', () => saveWindowState(mainWindow));
  mainWindow.on('close', (e) => { e.preventDefault(); mainWindow.hide(); });
}

function createTray() {
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('Claude Usage Overlay');

  const menu = Menu.buildFromTemplate([
    { label: 'Show / Hide', click: () => toggleWindow() },
    { label: 'Ghost Mode (Ctrl+Alt+U)', click: () => toggleGhostMode() },
    { label: 'Reload data', click: () => mainWindow && mainWindow.reload() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);

  tray.setContextMenu(menu);
  tray.on('click', () => toggleWindow());
}

let isGhostMode = false;
function toggleGhostMode() {
  if (!mainWindow) return;
  isGhostMode = !isGhostMode;
  if (isGhostMode) {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  } else {
    mainWindow.setIgnoreMouseEvents(false);
  }
  mainWindow.webContents.send('ghost-mode-changed', isGhostMode);
}

function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) { mainWindow.hide(); }
  else { mainWindow.show(); mainWindow.focus(); }
}

async function buildPayload() {
  const entries = await loadAllEntries();
  const now = Date.now();

  const session = getSession5h(entries);
  const weekly  = getWeekly(entries);
  const sl      = readStatuslineLatest();

  return {
    session5h: {
      cost:          session.cost,
      opus:          session.opus,
      sonnet:        session.sonnet,
      haiku:         session.haiku,
      resetInMs:     session.resetInMs,
      projects:      session.projects || [],
      serverPct:     sl?.five_hour_pct  ?? null,
      serverResetAt: sl?.resets_at_5h   ?? null,
    },
    weeklyAll: {
      cost:          weekly.cost,
      resetInMs:     weekly.resetInMs,
      weekStart:     weekly.weekStart,
      serverPct:     sl?.seven_day_pct  ?? null,
      serverResetAt: sl?.resets_at_7d   ?? null,
    },
    weeklySonnet: {
      cost:      weekly.sonnetCost,
      serverPct: null,
    },
    last24h:   getLast24HoursByHour(entries),
    last7Days: getLast7Days(entries),
    updatedAt: now,
    limits: getLimits(),
    tariffName: loadConfig().tariff,
    availableTariffs: Object.keys(ALL_TARIFFS),
    currency: loadConfig().currency,
    exchangeRate: exchangeRateUSD,
  };
}

ipcMain.on('hide-window', () => {
  if (mainWindow) mainWindow.hide();
});

ipcMain.on('toggle-ghost-mode', () => {
  toggleGhostMode();
});

ipcMain.on('mark-weekly-reset', (_e, tsArg) => {
  const ts = (typeof tsArg === 'number' && tsArg > 0) ? tsArg : Date.now();
  saveWeeklyReset(ts);
  // Immediately push fresh data
  if (mainWindow && !mainWindow.isDestroyed()) {
    buildPayload().then(p => mainWindow.webContents.send('usage-update', p)).catch(() => {});
  }
});

ipcMain.on('set-tariff', (_e, name) => {
  const cfg = loadConfig();
  if (ALL_TARIFFS[name]) cfg.tariff = name;
  saveConfig(cfg.tariff, cfg.currency);
  if (mainWindow && !mainWindow.isDestroyed()) {
    buildPayload().then(p => mainWindow.webContents.send('usage-update', p)).catch(() => {});
  }
});

ipcMain.on('set-currency', (_e, cur) => {
  const cfg = loadConfig();
  if (cur === 'RUB' || cur === 'USD') cfg.currency = cur;
  saveConfig(cfg.tariff, cfg.currency);
  if (mainWindow && !mainWindow.isDestroyed()) {
    buildPayload().then(p => mainWindow.webContents.send('usage-update', p)).catch(() => {});
  }
});

async function startUpdates() {
  if (updateInterval) { clearInterval(updateInterval); updateInterval = null; }
  const send = async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        const payload = await buildPayload();
        mainWindow.webContents.send('usage-update', payload);
      } catch (_) { /* swallow — no console output, exe stdio may be inherited from launching shell */ }
    }
  };

  await send();
  updateInterval = setInterval(send, 30_000);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // Another instance is already running — focus it and quit
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    updateExchangeRate();
    setInterval(updateExchangeRate, 3600 * 1000);
    createWindow();
    createTray();
    globalShortcut.register('CommandOrControl+Shift+U', toggleWindow);
    globalShortcut.register('CommandOrControl+Alt+U', toggleGhostMode);
    mainWindow.webContents.on('did-finish-load', () => startUpdates());
  });
}

app.on('window-all-closed', () => {});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (updateInterval) clearInterval(updateInterval);
});

app.setAppUserModelId('claude.usage.overlay');
