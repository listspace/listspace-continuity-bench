// The keeper: the model reads one session, then keeps the board current through five tools that map
// to Listspace REST calls. The providers take one system and one user message and have no tool-use
// protocol, so the tools are called through a JSON reply, and the tool results go back in the next
// user message. The loop is bounded by a turn cap and a tool-call cap per session.
import { UUID, ApiError, StagingGuardError } from './api.mjs';
import { renderBoard } from './board.mjs';

export const TOOL_NAMES = ['create_item', 'update_item', 'record_decision', 'move_item', 'read_board'];

export function toolsText(defs) {
  return TOOL_NAMES.map((n) => {
    const t = defs.tools[n];
    const params = t.params.map((p) => `    - ${p.name} (${p.type}${p.required ? ', required' : ''}): ${p.description}`).join('\n');
    return `### ${n}\n${t.description}\n${params ? `  Arguments:\n${params}` : '  Arguments: none.'}`;
  }).join('\n\n');
}

export class ReplyParseError extends Error { constructor(m) { super(m); this.name = 'ReplyParseError'; } }

/** Pulls the first balanced JSON object out of a reply (fences and prose around it are tolerated). */
export function parseReply(text) {
  const s = text.indexOf('{');
  if (s < 0) throw new ReplyParseError('no JSON object in the reply');
  let depth = 0, inStr = false, esc = false;
  for (let i = s; i < text.length; i++) {
    const ch = text[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      let obj;
      try { obj = JSON.parse(text.slice(s, i + 1)); } catch { throw new ReplyParseError('the JSON object did not parse'); }
      if (!Array.isArray(obj.calls) || typeof obj.done !== 'boolean') throw new ReplyParseError('expected {"calls": [...], "done": true|false}');
      return { calls: obj.calls, done: obj.done };
    }
  }
  throw new ReplyParseError('the JSON object was cut off');
}

const str = (v, name, max) => { if (typeof v !== 'string' || !v.trim()) throw new Error(`${name} must be a non-empty string`); return v.slice(0, max); };
const id = (v, name) => { if (typeof v !== 'string' || !UUID.test(v)) throw new Error(`${name} must be an id from the board`); return v; };

/** Maps one tool call to one REST call. Throws a plain Error for bad arguments (reported to the model). */
export async function runTool(api, reader, call) {
  const a = call && typeof call.args === 'object' && call.args ? call.args : {};
  switch (call?.tool) {
    case 'create_item': {
      const body = { list_id: id(a.list_id, 'list_id'), title: str(a.title, 'title', 500) };
      if (a.description !== undefined) body.description = String(a.description).slice(0, 20000);
      return api.post('/items', body);
    }
    case 'update_item': {
      const body = {};
      if (a.title !== undefined) body.title = str(a.title, 'title', 500);
      if (a.description !== undefined) body.description = String(a.description).slice(0, 20000);
      if (a.done !== undefined) body.done = a.done === true;
      if (!Object.keys(body).length) throw new Error('update_item needs a title, description or done');
      return api.patch(`/items/${id(a.item_id, 'item_id')}`, body);
    }
    case 'record_decision': {
      const body = { because: str(a.because, 'because', 1000) };
      if (a.item_id !== undefined) body.item_id = id(a.item_id, 'item_id');
      else { body.list_id = id(a.list_id, 'list_id'); body.title = str(a.title, 'title', 500); }
      if (a.description !== undefined) body.description = String(a.description).slice(0, 20000);
      if (a.claim_key !== undefined) body.claim_key = str(a.claim_key, 'claim_key', 100);
      return api.post('/decisions', body);
    }
    case 'move_item':
      return api.post(`/items/${id(a.item_id, 'item_id')}/move`, { list_id: id(a.list_id, 'list_id') });
    case 'read_board':
      return renderBoard(await reader.read());
    default:
      throw new Error(`unknown tool "${call?.tool}"; the tools are ${TOOL_NAMES.join(', ')}`);
  }
}

const clip = (v, n) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s.length > n ? `${s.slice(0, n)} ...(cut)` : s; };

/**
 * One session. `ask({system, user}) -> { text, usage, cost, stopReason }` is supplied by the runner (it
 * meters the call). Returns { turns, toolCalls, skipped }. A BudgetExceeded or ProviderError from `ask`
 * propagates. A Listspace API error on a tool call is reported to the model and logged, not thrown,
 * except a staging guard error, which stops the run.
 */
export async function keepSession({ ask, api, reader, system, session, total, maxToolCalls, maxTurns, onTurn, onCall }) {
  const board = renderBoard(await reader.read());
  const results = [];
  let toolCalls = 0, skipped = 0, turns = 0, parseFailures = 0;
  const header = `# Session ${session.n} of ${total}, dated ${session.date}\n${session.text}`;
  while (turns < maxTurns) {
    turns++;
    const user = `# Board right now\n${board}\n\n${header}\n${results.length ? `\n# What your tool calls returned so far in this session\n${results.join('\n')}\n` : ''}\n# Your reply\nOne JSON object: {"calls": [...], "done": true|false}. Tool calls left in this session: ${maxToolCalls - toolCalls}.`;
    const r = await ask({ system, user });
    onTurn?.({ turn: turns, usage: r.usage, cost: r.cost, stopReason: r.stopReason, reply: r.text });
    let parsed;
    try { parsed = parseReply(r.text); } catch (e) {
      parseFailures++;
      results.push(`(turn ${turns}) your reply was not usable: ${e.message}. Reply with one JSON object only.`);
      if (parseFailures >= 2) break;
      continue;
    }
    for (const call of parsed.calls) {
      const row = { tool: call?.tool ?? null };
      if (toolCalls >= maxToolCalls) { skipped++; row.ok = false; row.error = 'skipped: tool call cap reached'; onCall?.(row); continue; }
      toolCalls++;
      try {
        const out = await runTool(api, reader, call);
        row.ok = true;
        results.push(`(turn ${turns}) ${call.tool} -> ${clip(out, 700)}`);
      } catch (e) {
        if (e instanceof StagingGuardError) throw e;
        row.ok = false;
        row.error = e instanceof ApiError ? `${e.status} ${e.code}: ${e.message}`.slice(0, 300) : String(e.message).slice(0, 300);
        results.push(`(turn ${turns}) ${call?.tool} failed: ${row.error}`);
      }
      onCall?.(row);
    }
    if (parsed.done || toolCalls >= maxToolCalls) break;
  }
  return { turns, toolCalls, skipped };
}
