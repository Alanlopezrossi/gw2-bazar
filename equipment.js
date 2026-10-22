// Pestaña "Equipo": legendarios y ascendidos, con todas sus formas de obtención.
import { state } from './store.js';
import { bestRecipe, net } from './analysis.js';
import { wikiEntry } from './wikidata.js';
import { normalize } from './analysis.js';

let EQ = null; // { at, items: [...], achievements: { [id]: [...] } }
let byId = new Map();

export function setEquipmentData(data) {
  EQ = data && Array.isArray(data.items) ? { ...data, items: data.items.filter((i) => !/^¡/.test(i.name)) } : null;
  byId = new Map((EQ?.items || []).map((i) => [i.id, i]));
  // Los no comerciables no están en el catálogo del bazar: los sumamos para que tengan ficha y árbol.
  for (const it of EQ?.items || []) {
    if (state.items.has(it.id)) continue;
    state.items.set(it.id, { id: it.id, name: it.name, nameEn: it.nameEn, type: it.type, sub: it.sub, rarity: it.rarity, level: it.level, icon: it.icon, vendor: 0, flags: it.flags, gameTypes: [], desc: '', chat: it.chat });
  }
}

export function equipmentMeta() {
  return EQ ? { at: EQ.at, count: EQ.items.length } : null;
}

export function achievementsFor(id) {
  return EQ?.achievements?.[id] || [];
}

/** Formas de obtener un item, como etiquetas. */
export function sourcesOf(id) {
  const tags = [];
  const p = state.prices.get(id);
  if (p && (p.sell || p.buy)) tags.push('bazar');
  const recs = state.byOutput.get(id) || [];
  if (recs.some((r) => r.id > 0)) tags.push('crafteo');
  if (recs.some((r) => r.id < 0)) tags.push('forja');
  if (achievementsFor(id).length) tags.push('logro');
  const w = wikiEntry(id);
  if (w?.soldBy?.length) tags.push('vendedor');
  if (w?.containedIn?.length) tags.push('contenedor');
  if (w?.rewardTracks?.length) tags.push('reward track');
  return tags;
}

function rowOf(it, mode) {
  const p = state.prices.get(it.id) || {};
  const best = state.byOutput.has(it.id) ? bestRecipe(it.id, mode) : null;
  const ach = achievementsFor(it.id);
  const w = wikiEntry(it.id);
  return {
    id: it.id,
    name: it.name,
    nameEn: it.nameEn,
    icon: it.icon,
    rarity: it.rarity,
    type: it.type,
    sub: it.sub,
    weight: it.weight,
    stat: it.stat,
    armory: it.armory,
    sell: p.sell || 0,
    buy: p.buy || 0,
    netSell: p.sell ? net(Math.max(p.sell - 1, 1)) : 0,
    craftCost: best ? Math.round(best.cost) : null,
    craftable: state.byOutput.has(it.id),
    achievement: ach[0] ? { name: ach[0].name, category: ach[0].category, more: ach.length - 1 } : null,
    vendor: w?.soldBy?.[0] ? { vendor: w.soldBy[0].vendor, zone: w.soldBy[0].zone, cost: w.soldBy[0].cost, more: w.soldBy.length - 1 } : null,
    sources: sourcesOf(it.id),
  };
}

// Valor por el que se ordena cada columna (null = sin dato: siempre al final).
const SORTS = {
  name: (r) => r.name,
  type: (r) => `${r.type} ${r.sub || ''} ${r.name}`,
  sources: (r) => r.sources.length,
  sell: (r) => r.sell || null,
  craftCost: (r) => r.craftCost ?? null,
  achievement: (r) => r.achievement?.name || null,
  vendor: (r) => r.vendor?.vendor || null,
};
function sortRows(rows, get, dir) {
  const m = dir === 'desc' ? -1 : 1;
  return rows.sort((x, y) => {
    const a = get(x), b = get(y);
    const ea = a == null || a === '', eb = b == null || b === '';
    if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1;
    if (typeof a === 'number' && typeof b === 'number') return m * (a - b);
    return m * String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' });
  });
}

export function listEquipment({ q = '', rarity = '', type = '', sub = '', weight = '', source = '', sort = 'name', dir = 'asc', page = 1, limit = 100, mode = 'instant' } = {}) {
  if (!EQ) return { total: 0, page, limit, rows: [], ready: false, subs: [] };
  const nq = normalize(q).trim().split(/\s+/).filter(Boolean);
  const rows = [];
  const subs = new Set();
  for (const it of EQ.items) {
    if (rarity && it.rarity !== rarity) continue;
    if (type && it.type !== type) continue;
    if (it.sub) subs.add(it.sub);
    if (sub && it.sub !== sub) continue;
    if (weight && it.weight !== weight) continue;
    if (nq.length) {
      const hay = normalize(`${it.name} ${it.nameEn} ${it.stat || ''}`);
      if (!nq.every((w) => hay.includes(w))) continue;
    }
    const r = rowOf(it, mode);
    if (source && !r.sources.includes(source)) continue;
    rows.push(r);
  }
  sortRows(rows, SORTS[sort] || SORTS.name, dir);
  const start = (Math.max(1, page) - 1) * limit;
  return { total: rows.length, page, limit, rows: rows.slice(start, start + limit), ready: true, subs: [...subs].sort(), at: EQ.at };
}
