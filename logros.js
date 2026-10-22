// Pestaña "Logros": todos los logros del juego (API oficial en español), con ruta de desbloqueo,
// condiciones, pasos, recompensas, guía de la wiki y lugares en el mapa.
const API = `${globalThis.GW2_API_BASE || 'https://api.guildwars2.com'}/v2`;
const cache = new Map();
function g(path) {
  if (cache.has(path)) return cache.get(path);
  const p = fetch(API + path).then(async (r) => {
    if (!r.ok) throw new Error(`API de GW2: HTTP ${r.status}`);
    return { data: await r.json(), pages: Number(r.headers.get('X-Page-Total') || 0) };
  });
  cache.set(path, p);
  p.catch(() => cache.delete(path));
  return p.then((x) => x);
}
async function many(endpoint, ids, lang = 'es') {
  ids = [...new Set(ids.filter((x) => x != null))];
  const out = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await g(`/${endpoint}?ids=${ids.slice(i, i + 200).join(',')}&lang=${lang}`);
    out.push(...data);
  }
  return out;
}
const idOf = (x) => (typeof x === 'object' && x ? x.id : x);

const FLAGS = {
  Pvp: 'PvP/McM', Repeatable: 'Repetible', Hidden: 'Oculto', RequiresUnlock: 'Requiere desbloqueo', Daily: 'Diario', Weekly: 'Semanal',
  Monthly: 'Mensual', Permanent: 'Permanente', CategoryDisplay: 'Destacado', MoveToTop: '', IgnoreNearlyComplete: '', RepairOnLogin: '',
};
const MASTERY = { Tyria: 'Tyria central', Maguuma: 'Maguuma (Heart of Thorns)', Desert: 'Desierto (Path of Fire)', Tundra: 'Picosescalofriantes (Icebrood Saga)', Jade: 'Cantha (End of Dragons)', Sky: 'Cielos (Secrets of the Obscure)', Wild: 'Janthir', Magic: 'Castora (Visions of Eternity)', Unknown: '' };

let META = null; // { groups, cats, catById, catOfAch }
async function meta() {
  if (META) return META;
  const [{ data: groups }, { data: cats }] = await Promise.all([g('/achievements/groups?ids=all&lang=es'), g('/achievements/categories?ids=all&lang=es')]);
  const catById = new Map(cats.map((c) => [c.id, { ...c, achievements: (c.achievements || []).map(idOf) }]));
  const catOfAch = new Map();
  const groupOfCat = new Map();
  groups.sort((a, b) => a.order - b.order);
  for (const gr of groups) for (const cid of gr.categories) groupOfCat.set(cid, gr);
  for (const c of catById.values()) for (const a of c.achievements) if (!catOfAch.has(a)) catOfAch.set(a, c.id);
  META = { groups, catById, catOfAch, groupOfCat };
  return META;
}

let ALL = null; // todos los logros (para buscar)
async function loadAll(onProgress) {
  if (ALL) return ALL;
  const first = await g('/achievements?page=0&page_size=200&lang=es');
  const list = [...first.data];
  const total = first.pages || 1;
  for (let p = 1; p < total; p += 6) {
    const batch = await Promise.all(Array.from({ length: Math.min(6, total - p) }, (_, k) => g(`/achievements?page=${p + k}&page_size=200&lang=es`)));
    for (const b of batch) list.push(...b.data);
    onProgress?.(Math.min(total, p + 6), total);
  }
  ALL = list;
  return ALL;
}

let PROGRESS = null; // Map id -> progreso de la cuenta (sólo versión local con API key)
async function progress(api) {
  if (PROGRESS) return PROGRESS;
  try {
    const d = await api('/api/account/achievements');
    PROGRESS = new Map((d.progress || []).map((p) => [p.id, p]));
  } catch {
    PROGRESS = new Map();
    PROGRESS.unavailable = true;
  }
  return PROGRESS;
}

