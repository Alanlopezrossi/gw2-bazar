// "Mi cuenta": qué tengo que valga la pena vender (requiere API key de GW2).
import { getAuthed } from './gw2api.js';
import { state } from './store.js';
import { net, vol } from './analysis.js';
import { syncItems } from './sync.js';

let cache = { key: '', at: 0, data: null };
const TTL = 3 * 60_000;

export async function tokenInfo(apiKey) {
  return getAuthed('tokeninfo', apiKey);
}

function add(map, id, count, where) {
  if (!id || !count) return;
  const e = map.get(id) || { id, count: 0, where: {} };
  e.count += count;
  e.where[where] = (e.where[where] || 0) + count;
  map.set(id, e);
}

export async function accountSummary(apiKey, { force = false } = {}) {
  if (!force && cache.key === apiKey && Date.now() - cache.at < TTL) return cache.data;
  const info = await tokenInfo(apiKey);
  const perms = new Set(info.permissions || []);
  const warnings = [];
  const owned = new Map();
  const tasks = [];

  if (perms.has('inventories')) {
    tasks.push(
      getAuthed('account/materials', apiKey).then((list) => {
        for (const m of list || []) if (!m.binding) add(owned, m.id, m.count, 'Depósito de materiales');
      }),
      getAuthed('account/bank', apiKey).then((list) => {
        for (const s of list || []) if (s && !s.binding) add(owned, s.id, s.count, 'Banco');
      }),
      getAuthed('account/inventory', apiKey).then((list) => {
        for (const s of list || []) if (s && !s.binding) add(owned, s.id, s.count, 'Inventario compartido');
      }),
    );
  } else warnings.push('La API key no tiene permiso "inventories": no puedo ver banco ni materiales.');

  if (perms.has('characters') && perms.has('inventories')) {
    tasks.push(
      getAuthed('characters?ids=all', apiKey).then((chars) => {
        for (const c of chars || []) {
          for (const bag of c.bags || []) {
            if (!bag) continue;
            for (const s of bag.inventory || []) if (s && !s.binding) add(owned, s.id, s.count, c.name);
          }
        }
      }),
    );
  } else warnings.push('Para ver los inventarios de tus personajes, la key necesita "characters" + "inventories".');

  let sells = [];
  let delivery = null;
  if (perms.has('tradingpost')) {
    tasks.push(
      getAuthed('commerce/transactions/current/sells', apiKey).then((l) => (sells = l || [])),
      getAuthed('commerce/delivery', apiKey).then((d) => (delivery = d)),
    );
  } else warnings.push('Sin permiso "tradingpost" no puedo revisar tus ventas activas.');

  const results = await Promise.allSettled(tasks);
  for (const r of results) if (r.status === 'rejected') warnings.push(`Error leyendo la cuenta: ${r.reason?.message || r.reason}`);

  // Nos aseguramos de tener nombre de todo lo que aparece.
  const ids = new Set([...owned.keys(), ...sells.map((s) => s.item_id), ...(delivery?.items || []).map((i) => i.id)]);
  try { await syncItems([...ids]); } catch { /* nombres faltantes se muestran como #id */ }

  const items = [];
  for (const e of owned.values()) {
    const p = state.prices.get(e.id);
    if (!p || (!p.sell && !p.buy)) continue; // no comerciable
    const it = state.items.get(e.id);
    const v = vol(e.id);
    const listUnit = p.sell ? net(Math.max(p.sell - 1, 1)) : 0;
    const instantUnit = net(p.buy);
    const sold = v?.s1 ?? 0;
    // Recomendación simple: si el mercado absorbe tu cantidad en ~1 día y la diferencia vale la pena, publicá; si no, vendé a orden.
    let advice;
    if (!p.buy) advice = 'Publicar (no hay órdenes de compra)';
    else if (!p.sell) advice = 'Vender a orden de compra';
    else if (listUnit - instantUnit < Math.max(5, instantUnit * 0.05)) advice = 'Vender a orden (casi no hay diferencia)';
    else if (sold >= e.count) advice = 'Publicar en venta (se vende rápido)';
    else if (sold > 0) advice = `Publicar de a poco (~${sold} u./día)`;
    else advice = 'Vender a orden (se mueve poco)';
    items.push({
      id: e.id,
      name: it?.name || `#${e.id}`,
      icon: it?.icon || null,
      rarity: it?.rarity || null,
      type: it?.type || null,
      count: e.count,
      where: e.where,
      buy: p.buy,
      sell: p.sell,
      listUnit,
      instantUnit,
      listTotal: listUnit * e.count,
      instantTotal: instantUnit * e.count,
      s1: v?.s1 ?? null,
      b1: v?.b1 ?? null,
      advice,
    });
  }
  items.sort((a, b) => b.listTotal - a.listTotal);

  const activeSells = sells.map((s) => {
    const p = state.prices.get(s.item_id) || {};
    const it = state.items.get(s.item_id);
    return {
      id: s.item_id,
      name: it?.name || `#${s.item_id}`,
      icon: it?.icon || null,
      rarity: it?.rarity || null,
      price: s.price,
      quantity: s.quantity,
      created: s.created,
      lowest: p.sell || 0,
      undercut: p.sell && p.sell < s.price,
    };
  });

  const data = {
    account: info.name,
    permissions: [...perms],
    warnings,
    totals: {
      list: items.reduce((a, b) => a + b.listTotal, 0),
      instant: items.reduce((a, b) => a + b.instantTotal, 0),
    },
    items,
    activeSells,
    delivery: delivery && {
      coins: delivery.coins || 0,
      items: (delivery.items || []).map((i) => ({ id: i.id, count: i.count, name: state.items.get(i.id)?.name || `#${i.id}`, icon: state.items.get(i.id)?.icon })),
    },
    at: Date.now(),
  };
  cache = { key: apiKey, at: Date.now(), data };
  return data;
}
