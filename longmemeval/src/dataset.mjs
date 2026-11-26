// LongMemEval-S loading, seeded question selection and prompt text. Pure apart from the file read.
import { readFileSync } from 'node:fs';
import { seedFrom, shuffled } from '../../src/rng.mjs';

export function loadDataset(path) {
  const entries = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(entries) || !entries.every((e) => e.question_id && Array.isArray(e.haystack_sessions))) throw new Error(`${path} is not a LongMemEval file`);
  return entries;
}

/** Deterministic pick: ids of one question type, sorted, shuffled with a seed derived from `seed`, first n. */
export function selectIds(entries, { type, n, seed }) {
  const ids = entries.filter((e) => e.question_type === type).map((e) => e.question_id).sort();
  if (ids.length < n) throw new Error(`only ${ids.length} ${type} questions, asked for ${n}`);
  return shuffled(ids, seedFrom(seed)).slice(0, n);
}

export function pick(entries, ids) {
  const byId = new Map(entries.map((e) => [e.question_id, e]));
  return ids.map((id) => { const e = byId.get(id); if (!e) throw new Error(`question ${id} not in the dataset`); return e; });
}

/** Sessions sorted by date, as the official generation script does (stable for equal dates). */
export function orderedSessions(entry) {
  return entry.haystack_dates
    .map((date, i) => ({ date, id: entry.haystack_session_ids[i], turns: entry.haystack_sessions[i], i }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.i - b.i))
    .map((s, k) => ({ n: k + 1, date: s.date, id: s.id, turns: s.turns }));
}

/** One session as plain text, the "nl" history format of the official script. */
export const sessionText = (session) => session.turns.map((t) => `${t.role}: ${t.content.trim()}`).join('\n\n');

export const FULL_SYSTEM = 'You are a helpful assistant.';

/** The official step-by-step long-context prompt (src/generation/run_generation.py, history format nl, no retrieval). */
export function fullHistoryUser(entry) {
  const history = orderedSessions(entry).map((s) => `\n### Session ${s.n}:\nSession Date: ${s.date}\nSession Content:\n${'\n\n' + sessionText(s)}\n`).join('');
  return `I will give you several history chats between you and a user. Please answer the question based on the relevant chat history. Answer the question step by step: first extract all the relevant information, and then reason over the information to get the answer.\n\n\nHistory Chats:\n\n${history}\n\nCurrent Date: ${entry.question_date}\nQuestion: ${entry.question}\nAnswer (step by step):`;
}
