// No network, no keys: fake providers, a fake Listspace API behind a fake fetch, a fake judge.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { createApi, assertStagingBase, StagingGuardError, STAGING_API_BASE } from '../src/api.mjs';
import { parseReply, ReplyParseError, keepSession } from '../src/keeper.mjs';
import { BoardReader, createBoard } from '../src/board.mjs';
import { executeRun, extractHypothesis, estimateRun } from '../src/lme.mjs';
import { judgePrompt, judgeCall, OFFICIAL_JUDGE_MODEL } from '../src/judge.mjs';
import { selectIds, orderedSessions } from '../src/dataset.mjs';
import { Meter } from '../../src/meter.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const protocol = JSON.parse(readFileSync(join(HERE, '..', 'config', 'protocol.json'), 'utf8'));
const defs = JSON.parse(readFileSync(join(HERE, '..', 'config', 'tool-defs.json'), 'utf8'));
const judgeCfg = JSON.parse(readFileSync(join(HERE, '..', 'config', 'judge.json'), 'utf8'));
const prices = { models: {
  'claude-sonnet-5-5': { provider: 'anthropic', input_per_mtok: 2, output_per_mtok: 10, cache_read_per_mtok: 0.1, cache_write_per_mtok: 2.5, max_prompt_tokens: 1000000 },
  'gpt-6.2-sol': { provider: 'openai', input_per_mtok: 2, output_per_mtok: 10, cache_read_per_mtok: 0.1, cache_write_per_mtok: null, max_prompt_tokens: 272000 },
} };

const UID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const L_INFO = UID(1000), L_TODO = UID(1001), L_DONE = UID(1002);

/** A tiny in-memory Listspace. Records every URL it was asked for. */
function fakeListspace() {
  const s = { boards: new Map(), items: new Map(), urls: [], n: 1, archived: [], fail: null };
  const stamp = () => `2026-11-27T10:00:${String(s.n++).padStart(2, '0')}Z`;
  const fetchImpl = async (url, init) => {
    s.urls.push(url);
    const u = new URL(url);
    const p = u.pathname.replace('/functions/v1/api/v1', '');
    const body = init.body ? JSON.parse(init.body) : {};
    const ok = (data, status = 200) => ({ ok: true, status, text: async () => JSON.stringify({ data }) });
    const err = (status, code, message) => ({ ok: false, status, text: async () => JSON.stringify({ error: { code, message } }) });
    if (s.fail?.(init.method, p)) return err(429, 'rate_limited', 'slow down');
    let m;
    if (init.method === 'POST' && p === '/boards') { const id = UID(500 + s.boards.size); s.boards.set(id, { id, title: body.title }); return ok({ id, title: body.title }, 201); }
    if ((m = p.match(/^\/boards\/([^/]+)$/)) && init.method === 'GET') {
      const b = s.boards.get(m[1]);
      const lists = [[L_INFO, 'About the user', 'info'], [L_TODO, 'To do', 'todo'], [L_DONE, 'Done', 'done']].map(([id, title, kind]) => ({ id, title, kind, cards: [...s.items.values()].filter((i) => i.list_id === id).map(({ description, ...c }) => c) }));
      return ok({ id: b.id, title: b.title, lists });
    }
    if ((m = p.match(/^\/boards\/([^/]+)\/session$/))) return ok({ decisions: { settled: [], on_record: [] }, inbox: { pending_decisions: [] } });
    if ((m = p.match(/^\/boards\/([^/]+)\/archive$/))) { s.archived.push(m[1]); return ok({ archived: true }); }
    if (init.method === 'POST' && p === '/items') { const id = UID(2000 + s.items.size); const it = { id, list_id: body.list_id, title: body.title, description: body.description ?? '', done: false, archived: false, updated_at: stamp() }; s.items.set(id, it); return ok(it, 201); }
    if ((m = p.match(/^\/items\/([^/]+)$/))) {
      const it = s.items.get(m[1]);
      if (!it) return err(404, 'not_found', 'no item');
      if (init.method === 'PATCH') Object.assign(it, body, { updated_at: stamp() });
      return ok(it);
    }
    if ((m = p.match(/^\/items\/([^/]+)\/move$/))) { Object.assign(s.items.get(m[1]), { list_id: body.list_id, updated_at: stamp() }); return ok({ moved: true }); }
    if (p === '/decisions') return ok({ outcome: 'suggested' }, 202);
    return err(404, 'not_found', p);
  };
  return { s, fetchImpl };
}

