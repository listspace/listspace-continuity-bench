#!/usr/bin/env node
// listspace-continuity-bench runner.
//
//   node bench.mjs validate                       check every answer key against its events (no network)
//   node bench.mjs plan                           print context sizes per condition (no network)
//   node bench.mjs hashes                         print the sha256 of each scenario file, for the protocol lock
//   node bench.mjs run --dry-run --models <ids> --runs <n> [--scenarios s001,s002] [--budget <USD>]
//                                                 print call count, estimated tokens and cost; calls nothing
//   node bench.mjs run --budget <USD> --models <ids> --runs <n> --temp <t> --out <dir> [--scenarios ...]
//   node bench.mjs run --resume <dir> --budget <USD> --temp <t> [--dry-run]
//                                                 continue a run that stopped on a provider error: same lock and
//                                                 settings, only the calls with no row yet, recorded in run-config.json
//
// A real `run` refuses to start without --budget, --models, --runs, --temp and --out, without a
// frozen protocol.lock.json, without a verified price for every model, and without the provider
// key in the environment. It aborts cleanly before a call that could pass --budget. No retries
// (a retry changes conditions mid-run). Keys come from the environment only, never a flag, and
// are never logged or written.
import { readdirSync, readFileSync, existsSync, mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { validateScenario } from './src/state.mjs';
import { renderChat, renderBoard, approxTokens, renderQuestion } from './src/render.mjs';
import { shuffled } from './src/rng.mjs';
import { loadPrices, priceFor } from './src/prices.mjs';
import { Meter } from './src/meter.mjs';
import { providerFactories, KEY_ENV } from './src/providers.mjs';
import { estimate, execute, rowKey } from './src/runner.mjs';
import { loadRun, checkResume, addResumeEntry, saveConfig } from './src/resume.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const die = (m) => { console.error(`bench refused to run:\n  ${m}`); process.exit(1); };
const BOOLEAN_FLAGS = new Set(['dry-run']);

function loadScenarioFiles() {
  const dir = join(ROOT, 'scenarios');
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => {
    const raw = readFileSync(join(dir, f));
    return { scenario: JSON.parse(raw.toString('utf8')), sha256: createHash('sha256').update(raw).digest('hex') };
  });
}
function flags(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const name = argv[i].slice(2);
    o[name] = BOOLEAN_FLAGS.has(name) ? true : argv[++i];
  }
  return o;
}
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const money = (n) => `$${n.toFixed(2)}`;
const int = (n) => Math.round(n).toLocaleString('en-US');

const [cmd, ...rest] = process.argv.slice(2);
const f = flags(rest);
const files = loadScenarioFiles();
const allScenarios = files.map((x) => x.scenario);

