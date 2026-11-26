// Regenerates config/tool-defs.json from the Listspace OpenAPI file, so the keeper sees Listspace's own
// tool descriptions (the REST descriptions are the MCP tool descriptions). Usage:
//   node longmemeval/scripts/gen-tools.mjs <path to listspace-app/public/openapi.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const src = process.argv[2];
if (!src) { console.error('usage: gen-tools.mjs <openapi.json>'); process.exit(1); }
const raw = readFileSync(src);
const api = JSON.parse(raw.toString('utf8'));
// Our tool name -> [REST path, method, Listspace tool (operationId)]
const MAP = {
  create_item: ['/items', 'post'],
  update_item: ['/items/{item_id}', 'patch'],
  record_decision: ['/decisions', 'post'],
  move_item: ['/items/{item_id}/move', 'post'],
  read_board: ['/boards/{board_id}', 'get'],
};
const SHOW = { create_item: ['list_id', 'title', 'description'], update_item: ['item_id', 'title', 'description', 'done'], record_decision: ['item_id', 'list_id', 'title', 'description', 'claim_key', 'because'], move_item: ['item_id', 'list_id'], read_board: [] };
const tools = {};
for (const [name, [path, method]] of Object.entries(MAP)) {
  const op = api.paths[path][method];
  const schema = op.requestBody?.content?.['application/json']?.schema;
  const params = [];
  for (const p of SHOW[name]) {
    const s = schema?.properties?.[p] ?? (p === 'item_id' ? { type: 'string', format: 'uuid', description: 'The item id.' } : null);
    if (!s) throw new Error(`${name}: parameter ${p} not in the OpenAPI schema`);
    params.push({ name: p, type: s.type, required: p === 'item_id' ? true : (schema?.required ?? []).includes(p), description: (s.description ?? '').split('. ')[0].slice(0, 220) });
  }
  tools[name] = { operationId: op.operationId, rest: `${method.toUpperCase()} ${path}`, description: op.description.replace(/\s+/g, ' ').trim(), params };
}
const out = { generated_from: 'listspace-app/public/openapi.json', openapi_sha256: createHash('sha256').update(raw).digest('hex'), tools };
const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'config', 'tool-defs.json');
writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
console.log('wrote', dest, Object.values(tools).reduce((n, t) => n + t.description.length, 0), 'description chars');
