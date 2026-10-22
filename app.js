import { localApi, localEvents } from './local-api.js';
import { renderCalc } from './calc.js';
// Bazar GW2 — frontend (vanilla JS, sin build).
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('es-AR');
const pf = new Intl.NumberFormat('es-AR', { style: 'percent', maximumFractionDigits: 1 });

let META = { types: {}, rarities: {}, rarityOrder: [], disciplines: {} };
let STATUS = null;
const S = { // estado de filtros por vista (persistido)
  bazar: { q: '', type: '', rarity: '', sort: 's1', dir: 'desc', page: 1, minVol: 0, onlyFlip: false, limit: 100 },
  vender: { q: '', cat: 'farm', sort: 'value', rarity: '', minSold: 50, maxDays: 0 },
  flips: { q: '', type: '', rarity: '', minProfit: 100, minRoi: 5, maxRoi: 200, minVol: 25, maxBuy: 0 },
  crafteo: { q: '', type: '', rarity: '', minProfit: 100, minRoi: 5, minVol: 10, autoOnly: false, discipline: '', mode: 'instant' },
};
try { const saved = JSON.parse(localStorage.getItem('gw2bazar.filters') || '{}'); for (const k of Object.keys(S)) if (saved[k]) S[k] = { ...S[k], ...saved[k] }; } catch {}
const saveFilters = () => { try { localStorage.setItem('gw2bazar.filters', JSON.stringify(S)); } catch {} };

// ---------- utilidades ----------
async function api(path, opts) {
  const { status, body } = await localApi(path, opts);
  if (status >= 400) throw Object.assign(new Error(body.error || `HTTP ${status}`), { status, data: body });
  return body;
}

