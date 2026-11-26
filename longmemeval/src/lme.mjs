// Planning (dry run) and execution of the LongMemEval mini run. IO goes through injected parts
// (providers, api, judge, sink), so the budget abort, the tool loop bound and the staging guard are
// testable with fakes and no network.
import { orderedSessions, sessionText, fullHistoryUser, FULL_SYSTEM } from './dataset.mjs';
import { createApi, StagingGuardError, ApiError } from './api.mjs';
import { createBoard, BoardReader, renderBoard } from './board.mjs';
import { keepSession, toolsText } from './keeper.mjs';
import { judgePrompt, judgeCall, isAbstention, OFFICIAL_JUDGE_MODEL } from './judge.mjs';
import { costOf, worstCaseCost, BudgetExceeded } from '../../src/meter.mjs';
import { ProviderError } from '../../src/providers.mjs';

const CONSERVATIVE_CPT = 3;
export const estTokens = (text, cpt) => Math.ceil(text.length / cpt);
export const keeperSystem = (protocol, defs) => `${protocol.prompts.keeper}\n\n# Tools\n\n${toolsText(defs)}`;

export function answerBoardUser(entry, boardText) {
  return `${boardText}\n\nCurrent Date: ${entry.question_date}\nQuestion: ${entry.question}\nAnswer:`;
}

/** What goes into the results file as the model's answer. The whole reply is the hypothesis, as in the official script. */
export function extractHypothesis(res) {
  const hypothesis = (res.text ?? '').trim();
  return { hypothesis, empty: hypothesis === '', truncated: /max_tokens|length|incomplete/.test(res.stopReason ?? '') };
}

/** Dry run. No call, no key, no network. Two figures per model: expected (assumptions) and ceiling (every cap hit). */
export function estimateRun({ entries, protocol, defs, models, conditions, prices, judge }) {
  const as = protocol.estimate_assumptions;
  const caps = protocol.caps;
  const sys = keeperSystem(protocol, defs);
  const byModel = {};
  for (const model of models) {
    const price = prices.models[model];
    const cpt = as.chars_per_token[price.provider];
    const m = { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, ceilingUsd: 0, byCondition: {}, perQuestion: [] };
    const add = (cond, q, inTok, outTok, ceilIn, ceilOut) => {
      const cost = (inTok * price.input_per_mtok + outTok * price.output_per_mtok) / 1e6;
      const ceil = (ceilIn * price.input_per_mtok + ceilOut * price.output_per_mtok) / 1e6;
      m.calls++; m.inputTokens += inTok; m.outputTokens += outTok; m.costUsd += cost; m.ceilingUsd += ceil;
      const c = (m.byCondition[cond] ??= { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, ceilingUsd: 0 });
      c.calls++; c.inputTokens += inTok; c.outputTokens += outTok; c.costUsd += cost; c.ceilingUsd += ceil;
      q[cond] = (q[cond] ?? 0) + cost;
    };
    for (const e of entries) {
      const q = { id: e.question_id };
      const sessions = orderedSessions(e).map((s) => ({ ...s, text: sessionText(s) }));
      for (const cond of conditions) {
        if (cond === 'full') {
          const inTok = estTokens(FULL_SYSTEM + fullHistoryUser(e), cpt);
          add('full', q, inTok, as.answer_output_tokens_full[price.provider], estTokens(FULL_SYSTEM + fullHistoryUser(e), Math.min(cpt, CONSERVATIVE_CPT)), caps.max_output_tokens.answer_full);
        } else {
          sessions.forEach((s, i) => {
            const boardTok = Math.min(as.board_tokens_cap, as.board_tokens_per_session * i);
            const base = estTokens(sys + s.text, cpt) + boardTok + 60;
            const turns = as.keeper_turns_per_session;
            const out = as.keeper_output_tokens_per_turn[price.provider];
            // expected: first turn, plus (turns - 1) follow-up turns that carry the reply and the tool results
            const extra = (turns - 1) * (base + out + as.tool_result_tokens_per_extra_turn);
            add('board-keeper', q, base + extra, turns * out, 0, 0);
            // ceiling: every turn used, every turn at the output cap, results at 8 x 700 characters
            const cBase = estTokens(sys + s.text, Math.min(cpt, CONSERVATIVE_CPT)) + as.board_tokens_cap + 60;
            let cIn = 0;
            for (let t = 0; t < caps.max_turns_per_session; t++) cIn += cBase + t * (caps.max_output_tokens.keeper_turn + (caps.max_tool_calls_per_session * 700) / Math.min(cpt, CONSERVATIVE_CPT));
            const last = m.byCondition['board-keeper'];
            const ceil = (cIn * price.input_per_mtok + caps.max_turns_per_session * caps.max_output_tokens.keeper_turn * price.output_per_mtok) / 1e6;
            last.ceilingUsd += ceil; m.ceilingUsd += ceil;
          });
          const finalBoard = Math.min(as.board_tokens_cap, as.board_tokens_per_session * sessions.length);
          const ans = 'x'.repeat(Math.ceil(finalBoard * cpt));
          const user = answerBoardUser(e, ans);
          add('board-answer', q, estTokens(protocol.prompts.answer_board + user, cpt), as.answer_output_tokens_board[price.provider],
            estTokens(protocol.prompts.answer_board, CONSERVATIVE_CPT) + as.board_tokens_cap + 200, caps.max_output_tokens.answer_board);
        }
        // judge: prompt of about 250 tokens plus the hypothesis
        const hypTok = cond === 'full' ? as.answer_output_tokens_full[price.provider] : as.answer_output_tokens_board[price.provider];
        const jIn = 250 + hypTok;
        const jc = (jIn * judge.price.input_per_mtok + 3 * judge.price.output_per_mtok) / 1e6;
        m.costUsd += jc; m.ceilingUsd += jc; q.judge = (q.judge ?? 0) + jc;
        const jb = (m.byCondition[`${cond}-judge`] ??= { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, ceilingUsd: 0 });
        jb.calls++; jb.inputTokens += jIn; jb.outputTokens += 3; jb.costUsd += jc; jb.ceilingUsd += jc;
        m.calls++; m.inputTokens += jIn; m.outputTokens += 3;
      }
      m.perQuestion.push(q);
    }
    byModel[model] = m;
  }
  const totals = Object.values(byModel).reduce((t, m) => ({ calls: t.calls + m.calls, inputTokens: t.inputTokens + m.inputTokens, outputTokens: t.outputTokens + m.outputTokens, costUsd: t.costUsd + m.costUsd, ceilingUsd: t.ceilingUsd + m.ceilingUsd }), { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, ceilingUsd: 0 });
  return { byModel, totals };
}