const points = (a) => (a.tiers || []).reduce((s, t) => s + (t.points || 0), 0);
const goal = (a) => (a.tiers?.length ? a.tiers[a.tiers.length - 1].count : 1);
const requirement = (a) => (a.requirement || '').replace(/\s{2,}/, ` ${goal(a)} `).trim();
function flagPills(a, esc) {
  const f = (a.flags || []).map((x) => FLAGS[x]).filter(Boolean);
  if (a.type === 'ItemSet') f.unshift('Colección');
  return f.map((x) => `<span class="pill">${esc(x)}</span>`).join(' ');
}
function stateOf(a, P) {
  const p = P?.get(a.id);
  if (!P || P.unavailable) return null;
  if (!p) return { label: 'Sin empezar', cls: 'todo', p: null };
  if (p.done) return { label: a.flags?.includes('Repeatable') ? `Completado${p.repeated ? ` ×${p.repeated + 1}` : ''}` : 'Completado', cls: 'done', p };
  return { label: `${p.current || 0} / ${p.max || goal(a)}`, cls: 'prog', p };
}

/* ----------------------------- vista lista ----------------------------- */
export async function renderLogros(view, { api, esc, normalize, catId = null, toast }) {
  view.innerHTML = `
    <div class="page-head"><div><h1>Logros</h1><p>Todos los logros del juego, en español (API oficial). Abrí uno para ver <b>cómo se desbloquea</b>, la <b>ruta</b> de logros previos, el <b>paso a paso</b>, las recompensas y la guía de la wiki con los lugares marcados en el mapa.</p></div></div>
    <div class="ach-layout">
      <aside class="ach-cats" id="acats"><div class="skeleton"></div></aside>
      <section>
        <div class="filters">
          <input type="search" id="aq" placeholder="Buscar logro… (ej: Twilight, explorador, colección, Kryta)">
          <label class="chk" id="amineWrap" hidden><input type="checkbox" id="amine"> Sólo los que me faltan</label>
          <label class="chk"><input type="checkbox" id="arew"> Sólo con recompensa de item</label>
          <span class="muted small" id="acount"></span>
        </div>
        <div id="alist"><div class="skeleton"></div></div>
      </section>
    </div>`;
  let M;
  try { M = await meta(); } catch (e) { view.querySelector('#alist').innerHTML = `<div class="empty">No pude cargar los logros: ${esc(e.message)}</div>`; return; }
  const P = await progress(api);
  if (!P.unavailable) view.querySelector('#amineWrap').hidden = false;

  // Árbol de grupos → categorías
  const open = new Set(catId ? [M.groupOfCat.get(catId)?.id] : []);
  function paintCats() {
    view.querySelector('#acats').innerHTML = M.groups.map((gr) => `
      <div class="acg ${open.has(gr.id) ? 'open' : ''}">
        <button class="acg-h" data-g="${gr.id}">${esc(gr.name)} <span class="muted small">${gr.categories.length}</span></button>
        <div class="acg-b">${gr.categories.map((cid) => M.catById.get(cid)).filter(Boolean).sort((a, b) => a.order - b.order)
          .map((c) => `<a href="#/logros/c/${c.id}" class="${c.id === catId ? 'active' : ''}">${c.icon ? `<img src="${esc(c.icon)}" alt="" loading="lazy">` : ''}<span>${esc(c.name)}</span><span class="muted small">${c.achievements.length}</span></a>`).join('')}</div>
      </div>`).join('');
  }
  paintCats();
  view.querySelector('#acats').addEventListener('click', (e) => {
    const b = e.target.closest('[data-g]');
    if (!b) return;
    open.has(b.dataset.g) ? open.delete(b.dataset.g) : open.add(b.dataset.g);
    paintCats();
  });

  let rows = [];
  let page = 1;
  const PER = 50;
  function paintList() {
    const q = normalize(view.querySelector('#aq').value).trim();
    const mine = view.querySelector('#amine').checked;
    const rew = view.querySelector('#arew').checked;
    const words = q.split(/\s+/).filter(Boolean);
    const list = rows.filter((a) => {
      if (mine && P.get(a.id)?.done) return false;
      if (rew && !(a.rewards || []).some((r) => r.type === 'Item')) return false;
      if (!words.length) return true;
      const c = M.catById.get(M.catOfAch.get(a.id));
      const hay = normalize(`${a.name} ${a.requirement} ${a.description} ${c?.name || ''}`);
      return words.every((w) => hay.includes(w));
    });
    const pages = Math.max(1, Math.ceil(list.length / PER));
    page = Math.min(page, pages);
    view.querySelector('#acount').textContent = `${list.length.toLocaleString('es-AR')} logros`;
    const slice = list.slice((page - 1) * PER, page * PER);
    view.querySelector('#alist').innerHTML = !list.length
      ? '<div class="empty">Nada coincide.</div>'
      : `<div class="table-wrap"><table><thead><tr><th class="left">Logro</th><th class="left">Qué hay que hacer</th><th>Puntos</th><th class="left">Recompensa</th>${P.unavailable ? '' : '<th>Tu progreso</th>'}</tr></thead><tbody>
        ${slice.map((a) => {
          const c = M.catById.get(M.catOfAch.get(a.id));
          const st = stateOf(a, P);
          const rw = (a.rewards || []).map((r) => (r.type === 'Item' ? '🎁 item' : r.type === 'Mastery' ? '⭐ maestría' : r.type === 'Title' ? '🏷 título' : r.type === 'Coins' ? '🪙 monedas' : r.type)).join(', ');
          return `<tr class="clickable" data-ach="${a.id}">
            <td class="left"><b>${esc(a.name)}</b><div class="muted small">${esc(c?.name || '')}</div></td>
            <td class="left small">${esc(requirement(a)).slice(0, 180)}</td>
            <td class="num">${points(a)}</td>
            <td class="left small">${esc(rw)}</td>
            ${st ? `<td><span class="ach-st ${st.cls}">${esc(st.label)}</span></td>` : P.unavailable ? '' : '<td></td>'}
          </tr>`;
        }).join('')}</tbody></table></div>
        <div class="pager">${page > 1 ? '<button class="btn ghost small" data-p="-1">← Anterior</button>' : ''}<span class="muted small">Página ${page} de ${pages}</span>${page < pages ? '<button class="btn ghost small" data-p="1">Siguiente →</button>' : ''}</div>`;
  }
  view.querySelector('#alist').addEventListener('click', (e) => {
    const p = e.target.closest('[data-p]');
    if (p) { page += Number(p.dataset.p); paintList(); view.querySelector('#alist').scrollIntoView({ block: 'start' }); return; }
    const r = e.target.closest('[data-ach]');
    if (r) location.hash = `#/logro/${r.dataset.ach}`;
  });
  for (const id of ['#amine', '#arew']) view.querySelector(id).addEventListener('change', () => { page = 1; paintList(); });

  let searchingAll = false;
  async function ensureAll() {
    if (ALL || searchingAll) return;
    searchingAll = true;
    view.querySelector('#acount').textContent = 'Cargando todos los logros…';
    try {
      rows = await loadAll((d, t) => { view.querySelector('#acount').textContent = `Cargando todos los logros… ${Math.round((d / t) * 100)}%`; });
    } catch (e) { toast?.(e.message); }
    searchingAll = false;
    paintList();
  }
  let t = null;
  view.querySelector('#aq').addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => { page = 1; if (!catId) ensureAll(); paintList(); }, 250);
  });

  if (catId) {
    const c = M.catById.get(catId);
    view.querySelector('.page-head h1').textContent = c ? `Logros · ${c.name}` : 'Logros';
    if (c?.description) view.querySelector('.page-head p').textContent = c.description;
    rows = c ? await many('achievements', c.achievements) : [];
    const order = new Map((c?.achievements || []).map((id, i) => [id, i]));
    rows.sort((a, b) => order.get(a.id) - order.get(b.id));
    paintList();
  } else {
    // Portada: los que te faltan con progreso (si hay key) o una invitación a elegir categoría / buscar.
    if (!P.unavailable) {
      const ids = [...P.values()].filter((p) => !p.done && p.current > 0).map((p) => p.id);
      rows = ids.length ? await many('achievements', ids) : [];
      rows.sort((a, b) => (P.get(b.id).current / (P.get(b.id).max || 1)) - (P.get(a.id).current / (P.get(a.id).max || 1)));
      view.querySelector('#alist').insertAdjacentHTML('beforebegin', '<p class="muted small" id="ahint">Mostrando los logros que <b>empezaste y te faltan terminar</b>, los más avanzados primero. Elegí una categoría o buscá para ver todos.</p>');
      paintList();
    } else {
      view.querySelector('#alist').innerHTML = '<div class="empty">Elegí una categoría a la izquierda o escribí en el buscador para buscar entre todos los logros.</div>';
      view.querySelector('#acount').textContent = '';
    }
  }
}

