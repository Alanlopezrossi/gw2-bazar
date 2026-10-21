// Cómo conseguir un item según la wiki oficial (sección "Acquisition").
// La wiki está en inglés: mostramos la sección tal cual y la resumimos con etiquetas en español.
import { getJSON, WIKI_BASE } from './gw2api.js';
import { state, idbGet, idbSet } from './store.js';

const TTL = 3 * 24 * 60 * 60_000;
const failUntil = { t: 0 }; // si la wiki está caída, no la martillamos

const METHOD_LABELS = [
  [/^sold_by|^vendor|^merchant/i, 'Vendedor NPC'],
  [/^contained_in|^container|^salvage_kit/i, 'Sale de contenedores / bolsas'],
  [/^dropped_by|^drop/i, 'Lo sueltan enemigos'],
  [/^gathered_from|^gathering|^harvest|^node/i, 'Recolección (nodos)'],
  [/^salvaged_from|^salvag/i, 'Reciclando otros items'],
  [/^mystic_forge|^forge/i, 'Forja Mística'],
  [/^crafted|^recipe|^crafting/i, 'Crafteo'],
  [/^reward|^rewarded|^achievement/i, 'Recompensa (logros/eventos/historia)'],
  [/^trading_post/i, 'Bazar'],
  [/^gem_store/i, 'Tienda de gemas'],
  [/^wizard|^vault/i, 'Bóveda del Mago'],
  [/^heart|^renown/i, 'Corazones de renombre'],
  [/^event/i, 'Eventos'],
  [/^chest/i, 'Cofres'],
  [/^exchange|^convert/i, 'Intercambio / conversión'],
];

function labelFor(anchor) {
  for (const [re, label] of METHOD_LABELS) if (re.test(anchor)) return label;
  return anchor.replace(/_/g, ' ');
}

function wikiUrl(params) {
  const q = new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params });
  return `${WIKI_BASE}/api.php?${q}`;
}

async function wikiGet(params) {
  const { data } = await getJSON(wikiUrl(params), { limited: false, retries: 1, timeout: 20000 });
  if (!data || typeof data !== 'object') throw new Error('la wiki no devolvió JSON (¿mantenimiento?)');
  return data;
}

async function findPage(item) {
  // 1) Semantic MediaWiki: buscar por id del juego.
  try {
    const d = await wikiGet({ action: 'ask', query: `[[Has game id::${item.id}]]|limit=5` });
    const results = d?.query?.results;
    const keys = results ? Object.keys(results) : [];
    if (keys.length) return keys[0].split('#')[0];
  } catch (e) {
    if (/JSON|mantenimiento|fetch|HTTP 5/.test(e.message)) throw e;
  }
  // 2) Por nombre en inglés (el título de la página suele coincidir).
  return item.nameEn || null;
}

function sanitize(html) {
  return html
    .replace(/<(script|style|noscript|iframe)[\s\S]*?<\/\1>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"')
    .replace(/(href|src)="\/(?!\/)/g, `$1="${WIKI_BASE}/`)
    .replace(/(srcset)="([^"]*)"/g, (_, a, v) => `${a}="${v.replace(/(^|,\s*)\//g, `$1${WIKI_BASE}/`)}"`)
    .replace(/(href|src)="\/\//g, '$1="https://')
    .replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ');
}

export async function acquisition(id, { force = false } = {}) {
  const item = state.items.get(id);
  const link = item?.chat
    ? `${WIKI_BASE}/index.php?search=${encodeURIComponent(item.chat)}`
    : `${WIKI_BASE}/index.php?search=${encodeURIComponent(item?.nameEn || id)}`;
  const base = { id, link, linkEs: `https://wiki-es.guildwars2.com/index.php?search=${encodeURIComponent(item?.name || id)}` };
  if (!item) return { ...base, available: false, reason: 'Item desconocido todavía (esperá la sincronización).' };

  const cachePath = `wiki:${id}`;
  if (!force) {
    try {
      const c = await idbGet(cachePath); if (!c) throw 0;
      if (Date.now() - c.at < TTL) return c;
    } catch { /* sin caché */ }
  }
  if (Date.now() < failUntil.t) return { ...base, available: false, reason: 'La wiki no responde (probablemente en mantenimiento). Reintento en unos minutos.' };

  try {
    const page = await findPage(item);
    if (!page) return { ...base, available: false, reason: 'No encontré la página del item en la wiki.' };
    const secData = await wikiGet({ action: 'parse', page, prop: 'sections', redirects: '1' });
    if (secData.error) return { ...base, available: false, reason: `La wiki no tiene la página "${page}".` };
    const sections = secData.parse?.sections || [];
    const acq = sections.find((s) => /^acquisition$/i.test(s.line)) || sections.find((s) => /acqui|obtain|sources?/i.test(s.line));
    const title = secData.parse?.title || page;
    const pageUrl = `${WIKI_BASE}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
    if (!acq) {
      const out = { ...base, available: true, page: title, pageUrl, methods: [], html: '', note: 'La página no tiene sección "Acquisition". Abrí la wiki para ver más.', at: Date.now() };
      await idbSet(cachePath, out);
      return out;
    }
    const txt = await wikiGet({ action: 'parse', page: title, section: acq.index, prop: 'text', disableeditsection: '1', redirects: '1' });
    const raw = txt.parse?.text || '';
    // Subsecciones (Sold by, Contained in, etc.) que cuelgan de Acquisition.
    const lvl = Number(acq.toclevel);
    const start = sections.indexOf(acq);
    const subs = [];
    for (let i = start + 1; i < sections.length && Number(sections[i].toclevel) > lvl; i++) subs.push(sections[i].anchor || sections[i].line);
    const methods = [...new Set((subs.length ? subs : [acq.anchor]).map(labelFor))];
    const out = { ...base, available: true, page: title, pageUrl, methods, html: sanitize(raw), at: Date.now() };
    await idbSet(cachePath, out);
    return out;
  } catch (e) {
    failUntil.t = Date.now() + 10 * 60_000;
    return { ...base, available: false, reason: `La wiki no está disponible ahora (${e.message}). Probá más tarde o abrila con el link.` };
  }
}

