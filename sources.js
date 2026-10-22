// Ficha completa de un item: precio en vivo, cómo conseguirlo y para qué se usa.
import { getJSON, GW2_BASE } from './gw2api.js';
import { state } from './store.js';
import { row, net, craftTree, bestRecipe, tpBuyPrice, vol } from './analysis.js';
import { GENERIC_HINTS } from './i18n.js';
import { wikiEntry, wikiMeta } from './wikidata.js';

/** Resumen corto de cómo se obtiene un item según la wiki (para hojas del árbol). */
export function obtainSummary(id) {
  const w = wikiEntry(id);
  if (!w) return null;
  const out = [];
  for (const v of (w.soldBy || []).slice(0, 2)) out.push({ kind: 'npc', text: `${v.vendor}${v.area || v.zone ? ` (${[v.area, v.zone].filter(Boolean).join(', ')})` : ''}${v.cost ? ` — ${v.cost}` : ''}` });
  for (const t of (w.rewardTracks || []).slice(0, 1)) out.push({ kind: 'track', text: t });
  for (const t of (w.rewardedBy || []).slice(0, 1)) out.push({ kind: 'reward', text: t });
  for (const t of (w.containedIn || []).slice(0, 2)) out.push({ kind: 'container', text: t });
  for (const t of (w.gathered || []).slice(0, 1)) out.push({ kind: 'gather', text: t });
  if (!out.length && w.note) out.push({ kind: 'note', text: w.note.slice(0, 160) });
  return out.length ? out : null;
}

function annotate(n) {
  if (!n || n.currency) return;
  if (n.tpUnit == null && n.craftUnit == null) n.obtain = obtainSummary(n.id);
  n.children.forEach(annotate);
}

/** Recetas del item (todas), con ingredientes directos y de dónde sale cada uno. */
function recipesOf(id) {
  return (state.byOutput.get(id) || []).map((r) => ({
    id: r.id,
    disciplines: r.disciplines,
    minRating: r.min_rating,
    outCount: r.output_item_count || 1,
    autoLearned: r.flags?.includes('AutoLearned') || false,
    needsRecipe: r.flags?.includes('LearnedFromItem') || false,
    timeMs: r.time_to_craft_ms || 0,
    fromWiki: r.id < 0,
    chat: r.chat_link,
    ingredients: r.ingredients.map((g) => {
      if (g.type !== 'Item') return { kind: g.type, id: g.id, count: g.count, coin: g.type === 'Currency' && g.id === 1 };
      const it = state.items.get(g.id);
      const p = state.prices.get(g.id);
      return {
        kind: 'Item',
        id: g.id,
        count: g.count,
        name: it?.name || `#${g.id}`,
        icon: it?.icon || null,
        rarity: it?.rarity || null,
        tradable: !!p,
        unit: p ? p.sell || (p.buy ? p.buy + 1 : null) : null,
        craftable: state.byOutput.has(g.id),
        obtain: !p && !state.byOutput.has(g.id) ? obtainSummary(g.id) : null,
      };
    }),
  }));
}

/** Lista de compras: materiales base que hay que conseguir siguiendo el camino más barato del árbol. */
function shoppingList(tree) {
  const leaves = new Map();
  let coins = 0;
  const crafts = [];
  (function walk(n, root) {
    if (n.currency) {
      if (n.coin) coins += n.qty;
      else {
        const k = `${n.currency}:${n.id}`;
        const e = leaves.get(k) || { kind: n.currency, id: n.id, qty: 0, name: `${n.currency} #${n.id}` };
        e.qty += n.qty;
        leaves.set(k, e);
      }
      return;
    }
    // La raíz siempre se craftea (es la lista para crearlo); abajo, lo que sea más barato.
    const craftIt = n.children.length && (root || n.chosen === 'craft' || n.tpUnit == null);
    if (craftIt) {
      crafts.push({ id: n.id, name: n.name, icon: n.icon, rarity: n.rarity, qty: n.qty, disciplines: n.recipe?.disciplines || [], minRating: n.recipe?.minRating, needsRecipe: n.recipe?.flags?.includes('LearnedFromItem'), gated: n.gated });
      n.children.forEach((c) => walk(c, false));
      return;
    }
    const e = leaves.get(n.id) || { kind: 'Item', id: n.id, name: n.name, icon: n.icon, rarity: n.rarity, qty: 0, unit: n.tpUnit, tradable: n.tradable, obtain: n.obtain || null };
    e.qty += n.qty;
    leaves.set(n.id, e);
  })(tree, true);
  const items = [...leaves.values()].sort((a, b) => (b.unit || 0) * b.qty - (a.unit || 0) * a.qty);
  const total = items.reduce((t, e) => t + (e.unit || 0) * e.qty, 0) + coins;
  return { items, coins, total, missing: items.filter((e) => e.kind === 'Item' && e.unit == null).length, crafts: crafts.slice(1) };
}

