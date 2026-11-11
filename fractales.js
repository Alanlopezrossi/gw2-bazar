// Pestaña "Fractales": todo lo de Fractales de la Niebla en un lugar.
// Diarias de hoy y mañana (API oficial), tu nivel y tus reliquias (con API key), las 100 escalas con su
// resistencia a la agonía, los 25 fractales, inestabilidades, modos desafío, recompensas, vendedores,
// dominios, Quickplay e Incursión fractal. Datos fijos sacados de la wiki oficial (noviembre 2026).
import { specialHTML } from './eventos.js';

const API = () => `${globalThis.GW2_API_BASE || 'https://api.guildwars2.com'}/v2`;
const getJSON = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); };
const nf = (n) => Number(n || 0).toLocaleString('es-AR');
const WIKI = (t) => `https://wiki.guildwars2.com/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}`;

// Escala → [fractal, resistencia a la agonía necesaria] (tabla "Fractal levels" de la wiki).
const SCALES = [null,
  ['Volcanic', 0], ['Uncategorized', 0], ['Snowblind', 0], ['Urban Battleground', 0], ['Swampland', 0],
  ['Cliffside', 0], ['Aquatic Ruins', 0], ['Underground Facility', 0], ['Molten Furnace', 0], ['Molten Boss', 0],
  ['Deepstone', 0], ["Siren's Reef", 0], ['Chaos', 0], ['Aetherblade', 0], ['Thaumanova Reactor', 0],
  ['Twilight Oasis', 0], ['Kinfall', 0], ['Captain Mai Trin Boss', 0], ['Solitary Throne', 0], ['Solid Ocean', 8],
  ['Silent Surf', 10], ['Nightmare', 11], ['Shattered Observatory', 13], ['Sunqua Peak', 15], ['Lonely Tower', 17],
  ['Aquatic Ruins', 18], ['Snowblind', 20], ['Volcanic', 22], ['Underground Facility', 24], ['Chaos', 26],
  ['Urban Battleground', 27], ['Swampland', 29], ['Deepstone', 31], ['Thaumanova Reactor', 33], ['Solid Ocean', 34],
  ['Uncategorized', 36], ["Siren's Reef", 38], ['Kinfall', 40], ['Molten Furnace', 42], ['Molten Boss', 43],
  ['Twilight Oasis', 45], ['Captain Mai Trin Boss', 47], ['Silent Surf', 49], ['Solitary Throne', 50], ['Aetherblade', 52],
  ['Cliffside', 54], ['Nightmare', 56], ['Shattered Observatory', 58], ['Sunqua Peak', 59], ['Lonely Tower', 61],
  ['Snowblind', 63], ['Volcanic', 65], ['Underground Facility', 67], ["Siren's Reef", 68], ['Thaumanova Reactor', 70],
  ['Swampland', 72], ['Urban Battleground', 74], ['Molten Furnace', 75], ['Twilight Oasis', 77], ['Solid Ocean', 79],
  ['Aquatic Ruins', 81], ['Uncategorized', 83], ['Chaos', 84], ['Solitary Throne', 86], ['Aetherblade', 88],
  ['Silent Surf', 90], ['Deepstone', 91], ['Cliffside', 93], ['Molten Boss', 95], ['Kinfall', 97],
  ['Captain Mai Trin Boss', 99], ['Nightmare', 100], ['Shattered Observatory', 102], ['Sunqua Peak', 104], ['Lonely Tower', 106],
  ['Aquatic Ruins', 107], ['Swampland', 109], ["Siren's Reef", 111], ['Uncategorized', 113], ['Solid Ocean', 115],
  ['Underground Facility', 116], ['Thaumanova Reactor', 118], ['Molten Furnace', 120], ['Deepstone', 122], ['Urban Battleground', 123],
  ['Snowblind', 125], ['Twilight Oasis', 127], ['Chaos', 129], ['Molten Boss', 131], ['Captain Mai Trin Boss', 132],
  ['Volcanic', 134], ['Aetherblade', 136], ['Cliffside', 138], ['Solitary Throne', 139], ['Kinfall', 141],
  ['Nightmare', 143], ['Shattered Observatory', 145], ['Sunqua Peak', 147], ['Silent Surf', 148], ['Lonely Tower', 150],
];
// Modo desafío (Challenge Mote): escala en la que está disponible.
const CM = { Kinfall: 95, Nightmare: 96, 'Shattered Observatory': 97, 'Sunqua Peak': 98, 'Silent Surf': 99, 'Lonely Tower': 100 };
// Hora del día dentro del fractal (importa para sigilos como el de la noche).
const TIME = { 'Shattered Observatory': 'Día / ambos (cambia tras el primer jefe)', 'Sunqua Peak': 'Día / noche (en CM)', 'Snowblind': 'Noche', 'Solid Ocean': 'Noche', 'Swampland': 'Noche', 'Twilight Oasis': 'Noche', 'Underground Facility': 'Noche', 'Volcanic': 'Noche' };
const QUICKPLAY = new Set(['Aetherblade', 'Cliffside', 'Deepstone', 'Kinfall', 'Molten Boss', 'Molten Furnace', 'Snowblind', 'Uncategorized', 'Urban Battleground', 'Volcanic']);
// Fractales que dan encriptaciones extra (1 más por debajo de escala 40 y 2 más por encima).
const EXTRA_ENC = new Set(['Chaos', 'Nightmare', 'Deepstone']);

