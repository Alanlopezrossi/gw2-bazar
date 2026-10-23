// "Cómo se consigue" un item, armado sólo con datos que ya vienen con la página (no depende de que la wiki esté en línea):
// bazar, crafteo, Forja Mística, NPC (fichas y tiendas de la wiki archivada), contenedores que lo traen,
// logros que lo dan, reward tracks, recolección y la propia descripción del juego (API oficial).
import { state } from './store.js';
import { normalize } from './analysis.js';
import { wikiEntry, wikiShops, wikiGen } from './wikidata.js';
import { achievementsFor } from './equipment.js';
import { findByNameEn, indexItem } from './catalog.js';
import { snapshotIds, snapshotContainer } from './containers.js';
import { costEs } from './vendors.js';

const DISC = { Armorsmith: 'Forjador de armaduras', Artificer: 'Artífice', Chef: 'Cocinero', Huntsman: 'Cazador', Jeweler: 'Joyero', Leatherworker: 'Peletero', Tailor: 'Sastre', Weaponsmith: 'Forjador de armas', Scribe: 'Escriba', Homesteader: 'Hogareño' };

// Índices inversos (se rehacen si cambian los datos).
let IDX = null;
function indexes() {
  const key = `${wikiGen()}|${state.items.size}|${snapshotIds().length}`;
  if (IDX?.key === key) return IDX;
  const idByEn = new Map();
  for (const it of state.items.values()) if (it.nameEn) { const k = normalize(it.nameEn); if (!idByEn.has(k)) idByEn.set(k, it.id); }
  const byEn = (name) => idByEn.get(normalize(name)) || findByNameEn(name)?.id || null;
  // Tiendas por moneda de la wiki: item -> [{vendor, area, zone, cost, notes}]
  const shopsOf = new Map();
  for (const sh of wikiShops()) {
    for (const r of sh.items || []) {
      const id = byEn(r.title);
      if (!id) continue;
      if (!shopsOf.has(id)) shopsOf.set(id, []);
      shopsOf.get(id).push({ vendor: sh.vendor, area: sh.area, zone: sh.zone, cost: r.cost, notes: r.notes || '' });
    }
  }
  // Contenedores (copia incluida) que traen cada item.
  const inCont = new Map();
  for (const cid of snapshotIds()) {
    const c = snapshotContainer(cid);
    for (const x of c?.items || []) {
      if (!inCont.has(x.id)) inCont.set(x.id, []);
      inCont.get(x.id).push({ id: cid, qty: x.qty, kind: x.kind, avg: x.avg ?? null });
    }
  }
  IDX = { key, byEn, shopsOf, inCont };
  return IDX;
}

const info = (id) => {
  const it = state.items.get(id) || indexItem(id);
  return { id, name: it?.name || `#${id}`, icon: it?.icon || null, rarity: it?.rarity || null };
};

/** Frases de la descripción del juego que dicen cómo se consigue. */
function descHints(desc) {
  if (!desc) return [];
  const clean = String(desc).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const sentences = clean.split(/(?<=[.!?])\s+/);
  const re = /(se compra|se vende|comerciante|vendedor|se obtiene|se consigue|se gana|recompensa|se intercambia|se encuentra|cae de|sale de|se fabrica|se craftea|forja|canje|puede obtener|obtenido|obtenible|consigue|purchase|obtain|reward|found|drop|sold|earned|trade)/i;
  return sentences.filter((s) => re.test(s) && !/^(se (utiliza|usa)|used|úsalo|usalo|consume|haz doble clic)/i.test(s)).slice(0, 4);
}

const KIND_ES = { Guaranteed: 'siempre', Chance: 'posible', Choice: 'a elegir', Rare: 'raro', SuperRare: 'muy raro' };

/**
 * Lista de formas de conseguir un item. Cada una: { kind, title, text, items?, vendors?, link? }.
 * kinds: tp, craft, forge, vendor, container, achievement, track, gather, reward, desc, note
 */