function coin(c, { plain = false } = {}) {
  if (c == null || Number.isNaN(c)) return '<span class="muted">—</span>';
  const neg = c < 0;
  let v = Math.round(Math.abs(c));
  const g = Math.floor(v / 10000), s = Math.floor((v % 10000) / 100), cu = v % 100;
  const parts = [];
  if (g) parts.push(`<span class="g">${nf.format(g)}</span>`);
  if (g || s) parts.push(`<span class="s">${g ? String(s).padStart(2, '0') : s}</span>`);
  parts.push(`<span class="c">${g || s ? String(cu).padStart(2, '0') : cu}</span>`);
  return `<span class="coin${neg ? ' neg' : ''}">${parts.join('')}</span>`;
}
const coinText = (t) => esc(t).replace(/\{\{c:(-?\d+)\}\}/g, (_, n) => coin(Number(n)));
const qty = (n) => (n == null ? '<span class="muted">—</span>' : nf.format(n));
const pct = (x, cls = true) => (x == null ? '<span class="muted">—</span>' : `<span class="${cls ? (x > 0 ? 'pos' : x < 0 ? 'neg' : '') : ''}">${pf.format(x)}</span>`);
const rarName = (r) => META.rarities[r] || r || '';
const typeName = (t) => META.types[t] || t || '';
const ago = (t) => {
  if (!t) return 'nunca';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return `hace ${s}s`;
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86400)} d`;
};
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}
const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function itemCell(r, sub = '') {
  const img = r.icon ? `<img loading="lazy" src="${esc(r.icon)}" alt="" class="bd-${esc(r.rarity)}">` : '<span class="icon-ph"></span>';
  const s = sub || [typeName(r.type), rarName(r.rarity)].filter(Boolean).join(' · ');
  return `<div class="item-cell">${img}<div style="min-width:0"><div class="nm rar-${esc(r.rarity)}">${esc(r.name)}</div><div class="sub">${esc(s)}</div></div></div>`;
}

function options(map, current, all = 'Todos') {
  const entries = Array.isArray(map) ? map.map((k) => [k, META.rarities[k] || k]) : Object.entries(map).sort((a, b) => a[1].localeCompare(b[1], 'es'));
  return `<option value="">${all}</option>` + entries.map(([k, v]) => `<option value="${esc(k)}"${k === current ? ' selected' : ''}>${esc(v)}</option>`).join('');
}

function bindFilters(root, st, onChange) {
  $$('[data-f]', root).forEach((el) => {
    const k = el.dataset.f;
    const handler = () => {
      st[k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value || 0) : el.value;
      if ('page' in st && k !== 'page') st.page = 1;
      saveFilters();
      onChange();
    };
    el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', el.type === 'search' || el.type === 'number' ? debounce(handler, 300) : handler);
  });
}

function qs(o) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== '' && v !== false && v != null) p.set(k, v === true ? '1' : v);
  return p.toString();
}


// ---------- paginador compartido (todas las listas) ----------
const PAGE_SIZES = [25, 50, 100, 250, 500, 1000];
/** Pinta los controles de paginación en `el` y devuelve nada; onGo(page) y onSize(limit) los maneja quien llama. */
function paintPager(el, { total, page, limit, label = 'items', compact = false }, onGo, onSize) {
  if (!el) return;
  const pages = Math.max(1, Math.ceil(total / limit));
  const from = total ? (page - 1) * limit + 1 : 0;
  const to = Math.min(total, page * limit);
  el.innerHTML = `<span>${nf.format(total)} ${label}${compact ? '' : ` · mostrando ${nf.format(from)}–${nf.format(to)}`}
      · <label class="pg">por página <select data-size>${PAGE_SIZES.map((n) => `<option ${n === limit ? 'selected' : ''}>${n}</option>`).join('')}</select></label></span>
    <span class="btns">
      <button class="btn ghost small" data-go="1" ${page <= 1 ? 'disabled' : ''}>« Primera</button>
      <button class="btn ghost small" data-go="${page - 1}" ${page <= 1 ? 'disabled' : ''}>← Anterior</button>
      <label class="pg">Página <input type="number" min="1" max="${pages}" value="${page}" data-jump> de ${nf.format(pages)}</label>
      <button class="btn ghost small" data-go="${page + 1}" ${page >= pages ? 'disabled' : ''}>Siguiente →</button>
      <button class="btn ghost small" data-go="${pages}" ${page >= pages ? 'disabled' : ''}>Última »</button>
    </span>`;
  const go = (p) => onGo(Math.min(pages, Math.max(1, p || 1)));
  el.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); go(Number(b.dataset.go)); }));
  el.querySelector('[data-jump]').addEventListener('change', (e) => go(Number(e.target.value)));
  el.querySelector('[data-size]').addEventListener('change', (e) => onSize(Number(e.target.value)));
}

/** Tabla paginada en el cliente: pinta `rows` en `el` con paginador arriba y abajo. */
function pagedTable(el, { head, rows, row, label = 'items', limit = 50, empty = 'Sin resultados.', rowAttr = 'data-id' }) {
  if (!el) return;
  const pg = { page: 1, limit };
  el.innerHTML = `<div class="pager" data-pt></div><div class="table-wrap"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody data-tb></tbody></table></div><div class="pager" data-pb></div>`;
  const tb = el.querySelector('[data-tb]');
  function paint(scroll) {
    const slice = rows.slice((pg.page - 1) * pg.limit, pg.page * pg.limit);
    tb.innerHTML = slice.length ? slice.map((r) => `<tr ${rowAttr}="${r.id}">${row(r)}</tr>`).join('') : `<tr><td colspan="${head.length}" class="empty">${empty}</td></tr>`;
    const info = { total: rows.length, page: pg.page, limit: pg.limit, label };
    const goPage = (p) => { pg.page = p; paint(true); };
    const setSize = (n) => { pg.limit = n; pg.page = 1; paint(true); };
    const pt = el.querySelector('[data-pt]'), pb = el.querySelector('[data-pb]');
    // Si entra todo en una página, no hace falta paginador.
    if (rows.length <= Math.min(...PAGE_SIZES)) { pt.innerHTML = ''; pb.innerHTML = ''; }
    else { paintPager(pt, { ...info, compact: true }, goPage, setSize); paintPager(pb, info, goPage, setSize); }
    if (scroll) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  paint(false);
}

// ---------- router ----------
const view = $('#view');
let current = null; // { name, refresh }
let lastView = '';
let calcKeys = null;
document.addEventListener('keydown', (e) => { if (current?.name === 'calc' && calcKeys && !document.querySelector('.drawer.open')) calcKeys(e); });

function route() {
  const h = location.hash.replace(/^#\/?/, '') || 'bazar';
  const [a, b] = h.split('/');
  $$('#tabs a').forEach((x) => x.classList.toggle('active', x.dataset.tab === (a === 'recs' ? 'recs' : a)));
  if (a !== 'calc' && a !== 'item') calcKeys = null;
  if (a === 'item' && b) {
    openItem(Number(b));
    if (!current) { lastView = 'bazar'; renderBazar(); }
    return;
  }
  closeDrawer(false);
  if (current && h === lastView) return; // volvimos de la ficha: no re-renderizar
  lastView = h;
  if (a === 'recs') renderRecs(b || 'vender');
  else if (a === 'cuenta' && !STATUS?.publicMode) renderAccount();
  else if (a === 'calc') { const c = renderCalc(view, { coin, esc, api, debounce, itemCell, setKeyHandler: (fn) => (calcKeys = fn) }); current = { name: 'calc', refresh: c.refresh }; }
  else renderBazar();
}
window.addEventListener('hashchange', route);

// ---------- Bazar ----------
const BAZAR_COLS = [
  ['name', 'Item'],
  ['buy', 'Orden de compra'],
  ['sell', 'Precio de venta'],
  ['profit', 'Margen neto'],
  ['roi', 'ROI'],
  ['s1', 'Vendidos 24h'],
  ['b1', 'Órdenes llenadas 24h'],
  ['sellQty', 'En venta'],
  ['buyQty', 'Demanda'],
  ['change24', 'Δ 24h'],
];

function renderBazar() {
  const st = S.bazar;
  view.innerHTML = `
    <div class="page-head">
      <div><h1>Bazar en vivo</h1><p>Todos los items del bazar con precio actualizado cada 5 minutos desde la API oficial. El volumen de 24 h viene de DataWars2. Margen neto = vender a (venta − 1c) menos 15% de comisiones, comprando a (orden + 1c).</p></div>
    </div>
    <div class="filters">
      <input type="search" data-f="q" placeholder="Buscar en español o inglés… (ej: ectoplasma, mithril, 19721)" value="${esc(st.q)}">
      <label>Tipo <select data-f="type">${options(META.types, st.type)}</select></label>
      <label>Rareza <select data-f="rarity">${options(META.rarityOrder, st.rarity, 'Todas')}</select></label>
      <label>Vendidos/día ≥ <input type="number" min="0" data-f="minVol" value="${st.minVol}"></label>
      <label><input type="checkbox" data-f="onlyFlip" ${st.onlyFlip ? 'checked' : ''}> sólo con margen positivo</label>
    </div>
    <div class="pager" id="pagerTop"></div>
    <div class="table-wrap"><table><thead><tr>${BAZAR_COLS.map(([k, l]) => `<th data-sort="${k}" class="${st.sort === k ? `sorted ${st.dir}` : ''}">${l}</th>`).join('')}</tr></thead><tbody id="tb"><tr><td colspan="10"><div class="skeleton"></div></td></tr></tbody></table></div>
    <div class="pager" id="pager"></div>`;
  bindFilters(view, st, load);
  $$('th[data-sort]', view).forEach((th) =>
    th.addEventListener('click', () => {
      const k = th.dataset.sort;
      if (st.sort === k) st.dir = st.dir === 'desc' ? 'asc' : 'desc';
      else { st.sort = k; st.dir = k === 'name' ? 'asc' : 'desc'; }
      st.page = 1;
      saveFilters();
      renderBazar();
    }),
  );
  async function load() {
    try {
      const d = await api(`/api/items?${qs({ ...st, limit: st.limit || 100 })}`);
      const tb = $('#tb');
      if (!tb) return;
      tb.innerHTML = d.rows.length
        ? d.rows.map((r) => `<tr data-id="${r.id}">
            <td>${itemCell(r)}</td>
            <td>${coin(r.buy)}</td><td>${coin(r.sell)}</td>
            <td>${r.profit == null ? coin(null) : coin(r.profit)}</td><td class="num">${pct(r.roi)}</td>
            <td class="num">${qty(r.s1)}</td><td class="num">${qty(r.b1)}</td>
            <td class="num">${qty(r.sellQty)}</td><td class="num">${qty(r.buyQty)}</td>
            <td class="num">${pct(r.change24)}</td></tr>`).join('')
        : `<tr><td colspan="10" class="empty">${STATUS?.counts.prices ? 'Nada coincide con esos filtros.' : 'Descargando precios por primera vez…'}</td></tr>`;
      const pages = Math.max(1, Math.ceil(d.total / d.limit));
      const goPage = (p) => { st.page = p; saveFilters(); load(); window.scrollTo({ top: 0 }); };
      const setSize = (n) => { st.limit = n; st.page = 1; saveFilters(); load(); };
      const info = { total: d.total, page: d.page, limit: d.limit, label: 'items en el bazar' };
      paintPager($('#pagerTop'), { ...info, compact: true }, goPage, setSize);
      paintPager($('#pager'), info, goPage, setSize);
    } catch (e) {
      $('#tb').innerHTML = `<tr><td colspan="10" class="empty">Error: ${esc(e.message)}</td></tr>`;
    }
  }
  rowClicks(view);
  current = { name: 'bazar', refresh: load };
  load();
}

function rowClicks() {}
view.addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-id]');
  if (tr && !e.target.closest('a,button')) location.hash = `#/item/${tr.dataset.id}`;
});

