// Historial completo de precio de un item (desde que existe en el bazar, 2012 en adelante).
// Datos diarios de DataWars2 (api.datawars2.ie), consultados directo desde el navegador.
import { analysisHTML } from './price-why.js';
const cache = new Map();
const FIELDS = 'date,buy_price_avg,sell_price_avg,buy_price_min,buy_price_max,sell_price_min,sell_price_max,buy_sold,sell_sold,sell_quantity_avg,sell_quantity_min,sell_quantity_max,buy_quantity_avg,buy_quantity_min,buy_quantity_max';
const RANGES = [['1m', '1 mes', 31], ['3m', '3 meses', 92], ['1a', '1 año', 366], ['5a', '5 años', 1827], ['todo', 'Todo', Infinity]];
const DAY = 86_400_000;

async function load(id) {
  if (cache.has(id)) return cache.get(id);
  const p = (async () => {
    const r = await fetch(`https://api.datawars2.ie/gw2/v2/history/json?itemID=${id}&fields=${FIELDS}`, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`DataWars2 respondió ${r.status}`);
    const raw = await r.json();
    const mid = (avg, mn, mx) => (avg > 0 ? avg : mn > 0 && mx > 0 ? (mn + mx) / 2 : mn > 0 ? mn : mx > 0 ? mx : null);
    return raw.map((x) => ({
      t: Date.parse(x.date),
      sell: mid(x.sell_price_avg, x.sell_price_min, x.sell_price_max),
      buy: mid(x.buy_price_avg, x.buy_price_min, x.buy_price_max),
      sold: x.sell_sold ?? null,
      bought: x.buy_sold ?? null,
      supply: mid(x.sell_quantity_avg, x.sell_quantity_min, x.sell_quantity_max),
      demand: mid(x.buy_quantity_avg, x.buy_quantity_min, x.buy_quantity_max),
    })).filter((x) => Number.isFinite(x.t) && (x.sell || x.buy)).sort((a, b) => a.t - b.t);
  })();
  cache.set(id, p);
  p.catch(() => cache.delete(id));
  return p;
}

/** Agrupa en semanas (o meses) cuando hay demasiados puntos, para que el gráfico sea liviano. */
function bucket(rows, maxPts = 700) {
  if (rows.length <= maxPts) return rows;
  const span = (rows[rows.length - 1].t - rows[0].t) / maxPts;
  const out = [];
  let cur = null;
  for (const r of rows) {
    if (!cur || r.t - cur.t0 >= span) { cur && out.push(fin(cur)); cur = { t0: r.t, n: 0, sell: 0, ns: 0, buy: 0, nb: 0, sold: 0, bought: 0, last: r.t }; }
    cur.n++; cur.last = r.t;
    if (r.sell) { cur.sell += r.sell; cur.ns++; }
    if (r.buy) { cur.buy += r.buy; cur.nb++; }
    cur.sold += r.sold || 0; cur.bought += r.bought || 0;
  }
  cur && out.push(fin(cur));
  return out;
  function fin(c) { return { t: c.t0, tEnd: c.last, sell: c.ns ? c.sell / c.ns : null, buy: c.nb ? c.buy / c.nb : null, sold: c.sold / c.n, bought: c.bought / c.n, grouped: c.n }; }
}

const fmtDate = (t, long = false) => new Date(t).toLocaleDateString('es-AR', long ? { day: 'numeric', month: 'short', year: 'numeric' } : { month: 'short', year: '2-digit' });

