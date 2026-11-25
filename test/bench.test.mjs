import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateScenario } from '../src/state.mjs';
import { renderBoard, renderChat } from '../src/render.mjs';
import { scoreReply, summarize } from '../src/score.mjs';
import { shuffled } from '../src/rng.mjs';
import { costOf, worstCaseCost, Meter, BudgetExceeded } from '../src/meter.mjs';
import { priceFor, loadPrices } from '../src/prices.mjs';
import { anthropicProvider, openaiProvider, ProviderError } from '../src/providers.mjs';
import { estimate, execute } from '../src/runner.mjs';

const scenarios = readdirSync(new URL('../scenarios/', import.meta.url)).map((f) =>
  JSON.parse(readFileSync(new URL(`../scenarios/${f}`, import.meta.url), 'utf8')));

test('answer keys agree with events', () => {
  for (const s of scenarios) assert.deepEqual(validateScenario(s), []);
});
test('board shows replaced and unconfirmed decisions with their status', () => {
  const b = renderBoard(scenarios[0]);
  assert.match(b, /CONFIRMED: Launch on 4 April/);
  assert.match(b, /REPLACED: Launch on 14 March/);
  assert.match(b, /PROPOSED, NOT CONFIRMED: Host on Netlify/);
});
test('rendered contexts never leak the answer key', () => {
  for (const s of scenarios) for (const c of [renderBoard(s), renderChat(s)]) assert.doesNotMatch(c, /"status"|current_decision|reviewed_by_jordi/);
});
test('scoring maps the letter to the authored status', () => {
  const q = scenarios[0].questions[0];
  const order = shuffled(q.options, 7);
  const letter = String.fromCharCode(65 + order.findIndex((o) => o.status === 'replaced'));
  assert.equal(scoreReply(`{"answer":"${letter}"}`, order).outcome, 'replaced');
  assert.equal(scoreReply('no idea', order).outcome, 'unparseable');
  assert.equal(summarize([{ outcome: 'current' }, { outcome: 'replaced' }]).stale_belief_pct, 50);
});
test('shuffle is reproducible from the seed', () => {
  const o = scenarios[0].questions[0].options;
  assert.deepEqual(shuffled(o, 3), shuffled(o, 3));
});

// ---- drafted scenarios --------------------------------------------------------------------
test('scenarios beyond the three hand-written ones are drafted by an agent and reviewed by Jordi, over 3, 10 and 30 sessions', () => {
  const drafts = scenarios.filter((s) => !['s001', 's002', 's003'].includes(s.id));
  assert.equal(drafts.length, 7);
  for (const s of drafts) {
    assert.equal(s.review.reviewed_by_jordi, true);
    assert.equal(s.review.reviewed_on, '2026-11-25');
    assert.match(s.review.note, /Drafted by an AI agent/);
  }
  assert.deepEqual([...new Set(scenarios.map((s) => s.sessions.length))].sort((a, b) => a - b), [3, 10, 30]);
});

// ---- spend meter, price table, providers, runner ------------------------------------------
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const prices = loadPrices(`${ROOT}config/prices.json`);
const protocol = JSON.parse(readFileSync(`${ROOT}protocol.draft.json`, 'utf8'));
const MODEL = 'claude-sonnet-5-5';
const slice = scenarios.slice(0, 2);

/** A fake provider: always answers "A", reports fixed usage, records every call. */
function fakeProvider(usage = { input: 1000, cacheRead: 0, cacheWrite: 0, output: 100 }) {
  const calls = [];
  return { calls, async ask(req) { calls.push(req); return { text: '{"answer":"A"}', stopReason: 'end_turn', usage }; } };
}
const runArgs = (over = {}) => ({ scenarios: slice, protocol, models: [MODEL], runs: 1, conditions: ['A', 'B', 'C'], prices, ...over });
const callsFor = (list) => list.reduce((n, s) => n + s.sessions.length, 0) + list.length * 4 * 3;

test('meter: cost is usage times price, per token class', () => {
  const p = prices.models[MODEL];
  const usage = { input: 1_000_000, cacheRead: 1_000_000, cacheWrite: 1_000_000, output: 1_000_000 };
  assert.equal(costOf(usage, p), 2 + 0.1 + 2.5 + 10);
  assert.equal(worstCaseCost(500_000, 100_000, p), 1 + 1);
  assert.throws(() => costOf({ input: 0, cacheRead: 0, cacheWrite: 1, output: 0 }, prices.models['gpt-6.2-sol']), /no cache write price/);
});

