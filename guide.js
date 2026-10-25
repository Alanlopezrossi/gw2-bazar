// "Guía" de un item: qué necesitás, paso a paso, disciplinas, logros involucrados y cómo conseguir lo que no se compra.
// Se arma sola con los datos del sitio (recetas, Forja Mística, planificador, logros, NPC, contenedores) y,
// para cadenas especiales que no salen de las recetas (ej. Mawdrey), con guías escritas a mano (src/guides.json).
import { state } from './store.js';
import { isGated } from './analysis.js';
import { planItem } from './planner.js';
import { achievementsFor } from './equipment.js';
import { howToObtain } from './obtain.js';
import { indexItem } from './catalog.js';

let GUIDES = null;
let byItem = new Map();
export function setGuides(data) {
  GUIDES = data?.guides ? data : null;
  byItem = new Map();
  for (const [k, g] of Object.entries(GUIDES?.guides || {})) for (const id of g.items || []) if (!byItem.has(id)) byItem.set(id, k);
}

const info = (id) => { const it = state.items.get(id) || indexItem(id); return { id, name: it?.name || `#${id}`, icon: it?.icon || null, rarity: it?.rarity || null }; };

/** "texto {{id}} y {{20×id}}" → partes [{t}, {id, qty, name, icon, rarity}] para pintar con links. */
function parts(text) {
  const out = [];
  let last = 0;
  for (const m of String(text).matchAll(/\{\{(?:(\d+)×)?(\d+)\}\}/g)) {
    if (m.index > last) out.push({ t: text.slice(last, m.index) });
    out.push({ ...info(Number(m[2])), qty: m[1] ? Number(m[1]) : null });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last) });
  return out;
}

function curated(id, mode) {
  const k = byItem.get(id);
  if (!k) return null;
  const g = GUIDES.guides[k];
  return {
    key: k,
    title: g.title,
    intro: parts(g.intro || ''),
    requires: (g.requires || []).map(parts),
    needs: (g.needs || []).map(([nid, qty]) => { const p = state.prices.get(nid); const unit = p ? (mode === 'order' && p.buy ? p.buy + 1 : p.sell || null) : null; return { ...info(nid), qty, unit, total: unit != null ? unit * qty : null }; }),
    sections: (g.sections || []).map((s) => ({ title: s.title, here: (s.items || []).includes(id), steps: s.steps.map(parts) })),
    source: GUIDES.source,
  };
}

/** Pasos de crafteo en orden (primero lo más profundo del árbol), sumando repetidos. */
function craftSteps(tree) {
  const map = new Map();
  let idx = 0;
  const walk = (n, depth) => {
    for (const c of n.children) walk(c, depth + 1);
    if (n.how !== 'crafteo' && n.how !== 'forja') return;
    const e = map.get(n.id);
    if (e) {
      e.crafts += n.crafts; e.depth = Math.max(e.depth, depth);
      for (const c of n.children) { const x = e.ings.get(c.id); if (x) x.total += c.per * n.crafts; }
      for (const c of n.cur || []) { const x = e.cur.find((y) => y.type === c.type && y.id === c.id); if (x) x.total += c.total; }
      return;
    }
    map.set(n.id, {
      id: n.id, name: n.name, icon: n.icon, rarity: n.rarity, how: n.how, crafts: n.crafts, out: n.out || 1,
      disciplines: n.disciplines || [], rating: n.rating || 0, needsRecipe: !!n.needsRecipe, gated: isGated(n.id),
      depth, order: idx++,
      ings: new Map(n.children.map((c) => [c.id, { id: c.id, name: c.name, icon: c.icon, rarity: c.rarity, per: c.per, total: c.per * n.crafts }])),
      cur: (n.cur || []).map((c) => ({ ...c })),
    });
  };
  walk(tree, 0);
  return [...map.values()].sort((a, b) => b.depth - a.depth || a.order - b.order).map((s) => ({ ...s, ings: [...s.ings.values()] }));
}

