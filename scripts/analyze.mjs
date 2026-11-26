// Analysis of a finished run, per the analysis plan: bootstrap 95% intervals over scenarios
// (not over questions, which are not independent). Reads <run dir>/results.jsonl, prints JSON.
//   node scripts/analyze.mjs runs/v2-2026-11-26 [resamples]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mulberry32 } from '../src/rng.mjs';

const dir = process.argv[2];
if (!dir) { console.error('usage: node scripts/analyze.mjs <run dir> [resamples]'); process.exit(1); }
const B = Number(process.argv[3] ?? 10000);
const rows = readFileSync(join(dir, 'results.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const answers = rows.filter((r) => r.kind === 'answer');
const scenarios = [...new Set(answers.map((r) => r.scenario))].sort();

const inTok = (r) => r.usage.input + r.usage.cacheRead + r.usage.cacheWrite;
const METRICS = {
  correct_pct: (r) => (r.outcome === 'current' ? 100 : 0),
  stale_belief_pct: (r) => (['replaced', 'unconfirmed'].includes(r.outcome) ? 100 : 0),
  abstain_pct: (r) => (r.outcome === 'unknown' ? 100 : 0),
  mean_input_tokens: inTok,
};

/** Mean per scenario, then a bootstrap over scenarios: resample scenarios with replacement, average, take the 2.5 and 97.5 percentiles. */
function cell(group) {
  const per = scenarios.map((s) => {
    const g = group.filter((r) => r.scenario === s);
    return g.length ? Object.fromEntries(Object.entries(METRICS).map(([k, f]) => [k, g.reduce((n, r) => n + f(r), 0) / g.length])) : null;
  }).filter(Boolean);
  const rand = mulberry32(20261126);
  const out = { n_answers: group.length, n_scenarios: per.length };
  for (const k of Object.keys(METRICS)) {
    const mean = per.reduce((n, p) => n + p[k], 0) / per.length;
    const boots = [];
    for (let b = 0; b < B; b++) {
      let t = 0;
      for (let i = 0; i < per.length; i++) t += per[Math.floor(rand() * per.length)][k];
      boots.push(t / per.length);
    }
    boots.sort((x, y) => x - y);
    out[k] = { mean: +mean.toFixed(1), lo: +boots[Math.floor(0.025 * B)].toFixed(1), hi: +boots[Math.ceil(0.975 * B) - 1].toFixed(1) };
  }
  return out;
}

const models = [...new Set(answers.map((r) => r.model))];
const conditions = [...new Set(answers.map((r) => r.condition))];
const types = [...new Set(answers.map((r) => r.type))];
const result = { resamples: B, scenarios, status_questions: {}, next_task: {}, by_type: {} };
for (const m of models) for (const c of conditions) {
  const base = answers.filter((r) => r.model === m && r.condition === c);
  result.status_questions[`${m} | ${c}`] = cell(base.filter((r) => r.type !== 'next_task'));
  result.next_task[`${m} | ${c}`] = cell(base.filter((r) => r.type === 'next_task'));
  for (const t of types) result.by_type[`${m} | ${c} | ${t}`] = cell(base.filter((r) => r.type === t));
}
console.log(JSON.stringify(result, null, 1));
