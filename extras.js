// Favoritos, comparador de items y directorio de NPC vendedores (traídos de Bazaar Ledger, sólo en el Bazar local).
const FAV = 'gw2-bazar-favs';
const CMP = 'gw2-bazar-compare';
const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const nf = (n) => Number(n || 0).toLocaleString('es-AR');
const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const favs = () => read(FAV);
export const isFav = (id) => favs().some((f) => f.id === id);
export function toggleFav(it) {
  const l = favs();
  const i = l.findIndex((f) => f.id === it.id);
  if (i >= 0) l.splice(i, 1); else l.unshift({ id: it.id, name: it.name, icon: it.icon, rarity: it.rarity });
  write(FAV, l.slice(0, 300));
  return i < 0;
}
export const compareList = () => read(CMP);
export function addCompare(it) {
  const l = compareList().filter((x) => x.id !== it.id);
  l.push({ id: it.id, name: it.name, icon: it.icon, rarity: it.rarity });
  write(CMP, l.slice(-4));
  return l.length > 4;
}

async function byIds(api, ids) { return ids.length ? api(`/api/items/by-ids?ids=${ids.join(',')}`) : []; }

const priceCells = (r, coin) => `<td>${r.sell ? coin(r.sell) : '—'}</td><td>${r.buy ? coin(r.buy) : '—'}</td><td class="num">${r.s1 != null ? nf(r.s1) : '—'}</td><td class="${r.change24 > 0 ? 'good-t' : r.change24 < 0 ? 'warn-t' : ''}">${r.change24 != null ? `${r.change24 > 0 ? '+' : ''}${(r.change24 * 100).toFixed(1)}%` : '—'}</td>`;

/* ---------------- Favoritos ---------------- */
export async function renderFavoritos(view, { api, esc, coin, itemCell }) {
  view.innerHTML = `<div class="page-head"><div><h1>Favoritos</h1><p>Los items que marcaste con ☆ en su ficha, con el precio del bazar en vivo. Se guardan en este navegador.</p></div></div><div id="fvBox"><div class="skeleton"></div></div>`;
  async function paint() {
    const l = favs();
    const box = view.querySelector('#fvBox');
    if (!l.length) { box.innerHTML = '<div class="empty">Todavía no tenés favoritos. Abrí un item y tocá ☆ arriba de su ficha.</div>'; return; }
    const rows = await byIds(api, l.map((f) => f.id)).catch(() => []);
    const by = new Map(rows.map((r) => [r.id, r]));
    box.innerHTML = `<div class="table-wrap"><table><thead><tr><th class="left">Item</th><th>Venta</th><th>Compra</th><th>Vendidos 24 h</th><th>Cambio 24 h</th><th></th></tr></thead><tbody>
      ${l.map((f) => { const r = by.get(f.id) || f; return `<tr class="clickable" data-id="${f.id}"><td class="left">${itemCell({ ...f, ...r }, '')}</td>${priceCells(r, coin)}<td><button class="icon-btn" data-unfav="${f.id}" title="Quitar de favoritos">★</button> <button class="icon-btn" data-cmp="${f.id}" title="Agregar al comparador">⚖</button></td></tr>`; }).join('')}
      </tbody></table></div>`;
  }
  view.querySelector('#fvBox').addEventListener('click', (e) => {
    const u = e.target.closest('[data-unfav]');
    if (u) { const f = favs().find((x) => x.id === Number(u.dataset.unfav)); if (f) toggleFav(f); paint(); return; }
    const c = e.target.closest('[data-cmp]');
    if (c) { const f = favs().find((x) => x.id === Number(c.dataset.cmp)); if (f) addCompare(f); location.hash = '#/comparar'; return; }
    const tr = e.target.closest('tr[data-id]');
    if (tr && !e.target.closest('a')) location.hash = `#/item/${tr.dataset.id}`;
  });
  paint();
}

