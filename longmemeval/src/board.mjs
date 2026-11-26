// One throwaway board per question: create, read (with item bodies), render, archive.
import { UUID } from './api.mjs';

export const BOARD_LISTS = [
  { title: 'About the user', kind: 'info' },
  { title: 'To do', kind: 'todo' },
  { title: 'Done', kind: 'done' },
];

export async function createBoard(api, { title, description }) {
  const b = await api.post('/boards', { title, description, lists: BOARD_LISTS });
  if (!UUID.test(b?.id ?? '')) throw new Error('create board returned no board id');
  return b.id;
}

export const archiveBoard = (api, boardId) => api.post(`/boards/${boardId}/archive`, { archived: true });

const text = (v) => (typeof v === 'string' ? v : '');

/**
 * Reads a board through the API. GET /boards/{id} lists items without their text, so each item's body
 * comes from GET /items/{id}. Bodies are cached by (id, updated_at): only items that changed since the
 * last read cost a request, which keeps a 45-session run under the rate limit.
 */
export class BoardReader {
  constructor(api, boardId) { this.api = api; this.boardId = boardId; this.cache = new Map(); }
  async read() {
    const board = await this.api.get(`/boards/${this.boardId}`);
    const lists = [];
    for (const l of board.lists ?? []) {
      const cards = [];
      for (const c of l.cards ?? []) {
        if (c.archived) continue;
        let hit = this.cache.get(c.id);
        if (!hit || hit.updated_at !== c.updated_at) {
          const full = await this.api.get(`/items/${c.id}`);
          hit = { updated_at: c.updated_at, description: text(full.description) };
          this.cache.set(c.id, hit);
        }
        cards.push({ id: c.id, title: c.title, done: !!c.done, description: hit.description });
      }
      lists.push({ id: l.id, title: l.title, kind: l.kind ?? null, cards });
    }
    return { id: board.id, title: board.title, lists, decisions: board.decisions ?? null };
  }
  /** The decisions and the Inbox, as start_session reports them (full detail). */
  async session() {
    const s = await this.api.get(`/boards/${this.boardId}/session`, { detail: 'full' });
    return { decisions: s.decisions ?? null, inbox: s.inbox ?? null };
  }
}

export function renderBoard(model, extra = null) {
  const out = [`# Board: ${model.title}`];
  for (const l of model.lists) {
    out.push(`\n## List: ${l.title} (id ${l.id}${l.kind ? `, ${l.kind}` : ''})`);
    if (!l.cards.length) out.push('(empty)');
    for (const c of l.cards) {
      out.push(`- [${c.done ? 'x' : ' '}] ${c.title} (item id ${c.id})`);
      if (c.description.trim()) out.push(c.description.trim().split('\n').map((x) => `    ${x}`).join('\n'));
    }
  }
  const dec = extra?.decisions ?? model.decisions;
  if (dec) out.push(`\n## Decisions on the board (Confirmed = settled, Proposed = recorded but not confirmed by the user)\n${JSON.stringify(dec)}`);
  if (extra?.inbox?.pending_decisions?.length) out.push(`\n## Decision proposals waiting in the Inbox\n${JSON.stringify(extra.inbox.pending_decisions)}`);
  return out.join('\n');
}
