'use strict';

const { loadAllEntries, CLAUDE_LOGS_DIR } = require('./parser');

(async () => {
  console.log('Scanning:', CLAUDE_LOGS_DIR);
  const entries = await loadAllEntries();
  console.log(`Total entries: ${entries.length}`);

  if (entries.length === 0) {
    console.log('No assistant entries found.');
    return;
  }

  let totalTokens = 0;
  const byModel = { opus: 0, sonnet: 0, haiku: 0, unknown: 0 };

  for (const e of entries) {
    const t = e.input + e.output + e.cacheRead + e.cacheCreate;
    totalTokens += t;
    byModel[e.model] = (byModel[e.model] || 0) + t;
  }

  console.log(`\nTotal tokens: ${totalTokens.toLocaleString('ru-RU')}`);
  console.log('By model:');
  for (const [model, tokens] of Object.entries(byModel)) {
    if (tokens > 0) console.log(`  ${model}: ${tokens.toLocaleString('ru-RU')}`);
  }

  const oldest = new Date(entries[0].ts).toISOString();
  const newest = new Date(entries[entries.length - 1].ts).toISOString();
  console.log(`\nDate range: ${oldest} → ${newest}`);

  // Last 5h
  const now = Date.now();
  const since5h = now - 5 * 60 * 60 * 1000;
  const recent = entries.filter(e => e.ts >= since5h);
  const recent5hTokens = recent.reduce((s, e) => s + e.input + e.output + e.cacheRead + e.cacheCreate, 0);
  console.log(`\nLast 5h tokens: ${recent5hTokens.toLocaleString('ru-RU')} (${recent.length} requests)`);

  // Sample last 3 entries
  console.log('\nLast 3 entries:');
  for (const e of entries.slice(-3)) {
    console.log(`  [${e.timestamp}] ${e.model}: in=${e.input} out=${e.output} cacheR=${e.cacheRead} cacheC=${e.cacheCreate}`);
  }
})();
