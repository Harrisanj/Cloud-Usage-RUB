'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const os = require('os');

function getClaudeLogsDir() {
  let dir = path.join(os.homedir(), '.claude', 'projects');
  if (!fs.existsSync(dir)) {
    const wslPath = '\\\\wsl$\\Ubuntu\\home\\harrisan\\.claude\\projects';
    if (fs.existsSync(wslPath)) {
      dir = wslPath;
    }
  }
  return dir;
}

// Cache: filepath -> { mtime, entries[] }
const fileCache = new Map();

function normalizeModel(modelStr) {
  if (!modelStr) return 'unknown';
  const m = modelStr.toLowerCase();
  if (m.includes('opus'))   return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku'))  return 'haiku';
  if (m.includes('fable'))  return 'fable';
  return 'unknown';
}

function findJsonlFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); }
    catch (_) { continue; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        results.push(full);
      }
    }
  }
  return results;
}

async function parseFile(filepath) {
  const stat = fs.statSync(filepath);
  const mtime = stat.mtimeMs;
  const cached = fileCache.get(filepath);
  if (cached && cached.mtime === mtime) {
    return cached.entries;
  }

  // Subagent JSONLs live at <project>/<sessionId>/subagents/<file>.jsonl —
  // take the first segment under CLAUDE_LOGS_DIR so they roll up into the parent project.
  const relative = path.relative(getClaudeLogsDir(), filepath);
  const project = relative.split(/[\\/]/)[0];

  const entries = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(filepath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); }
    catch (_) { continue; }

    if (obj.type !== 'assistant') continue;
    const msg = obj.message;
    if (!msg || !msg.usage) continue;

    const usage = msg.usage;
    const input       = (usage.input_tokens || 0);
    const output      = (usage.output_tokens || 0);
    const cacheRead   = (usage.cache_read_input_tokens || 0);
    const cacheCreate = (usage.cache_creation_input_tokens || 0);

    if (input + output + cacheRead + cacheCreate === 0) continue;

    entries.push({
      timestamp:   obj.timestamp,
      ts:          new Date(obj.timestamp).getTime(),
      model:       normalizeModel(msg.model),
      project,
      input,
      output,
      cacheRead,
      cacheCreate,
    });
  }

  fileCache.set(filepath, { mtime, entries });
  return entries;
}

async function loadAllEntries() {
  const files = findJsonlFiles(getClaudeLogsDir());
  const results = await Promise.all(files.map(f => parseFile(f)));
  return results.flat().sort((a, b) => a.ts - b.ts);
}

module.exports = { loadAllEntries, getClaudeLogsDir };
