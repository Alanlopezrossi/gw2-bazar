// Reemplaza al servidor: atiende las mismas rutas /api/* dentro del navegador.
import { state, loadCache, events } from './store.js';
import { startScheduler } from './sync.js';
import { listItems, flips, demand, craftingProfits } from './analysis.js';
import { itemDetail } from './sources.js';
import { acquisition } from './wiki.js';
import { TYPES, RARITIES, RARITY_ORDER, DISCIPLINES, GAME_TYPES, RECIPE_FLAGS } from './i18n.js';

export const localEvents = events;

const ready = (async () => {
  await loadCache();
  startScheduler();
})();

function num(v, d = 0) {
  if (v == null || v === '') return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

const routes = {
  '/api/status': () => ({
    publicMode: true,
    phase: state.sync.phase,
    progress: state.sync.progress,
    errors: state.sync.errors.slice(0, 5),
    counts: { items: state.items.size, prices: state.prices.size, volume: state.volume.size, recipes: state.recipes.size },
    meta: state.meta,
    hasKey: false,
    now: Date.now(),
  }),
  '/api/meta': () => ({ types: TYPES, rarities: RARITIES, rarityOrder: RARITY_ORDER, disciplines: DISCIPLINES, gameTypes: GAME_TYPES, recipeFlags: RECIPE_FLAGS }),
  '/api/items': (q) => listItems({
    q: q.get('q') || '', type: q.get('type') || '', rarity: q.get('rarity') || '', sort: q.get('sort') || 's1', dir: q.get('dir') || 'desc',
    page: num(q.get('page'), 1), limit: Math.min(1000, num(q.get('limit'), 100)), minVol: num(q.get('minVol'), 0), onlyFlip: q.get('onlyFlip') === '1',
  }),
  '/api/recs/flips': (q) => flips({
    minProfit: num(q.get('minProfit'), 100), minRoi: num(q.get('minRoi'), 5) / 100, maxRoi: num(q.get('maxRoi'), 200) / 100, minVol: num(q.get('minVol'), 25),
    maxBuy: num(q.get('maxBuy'), 0), type: q.get('type') || '', rarity: q.get('rarity') || '', q: q.get('q') || '', limit: Math.min(300, num(q.get('limit'), 100)),
  }),
  '/api/recs/demand': (q) => demand({
    type: q.get('type') || '', rarity: q.get('rarity') || '', q: q.get('q') || '', cat: q.get('cat') || '', minPrice: num(q.get('minPrice'), 0),
    minSold: num(q.get('minSold'), 50), maxDays: num(q.get('maxDays'), 0), sort: q.get('sort') === 'unit' ? 'unit' : 'value', limit: Math.min(300, num(q.get('limit'), 100)),
  }),
  '/api/recs/crafting': (q) => craftingProfits({
    mode: q.get('mode') === 'order' ? 'order' : 'instant', minProfit: num(q.get('minProfit'), 100), minRoi: num(q.get('minRoi'), 5) / 100, minVol: num(q.get('minVol'), 10),
    autoOnly: q.get('autoOnly') === '1', discipline: q.get('discipline') || '', type: q.get('type') || '', rarity: q.get('rarity') || '', q: q.get('q') || '',
    limit: Math.min(300, num(q.get('limit'), 100)),
  }),
};

export async function localApi(path) {
  const url = new URL(path, 'http://local');
  if (url.pathname !== '/api/meta') await ready;
  try {
    const m = url.pathname.match(/^\/api\/item\/(\d+)(\/wiki)?$/);
    if (m) {
      const id = Number(m[1]);
      if (m[2]) return { status: 200, body: await acquisition(id, { force: url.searchParams.get('force') === '1' }) };
      const d = await itemDetail(id, { mode: url.searchParams.get('mode') === 'order' ? 'order' : 'instant' });
      return d ? { status: 200, body: d } : { status: 404, body: { error: 'Item no encontrado (¿todavía cargando?)' } };
    }
    const fn = routes[url.pathname];
    if (!fn) return { status: 403, body: { error: 'Esta sección sólo está disponible en la versión local.' } };
    return { status: 200, body: await fn(url.searchParams) };
  } catch (e) {
    console.error(e);
    return { status: 500, body: { error: e.message } };
  }
}
