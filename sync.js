// Versión navegador de src/sync.js: baja todo desde el navegador del visitante y lo cachea en IndexedDB.
import { getAllPages, getByIds, getJSON, GW2_BASE, DW2_BASE } from './gw2api.js';
import { state, setRecipes, broadcast, idbSet } from './store.js';

const MIN = 60_000;
export const INTERVALS = {
  prices: 5 * MIN,
  volume: 30 * MIN,
  recipes: 24 * 60 * MIN,
  itemsFull: 7 * 24 * 60 * MIN,
  historyStep: 30 * MIN,
  historyKeep: 24 * 60 * MIN,
};

function setPhase(phase, progress = null) {
  state.sync.phase = phase;
  state.sync.progress = progress;
  broadcast('sync', state.sync);
}
function logError(where, e) {
  const msg = `${new Date().toLocaleTimeString('es-AR', { hour12: false })} · ${where}: ${e.message || e}`;
  console.error('[sync]', msg);
  state.sync.errors.unshift(msg);
  state.sync.errors.length = Math.min(state.sync.errors.length, 20);
}

function slimItem(es, prev) {
  return {
    id: es.id,
    name: es.name || prev?.nameEn || `#${es.id}`,
    nameEn: prev?.nameEn || '',
    type: es.type,
    sub: es.details?.type || null,
    rarity: es.rarity,
    level: es.level,
    icon: es.icon,
    vendor: es.vendor_value || 0,
    flags: es.flags || [],
    gameTypes: es.game_types || [],
    desc: (es.description || '').replace(/<[^>]+>/g, ''),
    chat: es.chat_link,
  };
}

async function saveItems() {
  await idbSet('items', { at: state.meta.itemsAt, enAt: state.meta.enAt, list: [...state.items.values()] });
}

export async function syncItems(ids, { force = false } = {}) {
  const missing = force ? ids : ids.filter((id) => !state.items.has(id));
  if (!missing.length) return 0;
  const es = await getByIds('items', missing, {
    lang: 'es',
    onProgress: (d, t) => setPhase('nombres de items', { done: d, total: t }),
  });
  for (const it of es) state.items.set(it.id, slimItem(it, state.items.get(it.id)));
  state.meta.itemsAt = Date.now();
  await saveItems();
  return es.length;
}

/** Nombres en inglés (para buscar en inglés y para la wiki). Va al final, en segundo plano. */
async function syncEnglish() {
  const missing = [...state.items.values()].filter((i) => !i.nameEn).map((i) => i.id);
  if (!missing.length) return 0;
  const en = await getByIds('items', missing, {
    lang: 'en',
    onProgress: (d, t) => setPhase('nombres en inglés (para buscar)', { done: d, total: t }),
  });
  for (const it of en) {
    const cur = state.items.get(it.id);
    if (cur) { cur.nameEn = it.name; delete cur._search; }
  }
  state.meta.enAt = Date.now();
  await saveItems();
  return en.length;
}

export async function syncPrices() {
  setPhase('precios del bazar', { done: 0, total: 1 });
  const list = await getAllPages('commerce/prices', {
    onProgress: (d, t) => setPhase('precios del bazar', { done: d, total: t }),
  });
  if (list.length < 1000) throw new Error(`respuesta de precios incompleta (${list.length})`);
  const fresh = new Map();
  for (const p of list) {
    fresh.set(p.id, { buy: p.buys?.unit_price || 0, buyQty: p.buys?.quantity || 0, sell: p.sells?.unit_price || 0, sellQty: p.sells?.quantity || 0 });
  }
  state.prices = fresh;
  state.meta.pricesAt = Date.now();
  recordHistory();
  await idbSet('prices', { at: state.meta.pricesAt, list: [...fresh].map(([id, p]) => [id, p.buy, p.buyQty, p.sell, p.sellQty]) });
  return fresh.size;
}

