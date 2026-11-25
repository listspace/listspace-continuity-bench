// One real call per provider: scenario s001 question 1, condition C, meter capped at 0.20 USD.
// Needs ANTHROPIC_API_KEY and OPENAI_API_KEY in the environment. Prints reply, usage and cost, never a key.
// Run on 2026-11-25: both calls ok, correct letter B, Claude 405 in / 11 out, OpenAI 281 in / 9 out.
import { readFileSync } from 'node:fs';
const url = (rel) => new URL(rel, import.meta.url);
const { anthropicProvider, openaiProvider } = await import(url('../src/providers.mjs').href);
const { loadPrices } = await import(url('../src/prices.mjs').href);
const { Meter, costOf, worstCaseCost } = await import(url('../src/meter.mjs').href);
const { answerRequest, memoryText, orderFor, estTokens } = await import(url('../src/runner.mjs').href);
const protocol = JSON.parse(readFileSync(url('../protocol.lock.json'), 'utf8'));
const prices = loadPrices(url('../config/prices.json'));
const s = JSON.parse(readFileSync(url('../scenarios/s001-brand-site-launch.json'), 'utf8'));
const q = s.questions[0];
const order = orderFor(s, q, 1);
const req = answerRequest(protocol, memoryText('C', s, ''), q, order);
const meter = new Meter(0.2);
const provs = { 'claude-sonnet-5-5': anthropicProvider(), 'gpt-6.2-sol': openaiProvider() };
for (const [model, p] of Object.entries(provs)) {
  const price = prices.models[model];
  meter.assertRoom(worstCaseCost(estTokens(req.system + req.user, 3), protocol.max_output_tokens.answer, price));
  try {
    const r = await p.ask({ model, system: req.system, user: req.user, maxOutputTokens: protocol.max_output_tokens.answer, effort: protocol.models[model].effort });
    const cost = costOf(r.usage, price);
    meter.record(cost);
    console.log(JSON.stringify({ model, ok: true, text: r.text, stop: r.stopReason, usage: r.usage, cost_usd: cost, correct_letter: String.fromCharCode(65 + order.findIndex((o) => o.status === 'current')) }));
  } catch (e) {
    console.log(JSON.stringify({ model, ok: false, error: e.message }));
  }
}
console.log('total spent', meter.spent);
