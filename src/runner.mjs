// Run planning and execution. Pure of IO except through the injected providers and sink,
// so the dry run, the spend meter and the budget abort can all be tested with a fake provider.
import { renderChat, renderBoard, renderQuestion } from './render.mjs';
import { shuffled, seedFrom } from './rng.mjs';
import { scoreReply, summarize } from './score.mjs';
import { costOf, worstCaseCost, BudgetExceeded } from './meter.mjs';
import { ProviderError } from './providers.mjs';

/** Same seed for every model and condition, so conditions are paired on identical option orders. */
export function orderFor(scenario, q, run) {
  return shuffled(q.options, seedFrom(`${scenario.id}/${q.id}/${run}`));
}

export function memoryText(condition, scenario, notes) {
  if (condition === 'A') return `# Project memory: every past session, in order\n\n${renderChat(scenario)}`;
  if (condition === 'B') return `# Project memory: notes file\n\n${notes}`;
  if (condition === 'C') return `# Project memory\n\n${renderBoard(scenario)}`;
  throw new Error(`unknown condition ${condition}`);
}

export function answerRequest(protocol, memory, q, order) {
  return { system: protocol.prompts.answer_system, user: `${memory}\n\n${renderQuestion(q, order)}` };
}

export function keeperRequest(protocol, notes, session) {
  const chat = session.chat.join('\n');
  return {
    system: protocol.prompts.keeper_system,
    user: `# Current notes\n\n${notes || '(empty)'}\n\n# New session ${session.n} (${session.date})\n\n${chat}`,
  };
}

const PLACEHOLDER = (tokens, cpt) => 'x'.repeat(Math.ceil(tokens * cpt));

/** Token estimate from characters. A guide only: the meter uses the provider's own usage counts. */
export const estTokens = (text, charsPerToken) => Math.ceil(text.length / charsPerToken);

/** Conservative size for the pre-call budget and window checks: 3 characters per token. */
const CONSERVATIVE_CPT = 3;

/**
 * Dry-run estimate. Makes no call. Notes (condition B) are not known before the keeper runs,
 * so their size is an assumption from the protocol.
 */
export function estimate({ scenarios, protocol, models, runs, conditions, prices }) {
  const as = protocol.estimate_assumptions;
  const out = { byModel: {}, totals: { calls: 0, keeperCalls: 0, answerCalls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 } };
  for (const model of models) {
    const price = prices.models[model];
    const cpt = as.chars_per_token[price.provider];
    const m = { calls: 0, keeperCalls: 0, answerCalls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, byCondition: {} };
    const add = (kind, inTok, outTok, cond) => {
      const cost = (inTok * price.input_per_mtok + outTok * price.output_per_mtok) / 1e6;
      m.calls++; m[kind === 'keeper' ? 'keeperCalls' : 'answerCalls']++;
      m.inputTokens += inTok; m.outputTokens += outTok; m.costUsd += cost;
      const c = (m.byCondition[cond] ??= { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 });
      c.calls++; c.inputTokens += inTok; c.outputTokens += outTok; c.costUsd += cost;
    };
    for (const s of scenarios) {
      const finalNotes = PLACEHOLDER(Math.min(as.notes_tokens_cap, as.notes_tokens_per_session * s.sessions.length), cpt);
      if (conditions.includes('B')) {
        s.sessions.forEach((session, i) => {
          const notes = PLACEHOLDER(Math.min(as.notes_tokens_cap, as.notes_tokens_per_session * i), cpt);
          const r = keeperRequest(protocol, notes, session);
          add('keeper', estTokens(r.system + r.user, cpt), as.keeper_output_tokens, 'B-keeper');
        });
      }
      for (const q of s.questions) {
        for (let run = 1; run <= runs; run++) {
          const order = orderFor(s, q, run);
          for (const cond of conditions) {
            const r = answerRequest(protocol, memoryText(cond, s, finalNotes), q, order);
            add('answer', estTokens(r.system + r.user, cpt), as.answer_output_tokens, cond);
          }
        }
      }
    }
    out.byModel[model] = m;
    for (const k of Object.keys(out.totals)) out.totals[k] += m[k];
  }
  return out;
}

