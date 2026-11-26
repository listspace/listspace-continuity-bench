// Rebuilds summary.json and the hypotheses files of a run from its results.jsonl, without calling anything.
// Made after the resume of mini-2026-11-27 finished its calls and then crashed while writing its outputs
// (run.mjs joined a null `out` in resume mode; fixed in the same commit).
// Usage: node longmemeval/scripts/rebuild-summary.mjs <run dir>
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { liveRows } from '../src/resume.mjs';
import { summarizeRows } from '../src/lme.mjs';

const dir = resolve(process.argv[2] ?? '');
const rows = readFileSync(join(dir, 'results.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const config = JSON.parse(readFileSync(join(dir, 'run-config.json'), 'utf8'));
const resumes = config.resumes ?? [];
const scored = liveRows(rows, resumes);
const by = summarizeRows(scored);
const units = new Set(config.models.flatMap((m) => config.questions.flatMap((q) => config.conditions.map((c) => `${m}|${q}|${c}`))));
const judged = new Set(scored.filter((r) => r.kind === 'judge').map((r) => `${r.model}|${r.question}|${r.condition}`));
const missing = [...units].filter((u) => !judged.has(u));
const spent = rows.reduce((a, r) => a + (typeof r.cost_usd === 'number' ? r.cost_usd : 0), 0);
const status = missing.length ? 'incomplete' : 'completed';

for (const model of config.models) for (const c of config.conditions) {
  const lines = scored.filter((r) => r.kind === 'answer' && r.model === model && r.condition === c).map((r) => JSON.stringify({ question_id: r.question, hypothesis: r.hypothesis }));
  if (lines.length) writeFileSync(join(dir, `hypotheses.${model}.${c}.jsonl`), lines.join('\n') + '\n');
}
const summary = {
  status, units_total: units.size, units_judged: judged.size, units_missing: missing, spentUsd: spent, budgetUsd: config.budget,
  resumed: resumes.length > 0, resume_attempts: resumes.length, rows_excluded_as_abandoned: rows.length - scored.length,
  rebuilt_from_results: true,
  note: 'Rebuilt from results.jsonl by scripts/rebuild-summary.mjs after the resume crashed while writing its outputs; every call had finished. spentUsd covers every attempt; by_model_condition leaves out abandoned rows of redone units.',
  judge_model: config.judgeModel, judge_is_official: config.judge_is_official, by_model_condition: by,
};
if (resumes.length && !resumes[resumes.length - 1].outcome) {
  resumes[resumes.length - 1].outcome = { status, error: 'outputs not written: run.mjs crashed after the last call (null out path in resume mode); rebuilt by scripts/rebuild-summary.mjs', spent_after_usd: spent };
  writeFileSync(join(dir, 'run-config.json'), JSON.stringify(config, null, 2));
}
writeFileSync(join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(`status ${status}: ${judged.size} of ${units.size} units judged; spent $${spent.toFixed(2)} of $${config.budget}`);
for (const [k, g] of Object.entries(by)) console.log(`${k.padEnd(34)} correct ${g.correct}/${g.questions}  cost $${g.cost_usd.toFixed(2)} ($${g.questions ? g.cost_per_question_usd.toFixed(2) : '-'} per question)  keeper turns ${g.keeper_turns}  tool calls ${g.tool_calls} (${g.tool_calls_failed} failed)`);