const env = { LISTSPACE_STAGING_TOKEN: 'ls_' + 'a'.repeat(43) };
const makeApi = (fake) => createApi({ env, fetchImpl: fake.fetchImpl, sleep: async () => {}, now: () => 0 });

const entry = (id, n = 3) => ({
  question_id: id, question_type: 'knowledge-update', question: 'How many?', answer: '5', question_date: '2023/06/25 (Sun) 13:22',
  haystack_dates: Array.from({ length: n }, (_, i) => `2023/0${i + 1}/01 (Sun) 10:00`), haystack_session_ids: Array.from({ length: n }, (_, i) => `s${i}`),
  haystack_sessions: Array.from({ length: n }, (_, i) => [{ role: 'user', content: `I have ${i + 3} things` }, { role: 'assistant', content: 'ok' }]),
});

// ---- staging-only guard ----
test('guard: only the staging API is accepted', () => {
  assert.equal(assertStagingBase(STAGING_API_BASE), STAGING_API_BASE);
  for (const bad of ['https://api.listspace.app/v1', 'https://listspace.app', 'http://staging-backend.listspace.app/functions/v1/api/v1', 'https://staging-backend.listspace.app.evil.com/functions/v1/api/v1', 'https://staging-backend.listspace.app@evil.com/functions/v1/api/v1', 'https://staging-backend.listspace.app:8443/functions/v1/api/v1', 'https://staging-backend.listspace.app/functions/v1/api/v2', 'not a url', '']) {
    assert.throws(() => assertStagingBase(bad), StagingGuardError, bad);
    assert.throws(() => createApi({ base: bad, env }), StagingGuardError, bad);
  }
});
test('guard: request paths cannot leave the API, redirects are not followed, the token is not echoed', async () => {
  const fake = fakeListspace();
  const api = makeApi(fake);
  for (const bad of ['/../x', '//evil.com/x', 'https://evil.com/x', '/a?b=1', '/a\\b']) await assert.rejects(api.get(bad), StagingGuardError, bad);
  assert.equal(fake.s.urls.length, 0);
  const redirecting = createApi({ env, sleep: async () => {}, fetchImpl: async () => ({ ok: false, status: 302, text: async () => '' }) });
  await assert.rejects(redirecting.get('/boards'), /redirect/);
  const leaky = createApi({ env, sleep: async () => {}, fetchImpl: async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ error: { code: 'bad', message: `bad token ${env.LISTSPACE_STAGING_TOKEN}` } }) }) });
  await assert.rejects(leaky.get('/boards'), (e) => !e.message.includes(env.LISTSPACE_STAGING_TOKEN));
  await assert.rejects(createApi({ env: {}, fetchImpl: fake.fetchImpl }).get('/boards'), /LISTSPACE_STAGING_TOKEN is not set/);
});
test('guard: a run with a non-staging base never reaches the network', async () => {
  const fake = fakeListspace();
  const res = await executeRun({
    entries: [entry('q1')], protocol, defs, models: ['gpt-6.2-sol'], conditions: ['board'], prices, providers: { openai: { ask: async () => { throw new Error('must not be called'); } } },
    meter: new Meter(10), makeApi: () => createApi({ base: 'https://api.listspace.app/v1', env, fetchImpl: fake.fetchImpl }), judge: { price: judgeCfg.price }, judgeModel: OFFICIAL_JUDGE_MODEL, sink: () => {}, runId: 't',
  });
  assert.equal(res.status, 'aborted_staging_guard');
  assert.equal(fake.s.urls.length, 0);
});

