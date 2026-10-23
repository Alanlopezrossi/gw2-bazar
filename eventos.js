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

/** Todos los tramos (también los vacíos) que tocan [desde, hasta). */
function segmentsAll(ev, fromMin, toMin) {
  const out = [];
  for (let day = Math.floor(fromMin / DAY) - 1; day <= Math.floor(toMin / DAY) + 1; day++) {
    let t = day * DAY;
    const end = t + DAY;
    const push = (r, d) => { if (t + d > fromMin && t < toMin) out.push({ r, start: t, end: t + d }); t += d; };
    for (const [r, d] of ev.p) { if (t >= end) break; push(r, Math.min(d, end - t)); }
    if (ev.q.length) while (t < end) for (const [r, d] of ev.q) { if (t >= end) break; push(r, Math.min(d, end - t)); }
  }
  out.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const sg of out) {
    const last = merged[merged.length - 1];
    if (last && last.r === sg.r && last.end === sg.start && (sg.start % DAY === 0 || sg.r === 0)) last.end = sg.end;
    else merged.push({ ...sg });
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
  const st = { cat: saved.cat || '', q: '', hidden: new Set(saved.hidden || [...HIDE_BY_DEFAULT]), window: saved.window || 180, range: ['2', '4', '8'].includes(saved.range) ? saved.range : '2', top: !!saved.top };
  const save = () => { try { localStorage.setItem('gw2-eventos', JSON.stringify({ cat: st.cat, hidden: [...st.hidden], window: st.window, range: st.range, top: st.top })); } catch {} };

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
        <label>Mostrar <select id="evRange"><option value="2">las próximas 2 horas</option><option value="4">las próximas 4 horas</option><option value="8">las próximas 8 horas</option></select></label>
        <label><input type="checkbox" id="evTop"> Horas arriba (en vez de en cada evento)</label>
      </div>
      <div id="evTimeline" class="evt-wrapper"></div>
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

    // Formato de la wiki: título de cada evento arriba y una barra a todo el ancho con los segmentos seguidos
    // (hora en negrita, nombre y waypoint). Ventana: desde 15 min antes hasta las próximas N horas (+15 min de margen).
    const H = Number(st.range) * 60;
    const from = Math.floor((nowMin - 15) / 15) * 15;
    const to = nowMin + H + 15;
    const span = to - from;
    const pctOf = (m) => ((m - from) / span) * 100;
    const limit = nowMin + H;
    const rgb = (c) => `rgb(${c.join(',')})`;
    const bgOf = (b) => (!b ? '#EED' : Array.isArray(b[0]) ? `linear-gradient(90deg, ${b.map(rgb).join(', ')})` : rgb(b));
    const shown = events.filter((ev) => match(ev) && !st.hidden.has(ev.key));
    const byCat = new Map();
    for (const ev of shown) { if (!byCat.has(ev.c)) byCat.set(ev.c, []); byCat.get(ev.c).push(ev); }
    // Barra con todos los tramos (incluidos los vacíos, que van rayados) recortada a la ventana.
    const bar = (ev) => {
      const parts = [];
      const steps = segmentsAll(ev, from, to);
      for (const sg of steps) {
        const l = Math.max(sg.start, from), r = Math.min(sg.end, to);
        if (r <= l) continue;
        const g = ev.s[sg.r] || [];
        const name = g[0] || '';
        const w = ((r - l) / span) * 100;
        const cls = ['evt-seg', sg.r ? '' : 'evt-empty', sg.start >= limit ? 'future' : '', sg.start <= nowMin && sg.end > nowMin && sg.r ? 'on' : ''].join(' ');
        parts.push(`<div class="${cls}" style="width:${w}%;${sg.r ? `background:${bgOf(g[3])}` : ''}" ${sg.r ? `title="${esc(es(name))}${es(name) !== name ? ` (${esc(name)})` : ''} · ${fmt(sg.start)}–${fmt(sg.end)} (${sg.end - sg.start} min)${g[2] ? ` · ${esc(g[2])}` : ''}"` : ''}>${sg.r ? `<span class="evt-time">${fmt(sg.start)}</span><span class="evt-name">${g[1] ? `<a target="_blank" rel="noopener" href="https://wiki.guildwars2.com/wiki/${encodeURIComponent(g[1].replace(/ /g, '_'))}">${esc(es(name))}</a>` : esc(es(name))}</span>${g[2] ? `<span class="evt-chat" data-copy="${esc(g[2])}" title="Copiar waypoint">${esc(g[2])}</span>` : ''}` : ''}</div>`);
      }
      return parts.join('');
    };
    let html = `<div class="evt-pointer" style="left:${pctOf(nowMin)}%"><span>${fmt(nowMin)}</span></div>
      <div class="evt-limit" style="left:${pctOf(limit)}%"><span>Próximas ${st.range} h</span></div>`;
    if (st.top) {
      const ticks = [];
      for (let m = Math.ceil(from / 30) * 30; m < to; m += 30) ticks.push(m);
      html += `<div class="evt-toptimes">${ticks.map((m) => `<span style="left:${pctOf(m)}%">${fmt(m)}</span>`).join('')}</div>`;
    }
    for (const [cat, list] of byCat) {
      html += `<div class="evt-cat"><h3>${esc(CAT_ES[cat] || cat)}</h3>`;
      for (const ev of list) {
        html += `<div class="evt-container"><h4 title="${esc(ev.n)}">${esc(es(ev.n))}</h4><div class="evt-bar ${st.top ? 'notimes' : ''}">${bar(ev)}<span class="evt-exit" data-hide="${ev.key}" title="Ocultar">✕</span></div></div>`;
      }
      html += '</div>';
    }
    view.querySelector('#evTimeline').innerHTML = html;
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
  const topChk = view.querySelector('#evTop'); topChk.checked = st.top;
  rangeSel.addEventListener('change', (e) => { st.range = e.target.value; save(); paint(); });
  topChk.addEventListener('change', (e) => { st.top = e.target.checked; save(); paint(); });
  paint();
  const timer = setInterval(() => { if (!view.querySelector('#evClock')) clearInterval(timer); else paint(); }, 15000);
  const clock = setInterval(() => { const el = view.querySelector('#evClock'); if (!el) clearInterval(clock); else el.textContent = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); }, 1000);
  return { refresh() {} };
}