if (cmd === 'validate') {
  const errors = allScenarios.flatMap(validateScenario);
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  const drafts = allScenarios.filter((s) => s.review && s.review.reviewed_by_jordi === false).length;
  console.log(`ok: ${allScenarios.length} scenarios, ${allScenarios.reduce((n, s) => n + s.questions.length, 0)} questions, keys agree with events`);
  if (drafts) console.log(`note: ${drafts} scenarios are agent drafts not yet reviewed by Jordi (review.reviewed_by_jordi is false)`);
} else if (cmd === 'plan') {
  for (const s of allScenarios) {
    const q = s.questions[0];
    const order = shuffled(q.options, 1);
    console.log(`${s.id}  sessions=${s.sessions.length}  chat~${approxTokens(renderChat(s))} tok  board~${approxTokens(renderBoard(s))} tok  question~${approxTokens(renderQuestion(q, order))} tok  (chars/4, a guide only)`);
  }
} else if (cmd === 'hashes') {
  console.log(JSON.stringify(Object.fromEntries(files.map((x) => [x.scenario.id, x.sha256])), null, 2));
} else if (cmd === 'run') {
  const dry = f['dry-run'] === true;
  // --resume <dir> continues a run that stopped on a provider error: same lock, same settings, only the calls with no row yet.
  let prior = null;
  if (f.resume) {
    try { prior = loadRun(join(ROOT, f.resume)); } catch (e) { die(e.message); }
    if (f.models !== undefined && f.models !== prior.config.models.join(',')) die('--models differs from the first attempt');
    if (f.runs !== undefined && Number(f.runs) !== prior.config.runs) die('--runs differs from the first attempt');
    if (f.out !== undefined) die('--out cannot be combined with --resume, the run continues in its own directory');
  }
  const modelsArg = f.models ?? prior?.config.models.join(',');
  if (!modelsArg) die('--models is required (comma separated model ids)');
  const models = modelsArg.split(',').map((m) => m.trim()).filter(Boolean);
  const runs = Number(f.runs ?? prior?.config.runs);
  if (!Number.isInteger(runs) || runs < 1) die('--runs is required and must be a positive integer');
  const budget = f.budget === undefined ? undefined : Number(f.budget);
  if (budget !== undefined && !(Number.isFinite(budget) && budget > 0)) die('--budget must be a positive number of USD');

  const lockPath = join(ROOT, 'protocol.lock.json');
  const draftPath = join(ROOT, 'protocol.draft.json');
  const locked = existsSync(lockPath);
  if (!dry && !locked) die('protocol.lock.json is missing. Freeze scenarios, models, prompts and the metrics before the first answer is generated.');
  const protocol = readJson(locked ? lockPath : draftPath);

  // The protocol records sampling as a number, or as "provider_default" when the model rejects temperature. --temp default is accepted as an alias.
  const tempFlag = f.temp === 'default' ? 'provider_default' : f.temp;
  if (tempFlag !== undefined && String(tempFlag) !== String(protocol.temperature)) die(`--temp ${f.temp} disagrees with the protocol (${protocol.temperature})`);

  const prices = loadPrices(join(ROOT, 'config', 'prices.json'));
  for (const m of models) {
    try { priceFor(prices, m); } catch (e) { die(e.message); }
    if (!protocol.models[m]) die(`${m} is not pinned in the protocol`);
  }
  if (prior) { try { checkResume({ config: prior.config, protocol, prices }); } catch (e) { die(e.message); } }

  let selected = files;
  const wanted = f.scenarios ? f.scenarios.split(',') : prior?.config.scenarios;
  if (wanted) {
    selected = files.filter((x) => wanted.includes(x.scenario.id));
    const missing = wanted.filter((id) => !selected.some((x) => x.scenario.id === id));
    if (missing.length) die(`unknown scenarios: ${missing.join(', ')}`);
  }
  const scenarios = selected.map((x) => x.scenario);
  const errors = scenarios.flatMap(validateScenario);
  if (errors.length) die(`scenarios fail validation:\n  ${errors.join('\n  ')}`);
  if (protocol.scenario_sha256) {
    for (const x of selected) if (protocol.scenario_sha256[x.scenario.id] !== x.sha256) die(`${x.scenario.id} differs from the hash frozen in the protocol`);
  } else if (!dry) die('the protocol has no scenario_sha256, so nothing is frozen');

  const conditions = protocol.conditions;
  const done = new Set((prior?.rows ?? []).map(rowKey));

  if (dry) {
    const est = estimate({ scenarios, protocol, models, runs, conditions, prices, done });
    const sessions = scenarios.reduce((n, s) => n + s.sessions.length, 0);
    console.log('DRY RUN. Nothing was called, no key was read.');
    console.log(`protocol: ${locked ? 'protocol.lock.json (frozen)' : 'protocol.draft.json (DRAFT, not frozen)'}`);
    console.log(`scenarios: ${scenarios.length} (${sessions} sessions, ${scenarios.reduce((n, s) => n + s.questions.length, 0)} questions)  conditions: ${conditions.join(', ')}  runs: ${runs}  models: ${models.join(', ')}`);
    if (prior) console.log(`RESUME of ${f.resume}: ${prior.rows.length} rows already written, so only the calls with no row are counted below.`);
    for (const m of models) {
      const e = est.byModel[m];
      console.log(`\n${m}: ${e.calls} calls (${e.answerCalls} answers, ${e.keeperCalls} notes-keeper)  ~${int(e.inputTokens)} input tok  ~${int(e.outputTokens)} output tok  ~${money(e.costUsd)}`);
      for (const [c, v] of Object.entries(e.byCondition)) console.log(`    ${c.padEnd(9)} ${String(v.calls).padStart(4)} calls  ~${int(v.inputTokens)} in  ~${int(v.outputTokens)} out  ~${money(v.costUsd)}`);
    }
    const t = est.totals;
    console.log(`\nTOTAL: ${t.calls} calls (${t.answerCalls} answers, ${t.keeperCalls} keeper)  ~${int(t.inputTokens)} input tok  ~${int(t.outputTokens)} output tok  ~${money(t.costUsd)}`);
    if (budget !== undefined) {
      const spent = prior ? prior.rows.reduce((n, r) => n + (r.cost_usd ?? 0), 0) : 0;
      console.log(`budget ${money(budget)}: ${prior ? `already spent ${money(spent)}, estimate to finish ${money(t.costUsd)}, total ${money(spent + t.costUsd)}` : `estimate ${money(t.costUsd)}`}, ${spent + t.costUsd <= budget ? 'inside' : 'OVER'} the cap (${((100 * (spent + t.costUsd)) / budget).toFixed(1)}% of it)`);
    }
    console.log(`\nAssumptions (protocol estimate_assumptions, to be replaced by measurements): ${JSON.stringify(protocol.estimate_assumptions)}`);
    console.log(`Prices from config/prices.json: ${models.map((m) => `${m} ${prices.models[m].input_per_mtok}/${prices.models[m].output_per_mtok} USD per Mtok in/out, verified ${prices.models[m].verified_on}`).join('; ')}`);
  } else {
    if (budget === undefined) die('--budget <USD> is required');
    for (const k of prior ? ['temp'] : ['temp', 'out']) if (f[k] === undefined) die(`--${k} is required (nothing is defaulted, so the run is recorded exactly)`);
    for (const m of models) {
      const key = KEY_ENV[prices.models[m].provider];
      if (!process.env[key]) die(`${key} is not set (environment only)`);
    }
    const dirName = prior ? f.resume : f.out;
    const outDir = join(ROOT, dirName);
    const meter = new Meter(budget);
    let config;
    if (prior) {
      const spent = prior.rows.reduce((n, r) => n + (r.cost_usd ?? 0), 0);
      const total = estimate({ scenarios, protocol, models, runs, conditions, prices }).totals.calls;
      const missing = total - prior.rows.length;
      if (missing <= 0) die(`nothing to resume: all ${total} calls already have a row`);
      if (spent >= budget) die(`--budget ${budget} is not above what is already spent (${money(spent)})`);
      meter.restore(spent, prior.rows.length);
      if (prior.summary) writeFileSync(join(outDir, `summary.attempt-${(prior.config.resumes?.length ?? 0) + 1}.json`), JSON.stringify(prior.summary, null, 2));
      config = addResumeEntry(prior.config, { resumed_at: new Date().toISOString(), previous_status: prior.summary?.status ?? 'unknown', previous_error: prior.summary?.error ?? null, rows_already: prior.rows.length, calls_missing: missing, spent_before_usd: spent, budget_usd: budget });
      saveConfig(outDir, config);
    } else {
      if (existsSync(join(outDir, 'results.jsonl'))) die(`${f.out}/results.jsonl already exists. A re-run goes in a new directory and is reported as a re-run, or continue this one with --resume.`);
      mkdirSync(outDir, { recursive: true });
      config = { started: new Date().toISOString(), models, runs, temp: protocol.temperature, budget, scenarios: scenarios.map((s) => s.id), protocol, prices: Object.fromEntries(models.map((m) => [m, prices.models[m]])) };
      saveConfig(outDir, config);
    }
    const providers = Object.fromEntries([...new Set(models.map((m) => prices.models[m].provider))].map((p) => [p, providerFactories[p]()]));
    const result = await execute({
      scenarios, protocol, models, runs, conditions, prices, providers, meter, existing: prior?.rows ?? [],
      sink: (row) => appendFileSync(join(outDir, 'results.jsonl'), JSON.stringify(row) + '\n'),
    });
    const finished = new Date().toISOString();
    if (prior) {
      const entry = { ...config.resumes.at(-1), finished_at: finished, status: result.status, error: result.error, calls_added: result.calls - prior.rows.length, spent_after_usd: result.spentUsd };
      saveConfig(outDir, { ...config, resumes: [...config.resumes.slice(0, -1), entry] });
    }
    writeFileSync(join(outDir, 'summary.json'), JSON.stringify({ ...result, finished }, null, 2));
    console.log(`${result.status}: ${result.calls} calls in all, spent ${money(result.spentUsd)} of ${money(budget)}. Rows and summary are in ${dirName}/`);
    if (result.error) console.error(result.error);
    if (result.status !== 'completed') process.exit(2);
  }
} else {
  die('usage: node bench.mjs validate | plan | hashes | run --dry-run ... | run --budget <USD> --models <ids> --runs <n> --temp <t> --out <dir> | run --resume <dir> --budget <USD> --temp <t>');
}
