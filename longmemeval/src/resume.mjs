// Resuming a LongMemEval run that stopped on a provider error. Pure functions, no network. A unit is one
// (model, question, condition). It is done only when it has a judge row. Every other unit is redone from
// the start; its earlier rows stay in results.jsonl but are marked abandoned and left out of the scoring.
import { deepStrictEqual } from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readRows } from '../../src/resume.mjs';

export const unitKey = (model, question, condition) => `${model}|${question}|${condition}`;
const rowUnit = (r) => unitKey(r.model, r.question, r.condition);

/** Loads a run folder. boards.jsonl may be missing (a full-only run makes no boards). */
export function loadLmeRun(dir) {
  for (const f of ['run-config.json', 'results.jsonl']) if (!existsSync(join(dir, f))) throw new Error(`${f} is missing in ${dir}`);
  const config = JSON.parse(readFileSync(join(dir, 'run-config.json'), 'utf8'));
  const sumPath = join(dir, 'summary.json');
  const summary = existsSync(sumPath) ? JSON.parse(readFileSync(sumPath, 'utf8')) : null;
  const boardsPath = join(dir, 'boards.jsonl');
  const boards = existsSync(boardsPath) ? readRows(boardsPath) : [];
  return { config, rows: readRows(join(dir, 'results.jsonl')), boards, summary };
}

/** Keys of the units that have a judge row. */
export const doneUnits = (rows) => new Set(rows.filter((r) => r.kind === 'judge').map(rowUnit));

/** All units in run order (model, question, condition), each flagged done or not, and whether it left rows. */
export function planUnits({ models, questionIds, conditions, rows }) {
  const done = doneUnits(rows);
  const touched = new Set(rows.map(rowUnit));
  const units = [];
  for (const model of models) for (const question of questionIds) for (const condition of conditions) {
    const key = unitKey(model, question, condition);
    units.push({ model, question, condition, key, done: done.has(key), hasRows: touched.has(key) });
  }
  return units;
}

/**
 * Board ids to mark abandoned: every board of an unfinished board unit that is not marked yet. Boards of a
 * done unit are kept. boards.jsonl is append-only, so an abandoned board gets a second line with abandoned true.
 */
export function boardsToAbandon({ units, boards }) {
  const already = new Set(boards.filter((b) => b.abandoned).map((b) => b.board_id));
  const open = new Set(units.filter((u) => !u.done && u.condition === 'board').map((u) => `${u.model}|${u.question}`));
  return boards.filter((b) => !b.abandoned && !already.has(b.board_id) && open.has(`${b.model}|${b.question}`)).map((b) => ({ board_id: b.board_id, model: b.model, question: b.question, api_base: b.api_base }));
}

/** Rows that count: drops the rows an earlier attempt wrote for a unit that a later resume redid. */
export function liveRows(rows, resumes = []) {
  const abandoned = resumes.map((r) => ({ attempt: r.attempt, keys: new Set(r.units_redone.map((u) => u.key)) }));
  return rows.filter((r) => !abandoned.some((a) => (r.attempt ?? 0) < a.attempt && a.keys.has(rowUnit(r))));
}

/** What differs between the first attempt and now. An empty list means the resume may go on. */
export function configMismatches(config, current) {
  const out = [];
  const same = (name, a, b) => { try { deepStrictEqual(a, b); } catch { out.push(`${name}: first attempt ${JSON.stringify(a)?.slice(0, 200)}, now ${JSON.stringify(b)?.slice(0, 200)}`); } };
  same('dataset sha256', config.dataset_sha256, current.dataset_sha256);
  same('selected questions', config.questions, current.questions);
  same('models', config.models, current.models);
  same('conditions', config.conditions, current.conditions);
  same('judge model', config.judgeModel, current.judgeModel);
  same('api base', config.apiBase, current.apiBase);
  if (config.tool_defs_openapi_sha256 !== undefined) same('tool definitions sha256', config.tool_defs_openapi_sha256, current.tool_defs_openapi_sha256);
  // protocol: name each top-level section that differs
  for (const k of new Set([...Object.keys(config.protocol ?? {}), ...Object.keys(current.protocol ?? {})])) same(`protocol.${k}`, config.protocol?.[k], current.protocol?.[k]);
  return out;
}

/** The resume record that goes into run-config.json. */
export function makeResumeEntry({ config, summary, units, abandonedBoards, spent, budget, now = new Date().toISOString() }) {
  const unit = (u) => ({ key: u.key, model: u.model, question: u.question, condition: u.condition });
  return {
    attempt: (config.resumes?.length ?? 0) + 1,
    resumed_at: now,
    previous_status: summary?.status ?? 'unknown',
    previous_error: summary?.error ?? null,
    spent_before_usd: spent,
    budget_usd: budget,
    units_skipped: units.filter((u) => u.done).map(unit),
    units_redone: units.filter((u) => !u.done).map(unit),
    abandoned_boards: abandonedBoards.map((b) => b.board_id),
  };
}
