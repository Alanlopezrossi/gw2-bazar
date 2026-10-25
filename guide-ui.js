// Apartado "Guía" de la ficha del item.
const DISC = { Armorsmith: 'Forjador de armaduras', Artificer: 'Artífice', Chef: 'Cocinero', Homesteader: 'Hacendado', Huntsman: 'Cazador', Jeweler: 'Joyero', Leatherworker: 'Peletero', Scribe: 'Escriba', Tailor: 'Sastre', Weaponsmith: 'Armero', 'Mystic Forge': 'Forja Mística' };
const nf = (n) => Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 });

export async function renderGuide(box, id, { api, esc, coin, mode = 'instant' }) {
  box.innerHTML = '<div class="skeleton" style="height:80px"></div>';
  let g;
  try { g = await api(`/api/item/${id}/guide?mode=${mode}`); } catch (e) { box.innerHTML = `<p class="muted small">No pude armar la guía: ${esc(e.message)}</p>`; return; }
  const link = (x, qty) => `<a href="#/item/${x.id}" class="gd-it">${x.icon ? `<img src="${esc(x.icon)}" alt="">` : ''}${qty != null ? `<b>${nf(qty)}</b> ` : ''}<span class="rar-${esc(x.rarity || '')}">${esc(x.name)}</span></a>`;
  const rich = (ps) => ps.map((p) => (p.t != null ? esc(p.t) : link(p, p.qty))).join('');
  const cur = (c) => (c.type === 'Currency' && c.id === 1 ? coin(c.total ?? c.qty) : `${nf(c.total ?? c.qty)} × ${esc(c.type === 'Currency' ? `moneda #${c.id}` : c.type)}`);
  const parts = [];

  // 1) Guía escrita a mano (cadenas especiales)
  if (g.curated) {
    const c = g.curated;
    parts.push(`<div class="gd-cur"><h4>📘 ${esc(c.title)}</h4><p>${rich(c.intro)}</p>
      ${c.requires.length ? `<h5>Requisitos</h5><ul>${c.requires.map((r) => `<li>${rich(r)}</li>`).join('')}</ul>` : ''}
      ${c.needs.length ? `<h5>Qué necesitás en total</h5><div class="gd-needs">${c.needs.map((n) => `<span>${link(n, n.qty)}${n.total ? ` <span class="muted small">≈ ${coin(n.total)}</span>` : ''}</span>`).join('')}</div>` : ''}
      ${c.sections.map((s) => `<details class="gd-step-sec" ${s.here || c.sections.length <= 2 ? 'open' : ''}><summary><b>${esc(s.title)}</b>${s.here ? ' <span class="pill good">este item está acá</span>' : ''}</summary><ol>${s.steps.map((st) => `<li>${rich(st)}</li>`).join('')}</ol></details>`).join('')}
      <p class="muted small">Fuente: ${esc(c.source || '')}.</p></div>`);
  }

  // 2) Cómo se consigue (resumen)
  const ob = (g.obtain || []).filter((o) => o.kind !== 'note');
  if (ob.length) parts.push(`<h5>Cómo se consigue</h5><ul class="gd-ob">${ob.map((o) => `<li><b>${esc(o.title)}</b>${o.text && o.text !== o.title ? `: ${esc(o.text)}` : ''}</li>`).join('')}</ul>`);
  else if (!g.curated && !g.plan) parts.push('<p class="muted">No hay ninguna fuente registrada para este item: suele salir de drops al azar, eventos, historia o ya no se puede conseguir.</p>');

  // 3) Plan de crafteo automático
  if (g.plan) {
    const p = g.plan;
    const req = [];
    for (const g of p.disciplines) req.push(`${g.ds.length > 1 ? 'Cualquiera de: ' : ''}<b>${esc(g.ds.map((d) => DISC[d] || d).join(' / '))}</b> nivel <b>${g.r}</b> <span class="muted small">(para ${esc(g.items.join(', '))}${g.more ? ` y ${g.more} más` : ''})</span>`);
    if (p.forge) req.push('Acceso a la <b>Forja Mística</b> (Arco del León o Santuario de Mistlock)');
    if (p.recipes.length) req.push(`Hay que <b>aprender la receta</b> de: ${esc(p.recipes.join(', '))}`);
    if (p.gated.length) req.push(`<b>Límite diario</b> (1 por día): ${esc(p.gated.join(', '))}`);
    const nobuy = p.needs.filter((n) => n.unit == null);
    parts.push(`${req.length ? `<h5>Requisitos</h5><ul>${req.map((r) => `<li>${r}</li>`).join('')}</ul>` : ''}
      <h5>Qué necesitás (materiales base)</h5>
      <div class="table-wrap"><table class="ing"><thead><tr><th>Material</th><th>Cantidad</th><th>En el bazar</th><th>Si no se compra</th></tr></thead><tbody>
        ${p.needs.map((n) => `<tr><td class="left">${link(n)}</td><td class="num">${nf(n.qty)}</td><td>${n.total != null ? `${coin(n.total)} <span class="muted small">(${coin(n.unit)} c/u)</span>` : '<span class="pill warn">no se vende</span>'}</td><td class="left small">${n.how?.length ? esc(n.how.join(' · ')) : n.unit == null ? '<span class="muted">tocá el item para ver de dónde sale</span>' : ''}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="small">Costo de lo que se compra: <b>${coin(p.missingCost)}</b>${nobuy.length ? ` · <span class="warn-t">${nobuy.length} cosa${nobuy.length === 1 ? '' : 's'} no se compra${nobuy.length === 1 ? '' : 'n'}</span>` : ''}${p.currencies.length ? ` · además: ${p.currencies.map(cur).join(', ')}` : ''}</p>
      <h5>Paso a paso (${p.steps.length})</h5>
      <ol class="gd-steps">${p.steps.map((s) => `<li><b>${s.how === 'forja' ? '🔮 Forja Mística' : `⚒ ${esc(s.disciplines.map((d) => DISC[d] || d).join(' / '))}${s.rating ? ` ${s.rating}` : ''}`}</b>: hacé ${link(s, s.crafts * s.out)}${s.crafts > 1 ? ` <span class="muted small">(${nf(s.crafts)} ${s.crafts === 1 ? 'vez' : 'veces'}${s.out > 1 ? `, da ${s.out} c/u` : ''})</span>` : ''}${s.needsRecipe ? ' <span class="pill warn">requiere receta</span>' : ''}${s.gated ? ' <span class="pill warn">1 por día</span>' : ''}
        <div class="gd-ings">con ${s.ings.map((x) => link(x, x.total)).join(' + ')}${s.cur.length ? ` + ${s.cur.map(cur).join(' + ')}` : ''}</div></li>`).join('')}</ol>
      <p class="muted small">Plan más barato: lo que conviene comprar hecho no se craftea. Precios ${mode === 'order' ? 'con órdenes de compra' : 'comprando al instante'}.</p>`);
  }

  // 4) Logros
  const a = g.achievements || {};
  const achLi = (x, extra = '') => `<li><a href="#/logro/${x.id}">${esc(x.name)}</a>${x.category ? ` <span class="muted small">— ${esc(x.category)}</span>` : ''}${extra}</li>`;
  if (a.reward?.length) parts.push(`<h5>🏆 Logros que lo dan como recompensa</h5><ul>${a.reward.map((x) => achLi(x)).join('')}</ul>`);
  if (a.components?.length) parts.push(`<h5>🏆 Logros que dan componentes que necesitás</h5><ul>${a.components.map((x) => achLi(x, ` → <a href="#/item/${x.itemId}">${esc(x.item)}</a>`)).join('')}</ul>`);
  if (a.part?.length) parts.push(`<h5>Colecciones y logros que lo piden</h5><ul>${a.part.map((x) => achLi(x)).join('')}</ul>`);

  // 5) Para qué sirve
  if (g.usedInTotal) parts.push(`<h5>Para qué sirve</h5><p class="small">Es ingrediente de ${g.usedInTotal} receta${g.usedInTotal === 1 ? '' : 's'}: ${g.usedIn.map((x) => link(x)).join(', ')}${g.usedInTotal > g.usedIn.length ? '…' : ''}</p>`);

  box.innerHTML = parts.join('') || '<p class="muted">Sin datos para armar una guía.</p>';
}