// ---------- Recomendados ----------
const CATS = { '': 'Todo', farm: 'Materiales y trofeos (farmeo)', loot: 'Botín, bolsas y consumibles', gear: 'Equipo', upgrade: 'Runas, sellos y reliquias' };
const RECS = {
  vender: {
    label: 'Qué conviene vender',
    explain: '<strong>Qué farmear o sacar del banco para vender.</strong> <em>Más oro movido</em> ordena por unidades compradas en 24 h × lo que cobrás neto: mercado grande, se vende seguro. <em>Mejor precio por unidad</em> ordena por lo que cobrás por cada unidad, entre items que se venden todos los días. <em>Días de stock</em> = cuánto tardaría en venderse todo lo publicado: menos de 1 = se vende al toque.',
    filters: (st) => `
      <input type="search" data-f="q" placeholder="Filtrar por nombre…" value="${esc(st.q)}">
      <label>Categoría <select data-f="cat">${Object.entries(CATS).map(([k, v]) => `<option value="${k}" ${st.cat === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Ordenar por <select data-f="sort"><option value="value" ${st.sort !== 'unit' ? 'selected' : ''}>más oro movido por día</option><option value="unit" ${st.sort === 'unit' ? 'selected' : ''}>mejor precio por unidad</option></select></label>
      <label>Rareza <select data-f="rarity">${options(META.rarityOrder, st.rarity, 'Todas')}</select></label>
      <label>Vendidos/día ≥ <input type="number" min="0" data-f="minSold" value="${st.minSold}"></label>
      <label>Días de stock ≤ (0 = sin límite) <input type="number" min="0" step="0.5" data-f="maxDays" value="${st.maxDays}"></label>`,
    url: (st) => `/api/recs/demand?${qs(st)}`,
    head: ['Item', 'Precio en el bazar', 'Cobrás publicando (−15%)', 'Cobrás al instante', 'Vendidos 24h', 'Oro movido por día', 'Días de stock', 'Δ 24h'],
    row: (r) => `<td>${itemCell(r)}</td><td>${coin(r.sell)}</td><td>${coin(r.netSell)}</td><td>${coin(r.netInstant)}</td><td class="num">${qty(r.s1)}</td><td>${coin(r.dailyValue)}</td>
      <td class="num">${r.daysOfStock == null ? '—' : `<span class="${r.daysOfStock < 1 ? 'pos' : r.daysOfStock > 7 ? 'neg' : ''}">${r.daysOfStock.toFixed(1)}</span>`}</td><td class="num">${pct(r.change24)}</td>`,
  },
  flips: {
    label: 'Flipeo (comprar y revender)',
    explain: '<strong>Ponés una orden de compra a (precio + 1c) y revendés a (venta − 1c).</strong> El margen ya descuenta el 15% de comisiones. <em>Se mueven/día</em> es el lado más lento (órdenes llenadas o ventas). <em>Cantidad sugerida</em> = 5% de eso: lo que razonablemente podés mover compitiendo con otros. <em>Ganancia/día</em> = margen × cantidad sugerida. Los precios cambian: revisá el libro de órdenes en la ficha antes de invertir.',
    filters: (st) => `
      <input type="search" data-f="q" placeholder="Filtrar por nombre…" value="${esc(st.q)}">
      <label>Tipo <select data-f="type">${options(META.types, st.type)}</select></label>
      <label>Rareza <select data-f="rarity">${options(META.rarityOrder, st.rarity, 'Todas')}</select></label>
      <label>Margen mín. (cobre) <input type="number" min="0" data-f="minProfit" value="${st.minProfit}"></label>
      <label>ROI % <input type="number" min="0" data-f="minRoi" value="${st.minRoi}"> a <input type="number" min="0" data-f="maxRoi" value="${st.maxRoi}"></label>
      <label>Se mueven/día ≥ <input type="number" min="0" data-f="minVol" value="${st.minVol}"></label>
      <label>Precio máx. por unidad (cobre, 0 = sin límite) <input type="number" min="0" data-f="maxBuy" value="${st.maxBuy}"></label>`,
    url: (st) => `/api/recs/flips?${qs(st)}`,
    head: ['Item', 'Comprar a', 'Vender a', 'Margen neto', 'ROI', 'Se mueven/día', 'Cantidad sugerida', 'Inversión', 'Ganancia/día'],
    row: (r) => `<td>${itemCell(r)}</td><td>${coin(r.buy + 1)}</td><td>${coin(Math.max(r.sell - 1, r.buy + 1))}</td><td>${coin(r.profit)}</td><td class="num">${pct(r.roi)}</td><td class="num">${qty(r.moves)}</td><td class="num">${qty(r.qty)}</td><td>${coin(r.capital)}</td><td>${coin(r.potential)}</td>`,
  },
  crafteo: {
    label: 'Crafteo rentable',
    explain: '<strong>Recetas donde craftear y vender deja ganancia.</strong> El costo usa lo más barato para cada ingrediente (comprarlo o craftearlo, recursivo). Ingredientes que no se venden en el bazar (de NPC o drops) dejan la receta afuera. <span class="pill warn">1 por día</span> = el juego limita ese crafteo (o uno de sus ingredientes) a una vez por día, así que la ganancia/día es de una sola tanda. <span class="pill warn">receta</span> = hay que aprender la receta de un item. La Forja Mística no está en la API oficial.',
    filters: (st) => `
      <input type="search" data-f="q" placeholder="Filtrar por nombre…" value="${esc(st.q)}">
      <label>Disciplina <select data-f="discipline">${options(META.disciplines, st.discipline, 'Todas')}</select></label>
      <label>Tipo <select data-f="type">${options(META.types, st.type)}</select></label>
      <label>Ingredientes <select data-f="mode"><option value="instant" ${st.mode === 'instant' ? 'selected' : ''}>compra instantánea</option><option value="order" ${st.mode === 'order' ? 'selected' : ''}>con órdenes de compra</option></select></label>
      <label>Ganancia mín. <input type="number" min="0" data-f="minProfit" value="${st.minProfit}"></label>
      <label>Vendidos/día ≥ <input type="number" min="0" data-f="minVol" value="${st.minVol}"></label>
      <label><input type="checkbox" data-f="autoOnly" ${st.autoOnly ? 'checked' : ''}> sólo recetas que se aprenden solas</label>`,
    url: (st) => `/api/recs/crafting?${qs(st)}`,
    head: ['Item', 'Costo de crafteo', 'Cobrás publicando', 'Ganancia x unidad', 'ROI', 'Vendidos 24h', 'Disciplina', 'Cantidad/día', 'Ganancia/día'],
    row: (r) => `<td>${itemCell(r)}</td><td>${coin(r.craftCost)}</td><td>${coin(r.sellNet)}</td><td>${coin(r.craftProfit)}</td><td class="num">${pct(r.craftRoi)}</td><td class="num">${qty(r.s1)}</td>
      <td class="left small">${esc((r.disciplines || []).map((d) => META.disciplines[d] || d).join(', '))} <span class="muted">${r.minRating}</span>${r.needsRecipe ? ' <span class="pill warn">receta</span>' : ''}${r.gated ? ' <span class="pill warn">1 por día</span>' : ''}</td><td class="num">${qty(r.qty)}</td><td>${coin(r.potential)}</td>`,
  },
};

function renderRecs(kind) {
  const conf = RECS[kind] || RECS.vender;
  const st = S[kind] || S.vender;
  view.innerHTML = `
    <div class="page-head"><div><h1>Recomendados</h1><p>Ideas para sacarle oro al bazar con datos en vivo. Tocá cualquier fila para ver cómo conseguir el item.</p></div></div>
    <div class="subtabs">${Object.entries(RECS).map(([k, c]) => `<a href="#/recs/${k}" class="${k === kind ? 'active' : ''}">${c.label}</a>`).join('')}</div>
    <div class="explain">${conf.explain}</div>
    <div class="filters">${conf.filters(st)}</div>
    <div class="pager" id="pagerTop"></div>
    <div class="table-wrap"><table><thead><tr>${conf.head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody id="tb"><tr><td colspan="${conf.head.length}"><div class="skeleton"></div></td></tr></tbody></table></div>
    <div class="pager" id="pager"></div>`;
  let all = [];
  const pg = { page: 1, limit: st.limit || 100 };
  bindFilters(view, st, () => { pg.page = 1; load(); });
  function paint() {
    const tb = $('#tb');
    if (!tb) return;
    const pages = Math.max(1, Math.ceil(all.length / pg.limit));
    if (pg.page > pages) pg.page = pages;
    const slice = all.slice((pg.page - 1) * pg.limit, pg.page * pg.limit);
    tb.innerHTML = slice.length
      ? slice.map((r) => `<tr data-id="${r.id}">${conf.row(r)}</tr>`).join('')
      : `<tr><td colspan="${conf.head.length}" class="empty">${!STATUS?.counts.volume ? 'Esperando datos de volumen (DataWars2)…' : kind === 'crafteo' && !STATUS?.counts.recipes ? 'Descargando recetas…' : 'Nada cumple esos filtros. Probá aflojarlos.'}</td></tr>`;
    const goPage = (p) => { pg.page = p; paint(); window.scrollTo({ top: 0 }); };
    const setSize = (n) => { pg.limit = n; st.limit = n; pg.page = 1; saveFilters(); paint(); };
    const info = { total: all.length, page: pg.page, limit: pg.limit, label: 'resultados' };
    paintPager($('#pagerTop'), { ...info, compact: true }, goPage, setSize);
    paintPager($('#pager'), info, goPage, setSize);
  }
  async function load() {
    try {
      all = await api(conf.url(st) + '&limit=100000');
      paint();
    } catch (e) {
      $('#tb').innerHTML = `<tr><td colspan="${conf.head.length}" class="empty">Error: ${esc(e.message)}</td></tr>`;
    }
  }
  rowClicks(view);
  current = { name: 'recs', refresh: load };
  load();
}

// ---------- Mi cuenta ----------
function renderAccount(force = false) {
  view.innerHTML = `<div class="page-head"><div><h1>Mi cuenta</h1><p>Lo que tenés en banco, depósito de materiales e inventarios que vale la pena vender, más tus ventas activas en el bazar.</p></div>
    <button class="btn ghost" id="accRefresh">Actualizar</button></div><div id="acc"><div class="skeleton"></div></div>`;
  $('#accRefresh').addEventListener('click', () => renderAccount(true));
  async function load(f = force) {
    const box = $('#acc');
    try {
      const d = await api(`/api/account${f ? '?force=1' : ''}`);
      const und = d.activeSells.filter((s) => s.undercut);
      box.innerHTML = `
        <div class="cards">
          <div class="card"><div class="k">Cuenta</div><div class="v">${esc(d.account)}</div><div class="h">actualizado ${ago(d.at)}</div></div>
          <div class="card"><div class="k">Valor si publicás todo</div><div class="v">${coin(d.totals.list)}</div><div class="h">neto, después de comisiones</div></div>
          <div class="card"><div class="k">Valor vendiendo al instante</div><div class="v">${coin(d.totals.instant)}</div><div class="h">a las órdenes de compra</div></div>
          <div class="card"><div class="k">Para retirar en el bazar</div><div class="v">${coin(d.delivery?.coins ?? null)}</div><div class="h">${d.delivery ? `${d.delivery.items.length} items esperando` : 'sin permiso tradingpost'}</div></div>
        </div>
        ${d.warnings.length ? `<div class="explain">${d.warnings.map(esc).join('<br>')}</div>` : ''}
        ${d.activeSells.length ? `<div class="section"><h3>Tus ventas activas ${und.length ? `<span class="pill bad">${und.length} superadas</span>` : '<span class="pill good">todas al mejor precio</span>'}</h3><div id="accSells"></div></div>` : ''}
        <div class="section"><h3>Qué vender de lo que tenés</h3><div id="accItems"></div></div>`;
      pagedTable($('#accSells'), {
        head: ['Item', 'Tu precio', 'Precio más bajo', 'Cantidad', 'Estado'], rows: d.activeSells, label: 'ventas', limit: 25,
        row: (s) => `<td>${itemCell(s, new Date(s.created).toLocaleString('es-AR', { hour12: false }))}</td><td>${coin(s.price)}</td><td>${coin(s.lowest)}</td><td class="num">${qty(s.quantity)}</td><td>${s.undercut ? '<span class="pill bad">te superaron</span>' : '<span class="pill good">ok</span>'}</td>`,
      });
      pagedTable($('#accItems'), {
        head: ['Item', 'Cantidad', 'Dónde', 'Publicando (total)', 'Al instante (total)', 'Vendidos 24h', 'Sugerencia'], rows: d.items, label: 'items comerciables', limit: 50,
        empty: 'No encontré items comerciables.',
        row: (i) => `<td>${itemCell(i)}</td><td class="num">${qty(i.count)}</td><td class="left small muted">${esc(Object.entries(i.where).map(([w, n]) => `${w} (${n})`).join(', '))}</td>
          <td>${coin(i.listTotal)}</td><td>${coin(i.instantTotal)}</td><td class="num">${qty(i.s1)}</td><td class="left small">${esc(i.advice)}</td>`,
      });
    } catch (e) {
      box.innerHTML = `<div class="empty">${esc(e.message)}<br><br><button class="btn" id="openSet">Abrir ajustes</button></div>`;
      $('#openSet')?.addEventListener('click', openSettings);
    }
  }
  rowClicks(view);
  current = { name: 'cuenta', refresh: () => load(false) };
  load();
}

// ---------- Ficha de item ----------
const drawer = $('#drawer');
let openId = null;
// Un solo listener para los links internos de la ficha (sobrevive a cambios de página de las tablas).
$('#drawerBody').addEventListener('click', (e) => {
  const el = e.target.closest('[data-goto]');
  if (!el || e.target.closest('.pager')) return;
  e.preventDefault();
  location.hash = `#/item/${el.dataset.goto}`;
});
function closeDrawer(updateHash = true) {
  if (!drawer.classList.contains('open')) return;
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  openId = null;
  if (updateHash && location.hash.startsWith('#/item/')) {
    location.hash = `#/${lastView || 'bazar'}`;
  }
}
drawer.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeDrawer(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

async function openItem(id, { silent = false } = {}) {
  openId = id;
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  const body = $('#drawerBody');
  if (!silent) body.innerHTML = '<div class="skeleton" style="height:56px;margin-bottom:12px"></div><div class="skeleton"></div>';
  try {
    const d = await api(`/api/item/${id}?mode=${S.crafteo.mode}`);
    if (openId !== id) return;
    body.innerHTML = itemHTML(d);
    wireItem(body, d);
    loadWiki(id);
  } catch (e) {
    body.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

function sparkline(hist) {
  if (!hist || hist.length < 2) return '<div class="spark empty small" style="display:grid;place-items:center;height:120px">La historia de precios se arma sola: cada 30 min se guarda una muestra (necesita al menos 2).</div>';
  const W = 700, H = 120, P = 8;
  const vals = hist.flatMap(([, b, s]) => [b, s]).filter(Boolean);
  const min = Math.min(...vals), max = Math.max(...vals);
  const t0 = hist[0][0], t1 = hist[hist.length - 1][0];
  const x = (t) => P + ((t - t0) / Math.max(1, t1 - t0)) * (W - 2 * P);
  const y = (v) => H - P - ((v - min) / Math.max(1, max - min)) * (H - 2 * P);
  const line = (i) => hist.filter((p) => p[i]).map((p, k) => `${k ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[i]).toFixed(1)}`).join('');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${line(2)}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/><path d="${line(1)}" fill="none" stroke="var(--r-Fine)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>
    <div class="legend"><span><i style="background:var(--accent)"></i>Venta</span><span><i style="background:var(--r-Fine)"></i>Orden de compra</span><span>${new Date(t0).toLocaleString('es-AR', { hour12: false })} → ${new Date(t1).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</span><span>mín ${coin(min)} · máx ${coin(max)}</span></div>`;
}

function treeHTML(n, top = true) {
  if (n.currency) {
    return `<li><div class="tnode"><span class="q">${qty(n.qty)}×</span>${n.coin ? coin(n.qty) : `<span class="muted">${esc(n.currency)} #${n.id}</span>`}</div></li>`;
  }
  const img = n.icon ? `<img src="${esc(n.icon)}" alt="">` : '';
  const tp = n.tpUnit != null ? `<span class="opt ${n.chosen === 'tp' ? 'on' : ''}">comprar ${coin(n.tpUnit * n.qty)}</span>` : n.tradable ? '' : '<span class="pill">no comerciable</span>';
  const cr = n.craftUnit != null ? `<span class="opt ${n.chosen === 'craft' ? 'on' : ''}">craftear ${coin(n.craftUnit * n.qty)}</span>` : n.recipe?.incomplete ? '<span class="pill warn">receta con ingredientes sin precio</span>' : ''
  const gate = n.gated ? '<span class="pill warn">1 por día</span>' : '';
  const disc = n.recipe ? `<span class="muted small">${esc(n.recipe.disciplines.map((d) => META.disciplines[d] || d).join(', '))} ${n.recipe.flags?.includes('Wiki') ? '' : n.recipe.minRating}${n.recipe.flags?.includes('LearnedFromItem') ? ' · requiere receta' : ''}${n.recipe.outCount > 1 ? ` · da ${n.recipe.outCount}` : ''}</span>` : '';
  const head = `<div class="tnode">${n.children.length ? '<span class="tw">▸</span>' : '<span style="width:12px"></span>'}<span class="q">${qty(n.qty)}×</span>${img}<span class="lnk rar-${esc(n.rarity)}" data-goto="${n.id}">${esc(n.name)}</span>${gate}${tp}${cr}${disc}</div>${n.obtain ? `<div class="tobtain">${obtainHTML(n.obtain)}</div>` : ''}`;
  if (!n.children.length) return `<li>${head}</li>`;
  // Abrimos solas las ramas que hay que craftear sí o sí (Forja, no comerciables) para ver la cadena completa.
  const open = top || n.chosen === 'craft' || !n.tradable || n.recipe?.flags?.includes('Wiki');
  return `<li><details class="tg" ${open ? 'open' : ''}><summary>${head}</summary><ul>${n.children.map((c) => treeHTML(c, false)).join('')}</ul></details></li>`;
}


const discName = (ds) => (ds || []).map((x) => META.disciplines[x] || x).join(', ');
const ingIcon = (g) => (g.icon ? `<img src="${esc(g.icon)}" alt="" class="ing-ic bd-${esc(g.rarity)}">` : '<span class="ing-ic icon-ph"></span>');

/** Sección "Cómo se crea": recetas, ingredientes, lista de compras y árbol completo. */
function recipesHTML(d) {
  if (!d.recipes?.length) return '';
  const cards = d.recipes.map((r, i) => `
    <div class="recipe">
      <div class="recipe-h">
        <b>${d.recipes.length > 1 ? `Receta ${i + 1}` : 'Receta'}</b>
        ${r.fromWiki
          ? `<span class="pill warn">${esc(discName(r.disciplines))}</span><span class="pill">receta tomada de la wiki</span>`
          : `<span class="pill">${esc(discName(r.disciplines))} · nivel ${r.minRating}</span>
        <span class="pill ${r.needsRecipe ? 'warn' : 'good'}">${r.needsRecipe ? 'hay que aprender la receta (item de receta)' : 'se aprende sola al subir la disciplina'}</span>`}
        ${r.outCount > 1 ? `<span class="pill">da ${r.outCount} unidades</span>` : ''}
      </div>
      <table class="ing"><thead><tr><th>Ingrediente</th><th>Cantidad</th><th>Precio c/u</th><th>Subtotal</th><th>De dónde sale</th></tr></thead><tbody>
      ${r.ingredients.map((g) => g.kind !== 'Item'
        ? `<tr><td>${g.coin ? 'Monedas' : esc(`${g.kind} #${g.id}`)}</td><td class="num">${qty(g.count)}</td><td></td><td>${g.coin ? coin(g.count) : ''}</td><td class="left small muted">${g.coin ? 'se paga al craftear' : 'divisa / mejora de clan'}</td></tr>`
        : `<tr data-goto="${g.id}" class="clickable"><td><span class="ing-name">${ingIcon(g)}<span class="rar-${esc(g.rarity)}">${esc(g.name)}</span></span></td><td class="num">${qty(g.count)}</td>
            <td>${coin(g.unit)}</td><td>${g.unit != null ? coin(g.unit * g.count) : coin(null)}</td>
            <td class="left small">${[g.tradable ? 'bazar' : '', g.craftable ? 'se craftea' : '', !g.tradable && !g.craftable ? (g.obtain ? obtainHTML(g.obtain) : '<span class="pill warn">no comerciable: NPC, drop o divisa</span>') : ''].filter(Boolean).join(' · ')}</td></tr>`).join('')}
      </tbody></table>
    </div>`).join('');

  const sh = d.shopping;
  const shop = sh ? `
    <h4 class="sub-h">Lista de compras para 1 unidad <span class="muted small">(camino más barato: comprar lo que conviene y craftear el resto)</span></h4>
    <table class="ing"><thead><tr><th>Material</th><th>Cantidad</th><th>Precio c/u</th><th>Subtotal</th></tr></thead><tbody>
      ${sh.items.map((e) => e.kind !== 'Item'
        ? `<tr><td>${esc(e.name)}</td><td class="num">${qty(e.qty)}</td><td></td><td class="muted small">divisa</td></tr>`
        : `<tr data-goto="${e.id}" class="clickable"><td><span class="ing-name">${ingIcon(e)}<span class="rar-${esc(e.rarity)}">${esc(e.name)}</span></span></td><td class="num">${qty(e.qty)}</td><td>${coin(e.unit)}</td><td>${e.unit != null ? coin(e.unit * e.qty) : '<span class="pill warn">sin precio</span>'}</td></tr>${e.obtain ? `<tr class="obtain-row"><td colspan="4">${obtainHTML(e.obtain)}</td></tr>` : ''}`).join('')}
      ${sh.coins ? `<tr><td>Monedas (costo de la receta)</td><td></td><td></td><td>${coin(sh.coins)}</td></tr>` : ''}
      <tr class="tot"><td>Total</td><td></td><td></td><td>${coin(sh.total)}${sh.missing ? ` <span class="muted small">+ ${sh.missing} sin precio</span>` : ''}</td></tr>
    </tbody></table>
    ${sh.crafts.length ? `<h4 class="sub-h">Pasos intermedios que conviene craftear</h4><ul class="steps">${sh.crafts.map((c) => `<li>${qty(c.qty)}× <a href="#/item/${c.id}" data-goto="${c.id}" class="rar-${esc(c.rarity)}">${esc(c.name)}</a> <span class="muted small">— ${esc(discName(c.disciplines))} ${c.minRating || ''}${c.needsRecipe ? ' · requiere receta' : ''}${c.gated ? ' · 1 por día' : ''}</span></li>`).join('')}</ul>` : ''}` : '';

  return `<div class="section"><h3>Cómo se crea</h3>
    ${cards}
    ${shop}
    ${d.tree ? `<details class="tree-wrap" open><summary>Árbol completo en cadena (tocá cada rama para abrir o cerrar)</summary>
      <p class="muted small">Verde = la opción más barata en cada paso. Ingredientes con <em>${S.crafteo.mode === 'order' ? 'órdenes de compra' : 'compra instantánea'}</em> (cambialo en Recomendados → Crafteo).</p>
      <div class="tree"><ul>${treeHTML(d.tree)}</ul></div></details>` : ''}
    <p class="muted small">Las recetas de la Forja Mística no están en la API oficial: las tomamos de la wiki oficial (copia archivada). Si un item salió después de esa copia, puede faltar su receta.</p>
  </div>`;
}


const OBTAIN_ICON = { npc: '🧑‍💼', track: '🎖', reward: '🏆', container: '🎁', gather: '⛏', note: 'ℹ' };
const obtainHTML = (list) => `<span class="obtain">${list.map((o) => `<span class="ob ob-${o.kind}">${OBTAIN_ICON[o.kind] || '•'} ${esc(o.text)}</span>`).join('')}</span>`;

/** Bloque "Dónde se consigue" con datos de la wiki ya extraídos (no depende de que la wiki esté en línea). */
function wikiDataHTML(w) {
  if (!w) return '';
  const list = (title, arr) => (arr?.length ? `<h4 class="sub-h">${title}</h4><ul class="steps">${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
  const vendors = w.soldBy?.length
    ? `<h4 class="sub-h">Lo venden estos NPC</h4><div class="table-wrap"><table class="ing"><thead><tr><th>NPC</th><th>Zona</th><th>Mapa</th><th>Costo</th><th>Notas</th></tr></thead><tbody>
       ${w.soldBy.map((v) => `<tr><td class="left">${esc(v.vendor)}</td><td class="left">${esc(v.area)}</td><td class="left">${esc(v.zone)}</td><td class="left">${esc(v.cost)}</td><td class="left small muted">${esc(v.notes)}</td></tr>`).join('')}
       </tbody></table></div>` : '';
  const body = vendors + list('Sale de estos contenedores / bolsas', w.containedIn) + list('Reward tracks (PvP / WvW)', w.rewardTracks) + list('Recolección', w.gathered) + list('Recompensa de', w.rewardedBy) + (w.note ? `<p class="muted small">${esc(w.note)}</p>` : '');
  if (!body) return '';
  return `<div class="wiki-data">${body}<p class="muted small">Datos de la wiki oficial (copia archivada${w.snapshot ? ` del ${esc(w.snapshot)}` : ''}). Los nombres de NPC y mapas están en inglés, como en la wiki.</p></div>`;
}

const WAY_ICON = { tp: '⚖', craft: '⚒', 'npc-sell': '🪙', notp: '✋' };

function itemHTML(d) {
  const it = d.item, m = d.market;
  const L = d.listings;
  const depth = (rows, label) => `<div class="depth table-wrap"><table><thead><tr><th>${label}</th><th>Cantidad</th><th>Listings</th></tr></thead><tbody>
    ${(rows || []).map((x) => `<tr><td class="left">${coin(x.unit_price)}</td><td class="num">${qty(x.quantity)}</td><td class="num">${qty(x.listings)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">—</td></tr>'}</tbody></table></div>`;
  return `
    <div class="d-head">
      ${it.icon ? `<img src="${esc(it.icon)}" class="bd-${esc(it.rarity)}" alt="">` : ''}
      <div><h2 class="rar-${esc(it.rarity)}">${esc(it.name)}</h2>
        <div class="meta"><span>${esc(typeName(it.type))}${it.sub ? ` · ${esc(it.sub)}` : ''}</span><span>${esc(rarName(it.rarity))}</span>${it.level ? `<span>Nivel ${it.level}</span>` : ''}${it.nameEn ? `<span>EN: ${esc(it.nameEn)}</span>` : ''}<span>ID ${it.id}</span>
        ${it.chat ? `<button class="btn ghost small" data-copy="${esc(it.chat)}">Copiar código de chat</button>` : ''}</div></div>
    </div>
    ${it.desc ? `<p class="d-desc">${esc(it.desc)}</p>` : ''}
    <div class="cards">
      <div class="card"><div class="k">Orden de compra</div><div class="v">${coin(m.buy)}</div><div class="h">${qty(m.buyQty)} pedidas</div></div>
      <div class="card"><div class="k">Precio de venta</div><div class="v">${coin(m.sell)}</div><div class="h">${qty(m.sellQty)} en venta</div></div>
      <div class="card"><div class="k">Cobrás publicando</div><div class="v">${coin(d.netSell)}</div><div class="h">venta − 1c − 15%</div></div>
      <div class="card"><div class="k">Cobrás al instante</div><div class="v">${coin(d.netInstant)}</div><div class="h">vendiendo a la orden</div></div>
      <div class="card"><div class="k">Vendidos 24h / 7d</div><div class="v num">${qty(m.s1)} <span class="muted">/ ${qty(m.s7)}</span></div><div class="h">órdenes llenadas: ${qty(m.b1)} / ${qty(m.b7)}</div></div>
      <div class="card"><div class="k">Margen de flipeo</div><div class="v">${coin(m.profit)}</div><div class="h">ROI ${pct(m.roi)}</div></div>
    </div>
    <div class="section"><h3>Precio últimas 24 h</h3>${sparkline(d.history)}</div>
    ${L ? `<div class="section"><h3>Libro de órdenes en vivo <span class="muted small">(${new Date(L.at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })})</span></h3><div class="two">${depth(L.sells, 'Vendiendo a')}${depth(L.buys, 'Comprando a')}</div></div>` : ''}

    <div class="section"><h3>Cómo conseguirlo</h3>
      <div class="ways">${d.ways.map((w) => `<div class="way"><div class="ic">${WAY_ICON[w.kind] || '•'}</div><div><b>${esc(w.title)}</b><p>${coinText(w.text)}</p></div></div>`).join('')}</div>
    </div>
    ${recipesHTML(d)}
    <div class="section" id="wikiSec"><h3>Dónde se consigue: NPC, mapa, drops y contenedores <span class="muted small">(wiki oficial)</span></h3>${wikiDataHTML(d.wiki)}<div id="wikiBox"><div class="skeleton"></div></div></div>
    ${d.hints.length ? `<div class="section"><h3>Guía general para este tipo de item</h3><ul class="hint-list">${d.hints.map((h) => `<li>${esc(h)}</li>`).join('')}</ul></div>` : ''}
    ${d.usedIn.total ? `<div class="section"><h3>Se usa para craftear (${d.usedIn.total})</h3>
      <p class="muted small">Si se usa en muchas recetas que se venden bien, la demanda es estable.</p><div id="usedInBox"></div></div>` : ''}
    <div class="section"><h3>Enlaces</h3><div class="links">
      ${d.links.wiki ? `<a class="btn ghost small" target="_blank" rel="noopener" href="${esc(d.links.wiki)}">Wiki (inglés)</a>` : ''}
      <a class="btn ghost small" target="_blank" rel="noopener" href="${esc(d.links.wikiEs)}">Wiki (español)</a>
      <a class="btn ghost small" target="_blank" rel="noopener" href="${esc(d.links.bltc)}">Historial en GW2BLTC</a>
    </div></div>`;
}

function wireItem(body, d) {
  if (d?.usedIn?.total) {
    pagedTable(body.querySelector('#usedInBox'), {
      head: ['Resultado', 'Necesita', 'Disciplina', 'Venta', 'Vendidos 24h'], rows: d.usedIn.list, label: 'recetas', limit: 25, rowAttr: 'data-goto',
      row: (u) => `<td>${itemCell(u)}</td><td class="num">${qty(u.need)}</td><td class="left small">${esc((u.disciplines || []).map((x) => META.disciplines[x] || x).join(', '))}</td><td>${coin(u.sell || null)}</td><td class="num">${qty(u.s1)}</td>`,
    });
  }
  body.querySelectorAll('[data-copy]').forEach((b) =>
    b.addEventListener('click', async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast('Código copiado: pegalo en el chat del juego'); } catch { toast(b.dataset.copy); } }),
  );
}

async function loadWiki(id, force = false) {
  const box = $('#wikiBox');
  if (!box) return;
  try {
    const w = await api(`/api/item/${id}/wiki${force ? '?force=1' : ''}`);
    if (openId !== id || !$('#wikiBox')) return;
    if (!w.available) {
      box.innerHTML = `<p class="muted">${esc(w.reason)}</p><div class="links"><a class="btn ghost small" target="_blank" rel="noopener" href="${esc(w.link)}">Abrir en la wiki</a><button class="btn ghost small" id="wikiRetry">Reintentar</button></div>`;
      $('#wikiRetry')?.addEventListener('click', () => { box.innerHTML = '<div class="skeleton"></div>'; loadWiki(id, true); });
      return;
    }
    const css = `body{font:14px/1.45 system-ui,sans-serif;margin:10px;color:#222;background:#f6f3ea}a{color:#6b4a0e}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #ddd3bd;padding:4px 6px;text-align:left}th{background:#ebe3cf}img{vertical-align:middle;max-width:100%;height:auto}h2,h3,h4{font-size:15px;margin:14px 0 6px}`;
    box.innerHTML = `${w.methods?.length ? `<div class="chips">${w.methods.map((m) => `<span class="chip">${esc(m)}</span>`).join('')}</div>` : ''}
      ${w.archived ? '<p class="muted small"><span class="pill warn">copia archivada</span> La wiki está en mantenimiento: esto viene de su última copia en archive.org.</p>' : ''}
      ${w.note ? `<p class="muted">${esc(w.note)}</p>` : ''}
      ${w.html ? '<iframe class="wiki" sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin" referrerpolicy="no-referrer"></iframe>' : ''}
      <div class="links" style="margin-top:8px"><a class="btn ghost small" target="_blank" rel="noopener" href="${esc(w.pageUrl || w.link)}">Ver página completa: ${esc(w.page || 'wiki')}</a></div>`;
    const fr = box.querySelector('iframe');
    if (fr) {
      fr.srcdoc = `<!doctype html><meta charset="utf-8"><base target="_blank"><style>${css}</style>${w.html}`;
      fr.addEventListener('load', () => { try { fr.style.height = Math.min(900, fr.contentDocument.body.scrollHeight + 30) + 'px'; } catch {} });
    }
  } catch (e) {
    box.innerHTML = `<p class="muted">No pude consultar la wiki: ${esc(e.message)}</p>`;
  }
}

// ---------- estado en vivo ----------
function paintStatus() {
  const s = STATUS;
  if (!s) return;
  const live = $('#live');
  const busy = s.phase !== 'al día';
  live.className = `live ${s.errors.length && !s.counts.prices ? 'err' : busy ? 'busy' : 'ok'}`;
  const p = s.progress;
  $('#liveText').textContent = busy
    ? `Actualizando ${s.phase}${p?.total ? ` ${p.done}/${p.total}` : ''}…`
    : `En vivo · precios ${ago(s.meta.pricesAt)}`;
  live.title = [`Items: ${nf.format(s.counts.items)} · Precios: ${nf.format(s.counts.prices)} · Volumen: ${nf.format(s.counts.volume)} · Recetas: ${nf.format(s.counts.recipes)}`, `Volumen DataWars2 ${ago(s.meta.volumeAt)}`, ...s.errors].join('\n');
  $('#progress span').style.width = busy && p?.total ? `${Math.round((p.done / p.total) * 100)}%` : '0';
}

async function pollStatus() {
  try { STATUS = await api('/api/status'); paintStatus(); } catch {}
}

function connectEvents() {
  const es = localEvents;
  es.addEventListener('sync', (e) => {
    const sync = JSON.parse(e.data);
    if (STATUS) { STATUS.phase = sync.phase; STATUS.progress = sync.progress; STATUS.errors = sync.errors || STATUS.errors; paintStatus(); }
    if (sync.phase === 'al día') pollStatus();
  });
  es.addEventListener('prices', async () => {
    await pollStatus();
    current?.refresh?.();
    if (openId) openItem(openId, { silent: true });
  });
  es.onerror = () => { $('#live').className = 'live err'; $('#liveText').textContent = 'sin conexión con el servidor local'; };
}

// ---------- ajustes ----------
const dlg = $('#settings');
async function openSettings() {
  const c = await api('/api/config').catch(() => ({}));
  $('#apiKey').value = '';
  $('#keyStatus').textContent = c.hasKey ? `Key guardada: ${c.keyPreview}` : 'Sin API key.';
  dlg.showModal();
}
$('#btnSettings').addEventListener('click', openSettings);
$('#btnSaveKey').addEventListener('click', async () => {
  const v = $('#apiKey').value.trim();
  if (!v) return toast('Pegá tu API key primero');
  $('#keyStatus').textContent = 'Verificando…';
  try {
    const r = await api('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: v }) });
    $('#keyStatus').textContent = `OK: cuenta ${r.name} · permisos: ${r.permissions.join(', ')}`;
    toast('API key guardada');
    if (current?.name === 'cuenta') renderAccount(true);
  } catch (e) {
    $('#keyStatus').textContent = e.message;
  }
});
$('#btnClearKey').addEventListener('click', async () => {
  await api('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: '' }) });
  $('#keyStatus').textContent = 'Key borrada.';
});
$('#btnRefresh').addEventListener('click', async () => { await api('/api/refresh', { method: 'POST' }); toast('Actualizando precios…'); });

// ---------- arranque ----------
(async () => {
  try { META = await api('/api/meta'); } catch {}
  await pollStatus();
  if (STATUS?.publicMode) {
    // Vista pública (link compartido): sin cuenta ni ajustes.
    $('#tabs a[data-tab="cuenta"]')?.remove();
    $('#btnSettings')?.remove();
    if (location.hash.startsWith('#/cuenta')) location.hash = '#/bazar';
  }
  setInterval(pollStatus, 30_000);
  connectEvents();
  route();
})();
