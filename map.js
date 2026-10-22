// Pestaña "Mapa": mapa interactivo de Tyria (mosaicos oficiales) con los NPC vendedores.
let gmap = null;

export async function renderMap(view, { api, esc, toast, focusKey, normalize }) {
  if (gmap) { try { gmap.remove(); } catch {} gmap = null; }
  view.innerHTML = `
    <div class="page-head"><div><h1>Mapa</h1><p>NPC que venden cosas, ubicados en el mapa de Tyria según la wiki. Filtrá por moneda (ej: magia volátil) o buscá un item o un NPC. El punto marca el <b>sector</b> del mapa donde está el NPC (la API no da su posición exacta); el waypoint más cercano se copia con un toque.</p></div></div>
    <div class="filters">
      <input type="search" id="mq" placeholder="Buscar NPC, item o zona… (ej: Ectoplasma, Rojan, Istan)">
      <label>Moneda <select id="mcur"><option value="">Todas</option></select></label>
      <span class="muted small" id="mcount"></span>
    </div>
    <div class="map-grid">
      <div class="map-list" id="mlist"><div class="skeleton"></div></div>
      <div class="map-box"><div id="gmap"></div></div>
    </div>
    <div class="section" id="munplaced"></div>`;
  let d;
  try {
    d = await api('/api/vendors');
  } catch (e) {
    view.querySelector('#mlist').innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    return { refresh() {} };
  }
  if (!d.ready || !window.L) {
    view.querySelector('#mlist').innerHTML = `<div class="empty">${!window.L ? 'No se pudo cargar la librería del mapa (Leaflet). Revisá la conexión.' : 'Todavía no está el índice del mapa (src/geo.json).'}</div>`;
    return { refresh() {} };
  }
  const L = window.L;
  // Las coordenadas de la API son píxeles en zoom 7 (los mosaicos llegan hasta 7, aunque la API diga 8).
  const Z = 7;
  gmap = L.map('gmap', { crs: L.CRS.Simple, minZoom: -1, maxZoom: Z + 1, zoomSnap: 0.5, zoomDelta: 0.5, wheelPxPerZoomLevel: 90, zoomControl: true, attributionControl: true });
  window.gw2map = gmap;
  const un = (c) => gmap.unproject(c, Z);
  const bounds = L.latLngBounds(un([0, d.geo.dims[1]]), un([d.geo.dims[0], 0]));
  L.tileLayer('https://tiles.guildwars2.com/1/1/{z}/{x}/{y}.jpg', { minZoom: -1, maxZoom: Z + 1, minNativeZoom: 0, maxNativeZoom: Z, bounds, noWrap: true, attribution: 'Mapa © ArenaNet · datos: API oficial y wiki de GW2' }).addTo(gmap);
  gmap.setMaxBounds(bounds.pad(0.25));
  // Arranca mostrando el continente entero; con la rueda o los botones se acerca a cualquier mapa.
  gmap.fitBounds(bounds);
  // Nombres de zonas: regiones (lejos), mapas (zoom medio) y sectores (cerca). En español; al pasar el cursor, en inglés.
  gmap.createPane('labels');
  gmap.getPane('labels').style.zIndex = 350;
  const lbl = (kind) => (x) => L.marker(un(x.c), {
    pane: 'labels', keyboard: false,
    icon: L.divIcon({ className: `map-label ${kind}${x.city ? ' city' : ''}`, html: `<span>${esc(x.es)}</span>`, iconSize: null }),
  }).bindTooltip(x.en === x.es ? x.en : `${esc(x.en)} <span class="muted">(inglés)</span>`, { direction: 'top', offset: [0, -8], className: 'label-tip' });
  const L_ = d.labels || { regions: [], maps: [], sectors: [] };
  const groups = {
    regions: L.layerGroup(L_.regions.map(lbl('lbl-region'))),
    maps: L.layerGroup(L_.maps.map(lbl('lbl-map'))),
    sectors: L.layerGroup(L_.sectors.map(lbl('lbl-sector'))),
  };
  function showLabels() {
    const z = gmap.getZoom();
    const want = { regions: z < 2, maps: z >= 2 && z < 5, sectors: z >= 5 };
    gmap.getContainer().classList.toggle('z-far', z < 1);
    for (const [k, g] of Object.entries(groups)) {
      if (want[k] && !gmap.hasLayer(g)) g.addTo(gmap);
      if (!want[k] && gmap.hasLayer(g)) gmap.removeLayer(g);
    }
  }
  gmap.on('zoomend', showLabels);
  showLabels();
  const layer = L.layerGroup().addTo(gmap);

  const sel = view.querySelector('#mcur');
  sel.innerHTML += d.currencies.map((c) => `<option value="${esc(c.es)}">${esc(c.es)} · ${c.n} NPC</option>`).join('');

  const popup = (m) => `
    <div class="mpop">
      <b>${esc(m.vendor)}</b>
      <div class="muted small">${esc(m.loc.mapName || m.zone)}${m.loc.sector ? ` · ${esc(m.loc.sector)}` : ''}${m.loc.precision === 'mapa' ? ' <i>(ubicación aproximada: centro del mapa)</i>' : ''}</div>
      ${m.waypoint ? `<div class="small">Waypoint más cercano: <b>${esc(m.waypoint.name)}</b> <button class="btn ghost small" data-copy="${esc(m.waypoint.chat)}">Copiar ${esc(m.waypoint.chat)}</button></div>` : ''}
      <ul>${m.items.slice(0, 40).map((i) => `<li>${i.id ? `<a href="#/item/${i.id}">${esc(i.name)}</a>` : esc(i.name)} <span class="muted small">— ${esc(i.cost)}</span></li>`).join('')}${m.items.length > 40 ? `<li class="muted small">y ${m.items.length - 40} más…</li>` : ''}</ul>
    </div>`;

  const markerOf = new Map();
  let outline = null;
  let shown = [];
  function apply() {
    const q = normalize(view.querySelector('#mq').value).trim();
    const cur = sel.value;
    layer.clearLayers();
    markerOf.clear();
    shown = d.markers.filter((m) => {
      if (cur && !m.currencies.some((c) => c.es === cur)) return false;
      if (!q) return true;
      const hay = normalize(`${m.vendor} ${m.zone} ${m.area} ${m.loc.mapName || ''} ${m.items.map((i) => i.name).join(' ')}`);
      return q.split(/\s+/).every((w) => hay.includes(w));
    });
    // NPC en el mismo sector: los abrimos en espiral para que no queden apilados en un solo punto.
    const stack = new Map();
    for (const m of shown) {
      const ck = m.loc.coord.join(',');
      const i = stack.get(ck) || 0;
      stack.set(ck, i + 1);
      const a = i * 2.399963, r = i ? 22 * Math.sqrt(i) : 0;
      m.pos = [m.loc.coord[0] + r * Math.cos(a), m.loc.coord[1] + r * Math.sin(a)];
      const R = m.loc.rect;
      if (R) m.pos = [Math.min(Math.max(m.pos[0], R[0][0] + 10), R[1][0] - 10), Math.min(Math.max(m.pos[1], R[0][1] + 10), R[1][1] - 10)];
      const mk = L.circleMarker(un(m.pos), { radius: m.loc.precision === 'sector' ? 7 : 5, color: '#1a1407', weight: 1.5, fillColor: m.loc.precision === 'sector' ? '#f0c873' : '#9a958a', fillOpacity: 0.95 })
        .bindTooltip(esc(m.vendor), { direction: 'top' })
        .bindPopup(popup(m), { maxWidth: 360, maxHeight: 320 });
      mk.addTo(layer);
      markerOf.set(m.key, mk);
    }
    view.querySelector('#mcount').textContent = `${shown.length} NPC en el mapa`;
    view.querySelector('#mlist').innerHTML = shown.length
      ? shown.slice(0, 400).map((m) => `<button class="mitem" data-key="${esc(m.key)}"><b>${esc(m.vendor)}</b><span class="muted small">${esc(m.loc.mapName || m.zone)}${m.loc.sector ? ` · ${esc(m.loc.sector)}` : ''}</span><span class="small">${m.items.length} item${m.items.length === 1 ? '' : 's'} · ${esc([...new Set(m.currencies.map((c) => c.es))].slice(0, 3).join(', '))}</span></button>`).join('')
      : '<div class="empty">Nada coincide.</div>';
  }
  function focus(key) {
    const m = d.markers.find((x) => x.key === key);
    const mk = markerOf.get(key);
    if (!m || !mk) return false;
    if (outline) outline.remove();
    if (m.loc.rect) outline = L.rectangle(L.latLngBounds(un(m.loc.rect[0]), un(m.loc.rect[1])), { color: '#f0c873', weight: 1.5, dashArray: '6 4', fill: false, interactive: false }).addTo(gmap);
    gmap.once('moveend', () => mk.openPopup());
    gmap.flyTo(un(m.pos || m.loc.coord), 6, { duration: 0.8 });
    return true;
  }
  view.querySelector('#mq').addEventListener('input', () => apply());
  sel.addEventListener('change', () => apply());
  view.querySelector('#mlist').addEventListener('click', (e) => {
    const b = e.target.closest('[data-key]');
    if (b) focus(b.dataset.key);
  });
  view.querySelector('.map-box').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    try { await navigator.clipboard.writeText(b.dataset.copy); toast('Waypoint copiado: pegalo en el chat del juego'); } catch { toast(b.dataset.copy); }
  });
  apply();
  const un2 = d.unplaced || [];
  view.querySelector('#munplaced').innerHTML = un2.length
    ? `<h3>NPC sin ubicación en el mapa de Tyria <span class="muted small">(${un2.length}: WvW, PvP, Niebla o nombres que no coinciden)</span></h3>
       <div class="table-wrap"><table class="ing"><thead><tr><th>NPC</th><th>Zona</th><th>Vende</th></tr></thead><tbody>
       ${un2.slice(0, 200).map((m) => `<tr><td class="left">${esc(m.vendor)}</td><td class="left small">${esc([m.area, m.zone].filter(Boolean).join(' · '))}</td><td class="left small">${m.items.slice(0, 6).map((i) => (i.id ? `<a href="#/item/${i.id}">${esc(i.name)}</a>` : esc(i.name))).join(', ')}${m.items.length > 6 ? '…' : ''}</td></tr>`).join('')}
       </tbody></table></div>`
    : '';
  // #/mapa/@x,y,Nombre → marcar un lugar (por ejemplo, desde la guía de un logro).
  if (focusKey && focusKey.startsWith('@')) {
    const [x, y, ...rest] = focusKey.slice(1).split(',');
    const name = rest.join(',');
    const pin = L.marker(un([Number(x), Number(y)]), { title: name }).addTo(gmap).bindPopup(`<b>${esc(name)}</b>`);
    gmap.setView(un([Number(x), Number(y)]), 5);
    setTimeout(() => pin.openPopup(), 300);
    focusKey = null;
  }
  if (focusKey && !focus(focusKey)) {
    // Si estaba filtrado, limpiamos filtros y reintentamos.
    view.querySelector('#mq').value = '';
    sel.value = '';
    apply();
    focus(focusKey);
  }
  setTimeout(() => gmap && gmap.invalidateSize(), 50);
  return { refresh() {} };
}
