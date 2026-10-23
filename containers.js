// Qué trae cada contenedor (bolsas, cofres, sacos, cajas de elección…).
// - Contenido: gw2treasures.com (lista de items, cantidad y si es garantizado, posible o a elegir).
// - Promedio por apertura: páginas de investigación de la wiki ("<Nombre>/Drop rate"), medidas por jugadores.
import { state } from './store.js';
import { normalize } from './analysis.js';
import { WIKI_BASE } from './gw2api.js';
import { findByNameEn } from './catalog.js';

const TTL = 7 * 24 * 60 * 60_000;
const mem = new Map();
let SNAP = null; // copia incluida en el sitio (src/containers.json)
let disk = null; // { read(id), write(id, data) } — sólo en la versión local

export function setContainersSnapshot(data) { SNAP = data?.containers ? data : null; }
export function setContainersDisk(d) { disk = d; }
export function snapshotIds() { return Object.keys(SNAP?.containers || {}).map(Number); }

const KIND = { Guaranteed: 'garantizado', Chance: 'posible', Choice: 'a elegir', Rare: 'raro', SuperRare: 'muy raro' };
const iconUrl = (ic) => (ic?.signature && ic?.id ? `https://render.guildwars2.com/file/${ic.signature}/${ic.id}.png` : null);

/** Saca el arreglo JSON que empieza en `key` (cuenta corchetes respetando strings). */
function extractArray(text, key) {
  const i = text.indexOf(key);
  if (i < 0) return null;
  const start = text.indexOf('[', i);
  let depth = 0, inStr = false, esc = false;
  for (let j = start; j < text.length; j++) {
    const ch = text[j];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '[') depth++;
    else if (ch === ']') { depth--; if (depth === 0) { try { return JSON.parse(text.slice(start, j + 1)); } catch { return null; } } }
  }
  return null;
}

/** Contenido según gw2treasures (la página trae los datos embebidos). */
async function fromTreasures(id) {
  const r = await fetch(`https://es.gw2treasures.com/item/${id}`, { headers: { 'User-Agent': 'Mozilla/5.0 (gw2-bazar local)', 'Accept-Language': 'es' }, signal: AbortSignal.timeout(25000) });
  if (!r.ok) return { ok: false, status: r.status };
  const html = (await r.text()).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  const list = extractArray(html, '"contents":[{"containerItemId"') || [];
  const cur = extractArray(html, '"currencyContents":[{') || [];
  const items = list.filter((c) => c.containerItemId === id).map((c) => ({
    id: c.contentItemId,
    qty: c.quantity || 1,
    kind: c.chance || 'Chance',
    name: c.contentItem?.name_es || c.contentItem?.name_en || `Item ${c.contentItemId}`,
    nameEn: c.contentItem?.name_en || '',
    rarity: c.contentItem?.rarity || '',
    type: c.contentItem?.type || '',
    icon: iconUrl(c.contentItem?.icon),
  }));
  const currencies = cur.map((c) => ({ id: c.currencyId, min: c.min ?? c.quantity ?? null, max: c.max ?? null, name: c.currency?.name_es || c.currency?.name_en || '' }));
  return { ok: true, items, currencies };
}

