// Reemplaza al servidor: atiende las mismas rutas /api/* dentro del navegador.
import { state, loadCache, events } from './store.js';
import { startScheduler } from './sync.js';
import { setWikiData } from './wikidata.js';
import { setEquipmentData, listEquipment } from './equipment.js';
import { setGeoData, vendorMarkers } from './vendors.js';
import { setCatalog, setAchItems, setExtraItems, searchCatalog, indexItem } from './catalog.js';
import { syncItems } from './sync.js';
import { accountSummary, tokenInfo, accountInventory } from './account.js';
import { planAll, planItem } from './planner.js';
import { listRecipes, professionsSummary } from './professions.js';
import { itemGuide, setGuides, guidesList } from './guide.js';
import { levelingPlan } from './leveling.js';
import { getAuthed } from './gw2api.js';
import { containerContents, setContainersSnapshot } from './containers.js';
import { listItems, flips, demand, craftingProfits } from './analysis.js';
import { itemDetail } from './sources.js';
import { acquisition } from './wiki.js';
import { achievementGuide } from './achguide.js';
import { TYPES, RARITIES, RARITY_ORDER, DISCIPLINES, GAME_TYPES, RECIPE_FLAGS, SUBTYPES, WEIGHTS } from './i18n.js';

export const localEvents = events;

const ready = (async () => {
  await loadCache();
  try { setWikiData(await (await fetch('wiki-data.json')).json()); } catch (e) { console.warn('sin wiki-data.json', e); }
  try { setEquipmentData(await (await fetch('equipment.json')).json()); } catch (e) { console.warn('sin equipment.json', e); }
  try { setGeoData(await (await fetch('geo.json')).json()); } catch (e) { console.warn('sin geo.json', e); }
  // Logros por item: chico, se carga siempre (la ficha lo usa).
  try { setAchItems(await (await fetch('ach-items.json')).json()); } catch (e) { console.warn('sin ach-items.json', e); }
  startScheduler();
})();

// El índice de todos los items pesa varios MB: sólo se baja la primera vez que se usa la pestaña Items.
let catalogP = null;
let guidesP = null;
let containersP = null;
function loadCatalog() {
  if (!catalogP) {
    catalogP = Promise.all([
      fetch('items-extra.json').then((r) => (r.ok ? r.json() : null)).then(setExtraItems).catch(() => {}),
      fetch('items-index.json').then((r) => r.json()),
    ]).then(([, idx]) => setCatalog(idx)).catch((e) => { catalogP = null; throw e; });
  }
  return catalogP;
}

