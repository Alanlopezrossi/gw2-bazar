// Guía de un logro según la wiki oficial (objetivos, ubicaciones, notas).
// Primero la wiki en vivo; si está caída, la copia archivada en archive.org.
// Devuelve el HTML de la página ya saneado; el navegador lo limpia (infobox, navbox) y arma los enlaces al mapa.
import { getJSON, WIKI_BASE } from './gw2api.js';
import { sanitize } from './wiki.js';

const mem = new Map();
const TTL = 24 * 60 * 60_000;
let downUntil = 0;

const pageUrl = (t) => `${WIKI_BASE}/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}`;

async function live(title) {
  const q = new URLSearchParams({ action: 'parse', page: title, prop: 'text', redirects: '1', disableeditsection: '1', format: 'json', formatversion: '2', origin: '*' });
  const { data } = await getJSON(`${WIKI_BASE}/api.php?${q}`, { limited: false, retries: 1, timeout: 20000 });
  if (!data || typeof data !== 'object') throw new Error('la wiki no devolvió JSON');
  if (data.error) return { found: false };
  return { found: true, title: data.parse?.title || title, html: data.parse?.text || '' };
}

async function archived(title) {
  const p = encodeURIComponent(title.replace(/ /g, '_')).replace(/%2F/g, '/');
  for (const y of ['2026', '2025']) {
    try {
      const r = await fetch(`https://web.archive.org/web/${y}id_/${WIKI_BASE}/wiki/${p}`, { signal: AbortSignal.timeout(25000) });
      if (!r.ok) continue;
      const html = await r.text();
      const i = html.indexOf('<div class="mw-parser-output"');
      if (i < 0) continue;
      const end = html.search(/<div class="printfooter|<div id="catlinks"/);
      return { found: true, title, html: html.slice(i, end > i ? end : undefined) };
    } catch { /* año anterior */ }
  }
  return null;
}

async function getPage(title) {
  const c = mem.get(title);
  if (c && Date.now() - c.at < TTL) return c;
  let out = null;
  if (Date.now() > downUntil) {
    try {
      const r = await live(title);
      out = r.found ? { found: true, source: 'wiki', title: r.title, html: r.html } : { found: false, source: 'wiki' };
    } catch {
      downUntil = Date.now() + 10 * 60_000;
    }
  }
  if (!out) {
    const a = await archived(title).catch(() => null);
    out = a ? { found: true, source: 'archivo', title: a.title, html: a.html } : { found: false, source: 'archivo' };
  }
  out.at = Date.now();
  mem.set(title, out);
  return out;
}

/**
 * Guía de un logro. title = nombre en inglés; id = id del logro; cat = nombre en inglés de su categoría.
 * En la wiki, muchos logros no tienen página propia: están como filas (data-id="achievement<ID>")
 * en la página de su categoría ("<Categoría> (achievements)"). Probamos en ese orden.
 */
export async function achievementGuide(title, { id = 0, cat = '' } = {}) {
  title = String(title || '').trim();
  if (!title) return { available: false, reason: 'Falta el nombre del logro.' };
  const tries = [{ t: title, kind: 'page' }];
  if (cat) tries.push({ t: `${cat} (achievements)`, kind: 'category' }, { t: cat, kind: 'category' });
  for (const { t, kind } of tries) {
    const p = await getPage(t);
    if (!p.found) continue;
    // En una página de categoría, sólo sirve si trae la fila de este logro.
    if (kind === 'category' && id && !p.html.includes(`achievement${id}"`)) continue;
    return { available: true, source: p.source, kind, achId: id, title: p.title, url: pageUrl(p.title) + (kind === 'category' && id ? `#achievement${id}` : ''), html: sanitize(p.html) };
  }
  return { available: false, reason: Date.now() < downUntil ? 'La wiki no responde ahora y no hay copia archivada con este logro.' : 'La wiki no tiene una guía para este logro.', url: pageUrl(title) };
}
