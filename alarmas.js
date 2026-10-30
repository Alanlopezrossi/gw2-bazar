// Alarmas de eventos: elegís un evento (🔔) y la página te avisa con un sonido suave cuando está por empezar,
// con un cartel flotante para apagarla. Todo queda en este navegador (localStorage); funciona mientras la página
// del Bazar esté abierta (aunque sea en otra pestaña o minimizada).
const KEY = 'gw2-alarmas';
const FIRED = 'gw2-alarmas-fired';
const DAY = 1440;

/** Segmentos con contenido de un evento entre [desde, hasta) en minutos desde 1970 (UTC). */
export function segmentsBetween(ev, fromMin, toMin) {
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
  out.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const s of out) {
    const last = merged[merged.length - 1];
    if (last && last.r === s.r && last.end === s.start && s.start % DAY === 0) last.end = s.end;
    else merged.push({ ...s });
  }
  return merged;
}

// ---------- configuración guardada ----------
const DEFAULT = { list: {}, lead: 5, vol: 0.5, sound: 'campanita', notif: false };
function load() { try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULT }; } }
let CFG = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(CFG)); } catch {} listeners.forEach((f) => f()); }
const listeners = new Set();
export function onAlarmsChange(f) { listeners.add(f); return () => listeners.delete(f); }
export const alarmId = (evKey, r) => `${evKey}|${r}`;
export function hasAlarm(id) { return !!CFG.list[id]; }
export function alarmList() { return Object.entries(CFG.list).map(([id, a]) => ({ id, ...a })); }
export function alarmSettings() { return { lead: CFG.lead, vol: CFG.vol, sound: CFG.sound, notif: CFG.notif }; }
export function setAlarmSettings(p) { CFG = { ...CFG, ...p }; save(); }
/** Prende o apaga la alarma de un evento. rec = { ev, r, name, map, chat }. Devuelve true si quedó prendida. */
export function toggleAlarm(rec) {
  const id = alarmId(rec.ev, rec.r);
  if (CFG.list[id]) delete CFG.list[id];
  else CFG.list[id] = { ev: rec.ev, r: rec.r, name: rec.name, map: rec.map || '', chat: rec.chat || '' };
  save();
  unlockAudio();
  return !!CFG.list[id];
}
export function removeAlarm(id) { delete CFG.list[id]; save(); }

// ---------- sonido (WebAudio, sin archivos) ----------
let ctx = null;
function unlockAudio() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* sin audio */ }
}
// Notas suaves (Hz) y cómo suenan: campanita (arpegio mayor), gong suave (grave y largo), gotas (dos notas cortas).
const SOUNDS = {
  campanita: { label: 'Campanita', notes: [[880, 0], [1108.7, 0.16], [1318.5, 0.32]], decay: 1.4, type: 'sine' },
  gong: { label: 'Gong suave', notes: [[220, 0], [330, 0.02]], decay: 2.6, type: 'sine' },
  gotas: { label: 'Gotas', notes: [[1046.5, 0], [1568, 0.22]], decay: 0.6, type: 'triangle' },
  marimba: { label: 'Marimba', notes: [[523.3, 0], [659.3, 0.14], [784, 0.28], [1046.5, 0.42]], decay: 0.9, type: 'sine' },
};
export const SOUND_NAMES = Object.entries(SOUNDS).map(([k, s]) => [k, s.label]);
export function playChime(kind = CFG.sound, vol = CFG.vol) {
  unlockAudio();
  if (!ctx) return;
  const s = SOUNDS[kind] || SOUNDS.campanita;
  const t0 = ctx.currentTime + 0.05;
  const master = ctx.createGain();
  master.gain.value = Math.max(0, Math.min(1, vol)) * 0.35;
  master.connect(ctx.destination);
  for (const [f, dt] of s.notes) {
    for (const [mult, amp] of [[1, 1], [2, 0.18], [3, 0.06]]) { // fundamental + armónicos suaves (timbre de campana)
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = s.type;
      o.frequency.value = f * mult;
      g.gain.setValueAtTime(0.0001, t0 + dt);
      g.gain.exponentialRampToValueAtTime(amp, t0 + dt + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + s.decay / mult);
      o.connect(g); g.connect(master);
      o.start(t0 + dt);
      o.stop(t0 + dt + s.decay + 0.1);
    }
  }
}

// ---------- motor: revisa cada pocos segundos ----------
let EVENTS = null;
let fired = {};
try { fired = JSON.parse(localStorage.getItem(FIRED) || '{}'); } catch {}
const ringing = new Map(); // key -> { a, start, loop }
let esc = (s) => String(s);
let titleTimer = null, baseTitle = '';

export async function initAlarms(opts = {}) {
  if (opts.esc) esc = opts.esc;
  // El navegador sólo deja sonar audio después de que tocaste algo en la página.
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, unlockAudio, { passive: true });
  try { EVENTS = (await fetch('event-timers.json').then((r) => r.json())).events; } catch { return; }
  tick();
  setInterval(tick, 10000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
}

const fmt = (min) => new Date(min * 60000).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });

