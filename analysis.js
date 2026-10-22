// Cálculos de mercado: comisiones, flipeo, demanda y crafteo rentable.
import { state } from './store.js';

/** Lo que cobrás de verdad al vender a precio p (5% de publicación + 10% de venta, mínimo 1c cada una). */
export function net(p) {
  if (!p) return 0;
  return Math.max(0, p - Math.max(1, Math.round(p * 0.05)) - Math.max(1, Math.round(p * 0.1)));
}

// Parte del mercado que es razonable capturar compitiendo con otros jugadores.
export const SHARE = 0.05;

// Items que el juego deja craftear UNA vez por día (por nombre en inglés, que no cambia).
const GATED_EN = new Set([
  'Lump of Mithrillium', 'Glob of Elder Spirit Residue', 'Spool of Thick Elonian Cord', 'Spool of Silk Weaving Thread',
  'Charged Quartz Crystal', 'Plate of Meaty Plant Food', 'Plate of Piquant Plant Food', 'Clay Pot', 'Grow Lamp', 'Heat Stone',
  'Dragon Hatchling Doll Eye', 'Dragon Hatchling Doll Hide', 'Dragon Hatchling Doll Frame', 'Dragon Hatchling Doll Adornments', 'Gossamer Stuffing',
]);
// Mismos items por id (verificados contra la API), para no depender de que carguen los nombres en inglés.
const GATED_IDS = new Set([46740, 46742, 46744, 46745, 43772, 66913, 66917, 66923, 66993, 67015, 79726, 79763, 79790, 79817]);
export function isGated(id) {
  return GATED_IDS.has(id) || GATED_EN.has(state.items.get(id)?.nameEn);
}

export function vol(id) {
  return state.volume.get(id) || null;
}

function passesFilters(it, { type, rarity, q }) {
  if (type && it?.type !== type) return false;
  if (rarity && it?.rarity !== rarity) return false;
  if (q && !matches(it, q)) return false;
  return true;
}