const KEY_STORE = 'gw2-bazar-apikey';
function getKey() { try { return localStorage.getItem(KEY_STORE) || ''; } catch { return ''; } }
function setKey(k) { try { if (k) localStorage.setItem(KEY_STORE, k); else localStorage.removeItem(KEY_STORE); } catch { /* sin almacenamiento */ } }

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
    hasKey: !!getKey(),
    browserKey: true,
    now: Date.now(),
  }),
  '/api/meta': () => ({ types: TYPES, rarities: RARITIES, rarityOrder: RARITY_ORDER, disciplines: DISCIPLINES, gameTypes: GAME_TYPES, recipeFlags: RECIPE_FLAGS, subtypes: SUBTYPES, weights: WEIGHTS }),
  '/api/vendors': () => vendorMarkers(),
  '/api/leveling': (q) => levelingPlan(q.get('disc') || 'Artificer', { mode: q.get('mode') === 'order' ? 'order' : 'instant', from: Number(q.get('from')) || 0, to: Number(q.get('to')) || 0 }),
  '/api/guides': async () => { if (!guidesP) guidesP = fetch('guides.json').then((r) => (r.ok ? r.json() : null)).then(setGuides).catch(() => {}); await guidesP; return { guides: guidesList() }; },
  '/api/professions': (q) => q.get('summary') === '1' ? professionsSummary() : listRecipes({ disc: q.get('disc') || '', q: q.get('q') || '', cat: q.get('cat') || '', rarity: q.get('rarity') || '', type: q.get('type') || '', minR: Number(q.get('minR')) || 0, maxR: Number(q.get('maxR')) || 500, sort: q.get('sort') || '', dir: q.get('dir') || 'asc', page: Number(q.get('page')) || 1, limit: Math.min(500, Number(q.get('limit')) || 50), mode: q.get('mode') === 'order' ? 'order' : 'instant' }),
  // "Mi cuenta" en la versión pública: la API key queda guardada sólo en el navegador de quien la carga.
  '/api/config': async (_q, opts) => {
    if ((opts?.method || 'GET') === 'POST') {
      const body = JSON.parse(opts.body || '{}');
      const apiKey = String(body.apiKey || '').trim();
      if (!apiKey) { setKey(''); return { ok: true, hasKey: false }; }
      if (!/^[A-F0-9-]{60,80}$/i.test(apiKey)) return [400, { error: 'Eso no parece una API key de GW2 (formato XXXXXXXX-XXXX-...).' }];
      try {
        const info = await tokenInfo(apiKey);
        setKey(apiKey);
        return { ok: true, hasKey: true, name: info.name, permissions: info.permissions };
      } catch (e) { return [400, { error: `La key no es válida: ${e.message}` }]; }
    }
    const k = getKey();
    return { hasKey: !!k, keyPreview: k ? `${k.slice(0, 8)}…${k.slice(-4)}` : '', browserKey: true };
  },
  '/api/account': async (q) => {
    const key = getKey();
    if (!key) return [400, { error: 'Cargá tu API key en ⚙ Ajustes para ver tu cuenta.' }];
    try { return await accountSummary(key, { force: q.get('force') === '1' }); } catch (e) { return [502, { error: `La API de GW2 rechazó la consulta: ${e.message}` }]; }
  },
  '/api/account/achievements': async () => {
    const key = getKey();
    if (!key) return [400, { error: 'Cargá tu API key en ⚙ Ajustes para ver tu progreso.' }];
    return { progress: await getAuthed('account/achievements', key) };
  },
  '/api/refresh': () => ({ ok: true }),
  '/api/planner': (_q, opts) => {
    const body = JSON.parse(opts?.body || '{}');
    const inv = new Map(Object.entries(body.inv || {}).map(([k, v]) => [Number(k), Number(v) || 0]).filter(([k, v]) => k && v > 0));
    const mode = body.mode === 'order' ? 'order' : 'instant';
    return body.target ? planItem(Number(body.target), inv, { mode, withTree: true }) : planAll(inv, { mode, limit: Math.min(500, Number(body.limit) || 60) });
  },
  '/api/account/inventory': async () => {
    const key = getKey();
    if (!key) return [400, { error: 'Cargá tu API key en ⚙ Ajustes para importar tu inventario.' }];
    try { return await accountInventory(key); } catch (e) { return [502, { error: `La API de GW2 rechazó la consulta: ${e.message}` }]; }
  },
  '/api/catalog': async (q) => {
    await loadCatalog();
    return searchCatalog({ q: q.get('q') || '', type: q.get('type') || '', rarity: q.get('rarity') || '', source: q.get('source') || '', sort: q.get('sort') || '', dir: q.get('dir') || 'asc', page: num(q.get('page'), 1), limit: Math.min(1000, num(q.get('limit'), 50)) });
  },
  '/api/ach-guide': (q) => achievementGuide(q.get('title') || '', { id: Number(q.get('id')) || 0, cat: q.get('cat') || '' }),
  '/api/equipment': (q) => listEquipment({ q: q.get('q') || '', rarity: q.get('rarity') || '', type: q.get('type') || '', sub: q.get('sub') || '', weight: q.get('weight') || '', source: q.get('source') || '', sort: q.get('sort') || 'name', dir: q.get('dir') || 'asc', page: num(q.get('page'), 1), limit: Math.min(1000, num(q.get('limit'), 100)), mode: q.get('mode') === 'order' ? 'order' : 'instant' }),
  '/api/items': (q) => listItems({
    q: q.get('q') || '', type: q.get('type') || '', rarity: q.get('rarity') || '', sort: q.get('sort') || 's1', dir: q.get('dir') || 'desc',
    page: num(q.get('page'), 1), limit: Math.min(1000, num(q.get('limit'), 100)), minVol: num(q.get('minVol'), 0), onlyFlip: q.get('onlyFlip') === '1',
  }),
  '/api/recs/flips': (q) => flips({
    minProfit: num(q.get('minProfit'), 100), minRoi: num(q.get('minRoi'), 5) / 100, maxRoi: num(q.get('maxRoi'), 200) / 100, minVol: num(q.get('minVol'), 25),
    maxBuy: num(q.get('maxBuy'), 0), type: q.get('type') || '', rarity: q.get('rarity') || '', q: q.get('q') || '', limit: Math.min(100000, num(q.get('limit'), 100)),
  }),
  '/api/recs/demand': (q) => demand({
    type: q.get('type') || '', rarity: q.get('rarity') || '', q: q.get('q') || '', cat: q.get('cat') || '', minPrice: num(q.get('minPrice'), 0),
    minSold: num(q.get('minSold'), 50), maxDays: num(q.get('maxDays'), 0), sort: q.get('sort') === 'unit' ? 'unit' : 'value', limit: Math.min(100000, num(q.get('limit'), 100)),
  }),
  '/api/recs/crafting': (q) => craftingProfits({
    mode: q.get('mode') === 'order' ? 'order' : 'instant', minProfit: num(q.get('minProfit'), 100), minRoi: num(q.get('minRoi'), 5) / 100, minVol: num(q.get('minVol'), 10),
    autoOnly: q.get('autoOnly') === '1', discipline: q.get('discipline') || '', type: q.get('type') || '', rarity: q.get('rarity') || '', q: q.get('q') || '',
    limit: Math.min(100000, num(q.get('limit'), 100)),
  }),
};

