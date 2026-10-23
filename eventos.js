// Pestaña "Eventos": metaeventos y jefes de mundo con sus horarios (hora local), qué pasa ahora y qué viene.
// Datos: event-timers.json (temporizador de la wiki oficial). Cada día arranca a las 00:00 UTC:
// primero la secuencia "partial" (p) y después se repite "pattern" (q). Cada paso = [segmento, minutos].
const CAT_ES = {
  'Core Tyria': 'Tyria central', 'Living World Season 2': 'Mundo Viviente T2', 'Heart of Thorns': 'Heart of Thorns', 'Living World Season 3': 'Mundo Viviente T3',
  'Path of Fire': 'Path of Fire', 'Living World Season 4': 'Mundo Viviente T4', 'The Icebrood Saga': 'The Icebrood Saga', 'End of Dragons': 'End of Dragons',
  'Secrets of the Obscure': 'Secrets of the Obscure', 'Janthir Wilds': 'Janthir Wilds', 'Visions of Eternity': 'Visions of Eternity', 'Public Instances': 'Instancias públicas', 'Special Events': 'Festivales',
};
const NAME_ES = {
  'Day and night': 'Día y noche', 'Cantha: Day and night': 'Cantha: día y noche', 'Castora: Day and night': 'Castora: día y noche', Day: 'Día', Dusk: 'Atardecer', Night: 'Noche', Dawn: 'Amanecer',
  'World bosses': 'Jefes de mundo', 'Hard world bosses': 'Jefes de mundo difíciles', 'Ley-Line Anomaly': 'Anomalía de línea ley', Invasions: 'Invasiones', 'Fractal Incursions': 'Incursiones fractales',
  'EU PvP Tournaments': 'Torneos PvP (EU)', 'NA PvP Tournaments': 'Torneos PvP (NA)', 'Awakened Invasion': 'Invasión de los Despertados', "Defeat Scarlet's minions": 'Derrotar a los esbirros de Scarlet',
  'Admiral Taidha Covington': 'Almirante Taidha Covington', 'Svanir Shaman Chief': 'Jefe chamán Svanir', Megadestroyer: 'Megadestructor', 'Fire Elemental': 'Elemental de fuego', 'The Shatterer': 'El Destructor',
  'Great Jungle Wurm': 'Gran sierpe de la jungla', 'Modniir Ulgoth': 'Ulgoth el Modniir', 'Shadow Behemoth': 'Behemot de las sombras', 'Claw of Jormag': 'Garra de Jormag', 'Golem Mark II': 'Gólem Mark II',
  'Triple Trouble': 'Triple Problema', 'Karka Queen': 'Reina karka', 'Tequatl the Sunless': 'Tequatl el Sombrío', 'Crash Site': 'Lugar del accidente', Sandstorm: 'Tormenta de arena',
  'Night Bosses': 'Jefes nocturnos', Pylons: 'Pilones', Challenges: 'Desafíos', Octovine: 'Octoparra', Reset: 'Reinicio', 'Help the Outposts': 'Ayudar a los puestos', Prep: 'Preparación',
  'Chak Gerent': 'Gerente chak', '(continued)': '(continúa)', 'Rounds 1 to 3': 'Rondas 1 a 3', 'Pinata/Reset': 'Piñata / reinicio', 'Buried Treasure': 'Tesoro enterrado', Doppelganger: 'Doble',
  'Maws of Torment': 'Fauces del Tormento', 'Junundu Rising': 'Alzamiento de los junundu', "Serpents' Ire": 'Ira de las Serpientes', 'Forged with Fire': 'Forjado con fuego', Escorts: 'Escoltas',
  'Death-Branded Shatterer': 'Destructor marcado por la muerte', 'Effigy': 'Efigie', 'Doomlore Shrine': 'Santuario de Doomlore', 'Ooze Pits': 'Fosos de légamo', 'Metal Concert': 'Concierto de metal',
  'Defend Jora\'s Keep': 'Defender la Fortaleza de Jora', 'Shards and Construct': 'Esquirlas y constructo', 'Icebrood Champions': 'Campeones de la Progenie Gélida', 'Aetherblade Assault': 'Asalto de Filoetéreo',
  'Kaineng Blackout': 'Apagón en Kaineng', 'Gang War': 'Guerra de bandas', 'Preparations': 'Preparativos', 'Jade Maw': 'Fauces de Jade', 'The Battle for the Jade Sea': 'La batalla por el Mar de Jade',
  'Target Practice': 'Práctica de tiro', 'Fly by Night': 'Vuelo nocturno', 'Twisted Marionette': 'La Marioneta Retorcida', "Battle For Lion's Arch": 'Batalla por Arco del León', 'Tower of Nightmares': 'Torre de las Pesadillas',
  'Skiff Race': 'Carrera de esquifes', 'Water Balloons': 'Globos de agua', 'Treasure Hunt': 'Búsqueda del tesoro', 'Skimmer Race': 'Carrera de rayas', Fishing: 'Pesca', 'Dolyak Race': 'Carrera de dolyaks', 'Mad King Says': 'El Rey Loco dice',
};
const DAY = 1440;
// Ocultos de entrada: ciclos de día/noche, torneos PvP y festivales que no siempre están activos.
const HIDE_BY_DEFAULT = new Set(['core-dn', 'eod-dn', 'voe-dn', 'core-ateu', 'core-atna', 'festival-lc', 'festival-db']);

