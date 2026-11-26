#!/usr/bin/env node
// LongMemEval-S mini run, Tier B. Run from the repo root.
//
//   node longmemeval/run.mjs select                      print (and check) the 5 seeded question ids
//   node longmemeval/run.mjs dry-run [--models a,b] [--conditions full,board]
//                                                        estimate tokens and cost from the real data; calls nothing
//   node longmemeval/run.mjs run --budget <USD> --models a,b --out <dir> [--conditions full,board] [--judge-model <id>]
//
// A real run refuses to start without --budget, --models and --out, without a verified price for every
// model, without the keys in the environment (ANTHROPIC_API_KEY, OPENAI_API_KEY, and
// LISTSPACE_STAGING_TOKEN for the board condition), or with a non-staging API base. It does not
// retry. Keys are read from the environment at call time and never logged or written.
import { readFileSync, existsSync, mkdirSync, appendFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadDataset, selectIds, pick } from './src/dataset.mjs';
import { estimateRun, executeRun, summarizeRows } from './src/lme.mjs';
import { createApi, assertStagingBase, STAGING_API_BASE, TOKEN_ENV } from './src/api.mjs';
import { OFFICIAL_JUDGE_MODEL } from './src/judge.mjs';
import { loadPrices, priceFor } from '../src/prices.mjs';
import { Meter } from '../src/meter.mjs';
import { providerFactories, KEY_ENV } from '../src/providers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const die = (m) => { console.error(`lme refused to run:\n  ${m}`); process.exit(1); };
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const money = (n) => `$${n.toFixed(2)}`;
const int = (n) => Math.round(n).toLocaleString('en-US');

const [cmd, ...rest] = process.argv.slice(2);
const f = {};
for (let i = 0; i < rest.length; i++) if (rest[i].startsWith('--')) { const k = rest[i].slice(2); f[k] = k === 'dry-run' ? true : rest[++i]; }

const protocol = readJson(join(HERE, 'config', 'protocol.json'));
const defs = readJson(join(HERE, 'config', 'tool-defs.json'));
const judge = readJson(join(HERE, 'config', 'judge.json'));
const prices = loadPrices(join(HERE, '..', 'config', 'prices.json'));
const dataPath = join(HERE, protocol.dataset.file);
if (!['select', 'dry-run', 'run'].includes(cmd)) die('usage: node longmemeval/run.mjs select | dry-run | run  (see the header of this file)');
if (!existsSync(dataPath)) die(`dataset missing: ${dataPath}. Download it as described in longmemeval/README.md`);

const sha = createHash('sha256').update(readFileSync(dataPath)).digest('hex');
if (sha !== protocol.dataset.sha256) die(`dataset sha256 ${sha} does not match the protocol (${protocol.dataset.sha256})`);
const all = loadDataset(dataPath);
const ids = selectIds(all, protocol.selection);
const entries = pick(all, ids);

const models = (f.models ?? Object.keys(protocol.models).join(',')).split(',').map((s) => s.trim()).filter(Boolean);
const conditions = (f.conditions ?? protocol.conditions.join(',')).split(',').map((s) => s.trim()).filter(Boolean);
for (const c of conditions) if (!protocol.conditions.includes(c)) die(`unknown condition ${c}`);
for (const m of models) { if (!protocol.models[m]) die(`model ${m} is not in the protocol`); try { priceFor(prices, m); } catch (e) { die(e.message); } }

if (cmd === 'select') {
  console.log(`seed "${protocol.selection.seed}", ${protocol.selection.type}, n=${protocol.selection.n}`);
  for (const e of entries) {
    const chars = e.haystack_sessions.flat().reduce((n, t) => n + t.content.length, 0);
    console.log(`${e.question_id}  sessions=${e.haystack_sessions.length}  chars=${int(chars)}  Q: ${e.question}`);
  }
  writeFileSync(join(HERE, 'config', 'selected-questions.json'), JSON.stringify({ seed: protocol.selection.seed, type: protocol.selection.type, dataset_sha256: sha, ids }, null, 2) + '\n');
  process.exit(0);
}

const judgeModel = f['judge-model'] ?? judge.official_model;
const apiBase = f['api-base'] ?? STAGING_API_BASE;
try { assertStagingBase(apiBase); } catch (e) { die(e.message); }

