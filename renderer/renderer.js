'use strict';

// ── Theme ──────────────────────────────────────────────────────────────

// Declare chart variables first so updateChartTheme can safely reference them
// even before charts are initialized (they'll be undefined → skipped)
let chart7, chart24h;

const root = document.documentElement;
let isDark = localStorage.getItem('theme') !== 'light';
applyTheme(isDark);

function applyTheme(dark) {
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  localStorage.setItem('theme', dark ? 'dark' : 'light');
  updateChartTheme(dark);
}

function themeColor(dark, darkVal, lightVal) {
  return dark ? darkVal : lightVal;
}

function updateChartTheme(dark) {
  const grid = themeColor(dark, '#1e2532', '#ced8e8');
  const tick = themeColor(dark, '#5a6878', '#8096ad');
  const tooltipBg = themeColor(dark, '#0d1218', '#f3f6fa');
  const tooltipTitle = themeColor(dark, '#e8eef5', '#1a2633');
  const tooltipBody = themeColor(dark, '#c5d1de', '#3a4a5c');

  Chart.defaults.color = tick;

  [chart7, chart24h].forEach(chart => {
    if (!chart) return;
    ['x', 'y'].forEach(axis => {
      chart.options.scales[axis].grid.color = grid;
      chart.options.scales[axis].ticks.color = tick;
      chart.options.scales[axis].border.color = grid;
    });
    if (chart.options.scales.y2) {
      chart.options.scales.y2.grid.color = grid;
      chart.options.scales.y2.ticks.color = tick;
    }
    const tp = chart.options.plugins.tooltip;
    tp.backgroundColor = tooltipBg;
    tp.titleColor = tooltipTitle;
    tp.bodyColor  = tooltipBody;
    tp.footerColor = tooltipBody;
    tp.borderColor = grid;
    chart.update('none');
  });
}

// ── Formatting ─────────────────────────────────────────────────────────
let currentCurrency = 'USD';
let globalCurrency = 'USD';
let globalRate = 100;
let lastLimits = null;

chart7 = null;
chart24h = null;

function fmtCost(usd) {
  let val = usd;
  let sym = '$';
  if (globalCurrency === 'RUB') {
    val = usd * globalRate;
    sym = '₽';
  }
  if (val >= 1000) return sym + (val / 1000).toFixed(1) + 'K';
  if (val >= 100)  return sym + val.toFixed(0);
  if (val >= 10)   return sym + val.toFixed(1);
  return sym + val.toFixed(2);
}