function recordHistory() {
  const now = Date.now();
  if (now - state.meta.historyAt < INTERVALS.historyStep - 30_000) return;
  const t = Math.round(now / MIN);
  const cutoff = t - INTERVALS.historyKeep / MIN;
  for (const [id, p] of state.prices) {
    const v = state.volume.get(id);
    if (state.volume.size && !(v && v.s1 + v.b1 >= 5)) continue;
    let pts = state.history.get(id);
    if (!pts) state.history.set(id, (pts = []));
    pts.push([t, p.buy, p.sell]);
    while (pts.length && pts[0][0] < cutoff) pts.shift();
  }
  state.meta.historyAt = now;
  idbSet('history', { at: now, list: [...state.history] });
}

export async function syncVolume() {
  setPhase('volumen de ventas (DataWars2)');
  const fields = 'id,1d_buy_sold,1d_sell_sold,7d_buy_sold,7d_sell_sold';
  const { data } = await getJSON(`${DW2_BASE}/gw2/v1/items/json?fields=${fields}`, { limited: false, timeout: 120000 });
  if (!Array.isArray(data) || data.length < 1000) throw new Error('respuesta de DataWars2 inesperada');
  const fresh = new Map();
  for (const r of data) fresh.set(r.id, { b1: r['1d_buy_sold'] || 0, s1: r['1d_sell_sold'] || 0, b7: r['7d_buy_sold'] || 0, s7: r['7d_sell_sold'] || 0 });
  state.volume = fresh;
  state.meta.volumeAt = Date.now();
  await idbSet('volume', { at: state.meta.volumeAt, list: [...fresh].map(([id, v]) => [id, v.b1, v.s1, v.b7, v.s7]) });
  return fresh.size;
}

export async function syncRecipes() {
  setPhase('recetas de crafteo');
  const { data: ids } = await getJSON(`${GW2_BASE}/v2/recipes`);
  const list = await getByIds('recipes', ids, { onProgress: (d, t) => setPhase('recetas de crafteo', { done: d, total: t }) });
  setRecipes(list);
  state.meta.recipesAt = Date.now();
  await idbSet('recipes', { at: state.meta.recipesAt, list });
  return list.length;
}

function recipeItemIds() {
  const s = new Set();
  for (const r of state.recipes.values()) {
    s.add(r.output_item_id);
    for (const g of r.ingredients) if (g.type === 'Item') s.add(g.id);
  }
  return [...s];
}

async function step(name, fn) {
  try {
    const n = await fn();
    console.log(`[sync] ${name}: ok${n !== undefined ? ` (${n})` : ''}`);
    return true;
  } catch (e) {
    logError(name, e);
    return false;
  }
}

let running = false;
export async function runCycle({ first = false } = {}) {
  if (running) return;
  running = true;
  try {
    const now = Date.now();
    await step('precios', syncPrices);
    broadcast('prices', { at: state.meta.pricesAt });
    const full = state.meta.itemsAt && now - state.meta.itemsAt > INTERVALS.itemsFull;
    if (await step('items', () => syncItems([...state.prices.keys()], { force: full }))) broadcast('prices', { at: state.meta.pricesAt });
    if (now - state.meta.volumeAt > INTERVALS.volume) {
      if (await step('volumen', syncVolume)) broadcast('prices', { at: state.meta.pricesAt });
    }
    if (now - state.meta.recipesAt > INTERVALS.recipes) {
      if (await step('recetas', syncRecipes)) await step('items de recetas', () => syncItems(recipeItemIds()));
    } else if (first) {
      await step('items de recetas', () => syncItems(recipeItemIds()));
    }
    await step('nombres en inglés', syncEnglish);
    setPhase('al día');
    broadcast('prices', { at: state.meta.pricesAt });
  } finally {
    running = false;
  }
}

export function startScheduler() {
  runCycle({ first: true });
  setInterval(() => runCycle(), INTERVALS.prices);
}