/**
 * Executes the run. `providers` maps provider name to { ask }. `sink(row)` receives every row as it
 * happens. Never retries. Returns { status, error?, spentUsd, calls, summary } and does not throw
 * for a budget abort or a provider error: the run stops cleanly and the rows so far stand.
 */
export async function execute({ scenarios, protocol, models, runs, conditions, prices, providers, meter, sink }) {
  const rows = [];
  const emit = (row) => { rows.push(row); sink(row); };
  let status = 'completed';
  let error = null;
  try {
    for (const model of models) {
      const price = prices.models[model];
      const modelCfg = protocol.models[model];
      const provider = providers[price.provider];
      const temperature = modelCfg.send_temperature && typeof protocol.temperature === 'number' ? protocol.temperature : undefined;

      const call = async (req, maxOutputTokens) => {
        const est = estTokens(req.system + req.user, CONSERVATIVE_CPT);
        if (est > price.max_prompt_tokens) return { overflow: true, estInput: est };
        meter.assertRoom(worstCaseCost(est, maxOutputTokens, price));
        const res = await provider.ask({ model, system: req.system, user: req.user, maxOutputTokens, effort: modelCfg.effort, temperature });
        const cost = costOf(res.usage, price);
        meter.record(cost);
        return { res, cost };
      };

      for (const s of scenarios) {
        let notes = '';
        if (conditions.includes('B')) {
          for (const session of s.sessions) {
            const r = await call(keeperRequest(protocol, notes, session), protocol.max_output_tokens.keeper);
            if (r.overflow) { emit({ kind: 'keeper', model, scenario: s.id, session: session.n, outcome: 'context_overflow', est_input_tokens: r.estInput }); continue; }
            notes = r.res.text;
            emit({ kind: 'keeper', model, scenario: s.id, session: session.n, notes, stop_reason: r.res.stopReason, usage: r.res.usage, cost_usd: r.cost });
          }
        }
        for (const q of s.questions) {
          for (let run = 1; run <= runs; run++) {
            const order = orderFor(s, q, run);
            for (const condition of conditions) {
              const req = answerRequest(protocol, memoryText(condition, s, notes), q, order);
              const base = { kind: 'answer', model, scenario: s.id, question: q.id, type: q.type, condition, run, order: order.map((o) => o.id) };
              const r = await call(req, protocol.max_output_tokens.answer);
              if (r.overflow) { emit({ ...base, outcome: 'context_overflow', est_input_tokens: r.estInput }); continue; }
              const scored = scoreReply(r.res.text, order);
              emit({ ...base, reply: r.res.text, stop_reason: r.res.stopReason, outcome: scored.outcome, option: scored.option, usage: r.res.usage, cost_usd: r.cost });
            }
          }
        }
      }
    }
  } catch (e) {
    if (e instanceof BudgetExceeded) status = 'aborted_budget';
    else if (e instanceof ProviderError) status = 'aborted_provider_error';
    else throw e;
    error = e.message;
  }
  return { status, error, spentUsd: meter.spent, budgetUsd: meter.budget, calls: meter.calls, summary: summarizeRows(rows) };
}

export function summarizeRows(rows) {
  const answers = rows.filter((r) => r.kind === 'answer');
  const groups = {};
  for (const r of answers) (groups[`${r.model} | ${r.condition}`] ??= []).push(r);
  const out = {};
  for (const [k, g] of Object.entries(groups)) {
    const used = g.filter((r) => r.usage);
    out[k] = { ...summarize(g), mean_input_tokens: used.length ? used.reduce((n, r) => n + r.usage.input + r.usage.cacheRead + r.usage.cacheWrite, 0) / used.length : null };
  }
  return out;
}