const brief = (o) => {
  if (o.vendors?.length) { const v = o.vendors[0]; return `lo vende ${v.vendor}${v.zone ? ` (${v.zone})` : ''}${v.cost ? ` por ${v.cost}` : ''}${o.vendors.length > 1 ? ` y ${o.vendors.length - 1} NPC más` : ''}`; }
  if (o.items?.length || o.extra?.length) { const l = [...(o.items || []).map((c) => c.name), ...(o.extra || [])]; return `sale de ${l.slice(0, 3).join(', ')}${l.length > 3 ? ` y ${l.length - 3} más` : ''}`; }
  if (o.achievements?.length) return `recompensa de «${o.achievements[0].name}»`;
  if (o.list?.length) return o.list[0];
  if (o.kind === 'forge') return 'Forja Mística';
  if (o.kind === 'craft') return o.text?.replace(/:$/, '') || 'crafteo';
  return o.title;
};

export function itemGuide(id, { mode = 'instant' } = {}) {
  const it = info(id);
  const out = { item: it, curated: curated(id, mode) };
  const hasRecipe = state.byOutput.has(id);
  if (hasRecipe) {
    const p = planItem(id, new Map(), { mode, withTree: true });
    const steps = craftSteps(p.tree);
    // Si algún paso usa el propio item (recetas de "degradar" que dan vueltas), el plan no tiene sentido.
    const cyclic = steps.some((st) => st.ings.some((x) => x.id === id));
    // Disciplinas: cada receta se puede hacer con CUALQUIERA de sus disciplinas → agrupamos por conjunto.
    const groups = new Map();
    for (const st of steps) if (st.how === 'crafteo' && st.disciplines.length) { const k = [...st.disciplines].sort().join('|'); const g = groups.get(k) || { ds: [...st.disciplines].sort(), r: 0, items: [] }; g.r = Math.max(g.r, st.rating); g.items.push(st.name); groups.set(k, g); }
    if (!cyclic) out.plan = {
      missingCost: p.missingCost,
      needs: p.missing.map((m) => ({ id: m.id, name: m.name, icon: m.icon, rarity: m.rarity, qty: m.qty, unit: m.unit, total: m.total, how: m.unit == null ? howToObtain(m.id).filter((o) => o.kind !== 'tp').slice(0, 2).map(brief) : null, usedFor: m.usedFor?.[0]?.name || '' })),
      currencies: p.currencies,
      steps,
      disciplines: [...groups.values()].sort((a, b) => b.r - a.r).map((g) => ({ ds: g.ds, r: g.r, items: g.items.slice(0, 4), more: Math.max(0, g.items.length - 4) })),
      forge: steps.some((s) => s.how === 'forja'),
      recipes: steps.filter((s) => s.needsRecipe).map((s) => s.name),
      gated: steps.filter((s) => s.gated).map((s) => s.name),
    };
  }
  // Cómo se consigue (si no tiene receta, es la guía principal)
  out.obtain = howToObtain(id).map((o) => ({ kind: o.kind, title: o.title, text: brief(o) }));
  // Logros: los que lo dan, los que lo piden, y los que dan componentes que no se compran
  const ach = achievementsFor(id);
  out.achievements = {
    reward: ach.filter((a) => a.role === 'recompensa').slice(0, 15),
    part: ach.filter((a) => a.role === 'parte').slice(0, 15),
    components: [],
  };
  if (out.plan) {
    const seen = new Set();
    for (const m of out.plan.needs.filter((x) => x.unit == null)) {
      for (const a of achievementsFor(m.id).filter((x) => x.role === 'recompensa')) {
        if (seen.has(a.id)) continue;
        seen.add(a.id);
        out.achievements.components.push({ ...a, item: m.name, itemId: m.id });
      }
    }
    out.achievements.components = out.achievements.components.slice(0, 20);
  }
  // Para qué sirve
  const usedIn = new Set();
  for (const rid of state.byInput.get(id) || []) { const r = state.recipes.get(rid); if (r) usedIn.add(r.output_item_id); }
  out.usedIn = [...usedIn].slice(0, 6).map(info);
  out.usedInTotal = usedIn.size;
  return out;
}
