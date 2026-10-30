// Catálogo completo de items del juego (pestaña "Items") + qué logros usan o dan cada item.
// Datos: src/items-index.json y src/ach-items.json (los genera builders.js → buildCatalog).
import { state } from './store.js';
import { normalize } from './analysis.js';
import { wikiEntry } from './wikidata.js';

let IDX = null; // { rows: [[id, es, en, type, sub, rarity, level]], hay: [string], byId: Map }
let ACH = null; // { achievements: {id: [name, cat, isCollection]}, items: {itemId: [[achId, 'r'|'p']]} }

export function setCatalog(data) {
  if (!data?.rows) { IDX = null; return; }
  base = data;
  // Sumamos los items extra (fuera de la API) que no estén ya en el índice.
  const have = new Set(data.rows.map((r) => r[0]));
  const extraRows = Object.keys(EXTRA?.items || {}).map(Number).filter((id) => !have.has(id)).map((id) => { const e = extraItem(id); return [id, e.name, e.nameEn, e.type, e.sub, e.rarity, e.level]; });
  data = { ...data, rows: [...data.rows, ...extraRows].map((r) => {
    if (r[1] || !EXTRA?.items?.[r[0]]) return r;
    const e = extraItem(r[0]);
    return [r[0], e.name, r[2] || e.nameEn, r[3], r[4], r[5], r[6]];
  }) };
  for (const r of data.rows) { r[1] = String(r[1] || '').trim(); r[2] = String(r[2] || '').trim(); }
  byEnName = null;
  IDX = { at: data.at, rows: data.rows, hay: data.rows.map((r) => normalize(`${r[1]} ${r[2]}`)), byId: new Map(data.rows.map((r, i) => [r[0], i])) };
}
// Items que la API oficial no publica (quitados del juego o sin redescubrir), sacados de gw2treasures.
let EXTRA = null; // { items: { id: { es, en, type, sub, typeEs, rarity, level, icon, desc, removed } } }
let base = null; // índice original, para poder volver a mezclar
const TYPE_ALIAS_ES = { 'material artesanal': 'CraftingMaterial', 'objeto para espalda': 'Back' };
export function setExtraItems(data) {
  EXTRA = data?.items ? data : null;
  if (EXTRA) {
    // Fuera: ids que tampoco conoce gw2treasures ("Item not found"). Tipos con otra traducción.
    const items = {};
    for (const [id, e] of Object.entries(EXTRA.items)) {
      if (!e || /^item not found$/i.test(e.es || '') || /^item not found$/i.test(e.en || '')) continue;
      items[id] = e.type ? e : { ...e, type: TYPE_ALIAS_ES[String(e.typeEs || '').toLowerCase()] || '' };
    }
    EXTRA = { ...EXTRA, items };
  }
  if (base) setCatalog(base);
}
export function extraItem(id) {
  const e = EXTRA?.items?.[id];
  if (!e) return null;
  const unnamed = (n) => !n || /^\[&/.test(n);
  const name = !unnamed(e.es) ? e.es : !unnamed(e.en) ? e.en : `(sin nombre) ${e.subEs || e.typeEs || ''}`.trim();
  return { id: Number(id), name, nameEn: unnamed(e.en) ? '' : e.en, type: e.type || '', sub: e.sub || '', rarity: e.rarity || '', level: e.level || 0, icon: e.icon || null, desc: /Database and tool collection/.test(e.desc || '') ? '' : e.desc || '', vendor: 0, flags: [], gameTypes: [], removed: e.removed !== false, typeEs: e.typeEs || '' };
}

export function setAchItems(data) {
  ACH = data?.items ? data : null;
}
export function achAll() { return Object.entries(ACH?.achievements || {}).map(([id, a]) => ({ id: Number(id), name: a[0] || '', category: a[1] || '', type: a[2] ? 'ItemSet' : 'Default' })); }
export function achName(id) { return ACH?.achievements?.[id]?.[0] || `Logro ${id}`; }
export function catalogMeta() {
  return IDX ? { at: IDX.at, count: IDX.rows.length } : null;
}

/** Logros que dan este item (role 'r') o lo piden como parte de una colección (role 'p'). */
export function achievementsOfItem(id) {
  const l = ACH?.items?.[id];
  if (!l) return [];
  return l.map(([aid, role]) => {
    const a = ACH.achievements[aid] || [];
    return { id: aid, name: a[0] || `Logro ${aid}`, category: a[1] || '', type: a[2] ? 'ItemSet' : 'Default', role: role === 'r' ? 'recompensa' : 'parte' };
  });
}

/** Item mínimo a partir del índice (para ítems que todavía no están en el catálogo descargado). */
export function indexItem(id) {
  const ex = extraItem(id);
  if (ex) return ex;
  const i = IDX?.byId.get(id);
  if (i == null) return null;
  const r = IDX.rows[i];
  return { id: r[0], name: r[1] || r[2], nameEn: r[2], type: r[3], sub: r[4], rarity: r[5], level: r[6] };
}

/** [&AgH1WQAA] → id del item (código de chat del juego). */
function chatToId(q) {
  const m = q.match(/\[&([A-Za-z0-9+/=]+)\]/);
  if (!m) return null;
  try {
    const b = typeof atob === 'function' ? atob(m[1]) : Buffer.from(m[1], 'base64').toString('binary');
    if (b.charCodeAt(0) !== 2) return null;
    return b.charCodeAt(2) | (b.charCodeAt(3) << 8) | (b.charCodeAt(4) << 16);
  } catch { return null; }
}

function tags(id) {
  const t = [];
  const p = state.prices.get(id);
  if (p && (p.sell || p.buy)) t.push('bazar');
  const recs = state.byOutput.get(id) || [];
  if (recs.some((r) => r.id > 0)) t.push('crafteo');
  if (recs.some((r) => r.id < 0)) t.push('forja');
  const a = ACH?.items?.[id];
  if (a?.some((x) => x[1] === 'r')) t.push('logro');
  const w = wikiEntry(id);
  if (w?.soldBy?.length) t.push('vendedor');
  if (w?.containedIn?.length) t.push('contenedor');
  if ((state.byInput.get(id) || []).length) t.push('ingrediente');
  if (a?.some((x) => x[1] === 'p')) t.push('colección');
  return t;
}

const RARITY_RANK = { Junk: 0, Basic: 1, Fine: 2, Masterwork: 3, Rare: 4, Exotic: 5, Ascended: 6, Legendary: 7 };
const SORTS = {
  name: (r) => r.name,
  type: (r) => `${r.type} ${r.sub || ''}`,
  rarity: (r) => RARITY_RANK[r.rarity] ?? null,
  level: (r) => r.level,
  sell: (r) => r.sell || null,
  sources: (r) => r.sources.length || null,
};

export function searchCatalog({ q = '', type = '', rarity = '', source = '', sort = '', dir = 'asc', page = 1, limit = 50 } = {}) {
  if (!IDX) return { ready: false, total: 0, rows: [], page, limit };
  const qq = String(q || '').trim();
  let hits = [];
  const chatId = chatToId(qq);
  const numId = /^\d+$/.test(qq) ? Number(qq) : null;
  const words = normalize(qq).split(/\s+/).filter(Boolean);
  const exactIds = new Set([chatId, numId].filter(Boolean));
  for (let i = 0; i < IDX.rows.length; i++) {
    const r = IDX.rows[i];
    if (type && r[3] !== type) continue;
    if (rarity && r[5] !== rarity) continue;
    if (exactIds.size) { if (!exactIds.has(r[0])) continue; }
    else if (words.length && !words.every((w) => IDX.hay[i].includes(w))) continue;
    hits.push(i);
  }
  // Si no hay búsqueda ni filtros, no listamos 75 mil items de golpe sin orden: igual paginamos.
  let rows = hits.map((i) => {
    const r = IDX.rows[i];
    const it = state.items.get(r[0]);
    const p = state.prices.get(r[0]);
    const ex = EXTRA?.items?.[r[0]];
    if (ex && !r[1]) { const e2 = extraItem(r[0]); r[1] = e2.name; r[2] = r[2] || e2.nameEn; }
    return { id: r[0], name: r[1] || r[2] || `(sin nombre) #${r[0]}`, nameEn: r[2], type: r[3], sub: r[4], rarity: r[5], level: r[6], icon: it?.icon || ex?.icon || null, sell: p?.sell || 0, buy: p?.buy || 0, sources: ex?.removed !== false && ex ? ['fuera de la API', ...tags(r[0])] : tags(r[0]) };
  });
  if (source) rows = rows.filter((r) => r.sources.includes(source));
  // Orden: si no se eligió, primero coincidencias exactas de nombre, después las que empiezan igual.
  if (!sort && words.length) {
    const nq = normalize(qq);
    const score = (r) => { const a = normalize(r.name), b = normalize(r.nameEn); return a === nq || b === nq ? 0 : a.startsWith(nq) || b.startsWith(nq) ? 1 : 2; };
    rows.sort((x, y) => score(x) - score(y) || x.name.localeCompare(y.name, 'es'));
  } else {
    const get = SORTS[sort] || SORTS.name;
    const m = dir === 'desc' ? -1 : 1;
    rows.sort((x, y) => {
      const a = get(x), b = get(y);
      const ea = a == null || a === '', eb = b == null || b === '';
      if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1;
      return typeof a === 'number' ? m * (a - b) : m * String(a).localeCompare(String(b), 'es', { sensitivity: 'base' });
    });
  }
  const start = (Math.max(1, page) - 1) * limit;
  return { ready: true, total: rows.length, page, limit, rows: rows.slice(start, start + limit), at: IDX.at };
}

/** Item por nombre en inglés (exacto, sin mayúsculas ni acentos). */
let byEnName = null;
/** Todas las filas del índice de items: [id, es, en, type, sub, rarity, level]. */
export function catalogRows() { return IDX?.rows || []; }
export function findByNameEn(name) {
  if (!IDX) return null;
  if (!byEnName) { byEnName = new Map(); for (const r of IDX.rows) { const k = normalize(r[2] || ''); if (k && !byEnName.has(k)) byEnName.set(k, r); } }
  const r = byEnName.get(normalize(name || ''));
  return r ? { id: r[0], name: r[1] || r[2], nameEn: r[2], type: r[3], rarity: r[5] } : null;
}