/* ---------------- Comparador ---------------- */
export async function renderComparar(view, { api, esc, coin, itemCell, debounce }) {
  view.innerHTML = `<div class="page-head"><div><h1>Comparar items</h1><p>Hasta 4 items lado a lado: precios, cantidades vendidas, ganancia de reventa, receta y cómo se consiguen. Agregalos acá o con ⚖ desde la ficha de un item.</p></div></div>
    <div class="leg-add" style="max-width:520px"><input type="search" id="cmQ" placeholder="Agregar item… (nombre)" autocomplete="off"><div class="ac-list" id="cmAc" hidden></div></div>
    <div id="cmBox" style="margin-top:12px"><div class="skeleton"></div></div>`;
  const q = view.querySelector('#cmQ'), ac = view.querySelector('#cmAc');
  q.addEventListener('input', debounce(async () => {
    const t = q.value.trim();
    if (t.length < 2) { ac.hidden = true; return; }
    const d = await api(`/api/catalog?q=${encodeURIComponent(t)}&limit=10`).catch(() => ({ rows: [] }));
    ac.innerHTML = d.rows.map((r) => `<button type="button" class="ac-item" data-add="${r.id}" data-name="${esc(r.name)}" data-icon="${esc(r.icon || '')}" data-rarity="${esc(r.rarity || '')}">${itemCell(r)}</button>`).join('') || '<div class="empty small">Nada coincide.</div>';
    ac.hidden = false;
  }, 250));
  ac.addEventListener('click', (e) => { const b = e.target.closest('[data-add]'); if (!b) return; addCompare({ id: Number(b.dataset.add), name: b.dataset.name, icon: b.dataset.icon, rarity: b.dataset.rarity }); q.value = ''; ac.hidden = true; paint(); });
  async function paint() {
    const l = compareList();
    const box = view.querySelector('#cmBox');
    if (!l.length) { box.innerHTML = '<div class="empty">Agregá items para compararlos.</div>'; return; }
    const [rows, details] = await Promise.all([byIds(api, l.map((x) => x.id)).catch(() => []), Promise.all(l.map((x) => api(`/api/item/${x.id}`).catch(() => null)))]);
    const by = new Map(rows.map((r) => [r.id, r]));
    const cols = l.map((x, i) => ({ ...x, ...(by.get(x.id) || {}), d: details[i] }));
    const line = (label, f) => `<tr><th class="left">${label}</th>${cols.map((c) => `<td>${f(c)}</td>`).join('')}</tr>`;
    box.innerHTML = `<div class="table-wrap"><table class="cmp-t"><thead><tr><th></th>${cols.map((c) => `<th class="left">${itemCell(c, '')}<button class="icon-btn" data-rm="${c.id}" title="Sacar">✕</button></th>`).join('')}</tr></thead><tbody>
      ${line('Rareza / tipo', (c) => esc([c.rarity, c.type, c.level ? `nivel ${c.level}` : ''].filter(Boolean).join(' · ')))}
      ${line('Precio de venta', (c) => (c.sell ? coin(c.sell) : '—'))}
      ${line('Orden de compra', (c) => (c.buy ? coin(c.buy) : '—'))}
      ${line('En venta / pedidos', (c) => `${nf(c.sellQty)} / ${nf(c.buyQty)}`)}
      ${line('Vendidos 24 h / 7 días', (c) => `${c.s1 != null ? nf(c.s1) : '—'} / ${c.s7 != null ? nf(c.s7) : '—'}`)}
      ${line('Comprados 24 h / 7 días', (c) => `${c.b1 != null ? nf(c.b1) : '—'} / ${c.b7 != null ? nf(c.b7) : '—'}`)}
      ${line('Cambio 24 h', (c) => (c.change24 != null ? `${c.change24 > 0 ? '+' : ''}${(c.change24 * 100).toFixed(1)}%` : '—'))}
      ${line('Reventa (comprar y vender)', (c) => (c.profit != null ? `${coin(c.profit)} <span class="muted small">(${Math.round((c.roi || 0) * 100)}%)</span>` : '—'))}
      ${line('Se craftea', (c) => (c.d?.recipes?.length ? `sí (${c.d.recipes.length} receta${c.d.recipes.length === 1 ? '' : 's'})` : 'no'))}
      ${line('Cómo se consigue', (c) => esc((c.d?.obtain || []).map((o) => o.title).slice(0, 4).join(' · ') || '—'))}
      </tbody></table></div>`;
  }
  view.querySelector('#cmBox').addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { write(CMP, compareList().filter((x) => x.id !== Number(b.dataset.rm))); paint(); return; } const a = e.target.closest('th .item-cell, th a'); if (a) return; });
  paint();
}