test('price table: a model without a verified, sourced price is refused', () => {
  assert.doesNotThrow(() => priceFor(prices, MODEL));
  assert.throws(() => priceFor(prices, 'no-such-model'), /no entry/);
  const bad = (patch) => ({ models: { m: { ...prices.models[MODEL], ...patch } } });
  assert.throws(() => priceFor(bad({ source_url: '' }), 'm'), /source_url/);
  assert.throws(() => priceFor(bad({ verified_on: null }), 'm'), /verified_on/);
  assert.throws(() => priceFor(bad({ output_per_mtok: 'ten' }), 'm'), /output_per_mtok/);
  for (const [id, p] of Object.entries(prices.models)) assert.ok(p.source_url.startsWith('https://'), id);
});

test('runner: a full run meters every call and the rows add up', async () => {
  const provider = fakeProvider();
  const rows = [];
  const meter = new Meter(1000);
  const r = await execute({ ...runArgs(), providers: { anthropic: provider }, meter, sink: (x) => rows.push(x) });
  assert.equal(r.status, 'completed');
  assert.equal(provider.calls.length, callsFor(slice));
  assert.equal(meter.calls, provider.calls.length);
  const perCall = (1000 * 2 + 100 * 10) / 1e6;
  assert.ok(Math.abs(meter.spent - perCall * provider.calls.length) < 1e-9);
  assert.ok(Math.abs(rows.reduce((n, x) => n + x.cost_usd, 0) - meter.spent) < 1e-9);
  assert.equal(provider.calls[0].temperature, undefined); // temperature is not sent for this model
  assert.equal(provider.calls[0].effort, 'low');
});

test('runner: option order is the same for every condition, so conditions are paired', async () => {
  const rows = [];
  await execute({ ...runArgs(), providers: { anthropic: fakeProvider() }, meter: new Meter(1000), sink: (x) => rows.push(x) });
  const first = rows.filter((x) => x.kind === 'answer' && x.question === 'q1' && x.scenario === 's001');
  assert.equal(first.length, 3);
  assert.deepEqual(first[0].order, first[1].order);
  assert.deepEqual(first[1].order, first[2].order);
});

test('budget abort: stops before the call that could pass the cap and keeps the rows so far', async () => {
  const provider = fakeProvider();
  const rows = [];
  const budget = 0.05; // a worst case call costs about 4 cents, so only a few calls fit
  const meter = new Meter(budget);
  const r = await execute({ ...runArgs(), providers: { anthropic: provider }, meter, sink: (x) => rows.push(x) });
  assert.equal(r.status, 'aborted_budget');
  assert.match(r.error, /budget would be exceeded/);
  assert.ok(meter.spent <= budget);
  assert.ok(provider.calls.length > 0 && provider.calls.length < callsFor(slice));
  assert.equal(rows.length, provider.calls.length);
});

test('budget abort: a budget below one worst case call makes no call at all', async () => {
  const provider = fakeProvider();
  const r = await execute({ ...runArgs(), providers: { anthropic: provider }, meter: new Meter(0.0001), sink: () => {} });
  assert.equal(r.status, 'aborted_budget');
  assert.equal(provider.calls.length, 0);
  assert.throws(() => new Meter(0), /positive/);
  assert.throws(() => new Meter(1).assertRoom(2), BudgetExceeded);
});

test('no retries: a provider error stops the run after one call', async () => {
  let n = 0;
  const provider = { async ask() { n++; throw new ProviderError('anthropic', 529, 'overloaded'); } };
  const r = await execute({ ...runArgs(), providers: { anthropic: provider }, meter: new Meter(1000), sink: () => {} });
  assert.equal(r.status, 'aborted_provider_error');
  assert.equal(n, 1);
});

test('context window: a memory that cannot fit is recorded as an overflow and not sent', async () => {
  const tiny = { models: { [MODEL]: { ...prices.models[MODEL], max_prompt_tokens: 50 } } };
  const provider = fakeProvider();
  const rows = [];
  const r = await execute({ ...runArgs({ prices: tiny, conditions: ['A'] }), providers: { anthropic: provider }, meter: new Meter(1000), sink: (x) => rows.push(x) });
  assert.equal(r.status, 'completed');
  assert.equal(provider.calls.length, 0);
  assert.ok(rows.every((x) => x.outcome === 'context_overflow'));
  assert.equal(Object.values(r.summary)[0].context_overflow_pct, 100);
});

test('dry run: the estimate counts calls without any provider', () => {
  const e = estimate(runArgs());
  assert.equal(e.totals.keeperCalls, slice.reduce((n, s) => n + s.sessions.length, 0));
  assert.equal(e.totals.answerCalls, slice.length * 4 * 3);
  assert.equal(e.totals.calls, callsFor(slice));
  assert.ok(e.totals.costUsd > 0 && e.totals.inputTokens > 0);
});

