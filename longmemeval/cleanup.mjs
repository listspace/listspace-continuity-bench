#!/usr/bin/env node
// Archives every board a run made (boards.jsonl in the run folder). Staging only. Boards are archived,
// never deleted (the API has no delete for boards).
//   node longmemeval/cleanup.mjs --run <run folder> [--dry-run]
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createApi, ApiError } from './src/api.mjs';
import { archiveBoard } from './src/board.mjs';

const a = process.argv.slice(2);
const flag = (n) => { const i = a.indexOf(`--${n}`); return i < 0 ? undefined : a[i + 1]; };
const dry = a.includes('--dry-run');
const run = flag('run');
if (!run) { console.error('usage: node longmemeval/cleanup.mjs --run <run folder> [--dry-run]'); process.exit(1); }
const file = join(resolve(run), 'boards.jsonl');
if (!existsSync(file)) { console.error(`no boards.jsonl in ${run}: nothing to clean`); process.exit(1); }
const boards = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
let ok = 0, failed = 0;
const api = dry ? null : createApi(); // builds only against the staging API; refuses anything else
for (const b of boards) {
  if (dry) { console.log(`would archive ${b.board_id} (${b.model}, ${b.question})`); continue; }
  try { await archiveBoard(api, b.board_id); ok++; console.log(`archived ${b.board_id}`); } catch (e) {
    failed++; console.error(`failed ${b.board_id}: ${e instanceof ApiError ? e.message : 'error'}`);
  }
}
if (!dry) console.log(`${ok} archived, ${failed} failed, of ${boards.length}`);
process.exit(failed ? 2 : 0);
