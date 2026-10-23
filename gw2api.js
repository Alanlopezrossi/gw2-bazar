// Versión navegador de src/gw2api.js. Sin headers custom (evita preflight CORS):
// la versión de esquema va como parámetro ?v=.

export const GW2_BASE = globalThis.GW2_API_BASE || 'https://api.guildwars2.com';
export const DW2_BASE = globalThis.DW2_BASE || 'https://api.datawars2.ie';
export const WIKI_BASE = globalThis.WIKI_BASE || 'https://wiki.guildwars2.com';
const SCHEMA = '2022-03-23T19:00:00.000Z';

const RATE = 10;
let nextSlot = 0;
async function takeSlot() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + 1000 / RATE;
  if (wait) await sleep(wait);
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function withSchema(url) {
  if (!url.startsWith(GW2_BASE)) return url;
  return url + (url.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(SCHEMA);
}

export async function getJSON(url, { retries = 4, limited = true, timeout = 45000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (limited) await takeSlot();
    try {
      const res = await fetch(withSchema(url), { signal: AbortSignal.timeout(timeout) });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new ApiError(`HTTP ${res.status}`, res.status);
        await sleep(1500 * (attempt + 1) ** 2);
        continue;
      }
      const text = await res.text();
      let data;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      if (!res.ok && res.status !== 206) throw new ApiError((data && data.text) || `HTTP ${res.status}`, res.status, data);
      return { data, headers: res.headers, status: res.status };
    } catch (e) {
      if (e instanceof ApiError && e.status && e.status < 500 && e.status !== 429) throw e;
      lastErr = e;
      await sleep(1000 * (attempt + 1) ** 2);
    }
  }
  throw lastErr;
}

export async function pool(items, concurrency, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }));
  return out;
}

export function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function getByIds(path, ids, { lang, concurrency = 6, onProgress } = {}) {
  const parts = chunk(ids, 200);
  let done = 0;
  const results = await pool(parts, concurrency, async (part) => {
    const q = new URLSearchParams({ ids: part.join(',') });
    if (lang) q.set('lang', lang);
    try {
      const { data } = await getJSON(`${GW2_BASE}/v2/${path}?${q}`);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      if (e.status === 404) return [];
      throw e;
    } finally {
      done++;
      onProgress && onProgress(done, parts.length);
    }
  });
  return results.flat();
}

export async function getAllPages(path, { concurrency = 6, onProgress } = {}) {
  const first = await getJSON(`${GW2_BASE}/v2/${path}?page=0&page_size=200`);
  // X-Page-Total puede no ser legible por CORS: si falta, pedimos páginas hasta la primera inexistente.
  let total = Number(first.headers.get('x-page-total') || 0);
  if (!total) {
    const rt = Number(first.headers.get('x-result-total') || 0);
    total = rt ? Math.ceil(rt / 200) : 0;
  }
  const known = total > 0;
  const max = known ? total : 400;
  let end = max;
  const pages = Array.from({ length: max - 1 }, (_, i) => i + 1);
  let done = 1;
  onProgress && onProgress(done, known ? total : 140);
  const rest = await pool(pages, concurrency, async (p) => {
    if (p >= end) return [];
    try {
      const { data } = await getJSON(`${GW2_BASE}/v2/${path}?page=${p}&page_size=200`, { retries: 2 });
      if (!Array.isArray(data) || !data.length) { end = Math.min(end, p); return []; }
      return data;
    } catch (e) {
      if (e.status === 400 || e.status === 404) { end = Math.min(end, p); return []; }
      throw e;
    } finally {
      done++;
      onProgress && onProgress(Math.min(done, end), known ? total : Math.max(end === max ? 140 : end, done));
    }
  });
  return [first.data, ...rest].flat();
}

/** Consulta autenticada con la API key del visitante (se manda sólo a api.guildwars2.com). */
export async function getAuthed(path, apiKey) {
  const sep = path.includes('?') ? '&' : '?';
  const { data } = await getJSON(`${GW2_BASE}/v2/${path}${sep}access_token=${encodeURIComponent(apiKey)}`, { retries: 2, limited: false });
  return data;
}