export function renderHistory(box, id, { coin, esc }) {
  let range = '1a';
  let log = false;
  try { range = localStorage.getItem('gw2-bazar-hist-range') || range; } catch {}
  box.innerHTML = '<div class="skeleton" style="height:220px"></div>';
  load(id).then(paint, (e) => { box.innerHTML = `<p class="muted">No pude traer el historial (${esc(e.message)}). <button class="btn ghost small" data-hretry>Reintentar</button></p>`; box.querySelector('[data-hretry]')?.addEventListener('click', () => renderHistory(box, id, { coin, esc })); });

  function paint(all) {
    if (!all.length) { box.innerHTML = '<p class="muted">No hay historial para este item (nunca se vendió en el bazar).</p>'; return; }
    const days = RANGES.find((r) => r[0] === range)?.[2] ?? Infinity;
    const from = all[all.length - 1].t - days * DAY;
    const sel = all.filter((r) => r.t >= from);
    const pts = bucket(sel);
    const first = all[0];
    const vals = sel.flatMap((r) => [r.sell, r.buy]).filter(Boolean);
    const sells = sel.filter((r) => r.sell);
    const minR = sells.reduce((a, r) => (r.sell < a.sell ? r : a), sells[0] || sel[0]);
    const maxR = sells.reduce((a, r) => (r.sell > a.sell ? r : a), sells[0] || sel[0]);
    const startR = sells[0], endR = sells[sells.length - 1];
    const ch = startR && endR ? (endR.sell - startR.sell) / startR.sell : null;
    const avgSold = sel.reduce((a, r) => a + (r.sold || 0), 0) / Math.max(1, sel.length);

    const an = analysisHTML(sel, all, { coin });
    // --- SVG ---
    const W = 820, H = 260, PL = 62, PR = 10, PT = 10, PB = 26, VH = 46;
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (lo === hi) { lo *= 0.9; hi *= 1.1; }
    const yv = log ? (v) => Math.log(Math.max(1, v)) : (v) => v;
    const Y0 = yv(lo), Y1 = yv(hi);
    const ph = H - PT - PB - VH - 6;
    const x = (t) => PL + ((t - t0) / Math.max(1, t1 - t0)) * (W - PL - PR);
    const y = (v) => PT + (1 - (yv(v) - Y0) / Math.max(1e-9, Y1 - Y0)) * ph;
    const path = (k) => { let d = '', pen = false; for (const p of pts) { if (!p[k]) { pen = false; continue; } d += `${pen ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p[k]).toFixed(1)}`; pen = true; } return d; };
    const vs = pts.map((p) => p.sold || 0).filter(Boolean).sort((a, b) => a - b);
    const vmax = Math.max(1, vs[Math.floor(vs.length * 0.97)] || 0);
    const bw = Math.max(1, (W - PL - PR) / pts.length - 0.5);
    const vbase = H - PB;
    const bars = pts.map((p) => { const h = Math.min(1, (p.sold || 0) / vmax) * VH; return h > 0 ? `<rect x="${(x(p.t) - bw / 2).toFixed(1)}" y="${(vbase - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}"/>` : ''; }).join('');
    // ejes
    const ticksY = [];
    for (let i = 0; i <= 4; i++) { const yy = PT + (i / 4) * ph; const v = log ? Math.exp(Y1 - (i / 4) * (Y1 - Y0)) : hi - (i / 4) * (hi - lo); ticksY.push(`<line x1="${PL}" x2="${W - PR}" y1="${yy}" y2="${yy}" class="h-grid"/><text x="${PL - 6}" y="${yy + 4}" text-anchor="end">${coinTxt(v)}</text>`); }
    const ticksX = [];
    for (let i = 0; i <= 5; i++) { const t = t0 + (i / 5) * (t1 - t0); ticksX.push(`<text x="${x(t)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === 5 ? 'end' : 'middle'}">${fmtDate(t, days <= 92)}</text>`); }

    box.innerHTML = `
      <div class="h-bar">
        <div class="seg">${RANGES.map(([k, l]) => `<button type="button" class="${k === range ? 'on' : ''}" data-hr="${k}">${l}</button>`).join('')}</div>
        <label class="small"><input type="checkbox" data-hlog ${log ? 'checked' : ''}> escala logarítmica</label>
      </div>
      <div class="cards h-cards">
        <div class="card"><div class="k">Precio de venta ahora</div><div class="v">${coin(Math.round(endR?.sell || 0))}</div><div class="h">${ch != null ? `<span class="${ch >= 0 ? 'up' : 'down'}">${ch >= 0 ? '▲' : '▼'} ${Math.abs(ch * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%</span> en el período` : ''}</div></div>
        <div class="card"><div class="k">Mínimo del período</div><div class="v">${coin(Math.round(minR?.sell || 0))}</div><div class="h">${minR ? fmtDate(minR.t, true) : ''}</div></div>
        <div class="card"><div class="k">Máximo del período</div><div class="v">${coin(Math.round(maxR?.sell || 0))}</div><div class="h">${maxR ? fmtDate(maxR.t, true) : ''}</div></div>
        <div class="card"><div class="k">Vendidos por día</div><div class="v num">${Math.round(avgSold).toLocaleString('es-AR')}</div><div class="h">promedio del período</div></div>
        <div class="card"><div class="k">En el bazar desde</div><div class="v num">${fmtDate(first.t, true)}</div><div class="h">primer precio: ${coin(Math.round(first.sell || first.buy))}</div></div>
      </div>
      <div class="h-wrap">
        <svg viewBox="0 0 ${W} ${H}" class="h-svg" role="img" aria-label="Historial de precio">
          <g class="h-axis">${ticksY.join('')}${ticksX.join('')}</g>
          <g class="h-vol">${bars}</g>
          <path d="${path('buy')}" class="h-buy"/>
          <path d="${path('sell')}" class="h-sell"/>
          <g class="h-marks">${an.moves.map((m, k) => { const mx = x(m.t); return mx >= PL && mx <= W - PR ? `<g data-mark="${m.t}"><line x1="${mx}" x2="${mx}" y1="${PT}" y2="${vbase}" class="h-mark"/><circle cx="${mx}" cy="${PT + 9}" r="8" class="h-mark-c ${m.ch > 0 ? 'up' : 'down'}"/><text x="${mx}" y="${PT + 13}" text-anchor="middle">${k + 1}</text></g>` : ''; }).join('')}</g>
          <line class="h-cross" y1="${PT}" y2="${vbase}" x1="-10" x2="-10"/>
          <circle class="h-dot-s" r="3.5" cx="-10" cy="-10"/><circle class="h-dot-b" r="3.5" cx="-10" cy="-10"/>
        </svg>
        <div class="h-tip" hidden></div>
      </div>
      <p class="small muted"><span class="h-key sell"></span> precio de venta · <span class="h-key buy"></span> orden de compra · barras: unidades vendidas por día. ${pts[0].grouped ? 'Cada punto es el promedio de varios días. ' : ''}Precios diarios de <a href="https://datawars2.ie" target="_blank" rel="noopener">DataWars2</a>${first.t < Date.parse('2019-07-13') ? ' (antes de 2019 se usa el punto medio entre mínimo y máximo del día)' : ''}.</p>
      <div class="why"><h4 class="sub-h">¿Por qué subió o bajó? Análisis del período</h4>${an.html}</div>`;

    box.querySelectorAll('[data-hr]').forEach((b) => b.addEventListener('click', () => { range = b.dataset.hr; try { localStorage.setItem('gw2-bazar-hist-range', range); } catch {} paint(all); }));
    box.querySelector('[data-hlog]').addEventListener('change', (e) => { log = e.target.checked; paint(all); });

    box.querySelectorAll('[data-mark]').forEach((g) => g.addEventListener('click', () => {
      const li = box.querySelector(`[data-why="${g.dataset.mark}"]`);
      box.querySelectorAll('.why-list > li').forEach((x) => x.classList.toggle('hl', x === li));
      li?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
    // Tooltip al pasar el mouse / el dedo
    const svg = box.querySelector('svg');
    const tip = box.querySelector('.h-tip');
    const cross = svg.querySelector('.h-cross'), ds = svg.querySelector('.h-dot-s'), db = svg.querySelector('.h-dot-b');
    const move = (ev) => {
      const rc = svg.getBoundingClientRect();
      const cx = ((ev.touches?.[0]?.clientX ?? ev.clientX) - rc.left) / rc.width * W;
      const t = t0 + ((cx - PL) / (W - PL - PR)) * (t1 - t0);
      let best = pts[0];
      for (const p of pts) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
      const px = x(best.t);
      cross.setAttribute('x1', px); cross.setAttribute('x2', px);
      ds.setAttribute('cx', best.sell ? px : -10); ds.setAttribute('cy', best.sell ? y(best.sell) : -10);
      db.setAttribute('cx', best.buy ? px : -10); db.setAttribute('cy', best.buy ? y(best.buy) : -10);
      tip.hidden = false;
      tip.innerHTML = `<b>${best.grouped ? `${fmtDate(best.t, true)} – ${fmtDate(best.tEnd, true)}` : fmtDate(best.t, true)}</b><br>Venta: ${best.sell ? coin(Math.round(best.sell)) : '—'}<br>Compra: ${best.buy ? coin(Math.round(best.buy)) : '—'}${best.sold != null ? `<br><span class="muted">Vendidos/día: ${Math.round(best.sold).toLocaleString('es-AR')}</span>` : ''}`;
      const left = (px / W) * rc.width;
      tip.style.left = `${Math.min(rc.width - 170, Math.max(0, left + 12))}px`;
    };
    svg.addEventListener('mousemove', move);
    svg.addEventListener('touchmove', move, { passive: true });
    svg.addEventListener('mouseleave', () => { tip.hidden = true; cross.setAttribute('x1', -10); cross.setAttribute('x2', -10); ds.setAttribute('cx', -10); db.setAttribute('cx', -10); });
  }
}

/** Monedas en texto corto para los ejes del SVG (1o 23p 45c). */
function coinTxt(v) {
  v = Math.round(v);
  const g = Math.floor(v / 10000), s = Math.floor((v % 10000) / 100), c = v % 100;
  if (g) return `${g.toLocaleString('es-AR')}o${s ? ` ${s}p` : ''}`;
  if (s) return `${s}p${c ? ` ${c}c` : ''}`;
  return `${c}c`;
}
