// Pestaña "Ruta legendaria" (sólo en el Bazar local): para cada legendaria, su cadena de logros en orden
// (hecho / empezado / disponible / por desbloquear y cómo empezar) y cuánto de los materiales ya tenés
// en tu cuenta (banco, materiales y personajes). Todo se lee en vivo con tu API key.
const API = () => `${globalThis.GW2_API_BASE || 'https://api.guildwars2.com'}/v2`;
const CATS = [114, 118, 125, 173, 316, 441, 453]; // armas, mochilas, armadura, abalorios, facetas de Aurene, Klobjarne, Orrax
const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5 };
const norm = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const LABEL = { ok: 'Hecho', run: 'Empezado', open: 'Disponible', lock: 'Por desbloquear' };
// Sin cuenta conectada: no sabemos qué hiciste, así que sólo mostramos si el paso tiene requisito previo.
const LABEL_NOACC = { ok: 'Hecho', run: 'Empezado', open: 'Sin requisito previo', lock: 'Tiene requisito' };
let NOACC = false;
const lab = (k) => (NOACC ? LABEL_NOACC : LABEL)[k];
let DEFS = null; // definiciones de logros (no cambian: se guardan en memoria)

async function getJSON(url) { const r = await fetch(url); if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); }
async function loadDefs() {
  if (DEFS) return DEFS;
  const cats = await getJSON(`${API()}/achievements/categories?lang=es&ids=${CATS.join(',')}`);
  const ids = [...new Set(cats.flatMap((c) => c.achievements))];
  const ach = [];
  for (let i = 0; i < ids.length; i += 200) ach.push(...(await getJSON(`${API()}/achievements?lang=es&ids=${ids.slice(i, i + 200).join(',')}`)));
  const pre = [...new Set(ach.flatMap((a) => a.prerequisites || []))].filter((x) => !ids.includes(x));
  const extra = pre.length ? await getJSON(`${API()}/achievements?lang=es&ids=${pre.join(',')}`) : [];
  DEFS = { cats, ach, byId: new Map([...ach, ...extra].map((a) => [a.id, a])) };
  return DEFS;
}

/** A qué legendaria pertenece un logro (nombre del grupo) y su orden dentro de la cadena. */
function groupOf(a, catId) {
  const n = a.name;
  let m;
  if (catId === 316) return { g: 'Facetas de Aurene (3.ª generación)', o: /nuevo ciclo/i.test(n) ? 0 : /prismas/i.test(n) ? 9 : /^Faceta de Aurene/i.test(n) ? 1 : /^Recuerdos/i.test(n) ? 2 : 3 };
  if (/^Klobjarne Geirr|Klobjarne Geirr$/i.test(n) || /Dones de Klobjarne/i.test(n)) return { g: 'Klobjarne Geirr', o: /^Arma legendaria: Klobjarne Geirr$/i.test(n) ? 9 : /Dones/i.test(n) ? 0 : 1 };
  if (/Pesadillas desconocidas|Orrax/i.test(n)) return { g: 'Orrax Manifestado', o: /Mochila y planeador/i.test(n) ? 9 : /Orrax Contenido/i.test(n) ? 5 : 1 };
  if (/Ad Infinitum/i.test(n)) return { g: 'Ad Infinitum', o: (m = n.match(/Ad Infinitum (I{1,3})\b/)) ? ROMAN[m[1]] : 9 };
  if (/Astral|obsidiana|Qué armadura más|Ostras/i.test(n)) return { g: 'Armadura de Obsidiana', o: /dones astrales/i.test(n) ? 0 : /Astral/i.test(n) ? 1 : /Qué armadura/i.test(n) ? 2 : /rango 2/i.test(n) ? 3 : 4 };
  if (/Armadura del enviado|Herrero legendario/i.test(n)) return { g: 'Armadura del enviado (incursiones)', o: (m = n.match(/enviado (I{1,3})\b/)) ? ROMAN[m[1]] : 9 };
  if (/Aurora|^Maestro de|^Maestro del/i.test(n)) return { g: 'Aurora', o: /Despertar/i.test(n) ? 0 : /Aurora II/i.test(n) ? 9 : 1 };
  if (/^Visi[oó]n/i.test(n)) return { g: 'Visión', o: /Visión I:/i.test(n) ? 0 : /Visión II/i.test(n) ? 9 : 1 };
  if (/Coalescencia/i.test(n)) return { g: 'Coalescencia', o: (m = n.match(/Coalescencia (I{1,3})\b/)) ? ROMAN[m[1]] : 9 };
  if (/[Rr]eliquia/.test(n)) return { g: 'Reliquia legendaria', o: /componentes/i.test(n) ? 0 : 9 };
  if (/hylek|dios Sol/i.test(n)) return { g: 'Verano Eterno (anillo)', o: /krait/i.test(n) ? 1 : 2 };
  if (/runas legendarias|sellos legendarios/i.test(n)) return { g: 'Runas y sellos legendarios', o: 1 };
  if ((m = n.match(/^Arma legendaria: (.+)$/))) return { g: m[1], o: 9 };
  if (/^Las profec[ií]as del buscador de la llama/i.test(n)) { m = n.match(/llama (I{1,3})?:/i); return { g: 'Las Profecías del Buscador de la Llama', o: m?.[1] ? ROMAN[m[1].toUpperCase()] : 1 }; }
  if ((m = n.match(/^(.+?) (I{1,3}|IV|V):/))) return { g: m[1], o: ROMAN[m[2]] };
  return { g: n, o: 5 };
}

