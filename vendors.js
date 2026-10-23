// Vendedores (NPC) ubicados en el mapa de Tyria.
// La wiki dice "Area" (sector) y "Zone" (mapa) de cada vendedor; lo cruzamos con los sectores
// oficiales de la API (/v2/continents) para tener coordenadas aproximadas y el waypoint más cercano.
import { state } from './store.js';
import { allWikiEntries, wikiShops, wikiGen } from './wikidata.js';
import { normalize } from './analysis.js';

let GEO = null;
let cache = { key: '', markers: null };

export function setGeoData(data) {
  GEO = data && data.maps ? data : null;
  cache.key = '';
  labelsCache = null;
}
export function geoInfo() {
  return GEO ? { dims: GEO.dims, maxZoom: GEO.maxZoom, continent: GEO.continent, at: GEO.at } : null;
}

// Monedas frecuentes en español (la wiki las nombra en inglés).
const CURRENCY_ES = {
  'volatile magic': 'Magia volátil', 'unbound magic': 'Magia desatada', karma: 'Karma', laurel: 'Laurel', 'badge of honor': 'Insignia de honor',
  'fractal relic': 'Reliquia fractal', 'pristine fractal relic': 'Reliquia fractal prístina', 'spirit shard': 'Esquirla de espíritu', 'proof of heroics': 'Prueba de heroísmo',
  'copper coin': 'Monedas', 'silver coin': 'Monedas', 'gold coin': 'Monedas', coin: 'Monedas', 'airship part': 'Pieza de aeronave', 'ley line crystal': 'Cristal de línea ley',
  'lump of aurillium': 'Trozo de aurilio', 'geode': 'Geoda', 'bandit crest': 'Cresta de bandido', 'trade contract': 'Contrato comercial', 'elegy mosaic': 'Mosaico de elegía',
  'mystic coin': 'Moneda mística', 'obsidian shard': 'Esquirla de obsidiana', 'research note': 'Nota de investigación', 'imperial favor': 'Favor imperial', 'jade sliver': 'Astilla de jade',
  'static charge': 'Carga estática', 'pinch of stardust': 'Pizca de polvo estelar', 'tyrian defense seal': 'Sello de defensa tyriano', 'ursus oblige': 'Ursus oblige',
  'gaeting crystal': 'Cristal de Gaeting', 'testimony of desert heroics': 'Testimonio de heroísmo del desierto', 'testimony of jade heroics': 'Testimonio de heroísmo de jade',
  'testimony of castoran heroics': 'Testimonio de heroísmo castorano', 'skirmish claim ticket': 'Vale de escaramuza', 'wvw skirmish claim ticket': 'Vale de escaramuza de WvW',
  'memory of battle': 'Memoria de batalla', 'guild commendation': 'Elogio de clan', 'blade shard': 'Esquirla de hoja', 'magnetite shard': 'Esquirla de magnetita',
};
let itemEsByEn = null;
export function currencyLabel(en) {
  const k = en.toLowerCase();
  if (CURRENCY_ES[k]) return CURRENCY_ES[k];
  // Si el "costo" es un item (ej. Glob of Ectoplasm), usamos su nombre en español del catálogo.
  if (!itemEsByEn) {
    itemEsByEn = new Map();
    for (const it of state.items.values()) if (it.nameEn) itemEsByEn.set(it.nameEn.toLowerCase(), it.name);
  }
  return itemEsByEn.get(k) || en;
}