// ---- answer extraction and reply parsing ----
test('extraction: the reply is the hypothesis, empty and cut-off replies are flagged', () => {
  assert.deepEqual(extractHypothesis({ text: '  25:50 \n', stopReason: 'end_turn' }), { hypothesis: '25:50', empty: false, truncated: false });
  assert.equal(extractHypothesis({ text: '', stopReason: 'end_turn' }).empty, true);
  assert.equal(extractHypothesis({ text: 'partial', stopReason: 'max_tokens' }).truncated, true);
  assert.equal(extractHypothesis({ text: 'partial', stopReason: 'incomplete:max_output_tokens' }).truncated, true);
});
test('parseReply: fenced, prefixed and braces inside strings; rejects the rest', () => {
  assert.deepEqual(parseReply('```json\n{"calls":[],"done":true}\n```'), { calls: [], done: true });
  assert.equal(parseReply('Sure. {"calls":[{"tool":"create_item","args":{"title":"a } b"}}],"done":false} thanks').calls[0].args.title, 'a } b');
  for (const bad of ['no json', '{"calls":[]', '{"calls":"x","done":true}', '{"calls":[]}', '{bad json}']) assert.throws(() => parseReply(bad), ReplyParseError, bad);
});
test('judge: official prompts, call shape and label', async () => {
  assert.match(judgePrompt('knowledge-update', 'Q', 'A', 'R'), /as long as the updated answer is the required answer/);
  assert.match(judgePrompt('knowledge-update', 'Q', 'A', 'R', true), /unanswerable question/);
  let sent;
  const r = await judgeCall({ model: OFFICIAL_JUDGE_MODEL, prompt: 'p', env: { OPENAI_API_KEY: 'k' }, fetchImpl: async (url, init) => { sent = { url, body: JSON.parse(init.body) }; return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: 'Yes' } }], usage: { prompt_tokens: 100, completion_tokens: 1 } }) }; } });
  assert.equal(r.label, true);
  assert.deepEqual([sent.body.temperature, sent.body.max_tokens, sent.body.n], [0, 10, 1]);
});
test('selection is deterministic and the same ids come back every time', () => {
  const es = Array.from({ length: 30 }, (_, i) => entry(`q${String(i).padStart(2, '0')}`));
  const a = selectIds(es, { type: 'knowledge-update', n: 5, seed: 'x' });
  assert.deepEqual(a, selectIds([...es].reverse(), { type: 'knowledge-update', n: 5, seed: 'x' }));
  assert.notDeepEqual(a, selectIds(es, { type: 'knowledge-update', n: 5, seed: 'y' }));
  assert.deepEqual(orderedSessions(entry('z')).map((s) => s.n), [1, 2, 3]);
});

// ---- tool loop bound ----
test('tool loop: the per-session cap holds even when the model keeps asking', async () => {
  const fake = fakeListspace();
  const api = makeApi(fake);
  const boardId = await createBoard(api, { title: 't', description: 'd' });
  const reader = new BoardReader(api, boardId);
  let asked = 0;
  const call = { tool: 'create_item', args: { list_id: L_INFO, title: 'x', description: 'y' } };
  const ask = async () => { asked++; return { text: JSON.stringify({ calls: Array(10).fill(call), done: false }), usage: { input: 1, cacheRead: 0, cacheWrite: 0, output: 1 }, cost: 0, stopReason: 'end_turn' }; };
  const rows = [];
  const r = await keepSession({ ask, api, reader, system: 's', session: { n: 1, date: 'd', text: 't' }, total: 1, maxToolCalls: 4, maxTurns: 3, onCall: (c) => rows.push(c) });
  assert.equal(r.toolCalls, 4);
  assert.equal(asked, 1, 'stops once the cap is used');
  assert.equal(r.skipped, 6);
  assert.equal(fake.s.items.size, 4);
  assert.equal(rows.filter((c) => c.ok).length, 4);
  // the turn cap holds when the model calls nothing and never says done
  asked = 0;
  const lazy = async () => { asked++; return { text: '{"calls":[],"done":false}', usage: { input: 1, cacheRead: 0, cacheWrite: 0, output: 1 }, cost: 0, stopReason: 'end_turn' }; };
  const r2 = await keepSession({ ask: lazy, api, reader, system: 's', session: { n: 2, date: 'd', text: 't' }, total: 2, maxToolCalls: 8, maxTurns: 3 });
  assert.equal(asked, 3);
  assert.equal(r2.turns, 3);
  // garbage twice ends the session without throwing
  const junk = async () => ({ text: 'nope', usage: { input: 1, cacheRead: 0, cacheWrite: 0, output: 1 }, cost: 0, stopReason: 'end_turn' });
  const r3 = await keepSession({ ask: junk, api, reader, system: 's', session: { n: 3, date: 'd', text: 't' }, total: 3, maxToolCalls: 8, maxTurns: 4 });
  assert.equal(r3.turns, 2);
});
test('tool loop: a Listspace error and a bad id go back to the model, they do not stop the run', async () => {
  const fake = fakeListspace();
  fake.s.fail = (method, p) => p === '/decisions';
  const api = makeApi(fake);
  const reader = new BoardReader(api, await createBoard(api, { title: 't', description: 'd' }));
  const calls = [
    { tool: 'record_decision', args: { list_id: L_INFO, title: 'x', because: 'y' } },
    { tool: 'update_item', args: { item_id: '../../etc', title: 'x' } },
    { tool: 'delete_everything', args: {} },
  ];
  const seen = [];
  const prompts = [];
  let n = 0;
  const ask = async ({ user }) => { prompts.push(user); n++; return { text: JSON.stringify({ calls: n === 1 ? calls : [], done: n > 1 }), usage: { input: 1, cacheRead: 0, cacheWrite: 0, output: 1 }, cost: 0, stopReason: 'end_turn' }; };
  await keepSession({ ask, api, reader, system: 's', session: { n: 1, date: 'd', text: 't' }, total: 1, maxToolCalls: 8, maxTurns: 3, onCall: (c) => seen.push(c) });
  assert.deepEqual(seen.map((c) => c.ok), [false, false, false]);
  assert.match(seen[0].error, /429/);
  assert.match(prompts[1], /record_decision failed/);
});

