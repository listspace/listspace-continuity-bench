// Price table loader. The runner refuses to run a model whose price is missing or unsourced,
// because the spend meter is only as good as the prices behind it.
import { readFileSync } from 'node:fs';

export const PROVIDERS = ['anthropic', 'openai'];

const isMoney = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

export function loadPrices(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Returns the verified price entry or throws. `cache_write_per_mtok` may be null (the provider reports no cache writes). */
export function priceFor(table, model) {
  const p = table?.models?.[model];
  const refuse = (why) => { throw new Error(`refusing to run ${model}: ${why}`); };
  if (!p) return refuse('no entry in the price table');
  if (!PROVIDERS.includes(p.provider)) refuse(`unknown provider "${p.provider}"`);
  for (const k of ['input_per_mtok', 'output_per_mtok', 'cache_read_per_mtok']) if (!isMoney(p[k])) refuse(`price field ${k} is not a verified number`);
  if (p.cache_write_per_mtok !== null && !isMoney(p.cache_write_per_mtok)) refuse('price field cache_write_per_mtok must be a number or null');
  if (!Number.isInteger(p.max_prompt_tokens) || p.max_prompt_tokens <= 0) refuse('max_prompt_tokens is not set');
  if (typeof p.source_url !== 'string' || !p.source_url.startsWith('https://')) refuse('no source_url for the price');
  if (typeof p.verified_on !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.verified_on)) refuse('no verified_on date for the price');
  return p;
}