/** "1,250 Volatile Magic + 10 Gold coin" → "1.250 Magia volátil + 10 o". */
export function costEs(cost) {
  if (!cost) return '';
  let copper = 0;
  const out = [];
  for (const raw of cost.split('+')) {
    const p = raw.replace(/([\d.,]+)\s+(copper|silver|gold) coins?/gi, (_, n, k) => {
      copper += Number(n.replace(/,/g, '')) * { copper: 1, silver: 100, gold: 10000 }[k.toLowerCase()];
      return '';
    }).trim();
    const m = p.match(/^([\d.,]+)\s+(.+)$/);
    if (!m) { if (p) out.push(p); continue; }
    const n = Number(m[1].replace(/,/g, ''));
    const name = m[2].trim();
    const coin = name.match(/^(copper|silver|gold) coin$/i);
    if (coin) { copper += n * { copper: 1, silver: 100, gold: 10000 }[coin[1].toLowerCase()]; continue; }
    out.push(`${n.toLocaleString('es-AR')} ${currencyLabel(name)}`);
  }
  if (copper) {
    const g = Math.floor(copper / 10000), sv = Math.floor((copper % 10000) / 100), c = copper % 100;
    out.unshift([g && `${g} o`, sv && `${sv} p`, c && `${c} c`].filter(Boolean).join(' '));
  }
  return out.join(' + ');
}

/** Saca las monedas de un texto de costo ("96 Copper coin + 100 Volatile Magic"). */
export function currenciesIn(cost) {
  if (!cost) return [];
  return [...new Set(cost.split(/\+|\bfor\b|,(?!\d{3})/i)
    .map((p) => p.replace(/[\d.,]+/g, '').replace(/\s+/g, ' ').trim())
    .map((p) => (/\b(copper|silver|gold) coin\b/i.test(p) ? 'coin' : p))
    .filter((p) => p && p.length > 2 && p.length <= 45 && !/^(each|per|x)$/i.test(p) && !/vendor|\bsee\b|varies/i.test(p)))];
}

function indexes() {
  const mapsByName = new Map();
  for (const m of Object.values(GEO.maps)) {
    if (!m.nameEn) continue;
    const k = normalize(m.nameEn.replace(/\s*\((home|instance)\)\s*$/i, ''));
    // Ante nombres repetidos (instancias de historia), nos quedamos con el mapa más grande.
    const prev = mapsByName.get(k);
    const area = (x) => (x.rect[1][0] - x.rect[0][0]) * (x.rect[1][1] - x.rect[0][1]);
    if (!prev || area(m) > area(prev)) mapsByName.set(k, m);
  }
  const sectorsByName = new Map();
  for (const s of GEO.sectors) {
    const k = normalize(s.nameEn);
    if (!sectorsByName.has(k)) sectorsByName.set(k, []);
    sectorsByName.get(k).push(s);
  }
  return { mapsByName, sectorsByName };
}

function nearestWaypoint(mapId, coord) {
  let best = null;
  let bd = Infinity;
  for (const w of GEO.waypoints) {
    if (w.map !== mapId) continue;
    const d = (w.coord[0] - coord[0]) ** 2 + (w.coord[1] - coord[1]) ** 2;
    if (d < bd) { bd = d; best = w; }
  }
  return best && { name: best.name || best.nameEn, chat: best.chat, coord: best.coord };
}

function locate(area, zone, idx) {
  // La zona a veces trae varios mapas pegados ("Mistlock Observatory Mistlock Sanctuary"): probamos cada mapa conocido.
  const nz = normalize(zone || '');
  let maps = [];
  if (idx.mapsByName.has(nz)) maps = [idx.mapsByName.get(nz)];
  else if (nz) for (const [k, m] of idx.mapsByName) if (k.length > 4 && nz.includes(k)) maps.push(m);
  const na = normalize(area || '');
  const secs = na ? idx.sectorsByName.get(na) || [] : [];
  // Sector dentro de alguno de los mapas de la zona (o cualquiera si la zona no se encontró).
  let sec = secs.find((s) => maps.some((m) => m.id === s.map)) || (!maps.length ? secs[0] : null);
  if (sec) {
    const map = GEO.maps[sec.map];
    return { coord: sec.coord, mapId: sec.map, mapName: map?.name || map?.nameEn, sector: sec.name || sec.nameEn, precision: 'sector', rect: map?.rect };
  }
  // A veces la "zona" de la wiki es en realidad un sector (ej. un pabellón dentro de un mapa).
  if (!maps.length && nz && idx.sectorsByName.has(nz)) {
    const s2 = idx.sectorsByName.get(nz)[0];
    const map = GEO.maps[s2.map];
    return { coord: s2.coord, mapId: s2.map, mapName: map?.name || map?.nameEn, sector: s2.name || s2.nameEn, precision: 'sector', rect: map?.rect };
  }
  if (maps.length) {
    const m = maps[0];
    const c = [(m.rect[0][0] + m.rect[1][0]) / 2, (m.rect[0][1] + m.rect[1][1]) / 2].map(Math.round);
    return { coord: c, mapId: m.id, mapName: m.name || m.nameEn, sector: null, precision: 'mapa', rect: m.rect };
  }
  return null;
}