/** Segmentos de un evento entre [desde, hasta) en minutos desde la medianoche UTC del día `d0` (puede cruzar días). */
function segmentsBetween(ev, fromMin, toMin) {
  const out = [];
  const startDay = Math.floor(fromMin / DAY) - 1;
  const endDay = Math.floor(toMin / DAY) + 1;
  for (let day = startDay; day <= endDay; day++) {
    let t = day * DAY;
    const end = t + DAY;
    const push = (r, d) => { if (r && t + d > fromMin && t < toMin) out.push({ r, start: t, end: t + d }); t += d; };
    for (const [r, d] of ev.p) { if (t >= end) break; push(r, d); }
    if (ev.q.length) {
      while (t < end) for (const [r, d] of ev.q) { if (t >= end) break; push(r, Math.min(d, end - t)); }
    }
  }
  // Unimos segmentos iguales consecutivos (por ejemplo, un evento que cruza la medianoche UTC).
  out.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const s of out) {
    const last = merged[merged.length - 1];
    if (last && last.r === s.r && last.end === s.start && s.start % DAY === 0) last.end = s.end;
    else merged.push({ ...s });
  }
  return merged;
}

export async function renderEventos(view, { api, esc, toast, normalize }) {
  view.innerHTML = '<div class="skeleton"></div>';
  let data, labels = null;
  try {
    data = await fetch('event-timers.json').then((r) => r.json());
  } catch (e) { view.innerHTML = `<div class="empty">No pude cargar los horarios: ${esc(e.message)}</div>`; return; }
  try { labels = (await api('/api/vendors')).labels; } catch {}
  const wpByChat = new Map((labels?.waypoints || []).map((w) => [w.chat, w]));
  const mapByEn = new Map((labels?.maps || []).map((m) => [normalize(m.en), m]));
  const es = (s) => NAME_ES[s] || mapByEn.get(normalize(s || ''))?.es || s;
  const events = Object.entries(data.events).map(([key, ev]) => ({ key, ...ev }));
  const cats = [...new Set(events.map((e) => e.c))];

  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('gw2-eventos') || '{}'); } catch {}
  const st = { cat: saved.cat || '', q: '', hidden: new Set(saved.hidden || [...HIDE_BY_DEFAULT]), window: saved.window || 180, range: saved.range || '1,3', zoom: saved.zoom || 5 };
  const save = () => { try { localStorage.setItem('gw2-eventos', JSON.stringify({ cat: st.cat, hidden: [...st.hidden], window: st.window, range: st.range, zoom: st.zoom })); } catch {} };

  view.innerHTML = `
    <div class="page-head"><div><h1>Eventos</h1><p>Metaeventos y jefes de mundo con sus horarios en <b>tu hora local</b>. Arriba, lo que está pasando y lo que empieza pronto; abajo, la línea de tiempo de cada mapa. Tocá un evento para copiar su waypoint o verlo en el mapa.</p></div>
      <div class="clock"><div class="muted small">Hora local</div><div id="evClock" class="num"></div><div class="muted small" id="evUtc"></div></div></div>
    <div class="filters">
      <input type="search" id="evQ" placeholder="Buscar evento o mapa… (ej: Tequatl, Octoparra, Arco del León)">
      <label>Expansión <select id="evCat"><option value="">Todas</option>${cats.map((c) => `<option value="${esc(c)}" ${st.cat === c ? 'selected' : ''}>${esc(CAT_ES[c] || c)}</option>`).join('')}</select></label>
      <label>Lista: próximas <select id="evWin">${[60, 120, 180, 360, 720].map((m) => `<option value="${m}" ${st.window === m ? 'selected' : ''}>${m / 60} h</option>`).join('')}</select></label>
    </div>
    <div class="section"><h3>Horario <span class="muted small">(tu hora local · pasá el mouse por un evento para ver el detalle, tocalo para copiar el waypoint)</span></h3>
      <div class="ev-tools">
        <label>Rango <select id="evRange"><option value="1,3">1 h antes · 3 h después</option><option value="2,2">2 h antes · 2 h después</option><option value="1,7">1 h antes · 7 h después</option><option value="day">Todo el día de hoy</option></select></label>
        <label>Tamaño <select id="evZoom"><option value="3">compacto</option><option value="5">normal</option><option value="8">amplio</option></select></label>
      </div>
      <div id="evTimeline" class="ev-wiki"></div>
      <p class="muted small" id="evHiddenNote"></p></div>
    <div class="section"><h3>Ahora y próximos</h3><div id="evNext"></div></div>
    <p class="muted small">Horarios: temporizador de la wiki oficial (${esc(data.v || '')}, copia del ${esc(data.at || '')}). Los eventos que dependen de que los jugadores los completen pueden adelantarse o atrasarse unos minutos. Los festivales sólo ocurren mientras el festival está activo en el juego.</p>`;

  const fmt = (min) => new Date(min * 60000).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  const rel = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim());
  const where = (ev, seg) => {
    const chat = ev.s[seg.r]?.[2];
    const wp = chat ? wpByChat.get(chat) : null;
    return { chat, wp };
  };

  function paint() {
    const nowMin = Math.floor(Date.now() / 60000);
    view.querySelector('#evClock').textContent = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    view.querySelector('#evUtc').textContent = `${new Date().toISOString().slice(11, 16)} UTC (hora del servidor)`;
    const q = normalize(st.q).trim();
    const match = (ev, segName = '') => (!st.cat || ev.c === st.cat) && (!q || normalize(`${ev.n} ${es(ev.n)} ${segName} ${es(segName)} ${CAT_ES[ev.c] || ev.c}`).includes(q));

    // Lista "ahora y próximos"
    const rows = [];
    for (const ev of events) {
      if (HIDE_BY_DEFAULT.has(ev.key) && !q && st.cat !== ev.c) continue;
      for (const seg of segmentsBetween(ev, nowMin, nowMin + st.window)) {
        const name = ev.s[seg.r]?.[0] || '';
        if (!match(ev, name)) continue;
        rows.push({ ev, seg, name });
      }
    }
    rows.sort((a, b) => a.seg.start - b.seg.start);
    view.querySelector('#evNext').innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Cuándo</th><th class="left">Evento</th><th class="left">Mapa / grupo</th><th>Dura</th><th class="left">Waypoint</th></tr></thead><tbody>
      ${rows.map(({ ev, seg, name }) => {
        const live = seg.start <= nowMin;
        const { chat, wp } = where(ev, seg);
        return `<tr class="${live ? 'ev-live' : ''}">
          <td class="left">${live ? `<span class="pill good">EN CURSO</span> <span class="small muted">termina ${fmt(seg.end)} · quedan ${rel(seg.end - nowMin)}</span>` : `<b class="num">${fmt(seg.start)}</b> <span class="small muted">en ${rel(seg.start - nowMin)}</span>`}</td>
          <td class="left"><b title="${esc(name)}">${esc(es(name))}</b>${ev.s[seg.r]?.[1] ? ` <a class="small" target="_blank" rel="noopener" href="https://wiki.guildwars2.com/wiki/${encodeURIComponent(ev.s[seg.r][1].replace(/ /g, '_'))}">wiki</a>` : ''}</td>
          <td class="left small" title="${esc(ev.n)}">${esc(es(ev.n))} <span class="muted">· ${esc(CAT_ES[ev.c] || ev.c)}</span></td>
          <td class="num">${seg.end - seg.start} min</td>
          <td class="left small">${chat ? `<button class="btn ghost small" data-copy="${esc(chat)}" title="Copiar para pegar en el chat del juego">${esc(chat)}</button>` : ''}${wp ? ` <a href="#/mapa/@${wp.c[0]},${wp.c[1]},${encodeURIComponent(wp.es)}" title="${esc(wp.en)}">📍 ${esc(wp.es)}</a>` : ''}</td>
        </tr>`;
      }).join('')}</tbody></table></div>` : '<div class="empty">Nada en ese rango con esos filtros.</div>';

    // Tabla estilo wiki: filas agrupadas por expansión, bloques de color con nombre y hora de inicio.
    let from, to;
    if (st.range === 'day') {
      const d0 = new Date(); d0.setHours(0, 0, 0, 0);
      from = Math.floor(d0.getTime() / 60000); to = from + DAY;
    } else {
      const [bef, aft] = st.range.split(',').map(Number);
      from = Math.floor((nowMin - bef * 60) / 15) * 15; to = nowMin + aft * 60;
    }
    const ppm = st.zoom;
    const W = (to - from) * ppm;
    const x = (m) => (m - from) * ppm;
    const rgb = (c) => `rgb(${c.join(',')})`;
    const bgOf = (b) => (!b ? 'rgb(200,200,200)' : Array.isArray(b[0]) ? `linear-gradient(90deg, ${b.map(rgb).join(', ')})` : rgb(b));
    const ticks = [];
    for (let m = Math.ceil(from / 15) * 15; m <= to; m += 15) ticks.push(m);
    const shown = events.filter((ev) => match(ev) && !st.hidden.has(ev.key));
    const byCat = new Map();
    for (const ev of shown) { if (!byCat.has(ev.c)) byCat.set(ev.c, []); byCat.get(ev.c).push(ev); }
    let html = `<div class="evw-inner" style="width:${W + 210}px">
      <div class="evw-row evw-axis"><div class="evw-label"><span class="muted small">${new Date(nowMin * 60000).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' })}</span></div>
        <div class="evw-track" style="width:${W}px">${ticks.map((m) => `<span class="evw-tick ${m % 60 === 0 ? 'h' : ''}" style="left:${x(m)}px">${m % 30 === 0 ? fmt(m) : ''}</span>`).join('')}</div></div>`;
    for (const [cat, list] of byCat) {
      html += `<div class="evw-row evw-cat"><div class="evw-label">${esc(CAT_ES[cat] || cat)}</div><div class="evw-track" style="width:${W}px"></div></div>`;
      for (const ev of list) {
        const segs = segmentsBetween(ev, from, to);
        html += `<div class="evw-row"><div class="evw-label" title="${esc(ev.n)}">${esc(es(ev.n))}<button class="ev-hide" data-hide="${ev.key}" title="Ocultar esta fila">✕</button></div>
          <div class="evw-track" style="width:${W}px">${segs.map((seg) => {
            const g = ev.s[seg.r] || [];
            const name = g[0] || '';
            const l = Math.max(0, x(seg.start)), r = Math.min(W, x(seg.end));
            const on = seg.start <= nowMin && seg.end > nowMin;
            const past = seg.end <= nowMin;
            return `<span class="evw-seg ${on ? 'on' : ''} ${past ? 'past' : ''}" style="left:${l}px;width:${Math.max(0, r - l - 1)}px;background:${bgOf(g[3])}" title="${esc(es(name))}${es(name) !== name ? ` (${esc(name)})` : ''}\n${fmt(seg.start)} – ${fmt(seg.end)} · ${seg.end - seg.start} min${g[2] ? `\nWaypoint ${esc(g[2])} (clic para copiar)` : ''}" ${g[2] ? `data-copy="${esc(g[2])}"` : ''}><b>${esc(es(name))}</b><i>${fmt(seg.start)}</i></span>`;
          }).join('')}</div></div>`;
      }
    }
    html += `<span class="evw-now" style="left:${210 + x(nowMin)}px"><span>${fmt(nowMin)}</span></span></div>`;
    const tl = view.querySelector('#evTimeline');
    const keepScroll = tl.scrollLeft;
    tl.innerHTML = html;
    if (!tl.dataset.scrolled) { tl.scrollLeft = Math.max(0, x(nowMin) - 120); tl.dataset.scrolled = '1'; } else tl.scrollLeft = keepScroll;
    const hiddenList = events.filter((e) => st.hidden.has(e.key));
    view.querySelector('#evHiddenNote').innerHTML = hiddenList.length ? `Ocultos: ${hiddenList.map((e) => `<button class="btn ghost small" data-show="${e.key}">${esc(es(e.n))} ＋</button>`).join(' ')}` : '';
  }

  view.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-copy]');
    if (c) { try { await navigator.clipboard.writeText(c.dataset.copy); toast?.('Waypoint copiado: pegalo en el chat del juego'); } catch { toast?.(c.dataset.copy); } return; }
    const h = e.target.closest('[data-hide]');
    if (h) { st.hidden.add(h.dataset.hide); save(); paint(); return; }
    const s = e.target.closest('[data-show]');
    if (s) { st.hidden.delete(s.dataset.show); save(); paint(); }
  });
  view.querySelector('#evQ').addEventListener('input', (e) => { st.q = e.target.value; paint(); });
  view.querySelector('#evCat').addEventListener('change', (e) => { st.cat = e.target.value; save(); paint(); });
  view.querySelector('#evWin').addEventListener('change', (e) => { st.window = Number(e.target.value); save(); paint(); });
  const rangeSel = view.querySelector('#evRange'); rangeSel.value = st.range;
  const zoomSel = view.querySelector('#evZoom'); zoomSel.value = String(st.zoom);
  rangeSel.addEventListener('change', (e) => { st.range = e.target.value; save(); delete view.querySelector('#evTimeline').dataset.scrolled; paint(); });
  zoomSel.addEventListener('change', (e) => { st.zoom = Number(e.target.value); save(); delete view.querySelector('#evTimeline').dataset.scrolled; paint(); });
  paint();
  const timer = setInterval(() => { if (!view.querySelector('#evClock')) clearInterval(timer); else paint(); }, 15000);
  const clock = setInterval(() => { const el = view.querySelector('#evClock'); if (!el) clearInterval(clock); else el.textContent = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); }, 1000);
  return { refresh() {} };
}
