// Panel de logros con tu cuenta (sólo en el Bazar local): resumen, explorador con filtros (estado, recompensa,
// dominio por región, tipo, disponibilidad), tus dominios por región y lo que te queda por hacer hoy
// (Bóveda del Mago, jefes de mundo, cofres de metaevento, crafteos diarios, fractales del día).
import { g, many, meta, loadAll, progress, points, goal, requirement, MASTERY } from './logros.js';

const REGIONS = ['Tyria', 'Maguuma', 'Desert', 'Tundra', 'Jade', 'Sky', 'Wild', 'Magic'];
const RSHORT = { Tyria: 'Tyria central', Maguuma: 'Heart of Thorns', Desert: 'Path of Fire', Tundra: 'Icebrood Saga', Jade: 'End of Dragons', Sky: 'Secrets of the Obscure', Wild: 'Janthir Wilds', Magic: 'Visions of Eternity' };
const STORE = 'gw2-logros-pro';
// La API de puntos de dominio usa nombres de expansión; la de dominios, códigos de región.
const TOTAL_REGION = { 'Central Tyria': 'Tyria', 'Heart of Thorns': 'Maguuma', 'Path of Fire': 'Desert', 'Icebrood Saga': 'Tundra', 'End of Dragons': 'Jade', 'Secrets of the Obscure': 'Sky', 'Janthir Wilds': 'Wild', 'Visions of Eternity': 'Magic' };
const totalsOf = (acc) => new Map((acc.masteryPoints?.totals || []).map((t) => [TOTAL_REGION[t.region] || t.region, t]));
const nf = (n) => Number(n || 0).toLocaleString('es-AR');
const pretty = (id) => String(id).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

let TITLES = null;
async function titles() {
  if (!TITLES) TITLES = g('/titles?ids=all&lang=es').then(({ data }) => new Map(data.map((t) => [t.id, t.name]))).catch(() => new Map());
  return TITLES;
}
const itemMemo = new Map();
async function itemsInfo(ids) {
  const need = [...new Set(ids)].filter((id) => !itemMemo.has(id));
  if (need.length) { try { for (const it of await many('items', need)) itemMemo.set(it.id, it); } catch { /* sin nombres */ } }
  return itemMemo;
}