// Datos verificados en la wiki oficial (nov. 2026) que la API no trae o trae mal.
const GEN2 = new Set(['nunca mas', 'esperanza', 'astralaria', 'chuka y champawat']);
const M = { ant: '«Anticuario venerado» (1 punto de dominio de Tyria)', mae: '«Maestre de leyendas» (3 puntos)', his: '«Historiador de armamento» (6 puntos)', eru: '«Erudito de los secretos» (9 puntos; antes hay que tener los tres niveles anteriores)' };
const GROUP_NOTES = {
  'eternidad': 'Se fabrica en la Forja Mística con Amanecer + Crepúsculo + 5 montones de polvo cristalino + 10 piedras filosofales.',
  'jornal estelar': 'Espada legendaria de Visions of Eternity. Forja Mística: Constelación novata (precursor) + Don del resguardo tenebroso + Don de la realidad + Tributo místico. El Don del resguardo tenebroso sale de la armadura de resguardo tenebroso (Castora).',
  'consiguiendo agaleus': 'Precursor del respirador acuático legendario. Empieza hablando con el «capitán» Ruymond Lakes en Pub Canach (Cayo Brisa).',
  'verano eterno anillo': 'Son dones del anillo legendario Verano Eterno (Visions of Eternity): Don de los rayos + Don de los supervivientes + Don del pueblo + Don de los hylek. «Resplandor del dios Sol» empieza hablando con el chamán Palak, en el acantilado al noreste del waypoint del Muelle de Hullgarden (Orilla del Naufragio).',
  'armadura de obsidiana': 'Por pieza: juntá los diseños de armadura y derrotá al jefe de esa pieza; después le comprás el Arcanum a Lyhr (torre del brujo) con un Cristal de visión menor. Piezas: Pensamiento = casco, Porte = hombros, Latido = pecho, Agarrón = guantes, Zancada = piernas, Huellas = botas.',
  'facetas de aurene 3 generacion': 'Primero hay que fabricar una legendaria de 3.ª generación (de Aurene): Don de maestría de jade (completar los mapas de Cantha: Provincia de Seitung, Nueva Kaineng, Bosque de Echovald y Fin del Dragón, + runas de jade, jade puro, ámbar gris y 100 piedras de invocación antiguas) + Tributo dracónico + el precursor. Al vincularla en la armería, hablá con Leivas.',
};
let LEGCRAFT = -1; // niveles entrenados de Artesanía legendaria (id 6): 0 a 4; -1 = no se sabe
const LV = ['', M.ant, M.mae, M.his, M.eru];
function fixHow(g, s) {
  const k = norm(g.name);
  if (s.st === 'ok') return s.how;
  // Con tus dominios entrenados sabemos si la colección ya está disponible.
  if (LEGCRAFT >= 0 && (s.st === 'lock' || s.st === 'open')) {
    const need = GEN2.has(k) ? 4 : s.o === 1 && /Anticuario/.test(s.how || '') ? 1 : s.o === 2 && /perfeccionad/i.test(s.name) ? 2 : s.o === 3 && s.list3 ? 3 : 0;
    if (need) {
      const prev = g.list[g.list.indexOf(s) - 1];
      const prevOk = !prev || prev.o >= s.o || prev.st === 'ok' || (GEN2.has(k) && s.o === 1);
      if (LEGCRAFT >= need && prevOk) { s.st = 'open'; return `Ya tenés ${LV[need]}: hablá con el gran maestro artesano Hobbs en Arco del León para empezarla.${/diario del cazador/.test(s.name) ? ' Después hablá con Bagred el Cazador, al final de un puente al suroeste del waypoint del Refugio de Guaridanieve (Cúmulos de Guaridanieve).' : ''}`; }
      s.st = 'lock';
      if (LEGCRAFT >= need) return `Ya tenés ${LV[need]}; falta terminar «${prev.name}».`;
      return `Necesitás el dominio ${LV[need]} de Artesanía legendaria (Tyria central; hoy tenés ${LEGCRAFT} de 4 niveles)${prevOk ? '' : ` y terminar «${prev.name}»`}. Después hablá con Hobbs en Arco del León.`;
    }
  }
  if (GEN2.has(k)) {
    if (s.o === 1 || /^Chuka y Champawat I:/.test(s.name)) return `Necesitás el dominio ${M.eru} de Artesanía legendaria (dominios de Tyria central) y hablar con el gran maestro artesano Hobbs en Arco del León.${/diario del cazador/.test(s.name) ? ' Después hablá con Bagred el Cazador, al final de un puente al suroeste del waypoint del Refugio de Guaridanieve (Cúmulos de Guaridanieve).' : ''}`;
    if (s.st === 'lock') return `Se abre al terminar el paso anterior (con ${M.eru}).${s.how && !/Anticuario/.test(s.how) && !/paso anterior/.test(s.how) ? ` ${s.how}` : ''}`;
    return s.how;
  }
  if (s.o === 1 && /Anticuario/.test(s.how || '')) return `Desbloqueá ${M.ant} del dominio Artesanía legendaria (Tyria central) y hablá con el gran maestro artesano Hobbs en Arco del León.`;
  if (s.o === 2 && /perfeccionad/i.test(s.name)) return `Necesitás terminar la colección I y el dominio ${M.mae} (Artesanía legendaria); Hobbs te vende los componentes.`;
  if (s.o === 3 && s.list3) return `Necesitás terminar la colección II y el dominio ${M.his} (Artesanía legendaria); Hobbs te vende los componentes.`;
  return s.how;
}