if (cmd === 'dry-run') {
  const est = estimateRun({ entries, protocol, defs, models, conditions, prices, judge });
  console.log(`DRY RUN: nothing is called. ${entries.length} questions (${ids.join(', ')})`);
  console.log(`Judge: ${judgeModel}${judgeModel === OFFICIAL_JUDGE_MODEL ? ' (the official LongMemEval judge)' : ' (SUBSTITUTE, not the official judge)'}; judge price is ${judge.price.provisional ? 'PROVISIONAL, verify before the run' : 'verified'}.`);
  for (const [model, m] of Object.entries(est.byModel)) {
    console.log(`\n${model}: ${int(m.calls)} calls, ${int(m.inputTokens)} input and ${int(m.outputTokens)} output tokens, expected ${money(m.costUsd)}, ceiling ${money(m.ceilingUsd)}`);
    for (const [c, v] of Object.entries(m.byCondition)) console.log(`  ${c.padEnd(14)} ${String(v.calls).padStart(4)} calls  in ${int(v.inputTokens).padStart(10)}  out ${int(v.outputTokens).padStart(8)}  expected ${money(v.costUsd).padStart(7)}  ceiling ${money(v.ceilingUsd).padStart(7)}`);
  }
  console.log(`\nTOTAL: ${int(est.totals.calls)} calls, expected ${money(est.totals.costUsd)}, ceiling ${money(est.totals.ceilingUsd)}`);
  console.log('Expected rests on guesses (turns per session, output tokens, board size) in config/protocol.json; this run replaces them. The ceiling assumes every cap is hit.');
  if (f.budget) console.log(`Budget ${money(Number(f.budget))}: ${Number(f.budget) >= est.totals.ceilingUsd ? 'above the ceiling' : Number(f.budget) >= est.totals.costUsd ? 'above the expected cost, below the ceiling (the meter aborts before a call that could pass it)' : 'BELOW the expected cost, the run would abort'}.`);
  process.exit(0);
}

// ---- real run ----
if (!f.budget || !f.out) die('--budget and --out are required (and --models, or the protocol default of both)');
const budget = Number(f.budget);
if (!(budget > 0)) die('--budget must be a positive number of USD');
const need = [...new Set(models.map((m) => KEY_ENV[prices.models[m].provider]))];
if (!need.includes('OPENAI_API_KEY')) need.push('OPENAI_API_KEY'); // the judge
if (conditions.includes('board')) need.push(TOKEN_ENV);
const missing = need.filter((k) => !process.env[k]);
if (missing.length) die(`not set in the environment: ${missing.join(', ')}`);
const out = resolve(f.out);
if (existsSync(out) && readdirSync(out).length) die(`${out} is not empty`);
mkdirSync(out, { recursive: true });
const runId = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);

writeFileSync(join(out, 'run-config.json'), JSON.stringify({ runId, models, conditions, budget, judgeModel, judge_is_official: judgeModel === OFFICIAL_JUDGE_MODEL, apiBase, questions: ids, dataset_sha256: sha, protocol, tool_defs_openapi_sha256: defs.openapi_sha256, node: process.version }, null, 2));
const results = join(out, 'results.jsonl');
const boardsFile = join(out, 'boards.jsonl');
const rows = [];
const sink = (row) => { rows.push(row); appendFileSync(results, JSON.stringify({ t: new Date().toISOString(), ...row }) + '\n'); };
const providers = Object.fromEntries(Object.entries(providerFactories).map(([k, make]) => [k, make()]));
const meter = new Meter(budget);

console.log(`Judge: ${judgeModel}${judgeModel === OFFICIAL_JUDGE_MODEL ? ' (the official LongMemEval judge)' : ' (SUBSTITUTE, not the official judge)'}`);
const res = await executeRun({
  entries, protocol, defs, models, conditions, prices, providers, meter, judge: { price: judge.price }, judgeModel, sink, runId,
  makeApi: () => createApi({ base: apiBase }),
  onBoard: (b) => appendFileSync(boardsFile, JSON.stringify({ ...b, api_base: apiBase }) + '\n'),
});

for (const model of models) for (const c of conditions) {
  const lines = rows.filter((r) => r.kind === 'answer' && r.model === model && r.condition === c).map((r) => JSON.stringify({ question_id: r.question, hypothesis: r.hypothesis }));
  if (lines.length) writeFileSync(join(out, `hypotheses.${model}.${c}.jsonl`), lines.join('\n') + '\n');
}
const summary = { ...res, judge_model: judgeModel, judge_is_official: judgeModel === OFFICIAL_JUDGE_MODEL, by_model_condition: summarizeRows(rows) };
writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(`\nstatus ${res.status}${res.error ? `: ${res.error}` : ''}\nspent ${money(res.spentUsd)} of ${money(res.budgetUsd)} in ${res.calls} metered calls; boards made: ${res.boards.length}`);
console.log(`JUDGE: ${judgeModel} ${judgeModel === OFFICIAL_JUDGE_MODEL ? '(official LongMemEval judge)' : '(SUBSTITUTE, numbers are not comparable to published ones)'}`);
for (const [k, g] of Object.entries(summary.by_model_condition)) console.log(`${k.padEnd(34)} correct ${g.correct}/${g.questions}  cost ${money(g.cost_usd)} (${g.questions ? money(g.cost_per_question_usd) : '-'} per question)  keeper turns ${g.keeper_turns}  tool calls ${g.tool_calls} (${g.tool_calls_failed} failed)`);
console.log(`results: ${out}\nWhen done, archive the boards: node longmemeval/cleanup.mjs --run "${out}"`);
process.exit(res.status === 'completed' ? 0 : 2);