/**
 * Executes the run. Returns { status, error, spentUsd, calls, boards }. Never throws for a budget
 * abort, a provider error or a Listspace API error: the run stops and the rows so far stand. A staging
 * guard error stops the run as well. `makeApi()` builds the staging client (the guard runs inside it).
 */
export async function executeRun({ entries, protocol, defs, models, conditions, prices, providers, meter, makeApi, judge, judgeModel, sink, onBoard, runId }) {
  let status = 'completed';
  let error = null;
  const boards = [];
  const emit = (row) => sink(row);
  const system = keeperSystem(protocol, defs);
  const judgeIsOfficial = judgeModel === OFFICIAL_JUDGE_MODEL;
  try {
    const api = conditions.includes('board') ? makeApi() : null;
    for (const model of models) {
      const price = prices.models[model];
      const cfg = protocol.models[model];
      const provider = providers[price.provider];
      const ask = async ({ system: sys, user }, maxOutputTokens, ctx) => {
        const est = estTokens(sys + user, CONSERVATIVE_CPT);
        if (est > price.max_prompt_tokens) throw new ProviderError(price.provider, null, `prompt of about ${est} tokens is over the model limit of ${price.max_prompt_tokens}`);
        meter.assertRoom(worstCaseCost(est, maxOutputTokens, price));
        const res = await provider.ask({ model, system: sys, user, maxOutputTokens, effort: cfg.effort });
        const cost = costOf(res.usage, price);
        meter.record(cost);
        return { ...res, cost, ctx };
      };
      const judgeAnswer = async (e, hypothesis, base) => {
        const prompt = judgePrompt(e.question_type, e.question, e.answer, hypothesis, isAbstention(e.question_id));
        const est = estTokens(prompt, CONSERVATIVE_CPT);
        meter.assertRoom(worstCaseCost(est, 10, judge.price));
        const r = await judgeCall({ model: judgeModel, prompt, env: judge.env, fetchImpl: judge.fetchImpl });
        const cost = costOf(r.usage, judge.price);
        meter.record(cost);
        emit({ ...base, kind: 'judge', judge_model: judgeModel, judge_is_official: judgeIsOfficial, judge_reply: r.text, correct: r.label, usage: r.usage, cost_usd: cost });
        return r.label;
      };

      for (const e of entries) {
        const qbase = { model, question: e.question_id, type: e.question_type };
        if (conditions.includes('full')) {
          const res = await ask({ system: protocol.prompts.full_system, user: fullHistoryUser(e) }, protocol.caps.max_output_tokens.answer_full);
          const h = extractHypothesis(res);
          emit({ ...qbase, kind: 'answer', condition: 'full', hypothesis: h.hypothesis, empty: h.empty, truncated: h.truncated, stop_reason: res.stopReason, usage: res.usage, cost_usd: res.cost });
          await judgeAnswer(e, h.hypothesis, { ...qbase, condition: 'full' });
        }
        if (conditions.includes('board')) {
          const sessions = orderedSessions(e).map((s) => ({ ...s, text: sessionText(s) }));
          const boardId = await createBoard(api, { title: `lme ${runId} ${model} ${e.question_id}`.slice(0, 200), description: 'Throwaway board for a LongMemEval benchmark run. Safe to archive.' });
          boards.push(boardId);
          onBoard?.({ board_id: boardId, model, question: e.question_id });
          const reader = new BoardReader(api, boardId);
          const stats = { turns: 0, toolCalls: 0, skipped: 0 };
          for (const s of sessions) {
            const r = await keepSession({
              ask: (req) => ask(req, protocol.caps.max_output_tokens.keeper_turn),
              api, reader, system, session: s, total: sessions.length,
              maxToolCalls: protocol.caps.max_tool_calls_per_session, maxTurns: protocol.caps.max_turns_per_session,
              onTurn: (t) => emit({ ...qbase, kind: 'keeper_turn', condition: 'board', session: s.n, turn: t.turn, stop_reason: t.stopReason, usage: t.usage, cost_usd: t.cost, reply: t.reply }),
              onCall: (c) => emit({ ...qbase, kind: 'tool_call', condition: 'board', session: s.n, ...c }),
            });
            stats.turns += r.turns; stats.toolCalls += r.toolCalls; stats.skipped += r.skipped;
          }
          const model_ = await reader.read();
          const extra = await reader.session();
          const boardText = renderBoard(model_, extra);
          const res = await ask({ system: protocol.prompts.answer_board, user: answerBoardUser(e, boardText) }, protocol.caps.max_output_tokens.answer_board);
          const h = extractHypothesis(res);
          emit({ ...qbase, kind: 'answer', condition: 'board', board_id: boardId, hypothesis: h.hypothesis, empty: h.empty, truncated: h.truncated, stop_reason: res.stopReason, usage: res.usage, cost_usd: res.cost, keeper: stats, board_text: boardText });
          await judgeAnswer(e, h.hypothesis, { ...qbase, condition: 'board' });
        }
      }
    }
  } catch (err) {
    if (err instanceof BudgetExceeded) status = 'aborted_budget';
    else if (err instanceof ProviderError) status = 'aborted_provider_error';
    else if (err instanceof ApiError) status = 'aborted_listspace_error';
    else if (err instanceof StagingGuardError) status = 'aborted_staging_guard';
    else throw err;
    error = err.message;
  }
  return { status, error, spentUsd: meter.spent, budgetUsd: meter.budget, calls: meter.calls, boards };
}