// ---- budget abort ----
const fakeProvider = (text, output = 10) => ({ calls: 0, async ask() { this.calls++; return { text, stopReason: 'end_turn', usage: { input: 10000, cacheRead: 0, cacheWrite: 0, output } }; } });
const fakeJudgeFetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: 'yes' } }], usage: { prompt_tokens: 200, completion_tokens: 1 } }) });

test('budget: the run aborts cleanly before a call that could pass the cap, rows so far stand', async () => {
  const fake = fakeListspace();
  const rows = [];
  const provider = fakeProvider('{"calls":[{"tool":"create_item","args":{"list_id":"' + L_INFO + '","title":"n","description":"d"}}],"done":true}');
  const meter = new Meter(0.05);
  const res = await executeRun({
    entries: [entry('q1', 6)], protocol, defs, models: ['gpt-6.2-sol'], conditions: ['board'], prices, providers: { openai: provider }, meter,
    makeApi: () => makeApi(fake), judge: { price: judgeCfg.price, env: { OPENAI_API_KEY: 'k' }, fetchImpl: fakeJudgeFetch }, judgeModel: OFFICIAL_JUDGE_MODEL, sink: (r) => rows.push(r), runId: 't',
  });
  assert.equal(res.status, 'aborted_budget');
  assert.ok(meter.spent <= 0.05, `spent ${meter.spent}`);
  assert.ok(rows.some((r) => r.kind === 'keeper_turn'));
  assert.ok(!rows.some((r) => r.kind === 'answer'));
  assert.equal(res.boards.length, 1, 'the board is reported so cleanup can archive it');
});

test('end to end with fakes: both conditions, judge marked official, boards reported', async () => {
  const fake = fakeListspace();
  const rows = [];
  const keeperJson = '{"calls":[{"tool":"create_item","args":{"list_id":"' + L_INFO + '","title":"Things","description":"3 things"}}],"done":true}';
  const provider = { async ask({ system }) { const keeper = system.includes('You keep a Listspace board'); return { text: keeper ? keeperJson : 'The answer is 5.', stopReason: 'end_turn', usage: { input: 2000, cacheRead: 0, cacheWrite: 0, output: 50 } }; } };
  const boards = [];
  const res = await executeRun({
    entries: [entry('q1', 3)], protocol, defs, models: ['claude-sonnet-5-5'], conditions: ['full', 'board'], prices, providers: { anthropic: provider }, meter: new Meter(5),
    makeApi: () => makeApi(fake), judge: { price: judgeCfg.price, env: { OPENAI_API_KEY: 'k' }, fetchImpl: fakeJudgeFetch }, judgeModel: OFFICIAL_JUDGE_MODEL, sink: (r) => rows.push(r), onBoard: (b) => boards.push(b), runId: 't',
  });
  assert.equal(res.status, 'completed');
  assert.equal(rows.filter((r) => r.kind === 'answer').length, 2);
  const judges = rows.filter((r) => r.kind === 'judge');
  assert.equal(judges.length, 2);
  assert.ok(judges.every((j) => j.judge_is_official && j.judge_model === OFFICIAL_JUDGE_MODEL && j.correct === true));
  assert.match(rows.find((r) => r.kind === 'answer' && r.condition === 'board').board_text, /Things/);
  assert.equal(boards.length, 1);
  assert.ok(fake.s.urls.every((u) => u.startsWith('https://staging-backend.listspace.app/functions/v1/api/v1/')));
});

test('estimate: runs on tiny data with no network, ceiling is not below expected', () => {
  const est = estimateRun({ entries: [entry('q1', 4)], protocol, defs, models: ['claude-sonnet-5-5', 'gpt-6.2-sol'], conditions: ['full', 'board'], prices, judge: judgeCfg });
  for (const m of Object.values(est.byModel)) assert.ok(m.costUsd > 0 && m.ceilingUsd >= m.costUsd);
});
