// Versión navegador de src/store.js: estado en memoria + caché en IndexedDB.

export const state = {
  items: new Map(),
  prices: new Map(),
  volume: new Map(),
  recipes: new Map(),
  byOutput: new Map(),
  byInput: new Map(),
  history: new Map(),
  meta: { itemsAt: 0, pricesAt: 0, volumeAt: 0, recipesAt: 0, historyAt: 0, enAt: 0 },
  sync: { phase: 'iniciando', progress: null, errors: [] },
};

// ---------- IndexedDB mínimo (clave/valor) ----------
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open('gw2-bazar', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch(() => null);
  return dbp;
}
export async function idbGet(key) {
  const d = await db();
  if (!d) return null;
  return new Promise((resolve) => {
    try {
      const r = d.transaction('kv').objectStore('kv').get(key);
      r.onsuccess = () => resolve(r.result ?? null);
      r.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}
export async function idbSet(key, value) {
  const d = await db();
  if (!d) return;
  return new Promise((resolve) => {
    try {
      const tx = d.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch { resolve(); }
  });
}

// Compatibilidad con el código del servidor.
export function readJSON() { return null; }
export function writeJSON() {}

export async function loadCache() {
  const items = await idbGet('items');
  if (items) {
    for (const it of items.list) state.items.set(it.id, it);
    state.meta.itemsAt = items.at;
    state.meta.enAt = items.enAt || 0;
  }
  const prices = await idbGet('prices');
  if (prices) {
    for (const [id, buy, buyQty, sell, sellQty] of prices.list) state.prices.set(id, { buy, buyQty, sell, sellQty });
    state.meta.pricesAt = prices.at;
  }
  const vol = await idbGet('volume');
  if (vol) {
    for (const [id, b1, s1, b7, s7] of vol.list) state.volume.set(id, { b1, s1, b7, s7 });
    state.meta.volumeAt = vol.at;
  }
  const recs = await idbGet('recipes');
  if (recs) {
    setRecipes(recs.list);
    state.meta.recipesAt = recs.at;
  }
  const hist = await idbGet('history');
  if (hist) {
    for (const [id, pts] of hist.list) state.history.set(id, pts);
    state.meta.historyAt = hist.at;
  }
}

export function setRecipes(list) {
  state.recipes.clear();
  state.byOutput.clear();
  state.byInput.clear();
  for (const r of list) {
    r.ingredients = (r.ingredients || []).map((g) => (g.item_id !== undefined ? { type: 'Item', id: g.item_id, count: g.count } : g));
    state.recipes.set(r.id, r);
    if (!state.byOutput.has(r.output_item_id)) state.byOutput.set(r.output_item_id, []);
    state.byOutput.get(r.output_item_id).push(r);
    for (const g of r.ingredients) {
      if (g.type !== 'Item') continue;
      if (!state.byInput.has(g.id)) state.byInput.set(g.id, []);
      state.byInput.get(g.id).push(r.id);
    }
  }
}

// Eventos hacia la interfaz (reemplaza al SSE del servidor).
export const events = new EventTarget();
export function broadcast(event, payload) {
  const e = new Event(event);
  e.data = JSON.stringify(payload);
  events.dispatchEvent(e);
}

export function getConfig() { return {}; }
export function setConfig() { return {}; }
