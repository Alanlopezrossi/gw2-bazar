import { curatedHTML, wireGuide } from './guide-ui.js';
// Pestaña "Guía": guías para subir profesiones (propias, con precios en vivo), acceso a gw2crafts y guías especiales.
const STORE = 'gw2-bazar-guia';
const DISCS = [['Armorsmith', 'Forjador de armaduras', '🛡'], ['Artificer', 'Artífice', '🔮'], ['Chef', 'Cocinero', '🍲'], ['Huntsman', 'Cazador', '🏹'], ['Jeweler', 'Joyero', '💍'], ['Leatherworker', 'Peletero', '🧥'], ['Scribe', 'Escriba', '📜'], ['Tailor', 'Sastre', '🧵'], ['Weaponsmith', 'Armero', '⚔']];
const CRAFTS = { Artificer: 'https://gw2crafts.net/es/artificing_fast.html' };
const CRAFTS_HOME = 'https://gw2crafts.net/es/';

export function renderGuia(view, { api, esc, coin, itemCell }) {
  let st = { disc: 'Artificer', from: 0, to: 0, mode: 'instant' };
  try { st = { ...st, ...JSON.parse(localStorage.getItem(STORE) || '{}') }; } catch {}
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(st)); } catch {} };
  const nf = (n) => Number(n).toLocaleString('es-AR');
  const link = (x, qty) => `<a href="#/item/${x.id}" class="gd-it">${x.icon ? `<img src="${esc(x.icon)}" alt="">` : ''}${qty != null ? `<b>${nf(qty)}</b> ` : ''}<span class="rar-${esc(x.rarity || '')}">${esc(x.name)}</span></a>`;

  view.innerHTML = `
    <div class="page-head"><div><h1>Guía</h1><p>Cómo subir cada profesión de crafteo con lo más barato del bazar <b>hoy</b>, accesos a las guías de gw2crafts.net y las guías especiales paso a paso.</p></div></div>
    <div class="section"><h3>Subir una profesión</h3>
      <div class="prof-cards" id="gDisc">${DISCS.map(([k, l, i]) => `<button type="button" class="prof-card ${st.disc === k ? 'on' : ''}" data-d="${k}"><span class="pi">${i}</span><b>${esc(l)}</b></button>`).join('')}</div>
      <div class="filters">
        <label>Desde nivel <input type="number" id="gFrom" min="0" max="500" step="25" value="${st.from}" style="width:80px"></label>
        <label>Hasta <input type="number" id="gTo" min="0" max="500" step="25" value="${st.to || ''}" placeholder="máx." style="width:80px"></label>
        <label>Precios <select id="gMode"><option value="instant" ${st.mode === 'instant' ? 'selected' : ''}>comprando al instante</option><option value="order" ${st.mode === 'order' ? 'selected' : ''}>con órdenes de compra</option></select></label>
        <a class="btn ghost small" id="gCrafts" target="_blank" rel="noopener">Abrir la guía de gw2crafts.net ↗</a>
      </div>
      <div id="gPlan"><div class="skeleton"></div></div>
    </div>
    <div class="section"><h3>Guías especiales paso a paso</h3><div id="gCur"><div class="skeleton"></div></div></div>`;

  const paintCrafts = () => {
    const a = view.querySelector('#gCrafts');
    a.href = CRAFTS[st.disc] || CRAFTS_HOME;
    a.textContent = CRAFTS[st.disc] ? 'Abrir la guía de gw2crafts.net ↗' : 'Ver guías en gw2crafts.net ↗';
  };
  view.querySelector('#gDisc').addEventListener('click', (e) => {
    const b = e.target.closest('[data-d]');
    if (!b) return;
    st.disc = b.dataset.d; save();
    view.querySelectorAll('#gDisc .prof-card').forEach((x) => x.classList.toggle('on', x === b));
    paintCrafts(); load();
  });
  view.querySelector('#gFrom').addEventListener('change', (e) => { st.from = Math.max(0, Number(e.target.value) || 0); save(); load(); });
  view.querySelector('#gTo').addEventListener('change', (e) => { st.to = Math.max(0, Number(e.target.value) || 0); save(); load(); });
  view.querySelector('#gMode').addEventListener('change', (e) => { st.mode = e.target.value; save(); load(); });

  let seq = 0;
  async function load() {
    const my = ++seq;
    const box = view.querySelector('#gPlan');
    box.innerHTML = '<div class="skeleton"></div>';
    try {
      const p = await api(`/api/leveling?disc=${st.disc}&from=${st.from}&to=${st.to}&mode=${st.mode}`);
      if (my !== seq || !view.querySelector('#gPlan')) return;
      const name = DISCS.find((d) => d[0] === st.disc)?.[1] || st.disc;
      box.innerHTML = `
        <div class="cards">
          <div class="card"><div class="k">${esc(name)}</div><div class="v num">${p.from} → ${p.to}</div><div class="h">nivel máximo de la disciplina: ${p.max}</div></div>
          <div class="card"><div class="k">Costo de materiales</div><div class="v">${coin(p.total)}</div><div class="h">${st.mode === 'order' ? 'con órdenes de compra' : 'comprando al instante'}</div></div>
          <div class="card"><div class="k">Recuperás vendiendo lo crafteado</div><div class="v">${coin(p.back)}</div><div class="h">a la orden de compra, menos comisión</div></div>
          <div class="card"><div class="k">Costo neto aproximado</div><div class="v">${coin(Math.max(0, p.total - p.back))}</div><div class="h">si vendés lo que se puede vender</div></div>
        </div>
        <div class="explain small"><b>Cómo usarla:</b> andá tramo por tramo y crafteá lo que dice. Las cantidades son <b>aproximadas</b>: si subís antes, pasá al tramo siguiente; si te falta, hacé unas más. <b>Truco:</b> descubrir una receta nueva (pestaña <i>Descubrimiento</i> del panel de crafteo) da un bonus grande de experiencia, así que conviene descubrir los objetos finales en vez de craftearlos desde la lista.</div>
        <h4 class="sub-h">Paso a paso por tramos de 25 niveles</h4>
        <ol class="lv-bands">${p.bands.map((b) => `<li><div class="lv-head"><b>Nivel ${b.from} → ${b.to}</b>${b.picks.length ? ` <span class="muted small">· ${coin(b.picks.reduce((a, x) => a + x.cost, 0))}</span>` : ''}</div>
          ${b.picks.length ? `<ul>${b.picks.map((x) => `<li>Crafteá ${link(x, x.crafts * x.out)} <span class="muted small">(${esc(x.kind)} · nivel ${x.rating}${x.crafts > 1 ? ` · ${nf(x.crafts)} veces` : ''}${x.out > 1 ? `, da ${x.out} c/u` : ''})</span> — ${coin(x.cost)}
            <div class="gd-ings">cada una con ${x.ingredients.map((g) => link(g, g.per)).join(' + ')}</div></li>`).join('')}</ul>` : `<p class="muted small">${esc(b.note || '')}</p>`}</li>`).join('')}</ol>
        <h4 class="sub-h">Lista de compras total</h4>
        <div class="table-wrap"><table><thead><tr><th>Material</th><th>Cantidad</th><th>Precio c/u</th><th>Total</th></tr></thead><tbody>
          ${p.shopping.map((s) => `<tr data-id="${s.id}" class="clickable"><td>${itemCell(s, '')}</td><td class="num">${nf(s.total)}</td><td>${s.unit != null ? coin(s.unit) : '<span class="muted small">se craftea</span>'}</td><td>${s.cost != null ? coin(s.cost) : '—'}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="muted small">Guía generada por el Bazar con las recetas de la API oficial y los precios del bazar de este momento (cambia sola cuando cambian los precios). La experiencia por receta es una estimación: para el cálculo exacto mirá gw2crafts.net.</p>`;
      box.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('a')) location.hash = `#/item/${tr.dataset.id}`; }));
    } catch (e) {
      box.innerHTML = `<div class="empty">No pude armar la guía: ${esc(e.message)}</div>`;
    }
  }

  api('/api/guides').then((d) => {
    const box = view.querySelector('#gCur');
    if (!box) return;
    const list = [...d.guides].sort((x, y) => x.title.localeCompare(y.title, 'es'));
    box.innerHTML = list.length ? `<input type="search" id="gCurQ" placeholder="Buscar guía… (ej: trébol, armadura, Aurora)" style="width:100%;max-width:420px;margin-bottom:10px">
      <div class="cur-list">${list.map((g) => `<button type="button" class="cur-card" data-key="${esc(g.key)}" data-hay="${esc((g.title + ' ' + g.intro).toLowerCase())}">
      <div class="cur-icons">${g.items.map((i) => (i.icon ? `<img src="${esc(i.icon)}" alt="">` : '')).join('')}</div>
      <b>${esc(g.title)}</b><p class="small muted">${esc(g.intro.slice(0, 180))}${g.intro.length > 180 ? '…' : ''}</p>
      ${g.sections.length ? `<span class="small">${g.sections.map((s) => esc(s)).join(' · ')}</span>` : ''}</button>`).join('')}</div>
      <div id="gCurOpen"></div>
      <p class="muted small">${list.length} guías. Cada una aparece también en la ficha de los items que participan.</p>` : '<p class="muted">Todavía no hay guías especiales.</p>';
    box.querySelector('#gCurQ')?.addEventListener('input', (e) => { const t = e.target.value.trim().toLowerCase(); box.querySelectorAll('.cur-card').forEach((c) => { c.hidden = !!t && !c.dataset.hay.includes(t); }); });
    box.addEventListener('click', async (e) => {
      const c = e.target.closest('.cur-card');
      if (!c) return;
      box.querySelectorAll('.cur-card').forEach((x) => x.classList.toggle('on', x === c));
      const open = box.querySelector('#gCurOpen');
      open.innerHTML = '<div class="skeleton"></div>';
      try {
        const gd = await api(`/api/guides?key=${encodeURIComponent(c.dataset.key)}&mode=${st.mode}`);
        open.innerHTML = curatedHTML(gd, { esc, coin, openAll: true });
        wireGuide(open);
        open.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (err) { open.innerHTML = `<div class="empty">${esc(err.message)}</div>`; }
    });
  }).catch(() => {});

  paintCrafts();
  load();
  return { refresh: load };
}
