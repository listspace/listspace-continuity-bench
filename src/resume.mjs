// Resuming a run that stopped on a provider error (for example an HTTP 503). A resume runs only the
// calls that have no row yet, under the exact settings of the first attempt, and records itself in
// run-config.json so the report can say that the run was resumed and why.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deepStrictEqual } from 'node:assert/strict';

/** Reads results.jsonl. A broken line means the file was damaged, so nothing is guessed. */
export function readRows(path) {
  const text = readFileSync(path, 'utf8');
  return text.split('\n').filter((l) => l.trim() !== '').map((l, i) => {
    try { return JSON.parse(l); } catch { throw new Error(`results.jsonl line ${i + 1} is not valid JSON, so the run cannot be resumed safely`); }
  });
}

/** Loads a run directory for resuming. Throws with a plain message if anything is missing. */
export function loadRun(dir) {
  for (const f of ['run-config.json', 'results.jsonl']) if (!existsSync(join(dir, f))) throw new Error(`${f} is missing in ${dir}`);
  const config = JSON.parse(readFileSync(join(dir, 'run-config.json'), 'utf8'));
  const summaryPath = join(dir, 'summary.json');
  const summary = existsSync(summaryPath) ? JSON.parse(readFileSync(summaryPath, 'utf8')) : null;
  return { config, rows: readRows(join(dir, 'results.jsonl')), summary };
}

/** The lock, the prices and the settings of the first attempt must match the current ones exactly. */
export function checkResume({ config, protocol, prices }) {
  const same = (a, b, what) => {
    try { deepStrictEqual(a, b); } catch { throw new Error(`refusing to resume: ${what} differs from the first attempt`); }
  };
  same(config.protocol, protocol, 'protocol.lock.json');
  for (const m of config.models) same(config.prices[m], prices.models[m], `the price entry for ${m}`);
  same(config.temp, protocol.temperature, 'the sampling setting');
}

/** Adds one resume entry to run-config.json content. `outcome` is filled in when the resume ends. */
export function addResumeEntry(config, entry) {
  return { ...config, resumes: [...(config.resumes ?? []), entry] };
}

export function saveConfig(dir, config) {
  writeFileSync(join(dir, 'run-config.json'), JSON.stringify(config, null, 2));
}
