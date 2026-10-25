// Guía propia para subir una disciplina de crafteo (0 → máximo), armada con las recetas de la API y los precios del bazar.
// Modelo de experiencia APROXIMADO: cada tramo de 25 niveles pide ~150 "puntos"; un refinamiento vale 1,
// un componente / insignia / inscripción 2,5 y un objeto final 7 (porque además suele dar el bonus de descubrimiento).
import { state } from './store.js';
import { recipeCost, tpBuyPrice, isGated } from './analysis.js';
import { indexItem } from './catalog.js';

const BAND = 25;
const POINTS_PER_BAND = 150;
const weightOf = (r) => (/^Refinement/.test(r.type || '') ? 1 : /^(Component|Insignia|Inscription|Bulk|Bolt|LegendaryComponent)$/.test(r.type || '') ? 2.5 : 7);
const kindOf = (r) => (/^Refinement/.test(r.type || '') ? 'refinamiento' : /^(Component|Insignia|Inscription|Bulk)$/.test(r.type || '') ? 'componente' : 'objeto final (da descubrimiento)');
const info = (id) => { const it = state.items.get(id) || indexItem(id); return { id, name: it?.name || `#${id}`, icon: it?.icon || null, rarity: it?.rarity || null }; };

export function disciplineMax(disc) {
  let m = 0;
  for (const r of state.recipes.values()) if (r.id > 0 && r.disciplines?.includes(disc)) m = Math.max(m, r.min_rating || 0);
  return Math.ceil(m / BAND) * BAND;
}

export function levelingPlan(disc, { mode = 'instant', from = 0, to = 0 } = {}) {
  const max = disciplineMax(disc);
  to = Math.min(to || max, max);
  from = Math.max(0, Math.min(from, to));
  // Recetas candidatas: oficiales, de esta disciplina, que no piden aprender receta y cuyo costo se puede calcular.
  const cand = [];
  for (const r of state.recipes.values()) {
    if (r.id < 0 || !r.disciplines?.includes(disc)) continue;
    if (r.flags?.includes('LearnedFromItem') || isGated(r.output_item_id)) continue;
    const cost = recipeCost(r, mode, new Set([r.output_item_id]));
    if (cost == null) continue;
    // Lo que se crea, si se vende, recupera parte del costo (85% del precio de venta).
    const sell = tpBuyPrice(r.output_item_id, 'order') ? (state.prices.get(r.output_item_id)?.buy || 0) * 0.85 : 0;
    const unitCost = cost * (r.output_item_count || 1); // costo de UNA fabricación
    // Lo que se recupera vendiendo lo crafteado (tope: el costo, para no contar ganancias de items con pocas órdenes).
    const back = Math.min(sell * (r.output_item_count || 1), unitCost);
    cand.push({ r, rating: r.min_rating || 0, w: weightOf(r), unitCost, back, net: Math.max(1, unitCost - back) });
  }
  const bands = [];
  const shop = new Map();
  let total = 0, totalBack = 0;
  for (let lo = Math.floor(from / BAND) * BAND; lo < to; lo += BAND) {
    const hi = Math.min(lo + BAND, to);
    // Sirven recetas desde ~20 niveles por debajo hasta el nivel actual (las muy bajas casi no dan experiencia).
    let pool = cand.filter((c) => c.rating <= lo && c.rating >= Math.max(0, lo - 25));
    if (!pool.length) pool = cand.filter((c) => c.rating <= lo && c.rating >= Math.max(0, lo - 75));
    if (!pool.length) { bands.push({ from: lo, to: hi, picks: [], note: 'No encontré recetas comprables para este tramo.' }); continue; }
    pool.sort((a, b) => a.net / a.w - b.net / b.w);
    // Repartimos entre las 3 más baratas por punto (para no vaciar el bazar de un solo material).
    const top = pool.slice(0, 3);
    const share = [0.5, 0.3, 0.2].slice(0, top.length);
    const sum = share.reduce((a, b) => a + b, 0);
    const picks = top.map((c, i) => {
      const crafts = Math.max(1, Math.ceil((POINTS_PER_BAND * (share[i] / sum)) / c.w));
      const ings = c.r.ingredients.filter((g) => g.type === 'Item').map((g) => ({ ...info(g.id), per: g.count, total: g.count * crafts, unit: tpBuyPrice(g.id, mode) }));
      for (const g of ings) { const e = shop.get(g.id) || { ...g, total: 0 }; e.total += g.total; shop.set(g.id, e); }
      total += c.unitCost * crafts;
      totalBack += c.back * crafts;
      return { ...info(c.r.output_item_id), recipeId: c.r.id, rating: c.rating, kind: kindOf(c.r), crafts, out: c.r.output_item_count || 1, unitCost: Math.round(c.unitCost), cost: Math.round(c.unitCost * crafts), back: Math.round(c.back * crafts), autoLearned: c.r.flags?.includes('AutoLearned') || false, ingredients: ings };
    });
    bands.push({ from: lo, to: hi, picks });
  }
  const shopping = [...shop.values()].map((s) => ({ ...s, cost: s.unit != null ? Math.round(s.unit * s.total) : null })).sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0));
  return { disc, from, to, max, bands, shopping, total: Math.round(total), back: Math.round(totalBack) };
}

