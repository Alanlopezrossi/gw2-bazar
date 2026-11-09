// "Cómo conseguirlo": guías cortas en español (public/como-conseguir.json) para materiales y monedas
// que no se explican solos con recetas/NPC, como la difluorita o las esquirlas espirituales.
let DATA = null;
export function comoData() {
  DATA ||= fetch('como-conseguir.json').then((r) => r.json()).catch(() => ({ items: {}, monedas: {} }));
  return DATA;
}

/** Busca la guía de un item (por id) o de una moneda (por nombre en inglés). */
export async function comoFind({ itemId, currencyEn }) {
  const d = await comoData();
  let e = itemId != null ? d.items?.[itemId] : null;
  if (e?.ver_moneda) return { ...d.monedas?.[e.ver_moneda], moneda: e.ver_moneda };
  if (!e && currencyEn) e = d.monedas?.[currencyEn];
  return e || null;
}

export function comoHTML(e, esc) {
  if (!e) return '';
  const ul = (l) => `<ul class="como-ul">${l.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  const wiki = e.wiki ? `<a class="small" target="_blank" rel="noopener" href="https://wiki.guildwars2.com/wiki/${encodeURIComponent(e.wiki.replace(/ /g, '_'))}">wiki ↗</a>` : '';
  return `<div class="section como"><h3>Cómo conseguirlo ${wiki}</h3>
    ${e.resumen ? `<p>${esc(e.resumen)}</p>` : ''}
    ${e.fuentes?.length ? `<h4>De dónde sale</h4>${ul(e.fuentes)}` : ''}
    ${e.usos?.length ? `<h4>Para qué sirve</h4>${ul(e.usos)}` : ''}
    ${e.tips?.length ? `<h4>Consejos</h4>${ul(e.tips)}` : ''}
    ${e.moneda ? '<p class="muted small">Ahora es una moneda de la cartera: la ves también en <a href="#/monedas">Monedas</a>.</p>' : ''}
  </div>`;
}