/* ----------------------------- ficha de un logro ----------------------------- */
async function prereqChain(ids, depth = 0, seen = new Set()) {
  ids = ids.filter((id) => !seen.has(id));
  if (!ids.length || depth > 8) return [];
  ids.forEach((id) => seen.add(id));
  const list = await many('achievements', ids);
  const out = [];
  for (const a of list) {
    const before = await prereqChain(a.prerequisites || [], depth + 1, seen);
    out.push(...before, a);
  }
  return out;
}

/** De una página de categoría de la wiki, sólo las filas de este logro (data-id="achievement<ID>"). */
function rowsOf(html, id) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rows = [...doc.querySelectorAll(`tr[data-id="achievement${id}"]`)];
  if (!rows.length) return '';
  return `<table class="ach-wiki-row"><tbody>${rows.map((r) => r.outerHTML).join('')}</tbody></table>`;
}

function cleanWiki(html, esc) {
  const doc = new DOMParser().parseFromString(`<div id="w">${html}</div>`, 'text/html');
  const root = doc.getElementById('w');
  root.querySelectorAll('.infobox, table.infobox, .navbox, #toc, .toc, .mw-references-wrap, sup.reference, .noprint, .mw-editsection, .gallery, .achievement-box-infobox, .metadata, style, script').forEach((n) => n.remove());
  // Quitamos secciones que no ayudan a completar el logro.
  const DROP = /^(gallery|trivia|see also|related|external links|navigation|achievements? in this category|related achievements|references)$/i;
  for (const h of [...root.querySelectorAll('h2')]) {
    const txt = h.textContent.replace('[edit]', '').trim();
    if (!DROP.test(txt)) continue;
    const start = h.closest('.mw-heading') || h;
    let el = start.nextElementSibling;
    while (el && !(el.matches('h2, .mw-heading2') || el.querySelector?.(':scope > h2'))) { const n = el.nextElementSibling; el.remove(); el = n; }
    start.remove();
  }
  const links = [...new Set([...root.querySelectorAll('a[href*="/wiki/"]')].flatMap((a) => {
    let t = '';
    try { t = decodeURIComponent((a.getAttribute('href') || '').replace(/^.*\/wiki\//, '').split('#')[0]).replace(/_/g, ' '); } catch {}
    return [t, a.textContent.trim()].filter(Boolean);
  }))];
  root.querySelectorAll('img').forEach((i) => { i.loading = 'lazy'; });
  return { html: root.innerHTML, links };
}

export async function renderLogro(view, { api, esc, id, toast, normalize }) {
  view.innerHTML = '<div class="skeleton"></div>';
  let a, en, M, catEn = '';
  try {
    [M, [a], [en]] = await Promise.all([meta(), many('achievements', [id]), many('achievements', [id], 'en')]);
    const catId = M.catOfAch.get(id);
    catEn = catId ? (await many('achievements/categories', [catId], 'en').catch(() => []))[0]?.name || '' : '';
  } catch (e) { view.innerHTML = `<div class="empty">No pude cargar el logro: ${esc(e.message)}</div>`; return; }
  if (!a) { view.innerHTML = '<div class="empty">Ese logro no existe.</div>'; return; }
  const P = await progress(api);
  const st = stateOf(a, P);
  const cat = M.catById.get(M.catOfAch.get(a.id));
  const grp = cat ? M.groupOfCat.get(cat.id) : null;

  // Datos relacionados en paralelo.
  const bits = a.bits || [];
  const itemIds = [...bits.filter((b) => b.type === 'Item').map((b) => b.id), ...(a.rewards || []).filter((r) => r.type === 'Item').map((r) => r.id)];
  const [items, skins, minis, titles, chain] = await Promise.all([
    many('items', itemIds).catch(() => []),
    many('skins', bits.filter((b) => b.type === 'Skin').map((b) => b.id)).catch(() => []),
    many('minis', bits.filter((b) => b.type === 'Minipet').map((b) => b.id)).catch(() => []),
    many('titles', (a.rewards || []).filter((r) => r.type === 'Title').map((r) => r.id)).catch(() => []),
    prereqChain(a.prerequisites || []).catch(() => []),
  ]);
  const itemBy = new Map(items.map((x) => [x.id, x]));
  const skinBy = new Map(skins.map((x) => [x.id, x]));
  const miniBy = new Map(minis.map((x) => [x.id, x]));
  const titleBy = new Map(titles.map((x) => [x.id, x]));
  const doneBits = new Set(st?.p?.bits || []);

  const bitHTML = (b, i) => {
    const done = st?.p?.done || doneBits.has(i);
    let body = '';
    if (b.type === 'Item') { const it = itemBy.get(b.id); body = `${it?.icon ? `<img class="ic16" src="${esc(it.icon)}" alt="">` : ''}<a href="#/item/${b.id}">${esc(it?.name || `Item ${b.id}`)}</a> <span class="muted small">— tocá para ver dónde se consigue</span>`; }
    else if (b.type === 'Skin') { const s = skinBy.get(b.id); body = `${s?.icon ? `<img class="ic16" src="${esc(s.icon)}" alt="">` : ''}Apariencia: <b>${esc(s?.name || `#${b.id}`)}</b>`; }
    else if (b.type === 'Minipet') { const m = miniBy.get(b.id); body = `${m?.icon ? `<img class="ic16" src="${esc(m.icon)}" alt="">` : ''}Minimascota: <b>${esc(m?.name || `#${b.id}`)}</b>`; }
    else body = esc(b.text || '');
    return `<li class="${done ? 'done' : ''}"><span class="chkbox">${done ? '✔' : ''}</span><span>${body}</span></li>`;
  };
  const rewardHTML = (r) => {
    if (r.type === 'Item') { const it = itemBy.get(r.id); return `<li>${it?.icon ? `<img class="ic16" src="${esc(it.icon)}" alt="">` : ''}${r.count > 1 ? `${r.count} × ` : ''}<a href="#/item/${r.id}">${esc(it?.name || `Item ${r.id}`)}</a>${it?.rarity ? ` <span class="muted small">${esc(it.rarity)}</span>` : ''}</li>`; }
    if (r.type === 'Mastery') return `<li>⭐ Punto de maestría de <b>${esc(MASTERY[r.region] ?? r.region)}</b></li>`;
    if (r.type === 'Title') return `<li>🏷 Título: <b>${esc(titleBy.get(r.id)?.name || `#${r.id}`)}</b></li>`;
    if (r.type === 'Coins') { const c = r.count; return `<li>🪙 ${Math.floor(c / 10000) ? `${Math.floor(c / 10000)} o ` : ''}${Math.floor((c % 10000) / 100)} p ${c % 100} c</li>`; }
    return `<li>${esc(r.type)}</li>`;
  };

  // Posición dentro de su categoría (las colecciones suelen ir en orden).
  const sib = cat ? cat.achievements : [];
  const pos = sib.indexOf(a.id);
  const sibNames = pos >= 0 ? await many('achievements', [sib[pos - 1], sib[pos + 1]].filter(Boolean)).catch(() => []) : [];
  const prev = sibNames.find((x) => x.id === sib[pos - 1]);
  const next = sibNames.find((x) => x.id === sib[pos + 1]);

  const steps = [];
  if (a.flags?.includes('RequiresUnlock') || a.locked_text) steps.push(`<b>Desbloquearlo.</b> ${esc(a.locked_text || 'Este logro está bloqueado hasta que se cumpla una condición previa (ver abajo / en la wiki).')}`);
  if (chain.length) steps.push(`<b>Completar antes ${chain.length === 1 ? 'el logro previo' : `${chain.length} logros previos`}</b> (ver "Ruta").`);
  if (requirement(a)) steps.push(`<b>Objetivo:</b> ${esc(requirement(a))}`);
  if (bits.length) steps.push(`<b>Completar ${bits.length} parte${bits.length === 1 ? '' : 's'}</b>${a.type === 'ItemSet' ? ' (conseguir y desbloquear cada item de la colección)' : ''} — detalle abajo.`);
  if ((a.tiers || []).length > 1) steps.push(`<b>Subir de nivel:</b> ${a.tiers.map((t) => `${t.count}`).join(' → ')} (${points(a)} puntos en total).`);
  if ((a.rewards || []).length) steps.push('<b>Reclamar la recompensa</b> en el panel de logros (H → Logros).');

  view.innerHTML = `
    <div class="ach-detail">
      <a class="btn ghost small" href="${cat ? `#/logros/c/${cat.id}` : '#/logros'}">← ${esc(cat?.name || 'Logros')}</a>
      <div class="ach-head">
        ${a.icon || cat?.icon ? `<img src="${esc(a.icon || cat.icon)}" alt="">` : ''}
        <div>
          <h1>${esc(a.name)}</h1>
          <div class="muted small">${esc([grp?.name, cat?.name].filter(Boolean).join(' › '))} · EN: ${esc(en?.name || '')} · ${points(a)} puntos ${flagPills(a, esc)}</div>
          ${st ? `<div class="ach-st ${st.cls}" style="margin-top:6px">Tu progreso: ${esc(st.label)}</div>` : ''}
        </div>
      </div>
      ${a.description ? `<p class="ach-desc">“${esc(a.description)}”</p>` : ''}

      <div class="section"><h3>Paso a paso</h3><ol class="ach-steps">${steps.map((s) => `<li>${s}</li>`).join('')}</ol></div>

      <div class="section"><h3>Condiciones de desbloqueo</h3>
        ${a.locked_text ? `<p>${esc(a.locked_text)}</p>` : ''}
        ${a.flags?.includes('RequiresUnlock') ? '<p>Este logro <b>requiere desbloqueo</b>: aparece cuando hacés algo concreto (normalmente conseguir un item o avanzar una historia). La guía de la wiki de abajo suele explicar cómo.</p>' : ''}
        ${!a.locked_text && !a.flags?.includes('RequiresUnlock') && !chain.length ? '<p>Está disponible desde el principio: no necesita desbloqueo ni logros previos.</p>' : ''}
        ${a.flags?.includes('Daily') ? '<p>Es un logro <b>diario</b>: se reinicia cada día a las 21:00 (hora de Argentina).</p>' : ''}
      </div>

      <div class="section"><h3>Ruta</h3>
        ${chain.length ? `<p class="muted small">Hay que completar estos logros, en este orden:</p><ol class="ach-route">${chain.map((c) => `<li><a href="#/logro/${c.id}">${esc(c.name)}</a>${stateOf(c, P)?.cls === 'done' ? ' <span class="ach-st done">✔</span>' : ''}<div class="muted small">${esc(requirement(c)).slice(0, 160)}</div></li>`).join('')}<li><b>${esc(a.name)}</b> <span class="muted small">(este)</span></li></ol>` : '<p class="muted small">No tiene logros previos obligatorios.</p>'}
        ${cat && pos >= 0 ? `<p class="small">En la categoría <a href="#/logros/c/${cat.id}">${esc(cat.name)}</a> es el <b>${pos + 1} de ${sib.length}</b>. ${prev ? `Anterior: <a href="#/logro/${prev.id}">${esc(prev.name)}</a>.` : ''} ${next ? `Siguiente: <a href="#/logro/${next.id}">${esc(next.name)}</a>.` : ''}</p>` : ''}
      </div>

      ${bits.length ? `<div class="section"><h3>Partes a completar (${bits.length})</h3><ul class="ach-bits">${bits.map(bitHTML).join('')}</ul></div>` : ''}

      ${(a.tiers || []).length ? `<div class="section"><h3>Niveles</h3><div class="ach-tiers">${a.tiers.map((t, i) => `<div><b>${t.count}</b><span class="muted small">nivel ${i + 1} · ${t.points} pts</span></div>`).join('')}</div></div>` : ''}

      ${(a.rewards || []).length ? `<div class="section"><h3>Recompensas</h3><ul class="steps">${a.rewards.map(rewardHTML).join('')}</ul></div>` : ''}

      <div class="section"><h3>Ubicación y guía <span class="muted small">(wiki oficial, en inglés)</span></h3>
        <div id="aplaces"></div>
        <div id="aguide"><div class="skeleton"></div></div>
      </div>

      <div class="section"><h3>Enlaces</h3><div class="links">
        <a class="btn ghost small" target="_blank" rel="noopener" href="https://wiki.guildwars2.com/wiki/${encodeURIComponent((en?.name || a.name).replace(/ /g, '_'))}">Wiki (inglés)</a>
        <a class="btn ghost small" target="_blank" rel="noopener" href="https://wiki-es.guildwars2.com/index.php?search=${encodeURIComponent(a.name)}">Wiki (español)</a>
      </div></div>
    </div>`;

  // Guía de la wiki + lugares mencionados que existen en el mapa.
  try {
    const gd = await api(`/api/ach-guide?title=${encodeURIComponent(en?.name || a.name)}&id=${a.id}&cat=${encodeURIComponent(catEn)}`);
    const box = view.querySelector('#aguide');
    if (!box) return;
    if (!gd.available) { box.innerHTML = `<p class="muted">${esc(gd.reason || 'Sin guía.')}</p><a class="btn ghost small" target="_blank" rel="noopener" href="${esc(gd.url || '#')}">Abrir en la wiki</a>`; return; }
    const { html, links } = cleanWiki(gd.kind === 'category' ? rowsOf(gd.html, gd.achId) : gd.html, esc);
    box.innerHTML = `${gd.source === 'archivo' ? '<p class="muted small">La wiki está caída: muestro la copia archivada (puede estar algo desactualizada).</p>' : ''}${gd.kind === 'category' ? `<p class="muted small">De la página de la categoría en la wiki: <a target="_blank" rel="noopener" href="${esc(gd.url)}">${esc(gd.title)}</a></p>` : ''}<div class="wiki-html">${html}</div>`;
    let labels = null;
    try { labels = (await api('/api/vendors')).labels; } catch {}
    if (labels && links.length) {
      const idx = new Map();
      for (const s of labels.sectors) idx.set(normalize(s.en), { ...s, kind: 'sector' });
      for (const m of labels.maps) idx.set(normalize(m.en), { ...m, kind: 'mapa' });
      for (const w of labels.waypoints || []) if (!idx.has(normalize(w.en))) idx.set(normalize(w.en), { ...w, kind: 'waypoint' });
      const hits = [];
      for (const l of links) { const h = idx.get(normalize(l)); if (h && !hits.some((x) => x.en === h.en)) hits.push(h); }
      // Primero waypoints, después mapas y sectores en el orden en que aparecen en la guía.
      const rank = { waypoint: 0, mapa: 1, sector: 2 };
      hits.sort((x, y) => rank[x.kind] - rank[y.kind]);
      hits.splice(12);
      if (hits.length) {
        view.querySelector('#aplaces').innerHTML = `<p class="small"><b>Lugares mencionados:</b> ${hits.map((h) => `<a class="chip" href="#/mapa/@${h.c[0]},${h.c[1]},${encodeURIComponent(h.es)}" title="${esc(h.en)}${h.chat ? ` · ${esc(h.chat)}` : ''}">${h.kind === 'waypoint' ? '🌀' : '📍'} ${esc(h.es)}</a>${h.chat ? `<button class="btn ghost small" data-copy="${esc(h.chat)}" title="Copiar código del waypoint para el chat del juego">${esc(h.chat)}</button>` : ''}`).join(' ')}</p>`;
      }
    }
    view.querySelector('#aplaces').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-copy]');
      if (!b) return;
      try { await navigator.clipboard.writeText(b.dataset.copy); toast?.('Waypoint copiado: pegalo en el chat del juego'); } catch { toast?.(b.dataset.copy); }
    });
  } catch (e) {
    const box = view.querySelector('#aguide');
    if (box) box.innerHTML = `<p class="muted">No pude traer la guía (${esc(e.message)}).</p>`;
  }
}