async function liveListings(id) {
  try {
    const { data } = await getJSON(`${GW2_BASE}/v2/commerce/listings/${id}`, { retries: 1, timeout: 15000, limited: false });
    return {
      buys: (data.buys || []).slice(0, 8),
      sells: (data.sells || []).slice(0, 8),
      at: Date.now(),
    };
  } catch {
    return null;
  }
}

function usedIn(id, limit = 30) {
  const rids = state.byInput.get(id) || [];
  const seen = new Map();
  for (const rid of rids) {
    const r = state.recipes.get(rid);
    if (!r) continue;
    const g = r.ingredients.find((x) => x.type === 'Item' && x.id === id);
    const out = r.output_item_id;
    if (seen.has(out)) continue;
    const it = state.items.get(out);
    const p = state.prices.get(out);
    seen.set(out, {
      id: out,
      name: it?.name || `#${out}`,
      icon: it?.icon || null,
      rarity: it?.rarity || null,
      need: g?.count || 0,
      disciplines: r.disciplines,
      sell: p?.sell || 0,
      s1: vol(out)?.s1 ?? null,
    });
  }
  return {
    total: seen.size,
    list: [...seen.values()].sort((a, b) => (b.s1 ?? -1) - (a.s1 ?? -1)).slice(0, limit),
  };
}

export async function itemDetail(id, { mode = 'instant' } = {}) {
  const it = state.items.get(id);
  if (!it && !state.prices.has(id)) return null;
  const r = row(id);
  const p = state.prices.get(id);
  const listings = p ? await liveListings(id) : null;
  const best = bestRecipe(id, mode);
  const tp = tpBuyPrice(id, mode);
  const tree = state.byOutput.has(id) ? craftTree(id, 1, mode) : null;
  annotate(tree);
  const w = wikiEntry(id);

  const ways = [];
  if (p && (p.sell || p.buy)) {
    ways.push({
      kind: 'tp',
      title: 'Comprarlo en el bazar',
      text: p.sell
        ? `Compra instantánea a {{c:${p.sell}}} por unidad (${p.sellQty.toLocaleString('es-AR')} en venta). Con orden de compra pagás ~{{c:${p.buy + 1}}} pero hay que esperar.`
        : 'No hay nadie vendiendo ahora: sólo podés poner una orden de compra.',
      cost: p.sell || p.buy + 1,
    });
  }
  if (tree) {
    ways.push({
      kind: 'craft',
      title: 'Craftearlo',
      text: best
        ? `Costo de crafteo óptimo ≈ {{c:${Math.round(best.cost)}}} por unidad (${tp && best.cost < tp ? 'más barato que comprarlo hecho' : 'más caro que comprarlo hecho'}).`
        : 'Tiene receta, pero algún ingrediente no se vende en el bazar (sale de NPC, drops o divisas).',
      cost: best ? Math.round(best.cost) : null,
    });
  }
  if (it?.vendor) {
    ways.push({
      kind: 'npc-sell',
      title: 'Venderlo a un NPC',
      text: `Cualquier comerciante te paga {{c:${it.vendor}}}. ${p?.buy && net(p.buy) > it.vendor ? 'En el bazar sacás más.' : 'Ojo: el NPC paga igual o más que el bazar.'}`,
      cost: it.vendor,
    });
  }
  if (!p) ways.push({ kind: 'notp', title: 'No se vende en el bazar', text: 'Este item no es comerciable (ligado a cuenta/alma o de divisa). Mirá la wiki para ver dónde conseguirlo.' });

  const hist = state.history.get(id) || [];
  return {
    item: it || { id, name: `#${id}` },
    market: r,
    listings,
    netSell: p?.sell ? net(Math.max(p.sell - 1, 1)) : 0,
    netInstant: p?.buy ? net(p.buy) : 0,
    history: hist.map(([t, b, s]) => [t * 60_000, b, s]),
    tree,
    recipes: recipesOf(id),
    shopping: tree ? shoppingList(tree) : null,
    wiki: w ? { soldBy: w.soldBy || [], containedIn: w.containedIn || [], gathered: w.gathered || [], rewardTracks: w.rewardTracks || [], rewardedBy: w.rewardedBy || [], note: w.note || '', title: w.title, snapshot: wikiMeta()?.at } : null,
    ways,
    usedIn: usedIn(id, Infinity),
    hints: GENERIC_HINTS[it?.type] || [],
    links: {
      wiki: it?.chat ? `https://wiki.guildwars2.com/index.php?search=${encodeURIComponent(it.chat)}` : null,
      wikiEs: `https://wiki-es.guildwars2.com/index.php?search=${encodeURIComponent(it?.name || '')}`,
      bltc: `https://www.gw2bltc.com/en/item/${id}`,
      chat: it?.chat || null,
    },
  };
}