export function howToObtain(id, { desc = '' } = {}) {
  const ix = indexes();
  const out = [];
  const p = state.prices.get(id);
  if (p && (p.sell || p.buy)) out.push({ kind: 'tp', title: 'Bazar', text: 'Se compra en el bazar (ver precios arriba).' });

  // Crafteo y Forja Mística
  const sigs = new Set();
  for (const r of state.byOutput.get(id) || []) {
    const sig = `${r.id < 0 ? 'f' : (r.disciplines || []).join()}|${(r.ingredients || []).map((g) => `${g.type}${g.id}x${g.count}`).sort().join()}`;
    if (sigs.has(sig)) continue;
    sigs.add(sig);
    const ings = (r.ingredients || []).map((g) => g.type === 'Item' ? { ...info(g.id), count: g.count } : { id: g.id, name: g.type === 'Currency' && g.id === 1 ? 'monedas' : g.type, count: g.count, currency: true });
    if (r.id < 0) out.push({ kind: 'forge', title: 'Forja Mística', text: 'Se combina en la Forja Mística (Arco del León o Santuario de Mistlock):', ings });
    else {
      const d = (r.disciplines || []).map((x) => DISC[x] || x).join(', ');
      out.push({ kind: 'craft', title: 'Crafteo', text: `${d || 'Crafteo'}${r.min_rating ? ` (nivel ${r.min_rating})` : ''}${r.flags?.includes('LearnedFromItem') ? ' · hay que aprender la receta' : ''}${(r.output_item_count || 1) > 1 ? ` · da ${r.output_item_count}` : ''}:`, ings });
    }
  }

  // NPC: fichas de la wiki + tiendas por moneda
  const w = wikiEntry(id);
  const vendors = [];
  const seen = new Set();
  for (const v of [...(w?.soldBy || []), ...(ix.shopsOf.get(id) || [])]) {
    if (/^[A-Z]?(Basic|Fine|Masterwork|Rare|Exotic|Ascended|Legendary)$/.test(v.area || '') || /^\d+$/.test(v.zone || '')) continue;
    const k = `${v.vendor}|${v.area}|${v.zone}|${v.cost}`;
    if (seen.has(k)) continue;
    seen.add(k);
    vendors.push({ vendor: v.vendor, area: v.area || '', zone: v.zone || '', cost: costEs(v.cost || ''), notes: v.notes || '', map: `${v.vendor}|${v.area || ''}|${v.zone || ''}` });
  }
  if (vendors.length) out.push({ kind: 'vendor', title: `Lo vende${vendors.length > 1 ? 'n' : ''} ${vendors.length} NPC`, vendors });

  // Contenedores que lo traen
  const conts = (ix.inCont.get(id) || []).map((c) => ({ ...info(c.id), note: `${KIND_ES[c.kind] || c.kind}${c.qty > 1 ? ` · ×${c.qty}` : ''}${c.avg != null ? ` · ${c.avg.toLocaleString('es-AR', { maximumFractionDigits: 3 })} por apertura` : ''}`, tradable: !!state.prices.get(c.id)?.sell }));
  const contIds = new Set(conts.map((c) => c.id));
  const wikiConts = [];
  for (const name of w?.containedIn || []) {
    const cid = ix.byEn(name);
    if (cid && !contIds.has(cid)) { contIds.add(cid); conts.push({ ...info(cid), note: '', tradable: !!state.prices.get(cid)?.sell }); }
    else if (!cid) wikiConts.push(name);
  }
  if (conts.length || wikiConts.length) out.push({ kind: 'container', title: 'Sale al abrir', items: conts.slice(0, 40), more: Math.max(0, conts.length - 40), extra: wikiConts.slice(0, 20) });

  // Logros
  const ach = achievementsFor(id).filter((a) => a.role === 'recompensa');
  if (ach.length) out.push({ kind: 'achievement', title: 'Recompensa de logros', achievements: ach.slice(0, 30) });

  if (w?.rewardTracks?.length) {
    const tiers = w.rewardTracks.filter((t) => /^tier \d+,?$/i.test(t.trim())).map((t) => t.replace(/\D/g, ''));
    const rest = w.rewardTracks.filter((t) => !/^tier \d+,?$/i.test(t.trim()));
    out.push({ kind: 'track', title: 'Reward tracks (PvP / McM)', list: [...(tiers.length ? [`Sale en reward tracks de PvP y McM (nivel${tiers.length > 1 ? 'es' : ''} ${tiers.join(', ')} de la pista).`] : []), ...rest] });
  }
  if (w?.gathered?.length) out.push({ kind: 'gather', title: 'Recolección', list: w.gathered });
  if (w?.rewardedBy?.length) out.push({ kind: 'reward', title: 'Recompensa de', list: w.rewardedBy });

  // Lo que dice el propio juego
  const it = state.items.get(id) || indexItem(id);
  const dh = descHints(desc || it?.desc || it?.description || '');
  if (dh.length) out.push({ kind: 'desc', title: 'Según la descripción del juego', list: dh });
  if (w?.note) out.push({ kind: 'note', title: 'Nota', list: [w.note] });
  return out;
}
