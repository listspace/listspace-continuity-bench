// Listspace REST client, staging only. The guard runs when the client is built and again on every
// request, redirects are never followed (so the token cannot travel to another host), and the token
// is read from LISTSPACE_STAGING_TOKEN at call time, sent in a header and never logged or returned.
export const STAGING_API_BASE = 'https://staging-backend.listspace.app/functions/v1/api/v1';
const STAGING_ORIGIN = 'https://staging-backend.listspace.app';
const STAGING_PREFIX = '/functions/v1/api/v1';
export const TOKEN_ENV = 'LISTSPACE_STAGING_TOKEN';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class StagingGuardError extends Error { constructor(m) { super(m); this.name = 'StagingGuardError'; } }
export class ApiError extends Error {
  constructor(status, code, detail) { super(`Listspace API ${status}${code ? ` ${code}` : ''}: ${detail}`); this.name = 'ApiError'; this.status = status; this.code = code; }
}

/** Throws unless `base` is exactly the staging API. Production (api.listspace.app) and every other host are refused. */
export function assertStagingBase(base) {
  let u;
  try { u = new URL(base); } catch { throw new StagingGuardError(`refusing "${base}": not a URL`); }
  if (u.protocol !== 'https:' || u.origin !== STAGING_ORIGIN || u.username || u.password || u.port) throw new StagingGuardError(`refusing ${u.origin}: this harness only talks to ${STAGING_ORIGIN}`);
  if (u.pathname.replace(/\/$/, '') !== STAGING_PREFIX || u.search || u.hash) throw new StagingGuardError(`refusing path ${u.pathname}: expected ${STAGING_PREFIX}`);
  return STAGING_API_BASE;
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createApi({ base = STAGING_API_BASE, env = process.env, fetchImpl = fetch, sleep = defaultSleep, now = Date.now, minIntervalMs = 650 } = {}) {
  assertStagingBase(base);
  const root = base.replace(/\/$/, '');
  let last = 0;
  async function request(method, path, { query, body } = {}) {
    if (typeof path !== 'string' || !path.startsWith('/') || path.includes('..') || path.includes('//') || path.includes('?') || path.includes('#') || path.includes('\\')) throw new StagingGuardError(`refusing request path "${path}"`);
    const url = new URL(root + path);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, String(v));
    if (url.origin !== STAGING_ORIGIN || !url.pathname.startsWith(STAGING_PREFIX + '/')) throw new StagingGuardError(`refusing ${url.origin}${url.pathname}`);
    const token = env[TOKEN_ENV];
    if (!token) throw new ApiError(0, 'no_token', `${TOKEN_ENV} is not set in the environment`);
    // Stay under the 120 requests a minute limit of one token (about 92 a minute here).
    const wait = last + minIntervalMs - now();
    if (wait > 0) await sleep(wait);
    last = now();
    let res;
    try {
      res = await fetchImpl(url.toString(), { method, redirect: 'manual', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) { throw new ApiError(0, 'network', e instanceof Error ? e.message : 'unknown'); }
    const raw = await res.text();
    let json = null;
    try { json = JSON.parse(raw); } catch { /* handled below */ }
    if (res.status >= 300 && res.status < 400) throw new ApiError(res.status, 'redirect', 'redirects are not followed');
    if (!res.ok) {
      const msg = String(json?.error?.message ?? json?.message ?? raw.slice(0, 300)).split(token).join('[redacted]');
      throw new ApiError(res.status, json?.error?.code ?? '', msg.slice(0, 500));
    }
    if (json === null || typeof json !== 'object') throw new ApiError(res.status, 'bad_response', 'response was not JSON');
    return json.data ?? json;
  }
  return {
    base: root,
    get: (path, query) => request('GET', path, { query }),
    post: (path, body) => request('POST', path, { body: body ?? {} }),
    patch: (path, body) => request('PATCH', path, { body: body ?? {} }),
  };
}