/** Per model and condition: accuracy by the judge, tokens and cost. Rows come from results.jsonl. */
export function summarizeRows(rows) {
  const out = {};
  const key = (r) => `${r.model} | ${r.condition}`;
  for (const r of rows) {
    const g = (out[key(r)] ??= { questions: 0, correct: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0, keeper_turns: 0, tool_calls: 0, tool_calls_failed: 0, judge_models: new Set() });
    if (r.kind === 'answer') g.questions++;
    if (r.kind === 'judge') { g.correct += r.correct ? 1 : 0; g.judge_models.add(`${r.judge_model}${r.judge_is_official ? ' (official)' : ' (SUBSTITUTE)'}`); }
    if (r.kind === 'keeper_turn') g.keeper_turns++;
    if (r.kind === 'tool_call') { g.tool_calls++; if (!r.ok) g.tool_calls_failed++; }
    if (r.usage) { g.input_tokens += r.usage.input + r.usage.cacheRead + r.usage.cacheWrite; g.output_tokens += r.usage.output; }
    if (typeof r.cost_usd === 'number') g.cost_usd += r.cost_usd;
  }
  for (const g of Object.values(out)) { g.judge_models = [...g.judge_models]; g.accuracy = g.questions ? g.correct / g.questions : null; g.cost_per_question_usd = g.questions ? g.cost_usd / g.questions : null; }
  return out;
}

export { createApi };
