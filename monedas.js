// Pestaña "Monedas": todas las monedas de la cartera (API oficial), cuánto tenés (con tu API key),
// en qué NPC se gastan y qué se compra con cada una, qué items las dan y cómo se consiguen.
import { wireGuide } from './guide-ui.js';
const API = () => `${globalThis.GW2_API_BASE || 'https://api.guildwars2.com'}/v2`;
let CUR = null;
async function currencies() {
  if (CUR) return CUR;
  CUR = (async () => {
    const [es, en] = await Promise.all(['es', 'en'].map((l) => fetch(`${API()}/currencies?ids=all&lang=${l}`).then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); })));
    const enBy = new Map(en.map((c) => [c.id, c.name]));
    return es.map((c) => ({ ...c, nameEn: enBy.get(c.id) || c.name })).sort((a, b) => a.order - b.order);
  })();
  CUR.catch(() => { CUR = null; });
  return CUR;
}
let WALLET = null;
async function wallet(api) {
  if (WALLET) return WALLET;
  try { const d = await api('/api/account/wallet'); WALLET = new Map((d.wallet || []).map((w) => [w.id, w.value])); } catch { WALLET = new Map(); }
  setTimeout(() => { WALLET = null; }, 120000);
  return WALLET;
}
const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const nf = (n) => Number(n).toLocaleString('es-AR');
const valueOf = (c, v, coin) => (c.id === 1 ? coin(v) : nf(v));

export async function renderMonedas(view, { api, esc, coin }) {
  view.innerHTML = `<div class="page-head"><div><h1>Monedas</h1><p>Todas las monedas de la cartera del juego: para qué sirven, <b>en qué NPC se gastan</b> y qué se compra con cada una, y qué items las dan. Con tu API key cargada, también cuánto tenés de cada una.</p></div></div>
    <div class="filters"><input type="search" id="curQ" placeholder="Buscar moneda… (ej: profecía, magnetita, insignia, karma)" style="flex:1;min-width:240px">
      <label><input type="checkbox" id="curMine"> Sólo las que tengo</label></div>
    <div id="curList"><div class="skeleton"></div></div>`;
  let list;
  try { list = await currencies(); } catch (e) { view.querySelector('#curList').innerHTML = `<div class="empty">No pude traer las monedas de la API oficial: ${esc(e.message)}</div>`; return; }
  const w = await wallet(api);
  let q = '';
  try { q = sessionStorage.getItem('gw2-cur-q') || ''; } catch {}
  const qi = view.querySelector('#curQ'); qi.value = q;
  const paint = () => {
    const t = norm(q).trim();
    const mine = view.querySelector('#curMine').checked;
    const rows = list.filter((c) => (!t || norm(`${c.name} ${c.nameEn} ${c.description}`).includes(t)) && (!mine || w.get(c.id)));
    view.querySelector('#curList').innerHTML = rows.length ? `<div class="cur-grid">${rows.map((c) => `<a class="cur-tile" href="#/moneda/${c.id}">
      <img src="${esc(c.icon)}" alt="" loading="lazy"><div><b>${esc(c.name)}</b>${c.name !== c.nameEn ? ` <span class="muted small">(${esc(c.nameEn)})</span>` : ''}
      <div class="small muted cur-desc">${esc(c.description || '')}</div>
      ${w.size ? `<div class="small">Tenés: <b>${w.get(c.id) ? valueOf(c, w.get(c.id), coin) : '0'}</b></div>` : ''}</div></a>`).join('')}</div>
      <p class="muted small">${rows.length} monedas${w.size ? '' : ' · cargá tu API key en «Mi cuenta» para ver cuánto tenés de cada una'}.</p>` : '<div class="empty">Ninguna moneda coincide.</div>';
  };
  qi.addEventListener('input', () => { q = qi.value; try { sessionStorage.setItem('gw2-cur-q', q); } catch {} paint(); });
  view.querySelector('#curMine').addEventListener('change', paint);
  if (!w.size) view.querySelector('#curMine').closest('label').hidden = true;
  paint();
}