/** Promedios por apertura de la wiki: tabla "Item | Total count | Average per bag". */
function parseDropRate(html) {
  const tables = html.split(/<table/i).slice(1);
  for (const t of tables) {
    const body = t.split(/<\/table>/i)[0];
    const rows = body.split(/<tr/i).slice(1).map((r) => r.split(/<t[dh][^>]*>/i).slice(1).map((c) => c.replace(/<[^>]+>/g, ' ').replace(/&#160;|&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()));
    if (!rows.length || !/average per/i.test(rows[0].join(' '))) continue;
    let opened = null;
    const avg = [];
    for (const r of rows.slice(1)) {
      if (r.length < 2) continue;
      if (/opened/i.test(r[0])) { opened = Number(String(r[1]).replace(/[^\d]/g, '')) || opened; continue; }
      const a = Number(String(r[2] ?? '').replace(',', '.').replace(/[^\d.]/g, ''));
      if (r[0] && Number.isFinite(a) && r[2]) avg.push([r[0], a, Number(String(r[1]).replace(/[^\d]/g, '')) || null]);
    }
    if (avg.length) return { opened, avg };
  }
  return null;
}
async function fromWikiDropRate(nameEn) {
  if (!nameEn) return null;
  const titles = [`${nameEn}/Drop rate`, `${nameEn}/drop rate`];
  for (const t of titles) {
    // Wiki en vivo (API de MediaWiki) y, si no responde, la copia archivada.
    try {
      const q = new URLSearchParams({ action: 'parse', page: t, prop: 'text', redirects: '1', format: 'json', formatversion: '2' });
      const r = await fetch(`${WIKI_BASE}/api.php?${q}`, { signal: AbortSignal.timeout(12000) });
      const j = await r.json();
      if (j?.parse?.text) { const d = parseDropRate(j.parse.text); if (d) return { ...d, source: 'wiki', page: t }; }
      if (j?.error) continue;
    } catch { /* wiki caída: probamos el archivo */ }
    try {
      const p = encodeURIComponent(t.replace(/ /g, '_')).replace(/%2F/g, '/');
      const r = await fetch(`https://web.archive.org/web/2026id_/${WIKI_BASE}/wiki/${p}`, { signal: AbortSignal.timeout(20000) });
      if (r.ok) { const d = parseDropRate(await r.text()); if (d) return { ...d, source: 'archivo', page: t }; }
    } catch { /* sin datos */ }
  }
  return null;
}

/** Junta contenido + promedios (sin precios: se agregan al responder). */
export async function fetchContainer(id, nameEn) {
  const [t, dr] = await Promise.all([fromTreasures(id).catch((e) => ({ ok: false, error: e.message })), fromWikiDropRate(nameEn).catch(() => null)]);
  const out = { id, at: Date.now(), items: t.ok ? t.items : [], currencies: t.ok ? t.currencies : [], contentsSource: t.ok ? 'gw2treasures' : null, dropRate: null };
  if (dr) {
    const byName = new Map(out.items.map((c) => [normalize(c.nameEn), c]));
    const extra = [];
    for (const [name, avg, total] of dr.avg) {
      const c = byName.get(normalize(name));
      if (c) { c.avg = avg; continue; }
      // Lo que la wiki midió pero gw2treasures no lista: lo buscamos en el catálogo por su nombre en inglés.
      const f = findByNameEn(name);
      if (f && f.id !== id) out.items.push({ id: f.id, qty: 1, kind: 'Chance', name: f.name, nameEn: f.nameEn, rarity: f.rarity, type: f.type, icon: state.items.get(f.id)?.icon || null, avg, measuredOnly: true });
      else if (!f) extra.push({ nameEn: name, avg, total });
    }
    out.dropRate = { opened: dr.opened, source: dr.source, page: dr.page, unmatched: extra.slice(0, 60) };
  }
  return out;
}

/** Contenido de un contenedor: memoria → disco → copia del sitio → (versión local) gw2treasures + wiki. */
export async function containerContents(id, { live = true, force = false } = {}) {
  let d = null;
  if (!force) {
    d = mem.get(id);
    if (!d && disk) d = disk.read(id);
    if (d && Date.now() - d.at > TTL && live) d = null;
  }
  if (!d && !force && SNAP?.containers?.[id]) d = { ...SNAP.containers[id], fromSnapshot: true };
  if ((!d || force) && live) {
    const it = state.items.get(id);
    d = await fetchContainer(id, it?.nameEn);
    if (disk) disk.write(id, d);
  }
  if (!d) return { id, available: false };
  mem.set(id, d);
  // Precio actual de cada cosa y valor promedio por apertura.
  let ev = 0, evKnown = false;
  const items = d.items.map((c) => {
    const p = state.prices.get(c.id);
    const sell = p?.sell || 0, buy = p?.buy || 0;
    if (c.avg != null && (buy || sell)) { ev += c.avg * (buy || sell); evKnown = true; }
    return { ...c, kindEs: KIND[c.kind] || c.kind, sell, buy };
  });
  return { ...d, items, available: items.length > 0 || (d.dropRate?.unmatched?.length || 0) > 0, expectedValue: evKnown ? Math.round(ev) : null };
}
