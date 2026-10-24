// Pestaña "Profesiones": qué puede crear cada disciplina (Armero, Peletero, Sastre…) y la Forja Mística.
const STORE = 'gw2-bazar-profesiones';
const CATS = [
  ['', 'Todo'],
  ['dones', 'Dones (Gift of…)'],
  ['legendaria', 'Componentes de legendarias'],
  ['ascendido', 'Ascendidos'],
  ['vendible', 'Se vende en el bazar'],
  ['ganancia', 'Da ganancia'],
  ['receta', 'Requiere aprender la receta'],
];
const COLS = [['name', 'Resultado'], ['rating', 'Disciplina · nivel'], [null, 'Ingredientes'], ['cost', 'Costo de crafteo'], ['sell', 'Venta'], ['profit', 'Ganancia'], [null, 'Se usa para']];
const ICON = { Armorsmith: '🛡', Artificer: '🔮', Chef: '🍲', Homesteader: '🏡', Huntsman: '🏹', Jeweler: '💍', Leatherworker: '🧥', Scribe: '📜', Tailor: '🧵', Weaponsmith: '⚔', 'Mystic Forge': '🌀' };

export function renderProfesiones(view, { api, esc, coin, itemCell, debounce, meta, fillIcons }) {
  let st = { disc: 'Leatherworker', cat: 'dones', q: '', rarity: '', minR: 0, maxR: 500, sort: '', dir: 'asc', page: 1, limit: 50, mode: 'instant' };
  try { st = { ...st, ...JSON.parse(localStorage.getItem(STORE) || '{}'), page: 1 }; } catch {}
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(st)); } catch {} };
  const D = meta.disciplines || {};
  const EXTRA = { Other: 'Otras', Automatic: 'Automática' };
  const dname = (d) => D[d] || EXTRA[d] || d;

  view.innerHTML = `
    <div class="page-head"><div><h1>Profesiones</h1><p>Elegí una disciplina y mirá <b>todo lo que puede crear</b>: dones, componentes de legendarias, ascendidos, comida, etc. Para cada receta ves el nivel que pide, los ingredientes, cuánto cuesta, si se vende y <b>para qué se usa</b> lo que creás.</p></div></div>
    <div class="prof-cards" id="pfCards"><div class="skeleton"></div></div>
    <div class="filters">
      <input type="search" data-f="q" placeholder="Buscar resultado o ingrediente… (ej: don del sigilo, cuero, ectoplasma)" value="${esc(st.q)}">
      <label>Categoría <select data-f="cat">${CATS.map(([k, l]) => `<option value="${k}" ${st.cat === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Rareza <select data-f="rarity"><option value="">Todas</option>${(meta.rarityOrder || []).map((r) => `<option value="${r}" ${st.rarity === r ? 'selected' : ''}>${esc(meta.rarities?.[r] || r)}</option>`).join('')}</select></label>
      <label>Nivel <input type="number" data-f="minR" min="0" max="500" value="${st.minR}" style="width:70px"> a <input type="number" data-f="maxR" min="0" max="500" value="${st.maxR}" style="width:70px"></label>
      <label>Precios <select data-f="mode"><option value="instant" ${st.mode === 'instant' ? 'selected' : ''}>comprando al instante</option><option value="order" ${st.mode === 'order' ? 'selected' : ''}>con órdenes de compra</option></select></label>
    </div>
    <div class="pager" id="pfTop"></div>
    <div class="table-wrap"><table data-managed class="prof-table"><thead><tr>${COLS.map(([k, l]) => `<th ${k ? `data-ps="${k}" class="sortable${st.sort === k ? ` sorted ${st.dir}` : ''}" title="Ordenar por esta columna"` : ''}>${l}</th>`).join('')}</tr></thead>
      <tbody id="pfTb"><tr><td colspan="7"><div class="skeleton"></div></td></tr></tbody></table></div>
    <div class="pager" id="pfBot"></div>`;

  // Tarjetas por disciplina
  api('/api/professions?summary=1').then((s) => {
    const order = Object.keys(D).filter((d) => s.counts[d]).concat(Object.keys(s.counts).filter((d) => !D[d] && !/^recipe:/i.test(d) && s.counts[d] >= 5));
    const box = view.querySelector('#pfCards');
    if (!box) return;
    box.innerHTML = `<button type="button" class="prof-card ${!st.disc ? 'on' : ''}" data-disc=""><span class="pi">✦</span><b>Todas</b><span class="muted small">${s.total.toLocaleString('es-AR')} recetas</span></button>` +
      order.map((d) => `<button type="button" class="prof-card ${st.disc === d ? 'on' : ''}" data-disc="${esc(d)}"><span class="pi">${ICON[d] || '⚒'}</span><b>${esc(dname(d))}</b><span class="muted small">${s.counts[d].toLocaleString('es-AR')} recetas${s.gifts[d] ? ` · ${s.gifts[d]} dones` : ''}</span></button>`).join('');
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-disc]');
      if (!b) return;
      st.disc = b.dataset.disc; st.page = 1; save();
      box.querySelectorAll('.prof-card').forEach((x) => x.classList.toggle('on', x === b));
      load();
    });
  }).catch(() => {});

  view.querySelectorAll('[data-f]').forEach((el) => el.addEventListener(el.tagName === 'INPUT' && el.type === 'search' ? 'input' : 'change', debounce(() => {
    const k = el.dataset.f;
    st[k] = el.type === 'number' ? Number(el.value) || (k === 'maxR' ? 500 : 0) : el.value;
    st.page = 1; save(); load();
  }, 300)));
  view.querySelector('thead').addEventListener('click', (e) => {
    const th = e.target.closest('th[data-ps]');
    if (!th) return;
    const k = th.dataset.ps;
    if (st.sort === k) st.dir = st.dir === 'desc' ? 'asc' : 'desc';
    else { st.sort = k; st.dir = ['name'].includes(k) ? 'asc' : 'desc'; }
    view.querySelectorAll('th[data-ps]').forEach((t) => t.className = `sortable${t.dataset.ps === st.sort ? ` sorted ${st.dir}` : ''}`);
    st.page = 1; save(); load();
  });
  view.querySelector('#pfTb').addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    const tr = e.target.closest('tr[data-id]');
    if (tr) location.hash = `#/item/${tr.dataset.id}`;
  });

  const ing = (g) => g.currency ? `<span class="pf-ing">${g.type === 'Currency' && g.id === 1 ? coin(g.count) : `${g.count} × ${esc(g.type)}`}</span>`
    : `<a class="pf-ing" href="#/item/${g.id}" title="${esc(g.name)}${g.unit ? ' — en el bazar' : ' — no se vende'}">${g.icon ? `<img src="${esc(g.icon)}" alt="">` : ''}<b>${g.count.toLocaleString('es-AR')}</b> <span class="rar-${esc(g.rarity || '')}">${esc(g.name)}</span></a>`;

  let seq = 0;
  async function load() {
    const my = ++seq;
    const tb = view.querySelector('#pfTb');
    tb.innerHTML = '<tr><td colspan="7"><div class="skeleton"></div></td></tr>';
    try {
      const p = new URLSearchParams(Object.entries(st).filter(([, v]) => v !== '' && v != null).map(([k, v]) => [k, String(v)]));
      const d = await api(`/api/professions?${p}`);
      if (my !== seq || !view.querySelector('#pfTb')) return;
      tb.innerHTML = d.rows.length ? d.rows.map((r) => `<tr data-id="${r.id}" class="clickable">
        <td>${itemCell(r, [r.out > 1 ? `da ${r.out}` : '', r.legendaries?.length ? `para ${r.legendaries.join(', ')}` : ''].filter(Boolean).join(' · '))}</td>
        <td class="left small">${r.disciplines.map((x) => `${ICON[x] || ''} ${esc(dname(x))}`).join('<br>')} <b>${r.rating || ''}</b>${r.needsRecipe ? '<br><span class="pill warn">requiere receta</span>' : ''}${r.fromWiki ? '<br><span class="pill">receta de la wiki</span>' : ''}</td>
        <td class="left pf-ings">${r.ingredients.map(ing).join('')}</td>
        <td>${r.cost != null ? coin(r.cost) : '<span class="muted small">lleva cosas que no se compran</span>'}</td>
        <td>${r.sell ? coin(r.sell) : '<span class="muted small">no se vende</span>'}</td>
        <td>${r.profit != null ? coin(r.profit) : '<span class="muted">—</span>'}</td>
        <td class="left small">${r.usedFor.length ? r.usedFor.map((u) => `<a href="#/item/${u.id}" class="rar-${esc(u.rarity || '')}">${esc(u.name)}</a> <span class="muted">(${u.count})</span>`).join('<br>') + (r.usedForTotal > r.usedFor.length ? `<br><span class="muted">y ${r.usedForTotal - r.usedFor.length} más</span>` : '') : '<span class="muted">—</span>'}</td>
      </tr>`).join('') : '<tr><td colspan="7" class="empty">No hay recetas con esos filtros.</td></tr>';
      pager(d);
      fillIcons?.(view, d.rows);
    } catch (e) {
      tb.innerHTML = `<tr><td colspan="7" class="empty">Error: ${esc(e.message)}</td></tr>`;
    }
  }
  function pager(d) {
    const pages = Math.max(1, Math.ceil(d.total / d.limit));
    const html = `<span>${d.total.toLocaleString('es-AR')} recetas${st.disc ? ` de ${esc(dname(st.disc))}` : ''} · página ${d.page} de ${pages}</span>
      <span class="btns"><button class="btn ghost small" data-pg="${d.page - 1}" ${d.page <= 1 ? 'disabled' : ''}>← Anterior</button><button class="btn ghost small" data-pg="${d.page + 1}" ${d.page >= pages ? 'disabled' : ''}>Siguiente →</button>
      <label class="pg">por página <select data-lim>${[25, 50, 100, 250].map((n) => `<option ${n === st.limit ? 'selected' : ''}>${n}</option>`).join('')}</select></label></span>`;
    for (const id of ['#pfTop', '#pfBot']) {
      const el = view.querySelector(id);
      el.innerHTML = html;
      el.querySelectorAll('[data-pg]').forEach((b) => b.addEventListener('click', () => { st.page = Number(b.dataset.pg); load(); view.querySelector('.prof-table').scrollIntoView({ block: 'start' }); }));
      el.querySelector('[data-lim]').addEventListener('change', (e) => { st.limit = Number(e.target.value); st.page = 1; save(); load(); });
    }
  }
  load();
  return { refresh: load };
}
