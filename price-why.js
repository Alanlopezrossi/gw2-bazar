// "¿Por qué subió / bajó?": análisis automático del historial diario de un item.
// Detecta movimientos bruscos y, para cada uno, mira qué pasó con la demanda (unidades vendidas),
// la oferta (unidades publicadas a la venta) y las órdenes de compra, y lo cruza con fechas del juego.
const DAY = 86_400_000;
const D = (s) => Date.parse(`${s}T00:00:00Z`);

// Fechas del juego con impacto conocido en el bazar (verificadas). Fuente: anuncios oficiales de ArenaNet.
const GAME_EVENTS = [
  [D('2012-08-28'), 'Lanzamiento de Guild Wars 2'],
  [D('2012-11-15'), 'The Lost Shores: llegan los Fractales y el equipo ascendido'],
  [D('2015-08-28'), 'El juego base pasa a ser gratis (free to play): entran muchos jugadores nuevos'],
  [D('2015-10-23'), 'Expansión Heart of Thorns (legendarias de 2.ª generación, maestrías)'],
  [D('2017-09-22'), 'Expansión Path of Fire (monturas)'],
  [D('2021-07-13'), 'Arsenal legendario (Legendary Armory): las legendarias se comparten en toda la cuenta'],
  [D('2022-02-28'), 'Expansión End of Dragons'],
  [D('2023-08-22'), 'Expansión Secrets of the Obscure y Bóveda del Mago (Wizard\'s Vault)'],
  [D('2024-08-20'), 'Expansión Janthir Wilds (hogar / homestead)'],
  [D('2025-10-28'), 'Expansión Visions of Eternity'],
  [D('2026-09-15'), 'Actualización final de Visions of Eternity (Code of Creation)'],
];
// Festivales anuales (ventanas aproximadas: cambian unos días cada año).
const FESTIVALS = [
  { name: 'Año Nuevo Lunar', from: [1, 20], to: [2, 20], months: [1, 2] },
  { name: 'Super Adventure Box', from: [3, 28], to: [4, 30], months: [4] },
  { name: 'Dragon Bash', from: [6, 10], to: [7, 15], months: [6, 7] },
  { name: 'Festival de los Cuatro Vientos', from: [7, 20], to: [8, 31], months: [8] },
  { name: 'Halloween (Rey Loco)', from: [10, 10], to: [11, 10], months: [10, 11] },
  { name: 'Día Invernal (Wintersday)', from: [12, 10], to: [1, 8], months: [12, 1] },
];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const median = (a) => { const s = a.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const mean = (a) => { const s = a.filter((x) => x != null && Number.isFinite(x)); return s.length ? s.reduce((p, c) => p + c, 0) / s.length : null; };
const pctTxt = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toLocaleString('es-AR', { maximumFractionDigits: 0 })}%`;
const more = (x) => `un ${Math.abs(x * 100).toLocaleString('es-AR', { maximumFractionDigits: 0 })}% ${x >= 0 ? 'más' : 'menos'}`;
const ratio = (a, b) => (a != null && b ? a / b - 1 : null);

function festivalAt(t) {
  const d = new Date(t), m = d.getUTCMonth() + 1, day = d.getUTCDate();
  const v = m * 100 + day;
  return FESTIVALS.find((f) => { const a = f.from[0] * 100 + f.from[1], b = f.to[0] * 100 + f.to[1]; return a <= b ? v >= a && v <= b : v >= a || v <= b; }) || null;
}
const gameEventNear = (t) => GAME_EVENTS.filter(([e]) => t >= e - 12 * DAY && t <= e + 21 * DAY);

/** Patrón por mes: ¿en qué meses suele estar más caro o más barato? (necesita 2+ años). */
function seasonality(rows) {
  const years = new Map();
  for (const r of rows) {
    if (!r.sell) continue;
    const d = new Date(r.t), y = d.getUTCFullYear(), m = d.getUTCMonth();
    if (!years.has(y)) years.set(y, Array.from({ length: 12 }, () => []));
    years.get(y)[m].push(r.sell);
  }
  const full = [...years.entries()].filter(([, ms]) => ms.filter((x) => x.length >= 10).length >= 10);
  if (full.length < 2) return null;
  const per = Array.from({ length: 12 }, () => []);
  for (const [, ms] of full) {
    const base = median(ms.map((x) => median(x)));
    ms.forEach((x, i) => { if (x.length >= 10 && base) per[i].push(median(x) / base - 1); });
  }
  const out = per.map((l, i) => ({ m: i, avg: mean(l), up: l.filter((x) => x > 0.05).length / (l.length || 1), down: l.filter((x) => x < -0.05).length / (l.length || 1), n: l.length }));
  return { years: full.length, months: out };
}

/** Busca los movimientos bruscos: compara 2 semanas antes con la semana siguiente. */
function findMoves(rows) {
  const s = rows.map((r, i) => median(rows.slice(Math.max(0, i - 2), i + 3).map((x) => x.sell)));
  const cand = [];
  for (let i = 14; i < rows.length - 3; i++) {
    const pre = median(s.slice(i - 14, i));
    const post = median(s.slice(i, Math.min(rows.length, i + 7)));
    if (!pre || !post) continue;
    const ch = post / pre - 1;
    if (Math.abs(ch) >= 0.2) cand.push({ i, ch, pre, post });
  }
  cand.sort((a, b) => Math.abs(b.ch) - Math.abs(a.ch));
  const picked = [];
  for (const c of cand) {
    if (picked.some((p) => Math.abs(rows[p.i].t - rows[c.i].t) < 35 * DAY)) continue;
    picked.push(c);
    if (picked.length >= 6) break;
  }
  return picked.sort((a, b) => a.i - b.i).map((c) => {
    const at = (k) => rows.slice(Math.max(0, c.i - 14), c.i).map((r) => r[k]);
    const af = (k) => rows.slice(c.i, Math.min(rows.length, c.i + 14)).map((r) => r[k]);
    // ¿Volvió al precio de antes? (pico pasajero)
    const later = median(s.slice(c.i + 21, c.i + 35));
    const reverted = later != null && Math.abs(later / c.pre - 1) < 0.1;
    // Punta exacta del movimiento (mínimo o máximo) en las 3 semanas
    const win = rows.slice(c.i, Math.min(rows.length, c.i + 21)).filter((r) => r.sell);
    const peak = win.length ? win.reduce((a, r) => ((c.ch > 0 ? r.sell > a.sell : r.sell < a.sell) ? r : a), win[0]) : null;
    return {
      t: rows[c.i].t, ch: c.ch, pre: c.pre, post: c.post, peak, reverted, later,
      sold: ratio(mean(af('sold')), mean(at('sold'))),
      supply: ratio(mean(af('supply')), mean(at('supply'))),
      demand: ratio(mean(af('demand')), mean(at('demand'))),
      bought: ratio(mean(af('bought')), mean(at('bought'))),
    };
  });
}

/** Explicación en palabras de un movimiento. */
function explain(m, season) {
  const up = m.ch > 0;
  const why = [];
  const big = (x, t = 0.3) => x != null && Math.abs(x) >= t;
  if (up) {
    if (big(m.sold) && m.sold > 0) why.push(`<b>Subió la demanda:</b> se vendieron ${more(m.sold)} de unidades por día que en las dos semanas anteriores. Más gente lo estaba comprando (para craftear, una colección o un evento).`);
    if (big(m.supply, 0.2) && m.supply < 0) why.push(`<b>Faltó oferta:</b> había ${more(m.supply)} de unidades publicadas a la venta. Con menos stock, el precio sube solo.`);
    if (big(m.demand, 0.3) && m.demand > 0) why.push(`<b>Más órdenes de compra:</b> ${more(m.demand)} de unidades pedidas. Hay compradores esperando, lo que empuja el precio.`);
    if (m.reverted) why.push('<b>Fue un pico pasajero:</b> a las pocas semanas volvió al precio de antes. Suele ser alguien que compró todo el stock barato de golpe (para revenderlo o para un crafteo grande) o una demanda puntual de un evento.');
  } else {
    if (big(m.supply, 0.2) && m.supply > 0) why.push(`<b>Se inundó de oferta:</b> había ${more(m.supply)} de unidades a la venta. Suele pasar cuando el item empieza a salir más (un farmeo nuevo, más drops, recompensas de un evento o un cambio de balance).`);
    if (big(m.sold) && m.sold < 0) why.push(`<b>Cayó la demanda:</b> se vendieron ${more(m.sold)} de unidades por día. Lo dejó de pedir algo que lo consumía (terminó un evento o cambió una receta).`);
    if (big(m.demand, 0.3) && m.demand < 0) why.push(`<b>Menos compradores:</b> ${more(m.demand)} de unidades pedidas en órdenes de compra.`);
    if (big(m.sold) && m.sold > 0 && !(big(m.supply, 0.2) && m.supply > 0)) why.push(`Igual se vendieron ${more(m.sold)} de unidades por día: hubo mucha venta "al remate" (gente liquidando lo que tenía).`);
    if (m.reverted) why.push('<b>Fue una caída pasajera:</b> después recuperó el precio. Típico de alguien que vendió mucho de golpe a la orden de compra.');
  }
  const ctx = [];
  for (const [, name] of gameEventNear(m.t)) ctx.push(name);
  const fest = festivalAt(m.t);
  if (fest) {
    const sm = season?.months?.filter((x) => fest.months.includes(x.m + 1));
    const seasonal = sm?.some((x) => (up ? x.avg > 0.08 && x.up >= 0.6 : x.avg < -0.08 && x.down >= 0.6));
    ctx.push(seasonal ? `${fest.name}: este item <b>se mueve así todos los años</b> en esa época` : `coincide con ${fest.name} (fechas aprox.)`);
  }
  if (!why.length) why.push(up ? 'El precio subió sin un cambio claro en ventas ni en stock: probablemente lo movieron unos pocos vendedores que subieron sus precios (o se agotaron las publicaciones más baratas).' : 'El precio bajó sin un cambio claro en ventas ni en stock: probablemente hubo vendedores que bajaron precios para vender más rápido (guerra de precios).');
  return { why, ctx };
}

const fmtD = (t) => new Date(t).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });

/** HTML del análisis para las filas diarias del período elegido. */
export function analysisHTML(rows, all, { coin }) {
  const sells = rows.filter((r) => r.sell);
  if (sells.length < 30) return { html: '<p class="muted small">Hace falta al menos un mes de historial para analizar subidas y bajadas.</p>', moves: [] };
  const season = seasonality(all);
  const moves = findMoves(rows);
  const parts = [];

  // Resumen general del período
  const a = sells[0], z = sells[sells.length - 1];
  const tot = z.sell / a.sell - 1;
  const vol = median(sells.slice(1).map((r, i) => Math.abs(r.sell / sells[i].sell - 1)));
  parts.push(`<p>En el período, el precio de venta pasó de ${coin(Math.round(a.sell))} a ${coin(Math.round(z.sell))} (<b>${pctTxt(tot)}</b>). Un día normal se mueve alrededor de ${(vol * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%${vol < 0.02 ? ': es un item <b>estable</b>' : vol > 0.06 ? ': es un item <b>muy volátil</b>' : ''}.</p>`);

  // Estacionalidad
  if (season) {
    const hi = season.months.filter((x) => x.avg > 0.08 && x.up >= 0.6).sort((p, q) => q.avg - p.avg);
    const lo = season.months.filter((x) => x.avg < -0.08 && x.down >= 0.6).sort((p, q) => p.avg - q.avg);
    const fest = (m) => FESTIVALS.filter((f) => f.months.includes(m + 1)).map((f) => f.name);
    const lab = (x) => `${MONTHS[x.m]} (${pctTxt(x.avg)}${fest(x.m).length ? ` · ${fest(x.m).join(', ')}` : ''})`;
    if (hi.length || lo.length) parts.push(`<p><b>Patrón anual</b> (${season.years} años de datos): ${hi.length ? `suele estar <b>más caro</b> en ${hi.slice(0, 3).map(lab).join(', ')}` : ''}${hi.length && lo.length ? '; ' : ''}${lo.length ? `suele estar <b>más barato</b> en ${lo.slice(0, 3).map(lab).join(', ')}` : ''}. Si lo vas a comprar, conviene en los meses baratos; si lo vas a vender, en los caros.</p>`);
    else parts.push(`<p class="muted small">No tiene un patrón por época del año marcado (${season.years} años de datos).</p>`);
  }

  if (!moves.length) parts.push('<p class="muted">En este período no hubo subidas ni bajadas bruscas (más de 20% en una semana).</p>');
  else {
    parts.push(`<ol class="why-list">${moves.map((m, k) => {
      const { why, ctx } = explain(m, season);
      return `<li data-why="${m.t}"><div class="why-head"><span class="why-n">${k + 1}</span> <b class="${m.ch > 0 ? 'up' : 'down'}">${m.ch > 0 ? '▲ Subió' : '▼ Bajó'} ${pctTxt(m.ch)}</b> <span class="muted">desde el ${fmtD(m.t)}</span> · de ${coin(Math.round(m.pre))} a ${coin(Math.round(m.post))}${m.peak ? ` <span class="muted small">(${m.ch > 0 ? 'máximo' : 'mínimo'} ${coin(Math.round(m.peak.sell))} el ${fmtD(m.peak.t)})</span>` : ''}</div>
        <ul>${why.map((w) => `<li>${w}</li>`).join('')}${ctx.length ? `<li><b>Qué pasaba en el juego:</b> ${ctx.join(' · ')}</li>` : ''}</ul></li>`;
    }).join('')}</ol>`);
  }
  parts.push('<p class="muted small">Análisis automático: compara las dos semanas antes de cada salto con las dos siguientes (precio, unidades vendidas, unidades publicadas a la venta y órdenes de compra) y lo cruza con lanzamientos y festivales. Indica la causa más probable según los datos; no es una certeza.</p>');
  return { html: parts.join(''), moves };
}
