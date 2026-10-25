// Planificador de legendarias: con lo que tenés (inventario), qué legendarias podés hacer y qué te falta.
// Recorre la receta de cada legendaria (crafteo + Forja Mística de la wiki) usando primero lo que ya tenés,
// en el nivel más alto posible (si tenés un Don de la suerte, no te pide sus componentes).
import { state } from './store.js';
import { bestRecipe, tpBuyPrice } from './analysis.js';
import { legendaryIds } from './equipment.js';
import { wikiEntry } from './wikidata.js';

const MAX_DEPTH = 12;

function recipeFor(id, mode) {
  const best = bestRecipe(id, mode);
  if (best) return { recipe: best.recipe, cost: best.cost };
  const l = state.byOutput.get(id);
  return l?.length ? { recipe: l[0], cost: null } : null;
}

/** ¿Algo de lo que tengo aparece en el árbol de este item? (para preferir craftearlo con lo mío). */
function makeOwnsBelow(inv) {
  const memo = new Map();
  const walk = (id, depth, stack) => {
    if (memo.has(id)) return memo.get(id);
    if (depth > MAX_DEPTH || stack.has(id)) return false;
    stack.add(id);
    let found = false;
    for (const r of state.byOutput.get(id) || []) {
      for (const g of r.ingredients || []) {
        if (g.type !== 'Item') continue;
        if ((inv.get(g.id) || 0) > 0 || walk(g.id, depth + 1, stack)) { found = true; break; }
      }
      if (found) break;
    }
    stack.delete(id);
    memo.set(id, found);
    return found;
  };
  return (id) => walk(id, 0, new Set());
}

/** Plan de una legendaria con el inventario dado. */
export function planItem(targetId, inventory, { mode = 'instant', withTree = false } = {}) {
  const inv = new Map(inventory);
  const left = new Map(inv);
  const ownsBelow = makeOwnsBelow(inv);
  const used = new Map();
  const missing = new Map();
  const crafted = new Map();
  const currencies = new Map();

  const parents = new Map(); // id -> Map(parentId -> cantidad por unidad del padre)
  const root = { id: targetId, per: 1, total: 1, have: 0, missing: 0, crafts: 0, how: '', children: [], cur: [] };

  function need(id, qty, depth, stack, node) {
    node.total = qty;
    const have = left.get(id) || 0;
    const u = Math.min(have, qty);
    if (u) { left.set(id, have - u); used.set(id, (used.get(id) || 0) + u); qty -= u; }
    node.have = u;
    if (qty <= 0) { node.how = 'tuyo'; return; }
    const rc = depth < MAX_DEPTH && !stack.has(id) ? recipeFor(id, mode) : null;
    const tp = tpBuyPrice(id, mode);
    // Lo crafteamos si no se vende, si craftearlo es más barato, o si tenemos partes de su receta.
    const expand = rc && (id === targetId || tp == null || (rc.cost != null && rc.cost < tp) || ownsBelow(id));
    if (!expand) {
      missing.set(id, (missing.get(id) || 0) + qty);
      node.missing = qty;
      node.how = tp != null ? 'comprar' : 'conseguir';
      node.unit = tp;
      return;
    }
    const r = rc.recipe;
    const crafts = Math.ceil(qty / (r.output_item_count || 1));
    node.crafts = crafts;
    node.out = r.output_item_count || 1;
    node.how = r.id < 0 ? 'forja' : 'crafteo';
    node.disciplines = r.disciplines || [];
    node.rating = r.min_rating || 0;
    node.needsRecipe = r.flags?.includes('LearnedFromItem') || false;
    if (id !== targetId) crafted.set(id, (crafted.get(id) || 0) + crafts);
    stack.add(id);
    for (const g of r.ingredients || []) {
      if (g.type === 'Item') {
        if (!parents.has(g.id)) parents.set(g.id, new Map());
        const pm = parents.get(g.id);
        if (!pm.has(id)) pm.set(id, { count: g.count, out: r.output_item_count || 1 });
        const child = { id: g.id, per: g.count, total: 0, have: 0, missing: 0, crafts: 0, how: '', children: [], cur: [] };
        node.children.push(child);
        need(g.id, g.count * crafts, depth + 1, stack, child);
      } else {
        currencies.set(`${g.type}:${g.id}`, (currencies.get(`${g.type}:${g.id}`) || 0) + g.count * crafts);
        node.cur.push({ type: g.type, id: g.id, per: g.count, total: g.count * crafts });
      }
    }
    stack.delete(id);
  }
  need(targetId, 1, 0, new Set(), root);

  const info = (id) => { const it = state.items.get(id); return { id, name: it?.name || `#${id}`, nameEn: it?.nameEn || '', icon: it?.icon || null, rarity: it?.rarity || null, type: it?.type || null }; };
  let missingCost = 0, untradable = 0;
  const missingList = [...missing].map(([id, qty]) => {
    const unit = tpBuyPrice(id, mode);
    if (unit != null) missingCost += unit * qty; else untradable++;
    const w = wikiEntry(id);
    const usedFor = [...(parents.get(id) || [])].map(([pid, x]) => ({ id: pid, name: info(pid).name, per: x.count, out: x.out }));
    return { ...info(id), qty, unit, total: unit != null ? unit * qty : null, usedFor, vendor: w?.soldBy?.[0] ? { vendor: w.soldBy[0].vendor, zone: w.soldBy[0].zone, cost: w.soldBy[0].cost } : null };
  }).sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
  const usedList = [...used].map(([id, qty]) => ({ ...info(id), qty, value: (tpBuyPrice(id, mode) || 0) * qty }));
  // Árbol con nombres e íconos (sólo cuando se pide el detalle de una legendaria).
  const dress = (n) => {
    const i = info(n.id);
    return { id: n.id, name: i.name, icon: i.icon, rarity: i.rarity, per: n.per, total: n.total, have: n.have, missing: n.missing, how: n.how, crafts: n.crafts, out: n.out, unit: n.unit ?? null, disciplines: n.disciplines, rating: n.rating, needsRecipe: n.needsRecipe, cur: n.cur, children: n.children.map(dress) };
  };
  return {
    tree: withTree ? dress(root) : undefined,
    target: info(targetId),
    missing: missingList,
    used: usedList.sort((a, b) => b.value - a.value),
    crafted: [...crafted].map(([id, n]) => ({ ...info(id), crafts: n })),
    currencies: [...currencies].map(([k, qty]) => { const [type, id] = k.split(':'); return { type, id: Number(id), qty }; }),
    missingCost: Math.round(missingCost),
    untradableMissing: untradable,
  };
}