function tick() {
  if (!EVENTS) return;
  const now = Date.now() / 60000;
  const nowMin = Math.floor(now);
  let changed = false;
  for (const [k, t] of Object.entries(fired)) if (t < nowMin - 180) { delete fired[k]; changed = true; }
  for (const [id, a] of Object.entries(CFG.list)) {
    const ev = EVENTS[a.ev];
    if (!ev) continue;
    for (const seg of segmentsBetween(ev, nowMin - 3, nowMin + CFG.lead + 2)) {
      if (seg.r !== a.r) continue;
      const key = `${id}@${seg.start}`;
      if (fired[key]) continue;
      // Suena desde "lead" minutos antes hasta 2 minutos después de empezar (por si la pestaña estaba dormida).
      if (now >= seg.start - CFG.lead && now <= seg.start + 2) {
        fired[key] = seg.start; changed = true;
        ring(key, a, seg);
      }
    }
  }
  if (changed) { try { localStorage.setItem(FIRED, JSON.stringify(fired)); } catch {} }
  paintRinging();
}

function ring(key, a, seg) {
  playChime();
  // Repite el sonido cada 8 segundos hasta que la apagues (máximo 3 minutos).
  const startedAt = Date.now();
  const loop = setInterval(() => { if (Date.now() - startedAt > 180000) { clearInterval(loop); const r = ringing.get(key); if (r) r.quiet = true; paintRinging(); return; } playChime(); }, 8000);
  ringing.set(key, { a, start: seg.start, end: seg.end, loop });
  if (CFG.notif && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const mins = Math.round(seg.start - Date.now() / 60000);
      const n = new Notification(`🔔 ${a.name}`, { body: `${mins > 0 ? `Empieza en ${mins} min` : 'Ya empezó'} (${fmt(seg.start)})${a.map ? ` · ${a.map}` : ''}${a.chat ? `\nWaypoint: ${a.chat}` : ''}`, tag: key, requireInteraction: true, silent: true });
      n.onclick = () => { window.focus(); n.close(); };
    } catch {}
  }
  if (!titleTimer) {
    baseTitle = document.title;
    let on = false;
    titleTimer = setInterval(() => { on = !on; document.title = on ? `🔔 ${a.name}` : baseTitle; }, 1200);
  }
}

function stop(key) {
  const r = ringing.get(key);
  if (r) clearInterval(r.loop);
  ringing.delete(key);
  if (!ringing.size && titleTimer) { clearInterval(titleTimer); titleTimer = null; document.title = baseTitle || document.title; }
  paintRinging();
}

/** Cartel flotante (abajo a la derecha) con cada alarma sonando. */
function paintRinging() {
  let box = document.getElementById('alarmFloat');
  if (!ringing.size) { box?.remove(); return; }
  if (!box) {
    box = document.createElement('div');
    box.id = 'alarmFloat';
    box.className = 'alarm-float';
    document.body.appendChild(box);
    box.addEventListener('click', async (e) => {
      const off = e.target.closest('[data-aoff]');
      if (off) { stop(off.dataset.aoff); return; }
      if (e.target.closest('[data-aall]')) { [...ringing.keys()].forEach(stop); return; }
      const cp = e.target.closest('[data-acopy]');
      if (cp) { try { await navigator.clipboard.writeText(cp.dataset.acopy); cp.textContent = '✔ copiado'; } catch {} }
    });
  }
  const now = Date.now() / 60000;
  box.innerHTML = `${[...ringing.entries()].map(([k, r]) => {
    const m = Math.ceil(r.start - now);
    const when = m > 0 ? `empieza en <b>${m} min</b> (${fmt(r.start)})` : now < r.end ? `<b>¡ya empezó!</b> (${fmt(r.start)})` : 'ya terminó';
    return `<div class="alarm-card">
      <div class="alarm-ic">🔔</div>
      <div class="alarm-body"><b>${esc(r.a.name)}</b>${r.a.map ? `<div class="small muted">${esc(r.a.map)}</div>` : ''}<div class="small">${when}</div>
        <div class="alarm-actions">${r.a.chat ? `<button class="btn ghost small" data-acopy="${esc(r.a.chat)}" title="Copiar el waypoint para pegarlo en el chat del juego">📋 Waypoint</button>` : ''}
        <button class="btn small" data-aoff="${esc(k)}">✔ Entendido, apagar</button></div></div>
    </div>`;
  }).join('')}${ringing.size > 1 ? '<button class="btn ghost small alarm-all" data-aall>Apagar todas</button>' : ''}`;
}

/** Pide permiso para mostrar también una notificación de Windows. */
export async function askNotifications() {
  if (!('Notification' in window)) return false;
  const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  setAlarmSettings({ notif: p === 'granted' });
  return p === 'granted';
}
/** Para probar: hace sonar y muestra el cartel ya mismo. */
export function testAlarm() {
  const now = Math.floor(Date.now() / 60000);
  ring(`test@${Date.now()}`, { name: 'Prueba de alarma', map: 'Así se ve y suena el aviso', chat: '' }, { start: now + CFG.lead, end: now + CFG.lead + 15 });
  paintRinging();
}
