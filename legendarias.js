// Pestaña "Legendarias": cargás lo que tenés y te dice qué legendarias podés hacer, cuánto te falta y qué.
const STORE = 'gw2-bazar-inventario';
const load = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; } };
const save = (inv) => { try { localStorage.setItem(STORE, JSON.stringify(inv)); } catch { /* sin almacenamiento */ } };

export function renderLegendarias(view, { api, esc, coin, itemCell, toast, debounce }) {
  let inv = load(); // id -> { qty, name, icon, rarity }
  let mode = 'instant';
  let selected = null;
  view.innerHTML = `
    <div class="page-head"><div><h1>Legendarias</h1><p>Cargá lo que tenés (por ejemplo <b>Don de la suerte</b> y <b>Tréboles místicos</b>) y te digo <b>qué legendarias podés hacer</b>, cuánto te falta y <b>qué items y cantidades</b> te faltan. Usa primero lo tuyo, en el nivel más alto: si tenés un don, no te pide sus partes.</p></div></div>
    <div class="leg-grid">
      <section class="leg-inv">
        <h3>Lo que tengo</h3>
        <div class="leg-add">
          <input type="search" id="lgQ" placeholder="Agregar item… (ej: don de la suerte, trébol místico, ectoplasma)" autocomplete="off">
          <div class="ac-list" id="lgAc" hidden></div>
        </div>
        <div class="links" style="margin:8px 0">
          <button class="btn ghost small" id="lgImport" title="Usa tu API key (⚙ Ajustes)">Importar de mi cuenta</button>
          <button class="btn ghost small" id="lgClear">Vaciar</button>
        </div>
        <div id="lgInv"></div>
      </section>
      <section>
        <div class="filters" style="margin-bottom:8px"><label>Precios <select id="lgMode"><option value="instant">comprando al instante</option><option value="order">con órdenes de compra</option></select></label></div>
        <div id="lgRes"><div class="skeleton"></div></div>
        <div id="lgDetail"></div>
      </section>
    </div>`;

  const invBox = view.querySelector('#lgInv');
  function paintInv() {
    const ids = Object.keys(inv);
    invBox.innerHTML = ids.length
      ? `<p class="muted small">${ids.length} item${ids.length === 1 ? '' : 's'} cargado${ids.length === 1 ? '' : 's'}.</p><div class="leg-inv-list">${ids.slice(0, 150).map((id) => { const e = inv[id]; return `<div class="leg-row" data-row="${id}">${itemCell({ id, name: e.name, icon: e.icon, rarity: e.rarity }, '')}<input type="number" min="0" value="${e.qty}" data-qty="${id}" aria-label="Cantidad"><button class="icon-btn" data-del="${id}" title="Quitar">✕</button></div>`; }).join('')}</div>${ids.length > 150 ? `<p class="muted small">y ${ids.length - 150} más (importados de tu cuenta).</p>` : ''}`
      : '<div class="empty small">Todavía no cargaste nada. Buscá un item arriba o importalo de tu cuenta.</div>';
  }
  invBox.addEventListener('input', debounce((e) => {
    const i = e.target.closest('[data-qty]');
    if (!i) return;
    const n = Math.max(0, Number(i.value) || 0);
    if (n) inv[i.dataset.qty].qty = n; else delete inv[i.dataset.qty];
    save(inv); recompute();
  }, 400));
  invBox.addEventListener('click', (e) => {
    const d = e.target.closest('[data-del]');
    if (!d) return;
    delete inv[d.dataset.del]; save(inv); paintInv(); recompute();
  });

  // Buscador con sugerencias (todos los items del juego)
  const q = view.querySelector('#lgQ');
  const ac = view.querySelector('#lgAc');
  q.addEventListener('input', debounce(async () => {
    const t = q.value.trim();
    if (t.length < 2) { ac.hidden = true; return; }
    try {
      const d = await api(`/api/catalog?q=${encodeURIComponent(t)}&limit=10`);
      ac.innerHTML = d.rows.map((r) => `<button type="button" class="ac-item" data-add="${r.id}" data-name="${esc(r.name)}" data-icon="${esc(r.icon || '')}" data-rarity="${esc(r.rarity || '')}">${itemCell(r)}</button>`).join('') || '<div class="empty small">Nada coincide.</div>';
      ac.hidden = false;
    } catch { ac.hidden = true; }
  }, 250));
  ac.addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]');
    if (!b) return;
    const id = b.dataset.add;
    const n = Number(prompt(`¿Cuántos "${b.dataset.name}" tenés?`, inv[id]?.qty || 1));
    if (!n || n < 0) return;
    inv[id] = { qty: n, name: b.dataset.name, icon: b.dataset.icon || null, rarity: b.dataset.rarity || null };
    save(inv); q.value = ''; ac.hidden = true; paintInv(); recompute();
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.leg-add')) ac.hidden = true; });

  view.querySelector('#lgClear').addEventListener('click', () => { if (!confirm('¿Vaciar la lista de lo que tenés?')) return; inv = {}; save(inv); paintInv(); recompute(); });
  view.querySelector('#lgImport').addEventListener('click', async (e) => {
    const b = e.target; b.disabled = true; b.textContent = 'Importando…';
    try {
      const d = await api('/api/account/inventory');
      inv = {};
      for (const it of d.items) inv[it.id] = { qty: it.count, name: it.name, icon: it.icon, rarity: it.rarity };
      save(inv); paintInv(); recompute();
      toast(`Importado de ${d.account}: ${d.items.length} items distintos`);
      if (d.warnings?.length) toast(d.warnings[0]);
    } catch (err) { toast(err.message); }
    b.disabled = false; b.textContent = 'Importar de mi cuenta';
  });
  view.querySelector('#lgMode').addEventListener('change', (e) => { mode = e.target.value; recompute(); if (selected) showDetail(selected); });

  const invPayload = () => Object.fromEntries(Object.entries(inv).map(([id, e]) => [id, e.qty]));
  const post = (body) => api('/api/planner', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const pct = (x) => `${Math.round(x * 100)}%`;

  let seq = 0;
  async function recompute() {
    const my = ++seq;
    const box = view.querySelector('#lgRes');
    try {
      const d = await post({ inv: invPayload(), mode, limit: 80 });
      if (my !== seq || !view.querySelector('#lgRes')) return;
      const has = Object.keys(inv).length;
      box.innerHTML = `<h3>${has ? (d.withMine ? `Legendarias que podés avanzar con lo tuyo (${d.withMine}) — primero las que menos cosas no comprables te piden` : 'Ninguna legendaria usa lo que cargaste: estas son las más baratas') : 'Todas las legendarias (de la más barata a la más cara)'}</h3>
        <div class="leg-list">${d.rows.map((r) => `<button type="button" class="leg-card ${selected === r.id ? 'on' : ''}" data-leg="${r.id}">
          ${r.icon ? `<img src="${esc(r.icon)}" alt="">` : '<span class="icon-ph"></span>'}
          <div class="leg-main"><b class="rar-Legendary">${esc(r.name)}</b>
            <div class="leg-bar"><span style="width:${pct(r.progress)}"></span></div>
            <div class="small muted">${has ? `lo tuyo cubre ${pct(r.progress)} del costo en oro · ` : ''}falta comprar ${coin(r.missingCost)}</div>
            <div class="small ${r.untradableMissing ? 'warn-t' : 'muted'}">${r.untradableMissing ? `${r.untradableMissing} cosa${r.untradableMissing === 1 ? '' : 's'} que no se compra${r.untradableMissing === 1 ? '' : 'n'} (logros, PvP/McM, mapas…)` : 'todo lo que falta se compra en el bazar'}</div></div></button>`).join('')}</div>`;
    } catch (e) {
      box.innerHTML = `<div class="empty">No pude calcular: ${esc(e.message)}</div>`;
    }
  }
  view.querySelector('#lgRes').addEventListener('click', (e) => {
    const c = e.target.closest('[data-leg]');
    if (!c) return;
    selected = Number(c.dataset.leg);
    view.querySelectorAll('.leg-card').forEach((x) => x.classList.toggle('on', Number(x.dataset.leg) === selected));
    showDetail(selected);
  });

  const fmt = (n) => Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 });
  const HOW = { forja: '🔮 Forja Mística', crafteo: '⚒ crafteo', comprar: '⚖ bazar', conseguir: '✋ no se compra', tuyo: '✔ lo tenés' };
  // Suma lo que falta en cada rama: oro y cantidad de cosas que no se compran.
  function rollup(n) {
    let gold = n.missing && n.unit != null ? n.missing * n.unit : 0;
    let nobuy = n.missing && n.unit == null ? 1 : 0;
    for (const c of n.children) { const r = rollup(c); gold += r.gold; nobuy += r.nobuy; }
    n.rGold = gold; n.rNobuy = nobuy;
    return { gold, nobuy };
  }
  function nodeHTML(n, parent, depth) {
    const status = n.how === 'tuyo' ? '<span class="pill good">lo tenés</span>'
      : n.missing ? (n.unit != null ? `<span class="pill warn">faltan ${fmt(n.missing)}</span> ${coin(n.unit)} c/u = ${coin(n.unit * n.missing)}` : `<span class="pill bad">faltan ${fmt(n.missing)}</span> <span class="muted">no se compra</span>`)
      : n.crafts ? `${HOW[n.how]} <span class="muted">· hacer ${fmt(n.crafts)} ${n.crafts === 1 ? 'vez' : 'veces'}${n.out > 1 ? ` (da ${n.out} c/u)` : ''}</span>` : '';
    const line = `<span class="tr-line">${n.icon ? `<img src="${esc(n.icon)}" alt="">` : '<span class="icon-ph"></span>'}
      <a href="#/item/${n.id}" class="rar-${esc(n.rarity || '')}">${esc(n.name)}</a>
      ${parent ? `<span class="tr-per" title="Cantidad que pide la receta de ${esc(parent.name)}">${fmt(n.per)} por cada ${esc(parent.name)}</span>` : ''}
      <span class="tr-tot">necesitás <b>${fmt(n.total)}</b>${n.have ? ` · tenés ${fmt(n.have)}` : ''}</span>
      <span class="tr-st">${status}</span>
      ${n.children.length && (n.rGold || n.rNobuy) ? `<span class="tr-roll muted small">en esta rama falta ${n.rGold ? coin(n.rGold) : ''}${n.rGold && n.rNobuy ? ' + ' : ''}${n.rNobuy ? `${n.rNobuy} que no se compra${n.rNobuy === 1 ? '' : 'n'}` : ''}</span>` : ''}</span>`;
    const cur = (n.cur || []).map((c) => `<li class="tr-leaf"><span class="tr-line">${c.type === 'Currency' && c.id === 1 ? `${coin(c.per)} por cada ${esc(n.name)} · total ${coin(c.total)}` : `${fmt(c.per)} × ${esc(c.type === 'Currency' ? `moneda #${c.id}` : c.type)} por cada ${esc(n.name)} · total ${fmt(c.total)}`}</span></li>`).join('');
    if (!n.children.length && !cur) return `<li class="tr-leaf">${line}</li>`;
    return `<li><details ${depth < 1 ? 'open' : ''}><summary>${line}</summary><ul class="tree">${n.children.map((c) => nodeHTML(c, n, depth + 1)).join('')}${cur}</ul></details></li>`;
  }
  function treeHTML(t) {
    rollup(t);
    return `<h4 class="sub-h">Árbol: qué se necesita para crearla (${t.children.length} componente${t.children.length === 1 ? '' : 's'} principal${t.children.length === 1 ? '' : 'es'})</h4>
      <p class="small muted">Cada fila dice cuánto pide la receta del item de arriba («por cada…»), cuántos necesitás en total, cuántos tenés y cuánto falta. Tocá ▸ para abrir una rama. <button type="button" class="btn ghost small" data-tree="open">Abrir todo</button> <button type="button" class="btn ghost small" data-tree="close">Cerrar todo</button></p>
      <ul class="tree tree-root">${nodeHTML(t, null, -1)}</ul>`;
  }
  view.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tree]');
    if (!b) return;
    view.querySelectorAll('.leg-detail .tree details').forEach((d) => { d.open = b.dataset.tree === 'open'; });
  });

  async function showDetail(id) {
    const box = view.querySelector('#lgDetail');
    box.innerHTML = '<div class="skeleton"></div>';
    try {
      const p = await post({ inv: invPayload(), mode, target: id });
      const cur = (c) => (c.type === 'Currency' && c.id === 1 ? coin(c.qty) : `${c.qty.toLocaleString('es-AR')} × ${esc(c.type === 'Currency' ? `moneda #${c.id}` : c.type)}`);
      box.innerHTML = `<div class="section leg-detail"><h3>${esc(p.target.name)}: qué te falta</h3>
        <div class="cards"><div class="card"><div class="k">Falta comprar en el bazar</div><div class="v">${coin(p.missingCost)}</div><div class="h">${mode === 'order' ? 'con órdenes de compra' : 'comprando al instante'}</div></div>
          <div class="card"><div class="k">Items distintos que faltan</div><div class="v num">${p.missing.length}</div><div class="h">${p.untradableMissing} no se compra${p.untradableMissing === 1 ? '' : 'n'} en el bazar</div></div>
          <div class="card"><div class="k">De lo tuyo se usa</div><div class="v num">${p.used.length}</div><div class="h">items distintos</div></div></div>
        ${p.tree ? treeHTML(p.tree) : ''}
        <h4 class="sub-h">Lista de compras: todo lo que te falta, sumado</h4>
        ${p.missing.length ? `<div class="table-wrap"><table><thead><tr><th>Te falta</th><th>Cantidad</th><th>Se usa para</th><th>Precio c/u</th><th>Total</th><th>Si no se compra</th></tr></thead><tbody>
          ${p.missing.map((m) => `<tr data-id="${m.id}" class="clickable"><td>${itemCell(m)}</td><td class="num">${m.qty.toLocaleString('es-AR')}</td><td class="left small">${(m.usedFor || []).map((u) => `${esc(u.name)} <span class="muted">(${fmt(u.per)} por cada ${u.out > 1 ? `${u.out} ` : ''}${u.out > 1 ? 'que hacés' : 'uno'})</span>`).join('<br>') || '—'}</td><td>${m.unit != null ? coin(m.unit) : '<span class="pill warn">no se vende</span>'}</td><td>${m.total != null ? coin(m.total) : '—'}</td><td class="left small">${m.unit == null ? (m.vendor ? `${esc(m.vendor.vendor)} <span class="muted">— ${esc(m.vendor.zone || '')}${m.vendor.cost ? ` · ${esc(m.vendor.cost)}` : ''}</span>` : '<span class="muted">tocá para ver cómo se consigue</span>') : ''}</td></tr>`).join('')}
        </tbody></table></div>` : '<div class="empty">¡Tenés todo! Ya podés hacerla.</div>'}
        ${p.currencies.length ? `<p class="small">Además: ${p.currencies.map(cur).join(' · ')}</p>` : ''}
        ${p.used.length ? `<details class="small" open><summary>De lo tuyo se usa (${p.used.length})</summary><ul class="steps">${p.used.map((u) => `<li><a href="#/item/${u.id}">${esc(u.name)}</a> × ${u.qty.toLocaleString('es-AR')}</li>`).join('')}</ul></details>` : ''}
        ${p.crafted.length ? `<details class="small"><summary>Pasos de crafteo / Forja (${p.crafted.length})</summary><ul class="steps">${p.crafted.map((c) => `<li><a href="#/item/${c.id}">${esc(c.name)}</a> — ${c.crafts} vez${c.crafts === 1 ? '' : 'es'}</li>`).join('')}</ul></details>` : ''}
        <p class="links"><a class="btn ghost small" href="#/item/${p.target.id}">Ver la ficha y el árbol completo</a></p></div>`;
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      box.innerHTML = `<div class="empty">No pude calcular: ${esc(e.message)}</div>`;
    }
  }

  paintInv();
  recompute();
  return { refresh: recompute };
}