function fmtDuration(ms) {
  if (ms <= 0) return 'сейчас';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м`;
}

function fmtResetTime(resetInMs) {
  if (resetInMs <= 0) return 'просрочен — нажми ↺';
  if (resetInMs < 24 * 3600000) {
    return 'через ' + fmtDuration(resetInMs);
  }
  // More than 24h: show absolute date + day name + time
  const d = new Date(Date.now() + resetInMs);
  const days = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
  const date = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `${date} ${days[d.getDay()]} ${time}`;
}

function fmtAgo(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

function isoWeekNumber(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
}

function fmtWeekEnd(weekStartTs) {
  const endTs = weekStartTs + 7 * 24 * 3600 * 1000;
  const d = new Date(endTs);
  const days = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
  const date = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const week = isoWeekNumber(weekStartTs);
  return `нед. ${week} · по ${date} ${days[d.getDay()]} ${time}`;
}

// ── Progress bar ───────────────────────────────────────────────────────

function setBar(id, pct, color = null, disableWarn = false) {
  const bar = document.getElementById(id);
  if (!bar) return;
  bar.style.width = Math.min(100, Math.max(0, pct)) + '%';
  bar.classList.remove('warn', 'crit');
  if (!disableWarn) {
    if (pct >= 80) {
      bar.classList.add('crit');
      bar.style.backgroundColor = '';
      return;
    } else if (pct >= 50) {
      bar.classList.add('warn');
      bar.style.backgroundColor = '';
      return;
    }
  }
  bar.style.backgroundColor = color || '';
}

// ── Chart.js init ──────────────────────────────────────────────────────

const COLORS = { opus: '#d97757', sonnet: '#6aa9c9', haiku: '#9ab87a', fable: '#c288d6' };

function makeTooltip() {
  return {
    backgroundColor: isDark ? '#0d1218' : '#f3f6fa',
    borderColor: isDark ? '#1e2532' : '#ced8e8',
    borderWidth: 1,
    titleColor:  isDark ? '#e8eef5' : '#1a2633',
    bodyColor:   isDark ? '#c5d1de' : '#3a4a5c',
    footerColor: isDark ? '#c5d1de' : '#3a4a5c',
    titleFont:  { family: "'JetBrains Mono', monospace", size: 11, weight: '600' },
    bodyFont:   { family: "'JetBrains Mono', monospace", size: 10 },
    footerFont: { family: "'JetBrains Mono', monospace", size: 10, weight: '600' },
    padding: 7,
  };
}

Chart.defaults.font = { family: "'JetBrains Mono', monospace", size: 10 };
Chart.defaults.color = isDark ? '#5a6878' : '#8096ad';

const scaleBase = () => ({
  grid:   { color: isDark ? '#1e2532' : '#ced8e8' },
  ticks:  { color: isDark ? '#5a6878' : '#8096ad', font: { size: 9 } },
  border: { color: isDark ? '#1e2532' : '#ced8e8' },
});

// 7-day stacked bar
const ctx7 = document.getElementById('chart7days').getContext('2d');
chart7 = new Chart(ctx7, {
  type: 'bar',
  data: {
    labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
    datasets: [
      { label: 'Opus',   data: new Array(7).fill(0), backgroundColor: COLORS.opus,   stack: 'u' },
      { label: 'Sonnet', data: new Array(7).fill(0), backgroundColor: COLORS.sonnet, stack: 'u' },
      { label: 'Haiku',  data: new Array(7).fill(0), backgroundColor: COLORS.haiku,  stack: 'u' },
      { label: 'Fable',  data: new Array(7).fill(0), backgroundColor: COLORS.fable,  stack: 'u' },
    ],
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    animation: { duration: 500 },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...makeTooltip(),
        callbacks: {
          title:  (items) => items[0]?.label || '',
          label:  (item)  => ` ${item.dataset.label}: ${fmtCost(item.raw)}`,
          footer: (items) => `Итого: ${fmtCost(items.reduce((s,i) => s + (i.raw||0), 0))}`,
        },
      },
    },
    onClick: (e, elements) => {
      if (elements.length > 0) {
        const index = elements[0].index;
        showChartPopover(index);
      }
    },
    scales: {
      x: { ...scaleBase(), ticks: { ...scaleBase().ticks, maxRotation: 0 } },
      y: {
        ...scaleBase(), stacked: true,
        ticks: { ...scaleBase().ticks, callback: v => fmtCost(v), maxTicksLimit: 4 },
      },
    },
  },
});

// 24h chart
function make24hLabels() {
  const now = new Date();
  return Array.from({ length: 24 }, (_, i) => {
    const h = new Date(now.getTime() - (23 - i) * 3_600_000);
    return h.getHours() + ':00';
  });
}

const ctx24 = document.getElementById('chart24h').getContext('2d');
const grad24 = ctx24.createLinearGradient(0, 0, 0, 82);
grad24.addColorStop(0, 'rgba(106,169,201,0.40)');
grad24.addColorStop(1, 'rgba(106,169,201,0.03)');

chart24h = new Chart(ctx24, {
  type: 'bar',
  data: {
    labels: make24hLabels(),
    datasets: [{
      label: '$/h',
      data: new Array(24).fill(0),
      backgroundColor: COLORS.sonnet + 'bb',
      borderColor: COLORS.sonnet,
      borderWidth: 1,
      borderRadius: 2,
    }],
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    animation: { duration: 400 },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...makeTooltip(),
        callbacks: {
          title: (items) => items[0]?.label || '',
          label: (item)  => ` ${fmtCost(item.raw)}`,
        },
      },
    },
    scales: {
      x: {
        ...scaleBase(),
        ticks: {
          ...scaleBase().ticks, maxRotation: 0,
          callback: (_, i, ticks) => {
            // Show only every 4th label to avoid overlap
            if (i % 4 !== 0) return '';
            return ticks[i]?.label ?? '';
          },
        },
      },
      y: {
        ...scaleBase(),
        ticks: { ...scaleBase().ticks, callback: v => fmtCost(v), maxTicksLimit: 3 },
      },
    },
  },
});

// ── State ──────────────────────────────────────────────────────────────
let lastUpdatedAt = null;
let lastSessionProjects = [];
let lastWeeklyProjects = [];
let last7DaysData = [];
let lastSessionPct = 0;
let lastWeeklyPct = 0;
let currentTariffName = null;


// ── Project name decoding ──────────────────────────────────────────────
// Claude Code stores logs in ~/.claude/projects/<encoded-cwd>/, where the
// folder name is the cwd path with non-letter chars replaced by '-'.
// e.g. H:\VBox\...\claude-widget → "H--VBox-ubuntu22-Drive-claude-widget".
// We can't reverse the encoding losslessly (path separators and real '-'
// in names collapse to the same '-'), so heuristic: drop a leading
// single-letter Windows drive token, then return the last 2 tokens
// joined with '-' — works correctly for `claude-widget`-style names.
function projectDisplayName(folderName) {
  if (!folderName) return 'unknown';
  const parts = folderName.split('-').filter(Boolean);
  if (parts.length > 0 && parts[0].length === 1 && /^[A-Za-z]$/.test(parts[0])) {
    parts.shift();
  }
  if (parts.length === 0) return folderName;
  if (parts.length === 1) return parts[0];
  return parts.slice(-2).join('-');
}

// ── Update ─────────────────────────────────────────────────────────────

function update(d) {
  lastUpdatedAt = d.updatedAt;
  lastLimits = d.limits;
  const lim = d.limits;
  globalCurrency = d.currency;
  globalRate = d.exchangeRate || 100;

  const tariffSelect = document.getElementById('tariffSelect');
  if (tariffSelect && currentTariffName !== d.tariffName) {
    currentTariffName = d.tariffName;
    tariffSelect.innerHTML = d.availableTariffs.map(t => 
      `<option value="${t}" ${t === currentTariffName ? 'selected' : ''}>${t}</option>`
    ).join('');
  }

  const currencySelect = document.getElementById('currencySelect');
  if (currencySelect && currentCurrency !== d.currency) {
    currentCurrency = d.currency;
    currencySelect.innerHTML = 
      `<option value="USD" ${d.currency === 'USD' ? 'selected' : ''}>$ USD</option>` +
      `<option value="RUB" ${d.currency === 'RUB' ? 'selected' : ''}>₽ RUB</option>`;
  }

  const lbl7Days = document.getElementById('lbl7Days');
  if (lbl7Days) lbl7Days.textContent = `Last 7 Days · ${d.currency === 'RUB' ? '₽' : '$'}/day`;
  const lbl24h = document.getElementById('lbl24h');
  if (lbl24h) lbl24h.textContent = `Last 24 Hours · ${d.currency === 'RUB' ? '₽' : '$'}/h`;

  const fableSelect = document.getElementById('fableSelect');
  if (fableSelect && d.limits && d.limits.includeFable5 !== undefined) {
    const val = d.limits.includeFable5 ? 'true' : 'false';
    if (fableSelect.value !== val) {
      fableSelect.value = val;
    }
    const fableSpan = document.getElementById('lblFable5h');
    const fableLeg = document.getElementById('legFable');
    if (fableSpan) fableSpan.hidden = !d.limits.includeFable5;
    if (fableLeg) fableLeg.hidden = !d.limits.includeFable5;
    if (chart7) {
      chart7.data.datasets[3].hidden = !d.limits.includeFable5;
    }
  }

  // 5h session — prefer server-reported % from statusline, fall back to calculated
  const pct5h = d.session5h.serverPct !== null
    ? d.session5h.serverPct
    : (lim.session5h > 0 ? (d.session5h.cost / lim.session5h) * 100 : 0);
  
  let dom5h = '';
  if (d.session5h.opus >= d.session5h.sonnet && d.session5h.opus >= d.session5h.haiku && d.session5h.opus >= (d.session5h.fable || 0)) dom5h = COLORS.opus;
  else if (d.session5h.sonnet >= d.session5h.opus && d.session5h.sonnet >= d.session5h.haiku && d.session5h.sonnet >= (d.session5h.fable || 0)) dom5h = COLORS.sonnet;
  else if (d.session5h.haiku >= d.session5h.opus && d.session5h.haiku >= d.session5h.sonnet && d.session5h.haiku >= (d.session5h.fable || 0)) dom5h = COLORS.haiku;
  else if ((d.session5h.fable || 0) >= d.session5h.opus && (d.session5h.fable || 0) >= d.session5h.sonnet && (d.session5h.fable || 0) >= d.session5h.haiku) dom5h = COLORS.fable;
  
  setBar('bar5h', pct5h, dom5h);
  document.getElementById('pct5h').textContent = pct5h.toFixed(1) + '%';
  lastSessionPct = pct5h;

  const resetMs5h = d.session5h.serverResetAt !== null
    ? d.session5h.serverResetAt - Date.now()
    : d.session5h.resetInMs;
  document.getElementById('resetSession').textContent =
    resetMs5h > 0 ? 'через ' + fmtDuration(resetMs5h) : 'сейчас';

  const SESSION_DUR_MS = 5 * 60 * 60 * 1000;
  const elapsedPct5h = resetMs5h > 0
    ? Math.min(100, Math.max(0, (SESSION_DUR_MS - resetMs5h) / SESSION_DUR_MS * 100))
    : 0;
  const barTime = document.getElementById('bar5hTime');
  if (barTime) barTime.style.width = elapsedPct5h.toFixed(1) + '%';

  const totalCost5h = d.session5h.cost || 0.001;
  const safePct = (v, total) => (v / total * 100).toFixed(0);
  document.getElementById('modelRow5h').innerHTML =
    `<span class="m-opus">Opus ${safePct(d.session5h.opus, totalCost5h)}%</span>` +
    `<span class="m-sonnet">Sonnet ${safePct(d.session5h.sonnet, totalCost5h)}%</span>` +
    `<span class="m-haiku">Haiku ${safePct(d.session5h.haiku, totalCost5h)}%</span>` +
    `<span class="m-fable">Fable ${safePct(d.session5h.fable || 0, totalCost5h)}%</span>`;

  lastSessionProjects = d.session5h.projects || [];
  if (!document.getElementById('sessionPopover').hidden) renderSessionPopover();

  // Weekly all — prefer server-reported %
  const pctW = d.weeklyAll.serverPct !== null
    ? d.weeklyAll.serverPct
    : (lim.weeklyAll > 0 ? (d.weeklyAll.cost / lim.weeklyAll) * 100 : 0);
    
  setBar('barWeekly', pctW, 'var(--ok)', true); // always green
  document.getElementById('pctWeekly').textContent = pctW.toFixed(1) + '%';
  lastWeeklyPct = pctW;

  lastWeeklyProjects = d.weeklyAll.projects || [];
  if (!document.getElementById('weeklyPopover').hidden) renderWeeklyPopover();

  const resetMsW = d.weeklyAll.serverResetAt !== null
    ? d.weeklyAll.serverResetAt - Date.now()
    : d.weeklyAll.resetInMs;
  document.getElementById('resetWeekly').textContent = fmtResetTime(resetMsW);

  const WEEK_DUR_MS = 7 * 24 * 60 * 60 * 1000;
  const elapsedPctW = resetMsW > 0
    ? Math.min(100, Math.max(0, (WEEK_DUR_MS - resetMsW) / WEEK_DUR_MS * 100))
    : 0;
  const barWeeklyTime = document.getElementById('barWeeklyTime');
  if (barWeeklyTime) barWeeklyTime.style.width = elapsedPctW.toFixed(1) + '%';
  if (d.weeklyAll.weekStart) {
    window._lastWeekStart = d.weeklyAll.weekStart;
    document.getElementById('weekStartLabel').textContent = fmtWeekEnd(d.weeklyAll.weekStart);
  }

  // Weekly sonnet — use server % if available (from claude.ai API)
  const pctS = d.weeklySonnet.serverPct !== null
    ? d.weeklySonnet.serverPct
    : (lim.weeklySonnet > 0 ? (d.weeklySonnet.cost / lim.weeklySonnet) * 100 : 0);
  setBar('barSonnet', pctS, COLORS.sonnet);
  document.getElementById('pctSonnet').textContent = pctS.toFixed(1) + '%';

  // 7-day chart
  last7DaysData = d.last7Days || [];
  chart7.data.labels = d.last7Days.map(x => x.day);
  chart7.data.datasets[0].data = d.last7Days.map(x => x.opus);
  chart7.data.datasets[1].data = d.last7Days.map(x => x.sonnet);
  chart7.data.datasets[2].data = d.last7Days.map(x => x.haiku);
  chart7.data.datasets[3].data = d.last7Days.map(x => x.fable || 0);
  chart7.update('none');

  // 24h chart — update labels to current hours
  chart24h.data.labels = make24hLabels();
  chart24h.data.datasets[0].data = d.last24h;
  chart24h.update('none');

  // Footer
  document.getElementById('costSession').textContent = fmtCost(d.session5h.cost) + (lim.session5h ? ` / ${fmtCost(lim.session5h)}` : '');
  document.getElementById('costWeek').textContent    = fmtCost(d.weeklyAll.cost) + (lim.weeklyAll ? ` / ${fmtCost(lim.weeklyAll)}` : '');
  document.getElementById('updatedAt').textContent   = 'Updated 0s ago';
}

// ── Wire up ────────────────────────────────────────────────────────────

document.getElementById('closeBtn').addEventListener('click', () => window.api.hideWindow());

const tariffSelect = document.getElementById('tariffSelect');
if (tariffSelect) {
  tariffSelect.addEventListener('change', (e) => {
    window.api.setTariff(e.target.value);
  });
}

const currencySelect = document.getElementById('currencySelect');
if (currencySelect) {
  currencySelect.addEventListener('change', (e) => {
    window.api.setCurrency(e.target.value);
  });
}

// ── Reset picker modal ─────────────────────────────────────────────────

function lastResetDate() {
  // Returns the current week start time as a Date (for modal prefill)
  if (window._lastWeekStart) return new Date(window._lastWeekStart);
  // Fallback: last Friday 3:00 AM local
  const now = new Date();
  const day = now.getDay();
  const daysFromFri = (day >= 5) ? day - 5 : day + 2;
  const fri = new Date(now);
  fri.setDate(fri.getDate() - daysFromFri);
  fri.setHours(3, 0, 0, 0);
  if (fri > now) fri.setDate(fri.getDate() - 7);
  return fri;
}

function toDatetimeLocal(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}` +
         `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

let currentModalMode = 'weekly';

const modal      = document.getElementById('resetModal');
const resetInput = document.getElementById('resetInput');
const resetMinutesInput = document.getElementById('resetMinutesInput');
const modalTitle = document.getElementById('resetModalTitle');

document.getElementById('markResetBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  currentModalMode = 'weekly';
  if (modalTitle) modalTitle.textContent = 'Когда начался отсчет недели?';
  resetInput.hidden = false;
  resetMinutesInput.hidden = true;
  resetInput.value = toDatetimeLocal(lastResetDate());
  modal.hidden = false;
});

const markSessionBtn = document.getElementById('markSessionBtn');
if (markSessionBtn) {
  markSessionBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // prevent popover
    currentModalMode = 'session';
    if (modalTitle) modalTitle.textContent = 'Через сколько минут сброс сессии?';
    resetInput.hidden = true;
    resetMinutesInput.hidden = false;
    resetMinutesInput.value = '';
    modal.hidden = false;
  });
}

document.getElementById('modalCancel').addEventListener('click', () => {
  modal.hidden = true;
});

// ── Calibrate Modal ────────────────────────────────────────────────────────

const calibrateModal = document.getElementById('calibrateModal');
const calibrateInput = document.getElementById('calibrateInput');
let currentCalibrateMode = '5h';

const pct5hBtn = document.getElementById('pct5h');
if (pct5hBtn) {
  pct5hBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    currentCalibrateMode = '5h';
    calibrateModal.hidden = false;
    calibrateInput.value = '';
    calibrateInput.focus();
  });
}

const pctWeeklyBtn = document.getElementById('pctWeekly');
if (pctWeeklyBtn) {
  pctWeeklyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    currentCalibrateMode = 'weekly';
    calibrateModal.hidden = false;
    calibrateInput.value = '';
    calibrateInput.focus();
  });
}

document.getElementById('calCancelBtn').addEventListener('click', () => {
  calibrateModal.hidden = true;
});

document.getElementById('calResetBtn').addEventListener('click', () => {
  window.api.calibrate(currentCalibrateMode, null);
  calibrateModal.hidden = true;
});

document.getElementById('calSaveBtn').addEventListener('click', () => {
  const pct = parseFloat(calibrateInput.value);
  if (!isNaN(pct) && pct > 0) {
    window.api.calibrate(currentCalibrateMode, pct);
  }
  calibrateModal.hidden = true;
});

const calHistModal = document.getElementById('calHistModal');
const calHistList = document.getElementById('calHistList');

document.getElementById('calHistBtn').addEventListener('click', () => {
  const hist = currentCalibrateMode === 'weekly' 
    ? (lastLimits?.calibHistWeekly || []) 
    : (lastLimits?.calibHist5h || []);
  
  document.getElementById('calHistTitle').textContent = `История (${currentCalibrateMode})`;
  
  if (hist.length === 0) {
    calHistList.innerHTML = '<div style="color: var(--text-dim); text-align: center; padding: 10px;">Нет данных</div>';
  } else {
    calHistList.innerHTML = hist.map((item, index) => {
      const date = new Date(item.ts);
      const timeStr = date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
      return `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; border-bottom: 1px solid var(--border);">
          <div>
            <span style="color: var(--text);">${item.pct}%</span>
            <span style="color: var(--text-dim); margin-left: 8px; font-size: 10px;">${timeStr}</span>
          </div>
          <button class="icon-btn" onclick="deleteHistoryItem(${index})" style="font-size: 10px; color: var(--crit);">✖</button>
        </div>
      `;
    }).join('');
  }
  
  calHistModal.hidden = false;
});

document.getElementById('calHistCloseBtn').addEventListener('click', () => {
  calHistModal.hidden = true;
});

window.deleteHistoryItem = function(index) {
  window.api.deleteCalibration(currentCalibrateMode, index);
  calHistModal.hidden = true;
};

document.getElementById('modalOk').addEventListener('click', () => {
  let ts;
  if (currentModalMode === 'weekly') {
    ts = new Date(resetInput.value).getTime();
  } else {
    const mins = parseInt(resetMinutesInput.value, 10);
    if (!isNaN(mins)) {
      ts = Date.now() + mins * 60000;
    }
  }

  if (!isNaN(ts) && ts !== undefined) {
    if (currentModalMode === 'weekly') {
      window.api.markWeeklyReset(ts);
    } else {
      window.api.markSessionReset(ts);
    }
  }
  modal.hidden = true;
});

document.getElementById('themeBtn').addEventListener('click', () => {
  isDark = !isDark;
  applyTheme(isDark);
});

const fableSelect = document.getElementById('fableSelect');
if (fableSelect) {
  fableSelect.addEventListener('change', (e) => {
    if (window.api.setFableMode) window.api.setFableMode(e.target.value === 'true');
  });
}

const ghostBtn = document.getElementById('ghostBtn');
if (ghostBtn) {
  ghostBtn.addEventListener('click', () => {
    if (window.api.toggleGhostMode) window.api.toggleGhostMode();
  });
}
if (window.api.onGhostModeChanged) {
  window.api.onGhostModeChanged((isGhost) => {
    if (isGhost) {
      document.body.classList.add('ghost-mode');
    } else {
      document.body.classList.remove('ghost-mode');
    }
  });
}

// ── 5h projects popover ────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function renderSessionPopover() {
  const list = document.getElementById('sessionPopoverList');
  const total = lastSessionProjects.reduce((s, p) => s + p.cost, 0);
  if (total === 0 || lastSessionProjects.length === 0) {
    list.innerHTML = '<div class="popover-empty">Нет данных за текущую сессию</div>';
    return;
  }
  list.innerHTML = lastSessionProjects.map(p => {
    const pct = (p.cost / total * lastSessionPct).toFixed(1);
    const display = projectDisplayName(p.name);
    return `<div class="popover-row" title="${escapeHtml(p.name)}">` +
      `<span class="popover-name">${escapeHtml(display)}</span>` +
      `<span class="popover-pct">${pct}%</span>` +
    `</div>`;
  }).join('');
}

function renderWeeklyPopover() {
  const list = document.getElementById('weeklyPopoverList');
  const total = lastWeeklyProjects.reduce((s, p) => s + p.cost, 0);
  if (total === 0 || lastWeeklyProjects.length === 0) {
    list.innerHTML = '<div class="popover-empty">Нет данных за текущую неделю</div>';
    return;
  }
  list.innerHTML = lastWeeklyProjects.map(p => {
    const pct = (p.cost / total * lastWeeklyPct).toFixed(1);
    const display = projectDisplayName(p.name);
    return `<div class="popover-row" title="${escapeHtml(p.name)}">` +
      `<span class="popover-name">${escapeHtml(display)}</span>` +
      `<span class="popover-pct">${pct}%</span>` +
    `</div>`;
  }).join('');
}

function showChartPopover(dayIndex) {
  const dayData = last7DaysData[dayIndex];
  if (!dayData) return;
  const list = document.getElementById('chartPopoverList');
  const title = document.getElementById('chartPopoverTitle');
  if (title) title.textContent = `${dayData.day} · По проектам`;
  
  const total = (dayData.projects || []).reduce((s, p) => s + p.cost, 0);
  if (total === 0 || !dayData.projects || dayData.projects.length === 0) {
    list.innerHTML = '<div class="popover-empty">Нет данных за этот день</div>';
  } else {
    list.innerHTML = dayData.projects.map(p => {
      const display = projectDisplayName(p.name);
      return `<div class="popover-row" title="${escapeHtml(p.name)}">` +
        `<span class="popover-name">${escapeHtml(display)}</span>` +
        `<span class="popover-pct">${fmtCost(p.cost)}</span>` +
      `</div>`;
    }).join('');
  }
  
  // Close others
  document.getElementById('sessionPopover').hidden = true;
  document.getElementById('weeklyPopover').hidden = true;
  
  const chartPop = document.getElementById('chartPopover');
  chartPop.hidden = false;
}

const popover = document.getElementById('sessionPopover');
const weeklyPopover = document.getElementById('weeklyPopover');
const chartPopover = document.getElementById('chartPopover');
const section5h = document.getElementById('section5h');
const sectionWeekly = document.getElementById('sectionWeekly');

section5h.addEventListener('click', (e) => {
  e.stopPropagation();
  weeklyPopover.hidden = true;
  chartPopover.hidden = true;
  if (popover.hidden) {
    renderSessionPopover();
    popover.hidden = false;
  } else {
    popover.hidden = true;
  }
});

if (sectionWeekly) {
  sectionWeekly.addEventListener('click', (e) => {
    e.stopPropagation();
    popover.hidden = true;
    chartPopover.hidden = true;
    if (weeklyPopover.hidden) {
      renderWeeklyPopover();
      weeklyPopover.hidden = false;
    } else {
      weeklyPopover.hidden = true;
    }
  });
}

document.addEventListener('click', (e) => {
  if (!popover.hidden && !popover.contains(e.target) && !section5h.contains(e.target)) popover.hidden = true;
  if (!weeklyPopover.hidden && !weeklyPopover.contains(e.target) && (!sectionWeekly || !sectionWeekly.contains(e.target))) weeklyPopover.hidden = true;
  if (!chartPopover.hidden && !chartPopover.contains(e.target) && !document.getElementById('chart7days').contains(e.target)) chartPopover.hidden = true;
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    popover.hidden = true;
    weeklyPopover.hidden = true;
    chartPopover.hidden = true;
  }
});

window.api.onUsageUpdate(update);

setInterval(() => {
  if (lastUpdatedAt !== null) {
    document.getElementById('updatedAt').textContent =
      'Updated ' + fmtAgo(Date.now() - lastUpdatedAt);
  }
}, 1000);