const REGION_ES = {
  Kryta: 'Kryta', Ascalon: 'Ascalon', 'Shiverpeak Mountains': 'Picosescalofriantes', 'Tarnished Coast': 'Costa Deslustrada',
  'Steamspur Mountains': 'Montañas Espuelavapor', 'Ruins of Orr': 'Ruinas de Orr', 'Maguuma Wastes': 'Páramos de Maguuma',
  'Heart of Maguuma': 'Corazón de Maguuma', 'Ring of Fire': 'Anillo de Fuego', 'Crystal Desert': 'Desierto de Cristal',
  Cantha: 'Cantha', 'Horn of Maguuma': 'Cuerno de Maguuma', Janthir: 'Janthir', Castora: 'Castora',
};
let labelsCache = null;
/** Nombres para dibujar sobre el mapa: regiones, mapas explorables y sectores (español + inglés). */
export function mapLabels() {
  if (!GEO) return null;
  if (labelsCache) return labelsCache;
  const sectorsOf = new Map();
  for (const sc of GEO.sectors) sectorsOf.set(sc.map, (sectorsOf.get(sc.map) || 0) + 1);
  const area = (r) => (r[1][0] - r[0][0]) * (r[1][1] - r[0][1]);
  const overlap = (a, b) => Math.max(0, Math.min(a[1][0], b[1][0]) - Math.max(a[0][0], b[0][0])) * Math.max(0, Math.min(a[1][1], b[1][1]) - Math.max(a[0][1], b[0][1]));
  // Nos quedamos con los mapas "reales": sin instancias de historia ni copias superpuestas.
  const cand = Object.values(GEO.maps)
    .filter((m) => m.public && m.nameEn && m.name && !/\((public|heart of thorns)\)|^convergence/i.test(m.nameEn) && (sectorsOf.get(m.id) || 0) > 0)
    .sort((a, b) => (sectorsOf.get(b.id) || 0) - (sectorsOf.get(a.id) || 0) || area(b.rect) - area(a.rect));
  const kept = [];
  for (const m of cand) {
    if (kept.some((k) => overlap(k.rect, m.rect) > 0.5 * area(m.rect))) continue;
    kept.push(m);
  }
  const keptIds = new Set(kept.map((m) => m.id));
  const maps = kept.map((m) => ({ es: m.name, en: m.nameEn, c: [(m.rect[0][0] + m.rect[1][0]) / 2, (m.rect[0][1] + m.rect[1][1]) / 2].map(Math.round), rect: m.rect, city: m.level?.[0] === 0 }));
  const sectors = GEO.sectors.filter((sc) => keptIds.has(sc.map) && sc.nameEn).map((sc) => ({ es: sc.name || sc.nameEn, en: sc.nameEn, c: sc.coord }));
  const byRegion = new Map();
  for (const m of kept) {
    if (!m.region) continue;
    // Centro ponderado por superficie: queda sobre el grueso de la región y no en el medio del mar.
    const r = byRegion.get(m.region) || { sx: 0, sy: 0, w: 0 };
    const a = area(m.rect);
    r.sx += a * (m.rect[0][0] + m.rect[1][0]) / 2; r.sy += a * (m.rect[0][1] + m.rect[1][1]) / 2; r.w += a;
    byRegion.set(m.region, r);
  }
  const regions = [...byRegion].map(([en, r]) => ({ es: REGION_ES[en] || en, en, c: [Math.round(r.sx / r.w), Math.round(r.sy / r.w)] }));
  const waypoints = GEO.waypoints.filter((w) => (keptIds.has(w.map) || GEO.maps[w.map]?.public) && w.nameEn).map((w) => ({ es: w.name || w.nameEn, en: w.nameEn, c: w.coord, chat: w.chat }));
  labelsCache = { regions, maps, sectors, waypoints };
  return labelsCache;
}

