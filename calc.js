// Pestaña Calculadora: calculadora de monedas (oro/plata/cobre) + calculadora de venta en el bazar.
// Basada en la "Calculadora GW2" de tus artefactos, integrada al resto de la app.

const SYM = { '+': '+', '-': '−', '*': '×', '/': '÷' };

// Comisiones del bazar: 5% al publicar + 10% al vender (mínimo 1c cada una).
const listFee = (p) => (p ? Math.max(1, Math.round(p * 0.05)) : 0);
const saleFee = (p) => (p ? Math.max(1, Math.round(p * 0.1)) : 0);

export function renderCalc(view, { coin, esc, api, debounce, itemCell, setKeyHandler }) {
  view.innerHTML = `
    <div class="page-head"><div><h1>Calculadora</h1><p>Sumá, restá, multiplicá y dividí en oro/plata/cobre, y calculá cuánto cobrás o pagás en el bazar con las comisiones incluidas.</p></div></div>
    <div class="calc-grid">
      <section class="card calc">
        <h3 class="calc-h">Calculadora de monedas</h3>
        <p class="muted small">1 oro = 100 plata · 1 plata = 100 cobre</p>
        <div class="screen">
          <div class="expr" id="cExpr"></div>
          <div class="lbl" id="cLabel">Resultado</div>
          <div class="big" id="cBig"></div>
          <div class="cu muted small" id="cCopper"></div>
        </div>
        <div class="entry-title muted small" id="cTitle"></div>
        <div class="coin-fields" id="cCoins">
          <label class="fg">Oro<input id="cg" inputmode="numeric" placeholder="0" autocomplete="off"></label>
          <label class="fs">Plata<input id="cs" inputmode="numeric" placeholder="0" autocomplete="off"></label>
          <label class="fc">Cobre<input id="cc" inputmode="numeric" placeholder="0" autocomplete="off"></label>
        </div>
        <label class="qty-field hidden" id="cQtyField"><span id="cQtyLabel">Cantidad</span><input id="cqty" inputmode="decimal" placeholder="0" autocomplete="off"></label>
        <div class="msg" id="cMsg"></div>
        <div class="keys">
          <button class="op" data-op="+" title="Sumar (+)">+</button>
          <button class="op" data-op="-" title="Restar (−)">−</button>
          <button class="op" data-op="*" title="Multiplicar (×)">×</button>
          <button class="op" data-op="/" title="Dividir (÷)">÷</button>
          <button class="eq" id="cEq" title="Resultado (Enter)">= Resultado</button>
          <button class="small w2" id="cClearEntry">Limpiar campos</button>
          <button class="small w2" id="cClearAll">Borrar todo (Esc)</button>
        </div>
        <p class="muted small center">Atajos: <kbd>+</kbd> <kbd>-</kbd> <kbd>*</kbd> <kbd>/</kbd> operan · <kbd>Enter</kbd> resultado · <kbd>Esc</kbd> borrar todo. × y ÷ usan un número común (precio × 25 unidades, repartir entre 3).</p>
        <div class="hist"><h4>Historial <span class="muted small">(tocá uno para seguir desde ahí)</span></h4><ul id="cHist"></ul></div>
      </section>

      <section class="card calc">
        <h3 class="calc-h">Venta y compra en el bazar</h3>
        <p class="muted small">Elegí un item para traer su precio en vivo, o escribí un precio a mano.</p>
        <div class="ac">
          <input type="search" id="tSearch" placeholder="Buscar item… (ej: ectoplasma)" autocomplete="off">
          <div class="ac-list" id="tList"></div>
        </div>
        <div id="tItem" class="t-item"></div>
        <div class="entry-title muted small">Precio por unidad</div>
        <div class="coin-fields">
          <label class="fg">Oro<input id="tg" inputmode="numeric" placeholder="0" autocomplete="off"></label>
          <label class="fs">Plata<input id="ts" inputmode="numeric" placeholder="0" autocomplete="off"></label>
          <label class="fc">Cobre<input id="tc" inputmode="numeric" placeholder="0" autocomplete="off"></label>
        </div>
        <label class="qty-field">Cantidad<input id="tq" inputmode="numeric" value="1" autocomplete="off"></label>
        <div id="tOut" class="t-out"></div>
      </section>
    </div>`;

  const $ = (id) => view.querySelector('#' + id);

  // ================= calculadora de monedas =================
  let acc = null, op = null, tokens = [], lastExpr = '';
  const history = [];
  const isScale = () => op === '*' || op === '/';
  const fmtC = (cu) => coin(cu);
  const opHTML = (o) => `<span class="opsym">${SYM[o]}</span>`;
  const fmtEntry = (e) => (e.type === 'num' ? e.v.toLocaleString('es-AR') : fmtC(e.v));

  function readEntry() {
    if (isScale()) {
      const raw = $('cqty').value.replace(',', '.').trim();
      if (raw === '' || isNaN(parseFloat(raw))) return null;
      return { type: 'num', v: parseFloat(raw) };
    }
    const vals = ['cg', 'cs', 'cc'].map((id) => $(id).value.trim());
    if (vals.every((v) => v === '')) return null;
    const [g, s, c] = vals.map((v) => parseInt(v || '0', 10));
    return { type: 'coin', v: g * 10000 + s * 100 + c };
  }
  const compute = (a, o, v) => (o === '+' ? a + v : o === '-' ? a - v : o === '*' ? Math.round(a * v) : Math.round(a / v));
  function clearEntry() {
    ['cg', 'cs', 'cc', 'cqty'].forEach((id) => ($(id).value = ''));
    $('cMsg').textContent = '';
  }
  const focusEntry = () => (isScale() ? $('cqty') : $('cg')).focus();

  function pressOp(newOp) {
    const e = readEntry();
    if (op === null) {
      if (e !== null) acc = e.v;
      else if (acc === null) acc = 0;
      tokens = [fmtC(acc)];
    } else if (e !== null) {
      if (op === '/' && e.v === 0) return ($('cMsg').textContent = 'No se puede dividir por cero.');
      tokens.push(fmtEntry(e));
      acc = compute(acc, op, e.v);
    } else tokens.pop();
    tokens.push(opHTML(newOp));
    op = newOp;
    lastExpr = '';
    clearEntry(); render(); focusEntry();
  }
  function equals() {
    const e = readEntry();
    if (op === null) {
      if (e !== null) { acc = e.v; lastExpr = ''; clearEntry(); render(); }
      return;
    }
    if (e === null) return ($('cMsg').textContent = 'Falta el segundo valor.');
    if (op === '/' && e.v === 0) return ($('cMsg').textContent = 'No se puede dividir por cero.');
    tokens.push(fmtEntry(e));
    acc = compute(acc, op, e.v);
    lastExpr = tokens.join(' ') + ' <span class="opsym">=</span>';
    history.unshift({ expr: lastExpr, v: acc });
    op = null; tokens = [];
    clearEntry(); render(); focusEntry();
  }
  function clearAll() {
    acc = null; op = null; tokens = []; lastExpr = '';
    clearEntry(); render(); focusEntry();
  }
  /** Carga un monto (en cobre) en los campos de la calculadora. */
  function loadAmount(cu) {
    if (isScale()) { op = null; tokens = []; }
    const v = Math.max(0, Math.round(cu));
    $('cg').value = Math.floor(v / 10000) || '';
    $('cs').value = Math.floor((v % 10000) / 100) || '';
    $('cc').value = v % 100 || (v ? '' : '0');
    render();
    $('cg').focus();
  }
  function render() {
    const e = readEntry();
    let shown, label;
    if (op !== null && e !== null && !(op === '/' && e.v === 0)) { shown = compute(acc, op, e.v); label = 'Resultado (vista previa)'; }
    else if (op === null && e !== null) { shown = e.v; label = 'Monto'; }
    else { shown = acc ?? 0; label = op ? 'Parcial' : 'Resultado'; }
    $('cExpr').innerHTML = op !== null ? tokens.join(' ') : lastExpr;
    $('cLabel').textContent = label;
    $('cBig').innerHTML = fmtC(shown);
    $('cCopper').textContent = `= ${shown.toLocaleString('es-AR')} cobre`;
    $('cCoins').classList.toggle('hidden', isScale());
    $('cQtyField').classList.toggle('hidden', !isScale());
    $('cQtyLabel').textContent = op === '*' ? 'Multiplicar por (cantidad)' : 'Dividir por (cantidad)';
    $('cTitle').textContent = op === null
      ? acc === null ? 'Ingresá el primer monto y elegí una operación' : 'Elegí una operación para seguir con el resultado, o ingresá un monto nuevo'
      : isScale() ? 'Ingresá un número' : `Ingresá el monto a ${op === '+' ? 'sumar' : 'restar'}`;
    view.querySelectorAll('.op').forEach((b) => b.classList.toggle('active', b.dataset.op === op));
    $('cHist').innerHTML = history.length
      ? history.map((h, i) => `<li data-i="${i}">${h.expr} <b>${fmtC(h.v)}</b></li>`).join('')
      : '<li class="empty">Sin cuentas todavía.</li>';
  }

  view.querySelectorAll('.op').forEach((b) => b.addEventListener('click', () => pressOp(b.dataset.op)));
  $('cEq').addEventListener('click', equals);
  $('cClearAll').addEventListener('click', clearAll);
  $('cClearEntry').addEventListener('click', () => { clearEntry(); render(); focusEntry(); });
  $('cHist').addEventListener('click', (ev) => {
    const li = ev.target.closest('li[data-i]');
    if (!li) return;
    acc = history[li.dataset.i].v; op = null; tokens = []; lastExpr = '';
    clearEntry(); render(); focusEntry();
  });
  ['cg', 'cs', 'cc'].forEach((id) => $(id).addEventListener('input', (ev) => { ev.target.value = ev.target.value.replace(/\D/g, ''); $('cMsg').textContent = ''; render(); }));
  $('cqty').addEventListener('input', (ev) => { ev.target.value = ev.target.value.replace(/[^\d.,]/g, ''); $('cMsg').textContent = ''; render(); });
  view.querySelectorAll('.calc input').forEach((i) => i.addEventListener('focus', (e) => e.target.select()));

  // Atajos sólo para la calculadora de monedas (no cuando escribís en el panel del bazar).
  setKeyHandler((ev) => {
    const t = ev.target;
    if (t && t.closest && t.closest('.calc') && !['cg', 'cs', 'cc', 'cqty'].includes(t.id) && t.tagName === 'INPUT') return;
    const k = ev.key;
    if (['+', '-', '*', '/'].includes(k)) { ev.preventDefault(); pressOp(k); }
    else if (k === 'x' || k === 'X') { ev.preventDefault(); pressOp('*'); }
    else if (k === 'Enter' || k === '=') { ev.preventDefault(); equals(); }
    else if (k === 'Escape' && !document.querySelector('.drawer.open')) { ev.preventDefault(); clearAll(); }
  });

  // ================= venta/compra en el bazar =================
  let selected = null; // { id, name, icon, rarity, type, buy, sell }
  const tPrice = () => {
    const [g, s, c] = ['tg', 'ts', 'tc'].map((id) => parseInt($(id).value || '0', 10));
    return g * 10000 + s * 100 + c;
  };
  const setPrice = (cu) => {
    $('tg').value = Math.floor(cu / 10000) || '';
    $('ts').value = Math.floor((cu % 10000) / 100) || '';
    $('tc').value = cu % 100;
  };
  const useBtn = (cu) => `<button class="btn ghost small use" data-cu="${Math.round(cu)}" title="Pasarlo a la calculadora de monedas">→ calculadora</button>`;

  function renderTrade() {
    const p = tPrice();
    const q = Math.max(1, parseInt($('tq').value || '1', 10));
    const gross = p * q;
    const lf = listFee(p) * q, sf = saleFee(p) * q;
    const netList = gross - lf - sf;
    let html = `
      <div class="t-block"><h4>Si publicás a este precio</h4>
        <div class="t-row"><span>Total bruto</span><span>${coin(gross)}</span></div>
        <div class="t-row"><span>Comisión de publicación (5%, se paga al publicar)</span><span>${coin(-lf)}</span></div>
        <div class="t-row"><span>Comisión de venta (10%, al venderse)</span><span>${coin(-sf)}</span></div>
        <div class="t-row tot"><span>Cobrás</span><span>${coin(netList)} ${useBtn(netList)}</span></div>
        <div class="t-row muted small"><span>Por unidad</span><span>${coin(Math.round(netList / q))}</span></div>
      </div>`;
    if (selected) {
      const s = selected;
      if (s.buy) {
        const n = (s.buy - listFee(s.buy) - saleFee(s.buy)) * q;
        html += `<div class="t-block"><h4>Si vendés al instante (a la mejor orden: ${coin(s.buy)})</h4>
          <div class="t-row tot"><span>Cobrás</span><span>${coin(n)} ${useBtn(n)}</span></div>
          ${p ? `<div class="t-row muted small"><span>Diferencia vs publicar</span><span>${coin(netList - n)}</span></div>` : ''}</div>`;
      }
      html += `<div class="t-block"><h4>Si lo comprás</h4>
        ${s.sell ? `<div class="t-row"><span>Compra instantánea (${coin(s.sell)} c/u)</span><span>${coin(s.sell * q)} ${useBtn(s.sell * q)}</span></div>` : ''}
        ${s.buy ? `<div class="t-row"><span>Con orden de compra (${coin(s.buy + 1)} c/u, hay que esperar)</span><span>${coin((s.buy + 1) * q)} ${useBtn((s.buy + 1) * q)}</span></div>` : ''}
        ${s.vendor ? `<div class="t-row muted small"><span>Un NPC te lo compra a</span><span>${coin(s.vendor * q)}</span></div>` : ''}
      </div>`;
      if (s.buy && s.sell) {
        const flip = (Math.max(s.sell - 1, s.buy + 1) - listFee(Math.max(s.sell - 1, s.buy + 1)) - saleFee(Math.max(s.sell - 1, s.buy + 1)) - (s.buy + 1)) * q;
        html += `<div class="t-block"><h4>Flipeo (orden a ${coin(s.buy + 1)} → venta a ${coin(Math.max(s.sell - 1, s.buy + 1))})</h4>
          <div class="t-row tot"><span>Ganancia neta</span><span>${coin(flip)} ${useBtn(flip)}</span></div></div>`;
      }
    }
    $('tOut').innerHTML = html;
  }

  function pick(it) {
    selected = it;
    $('tSearch').value = '';
    $('tList').innerHTML = '';
    $('tItem').innerHTML = `<div class="t-sel">${itemCell(it)}
      <div class="t-prices"><span class="muted small">Venta</span> ${coin(it.sell || null)} <span class="muted small">· Orden</span> ${coin(it.buy || null)}</div>
      <button class="btn ghost small" id="tClear">Quitar</button></div>`;
    $('tClear').addEventListener('click', () => { selected = null; $('tItem').innerHTML = ''; renderTrade(); });
    setPrice(Math.max((it.sell || 0) - 1, it.buy ? it.buy + 1 : 0, 0));
    renderTrade();
  }

  const search = debounce(async () => {
    const q = $('tSearch').value.trim();
    if (q.length < 2) { $('tList').innerHTML = ''; return; }
    try {
      const d = await api(`/api/items?q=${encodeURIComponent(q)}&limit=8&sort=s1&dir=desc`);
      $('tList').innerHTML = d.rows.map((r, i) => `<button class="ac-opt" data-i="${i}">${itemCell(r)}<span class="ac-p">${coin(r.sell || null)}</span></button>`).join('') || '<div class="muted small ac-empty">Sin resultados</div>';
      $('tList').querySelectorAll('.ac-opt').forEach((b) => b.addEventListener('click', async () => {
        const r = d.rows[b.dataset.i];
        let vendor = 0;
        try { vendor = (await api(`/api/item/${r.id}`)).item.vendor || 0; } catch {}
        pick({ ...r, vendor });
      }));
    } catch {}
  }, 250);
  $('tSearch').addEventListener('input', search);
  ['tg', 'ts', 'tc', 'tq'].forEach((id) => $(id).addEventListener('input', (ev) => { ev.target.value = ev.target.value.replace(/\D/g, ''); renderTrade(); }));
  $('tOut').addEventListener('click', (ev) => {
    const b = ev.target.closest('.use');
    if (b) loadAmount(Number(b.dataset.cu));
  });

  render();
  renderTrade();
  focusEntry();

  // Si llegan precios nuevos, actualizamos el item elegido.
  return {
    refresh: async () => {
      if (!selected) return;
      try {
        const d = await api(`/api/items?q=${selected.id}&limit=1`);
        const r = d.rows.find((x) => x.id === selected.id);
        if (r) { selected = { ...selected, buy: r.buy, sell: r.sell }; renderTrade(); }
      } catch {}
    },
  };
}