test('dry run CLI: prints the estimate, calls nothing, needs no key and no lock file', () => {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY; delete env.OPENAI_API_KEY;
  const r = spawnSync(process.execPath, ['bench.mjs', 'run', '--dry-run', '--models', `${MODEL},gpt-6.2-sol`, '--runs', '1', '--scenarios', 's001,s002', '--budget', '5'], { cwd: ROOT, env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /DRY RUN\. Nothing was called/);
  assert.match(r.stdout, new RegExp(`TOTAL: ${callsFor(slice) * 2} calls`));
  assert.match(r.stdout, /inside the cap/);
});

test('the frozen protocol matches the scenario files, and a real run refuses without keys, for an unpriced model and for a temperature that disagrees', () => {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY; delete env.OPENAI_API_KEY;
  const run = (args) => spawnSync(process.execPath, ['bench.mjs', 'run', ...args], { cwd: ROOT, env, encoding: 'utf8' });
  const base = ['--budget', '1', '--runs', '1', '--temp', 'default', '--out', 'runs/test-should-not-exist'];
  const lock = JSON.parse(readFileSync(`${ROOT}protocol.lock.json`, 'utf8'));
  const hashes = JSON.parse(spawnSync(process.execPath, ['bench.mjs', 'hashes'], { cwd: ROOT, encoding: 'utf8' }).stdout);
  assert.deepEqual(lock.scenario_sha256, hashes);
  assert.equal(lock.temperature, 'provider_default');
  assert.deepEqual(Object.keys(lock.models), [MODEL, 'gpt-6.2-sol']);
  const noKey = run(['--models', MODEL, ...base]);
  assert.notEqual(noKey.status, 0);
  assert.match(noKey.stderr, /ANTHROPIC_API_KEY is not set/);
  assert.match(run(['--dry-run', '--models', 'gpt-9', '--runs', '1']).stderr, /no entry in the price table/);
  assert.match(run(['--dry-run', '--models', MODEL, '--runs', '1', '--temp', '1']).stderr, /disagrees with the protocol/);
});

test('providers: key goes in a header only, usage is normalised, error text never carries a key', async () => {
  let seen;
  const okAnthropic = async (url, init) => {
    seen = { url, init };
    return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"answer":"B"}' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 3, cache_read_input_tokens: 4, cache_creation_input_tokens: 2 } }), { status: 200 });
  };
  const a = await anthropicProvider({ env: { ANTHROPIC_API_KEY: 'sk-ant-secret-1' }, fetchImpl: okAnthropic }).ask({ model: MODEL, system: 's', user: 'u', maxOutputTokens: 100, effort: 'low' });
  assert.deepEqual(a.usage, { input: 10, cacheRead: 4, cacheWrite: 2, output: 3 });
  assert.equal(seen.init.headers['x-api-key'], 'sk-ant-secret-1');
  const body = JSON.parse(seen.init.body);
  assert.equal(body.temperature, undefined);
  assert.deepEqual(body.output_config, { effort: 'low' });
  assert.doesNotMatch(seen.init.body, /sk-ant-secret/);

  const okOpenai = async (url, init) => {
    seen = { url, init };
    return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'reasoning' }, { type: 'message', content: [{ type: 'output_text', text: '{"answer":"C"}' }] }], usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 40 }, output_tokens: 20 } }), { status: 200 });
  };
  const o = await openaiProvider({ env: { OPENAI_API_KEY: 'sk-oa-secret-2' }, fetchImpl: okOpenai }).ask({ model: 'gpt-6.2-sol', system: 's', user: 'u', maxOutputTokens: 100, effort: 'low' });
  assert.equal(o.text, '{"answer":"C"}');
  assert.deepEqual(o.usage, { input: 60, cacheRead: 40, cacheWrite: 0, output: 20 });
  assert.equal(seen.init.headers.authorization, 'Bearer sk-oa-secret-2');
  assert.doesNotMatch(seen.init.body, /sk-oa-secret/);

  const echo401 = async () => new Response(JSON.stringify({ error: { message: 'Incorrect API key provided: sk-oa-secret-2.' } }), { status: 401 });
  await assert.rejects(openaiProvider({ env: { OPENAI_API_KEY: 'sk-oa-secret-2' }, fetchImpl: echo401 }).ask({ model: 'x', system: '', user: '', maxOutputTokens: 1, effort: 'low' }),
    (e) => e instanceof ProviderError && e.status === 401 && !e.message.includes('sk-oa-secret'));
  await assert.rejects(anthropicProvider({ env: {}, fetchImpl: okAnthropic }).ask({ model: MODEL, system: '', user: '', maxOutputTokens: 1, effort: 'low' }), /ANTHROPIC_API_KEY is not set/);
  const noUsage = async () => new Response(JSON.stringify({ content: [], stop_reason: 'end_turn' }), { status: 200 });
  await assert.rejects(anthropicProvider({ env: { ANTHROPIC_API_KEY: 'k' }, fetchImpl: noUsage }).ask({ model: MODEL, system: '', user: '', maxOutputTokens: 1, effort: 'low' }), /cannot be metered/);
});
