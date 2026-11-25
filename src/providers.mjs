// Provider calls over plain fetch. No SDK, no retries (a retry changes conditions mid-run).
// Keys are read from the environment at call time, sent in a header, and never logged,
// returned or written. Errors carry the status and the provider's error message only.
//
// ask({ model, system, user, maxOutputTokens, effort, temperature? })
//   -> { text, stopReason, usage: { input, cacheRead, cacheWrite, output } }
// usage.input excludes cached tokens, so cost = sum of the four counts times their prices.

export class ProviderError extends Error {
  constructor(provider, status, detail) {
    super(`${provider} call failed${status ? ` (HTTP ${status})` : ''}: ${detail}`);
    this.name = 'ProviderError';
    this.status = status;
  }
}

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const OPENAI_URL = 'https://api.openai.com/v1/responses';

const count = (provider, v, name) => {
  if (!Number.isInteger(v) || v < 0) throw new ProviderError(provider, null, `usage.${name} missing or not a count, so the call cannot be metered`);
  return v;
};

async function post(provider, fetchImpl, url, headers, body) {
  let res;
  try {
    res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  } catch (e) {
    throw new ProviderError(provider, null, `network error: ${e instanceof Error ? e.message : 'unknown'}`);
  }
  const raw = await res.text();
  let json;
  try { json = JSON.parse(raw); } catch { json = null; }
  if (!res.ok) {
    const msg = json?.error?.message ?? raw.slice(0, 300);
    // Some providers echo a masked key in 401 messages. Never let key-shaped text reach a log.
    throw new ProviderError(provider, res.status, String(msg).replace(/sk-[A-Za-z0-9_*.-]+/g, '[redacted]').slice(0, 500));
  }
  if (json === null) throw new ProviderError(provider, res.status, 'response was not JSON');
  return json;
}

function requireKey(env, name, provider) {
  const key = env[name];
  if (!key) throw new ProviderError(provider, null, `${name} is not set in the environment`);
  return key;
}

/** Anthropic Messages API. Temperature is sent only when the request carries one. */
export function anthropicProvider({ env = process.env, fetchImpl = fetch } = {}) {
  return {
    name: 'anthropic',
    async ask({ model, system, user, maxOutputTokens, effort, temperature }) {
      const body = {
        model,
        max_tokens: maxOutputTokens,
        system,
        messages: [{ role: 'user', content: user }],
        output_config: { effort },
        ...(temperature === undefined ? {} : { temperature }),
      };
      const headers = { 'x-api-key': requireKey(env, 'ANTHROPIC_API_KEY', 'anthropic'), 'anthropic-version': ANTHROPIC_VERSION };
      const j = await post('anthropic', fetchImpl, ANTHROPIC_URL, headers, body);
      const u = j.usage ?? {};
      const text = (j.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
      return {
        text,
        stopReason: j.stop_reason ?? 'unknown',
        usage: {
          input: count('anthropic', u.input_tokens, 'input_tokens'),
          cacheRead: count('anthropic', u.cache_read_input_tokens ?? 0, 'cache_read_input_tokens'),
          cacheWrite: count('anthropic', u.cache_creation_input_tokens ?? 0, 'cache_creation_input_tokens'),
          output: count('anthropic', u.output_tokens, 'output_tokens'),
        },
      };
    },
  };
}

/** OpenAI Responses API. Reasoning tokens are billed as output and included in usage.output_tokens. */
export function openaiProvider({ env = process.env, fetchImpl = fetch } = {}) {
  return {
    name: 'openai',
    async ask({ model, system, user, maxOutputTokens, effort, temperature }) {
      const body = {
        model,
        instructions: system,
        input: user,
        max_output_tokens: maxOutputTokens,
        reasoning: { effort },
        store: false,
        ...(temperature === undefined ? {} : { temperature }),
      };
      const headers = { authorization: `Bearer ${requireKey(env, 'OPENAI_API_KEY', 'openai')}` };
      const j = await post('openai', fetchImpl, OPENAI_URL, headers, body);
      const u = j.usage ?? {};
      const total = count('openai', u.input_tokens, 'input_tokens');
      const cached = count('openai', u.input_tokens_details?.cached_tokens ?? 0, 'input_tokens_details.cached_tokens');
      const text = (j.output ?? [])
        .filter((item) => item.type === 'message')
        .flatMap((item) => item.content ?? [])
        .filter((c) => c.type === 'output_text')
        .map((c) => c.text)
        .join('');
      return {
        text,
        stopReason: j.status === 'incomplete' ? `incomplete:${j.incomplete_details?.reason ?? 'unknown'}` : (j.status ?? 'unknown'),
        usage: { input: total - cached, cacheRead: cached, cacheWrite: 0, output: count('openai', u.output_tokens, 'output_tokens') },
      };
    },
  };
}

export const providerFactories = { anthropic: anthropicProvider, openai: openaiProvider };
export const KEY_ENV = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY' };
