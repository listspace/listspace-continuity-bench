// Context renderers: what each condition puts in front of a fresh AI session.
// The answer keys and option statuses are never rendered.
import { foldState } from './state.mjs';

/** Condition A: every past session's chat, in order, as one dump. */
export function renderChat(scenario) {
  return scenario.sessions
    .map((s) => `--- Session ${s.n} (${s.date}) ---\n${s.chat.join('\n')}`)
    .join('\n\n');
}

/** Condition C (read side): the board view a Listspace session starts from. Mirrors the
 *  Proposed / Confirmed / Replaced split. Tier B replaces this with a real export. */
export function renderBoard(scenario) {
  const { decisions, tasks } = foldState(scenario);
  const out = ['# Project board', '', '## Decisions'];
  for (const [key, d] of decisions) {
    out.push(`### ${key}`);
    if (d.current) out.push(`CONFIRMED: ${d.current.text} (confirmed by ${d.current.confirmedBy} on ${d.current.date}. Reason: ${d.current.reason})`);
    for (const h of d.history) out.push(`REPLACED: ${h.text} (was confirmed by ${h.confirmedBy} on ${h.date}, replaced on ${h.replacedOn})`);
    for (const p of d.proposed) out.push(`PROPOSED, NOT CONFIRMED: ${p.text} (proposed by ${p.by} on ${p.date})`);
    out.push('');
  }
  out.push('## Tasks, in plan order');
  for (const t of tasks.values()) out.push(`- [${t.done ? 'x' : ' '}] ${t.title}`);
  return out.join('\n');
}

/** Rough size guide only. The runner records the provider's own usage counts for real figures. */
export function approxTokens(text) {
  return Math.ceil(text.length / 4);
}

/** The question block shown to the model. Option order is shuffled by the caller's seeded PRNG. */
export function renderQuestion(q, order) {
  const lines = order.map((o, i) => `${String.fromCharCode(65 + i)}. ${o.text}`);
  return `Question: ${q.prompt}\n${lines.join('\n')}\n\nReply with JSON only: {"answer":"<letter>"}`;
}