export async function localApi(path, opts) {
  const url = new URL(path, 'http://local');
  if (url.pathname !== '/api/meta') await ready;
  try {
    if (/^\/api\/item\/\d+/.test(url.pathname)) {
      if (!containersP) containersP = fetch('containers.json').then((r) => (r.ok ? r.json() : null)).then(setContainersSnapshot).catch(() => {});
      await containersP;
    }
    const mg = url.pathname.match(/^\/api\/item\/(\d+)\/guide$/);
    if (mg) {
      if (!guidesP) guidesP = fetch('guides.json').then((r) => (r.ok ? r.json() : null)).then(setGuides).catch(() => {});
      await guidesP;
      const gid = Number(mg[1]);
      if (!state.items.has(gid) && !state.prices.has(gid)) { const ix = indexItem(gid); if (ix) state.items.set(gid, { vendor: 0, flags: [], gameTypes: [], desc: '', icon: null, ...ix }); }
      return { status: 200, body: itemGuide(gid, { mode: url.searchParams.get('mode') === 'order' ? 'order' : 'instant' }) };
    }
    const mc = url.pathname.match(/^\/api\/item\/(\d+)\/contents$/);
    if (mc) {
      return { status: 200, body: await containerContents(Number(mc[1]), { live: false }) };
    }
    const m = url.pathname.match(/^\/api\/item\/(\d+)(\/wiki)?$/);
    if (m) {
      const id = Number(m[1]);
      if (m[2]) return { status: 200, body: await acquisition(id, { force: url.searchParams.get('force') === '1' }) };
      if (!state.items.has(id) && !state.prices.has(id)) { try { await syncItems([id]); } catch { /* sigue */ } }
      if (!state.items.has(id) && !state.prices.has(id)) { try { await loadCatalog(); } catch { /* sigue */ } }
      if (!state.items.has(id) && !state.prices.has(id)) { const ix = indexItem(id); if (ix) state.items.set(id, { vendor: 0, flags: [], gameTypes: [], desc: '', icon: null, ...ix }); }
      const d = await itemDetail(id, { mode: url.searchParams.get('mode') === 'order' ? 'order' : 'instant' });
      return d ? { status: 200, body: d } : { status: 404, body: { error: 'Item no encontrado (¿todavía cargando?)' } };
    }
    const fn = routes[url.pathname];
    if (!fn) return { status: 403, body: { error: 'Esta sección sólo está disponible en la versión local.' } };
    const out = await fn(url.searchParams, opts);
    if (Array.isArray(out) && typeof out[0] === 'number') return { status: out[0], body: out[1] };
    return { status: 200, body: out };
  } catch (e) {
    console.error(e);
    return { status: 500, body: { error: e.message } };
  }
}