export async function renderMoneda(view, id, { api, esc, coin }) {
  view.innerHTML = '<div class="skeleton"></div>';
  let list;
  try { list = await currencies(); } catch (e) { view.innerHTML = `<div class="empty">No pude traer las monedas: ${esc(e.message)}</div>`; return; }
  const c = list.find((x) => x.id === id);
  if (!c) { view.innerHTML = '<div class="empty">No existe esa moneda.</div>'; return; }
  const [w, uses] = await Promise.all([wallet(api), api(`/api/currency?en=${encodeURIComponent(c.nameEn)}`).catch(() => ({ vendors: [], items: [], total: 0 }))]);
  const have = w.get(c.id);
  const wikiUrl = `https://wiki.guildwars2.com/wiki/${encodeURIComponent(c.nameEn.replace(/ /g, '_'))}`;
  const itemA = (x) => `<a href="#/item/${x.id}" class="gd-it" data-it="${x.id}">${x.icon ? `<img src="${esc(x.icon)}" alt="">` : '<span class="gd-ph"></span>'}<span class="rar-${esc(x.rarity || '')}">${esc(x.name)}</span></a>`;
  const costTxt = (s) => String(s || '').split(c.nameEn).join(c.name).replace(/(\d+) for (\d+)/g, '$1 por $2');
  const gone = (v) => /currently unavailable|\/historical/i.test(v.vendor);
  const vname = (v) => v.vendor.replace(/\s*\((?:vendor|item) currently unavailable\)/i, '').replace(/\/historical$/i, '');
  view.innerHTML = `<p><a href="#/monedas">← Monedas</a></p>
    <div class="cur-head"><img src="${esc(c.icon)}" alt=""><div><h1>${esc(c.name)}</h1><div class="muted small">EN: ${esc(c.nameEn)} · id ${c.id}</div>
      <p>${esc(c.description || '')}</p>${w.size ? `<p>Tenés: <b>${have ? valueOf(c, have, coin) : '0'}</b></p>` : ''}</div></div>
    ${uses.items.length ? `<div class="section"><h3>Items que dan esta moneda</h3><p class="small muted">Al usarlos (doble clic) se suman a la cartera. Tocá uno para ver de dónde sale.</p><div class="gd-needs">${uses.items.map((x) => `<span>${itemA(x)}</span>`).join('')}</div></div>` : ''}
    <div class="section"><h3>Dónde se gasta: NPC que la aceptan <span class="muted small">(${uses.vendors.length} NPC · ${uses.total} ofertas)</span></h3>
      ${uses.vendors.length ? `<input type="search" id="curItQ" placeholder="Buscar qué comprar con esta moneda…" style="width:100%;max-width:420px;margin-bottom:8px">
      ${uses.vendors.map((v, i) => `<details class="cur-vendor" ${i < 3 ? 'open' : ''}><summary><b>${esc(vname(v))}</b>${gone(v) ? ' <span class="pill warn">ya no está</span>' : ''} <span class="muted small">— ${esc([v.area, v.zone].filter(Boolean).join(', ') || 'objeto portátil')} · ${v.items.length} oferta${v.items.length === 1 ? '' : 's'}</span>${v.zone ? ` <a class="small" href="#/mapa/${encodeURIComponent(v.map)}">📍 mapa</a>` : ''}</summary>
        <div class="table-wrap"><table class="ing"><thead><tr><th>Se compra</th><th>Costo</th><th>Notas</th></tr></thead><tbody>
        ${v.items.map((x) => `<tr data-hay="${esc(norm(`${x.name} ${x.nameEn}`))}"><td class="left">${x.id ? itemA(x) : esc(x.name)}</td><td class="left">${esc(costTxt(x.cost))}</td><td class="left small muted">${esc(x.notes || '')}</td></tr>`).join('')}
        </tbody></table></div></details>`).join('')}` : '<p class="muted">No tengo registrado ningún NPC que acepte esta moneda (los datos vienen de la copia de la wiki incluida en el sitio).</p>'}
    </div>
    <div class="section"><details id="curWiki"><summary><h3 style="display:inline">Cómo se consigue según la wiki <span class="muted small">(en inglés)</span></h3></summary><div id="curWikiBox"><div class="skeleton"></div></div></details>
      <div class="links" style="margin-top:8px"><a class="btn ghost small" target="_blank" rel="noopener" href="${esc(wikiUrl)}">Wiki (inglés)</a> <a class="btn ghost small" target="_blank" rel="noopener" href="https://wiki-es.guildwars2.com/index.php?search=${encodeURIComponent(c.name)}">Wiki (español)</a></div></div>`;
  wireGuide(view);
  view.querySelector('#curItQ')?.addEventListener('input', (e) => {
    const t = norm(e.target.value).trim();
    view.querySelectorAll('.cur-vendor').forEach((d) => {
      let any = false;
      d.querySelectorAll('tr[data-hay]').forEach((tr) => { const ok = !t || tr.dataset.hay.includes(t); tr.hidden = !ok; any ||= ok; });
      d.hidden = !any; if (t && any) d.open = true;
    });
  });
  view.querySelector('#curWiki').addEventListener('toggle', (e) => { if (e.target.open && !e.target.dataset.l) { e.target.dataset.l = '1'; loadWiki(view.querySelector('#curWikiBox'), c.nameEn, wikiUrl, esc); } });
  // Si no hay ningún NPC, abrimos sola la parte de la wiki.
  if (!uses.vendors.length && !uses.items.length) { const d = view.querySelector('#curWiki'); d.open = true; }
}

