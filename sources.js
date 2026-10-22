// Ficha completa de un item: precio en vivo, cómo conseguirlo y para qué se usa.
import { getJSON, GW2_BASE } from './gw2api.js';
import { state } from './store.js';
import { row, net, craftTree, bestRecipe, tpBuyPrice, vol } from './analysis.js';
import { GENERIC_HINTS } from './i18n.js';

async function liveListings(id) {
  try {
    const { data } = await getJSON(`${GW2_BASE}/v2/commerce/listings/${id}`, { retries: 1, timeout: 15000 });
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