const TIERS = [
  { n: 1, name: 'Iniciado (Initiate)', from: 1, to: 25, unlock: 'Personaje nivel 80.' },
  { n: 2, name: 'Adepto (Adept)', from: 26, to: 50, unlock: 'Subiendo tu nivel personal de fractales.' },
  { n: 3, name: 'Experto (Expert)', from: 51, to: 75, unlock: 'Con nivel personal de fractales 46.' },
  { n: 4, name: 'Maestro (Master)', from: 76, to: 100, unlock: 'Subiendo tu nivel personal de fractales.' },
];
const tierOf = (s) => TIERS.find((t) => s >= t.from && s <= t.to);
const instabCount = (s) => (s >= 76 ? 3 : s >= 51 ? 2 : s >= 26 ? 1 : 0);
const relicsAt = (s) => (s <= 50 ? 5 + Math.floor((s - 1) / 5) : s <= 60 ? 15 : s <= 70 ? 16 : s <= 80 ? 17 : s <= 90 ? 18 : 19);
const encAt = (s, f) => (s <= 20 ? 2 : s <= 40 ? 3 : s <= 60 ? 4 : s <= 80 ? 5 : 6) + (EXTRA_ENC.has(f) ? (s < 40 ? 1 : 2) : 0);
const writsAt = (s) => (s <= 20 ? 2 : s <= 50 ? 4 : s <= 75 ? 8 : 12);

const INSTAB = [
  ['Adrenaline Rush', 'Enfurecidos y con poca vida, los enemigos hacen el doble de daño pero no pueden dar críticos. Sin enfurecer hacen 10% menos.'],
  ['Afflicted', 'Tu resistencia y resolución duran 33% más. Los enemigos aplican condiciones de daño al azar.'],
  ['Boon Overload', 'Cada bendición te baja 1,5% la vida máxima. Las bendiciones que das duran 20% más.'],
  ['Flux Bomb', 'Cada tanto te cae una bomba de flujo de la Anomalía; afecta a aliados y enemigos, y a los enemigos parados encima les pone condiciones.'],
  ['Fractal Vindicators', 'Los Vengadores fractales se reemplazan por Vindicadores, más fuertes.'],
  ['Frailty', 'Los jugadores son más chicos, reciben 10% más daño pero se mueven 25% más rápido.'],
  ['Hamstrung', 'Con poca vida te movés más lento (hasta 33%). El aguante se regenera 33% más rápido.'],
  ['Last Laugh', 'Los enemigos explotan al morir si no están aturdidos. Aturdidos, les dan protección, regeneración y estabilidad a sus aliados.'],
  ['Mists Convergence', 'Los fractales se mezclan: aparecen enemigos de otros fractales.'],
  ['No Pain, No Gain', 'Los enemigos ganan bendiciones al recibir golpes. Si les sacás una, se la pasás a tus aliados (cada 20 s).'],
  ['Outflanked', 'Recibís el doble de daño por la espalda si hay aliados cerca; los enemigos comunes, el doble por la espalda o el costado.'],
  ['Social Awkwardness', 'Los jugadores se empujan entre sí. La estabilidad lo anula.'],
  ['Stick Together', 'Recibís 25% más daño si no tenés un aliado a 300 de distancia; con un aliado cerca hacés 5% más.'],
  ['Sugar Rush', 'Vos y los enemigos (élite o menos) se mueven y atacan más rápido (15% y 25%); los enemigos critican 25% menos.'],
  ['Toxic Sickness', 'Cada tanto alguien del grupo vomita: lo que toca queda debilitado y con condiciones.'],
  ['Toxic Trail', 'Los enemigos dejan un rastro de veneno. Bloquear el ataque lo absorbe y limpia el veneno.'],
  ['Vengeance', 'Al morir, los enemigos les dan bendiciones a los de al lado. Sacarles una bendición los debilita y daña a los cercanos.'],
];

