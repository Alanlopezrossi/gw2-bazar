// Pestaña "Profesiones": todo lo que puede crear cada disciplina de crafteo (y la Forja Mística),
// incluidos los items que no se venden (dones, componentes de legendarias, ascendidos…).
import { state } from './store.js';
import { normalize, recipeCost, tpBuyPrice, net } from './analysis.js';
import { legendaryIds } from './equipment.js';
import { indexItem } from './catalog.js';

const RAR = { Junk: 0, Basic: 1, Fine: 2, Masterwork: 3, Rare: 4, Exotic: 5, Ascended: 6, Legendary: 7 };

const itemOf = (id) => state.items.get(id) || indexItem(id) || { id, name: `#${id}` };
const isGift = (it) => /^(don|dones) /i.test(it?.name || '') || /^gift of /i.test(it?.nameEn || '');

// Ids que aparecen en algún árbol de legendaria (para la categoría "componentes de legendarias").
let legSet = null, legKey = '';
function legendaryComponents() {
  const key = `${state.recipes.size}|${legendaryIds().length}`;
  if (legSet && legKey === key) return legSet;
  const seen = new Map(); // id -> Set(legendaria)
  const walk = (id, leg, depth) => {
    if (depth > 10) return;
    for (const r of state.byOutput.get(id) || []) {
      for (const g of r.ingredients || []) {
        if (g.type !== 'Item') continue;
        if (!seen.has(g.id)) seen.set(g.id, new Set());
        const s = seen.get(g.id);
        if (s.has(leg)) continue;
        s.add(leg);
        walk(g.id, leg, depth + 1);
      }
    }
  };
  for (const id of legendaryIds()) walk(id, id, 0);
  legSet = seen; legKey = key;
  return seen;
}

/** Para qué se usa un item: recetas donde es ingrediente (primeras). */
function usedFor(id) {
  const out = [];
  const seen = new Set();
  for (const rid of state.byInput.get(id) || []) {
    const r = state.recipes.get(rid);
    if (!r || seen.has(r.output_item_id)) continue;
    seen.add(r.output_item_id);
    const it = itemOf(r.output_item_id);
    const g = r.ingredients.find((x) => x.id === id);
    out.push({ id: r.output_item_id, name: it.name, rarity: it.rarity || null, count: g?.count || 1 });
  }
  return out.sort((a, b) => (RAR[b.rarity] ?? 0) - (RAR[a.rarity] ?? 0));
}

/** Cantidad de recetas por disciplina (para las tarjetas de arriba). */
export function professionsSummary() {
  const counts = {};
  const gifts = {};
  for (const r of state.recipes.values()) {
    for (const d of r.disciplines || []) {
      counts[d] = (counts[d] || 0) + 1;
      if (isGift(itemOf(r.output_item_id))) gifts[d] = (gifts[d] || 0) + 1;
    }
  }
  return { counts, gifts, total: state.recipes.size };
}

const SORTS = {
  name: (r) => r.name,
  rating: (r) => r.rating,
  rarity: (r) => RAR[r.rarity] ?? null,
  cost: (r) => r.cost,
  sell: (r) => r.sell || null,
  profit: (r) => r.profit,
};

export function listRecipes({ disc = '', q = '', cat = '', rarity = '', type = '', minR = 0, maxR = 500, sort = '', dir = 'asc', page = 1, limit = 50, mode = 'instant' } = {}) {
  const nq = normalize(q.trim());
  const words = nq.split(/\s+/).filter(Boolean);
  const leg = cat === 'legendaria' ? legendaryComponents() : null;
  const rows = [];
  for (const r of state.recipes.values()) {
    const ds = r.disciplines || [];
    if (disc && !ds.includes(disc)) continue;
    const rating = r.min_rating || 0;
    if (rating < minR || rating > maxR) continue;
    const id = r.output_item_id;
    const it = itemOf(id);
    if (rarity && it.rarity !== rarity) continue;
    if (type && it.type !== type) continue;
    if (cat === 'dones' && !isGift(it)) continue;
    if (cat === 'legendaria' && !leg.has(id)) continue;
    if (cat === 'ascendido' && it.rarity !== 'Ascended') continue;
    if (cat === 'receta' && !r.flags?.includes('LearnedFromItem')) continue;
    const p = state.prices.get(id);
    if (cat === 'vendible' && !p?.sell) continue;
    if (words.length) {
      const hay = normalize(`${it.name} ${it.nameEn || ''} ${r.ingredients.map((g) => { const x = itemOf(g.id); return `${x.name} ${x.nameEn || ''}`; }).join(' ')}`);
      if (!words.every((w) => hay.includes(w))) continue;
    }
    rows.push({ r, it, p });
  }
  // Costo y ganancia sólo para lo que hace falta mostrar/ordenar.
  const enrich = ({ r, it, p }) => {
    const cost = recipeCost(r, mode, new Set([r.output_item_id]));
    const sell = p?.sell || 0;
    const profit = cost != null && sell ? Math.round(net(Math.max(sell - 1, 1)) - cost) : null;
    return { recipeId: r.id, id: r.output_item_id, name: it.name || `#${r.output_item_id}`, nameEn: it.nameEn || '', icon: it.icon || null, rarity: it.rarity || null, type: it.type || null, rating: r.min_rating || 0, disciplines: r.disciplines || [], out: r.output_item_count || 1, needsRecipe: r.flags?.includes('LearnedFromItem') || false, fromWiki: r.id < 0, cost: cost != null ? Math.round(cost) : null, sell, profit, r };
  };
  let list;
  if (cat === 'ganancia' || ['cost', 'profit'].includes(sort)) {
    list = rows.map(enrich);
    if (cat === 'ganancia') list = list.filter((x) => x.profit > 0);
  } else list = rows.map((x) => ({ ...x, name: x.it.name || '', rating: x.r.min_rating || 0, rarity: x.it.rarity, sell: x.p?.sell || 0 }));
  const get = SORTS[sort] || null;
  const m = dir === 'desc' ? -1 : 1;
  if (get) list.sort((a, b) => { const x = get(a), y = get(b); const ex = x == null || x === '', ey = y == null || y === ''; if (ex || ey) return ex === ey ? 0 : ex ? 1 : -1; return typeof x === 'number' ? m * (x - y) : m * String(x).localeCompare(String(y), 'es', { sensitivity: 'base' }); });
  else list.sort((a, b) => (b.rating - a.rating) || ((RAR[b.rarity] ?? 0) - (RAR[a.rarity] ?? 0)) || String(a.name).localeCompare(String(b.name), 'es'));
  const total = list.length;
  const start = (Math.max(1, page) - 1) * limit;
  const pageRows = list.slice(start, start + limit).map((x) => (x.recipeId != null ? x : enrich(x))).map((x) => ({
    ...x,
    r: undefined,
    ingredients: x.r.ingredients.map((g) => {
      if (g.type !== 'Item') return { currency: true, id: g.id, type: g.type, count: g.count };
      const gi = itemOf(g.id);
      return { id: g.id, name: gi.name || `#${g.id}`, icon: gi.icon || null, rarity: gi.rarity || null, count: g.count, unit: tpBuyPrice(g.id, mode) };
    }),
    usedFor: usedFor(x.id).slice(0, 4),
    usedForTotal: (state.byInput.get(x.id) || []).length,
    legendaries: leg ? [...(leg.get(x.id) || [])].slice(0, 3).map((l) => itemOf(l).name) : undefined,
  }));
  return { total, page, limit, rows: pageRows };
}