export function normalize(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function matches(it, q) {
  if (!it) return false;
  const n = normalize(q).trim();
  if (!n) return true;
  if (/^\d+$/.test(n) && String(it.id) === n) return true;
  const hay = it._search || (it._search = normalize(`${it.name} ${it.nameEn}`));
  return n.split(/\s+/).every((w) => hay.includes(w));
}

export function row(id) {
  const it = state.items.get(id);
  const p = state.prices.get(id) || {};
  const v = vol(id) || {};
  const buyAt = p.buy ? p.buy + 1 : 0;
  const sellAt = p.sell ? Math.max(p.sell - 1, buyAt) : 0;
  const profit = p.buy && p.sell ? net(sellAt) - buyAt : null;
  return {
    id,
    name: it?.name || `#${id}`,
    nameEn: it?.nameEn || '',
    icon: it?.icon || null,
    rarity: it?.rarity || null,
    type: it?.type || null,
    level: it?.level ?? null,
    buy: p.buy || 0,
    buyQty: p.buyQty || 0,
    sell: p.sell || 0,
    sellQty: p.sellQty || 0,
    profit,
    roi: profit !== null && buyAt ? profit / buyAt : null,
    b1: v.b1 ?? null,
    s1: v.s1 ?? null,
    b7: v.b7 ?? null,
    s7: v.s7 ?? null,
    change24: change24(id),
  };
}

/** Variación % del precio de venta contra la muestra más vieja de las últimas 24 h (historia local). */
export function change24(id) {
  const pts = state.history.get(id);
  if (!pts || pts.length < 2) return null;
  const first = pts[0][2];
  const last = pts[pts.length - 1][2];
  if (!first || !last) return null;
  return (last - first) / first;
}

const SORTERS = {
  name: (a, b) => a.name.localeCompare(b.name, 'es'),
  buy: (a, b) => a.buy - b.buy,
  sell: (a, b) => a.sell - b.sell,
  buyQty: (a, b) => a.buyQty - b.buyQty,
  sellQty: (a, b) => a.sellQty - b.sellQty,
  profit: (a, b) => (a.profit ?? -Infinity) - (b.profit ?? -Infinity),
  roi: (a, b) => (a.roi ?? -Infinity) - (b.roi ?? -Infinity),
  s1: (a, b) => (a.s1 ?? -1) - (b.s1 ?? -1),
  b1: (a, b) => (a.b1 ?? -1) - (b.b1 ?? -1),
  s7: (a, b) => (a.s7 ?? -1) - (b.s7 ?? -1),
  change24: (a, b) => (a.change24 ?? -Infinity) - (b.change24 ?? -Infinity),
};

/** Tabla general del bazar. */
export function listItems({ q = '', type = '', rarity = '', sort = 's1', dir = 'desc', page = 1, limit = 50, minVol = 0, onlyFlip = false } = {}) {
  const rows = [];
  for (const id of state.prices.keys()) {
    const it = state.items.get(id);
    if (!passesFilters(it, { type, rarity, q })) continue;
    if (!it && (q || type || rarity)) continue;
    const r = row(id);
    if (minVol && (r.s1 ?? 0) < minVol) continue;
    if (onlyFlip && !(r.profit > 0)) continue;
    rows.push(r);
  }
  const cmp = SORTERS[sort] || SORTERS.s1;
  rows.sort((a, b) => (dir === 'asc' ? cmp(a, b) : cmp(b, a)));
  const start = (Math.max(1, page) - 1) * limit;
  return { total: rows.length, page, limit, rows: rows.slice(start, start + limit) };
}

/**
 * Flipeo: comprar con orden de compra (buy+1c) y revender en listing (sell-1c).
 * "potencial" = ganancia por unidad × unidades que se mueven por día (lo limita el lado más lento).
 */
export function flips({ minProfit = 100, minRoi = 0.05, maxRoi = 2, minVol = 25, maxBuy = 0, type = '', rarity = '', q = '', limit = 100 } = {}) {
  const out = [];
  for (const [id, p] of state.prices) {
    if (!p.buy || !p.sell) continue;
    const it = state.items.get(id);
    if (!passesFilters(it, { type, rarity, q })) continue;
    if (maxBuy && p.buy + 1 > maxBuy) continue;
    const v = vol(id);
    if (!v) continue;
    const r = row(id);
    if (r.profit < minProfit || r.roi < minRoi || r.roi > maxRoi) continue;
    const moves = Math.min(v.b1, v.s1);
    if (moves < minVol) continue;
    // Descartamos libros de órdenes casi vacíos (precios fáciles de manipular).
    if (p.sellQty < 5 || p.buyQty < 5) continue;
    r.moves = moves;
    r.qty = Math.max(1, Math.floor(moves * SHARE));
    r.capital = (p.buy + 1) * r.qty;
    r.potential = r.profit * r.qty;
    out.push(r);
  }
  out.sort((a, b) => b.potential - a.potential);
  return out.slice(0, limit);
}

/**
 * Demanda: lo que más oro mueve por día. Útil para decidir qué farmear y vender.
 * valorDiario = unidades compradas de listings por día × precio neto de venta.
 */
export const CATEGORIES = {
  farm: ['CraftingMaterial', 'Trophy'],
  loot: ['Container', 'Consumable', 'Gizmo', 'MiniPet'],
  gear: ['Weapon', 'Armor', 'Trinket', 'Back'],
  upgrade: ['UpgradeComponent', 'Relic'],
};

export function demand({ type = '', rarity = '', q = '', cat = '', minPrice = 0, minSold = 50, maxDays = 0, sort = 'value', limit = 100 } = {}) {
  const out = [];
  const cats = CATEGORIES[cat];
  for (const [id, p] of state.prices) {
    if (!p.sell) continue;
    if (minPrice && p.sell < minPrice) continue;
    const it = state.items.get(id);
    if (!passesFilters(it, { type, rarity, q })) continue;
    if (cats && !cats.includes(it?.type)) continue;
    const v = vol(id);
    if (!v || !v.s1 || v.s1 < minSold) continue;
    if (maxDays && p.sellQty / v.s1 > maxDays) continue;
    const r = row(id);
    r.netSell = net(Math.max(p.sell - 1, 1));
    r.netInstant = net(p.buy);
    r.dailyValue = r.netSell * v.s1;
    // Ofertas en venta / ventas por día: cuántos días tarda en "vaciarse" el stock publicado.
    r.daysOfStock = v.s1 ? p.sellQty / v.s1 : null;
    out.push(r);
  }
  if (sort === 'unit') out.sort((a, b) => b.netSell - a.netSell);
  else out.sort((a, b) => b.dailyValue - a.dailyValue);
  return out.slice(0, limit);
}

// ---------------- Crafteo ----------------

let memo = { key: '', instant: new Map(), order: new Map() };
function memoFor(mode) {
  const key = `${state.meta.pricesAt}|${state.meta.recipesAt}|${state.meta.wikiAt || 0}`;
  if (memo.key !== key) memo = { key, instant: new Map(), order: new Map() };
  return memo[mode];
}

/** Precio para conseguir 1 unidad en el bazar. instant = comprar listing; order = poner orden de compra. */
export function tpBuyPrice(id, mode = 'instant') {
  const p = state.prices.get(id);
  if (!p) return null;
  if (mode === 'order' && p.buy) return p.buy + 1;
  return p.sell || null;
}

/** Costo del ingrediente en monedas (id 1 = moneda de cobre). Otras divisas no tienen precio en oro. */
function currencyCost(g) {
  return g.type === 'Currency' && g.id === 1 ? g.count : null;
}

/** Costo de craftear 1 unidad con una receta, usando el mínimo (comprar vs craftear) de cada ingrediente. */
export function recipeCost(r, mode = 'instant', stack = new Set()) {
  let total = 0;
  for (const g of r.ingredients) {
    if (g.type === 'Item') {
      const c = bestCost(g.id, mode, stack);
      if (c.unit == null) return null;
      total += c.unit * g.count;
    } else {
      const c = currencyCost(g);
      if (c == null) return null;
      total += c;
    }
  }
  return total / (r.output_item_count || 1);
}

/** Lo más barato entre comprar en el bazar y craftear (recursivo, con memo y control de ciclos). */
export function bestCost(id, mode = 'instant', stack = new Set()) {
  const m = memoFor(mode);
  if (m.has(id)) return m.get(id);
  const tp = tpBuyPrice(id, mode);
  let best = { unit: tp, source: tp != null ? 'tp' : null, recipe: null };
  // Si el item ya está en la cadena actual (ciclo), sólo vale comprarlo; no se memoiza.
  if (stack.has(id)) return best;
  stack.add(id);
  for (const r of state.byOutput.get(id) || []) {
    const c = recipeCost(r, mode, stack);
    if (c != null && (best.unit == null || c < best.unit)) best = { unit: c, source: 'craft', recipe: r.id };
  }
  stack.delete(id);
  m.set(id, best);
  return best;
}

/** ¿El camino más barato para conseguir este item pasa por un crafteo con límite diario? */
export function usesGated(id, mode = 'instant', depth = 0) {
  if (isGated(id)) return true;
  if (depth > 6) return false;
  const b = bestCost(id, mode);
  if (b.source !== 'craft') return false;
  const r = state.recipes.get(b.recipe);
  return !!r && r.ingredients.some((g) => g.type === 'Item' && usesGated(g.id, mode, depth + 1));
}

/** Mejor receta (la más barata) de un item, sin considerar comprarlo hecho. */
export function bestRecipe(id, mode = 'instant') {
  let best = null;
  for (const r of state.byOutput.get(id) || []) {
    const c = recipeCost(r, mode, new Set([id]));
    if (c != null && (!best || c < best.cost)) best = { recipe: r, cost: c };
  }
  return best;
}

/** Recetas rentables: craftear y vender en listing. */
export function craftingProfits({ mode = 'instant', minProfit = 100, minVol = 10, minRoi = 0.05, autoOnly = false, discipline = '', type = '', rarity = '', q = '', limit = 100 } = {}) {
  const out = [];
  for (const [id, recs] of state.byOutput) {
    const p = state.prices.get(id);
    if (!p || !p.sell) continue;
    const it = state.items.get(id);
    if (!passesFilters(it, { type, rarity, q })) continue;
    const v = vol(id);
    const sold = v?.s1 ?? 0;
    if (sold < minVol) continue;
    let candidates = recs;
    if (autoOnly) candidates = candidates.filter((r) => r.flags?.includes('AutoLearned'));
    if (discipline) candidates = candidates.filter((r) => r.disciplines?.includes(discipline));
    let best = null;
    for (const r of candidates) {
      const c = recipeCost(r, mode, new Set([id]));
      if (c != null && (!best || c < best.cost)) best = { recipe: r, cost: c };
    }
    if (!best) continue;
    const sellNet = net(Math.max(p.sell - 1, 1));
    const profit = sellNet - best.cost;
    const roi = best.cost ? profit / best.cost : 0;
    if (profit < minProfit || roi < minRoi) continue;
    const gated = isGated(id) || best.recipe.ingredients.some((g) => g.type === 'Item' && usesGated(g.id, mode));
    const qty = gated ? best.recipe.output_item_count || 1 : Math.max(1, Math.floor(sold * SHARE));
    const r = row(id);
    Object.assign(r, {
      craftCost: Math.round(best.cost),
      sellNet,
      craftProfit: Math.round(profit),
      craftRoi: roi,
      instantProfit: Math.round(net(p.buy) - best.cost),
      recipeId: best.recipe.id,
      disciplines: best.recipe.disciplines,
      minRating: best.recipe.min_rating,
      needsRecipe: best.recipe.flags?.includes('LearnedFromItem') || false,
      gated,
      qty,
      capital: Math.round(best.cost * qty),
      potential: Math.round(profit * qty),
    });
    out.push(r);
  }
  out.sort((a, b) => b.potential - a.potential);
  return out.slice(0, limit);
}

/** Árbol de crafteo para la ficha del item. */
export function craftTree(id, qty = 1, mode = 'instant', depth = 0, stack = new Set()) {
  const it = state.items.get(id);
  const tp = tpBuyPrice(id, mode);
  const node = {
    id,
    name: it?.name || `#${id}`,
    icon: it?.icon || null,
    rarity: it?.rarity || null,
    qty,
    tpUnit: tp,
    craftUnit: null,
    chosen: tp != null ? 'tp' : null,
    recipe: null,
    children: [],
    tradable: state.prices.has(id),
    gated: isGated(id),
  };
  if (depth > 7 || stack.has(id)) return node;
  stack.add(id);
  const best = bestRecipe(id, mode);
  if (best) {
    node.craftUnit = best.cost;
    const r = best.recipe;
    node.recipe = {
      id: r.id,
      disciplines: r.disciplines,
      minRating: r.min_rating,
      flags: r.flags,
      outCount: r.output_item_count,
      chat: r.chat_link,
    };
    if (tp == null || best.cost < tp) node.chosen = 'craft';
    const crafts = Math.ceil(qty / (r.output_item_count || 1));
    for (const g of r.ingredients) {
      if (g.type === 'Item') node.children.push(craftTree(g.id, g.count * crafts, mode, depth + 1, stack));
      else node.children.push({ currency: g.type, id: g.id, qty: g.count * crafts, coin: g.type === 'Currency' && g.id === 1 });
    }
  } else if (state.byOutput.has(id)) {
    // Tiene receta pero algún ingrediente no tiene precio: mostramos igual la receta sin costo.
    const r = state.byOutput.get(id)[0];
    node.recipe = { id: r.id, disciplines: r.disciplines, minRating: r.min_rating, flags: r.flags, outCount: r.output_item_count, chat: r.chat_link, incomplete: true };
    const crafts = Math.ceil(qty / (r.output_item_count || 1));
    for (const g of r.ingredients) {
      if (g.type === 'Item') node.children.push(craftTree(g.id, g.count * crafts, mode, depth + 1, stack));
      else node.children.push({ currency: g.type, id: g.id, qty: g.count * crafts, coin: g.type === 'Currency' && g.id === 1 });
    }
  }
  stack.delete(id);
  return node;
}
