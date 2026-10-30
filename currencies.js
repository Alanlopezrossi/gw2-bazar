// Monedas de la cartera: en qué NPC se gastan (tiendas por moneda y fichas de items de la wiki archivada)
// y qué items del juego se convierten en esa moneda (ej. "Cristal de profecía verde").
import { state } from './store.js';
import { normalize } from './analysis.js';
import { allWikiEntries, wikiShops, wikiGen } from './wikidata.js';
import { findByNameEn, indexItem, catalogRows } from './catalog.js';
import { costEs } from './vendors.js';

let IDX = null;
function index() {
  const key = `${wikiGen()}|${state.items.size}`;
  if (IDX?.key === key) return IDX;
  const idByEn = new Map();
  for (const it of state.items.values()) if (it.nameEn) { const k = normalize(it.nameEn); if (!idByEn.has(k)) idByEn.set(k, it.id); }
  const byEn = (name) => idByEn.get(normalize(name)) || findByNameEn(name)?.id || null;
  // Todas las ofertas de NPC: {vendor, area, zone, cost, notes, itemId|title}
  const offers = [];
  for (const sh of wikiShops()) for (const r of sh.items || []) offers.push({ vendor: sh.vendor, area: sh.area || '', zone: sh.zone || '', cost: r.cost || '', notes: r.notes || '', title: r.title, id: byEn(r.title) });
  for (const [id, w] of Object.entries(allWikiEntries())) for (const v of w.soldBy || []) {
    if (/^[A-Z]?(Basic|Fine|Masterwork|Rare|Exotic|Ascended|Legendary)$/.test(v.area || '') || /^\d+$/.test(v.zone || '')) continue;
    offers.push({ vendor: v.vendor, area: v.area || '', zone: v.zone || '', cost: v.cost || '', notes: v.notes || '', title: w.title, id: Number(id) });
  }
  IDX = { key, byEn, offers };
  return IDX;
}

const info = (id, title) => {
  const it = id ? state.items.get(id) || indexItem(id) : null;
  return { id: id || null, name: it?.name || title || `#${id}`, nameEn: it?.nameEn || title || '', icon: it?.icon || null, rarity: it?.rarity || null };
};
const gone = (v) => (/currently unavailable|\/historical/i.test(v.vendor) ? 1 : 0);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Cuánto de la moneda pide un costo ("250 Magnetite Shard + 2 Mystic Coin" → 250). */
function amountIn(cost, nameEn) {
  const re = new RegExp(`([\\d.,]+)\\s+${esc(nameEn)}s?\\b`, 'i');
  const m = String(cost).match(re);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}

/** Dónde se gasta una moneda (por su nombre en inglés) y qué items la dan. */
export function currencyUses(nameEn) {
  if (!nameEn) return { vendors: [], items: [], total: 0 };
  const { offers } = index();
  const re = new RegExp(`\\b${esc(nameEn)}s?\\b`, 'i');
  const groups = new Map();
  const seen = new Set();
  for (const o of offers) {
    if (!re.test(o.cost)) continue;
    const gk = `${o.vendor}|${o.area}|${o.zone}`;
    const ik = `${gk}|${o.id || o.title}|${o.cost}`;
    if (seen.has(ik)) continue;
    seen.add(ik);
    if (!groups.has(gk)) groups.set(gk, { vendor: o.vendor, area: o.area, zone: o.zone, map: gk, items: [] });
    groups.get(gk).items.push({ ...info(o.id, o.title), cost: costEs(o.cost), amount: amountIn(o.cost, nameEn), notes: o.notes });
  }
  const vendors = [...groups.values()].map((g) => ({ ...g, items: g.items.sort((a, b) => (a.amount ?? 1e12) - (b.amount ?? 1e12) || a.name.localeCompare(b.name, 'es')) }))
    .sort((a, b) => gone(a) - gone(b) || b.items.length - a.items.length || a.vendor.localeCompare(b.vendor));
  // Items que se convierten en esta moneda: mismo nombre o la misma familia (ej. "Green Prophet Shard" ↔ "Green Prophet Crystal").
  const stem = nameEn.split(' ').slice(0, -1).join(' ');
  const items = [];
  const want = normalize(nameEn), wantStem = normalize(stem);
  const add = (id) => { if (id && !items.some((x) => x.id === id)) items.push(info(id)); };
  for (const r of catalogRows()) {
    const n = normalize(r[2] || '');
    if (!n) continue;
    if (n === want || n === `${want}s`) add(r[0]);
    else if (wantStem.split(' ').length >= 2 && new RegExp(`^${esc(wantStem)} (crystal|shard|fragment|chunk|token|coin|pouch|bag|stack)s?$`).test(n) && /Consumable|Trophy|CraftingMaterial|Container/.test(r[3] || '')) add(r[0]);
  }
  const direct = findByNameEn(nameEn);
  if (direct) add(direct.id);
  return { vendors, items: items.slice(0, 12), total: vendors.reduce((a, g) => a + g.items.length, 0) };
}
