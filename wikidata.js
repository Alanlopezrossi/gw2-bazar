// Datos extraídos de la wiki oficial (copia archivada en archive.org): recetas de la Forja Mística
// y de otras fuentes que la API oficial no trae, más vendedores (NPC, zona, costo), contenedores,
// recolección y reward tracks. Se generan con scripts/ y viven en src/wiki-data.json.
import { state } from './store.js';

let DATA = null; // { at, source, items: { [id]: entry }, shops: [...] }
let GEN = 0;

export function setWikiData(data) {
  DATA = data && data.items ? data : null;
  GEN++;
  mergeWikiRecipes();
}

export function wikiEntry(id) {
  return DATA?.items?.[id] || null;
}

export function allWikiEntries() {
  return DATA?.items || {};
}

/** Tiendas de NPC por moneda (sección "Currency for" de cada moneda en la wiki). */
export function wikiGen() {
  return GEN;
}

export function wikiShops() {
  return DATA?.shops || [];
}

export function wikiMeta() {
  return DATA ? { at: DATA.at, source: DATA.source, count: Object.keys(DATA.items).length } : null;
}

/** ¿Usamos la receta de la wiki para este item? Sólo si la API oficial no trae ninguna, y para
 *  items que no se consiguen fácil en el bazar (no comerciables, legendarios, ascendidos o armas/precursores).
 *  Así evitamos recetas "de azar" de la Forja para materiales comunes (ej. Esquirla de obsidiana). */
function useWikiRecipe(id) {
  if (state.byOutput.get(id)?.some((r) => r.id > 0)) return false;
  const it = state.items.get(id);
  if (!state.prices.has(id)) return true;
  return ['Legendary', 'Ascended'].includes(it?.rarity) || it?.type === 'Weapon';
}

/** Agrega las recetas de la wiki como recetas "virtuales" (id negativo) al índice de recetas. */
export function mergeWikiRecipes() {
  // Sacamos las virtuales anteriores (por si se recargan las recetas oficiales).
  for (const [rid, r] of [...state.recipes]) {
    if (rid >= 0) continue;
    state.recipes.delete(rid);
    const outs = state.byOutput.get(r.output_item_id);
    if (outs) {
      const left = outs.filter((x) => x.id !== rid);
      if (left.length) state.byOutput.set(r.output_item_id, left);
      else state.byOutput.delete(r.output_item_id);
    }
    for (const g of r.ingredients) {
      const ins = state.byInput.get(g.id);
      if (ins) state.byInput.set(g.id, ins.filter((x) => x !== rid));
    }
  }
  state.meta.wikiAt = Date.now();
  if (!DATA) return;
  let next = -1;
  for (const [idStr, e] of Object.entries(DATA.items)) {
    const id = Number(idStr);
    if (!e.recipes?.length || !useWikiRecipe(id)) continue;
    for (const wr of e.recipes) {
      const ings = wr.ingredients.filter((g) => g.id);
      if (!ings.length || ings.length < wr.ingredients.length) continue; // receta incompleta: no la usamos para costear
      const r = {
        id: next--,
        type: 'Wiki',
        output_item_id: id,
        output_item_count: wr.outQty || 1,
        disciplines: [wr.source || 'Mystic Forge'],
        min_rating: Number(String(wr.rating || '').replace(/\D/g, '')) || 0,
        flags: ['Wiki'],
        ingredients: ings.map((g) => ({ type: 'Item', id: g.id, count: g.count })),
        chat_link: null,
      };
      state.recipes.set(r.id, r);
      if (!state.byOutput.has(id)) state.byOutput.set(id, []);
      state.byOutput.get(id).push(r);
      for (const g of r.ingredients) {
        if (!state.byInput.has(g.id)) state.byInput.set(g.id, []);
        state.byInput.get(g.id).push(r.id);
      }
    }
  }
}

/** Ids de items mencionados por la wiki que todavía no tenemos (para pedir nombre/ícono a la API). */
export function wikiItemIds() {
  if (!DATA) return [];
  const s = new Set();
  for (const [id, e] of Object.entries(DATA.items)) {
    s.add(Number(id));
    for (const r of e.recipes || []) for (const g of r.ingredients) if (g.id) s.add(g.id);
  }
  return [...s];
}
