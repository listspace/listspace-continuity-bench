// Ground truth. Folds a scenario's ops into the plan state. The answer keys are
// checked against this fold (validateScenario), so a key cannot drift from the events.

export function foldState(scenario) {
  const decisions = new Map(); // key -> { current, history[], proposed[] }
  const tasks = new Map(); // id -> { id, title, done }
  for (const session of scenario.sessions) {
    for (const op of session.ops) {
      if (op.op === 'task_add') tasks.set(op.id, { id: op.id, title: op.title, done: false });
      else if (op.op === 'task_done') tasks.get(op.id).done = true;
      else {
        const d = decisions.get(op.key) ?? { current: null, history: [], proposed: [] };
        decisions.set(op.key, d);
        if (op.op === 'propose') {
          d.proposed.push({ text: op.text, by: op.by, date: session.date });
        } else if (op.op === 'confirm') {
          const p = d.proposed.pop();
          if (!p) throw new Error(`${scenario.id}: confirm of ${op.key} with nothing proposed`);
          if (d.current) d.history.push({ ...d.current, replacedOn: session.date });
          d.current = { text: p.text, confirmedBy: op.by, reason: op.reason, date: session.date };
        } else throw new Error(`${scenario.id}: unknown op ${op.op}`);
      }
    }
  }
  return { decisions, tasks };
}

/** Throws on the first inconsistency between the authored answer keys and the folded events. */
export function validateScenario(scenario) {
  const { decisions, tasks } = foldState(scenario);
  const errors = [];
  for (const q of scenario.questions) {
    const current = q.options.filter((o) => o.status === 'current');
    if (current.length !== 1) errors.push(`${scenario.id}/${q.id}: needs exactly one current option`);
    const ids = new Set(q.options.map((o) => o.id));
    if (ids.size !== q.options.length) errors.push(`${scenario.id}/${q.id}: duplicate option ids`);
    if (!q.options.some((o) => o.status === 'unknown')) errors.push(`${scenario.id}/${q.id}: no abstain option`);
    const text = current[0]?.text ?? '';
    if (q.type === 'current_decision') {
      const d = decisions.get(q.key);
      const want = d?.current?.text ?? '';
      // The option text is a short form of the decision text, so require the option to appear in it.
      if (!want.toLowerCase().includes(text.toLowerCase().replace(/^no date.*/, '\u0000')))
        errors.push(`${scenario.id}/${q.id}: key "${text}" is not in confirmed "${want}"`);
    } else if (q.type === 'was_confirmed') {
      const d = decisions.get(q.key);
      const confirmedNow = Boolean(d?.current) && d.proposed.length === 0;
      const saysYes = /^yes/i.test(text);
      if (saysYes !== confirmedNow) errors.push(`${scenario.id}/${q.id}: key disagrees with events (confirmed=${confirmedNow})`);
    } else if (q.type === 'next_task') {
      const next = [...tasks.values()].find((t) => !t.done);
      if (!next || next.title !== text) errors.push(`${scenario.id}/${q.id}: next open task is "${next?.title}", key says "${text}"`);
    } else if (q.type === 'who_decided') {
      const c = decisions.get(q.key)?.current;
      if (!c || !text.startsWith(c.confirmedBy) || !text.toLowerCase().includes(c.reason.toLowerCase().replace(/^[a-z]/, (m) => m)))
        errors.push(`${scenario.id}/${q.id}: key "${text}" does not match ${c?.confirmedBy} / ${c?.reason}`);
    } else errors.push(`${scenario.id}/${q.id}: unknown type ${q.type}`);
  }
  return [...errors, ...validateParity(scenario)];
}

/** Words that make a line an explicit confirmation. Fixed list, checked for every confirm op. */
export const CONFIRM_WORDS = /\b(confirmed|confirm|approved|agreed)\b/;
export const UNCONFIRMED_NO = 'No, it was proposed but never confirmed';
export const YES_CONFIRMED = 'Yes, confirmed';
export const CANNOT_TELL = 'Cannot tell from the memory provided';

/**
 * Information parity: nothing the answer keys and the board rely on may exist only in the ops.
 * Every task finished is named verbatim in that session's chat, tasks added are listed in plan order
 * in one chat line, every confirmation names the person who confirmed, and the was_confirmed options
 * carry no detail that only one condition could know.
 */
export function validateParity(scenario) {
  const errors = [];
  const addOps = scenario.sessions.flatMap((x) => x.ops).filter((x) => x.op === 'task_add');
  for (const s of scenario.sessions) {
    const lines = s.chat.map((l) => l.toLowerCase());
    const chat = lines.join('\n');
    for (const o of s.ops) {
      if (o.op === 'task_done') {
        const title = addOps.find((x) => x.id === o.id)?.title ?? '';
        if (!chat.includes(title.toLowerCase())) errors.push(`${scenario.id}/s${s.n}: task done "${title}" is not named in the chat`);
      }
      if (o.op === 'confirm') {
        // The decider says it themselves, with an explicit word, so a confirmation never reads as a wish or a relay.
        const first = o.by.toLowerCase().split(' ')[0];
        const direct = lines.some((l) => l.startsWith(`${first}:`) && CONFIRM_WORDS.test(l));
        if (!direct) errors.push(`${scenario.id}/s${s.n}: ${o.by} confirms ${o.key} but has no chat line of their own with a confirmation word (${CONFIRM_WORDS.source})`);
      }
    }
    const added = s.ops.filter((o) => o.op === 'task_add').map((o) => o.title.toLowerCase());
    if (added.length) {
      const inOrder = lines.some((l) => {
        let at = -1;
        return added.every((t) => { at = l.indexOf(t, at + 1); return at >= 0; });
      });
      if (!inOrder) errors.push(`${scenario.id}/s${s.n}: tasks added (${added.join(', ')}) are not listed in plan order in one chat line`);
    }
  }
  for (const q of scenario.questions) {
    if (q.type !== 'was_confirmed') continue;
    for (const o of q.options)
      if (![UNCONFIRMED_NO, YES_CONFIRMED, CANNOT_TELL].includes(o.text)) errors.push(`${scenario.id}/${q.id}: was_confirmed option "${o.text}" is not one of the fixed texts`);
  }
  return errors;
}
