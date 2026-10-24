// Columnas redimensionables en todas las tablas: arrastrá el borde derecho del encabezado.
// Doble clic en el borde = volver al ancho automático. Los anchos quedan guardados por tabla.
const KEY = 'gw2-bazar-colw';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch {} };
const isMobile = () => window.matchMedia('(max-width: 700px)').matches;

/** Clave de la tabla: dónde está (panel o pestaña) + los títulos de las columnas. */
function tableKey(table) {
  const ths = [...table.querySelectorAll(':scope > thead > tr:first-child > th')];
  const where = table.closest('.drawer-panel') ? 'panel' : (location.hash.split('/')[1] || 'bazar');
  return `${where}|${ths.map((t) => t.textContent.replace(/[▾▴]/g, '').trim()).join('|')}`;
}

function freeze(table, ths) {
  if (table.classList.contains('cr-fixed')) return;
  const ws = ths.map((th) => th.getBoundingClientRect().width);
  ths.forEach((th, i) => { th.style.width = `${Math.round(ws[i])}px`; });
  table.style.width = `${Math.round(ws.reduce((a, b) => a + b, 0))}px`;
  table.classList.add('cr-fixed');
}

function apply(table, widths, ths) {
  if (!widths || widths.length !== ths.length) return;
  ths.forEach((th, i) => { th.style.width = `${widths[i]}px`; });
  table.style.width = `${widths.reduce((a, b) => a + b, 0)}px`;
  table.classList.add('cr-fixed');
}

function reset(table, ths) {
  ths.forEach((th) => { th.style.width = ''; });
  table.style.width = '';
  table.classList.remove('cr-fixed');
  delete saved[tableKey(table)];
  persist();
}

function enhance(table) {
  if (isMobile()) return;
  const ths = [...table.querySelectorAll(':scope > thead > tr:first-child > th')];
  if (ths.length < 2) return;
  if (table.dataset.cr === String(ths.length) && ths[0].querySelector('.col-grip')) return;
  table.dataset.cr = String(ths.length);
  ths.forEach((th, i) => {
    if (th.querySelector('.col-grip')) return;
    const g = document.createElement('span');
    g.className = 'col-grip';
    g.title = 'Arrastrá para achicar o agrandar la columna · doble clic: ancho automático';
    th.appendChild(g);
    g.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); });
    g.addEventListener('dblclick', (e) => { e.stopPropagation(); e.preventDefault(); reset(table, ths); });
    g.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); e.preventDefault();
      freeze(table, ths);
      const startX = e.clientX, startW = th.getBoundingClientRect().width;
      const others = ths.reduce((a, t) => a + (t === th ? 0 : t.getBoundingClientRect().width), 0);
      g.setPointerCapture(e.pointerId);
      document.body.classList.add('cr-dragging');
      const move = (ev) => {
        const w = Math.max(40, startW + ev.clientX - startX);
        th.style.width = `${Math.round(w)}px`;
        table.style.width = `${Math.round(others + w)}px`;
      };
      const up = () => {
        g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', up);
        document.body.classList.remove('cr-dragging');
        saved[tableKey(table)] = ths.map((t) => Math.round(t.getBoundingClientRect().width));
        persist();
      };
      g.addEventListener('pointermove', move);
      g.addEventListener('pointerup', up);
    });
  });
  apply(table, saved[tableKey(table)], ths);
}

export function initColumnResize(root = document.body) {
  const scan = () => root.querySelectorAll('table').forEach(enhance);
  let t = null;
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(scan, 60); }).observe(root, { childList: true, subtree: true });
  scan();
}

// Barra de desplazamiento lateral "pegada" abajo de la pantalla para tablas más anchas que la página:
// así no hay que bajar hasta el final de la tabla para moverla a la derecha.
function addHScroll(wrap) {
  if (wrap.dataset.hs) { wrap._hsUpdate?.(); return; }
  wrap.dataset.hs = '1';
  const bar = document.createElement('div');
  bar.className = 'hscroll';
  bar.innerHTML = '<div></div>';
  wrap.after(bar);
  const inner = bar.firstChild;
  let lock = false;
  const sync = (from, to) => { if (lock) return; lock = true; to.scrollLeft = from.scrollLeft; requestAnimationFrame(() => { lock = false; }); };
  bar.addEventListener('scroll', () => sync(bar, wrap));
  wrap.addEventListener('scroll', () => sync(wrap, bar));
  const update = () => {
    if (!wrap.isConnected) { ro.disconnect(); bar.remove(); return; }
    const over = wrap.scrollWidth > wrap.clientWidth + 2;
    // Sólo hace falta si la tabla es más alta que la pantalla (si no, la barra propia ya se ve).
    const tall = wrap.getBoundingClientRect().height > window.innerHeight * 0.6;
    bar.hidden = !(over && tall);
    wrap.classList.toggle('hs-on', !bar.hidden); // ocultamos la barra propia de la tabla: queda una sola
    inner.style.width = `${wrap.scrollWidth}px`;
    bar.style.width = `${wrap.clientWidth}px`;
    bar.scrollLeft = wrap.scrollLeft;
  };
  wrap._hsUpdate = update;
  const ro = new ResizeObserver(update);
  ro.observe(wrap);
  const t = wrap.querySelector('table');
  if (t) ro.observe(t);
  update();
}
export function initHScroll(root = document.body) {
  const scan = () => root.querySelectorAll('.table-wrap').forEach(addHScroll);
  let t = null;
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(scan, 80); }).observe(root, { childList: true, subtree: true });
  let raf = 0;
  const all = () => { raf = 0; root.querySelectorAll('.table-wrap').forEach((w) => w._hsUpdate?.()); };
  window.addEventListener('resize', () => { if (!raf) raf = requestAnimationFrame(all); });
  document.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(all); }, { passive: true, capture: true });
  scan();
}
