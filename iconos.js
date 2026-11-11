// Íconos para todo: cualquier link a un item (#/item/ID) o a un logro (#/logro/ID) que se dibuje sin ícono
// recibe el suyo automáticamente. Items: ícono del item. Logros: ícono del logro y, si la API no tiene uno,
// el de su categoría. Se piden en lotes a la API oficial y quedan en memoria.
const API = () => `${globalThis.GW2_API_BASE || 'https://api.guildwars2.com'}/v2`;
const ITEM = new Map();
const ACH = new Map();
let catIconByAch = null;

async function getJSON(url) { const r = await fetch(url); if (!r.ok) throw new Error(String(r.status)); return r.json(); }

function fetchMissing(ids, memo, path) {
  const need = [...new Set(ids)].filter((id) => id > 0 && !memo.has(id));
  for (let i = 0; i < need.length; i += 200) {
    const chunk = need.slice(i, i + 200);
    const p = getJSON(`${API()}/${path}?lang=es&ids=${chunk.join(',')}`).then((l) => new Map(l.map((x) => [x.id, x.icon || '']))).catch(() => new Map());
    for (const id of chunk) memo.set(id, p.then((m) => m.get(id) || ''));
  }
  return Promise.all(ids.map((id) => memo.get(id)));
}
async function catIcons() {
  if (!catIconByAch) {
    catIconByAch = getJSON(`${API()}/achievements/categories?lang=es&ids=all`).then((cats) => {
      const m = new Map();
      for (const c of cats) for (const a of c.achievements || []) if (!m.has(a)) m.set(a, c.icon || '');
      for (const c of cats) for (const t of c.tomorrow || []) if (!m.has(t.id)) m.set(t.id, c.icon || '');
      return m;
    }).catch(() => new Map());
  }
  return catIconByAch;
}

const SKIP = '.btn, .wk, .chip-btn, button, [data-noicon]';
const idOf = (a, re) => Number((a.getAttribute('href') || '').match(re)?.[1] || 0);
const hasIcon = (a) => a.querySelector('img, .gd-ph, .icon-ph') || a.previousElementSibling?.matches?.('img') || a.parentElement?.firstElementChild?.matches?.('img');
const ITEM_RE = /^#\/item\/(\d+)$/;
const ACH_RE = /^#\/logro\/(\d+)$/;

const BUSY = new Set(), AGAIN = new Set();
async function scan(root) {
  if (BUSY.has(root)) { AGAIN.add(root); return; }
  BUSY.add(root);
  try {
    const links = [...root.querySelectorAll('a[href^="#/item/"], a[href^="#/logro/"]')].filter((a) => !a.dataset.ic && !a.closest(SKIP) && !a.matches(SKIP) && a.textContent.trim() && !hasIcon(a));
    if (!links.length) return;
    links.forEach((a) => { a.dataset.ic = '1'; });
    const items = links.filter((a) => ITEM_RE.test(a.getAttribute('href')));
    const achs = links.filter((a) => ACH_RE.test(a.getAttribute('href')));
    await Promise.all([
      fetchMissing(items.map((a) => idOf(a, ITEM_RE)), ITEM, 'items'),
      fetchMissing(achs.map((a) => idOf(a, ACH_RE)), ACH, 'achievements'),
    ]);
    const achIcon = new Map(await Promise.all(achs.map(async (a) => [idOf(a, ACH_RE), await ACH.get(idOf(a, ACH_RE))])));
    const itIcon = new Map(await Promise.all(items.map(async (a) => [idOf(a, ITEM_RE), await ITEM.get(idOf(a, ITEM_RE))])));
    const cats = [...achIcon.values()].some((x) => !x) ? await catIcons() : new Map();
    const put = (a, src) => { if (!src || !a.isConnected) return; const img = document.createElement('img'); img.src = src; img.alt = ''; img.loading = 'lazy'; img.className = 'ic-auto'; a.prepend(img); };
    for (const a of items) put(a, itIcon.get(idOf(a, ITEM_RE)));
    for (const a of achs) { const id = idOf(a, ACH_RE); put(a, achIcon.get(id) || cats.get(id)); }
  } finally {
    BUSY.delete(root);
    if (AGAIN.delete(root)) setTimeout(() => scan(root), 50);
  }
}

export function initIcons(...roots) {
  for (const root of roots.filter(Boolean)) {
    let t = null;
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => scan(root), 250); }).observe(root, { childList: true, subtree: true });
    scan(root);
  }
}
