// Deterministic scoring. No model is involved. A reply is parsed, mapped back to
// the option it picked, and classified by that option's authored status.

export const OUTCOMES = ['current', 'replaced', 'unconfirmed', 'distractor', 'unknown', 'unparseable', 'context_overflow'];

export function scoreReply(replyText, order) {
  let letter;
  try {
    const m = /\{[^{}]*\}/.exec(replyText);
    letter = JSON.parse(m?.[0] ?? '').answer;
  } catch {
    return { outcome: 'unparseable', option: null };
  }
  const idx = typeof letter === 'string' ? letter.trim().toUpperCase().charCodeAt(0) - 65 : -1;
  const option = order[idx];
  return option ? { outcome: option.status, option: option.id } : { outcome: 'unparseable', option: null };
}

/** Headline metrics over a list of { type, outcome } rows. */
export function summarize(rows) {
  const n = rows.length;
  const count = (f) => rows.filter(f).length;
  const pct = (k) => (n === 0 ? null : (100 * k) / n);
  return {
    n,
    correct_pct: pct(count((r) => r.outcome === 'current')),
    // Picked a replaced decision or an unconfirmed proposal as if it were the settled answer.
    stale_belief_pct: pct(count((r) => ['replaced', 'unconfirmed'].includes(r.outcome))),
    abstain_pct: pct(count((r) => r.outcome === 'unknown')),
    unparseable_pct: pct(count((r) => r.outcome === 'unparseable')),
    // The memory did not fit the model's window. A failure of that condition, never hidden.
    context_overflow_pct: pct(count((r) => r.outcome === 'context_overflow')),
  };
}