/** Todos los vendedores conocidos (de la wiki), con su ubicación y lo que venden. */
export function vendorMarkers() {
  if (!GEO) return { ready: false, markers: [], unplaced: [] };
  const key = `${wikiGen()}|${state.meta.wikiAt || 0}|${state.items.size}`;
  if (cache.key === key && cache.markers) return cache.markers;
  itemEsByEn = null;
  const idx = indexes();
  const byVendor = new Map();
  for (const [idStr, e] of Object.entries(allWikiEntries())) {
    const id = Number(idStr);
    for (const v of e.soldBy || []) {
      // Filas mal leídas de la wiki (tablas con celdas combinadas): "FExotic / 80".
      if (/^[A-Z]?(Basic|Fine|Masterwork|Rare|Exotic|Ascended|Legendary)$/.test(v.area || '') || /^\d+$/.test(v.zone || '')) continue;
      const k = `${v.vendor}|${v.area}|${v.zone}`;
      let m = byVendor.get(k);
      if (!m) {
        const loc = locate(v.area, v.zone, idx);
        m = { key: k, vendor: v.vendor, area: v.area, zone: v.zone, loc, items: [], currencies: new Set() };
        byVendor.set(k, m);
      }
      const it = state.items.get(id);
      m.items.push({ id, name: it?.name || e.title, icon: it?.icon || null, rarity: it?.rarity || null, cost: costEs(v.cost), notes: v.notes });
      for (const c of currenciesIn(v.cost)) m.currencies.add(c);
    }
  }
  // Tiendas por moneda (magia volátil, karma, laureles…): suman NPC y items que no salen de las fichas.
  const idByEn = new Map();
  for (const it of state.items.values()) if (it.nameEn && !idByEn.has(it.nameEn.toLowerCase())) idByEn.set(it.nameEn.toLowerCase(), it.id);
  for (const sh of wikiShops()) {
    const k = `${sh.vendor}|${sh.area}|${sh.zone}`;
    let m = byVendor.get(k);
    if (!m) {
      m = { key: k, vendor: sh.vendor, area: sh.area, zone: sh.zone, loc: locate(sh.area, sh.zone, idx), items: [], currencies: new Set() };
      byVendor.set(k, m);
    }
    const have = new Set(m.items.map((i) => `${i.id || i.name}|${i.cost}`));
    for (const r of sh.items || []) {
      const id = idByEn.get(String(r.title).toLowerCase()) || null;
      const it = id ? state.items.get(id) : null;
      const row = { id, name: it?.name || r.title, icon: it?.icon || null, rarity: it?.rarity || null, cost: costEs(r.cost), notes: r.notes || '' };
      const hk = `${row.id || row.name}|${row.cost}`;
      if (have.has(hk)) continue;
      have.add(hk);
      m.items.push(row);
      for (const c of currenciesIn(r.cost)) m.currencies.add(c);
    }
  }
  const markers = [];
  const unplaced = [];
  for (const m of byVendor.values()) {
    const out = { ...m, currencies: [...m.currencies].map((c) => ({ en: c, es: currencyLabel(c) })) };
    if (m.loc) {
      out.waypoint = nearestWaypoint(m.loc.mapId, m.loc.coord);
      markers.push(out);
    } else unplaced.push(out);
  }
  const allCurrencies = new Map();
  for (const m of [...markers, ...unplaced]) for (const es of new Set(m.currencies.map((c) => c.es))) allCurrencies.set(es, (allCurrencies.get(es) || 0) + 1);
  const result = {
    ready: true,
    markers,
    unplaced,
    currencies: [...allCurrencies].sort((a, b) => b[1] - a[1]).map(([es, n]) => ({ es, n })),
    geo: geoInfo(),
    labels: mapLabels(),
  };
  cache = { key, markers: result };
  return result;
}