/** Sección "Acquisition" de la página de la wiki (copia archivada, a través del Bazar local). Sólo texto. */
async function loadWiki(box, title, url, esc) {
  try {
    const r = await fetch(`/api/wiki-archive?title=${encodeURIComponent(title.replace(/ /g, '_'))}`);
    if (!r.ok) throw new Error(String(r.status));
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    const root = doc.querySelector('#mw-content-text .mw-parser-output') || doc.querySelector('#mw-content-text');
    const h = root && [...root.querySelectorAll('h2')].find((x) => /acquisition|obtain/i.test(x.textContent));
    if (!h) throw new Error('sin sección');
    const out = [];
    let n = (h.closest('.mw-heading') || h).nextElementSibling;
    while (n && !(n.matches('h2, .mw-heading2'))) {
      if (n.matches('h3, h4, .mw-heading3, .mw-heading4')) out.push(`<h5>${esc(n.textContent.replace(/\[edit\]/g, '').trim())}</h5>`);
      else if (n.matches('table')) out.push(`<div class="table-wrap"><table class="ing">${[...n.rows].slice(0, 40).map((tr) => `<tr>${[...tr.cells].map((td) => `<${td.tagName === 'TH' ? 'th' : 'td'} class="left">${esc(td.textContent.replace(/\s+/g, ' ').trim())}</${td.tagName === 'TH' ? 'th' : 'td'}>`).join('')}</tr>`).join('')}</table></div>`);
      else if (n.matches('ul, ol, dl')) out.push(`<ul>${[...n.querySelectorAll('li, dd')].slice(0, 40).map((li) => `<li>${esc(li.textContent.replace(/\s+/g, ' ').trim())}</li>`).join('')}</ul>`);
      else if (n.textContent.trim()) out.push(`<p>${esc(n.textContent.replace(/\s+/g, ' ').trim())}</p>`);
      n = n.nextElementSibling;
    }
    box.innerHTML = out.join('') || '<p class="muted">La página no tiene detalles.</p>';
  } catch {
    box.innerHTML = `<p class="muted">No pude leer la wiki desde acá. <a target="_blank" rel="noopener" href="${esc(url)}">Abrila en la wiki ↗</a></p>`;
  }
}
