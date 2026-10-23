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
  const st = { cat: saved.cat || '', q: '', hidden: new Set(saved.hidden || [...HIDE_BY_DEFAULT]), window: saved.window || 180 };
  const save = () => { try { localStorage.setItem('gw2-eventos', JSON.stringify({ cat: st.cat, hidden: [...st.hidden], window: st.window })); } catch {} };

  view.innerHTML = `
    <div class="page-head"><div><h1>Eventos</h1><p>Metaeventos y jefes de mundo con sus horarios en <b>tu hora local</b>. Arriba, lo que está pasando y lo que empieza pronto; abajo, la línea de tiempo de cada mapa. Tocá un evento para copiar su waypoint o verlo en el mapa.</p></div>
      <div class="clock"><div class="muted small">Hora local</div><div id="evClock" class="num"></div><div class="muted small" id="evUtc"></div></div></div>
    <div class="filters">
      <input type="search" id="evQ" placeholder="Buscar evento o mapa… (ej: Tequatl, Octoparra, Arco del León)">
      <label>Expansión <select id="evCat"><option value="">Todas</option>${cats.map((c) => `<option value="${esc(c)}" ${st.cat === c ? 'selected' : ''}>${esc(CAT_ES[c] || c)}</option>`).join('')}</select></label>
      <label>Mostrar las próximas <select id="evWin">${[60, 120, 180, 360, 720].map((m) => `<option value="${m}" ${st.window === m ? 'selected' : ''}>${m / 60} h</option>`).join('')}</select></label>
    </div>
    <div class="section"><h3>Ahora y próximos</h3><div id="evNext"></div></div>
    <div class="section"><h3>Línea de tiempo <span class="muted small">(desde hace 30 min)</span></h3><div id="evTimeline" class="ev-timeline"></div>
      <p class="muted small" id="evHiddenNote"></p></div>
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

    // Línea de tiempo por grupo
    const from = nowMin - 30, to = nowMin + st.window;
    const pct = (m) => ((m - from) / (to - from)) * 100;
    const ticks = [];
    for (let m = Math.ceil(from / 30) * 30; m < to; m += 30) ticks.push(m);
    const shown = events.filter((ev) => match(ev) && !st.hidden.has(ev.key));
    view.querySelector('#evTimeline').innerHTML = `
      <div class="ev-row ev-axis"><div class="ev-label"></div><div class="ev-bar">${ticks.map((m) => `<span class="ev-tick" style="left:${pct(m)}%">${fmt(m)}</span>`).join('')}<span class="ev-now" style="left:${pct(nowMin)}%"></span></div></div>
      ${shown.map((ev) => `<div class="ev-row"><div class="ev-label" title="${esc(ev.n)}"><b>${esc(es(ev.n))}</b><span class="muted small">${esc(CAT_ES[ev.c] || ev.c)}</span><button class="ev-hide" data-hide="${ev.key}" title="Ocultar de la línea de tiempo">✕</button></div>
        <div class="ev-bar">${segmentsBetween(ev, from, to).map((seg) => {
          const name = ev.s[seg.r]?.[0] || '';
          const l = Math.max(0, pct(seg.start)), r = Math.min(100, pct(seg.end));
          const { chat } = where(ev, seg);
          return `<span class="ev-seg ev-c${seg.r % 6} ${seg.start <= nowMin && seg.end > nowMin ? 'on' : ''}" style="left:${l}%;width:${r - l}%" title="${esc(es(name))} (${esc(name)}) · ${fmt(seg.start)}–${fmt(seg.end)}${chat ? ` · ${chat}` : ''}" ${chat ? `data-copy="${esc(chat)}"` : ''}>${esc(es(name))}</span>`;
        }).join('')}<span class="ev-now" style="left:${pct(nowMin)}%"></span></div></div>`).join('')}`;
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
  paint();
  const timer = setInterval(() => { if (!view.querySelector('#evClock')) clearInterval(timer); else paint(); }, 15000);
  const clock = setInterval(() => { const el = view.querySelector('#evClock'); if (!el) clearInterval(clock); else el.textContent = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); }, 1000);
  return { refresh() {} };
}
