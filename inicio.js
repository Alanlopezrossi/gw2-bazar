// Pestaña "Hoy": lo que conviene mirar al entrar al juego, todo en una pantalla.
// Eventos en curso y próximos, tus alarmas, tus favoritos con precio y, con API key, la Bóveda del Mago,
// lo que ya hiciste hoy y los logros que tenés casi terminados.
import { segmentsBetween, alarmList } from './alarmas.js';
import { NAME_ES } from './eventos.js';

const nf = (n) => Number(n || 0).toLocaleString('es-AR');
const fmt = (min) => new Date(min * 60000).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
const rel = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`);
const pretty = (id) => String(id).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export async function renderInicio(view, { api, esc, coin, itemCell }) {
  view.innerHTML = `<div class="page-head"><div><h1>Hoy</h1><p>Lo que está pasando en Tyria ahora, lo que empieza pronto y, si cargaste tu API key, lo que te queda por hacer hoy.</p></div>
      <div class="clock"><div class="muted small">Hora local</div><div id="hoClock" class="num"></div><div class="muted small" id="hoReset"></div></div></div>
    <div class="ho-grid">
      <section class="ho-card ho-wide"><h3>Eventos ahora y en las próximas 2 horas <a class="small" href="#/eventos">ver todos →</a></h3><div id="hoEv"><div class="skeleton"></div></div></section>
      <section class="ho-card"><h3>Bóveda del Mago</h3><div id="hoVault"><div class="skeleton"></div></div></section>
      <section class="ho-card"><h3>Hecho hoy</h3><div id="hoToday"><div class="skeleton"></div></div></section>
      <section class="ho-card"><h3>Tus alarmas</h3><div id="hoAl"></div></section>
      <section class="ho-card"><h3>Tus favoritos <a class="small" href="#/favoritos">ver →</a></h3><div id="hoFav"></div></section>
      <section class="ho-card ho-wide"><h3>Logros que tenés casi terminados <a class="small" href="#/logros">ver panel →</a></h3><div id="hoAch"><div class="skeleton"></div><p class="muted small">La primera vez tarda alrededor de un minuto en traer todos los logros; después queda guardado por 24 h.</p></div></section>
    </div>`;

  const tick = () => {
    const el = view.querySelector('#hoClock');
    if (!el) return false;
    el.textContent = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
    const now = new Date();
    const m = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now) / 60000);
    view.querySelector('#hoReset').textContent = `reinicio diario en ${rel(m)}`;
    return true;
  };
  tick();
  const clock = setInterval(() => { if (!tick()) clearInterval(clock); }, 20000);

  // Eventos
  (async () => {
    const box = view.querySelector('#hoEv');
    try {
      const { events } = await fetch('event-timers.json').then((r) => r.json());
      const HIDE = new Set(['core-dn', 'eod-dn', 'voe-dn', 'core-ateu', 'core-atna', 'festival-lc', 'festival-db', 'festival-ha']);
      const now = Math.floor(Date.now() / 60000);
      const rows = [];
      for (const [key, ev] of Object.entries(events)) {
        if (HIDE.has(key)) continue;
        for (const sg of segmentsBetween(ev, now, now + 120)) {
          const g = ev.s[sg.r] || [];
          if (!g[0]) continue;
          rows.push({ key, ev, sg, g, live: sg.start <= now });
        }
      }
      let labels = null;
      try { labels = (await api('/api/vendors')).labels; } catch {}
      const mapEs = new Map((labels?.maps || []).map((m) => [m.en.toLowerCase(), m.es]));
      const es = (t) => NAME_ES[t] || mapEs.get(String(t || '').toLowerCase()) || t;
      rows.sort((a, b) => a.sg.start - b.sg.start);
      const li = (r) => `<li class="${r.live ? 'live' : ''}">
          <span class="ho-when">${r.live ? `<b class="pill good">EN CURSO</b> quedan ${rel(r.sg.end - now)}` : `<b>${fmt(r.sg.start)}</b> <span class="muted">en ${rel(r.sg.start - now)}</span>`}</span>
          <span class="ho-what"><b>${esc(es(r.g[0]))}</b> <span class="muted small">· ${esc(es(r.ev.n))}</span></span>
          ${r.g[2] ? `<button class="btn ghost small" data-copy="${esc(r.g[2])}" title="Copiar waypoint">${esc(r.g[2])}</button>` : ''}</li>`;
      const live = rows.filter((r) => r.live).sort((a, b) => a.sg.end - b.sg.end);
      const next = rows.filter((r) => !r.live);
      box.innerHTML = rows.length ? `<div class="ho-cols"><div><h4>En curso (${live.length})</h4><ul class="ho-ev">${live.map(li).join('') || '<li class="muted">Nada.</li>'}</ul></div>
        <div><h4>Empiezan pronto</h4><ul class="ho-ev">${next.slice(0, 14).map(li).join('') || '<li class="muted">Nada en las próximas 2 horas.</li>'}</ul></div></div>` : '<p class="muted">Nada en las próximas 2 horas.</p>';
    } catch (e) { box.innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
  })();

  view.addEventListener('click', async (e) => { const c = e.target.closest('[data-copy]'); if (!c) return; try { await navigator.clipboard.writeText(c.dataset.copy); c.textContent = '✔ copiado'; } catch {} });

  // Alarmas y favoritos (de este navegador)
  const al = alarmList();
  view.querySelector('#hoAl').innerHTML = al.length ? `<ul class="ho-list">${al.map((a) => `<li>🔔 ${esc(a.name)} <span class="muted small">· ${esc(a.map)}</span></li>`).join('')}</ul>` : '<p class="muted small">No tenés alarmas. Ponelas tocando 🔕 en <a href="#/eventos">Eventos</a>.</p>';
  (async () => {
    const box = view.querySelector('#hoFav');
    let favs = [];
    try { favs = JSON.parse(localStorage.getItem('gw2-bazar-favs') || '[]'); } catch {}
    if (!favs.length) { box.innerHTML = '<p class="muted small">Marcá items con ☆ en su ficha y los ves acá con su precio.</p>'; return; }
    const rows = await api(`/api/items/by-ids?ids=${favs.slice(0, 8).map((f) => f.id).join(',')}`).catch(() => []);
    const by = new Map(rows.map((r) => [r.id, r]));
    box.innerHTML = `<ul class="ho-list">${favs.slice(0, 8).map((f) => { const r = by.get(f.id) || {}; return `<li><a href="#/item/${f.id}">${f.icon ? `<img src="${esc(f.icon)}" alt="" class="ic16"> ` : ''}${esc(r.name || f.name)}</a> <span class="ho-price">${r.sell ? coin(r.sell) : '—'}${r.change24 != null ? ` <span class="${r.change24 > 0 ? 'good-t' : r.change24 < 0 ? 'warn-t' : 'muted'} small">${r.change24 > 0 ? '+' : ''}${(r.change24 * 100).toFixed(1)}%</span>` : ''}</span></li>`; }).join('')}</ul>`;
  })();

  // Con cuenta
  const noKey = '<p class="muted small">Cargá tu API key en <a href="#/cuenta">Mi cuenta</a> para ver esto.</p>';
  let acc = null;
  try { acc = await api('/api/account/progress'); } catch { acc = null; }
  if (!view.querySelector('#hoVault')) return;
  if (!acc) {
    view.querySelector('#hoVault').innerHTML = noKey;
    view.querySelector('#hoToday').innerHTML = noKey;
    view.querySelector('#hoAch').innerHTML = noKey;
    return;
  }
  const vault = (v, t) => (v ? `<h4>${t} <span class="muted small">${nf(v.meta_progress_current)}/${nf(v.meta_progress_complete)}</span></h4><ul class="ho-list">${(v.objectives || []).map((o) => { const ok = o.progress_current >= o.progress_complete; return `<li class="${ok ? 'done' : ''}">${ok ? '✔' : '○'} ${esc(o.title)} <span class="muted small">${nf(o.progress_current)}/${nf(o.progress_complete)}</span></li>`; }).join('')}</ul>` : '');
  view.querySelector('#hoVault').innerHTML = vault(acc.vaultDaily, 'Diarias') + vault(acc.vaultWeekly, 'Semanales') || '<p class="muted small">Sin datos (la key necesita el permiso «progression»).</p>';
  const chips = (l, empty) => (l?.length ? `<ul class="lp-chips">${l.map((x) => `<li>✔ ${esc(pretty(x))}</li>`).join('')}</ul>` : `<p class="muted small">${empty}</p>`);
  view.querySelector('#hoToday').innerHTML = `<h4>Jefes de mundo</h4>${chips(acc.worldbosses, 'Ninguno todavía.')}<h4>Cofres de metaevento</h4>${chips(acc.mapchests, 'Ninguno todavía.')}<h4>Crafteos diarios</h4>${chips(acc.dailycrafting, 'Ninguno todavía.')}`;
  // Logros casi terminados (usa la copia de logros guardada por 24 h)
  try {
    const L = await import('./logros.js');
    const [P, all] = await Promise.all([L.progress(api), L.loadAll()]);
    const near = all.filter((a) => { const p = P.get(a.id); return p && !p.done && !(a.flags || []).some((f) => /Daily|Weekly|Monthly|Repeatable/.test(f)) && (p.current || 0) / (p.max || L.goal(a) || 1) >= 0.75; })
      .map((a) => ({ a, p: P.get(a.id) })).sort((x, y) => (y.p.current / (y.p.max || 1)) - (x.p.current / (x.p.max || 1))).slice(0, 10);
    const box = view.querySelector('#hoAch');
    if (box) box.innerHTML = near.length ? `<ul class="ho-list ho-ach">${near.map(({ a, p }) => `<li><a href="#/logro/${a.id}">${esc(a.name)}</a>${(a.rewards || []).some((r) => r.type === 'Mastery') ? ' <span class="pill">dominio</span>' : ''} <span class="muted small">${nf(p.current)}/${nf(p.max || L.goal(a))}</span><div class="lp-bar"><i style="width:${Math.round((p.current / (p.max || 1)) * 100)}%"></i></div></li>`).join('')}</ul>` : '<p class="muted small">No tenés logros al 75% o más.</p>';
  } catch (e) { const box = view.querySelector('#hoAch'); if (box) box.innerHTML = `<p class="muted small">${esc(e.message)}</p>`; }
}