export async function renderLogrosPanel(view, { api, esc, normalize, toast }) {
  let st = { tab: 'resumen', estado: 'falta', rew: '', region: '', tipo: '', rep: true, locked: true, sort: 'cerca', group: '', cat: '', q: '' };
  try { st = { ...st, ...JSON.parse(localStorage.getItem(STORE) || '{}'), q: '' }; } catch {}
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify({ ...st, q: '' })); } catch {} };

  view.innerHTML = `
    <div class="page-head"><div><h1>Logros</h1><p>Tu cuenta, en vivo: qué te falta, qué da <b>puntos de dominio</b> y de qué región, qué tenés casi terminado y qué te queda por hacer <b>hoy</b>. También podés ir por categorías como antes.</p></div>
      <div class="links"><button class="btn ghost small" id="lpRefresh">↻ Actualizar desde mi cuenta</button> <a class="btn ghost small" href="#/logros/cats">Ver por categorías</a></div></div>
    <div class="lp-tabs" role="tablist">
      ${[['resumen', 'Resumen'], ['explorar', 'Buscar y filtrar'], ['dominios', 'Dominios'], ['hoy', 'Hoy y esta semana']].map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${st.tab === k}">${l}</button>`).join('')}
    </div>
    <div id="lpBody"><div class="skeleton"></div><p class="muted small" id="lpLoad">Cargando tus logros…</p></div>`;

  let M, P, ALLA, ACC = {};
  const body = () => view.querySelector('#lpBody');
  async function load(fresh = false) {
    body().innerHTML = '<div class="skeleton"></div><p class="muted small" id="lpLoad">Cargando tus logros…</p>';
    try {
      [M, P] = await Promise.all([meta(), progress(api, fresh)]);
      if (P.unavailable) { body().innerHTML = '<div class="empty">Para este panel cargá tu API key en «Mi cuenta» (permisos account y progression).</div>'; return; }
      ALLA = await loadAll((d, t) => { const el = view.querySelector('#lpLoad'); if (el) el.textContent = `Cargando todos los logros… ${Math.round((d / t) * 100)}%`; });
      ACC = await api('/api/account/progress').catch(() => ({}));
      paint();
    } catch (e) { body().innerHTML = `<div class="empty">No pude cargar los logros: ${esc(e.message)}</div>`; }
  }

  // ---------- estado de cada logro ----------
  const prog = (a) => P.get(a.id);
  const isDone = (a) => !!prog(a)?.done;
  const ratio = (a) => { const p = prog(a); if (!p) return 0; if (p.done) return 1; return Math.min(0.999, (p.current || 0) / (p.max || goal(a) || 1)); };
  const isLocked = (a) => !prog(a) && ((a.prerequisites || []).some((x) => !P.get(x)?.done) || (a.flags || []).includes('RequiresUnlock'));
  const masteryOf = (a) => (a.rewards || []).find((r) => r.type === 'Mastery');
  const isRep = (a) => (a.flags || []).some((f) => f === 'Daily' || f === 'Weekly' || f === 'Monthly' || f === 'Repeatable');
  const catOf = (a) => M.catById.get(M.catOfAch.get(a.id));
  const groupOf = (a) => { const c = catOf(a); return c ? M.groupOfCat.get(c.id) : null; };
  const pct = (x) => `${Math.round(x * 100)}%`;
  const regionChip = (r) => `<span class="lp-dom lp-r-${esc(r)}">⭐ ${esc(RSHORT[r] || r)}</span>`;

  function rewardHTML(a, T) {
    return (a.rewards || []).map((r) => {
      if (r.type === 'Mastery') return regionChip(r.region);
      if (r.type === 'Item') { const it = itemMemo.get(r.id); return `<a class="lp-item" href="#/item/${r.id}">${it?.icon ? `<img src="${esc(it.icon)}" alt="">` : '🎁 '}${esc(it?.name || `item #${r.id}`)}${r.count > 1 ? ` ×${r.count}` : ''}</a>`; }
      if (r.type === 'Title') return `<span class="lp-title">🏷 ${esc(T.get(r.id) || 'título')}</span>`;
      if (r.type === 'Coins') return `<span>🪙 ${nf(r.count / 10000)} o</span>`;
      return `<span>${esc(r.type)}</span>`;
    }).join(' ');
  }

  function row(a, T) {
    const p = prog(a), r = ratio(a), c = catOf(a);
    const status = p?.done ? '<span class="ach-st done">Hecho</span>' : p ? `<span class="ach-st prog">${nf(p.current || 0)} / ${nf(p.max || goal(a))}</span>` : isLocked(a) ? '<span class="ach-st lock">Bloqueado</span>' : '<span class="ach-st todo">Sin empezar</span>';
    return `<tr class="clickable" data-ach="${a.id}">
      <td class="left"><b>${esc(a.name)}</b><div class="muted small">${esc(c?.name || '')}</div></td>
      <td class="left small">${esc(requirement(a)).slice(0, 160)}</td>
      <td class="num">${points(a)}</td>
      <td class="left small lp-rew">${rewardHTML(a, T)}</td>
      <td>${status}${p && !p.done ? `<div class="lp-bar"><i style="width:${pct(r)}"></i></div>` : ''}</td></tr>`;
  }
  async function tableHTML(list, T, max = 60) {
    const slice = list.slice(0, max);
    await itemsInfo(slice.flatMap((a) => (a.rewards || []).filter((r) => r.type === 'Item').map((r) => r.id)));
    return `<div class="table-wrap"><table data-managed><thead><tr><th class="left">Logro</th><th class="left">Qué hay que hacer</th><th>Puntos</th><th class="left">Recompensa</th><th>Tu progreso</th></tr></thead><tbody>${slice.map((a) => row(a, T)).join('')}</tbody></table></div>`;
  }

  // ---------- pestañas ----------
  async function paint() {
    view.querySelectorAll('.lp-tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === st.tab)));
    const T = await titles();
    if (st.tab === 'resumen') return paintResumen(T);
    if (st.tab === 'explorar') return paintExplorar(T);
    if (st.tab === 'dominios') return paintDominios(T);
    return paintHoy();
  }

  async function paintResumen(T) {
    const real = ALLA.filter((a) => !isRep(a));
    const done = real.filter(isDone).length;
    const started = real.filter((a) => prog(a) && !isDone(a));
    const dom = real.filter((a) => masteryOf(a));
    const domMiss = dom.filter((a) => !isDone(a));
    const near = started.filter((a) => ratio(a) >= 0.5).sort((x, y) => ratio(y) - ratio(x) || points(y) - points(x));
    const nearDom = domMiss.filter((a) => !isLocked(a)).sort((x, y) => ratio(y) - ratio(x));
    const totals = totalsOf(ACC);
    body().innerHTML = `
      <div class="cards">
        <div class="card"><div class="k">Logros completados</div><div class="v num">${nf(done)}</div><div class="h">de ${nf(real.length)} (sin contar diarios ni repetibles)</div></div>
        <div class="card"><div class="k">Empezados</div><div class="v num">${nf(started.length)}</div><div class="h">${nf(near.length)} con la mitad o más</div></div>
        <div class="card"><div class="k">Logros que dan dominio</div><div class="v num">${nf(dom.length - domMiss.length)} / ${nf(dom.length)}</div><div class="h">te faltan ${nf(domMiss.length)}</div></div>
        ${ACC.account ? `<div class="card"><div class="k">Puntos de logro (diarios / mensuales)</div><div class="v num">${nf(ACC.account.daily_ap)} / ${nf(ACC.account.monthly_ap)}</div><div class="h">cuenta ${esc(ACC.account.name || '')}</div></div>` : ''}
      </div>
      <h3>Puntos de dominio por región</h3>
      <div class="lp-regions">${REGIONS.map((r) => { const t = totals.get(r); const miss = domMiss.filter((a) => masteryOf(a).region === r).length; const all = dom.filter((a) => masteryOf(a).region === r).length; return `<button class="lp-reg lp-r-${r}" data-goreg="${r}"><b>${esc(RSHORT[r])}</b>${t ? `<span>${nf(t.earned)} ganados · ${nf(t.spent)} gastados · <b>${nf(t.earned - t.spent)} libres</b></span>` : ''}<span class="small">${nf(all - miss)}/${nf(all)} logros con dominio · faltan ${nf(miss)}</span></button>`; }).join('')}</div>
      <h3>Casi terminados <span class="muted small">(la mitad o más, los más avanzados primero)</span></h3>
      ${near.length ? await tableHTML(near, T, 20) : '<p class="muted">No tenés logros por la mitad.</p>'}
      <h3>Dominios que te faltan y podés hacer ya <span class="muted small">(no bloqueados, los más avanzados primero)</span></h3>
      ${nearDom.length ? await tableHTML(nearDom, T, 20) : '<p class="muted">No hay.</p>'}
      <p class="small"><button class="btn ghost small" data-gotab="explorar">Ver todos con filtros →</button></p>`;
  }

  async function paintExplorar(T) {
    const groups = M.groups.filter((gr) => gr.categories?.length);
    const cats = st.group ? (groups.find((gr) => gr.id === st.group)?.categories || []).map((id) => M.catById.get(id)).filter(Boolean).sort((a, b) => a.order - b.order) : [];
    body().innerHTML = `
      <div class="filters lp-filters">
        <input type="search" id="lpQ" placeholder="Buscar logro, categoría o texto…" value="${esc(st.q)}" style="flex:1;min-width:200px">
        <label>Estado <select data-k="estado">${[['', 'todos'], ['falta', 'me faltan'], ['empezado', 'empezados'], ['nada', 'sin empezar'], ['cerca', 'casi terminados (75%+)'], ['hecho', 'hechos']].map(([v, l]) => `<option value="${v}" ${st.estado === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Recompensa <select data-k="rew">${[['', 'cualquiera'], ['dominio', 'punto de dominio'], ['item', 'item'], ['titulo', 'título'], ['ap', 'sólo puntos de logro']].map(([v, l]) => `<option value="${v}" ${st.rew === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Dominio de <select data-k="region"><option value="">cualquier región</option>${REGIONS.map((r) => `<option value="${r}" ${st.region === r ? 'selected' : ''}>${esc(RSHORT[r])}</option>`).join('')}</select></label>
        <label>Tipo <select data-k="tipo">${[['', 'todos'], ['coleccion', 'colecciones'], ['normal', 'no colecciones']].map(([v, l]) => `<option value="${v}" ${st.tipo === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Grupo <select data-k="group"><option value="">todos</option>${groups.map((gr) => `<option value="${esc(gr.id)}" ${st.group === gr.id ? 'selected' : ''}>${esc(gr.name)}</option>`).join('')}</select></label>
        ${cats.length ? `<label>Categoría <select data-k="cat"><option value="">todas</option>${cats.map((c) => `<option value="${c.id}" ${String(st.cat) === String(c.id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : ''}
        <label>Orden <select data-k="sort">${[['cerca', 'más cerca de terminar'], ['puntos', 'más puntos'], ['dominio', 'dominio primero'], ['nombre', 'nombre'], ['nuevo', 'más nuevos']].map(([v, l]) => `<option value="${v}" ${st.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="chk"><input type="checkbox" data-k="rep" ${st.rep ? 'checked' : ''}> Ocultar diarios, semanales y repetibles</label>
        <label class="chk"><input type="checkbox" data-k="locked" ${st.locked ? 'checked' : ''}> Mostrar bloqueados</label>
      </div>
      <p class="muted small" id="lpCount"></p><div id="lpList"><div class="skeleton"></div></div><div class="pager" id="lpPager"></div>`;
    let page = 1;
    const PER = 60;
    async function list() {
      const words = normalize(st.q || '').split(/\s+/).filter(Boolean);
      let L = ALLA.filter((a) => {
        if (st.rep && isRep(a)) return false;
        if (!st.locked && isLocked(a)) return false;
        const p = prog(a);
        if (st.estado === 'falta' && p?.done) return false;
        if (st.estado === 'hecho' && !p?.done) return false;
        if (st.estado === 'empezado' && !(p && !p.done)) return false;
        if (st.estado === 'nada' && p) return false;
        if (st.estado === 'cerca' && !(p && !p.done && ratio(a) >= 0.75)) return false;
        const rw = a.rewards || [];
        if (st.rew === 'dominio' && !rw.some((r) => r.type === 'Mastery')) return false;
        if (st.rew === 'item' && !rw.some((r) => r.type === 'Item')) return false;
        if (st.rew === 'titulo' && !rw.some((r) => r.type === 'Title')) return false;
        if (st.rew === 'ap' && rw.length) return false;
        if (st.region && masteryOf(a)?.region !== st.region) return false;
        if (st.tipo === 'coleccion' && a.type !== 'ItemSet') return false;
        if (st.tipo === 'normal' && a.type === 'ItemSet') return false;
        if (st.group && groupOf(a)?.id !== st.group) return false;
        if (st.cat && String(catOf(a)?.id) !== String(st.cat)) return false;
        if (words.length) { const hay = normalize(`${a.name} ${a.requirement} ${a.description} ${catOf(a)?.name || ''}`); if (!words.every((w) => hay.includes(w))) return false; }
        return true;
      });
      const by = { cerca: (x, y) => ratio(y) - ratio(x) || points(y) - points(x), puntos: (x, y) => points(y) - points(x), dominio: (x, y) => (!!masteryOf(y) - !!masteryOf(x)) || ratio(y) - ratio(x), nombre: (x, y) => x.name.localeCompare(y.name, 'es'), nuevo: (x, y) => y.id - x.id };
      L.sort(by[st.sort] || by.cerca);
      const pages = Math.max(1, Math.ceil(L.length / PER));
      page = Math.min(page, pages);
      const domN = L.filter((a) => masteryOf(a) && !isDone(a)).length;
      view.querySelector('#lpCount').textContent = `${nf(L.length)} logros · ${nf(domN)} de ellos dan un punto de dominio que todavía no tenés`;
      view.querySelector('#lpList').innerHTML = L.length ? await tableHTML(L.slice((page - 1) * PER), T, PER) : '<div class="empty">Nada coincide con esos filtros.</div>';
      view.querySelector('#lpPager').innerHTML = `${page > 1 ? '<button class="btn ghost small" data-pg="-1">← Anterior</button>' : ''}<span class="muted small">Página ${page} de ${pages}</span>${page < pages ? '<button class="btn ghost small" data-pg="1">Siguiente →</button>' : ''}`;
    }
    const f = view.querySelector('.lp-filters');
    f.addEventListener('change', (e) => {
      const k = e.target.dataset.k;
      if (!k) return;
      st[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      if (k === 'group') { st.cat = ''; save(); paintExplorar(T); return; }
      if (k === 'region' && st.region && !st.rew) st.rew = 'dominio';
      save(); page = 1; list();
    });
    let t = null;
    view.querySelector('#lpQ').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value; page = 1; list(); }, 250); });
    view.querySelector('#lpPager').addEventListener('click', (e) => { const b = e.target.closest('[data-pg]'); if (!b) return; page += Number(b.dataset.pg); list(); view.querySelector('#lpList').scrollIntoView({ block: 'start' }); });
    list();
  }

  async function paintDominios(T) {
    const totals = totalsOf(ACC);
    const trained = new Map((ACC.masteries || []).map((m) => [m.id, m.level]));
    let tracks = [];
    try { tracks = (await g('/masteries?ids=all&lang=es')).data; } catch { /* sin datos */ }
    const dom = ALLA.filter((a) => masteryOf(a) && !isRep(a));
    body().innerHTML = `${ACC.errors?.masteries ? `<p class="warn-t small">No pude leer tus dominios entrenados (${esc(ACC.errors.masteries)}). La API key necesita el permiso «progression».</p>` : ''}
      <p class="muted small">Los puntos de dominio salen de logros (lista abajo de cada región) y de las <b>percepciones de dominio</b> del mapa. Los niveles se entrenan con experiencia y se pagan con puntos de la región de ese dominio.</p>
      ${REGIONS.map((r) => {
        const t = totals.get(r);
        const tr = tracks.filter((m) => m.region === r).sort((a, b) => a.order - b.order);
        const miss = dom.filter((a) => masteryOf(a).region === r && !isDone(a));
        const free = t ? t.earned - t.spent : null;
        return `<details class="lp-region" ${r === 'Tyria' ? 'open' : ''}><summary><span class="lp-dom lp-r-${r}">⭐ ${esc(RSHORT[r])}</span>
          ${t ? `<span class="small">ganados <b>${nf(t.earned)}</b> · gastados <b>${nf(t.spent)}</b> · libres <b>${nf(free)}</b></span>` : ''}<span class="small muted">· ${nf(miss.length)} logros con dominio sin hacer</span></summary>
          <div class="lp-tracks">${tr.map((m) => {
            const lv = trained.has(m.id) ? trained.get(m.id) + 1 : 0;
            const next = m.levels[lv];
            return `<div class="lp-track"><b>${esc(m.name)}</b> <span class="muted small">${lv}/${m.levels.length} niveles</span>
              <div class="lp-bar"><i style="width:${pct(lv / (m.levels.length || 1))}"></i></div>
              ${next ? `<div class="small">Siguiente: <b>${esc(next.name)}</b> — cuesta <b>${next.point_cost}</b> punto${next.point_cost === 1 ? '' : 's'}${free != null ? (free >= next.point_cost ? ' <span class="pill good">te alcanzan</span>' : ` <span class="pill warn">te faltan ${next.point_cost - free}</span>`) : ''}<div class="muted small">${esc(next.description || '')}</div></div>` : '<div class="small"><span class="pill good">completo</span></div>'}</div>`;
          }).join('')}</div>
          <h4>Cómo conseguir los ${nf(miss.length)} puntos que te faltan de logros</h4>
          ${howList(miss)}
          <p><button class="btn ghost small" data-goreg="${r}">Abrirlos en «Buscar y filtrar» →</button></p></details>`;
      }).join('')}`;
    // Nombres de los items que piden las colecciones (para «te falta…»).
    const ids = dom.filter((a) => !isDone(a)).flatMap((a) => pendingBits(a).filter((b) => b.type === 'Item').map((b) => b.id));
    if (ids.length) { await itemsInfo(ids.slice(0, 600)); body().querySelectorAll('[data-bitem]').forEach((el) => { const it = itemMemo.get(Number(el.dataset.bitem)); if (it) el.innerHTML = `${it.icon ? `<img src="${esc(it.icon)}" alt="" class="ic16"> ` : ''}${esc(it.name)}`; }); }
  }

  // Partes que te faltan de un logro (texto de cada paso o el item que pide).
  function pendingBits(a) {
    const done = new Set(prog(a)?.bits || []);
    return (a.bits || []).map((b, i) => ({ ...b, i })).filter((b) => !done.has(b.i) && (b.type !== 'Text' || (b.text || '').trim()));
  }
  function howList(list) {
    if (!list.length) return '<p class="muted small">¡Tenés todos los de esta región!</p>';
    const sorted = [...list].sort((x, y) => isLocked(x) - isLocked(y) || ratio(y) - ratio(x) || points(y) - points(x));
    return `<ol class="lp-how">${sorted.map((a) => {
      const p = prog(a), c = catOf(a), lock = isLocked(a);
      const pre = (a.prerequisites || []).filter((x) => !P.get(x)?.done).map((x) => ALLA.find((y) => y.id === x)?.name).filter(Boolean);
      const bits = pendingBits(a);
      // Metalogros («Completa N logros de…»): los logros de la misma categoría que todavía no hiciste.
      const sibs = !bits.length && /logros?\b/i.test(requirement(a)) && c ? c.achievements.filter((x) => x !== a.id && !P.get(x)?.done).map((x) => ALLA.find((y) => y.id === x)).filter((x) => x && !isRep(x)) : [];
      const kind = /percepci|insight/i.test(a.name) ? '<span class="pill">percepción: andá al lugar y tocala</span>' : a.type === 'ItemSet' ? '<span class="pill">colección</span>' : '';
      return `<li class="${lock ? 'lock' : ''}"><div><a href="#/logro/${a.id}"><b>${esc(a.name)}</b></a> <span class="muted small">— ${esc(c?.name || '')}</span> ${kind}
          ${p ? `<span class="ach-st prog">${nf(p.current || 0)} / ${nf(p.max || goal(a))}</span>` : lock ? '<span class="ach-st lock">Bloqueado</span>' : '<span class="ach-st todo">Sin empezar</span>'}</div>
        <div class="small">${esc(requirement(a) || a.description || '')}</div>
        ${lock ? `<div class="small warn-t">Para desbloquearlo: ${pre.length ? `primero completá ${pre.map((n) => `«${esc(n)}»`).join(', ')}` : esc(a.locked_text || 'cumplí su requisito (ver la ficha)')}.</div>` : ''}
        ${bits.length && a.bits?.length > 1 ? `<div class="small">Te falta${bits.length === 1 ? '' : 'n'} (${bits.length}): ${bits.slice(0, 8).map((b) => b.type === 'Text' ? esc(b.text) : b.type === 'Item' ? `<span data-bitem="${b.id}">item #${b.id}</span>` : `${b.type === 'Skin' ? 'diseño' : b.type === 'Minipet' ? 'minimascota' : esc(b.type)} #${b.id}`).join(' · ')}${bits.length > 8 ? ' …' : ''}</div>` : ''}
        ${sibs.length ? `<div class="small">Logros de la categoría que te faltan (${sibs.length}): ${sibs.slice(0, 10).map((x) => `<a href="#/logro/${x.id}">${esc(x.name)}</a>${P.get(x.id) ? ` <span class="muted">(${nf(P.get(x.id).current || 0)}/${nf(P.get(x.id).max || goal(x))})</span>` : ''}`).join(' · ')}${sibs.length > 10 ? ' …' : ''}</div>` : ''}
        <div class="small"><a href="#/logro/${a.id}">Ver paso a paso, guía y mapa →</a></div></li>`;
    }).join('')}</ol>`;
  }

  async function paintHoy() {
    const box = body();
    const E = ACC.errors || {};
    const vault = (v, title) => {
      if (!v) return '';
      return `<div class="lp-vault"><h4>${title} <span class="muted small">${nf(v.meta_progress_current)}/${nf(v.meta_progress_complete)}${v.meta_reward_claimed ? ' · recompensa reclamada' : ''}</span></h4>
        <ul>${(v.objectives || []).map((o) => `<li class="${o.progress_current >= o.progress_complete ? 'done' : ''}"><span>${o.progress_current >= o.progress_complete ? '✔' : '○'} ${esc(o.title)}</span><span class="muted small">${nf(o.progress_current)}/${nf(o.progress_complete)} · ${o.acclaim} aclamación${o.claimed ? ' · reclamado' : ''}</span></li>`).join('')}</ul></div>`;
    };
    box.innerHTML = `<div class="lp-hoy">
      <section>${vault(ACC.vaultDaily, 'Bóveda del Mago: diarias')}${vault(ACC.vaultWeekly, 'Bóveda del Mago: semanales')}${E.vaultDaily ? `<p class="muted small">No pude leer la Bóveda del Mago: ${esc(E.vaultDaily)}</p>` : ''}</section>
      <section><h4>Fractales del día</h4><div id="lpFr" class="muted small">Cargando…</div><p class="muted small" id="lpReset"></p>
        <h4>Jefes de mundo que ya mataste hoy</h4>${ACC.worldbosses ? (ACC.worldbosses.length ? `<ul class="lp-chips">${ACC.worldbosses.map((b) => `<li>✔ ${esc(pretty(b))}</li>`).join('')}</ul>` : '<p class="muted small">Ninguno todavía.</p>') : `<p class="muted small">${esc(E.worldbosses || 'Sin datos')}</p>`}
        <h4>Cofres de metaevento abiertos hoy</h4>${ACC.mapchests ? (ACC.mapchests.length ? `<ul class="lp-chips">${ACC.mapchests.map((b) => `<li>✔ ${esc(pretty(b))}</li>`).join('')}</ul>` : '<p class="muted small">Ninguno todavía.</p>') : `<p class="muted small">${esc(E.mapchests || 'Sin datos')}</p>`}
        <h4>Crafteos diarios hechos</h4>${ACC.dailycrafting ? (ACC.dailycrafting.length ? `<ul class="lp-chips">${ACC.dailycrafting.map((b) => `<li>✔ ${esc(pretty(b))}</li>`).join('')}</ul>` : '<p class="muted small">Ninguno todavía (ej. ladrillo de mithrilio, cristal de cuarzo cargado, fragmento de obsidiana…).</p>') : `<p class="muted small">${esc(E.dailycrafting || 'Sin datos')}</p>`}
        <p class="small"><a href="#/eventos">Ver horarios de eventos y poner alarmas →</a></p></section></div>`;
    const reset = () => { const now = new Date(); const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1); const m = Math.max(0, Math.floor((next - now) / 60000)); const el = view.querySelector('#lpReset'); if (el) el.textContent = `Reinicio diario en ${Math.floor(m / 60)} h ${m % 60} min (21:00 hora de Argentina).`; };
    reset();
    try {
      const { data: cat } = await g('/achievements/categories/88?lang=es');
      const achs = await many('achievements', cat.achievements || []);
      const el = view.querySelector('#lpFr');
      if (el) el.outerHTML = `<ul class="lp-fr">${achs.map((a) => `<li><a href="#/logro/${a.id}">${esc(a.name)}</a>${P.get(a.id)?.done ? ' <span class="pill good">hecho</span>' : ''}</li>`).join('')}</ul>`;
    } catch { const el = view.querySelector('#lpFr'); if (el) el.textContent = 'No pude leer los fractales del día.'; }
  }

  // ---------- eventos ----------
  view.querySelector('.lp-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (!b) return; st.tab = b.dataset.tab; save(); paint(); });
  view.querySelector('#lpBody').addEventListener('click', (e) => {
    const r = e.target.closest('[data-goreg]');
    if (r) { st = { ...st, tab: 'explorar', rew: 'dominio', region: r.dataset.goreg, estado: 'falta', sort: 'cerca', group: '', cat: '' }; save(); paint(); return; }
    const t = e.target.closest('[data-gotab]');
    if (t) { st.tab = t.dataset.gotab; save(); paint(); return; }
    if (e.target.closest('a')) return;
    const row = e.target.closest('[data-ach]');
    if (row) location.hash = `#/logro/${row.dataset.ach}`;
  });
  view.querySelector('#lpRefresh').addEventListener('click', () => { toast?.('Actualizando desde tu cuenta…'); load(true); });
  load();
}