/** Todas las legendarias, ordenadas por cuánto te falta (las que usan algo tuyo primero). */
const baseCache = new Map();
export function planAll(inventory, { mode = 'instant', limit = 60 } = {}) {
  const inv = new Map(inventory);
  const out = [];
  for (const id of legendaryIds()) {
    if (!state.byOutput.has(id)) continue;
    const p = planItem(id, inv, { mode });
    const key = `${id}|${mode}`;
    let base = baseCache.get(key);
    if (!base || Date.now() - base.at > 10 * 60_000) { const b = planItem(id, new Map(), { mode }); base = { at: Date.now(), cost: b.missingCost, untr: b.untradableMissing, n: b.missing.length }; baseCache.set(key, base); }
    const usedValue = p.used.reduce((a, u) => a + u.value, 0);
    // Progreso: cuánto del costo total (en el bazar) ya cubre lo que tenés.
    const progress = base.cost > 0 ? Math.max(0, Math.min(1, 1 - p.missingCost / base.cost)) : (p.used.length ? 0.5 : 0);
    out.push({ ...p.target, usesMine: p.used.length, usedValue, missingCost: p.missingCost, untradableMissing: p.untradableMissing, missingCount: p.missing.length, baseCost: base.cost, progress });
  }
  // Primero las que usan algo tuyo; después las que menos cosas no comprables te piden; después las más baratas.
  out.sort((a, b) => (b.usesMine > 0) - (a.usesMine > 0) || a.untradableMissing - b.untradableMissing || a.missingCost - b.missingCost);
  return { total: out.length, rows: out.slice(0, limit), withMine: out.filter((r) => r.usesMine).length };
}