const MASTERY = [
  ['Follows Advice', 1, '635.000', 'Más logros diarios y acceso a vendedores especiales en el Observatorio de Mistlock.'],
  ['Agony Channeler', 2, '1.270.000', 'Mejores recompensas cuanto más agonía aguantás, recetas de la Forja para más ranuras de infusión en anillos ascendidos y pociones de la Niebla con atributos extra.'],
  ['Recursive Resourcing', 3, '2.222.500', 'Recompensas extra de los Cofres de la Niebla y de las Encriptaciones abiertas; mejor conversión de pociones.'],
  ['Mistlock Singularities', 5, '3.175.000', 'Activa las Singularidades de Mistlock (buff diario en el vestíbulo) y mejora aún más la conversión de pociones.'],
];

export async function renderFractales(view, { api, esc }) {
  const tabs = [['hoy', 'Hoy'], ['escalas', 'Escalas'], ['fractales', 'Fractales'], ['inest', 'Inestabilidades'], ['recomp', 'Recompensas y vendedores'], ['prog', 'Progreso y agonía'], ['cm', 'Modo desafío'], ['quick', 'Quickplay e Incursión']];
  let tab = 'hoy';
  try { tab = localStorage.getItem('gw2-fr-tab') || 'hoy'; } catch {}
  view.innerHTML = `<div class="page-head"><div><h1>Fractales</h1><p>Fractales de la Niebla: las diarias de hoy, las 100 escalas con la resistencia a la agonía que piden, inestabilidades, modos desafío, recompensas, vendedores y cómo progresar. <a href="#/cuenta">Con tu API key</a> ves tu nivel, tus reliquias y qué diarias ya hiciste.</p></div></div>
    ${specialHTML(esc)}
    <div id="frAcc"></div>
    <nav class="fr-tabs">${tabs.map(([k, l]) => `<button class="chip-btn" data-t="${k}" aria-pressed="${k === tab}">${l}</button>`).join('')}</nav>
    <div id="frOut"></div>`;

  // ---- Datos de la cuenta (opcionales) ----
  const acc = { level: null, wallet: null, done: new Set(), attune: null };
  const accP = (async () => {
    try {
      const [prog, wal, ach] = await Promise.all([
        api('/api/account/progress').catch(() => null),
        api('/api/account/wallet').catch(() => null),
        api('/api/account/achievements').catch(() => null),
      ]);
      if (prog?.account) acc.level = prog.account.fractal_level ?? null;
      if (wal?.wallet) acc.wallet = new Map(wal.wallet.map((w) => [w.id, w.value]));
      if (ach?.progress) for (const p of ach.progress) if (p.done) acc.done.add(p.id);
      if (prog?.masteries?.length) {
        try {
          const ms = await getJSON(`${API()}/masteries?ids=all&lang=en`);
          const fa = ms.find((m) => /fractal attunement/i.test(m.name));
          const mine = fa && prog.masteries.find((m) => m.id === fa.id);
          acc.attune = fa ? (mine ? mine.level + 1 : 0) : null;
        } catch {}
      }
    } catch {}
    paintAcc();
  })();

  async function paintAcc() {
    const box = view.querySelector('#frAcc');
    if (!box) return;
    if (acc.level == null && !acc.wallet) { box.innerHTML = ''; return; }
    let cur = [];
    if (acc.wallet) {
      try {
        const WANT = ['Fractal Relic', 'Pristine Fractal Relic', 'Unstable Fractal Essence', 'Fractalline Dust'];
        const en = await getJSON(`${API()}/currencies?ids=all&lang=en`);
        const ids = WANT.map((n) => en.find((c) => c.name === n)?.id).filter(Boolean);
        const meta = ids.length ? await getJSON(`${API()}/currencies?lang=es&ids=${ids.join(',')}`) : [];
        cur = ids.map((id) => meta.find((c) => c.id === id)).filter(Boolean).map((c) => ({ ...c, value: acc.wallet.get(c.id) || 0 }));
      } catch {}
    }
    const t = acc.level != null ? tierOf(Math.max(1, Math.min(100, acc.level))) : null;
    box.innerHTML = `<div class="cards fr-acc">
      ${acc.level != null ? `<div class="card"><div class="k">Tu nivel de fractales</div><div class="v num">${acc.level}</div><div class="h">${t ? `Tier ${t.n} · ${esc(t.name)}` : ''}${acc.level < 100 ? ` · para subir completá un fractal de escala ${acc.level + 1} o más` : ''}</div></div>` : ''}
      ${acc.attune != null ? `<div class="card"><div class="k">Dominio Sintonía fractal</div><div class="v num">${acc.attune}/4</div><div class="h">${acc.attune < 4 ? `Te falta: ${esc(MASTERY.slice(acc.attune).map((m) => m[0]).join(', '))}` : 'Completo'}</div></div>` : ''}
      ${cur.map((c) => `<a class="card" href="#/moneda/${c.id}"><div class="k"><img src="${esc(c.icon)}" alt="" class="ic16"> ${esc(c.name)}</div><div class="v num">${nf(c.value)}</div></a>`).join('')}
    </div>`;
  }

  // ---- Diarias de la API (categoría «Daily Fractals») ----
  let dailies = null;
  async function loadDailies() {
    if (dailies) return dailies;
    try {
      const cat = await getJSON(`${API()}/achievements/categories/88?lang=es`);
      const today = (cat.achievements || []).map((a) => (typeof a === 'object' ? a.id : a));
      const tomorrow = (cat.tomorrow || []).map((a) => (typeof a === 'object' ? a.id : a));
      const all = [...new Set([...today, ...tomorrow])];
      const defs = all.length ? await getJSON(`${API()}/achievements?lang=es&ids=${all.join(',')}`) : [];
      const by = new Map(defs.map((d) => [d.id, d]));
      dailies = { today: today.map((id) => by.get(id)).filter(Boolean), tomorrow: tomorrow.map((id) => by.get(id)).filter(Boolean), icon: cat.icon };
    } catch (e) { dailies = { error: e.message, today: [], tomorrow: [] }; }
    return dailies;
  }
  // "Fractal recomendado: escala 34" → 34. "Fractal diario de nivel 4: Chaos" → fractal.
  const scaleIn = (name) => Number((name.match(/(\d{1,3})\s*$/) || name.match(/escala\s*(\d{1,3})/i) || [])[1] || 0);
  const fractalIn = (name) => { const n = name.toLowerCase(); return [...new Set(SCALES.slice(1).map((x) => x[0]))].find((f) => n.includes(f.toLowerCase().replace(' boss', ''))) || ''; };

  function dailyList(list) {
    if (!list.length) return '<p class="muted small">La API no devolvió diarias para este día.</p>';
    return `<ul class="fr-daily">${list.map((a) => {
      const s = scaleIn(a.name), f = s ? SCALES[s]?.[0] : fractalIn(a.name);
      const done = acc.done.has(a.id);
      return `<li class="${done ? 'done' : ''}"><a href="#/logro/${a.id}">${esc(a.name)}</a>${done ? ' <span class="pill good">hecha</span>' : ''}
        ${s && SCALES[s] ? `<div class="small muted">Escala ${s}: <b>${esc(SCALES[s][0])}</b> · agonía ${SCALES[s][1]} · ${instabCount(s)} inestabilidad${instabCount(s) === 1 ? '' : 'es'}</div>` : f ? `<div class="small muted">${esc(f)} · escalas ${SCALES.map((x, i) => (x && x[0] === f ? i : null)).filter(Boolean).join(', ')}</div>` : ''}</li>`;
    }).join('')}</ul>`;
  }

  async function paintHoy(out) {
    out.innerHTML = '<div class="skeleton"></div>';
    const d = await loadDailies();
    await accP;
    if (!view.querySelector('#frOut') || tab !== 'hoy') return;
    out.innerHTML = `<div class="ho-grid">
      <section class="ho-card"><h3>Diarias de hoy</h3>${d.error ? `<p class="muted small">No pude leer las diarias de la API (${esc(d.error)}).</p>` : dailyList(d.today)}
        <p class="muted small">Cambian a las 21:00 (hora argentina), con el reinicio diario. Cada cofre diario trae una Reliquia fractal prístina e infusiones +1 de agonía. Las diarias de cada tier y las recomendadas siguen una rotación de 15 días.</p></section>
      <section class="ho-card"><h3>Mañana</h3>${d.error ? '' : dailyList(d.tomorrow)}</section>
      <section class="ho-card ho-wide"><h3>Cómo aprovechar el día</h3><ul class="como-ul">
        <li>Hacé las 3 <b>recomendadas</b> (escalas bajas, rápidas) y las <b>diarias de tu tier</b>: con todo hecho son hasta 15 Reliquias prístinas por día.</li>
        <li>Los modos desafío dan hasta 12 prístinas más (2 por cada uno completado).</li>
        <li>Con el dominio <b>Follows Advice</b> tenés más logros diarios.</li>
        <li>Durante la <b>Incursión fractal</b> (hasta el 1 de diciembre), el modo <b>Quickplay</b> da Polvo fractalino para los guantes legendarios Mists-Grasper.</li>
      </ul></section></div>`;
  }

  function paintEscalas(out) {
    const daily = new Set((dailies?.today || []).map((a) => scaleIn(a.name)).filter(Boolean));
    const lvl = acc.level;
    out.innerHTML = `<div class="filters"><input type="search" id="frQ" placeholder="Filtrar por fractal o escala…"><label>Tier <select id="frT"><option value="">Todos</option>${TIERS.map((t) => `<option value="${t.n}">T${t.n} · ${t.from}–${t.to}</option>`).join('')}</select></label></div>
      <div class="table-wrap"><table class="fr-scales"><thead><tr><th>Escala</th><th class="left">Fractal</th><th>Tier</th><th>Agonía (AR)</th><th>Inestab.</th><th>Reliquias</th><th>Encriptaciones</th><th>Escritos</th><th class="left">Notas</th></tr></thead><tbody>
      ${SCALES.slice(1).map(([f, ar], i) => { const s = i + 1; const t = tierOf(s); return `<tr data-s="${s}" data-t="${t.n}" data-f="${esc(f.toLowerCase())}" class="${daily.has(s) ? 'fr-today' : ''} ${lvl === s ? 'fr-me' : ''}"><td class="num"><b>${s}</b></td><td class="left"><a href="${WIKI(`${f} Fractal`)}" target="_blank" rel="noopener">${esc(f)}</a></td><td>T${t.n}</td><td class="num">${ar}</td><td class="num">${instabCount(s)}</td><td class="num">${relicsAt(s)}</td><td class="num">${encAt(s, f)}</td><td class="num">${writsAt(s)}</td><td class="left small">${CM[f] === s ? '<span class="pill warn">Modo desafío</span> ' : ''}${daily.has(s) ? '<span class="pill good">recomendada hoy</span> ' : ''}${lvl === s ? '<span class="pill">tu nivel</span>' : ''}</td></tr>`; }).join('')}
      </tbody></table></div>
      <p class="muted small">AR = resistencia a la agonía mínima para que la agonía te saque sólo 1% de vida por tick (puede variar ±1 según tu vida máxima). Reliquias, encriptaciones y Escritos de Maestría tiria son por fractal completado. Chaos, Nightmare y Deepstone dan 1 encriptación extra por debajo de escala 40 y 2 por encima.</p>`;
    const f = () => { const q = view.querySelector('#frQ').value.trim().toLowerCase(), t = view.querySelector('#frT').value; out.querySelectorAll('tbody tr').forEach((tr) => { tr.hidden = (t && tr.dataset.t !== t) || (q && !(tr.dataset.f.includes(q) || tr.dataset.s === q)); }); };
    view.querySelector('#frQ').addEventListener('input', f);
    view.querySelector('#frT').addEventListener('change', f);
  }

  function paintFractales(out) {
    const names = [...new Set(SCALES.slice(1).map((x) => x[0]))].sort();
    out.innerHTML = `<div class="fr-grid">${names.map((f) => {
      const sc = SCALES.map((x, i) => (x && x[0] === f ? i : null)).filter(Boolean);
      return `<div class="fr-card"><h4><a href="${WIKI(`${f} Fractal`)}" target="_blank" rel="noopener">${esc(f)}</a></h4>
        <div class="small">Escalas: ${sc.map((s) => `<b>${s}</b>`).join(' · ')}</div>
        <div class="small muted">Hora: ${esc(TIME[f] || 'Día')}${QUICKPLAY.has(f) ? ' · <span class="pill">Quickplay</span>' : ''}${CM[f] ? ` · <span class="pill warn">Modo desafío en ${CM[f]}</span>` : ''}${EXTRA_ENC.has(f) ? ' · <span class="pill good">+encriptaciones</span>' : ''}</div></div>`;
    }).join('')}</div>`;
  }

  function paintInest(out) {
    out.innerHTML = `<p>Las <b>inestabilidades de Mistlock</b> son modificadores que cambian cada día. Empiezan en escala 26: <b>1</b> en T2 (26–50), <b>2</b> en T3 (51–75) y <b>3</b> en T4 (76–100). Las de cada fractal del día las ves al entrar, en el ícono arriba de la pantalla.</p>
      <div class="fr-grid">${INSTAB.map(([n, d]) => `<div class="fr-card"><h4><a href="${WIKI(`Mistlock Instability: ${n}`)}" target="_blank" rel="noopener">${esc(n)}</a></h4><p class="small">${esc(d)}</p></div>`).join('')}</div>`;
  }

  function paintRecomp(out) {
    out.innerHTML = `<div class="ho-grid">
      <section class="ho-card"><h3>Por cada fractal</h3><ul class="como-ul">
        <li><b>Reliquias fractales:</b> 5 en escala 1–5, +1 cada 5 escalas hasta 14 en 46–50; después 15 (51–60), 16, 17, 18 y 19 (91–100).</li>
        <li><b>Encriptaciones fractales:</b> 2 (1–20), 3 (21–40), 4 (41–60), 5 (61–80), 6 (81–100). A veces sale una Llave de encriptación en lugar de una.</li>
        <li><b>Escritos de Maestría tiria</b> (experiencia): 2, 4, 8 o 12 según el tier.</li>
        <li>Infusiones +1 de agonía, equipo, recetas (Runa superior de resistencia, Sigilo superior de impulso) y materiales ascendidos de los enemigos: Vial de esencia de la Niebla (escala 1+), Glóbulo (26+) y Esquirla (51+).</li></ul></section>
      <section class="ho-card"><h3>Reliquias prístinas</h3><ul class="como-ul">
        <li>Cofres de las diarias: hasta 15 por día; modos desafío: 2 cada uno (hasta 12 más).</li>
        <li>Logros Fractal Initiate, Adept, Expert y Master.</li>
        <li><b>Se gastan en:</b> anillos ascendidos (10 c/u), Caja de armas fractales (20), Piedra de la Niebla (5), recetas de Marca de Gran Maestro (10), Mist Band / Pendant / Talisman (100 + 2 Matrices integradas), mejoras de Deroir.</li></ul></section>
      <section class="ho-card ho-wide"><h3>Vendedores del Observatorio de Mistlock</h3><div class="table-wrap"><table><thead><tr><th class="left">NPC</th><th class="left">Qué vende</th></tr></thead><tbody>
        <tr><td class="left"><b>BUY-4373</b></td><td class="left small">Llave de encriptación (1 reliquia + 30 platas; descuento: 25 platas, 30 por día), Trébol místico (150 reliquias + 2 ectos + 2 monedas místicas + 2 esquirlas, 10 por semana), Don de la Ascensión (500), Kit de reciclaje ascendido (40 + 20 oros), Matriz fractal integrada (15 + 10 Matrices estabilizadoras), cajas de equipo fractal, recetas de respiradores.</td></tr>
        <tr><td class="left"><b>BLING-9009</b></td><td class="left small">Armadura ascendida (400–800 reliquias + páginas de investigación), armas Cobalt Antique (800), pociones infinitas de la Niebla (5.000–8.000 + Matrices), anillos y accesorios con prístinas.</td></tr>
        <tr><td class="left"><b>BUY-2046 PFR</b></td><td class="left small">Anillos ascendidos (10 prístinas), Caja de armas fractales (20).</td></tr>
        <tr><td class="left"><b>INFUZ-5959</b></td><td class="left small">Materiales ascendidos de la Niebla.</td></tr>
        <tr><td class="left"><b>Deroir</b></td><td class="left small">Aumentos de cuenta permanentes: más experiencia, karma, reliquias y encriptaciones, y Sintonía de la Niebla (agonía extra para toda la cuenta).</td></tr>
      </tbody></table></div>
      <p class="small"><a href="#/moneda/7">Reliquia fractal</a> · <a href="#/moneda/24">Reliquia fractal prístina</a> · <a href="#/monedas">todas las monedas</a></p></section></div>`;
  }

  function paintProg(out) {
    out.innerHTML = `<div class="ho-grid">
      <section class="ho-card ho-wide"><h3>Tiers</h3><div class="table-wrap"><table><thead><tr><th>Tier</th><th>Escalas</th><th>Agonía necesaria</th><th>Inestabilidades</th><th class="left">Cómo se desbloquea</th></tr></thead><tbody>
        ${TIERS.map((t) => `<tr${acc.level != null && acc.level >= t.from && acc.level <= t.to ? ' class="fr-me"' : ''}><td><b>T${t.n}</b> ${esc(t.name)}</td><td>${t.from}–${t.to}</td><td>${SCALES[t.from][1]}–${SCALES[t.to][1]}</td><td>${instabCount(t.from)}</td><td class="left small">${esc(t.unlock)}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="small">Tu <b>nivel personal de fractales</b> sube 1 cada vez que completás un fractal de escala igual o mayor a tu nivel. La agonía empieza en escala 20 y pega de 10% a 180% de tu vida por segundo; con suficiente resistencia baja a 1%.</p></section>
      <section class="ho-card"><h3>Cómo conseguir resistencia a la agonía</h3><ul class="como-ul">
        <li><b>Infusiones de agonía</b> en las ranuras de infusión del equipo ascendido o legendario. Las +1 salen de los fractales y se combinan para subirlas.</li>
        <li>Anillos ascendidos con ranuras de infusión extra (recetas de la Forja con el dominio Agony Channeler).</li>
        <li><b>Singularidades de Mistlock</b>: buff diario en el vestíbulo (dominio Mistlock Singularities).</li>
        <li><b>Sintonía de la Niebla</b> de Deroir: agonía extra para toda la cuenta.</li></ul></section>
      <section class="ho-card"><h3>Dominio «Sintonía fractal» (Tyria central)</h3><table><tbody>${MASTERY.map(([n, p, xp, d], i) => `<tr${acc.attune != null && i < acc.attune ? ' class="done"' : ''}><td class="left"><b>${esc(n)}</b> <span class="muted small">${p} punto${p > 1 ? 's' : ''} · ${xp} XP</span><div class="small">${esc(d)}</div></td><td>${acc.attune != null ? (i < acc.attune ? '✔' : '○') : ''}</td></tr>`).join('')}</tbody></table>
        <p class="muted small">Total: 11 puntos de dominio de Tyria central. Mirá cuáles te faltan en <a href="#/logros">Logros → Dominios</a>.</p></section>
      <section class="ho-card ho-wide"><h3>Cómo se entra</h3><ul class="como-ul">
        <li>Portal asura en el centro de <b>Fuerte Marriner</b>, Arco del León (waypoint <button class="btn ghost small" data-copy="[&BDAEAAA=]">[&BDAEAAA=]</button>).</li>
        <li>Desde el <b>Santuario de Mistlock</b> (pase de la tienda de gemas) o la <b>Memoria del viejo Arco del León</b>.</li>
        <li>Todo el grupo tiene que confirmar al entrar al portal del Observatorio. Buscá grupo en el panel LFG → Fractales.</li></ul></section></div>`;
  }

  function paintCM(out) {
    out.innerHTML = `<p>El <b>modo desafío</b> (Challenge Mote) es la versión más difícil de los jefes de algunos fractales. Para habilitarlo tenés que <b>completar todos los logros de ese fractal</b>; después, el Heraldo del infortunio (Harbinger of Woe) te ofrece el desafío.</p>
      <div class="table-wrap"><table><thead><tr><th class="left">Fractal</th><th>Escala</th><th>Agonía</th><th class="left">Cómo se activa</th></tr></thead><tbody>
      ${Object.entries(CM).map(([f, s]) => `<tr><td class="left"><a href="${WIKI(`${f} Fractal`)}" target="_blank" rel="noopener">${esc(f)}</a></td><td class="num">${s}</td><td class="num">${SCALES[s][1]}</td><td class="left small">${['Nightmare', 'Shattered Observatory', 'Silent Surf', 'Sunqua Peak'].includes(f) ? 'Hablar con el Heraldo: «Accept the harbinger\'s challenge».' : '«Activate combat!» y confirmar el modo jefe desafío.'}</td></tr>`).join('')}
      </tbody></table></div>
      <ul class="como-ul small"><li>Cada modo desafío completado da 2 Reliquias prístinas por día; los jefes con desafío activo dan 20 o 100 reliquias fractales.</li>
      <li>Son parte del camino a la mochila legendaria <b>Ad Infinitum</b>: <a href="#/ruta">mirala en la Ruta legendaria</a>.</li></ul>`;
  }

  function paintQuick(out) {
    out.innerHTML = `<div class="ho-grid">
      <section class="ho-card"><h3>Quickplay</h3><p class="small">Modo de emparejamiento automático desde el panel <b>LFG</b> (con la Incursión fractal). Sirve solo, con grupo incompleto o completo. Siempre es <b>escala 1</b> y te toca un fractal al azar de esta lista:</p>
        <p class="small">${[...QUICKPLAY].sort().map((f) => `<span class="pill">${esc(f)}</span>`).join(' ')}</p>
        <ul class="como-ul small"><li>Te acompaña el <b>Mist Stranger</b>: te revive, te da waypoints de bolsillo hasta el punto más avanzado del grupo y en algunos fractales acciona palancas o placas.</li>
        <li>Cada run completo da <b>4–6 Polvo fractalino</b>.</li></ul></section>
      <section class="ho-card"><h3>Incursión fractal (10 nov – 1 dic 2026)</h3><ul class="como-ul small">
        <li>Cada hora, 15 minutos, en Colinas Kessex, Meseta de Diessa, Selvas Brisbanas o Cúmulos de Guaridanieve; 15 min antes salen portales en las otras zonas. Ponele alarma en <a href="#/eventos">Eventos</a>.</li>
        <li>La conferencia está en Arco del León (Coordinador Bixx).</li>
        <li>Da <b>Polvo fractalino</b> para los guantes legendarios <b>Mists-Grasper</b>, fichas de armas/armadura/accesorios y ofertas extra en la Bóveda del Mago.</li>
        <li>Polvo fractalino también: 4–6 por Quickplay y 25 de un logro semanal.</li></ul></section>
      <section class="ho-card ho-wide"><h3>Fractal Rush (evento de bonus)</h3><p class="small">Semana especial que vuelve cada tanto (las últimas: 13–20 de enero y 23–30 de junio de 2026). Cada fractal completado da 2–4 Trofeos de Fractal Rush (100 de karma c/u) que avanzan un meta logro con recompensas hasta el accesorio ascendido Fractal Sheriff's Star, y 150 de Aclamación astral en la Bóveda del Mago.</p></section></div>`;
  }

  const PAINT = { hoy: paintHoy, escalas: paintEscalas, fractales: paintFractales, inest: paintInest, recomp: paintRecomp, prog: paintProg, cm: paintCM, quick: paintQuick };
  function paint() {
    const out = view.querySelector('#frOut');
    view.querySelectorAll('.fr-tabs [data-t]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.t === tab)));
    PAINT[tab](out);
  }
  view.querySelector('.fr-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    tab = b.dataset.t; try { localStorage.setItem('gw2-fr-tab', tab); } catch {}
    paint();
  });
  view.addEventListener('click', async (e) => { const c = e.target.closest('[data-copy]'); if (!c || !view.querySelector('.fr-tabs')) return; try { await navigator.clipboard.writeText(c.dataset.copy); c.textContent = '✔ copiado'; } catch {} });
  paint();
  accP.then(() => { if (tab !== 'hoy' && view.querySelector('#frOut')) paint(); });
  loadDailies().then(() => { if (tab === 'escalas' && view.querySelector('#frOut')) paint(); });
}