/* ---------------- NPC vendedores ---------------- */
export async function renderVendedores(view, { api, esc, coin }) {
  view.innerHTML = `<div class="page-head"><div><h1>NPC vendedores</h1><p>Quién vende qué y dónde: todos los NPC con su tienda, la moneda que aceptan y el punto en el mapa con el waypoint más cercano.</p></div></div>
    <div class="filters"><input type="search" id="vdQ" placeholder="Buscar NPC, zona o item que vende…" style="flex:1;min-width:220px">
      <label>Moneda <select id="vdCur"><option value="">cualquiera</option></select></label></div>
    <p class="muted small" id="vdCount"></p><div id="vdList"><div class="skeleton"></div></div><div class="pager" id="vdPager"></div>`;
  let all = [];
  try {
    const d = await api('/api/vendors');
    all = [...(d.markers || []), ...(d.unplaced || [])];
    view.querySelector('#vdCur').innerHTML += (d.currencies || []).map((c) => `<option value="${esc(c.es)}">${esc(c.es)} (${c.n})</option>`).join('');
  } catch (e) { view.querySelector('#vdList').innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  let page = 1;
  const PER = 30;
  function paint() {
    const t = norm(view.querySelector('#vdQ').value).trim();
    const cur = view.querySelector('#vdCur').value;
    const L = all.filter((v) => (!cur || v.currencies.some((c) => c.es === cur)) && (!t || norm(`${v.vendor} ${v.area} ${v.zone} ${v.items.map((i) => i.name).join(' ')}`).includes(t)))
      .sort((a, b) => b.items.length - a.items.length);
    const pages = Math.max(1, Math.ceil(L.length / PER));
    page = Math.min(page, pages);
    view.querySelector('#vdCount').textContent = `${nf(L.length)} NPC`;
    view.querySelector('#vdList').innerHTML = L.slice((page - 1) * PER, page * PER).map((v) => {
      const its = t ? [...v.items.filter((i) => norm(i.name).includes(t)), ...v.items.filter((i) => !norm(i.name).includes(t))] : v.items;
      return `<details class="cur-vendor"><summary><b>${esc(v.vendor)}</b> <span class="muted small">— ${esc([v.area, v.zone].filter(Boolean).join(', ') || 'sin ubicación')} · ${v.items.length} item${v.items.length === 1 ? '' : 's'}${v.currencies.length ? ` · ${esc(v.currencies.map((c) => c.es).slice(0, 4).join(', '))}` : ''}</span>
        ${v.loc ? ` <a class="small" href="#/mapa/${encodeURIComponent(v.key)}">📍 mapa</a>` : ''}${v.waypoint ? ` <span class="muted small">· waypoint: ${esc(v.waypoint.name)}</span>` : ''}</summary>
        <div class="table-wrap"><table class="ing"><thead><tr><th class="left">Vende</th><th class="left">Costo</th><th class="left">Notas</th></tr></thead><tbody>
        ${its.slice(0, 200).map((i) => `<tr><td class="left">${i.id ? `<a href="#/item/${i.id}" class="rar-${esc(i.rarity || '')}">${i.icon ? `<img src="${esc(i.icon)}" alt="" class="ic16"> ` : ''}${esc(i.name)}</a>` : esc(i.name)}</td><td class="left">${esc(i.cost || '')}</td><td class="left small muted">${esc(i.notes || '')}</td></tr>`).join('')}
        </tbody></table></div></details>`;
    }).join('') || '<div class="empty">Nada coincide.</div>';
    view.querySelector('#vdPager').innerHTML = `${page > 1 ? '<button class="btn ghost small" data-pg="-1">← Anterior</button>' : ''}<span class="muted small">Página ${page} de ${pages}</span>${page < pages ? '<button class="btn ghost small" data-pg="1">Siguiente →</button>' : ''}`;
  }
  let tm = null;
  view.querySelector('#vdQ').addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { page = 1; paint(); }, 250); });
  view.querySelector('#vdCur').addEventListener('change', () => { page = 1; paint(); });
  view.querySelector('#vdPager').addEventListener('click', (e) => { const b = e.target.closest('[data-pg]'); if (!b) return; page += Number(b.dataset.pg); paint(); view.querySelector('#vdList').scrollIntoView({ block: 'start' }); });
  paint();
}