export async function renderRuta(view, { api, esc, coin }) {
  let filter = 'all', q = '';
  try { filter = localStorage.getItem('gw2-ruta-f') || 'all'; } catch {}
  view.innerHTML = `<div class="page-head"><div><h1>Ruta legendaria</h1><p>Cada legendaria con su <b>cadena de logros en orden</b> (qué está hecho, empezado, disponible o por desbloquear y cómo empezarlo) y <b>cuánto de los materiales ya tenés</b> en tu cuenta. Con una API key cargada en «Mi cuenta» se lee tu avance en vivo (banco, depósito de materiales y personajes); sin key ves las cadenas y lo que cuesta cada legendaria.</p></div>
      <div><button class="btn" id="rtRefresh">↻ Actualizar desde mi cuenta</button></div></div>
    <div class="filters rt-bar">
      ${['all', 'run', 'open', 'lock'].map((f) => `<button class="chip-btn" data-f="${f}" aria-pressed="${filter === f}">${f === 'all' ? 'Todas' : f === 'run' ? 'Con algo empezado' : f === 'open' ? 'Con algo disponible' : 'Por desbloquear'}</button>`).join('')}
      <input type="search" id="rtQ" placeholder="Buscar legendaria o logro…" style="flex:1;min-width:200px">
    </div>
    <div id="rtSum"></div><div id="rtOut"><div class="skeleton"></div></div>`;

  let groups = [];
  async function load(force = false) {
    const out = view.querySelector('#rtOut');
    out.innerHTML = '<div class="skeleton"></div><p class="muted small">Cargando las cadenas de logros…</p>';
    try {
      const [defs, acc, inv] = await Promise.all([
        loadDefs(),
        api('/api/account/achievements').catch(() => ({ progress: null })),
        api('/api/account/inventory').catch((e) => ({ items: [], warnings: [e.message] })),
        api('/api/account/progress').catch(() => ({})),
      ]).then((r) => { const lc = (r[3].masteries || []).find((m) => m.id === 6); LEGCRAFT = r[3].masteries ? (lc ? lc.level + 1 : 0) : -1; return r; });
      NOACC = !acc.progress;
      const prog = new Map((acc.progress || []).map((p) => [p.id, p]));
      const invMap = Object.fromEntries((inv.items || []).map((i) => [i.id, i.count]));
      const plan = await api('/api/planner', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inv: invMap, mode: 'instant', limit: 500 }) }).catch(() => ({ rows: [] }));
      const legByName = new Map((plan.rows || []).map((r) => [norm(r.name), r]));
      const map = new Map();
      for (const c of defs.cats) for (const id of c.achievements) {
        const a = defs.byId.get(id);
        if (!a) continue;
        const { g, o } = groupOf(a, c.id);
        const k = norm(g);
        if (!map.has(k)) map.set(k, { name: g, cat: c.name, list: [] });
        const p = prog.get(id);
        const max = p?.max || a.tiers?.at(-1)?.count || 0;
        const preOk = (a.prerequisites || []).every((x) => prog.get(x)?.done);
        const st = p?.done ? 'ok' : p && (p.current || 0) > 0 ? 'run' : !preOk || (a.locked_text && !p) ? 'lock' : 'open';
        const preNames = (a.prerequisites || []).filter((x) => !prog.get(x)?.done).map((x) => defs.byId.get(x)?.name).filter(Boolean);
        const how = st === 'ok' ? '' : st === 'lock' ? (a.locked_text || (preNames.length ? `Primero completá: ${preNames.join(', ')}.` : '')) : (a.requirement || '').replace(/\s{2,}/g, ' ');
        map.get(k).list.push({ id, name: a.name, o, st, cur: p?.done ? max : p?.current || 0, max, how, rew: (a.rewards || []).filter((r) => r.type === 'Item').map((r) => r.id) });
      }
      groups = [...map.values()].map((g) => {
        g.list.sort((a, b) => a.o - b.o || a.name.localeCompare(b.name, 'es', { numeric: true }));
        // En las cadenas I → II → III, un paso sin requisito explícito igual espera al anterior.
        for (let i = 1; i < g.list.length; i++) { const s = g.list[i]; if (s.st === 'open' && s.o > 1 && s.o < 9 && g.list[i - 1].st !== 'ok' && /\b(II|III|IV)\b/.test(s.name)) { s.st = 'lock'; s.how = s.how || 'Se desbloquea al terminar el paso anterior.'; } }
        const gen1 = g.list.some((x) => /experimental/i.test(x.name)) && !GEN2.has(norm(g.name));
        for (const x of g.list) { if (gen1 && x.o === 3) x.list3 = true; x.how = fixHow(g, x); }
        g.note = GROUP_NOTES[norm(g.name)] || '';
        g.leg = legByName.get(norm(g.name)) || null;
        g.count = { ok: 0, run: 0, open: 0, lock: 0 };
        for (const s of g.list) g.count[s.st]++;
        return g;
      }).sort((a, b) => (b.count.ok + b.count.run > 0) - (a.count.ok + a.count.run > 0) || (b.leg?.progress || 0) - (a.leg?.progress || 0) || a.name.localeCompare(b.name, 'es'));
      const t = { ok: 0, run: 0, open: 0, lock: 0 };
      for (const g of groups) for (const k in t) t[k] += g.count[k];
      view.querySelector('#rtSum').innerHTML = NOACC ? `<div class="explain small"><b>Sin cuenta conectada.</b> Ves todas las cadenas en orden, qué pide cada paso y lo que cuesta cada legendaria en el bazar. Para ver tu avance, tus dominios y cuánto de los materiales ya tenés, cargá tu API key en <a href="#/cuenta">Mi cuenta</a> (queda guardada sólo en este navegador y sólo se usa con la API oficial de Guild Wars 2).</div>` : `<div class="cards">${['ok', 'run', 'open', 'lock'].map((k) => `<div class="card rt-${k}"><div class="k">${lab(k)}</div><div class="v num">${t[k]}</div></div>`).join('')}
        <div class="card"><div class="k">Inventario leído</div><div class="v num">${(inv.items || []).length}</div><div class="h">items distintos${inv.warnings?.length ? ` · ${esc(inv.warnings[0])}` : ''}</div></div></div>
        <p class="muted small">Actualizado ${new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}. La API de GW2 puede tardar unos minutos en reflejar lo que hiciste en el juego.</p>`;
      paint();
    } catch (e) {
      out.innerHTML = `<div class="empty">No pude leer tu cuenta: ${esc(e.message)}. Revisá que la API key esté cargada en «Mi cuenta».</div>`;
    }
  }

  function legHTML(g) {
    const l = g.leg;
    if (!l) return '';
    const pct = Math.round((l.progress || 0) * 100);
    return `<div class="rt-mat"><div class="rt-mat-h"><b>Materiales</b> <span class="muted small">(${esc(l.name)})</span></div>
      <div class="leg-bar"><span style="width:${pct}%"></span></div>
      <div class="small">${NOACC ? `Comprando todo en el bazar: <b>${coin(l.missingCost)}</b>` : `Lo que tenés cubre <b>${pct}%</b> del costo · falta comprar <b>${coin(l.missingCost)}</b>`}${l.untradableMissing ? ` · <span class="warn-t">${l.untradableMissing} cosa${l.untradableMissing === 1 ? '' : 's'} que no se compra${l.untradableMissing === 1 ? '' : 'n'}</span>` : ''}</div>
      <button class="btn ghost small" data-mat="${l.id}">${NOACC ? 'Ver todos los materiales' : 'Ver qué me falta'}</button><div class="rt-miss" id="miss-${l.id}"></div></div>`;
  }

  function paint() {
    const out = view.querySelector('#rtOut');
    const t = norm(q);
    const list = groups.filter((g) => (!t || norm(`${g.name} ${g.list.map((s) => s.name).join(' ')}`).includes(t)) && (filter === 'all' || g.count[filter] > 0));
    out.innerHTML = list.length ? `<div class="rt-grid">${list.map((g) => `<details class="rt-card" ${g.count.run || g.count.ok || t ? 'open' : ''}>
      <summary>${g.leg?.icon ? `<img src="${esc(g.leg.icon)}" alt="">` : ''}<h3>${esc(g.name)}</h3>
        <span class="rt-meta">${g.list.length} logro${g.list.length === 1 ? '' : 's'}${g.count.ok ? ` · <span class="rt-t-ok">${g.count.ok} hecho${g.count.ok === 1 ? '' : 's'}</span>` : ''}${g.count.run ? ` · <span class="rt-t-run">${g.count.run} empezado${g.count.run === 1 ? '' : 's'}</span>` : ''}${g.leg && !NOACC ? ` · materiales ${Math.round((g.leg.progress || 0) * 100)}%` : ''}</span></summary>
      ${g.note ? `<div class="rt-note"><b>Cómo se hace:</b> ${esc(g.note)}</div>` : ''}
      ${legHTML(g)}
      <ol class="rt-chain">${g.list.map((s, i) => `<li class="rt-${s.st}"><span class="rt-dot">${s.st === 'ok' ? '✓' : i + 1}</span><div>
        <div class="rt-row"><a href="#/logro/${s.id}" class="rt-name">${esc(s.name)}</a><span class="rt-pill">${lab(s.st)}</span>${s.max ? `<span class="rt-cnt">${s.cur}/${s.max}</span>` : ''}</div>
        ${s.st === 'run' && s.max ? `<div class="rt-prog"><i style="width:${Math.round((s.cur / s.max) * 100)}%"></i></div>` : ''}
        ${s.how ? `<div class="rt-how">${s.st === 'lock' ? '<b>Cómo desbloquearlo:</b> ' : ''}${esc(s.how)}</div>` : ''}</div></li>`).join('')}</ol></details>`).join('')}</div>` : '<div class="empty">Nada coincide.</div>';
    view.querySelectorAll('.rt-bar [data-f]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === filter)));
  }

  view.querySelector('#rtOut').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-mat]');
    if (!b) return;
    const id = Number(b.dataset.mat);
    const box = view.querySelector(`#miss-${id}`);
    box.innerHTML = '<div class="skeleton" style="height:40px"></div>';
    try {
      const inv = await api('/api/account/inventory').catch(() => ({ items: [] }));
      const p = await api('/api/planner', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: id, inv: Object.fromEntries(inv.items.map((i) => [i.id, i.count])), mode: 'instant' }) });
      const nf = (n) => Number(n).toLocaleString('es-AR');
      box.innerHTML = `${p.used?.length ? `<p class="small"><b>Ya usás de lo tuyo:</b> ${p.used.slice(0, 12).map((u) => `${nf(u.qty)} × ${esc(u.name)}`).join(', ')}${p.used.length > 12 ? '…' : ''}</p>` : ''}
        <div class="table-wrap"><table class="ing"><thead><tr><th>Te falta</th><th>Cantidad</th><th>En el bazar</th></tr></thead><tbody>
        ${p.missing.map((m) => `<tr><td class="left"><a href="#/item/${m.id}" class="rar-${esc(m.rarity || '')}">${m.icon ? `<img src="${esc(m.icon)}" alt="" class="ic16"> ` : ''}${esc(m.name)}</a></td><td class="num">${nf(m.qty)}</td><td>${m.unit != null ? coin(m.total) : '<span class="pill warn">no se compra</span>'}</td></tr>`).join('')}
        </tbody></table></div><p class="small"><a href="#/legendarias">Ver el árbol completo en Legendarias →</a></p>`;
    } catch (err) { box.innerHTML = `<p class="muted small">${esc(err.message)}</p>`; }
  });
  view.querySelector('.rt-bar').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (!b) return; filter = b.dataset.f; try { localStorage.setItem('gw2-ruta-f', filter); } catch {} paint(); });
  view.querySelector('#rtQ').addEventListener('input', (e) => { q = e.target.value; paint(); });
  view.querySelector('#rtRefresh').addEventListener('click', () => load(true));
  load();
}
