// No network, no keys. Unit-done detection, abandoned boards, the config-mismatch refusal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { doneUnits, planUnits, boardsToAbandon, liveRows, configMismatches, makeResumeEntry, loadLmeRun, unitKey } from '../src/resume.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUN = join(HERE, '..', 'run.mjs');
const row = (kind, model, question, condition, extra = {}) => ({ kind, model, question, condition, cost_usd: 0.1, ...extra });
const models = ['m1', 'm2'];
const questionIds = ['q1', 'q2'];
const conditions = ['full', 'board'];
const rows = [
  row('answer', 'm1', 'q1', 'full'), row('judge', 'm1', 'q1', 'full'),
  row('answer', 'm1', 'q1', 'board'), row('judge', 'm1', 'q1', 'board'),
  row('answer', 'm1', 'q2', 'full'), // answered, never judged: not done
  row('keeper_turn', 'm1', 'q2', 'board', { session: 5 }), // mid-keeping: not done
];
const boards = [
  { board_id: 'b-done', model: 'm1', question: 'q1' },
  { board_id: 'b-half', model: 'm1', question: 'q2' },
];

test('a unit is done only with a judge row', () => {
  const done = doneUnits(rows);
  assert.deepEqual([...done].sort(), [unitKey('m1', 'q1', 'board'), unitKey('m1', 'q1', 'full')].sort());
  const units = planUnits({ models, questionIds, conditions, rows });
  assert.equal(units.length, 8);
  assert.deepEqual(units.filter((u) => u.done).map((u) => u.key), ['m1|q1|full', 'm1|q1|board']);
  assert.equal(units.find((u) => u.key === 'm1|q2|full').hasRows, true);
  assert.equal(units.find((u) => u.key === 'm2|q1|full').hasRows, false);
  assert.deepEqual(units.map((u) => u.key).slice(0, 4), ['m1|q1|full', 'm1|q1|board', 'm1|q2|full', 'm1|q2|board']); // run order
});

test('only the boards of unfinished board units are abandoned, once', () => {
  const units = planUnits({ models, questionIds, conditions, rows });
  assert.deepEqual(boardsToAbandon({ units, boards }).map((b) => b.board_id), ['b-half']);
  const marked = [...boards, { board_id: 'b-half', model: 'm1', question: 'q2', abandoned: true }];
  assert.deepEqual(boardsToAbandon({ units, boards: marked }), []);
});

test('abandoned rows are left out of scoring, finished units and new rows stay', () => {
  const units = planUnits({ models, questionIds, conditions, rows });
  const entry = makeResumeEntry({ config: {}, summary: { status: 'aborted_provider_error', error: 'x' }, units, abandonedBoards: boardsToAbandon({ units, boards }), spent: 0.6, budget: 25 });
  assert.equal(entry.attempt, 1);
  assert.equal(entry.units_skipped.length, 2);
  assert.equal(entry.units_redone.length, 6);
  assert.deepEqual(entry.abandoned_boards, ['b-half']);
  const redone = [row('answer', 'm1', 'q2', 'full', { attempt: 1 }), row('judge', 'm1', 'q2', 'full', { attempt: 1 })];
  const live = liveRows([...rows, ...redone], [entry]);
  assert.equal(live.length, 4 + 2); // 4 rows of done units + 2 new; the old answer and the keeper turn are dropped
  assert.ok(!live.some((r) => r.kind === 'keeper_turn'));
  assert.equal(liveRows(rows, []).length, rows.length);
});

const current = (over = {}) => ({ dataset_sha256: 'abc', questions: ['q1'], models: ['m1'], conditions: ['full'], judgeModel: 'j', apiBase: 'https://x', tool_defs_openapi_sha256: 't', protocol: { caps: { a: 1 }, prompts: { p: 'x' } }, ...over });
const config = () => ({ dataset_sha256: 'abc', questions: ['q1'], models: ['m1'], conditions: ['full'], judgeModel: 'j', apiBase: 'https://x', tool_defs_openapi_sha256: 't', protocol: { caps: { a: 1 }, prompts: { p: 'x' } } });

test('config mismatch names every difference', () => {
  assert.deepEqual(configMismatches(config(), current()), []);
  const d = configMismatches(config(), current({ dataset_sha256: 'zzz', models: ['m1', 'm2'], judgeModel: 'other', protocol: { caps: { a: 2 }, prompts: { p: 'x' } } }));
  assert.equal(d.length, 4);
  for (const k of ['dataset sha256', 'models', 'judge model', 'protocol.caps']) assert.ok(d.some((x) => x.startsWith(k)), k);
});

test('run.mjs --resume refuses a changed config and writes nothing', () => {
  const dataOk = existsSync(join(HERE, '..', 'data', 'longmemeval_s_cleaned.json'));
  if (!dataOk) return; // dataset is downloaded separately
  const dir = mkdtempSync(join(tmpdir(), 'lme-resume-'));
  writeFileSync(join(dir, 'run-config.json'), JSON.stringify({ runId: 'x', models: ['claude-sonnet-5-5'], conditions: ['full'], judgeModel: 'gpt-4o-2024-08-06', apiBase: 'https://staging-backend.listspace.app/functions/v1/api/v1', questions: ['nope'], dataset_sha256: 'bad', protocol: { selection: { n: 99 } } }));
  writeFileSync(join(dir, 'results.jsonl'), '');
  const env = { ...process.env }; delete env.ANTHROPIC_API_KEY; delete env.OPENAI_API_KEY; delete env.LISTSPACE_STAGING_TOKEN;
  const before = readFileSync(join(dir, 'results.jsonl'), 'utf8');
  for (const extra of [['--dry-run'], []]) {
    const r = spawnSync(process.execPath, [RUN, 'run', '--resume', dir, '--budget', '5', ...extra], { env, encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /differs from the first attempt/);
    assert.match(r.stderr, /selected questions/);
    assert.match(r.stderr, /dataset sha256/);
  }
  assert.equal(readFileSync(join(dir, 'results.jsonl'), 'utf8'), before);
  assert.deepEqual(loadLmeRun(dir).boards, []);
});
