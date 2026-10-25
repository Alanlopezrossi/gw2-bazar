// Pestaña "Builds": las 9 profesiones con todas sus especializaciones y rasgos (API oficial, en español),
// armador de builds que genera el código de plantilla para pegar en el juego, lector de códigos [&DQ…],
// builds guardadas en el navegador y accesos a los sitios de builds meta.
const API = () => globalThis.GW2_API_BASE || 'https://api.guildwars2.com';
const V = 'v=2019-12-19T00:00:00.000Z';
const STORE = 'gw2-bazar-builds';
const PROFS = ['Guardian', 'Warrior', 'Engineer', 'Ranger', 'Thief', 'Elementalist', 'Mesmer', 'Necromancer', 'Revenant'];
const cache = new Map();
const get = (path) => {
  if (!cache.has(path)) {
    const p = fetch(`${API()}${path}`, { signal: AbortSignal.timeout(25000) }).then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); });
    cache.set(path, p);
    p.catch(() => cache.delete(path));
  }
  return cache.get(path);
};
const clean = (t) => String(t || '').replace(/<c=@[^>]*>/g, '').replace(/<\/c>/g, '').replace(/<br\s*\/?>/gi, '\n');
const loadSaved = () => { try { return JSON.parse(localStorage.getItem(STORE) || '[]'); } catch { return []; } };
const storeSaved = (l) => { try { localStorage.setItem(STORE, JSON.stringify(l)); } catch { /* sin almacenamiento */ } };

/** [&DQ…] → objeto build. Formato oficial de plantillas (tipo 0x0D). */
export function decodeBuild(code) {
  const m = String(code).match(/\[&([A-Za-z0-9+/=]+)\]/);
  if (!m) throw new Error('Pegá un código de plantilla que empiece con [&DQ');
  const bin = atob(m[1]);
  const b = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  if (b[0] !== 0x0d || b.length < 28) throw new Error('Ese código no es una plantilla de build (tiene que empezar con [&DQ).');
  const u16 = (i) => b[i] | (b[i + 1] << 8);
  const specs = [0, 1, 2].map((k) => { const t = b[3 + k * 2] || 0; return { id: b[2 + k * 2], traits: [t & 3, (t >> 2) & 3, (t >> 4) & 3] }; });
  const pal = Array.from({ length: 10 }, (_, i) => u16(8 + i * 2));
  return { prof: b[1], specs, skills: { heal: pal[0], utils: [pal[2], pal[4], pal[6]], elite: pal[8] }, aquatic: { heal: pal[1], utils: [pal[3], pal[5], pal[7]], elite: pal[9] }, extra: Array.from(b.slice(28, 32)), raw: b };
}
/** objeto build → [&DQ…] (conserva habilidades y datos extra si venían de un código pegado). */
export function encodeBuild(build) {
  const len = build.raw ? Math.max(44, build.raw.length) : 44;
  const b = new Uint8Array(len);
  if (build.raw) b.set(build.raw.slice(0, len));
  b[0] = 0x0d; b[1] = build.prof;
  build.specs.forEach((s, k) => { b[2 + k * 2] = s.id || 0; b[3 + k * 2] = (s.traits[0] & 3) | ((s.traits[1] & 3) << 2) | ((s.traits[2] & 3) << 4); });
  const put = (i, v) => { b[i] = v & 255; b[i + 1] = (v >> 8) & 255; };
  const sk = build.skills || {}, aq = build.aquatic || sk;
  [sk.heal, aq.heal, sk.utils?.[0], aq.utils?.[0], sk.utils?.[1], aq.utils?.[1], sk.utils?.[2], aq.utils?.[2], sk.elite, aq.elite].forEach((v, i) => put(8 + i * 2, v || 0));
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return `[&${btoa(s)}]`;
}

export function renderBuilds(view, { esc, toast }) {
  let profs = null; // por nombre
  let build = { prof: 1, specs: [{ id: 0, traits: [0, 0, 0] }, { id: 0, traits: [0, 0, 0] }, { id: 0, traits: [0, 0, 0] }], skills: null, raw: null };
  let profName = 'Guardian';
  view.innerHTML = `
    <div class="page-head"><div><h1>Builds</h1><p>Las 9 profesiones con todas sus especializaciones y rasgos en español. Armá tu build tocando los rasgos y copiá el <b>código de plantilla</b> para pegarlo en el juego (panel de héroe → Construcción → pegar), o pegá un código para verlo acá.</p></div></div>
    <div class="prof-cards bld-profs" id="bProfs"><div class="skeleton"></div></div>
    <div class="section bld-code">
      <div class="filters">
        <input type="text" id="bPaste" placeholder="Pegá un código de build [&DQ…] para verlo" style="flex:1;min-width:260px">
        <button class="btn small" id="bLoad">Ver build</button>
      </div>
      <div class="bld-out"><span class="muted small">Código de esta build:</span> <code id="bCode">—</code> <button class="btn ghost small" id="bCopy">Copiar</button> <button class="btn ghost small" id="bSave">Guardar</button> <button class="btn ghost small" id="bReset">Limpiar</button></div>
    </div>
    <div id="bBody"><div class="skeleton"></div></div>
    <div class="section"><h3>Mis builds guardadas</h3><div id="bSaved"></div></div>
    <div class="section"><h3>Builds recomendadas (meta) de cada profesión</h3><div id="bMeta"></div>
      <p class="muted small">Las builds meta cambian con cada parche; estos sitios las mantienen al día. Copiá su código de plantilla y pegalo arriba para verla en español.</p></div>`;

  const paintCode = () => { view.querySelector('#bCode').textContent = encodeBuild(build); };

  async function init() {
    try {
      const list = await get(`/v2/professions?ids=all&lang=es&${V}`);
      profs = Object.fromEntries(list.map((p) => [p.id, p]));
      view.querySelector('#bProfs').innerHTML = PROFS.filter((p) => profs[p]).map((p) => `<button type="button" class="prof-card ${p === profName ? 'on' : ''}" data-p="${p}"><img src="${esc(profs[p].icon_big || profs[p].icon)}" alt="" class="bld-picon"><b>${esc(profs[p].name)}</b></button>`).join('');
      view.querySelector('#bMeta').innerHTML = `<div class="links">${PROFS.filter((p) => profs[p]).map((p) => `<a class="btn ghost small" target="_blank" rel="noopener" href="https://metabattle.com/wiki/${p}">${esc(profs[p].name)} · MetaBattle ↗</a>`).join('')}</div>
        <div class="links" style="margin-top:8px"><a class="btn ghost small" target="_blank" rel="noopener" href="https://snowcrows.com/builds">Snow Crows (incursiones y fractales) ↗</a><a class="btn ghost small" target="_blank" rel="noopener" href="https://hardstuck.gg/gw2/builds/">Hardstuck ↗</a><a class="btn ghost small" target="_blank" rel="noopener" href="https://guildjen.com/builds/">GuildJen ↗</a></div>`;
      selectProf(profName, true);
    } catch (e) {
      view.querySelector('#bBody').innerHTML = `<div class="empty">No pude cargar las profesiones de la API: ${esc(e.message)}</div>`;
    }
  }

  function selectProf(name, keep = false) {
    profName = name;
    const p = profs[name];
    view.querySelectorAll('#bProfs .prof-card').forEach((x) => x.classList.toggle('on', x.dataset.p === name));
    if (!keep || build.prof !== p.code) build = { prof: p.code, specs: [{ id: 0, traits: [0, 0, 0] }, { id: 0, traits: [0, 0, 0] }, { id: 0, traits: [0, 0, 0] }], skills: null, raw: null };
    paint();
  }

  async function paint() {
    const p = profs[profName];
    const box = view.querySelector('#bBody');
    box.innerHTML = '<div class="skeleton"></div>';
    try {
      const specs = await get(`/v2/specializations?ids=${p.specializations.join(',')}&lang=es`);
      const traitIds = specs.flatMap((s) => [...s.minor_traits, ...s.major_traits]);
      const traits = Object.fromEntries((await get(`/v2/traits?ids=${traitIds.join(',')}&lang=es`)).map((t) => [t.id, t]));
      const byId = Object.fromEntries(specs.map((s) => [s.id, s]));
      const core = specs.filter((s) => !s.elite), elite = specs.filter((s) => s.elite);
      // Si no hay especializaciones elegidas, proponemos las tres primeras centrales.
      build.specs.forEach((s, i) => { if (!byId[s.id]) s.id = 0; });
      const slotHTML = (i) => {
        const cur = byId[build.specs[i].id];
        const opts = (i === 2 ? [...core, ...elite] : core).filter((s) => s.id === build.specs[i].id || !build.specs.some((x, j) => j !== i && x.id === s.id));
        const tiers = cur ? [1, 2, 3].map((t) => {
          const minor = traits[cur.minor_traits[t - 1]];
          const majors = cur.major_traits.map((id) => traits[id]).filter((x) => x && x.tier === t).sort((a, c) => a.order - c.order);
          return `<div class="bld-tier"><div class="bld-minor" title="${esc(minor ? `${minor.name}\n${clean(minor.description)}` : '')}">${minor?.icon ? `<img src="${esc(minor.icon)}" alt="">` : ''}</div>
            <div class="bld-majors">${majors.map((m, k) => `<button type="button" class="bld-trait ${build.specs[i].traits[t - 1] === k + 1 ? 'on' : ''}" data-slot="${i}" data-tier="${t}" data-choice="${k + 1}" title="${esc(`${m.name}\n${clean(m.description)}`)}"><img src="${esc(m.icon)}" alt=""><span>${esc(m.name)}</span></button>`).join('')}</div></div>`;
        }).join('') : '<p class="muted small">Elegí una especialización.</p>';
        return `<div class="bld-slot" ${cur?.background ? `style="--bg:url('${esc(cur.background)}')"` : ''}>
          <div class="bld-head">${cur?.icon ? `<img src="${esc(cur.icon)}" alt="">` : ''}<select data-spec="${i}"><option value="0">— ${i === 2 ? 'especialización (central o de élite)' : 'especialización'} —</option>${opts.map((s) => `<option value="${s.id}" ${s.id === build.specs[i].id ? 'selected' : ''}>${esc(s.name)}${s.elite ? ' (élite)' : ''}</option>`).join('')}</select>${cur?.elite ? '<span class="pill warn">élite</span>' : ''}</div>
          <div class="bld-tiers">${tiers}</div></div>`;
      };
      // Habilidades (si vinieron en un código pegado)
      let skillsHTML = '';
      if (build.skills && (build.skills.heal || build.skills.elite)) {
        const pal = new Map(p.skills_by_palette || []);
        const ids = [build.skills.heal, ...build.skills.utils, build.skills.elite].map((x) => pal.get(x)).filter(Boolean);
        const sk = ids.length ? Object.fromEntries((await get(`/v2/skills?ids=${ids.join(',')}&lang=es`)).map((s) => [s.id, s])) : {};
        const one = (palId, label) => { const s = sk[pal.get(palId)]; return `<div class="bld-skill" title="${esc(s ? `${s.name}\n${clean(s.description)}` : '')}">${s?.icon ? `<img src="${esc(s.icon)}" alt="">` : '<span class="icon-ph"></span>'}<span class="small">${esc(s?.name || label)}</span></div>`; };
        skillsHTML = `<div class="section"><h3>Habilidades</h3><div class="bld-skills">${one(build.skills.heal, 'Curación')}${build.skills.utils.map((u) => one(u, 'Utilidad')).join('')}${one(build.skills.elite, 'Élite')}</div><p class="muted small">Habilidades del código pegado (las de tierra). El armador de esta página sólo cambia especializaciones y rasgos; las habilidades se conservan.</p></div>`;
      }
      box.innerHTML = `<div class="bld-slots">${[0, 1, 2].map(slotHTML).join('')}</div>${skillsHTML}
        <p class="muted small">Pasá el mouse por un rasgo para leer qué hace. Datos de la API oficial (rasgos y descripciones en español).</p>`;
      paintCode();
    } catch (e) {
      box.innerHTML = `<div class="empty">No pude cargar las especializaciones: ${esc(e.message)}</div>`;
    }
  }

  function paintSaved() {
    const l = loadSaved();
    view.querySelector('#bSaved').innerHTML = l.length ? `<div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Profesión</th><th>Código</th><th></th></tr></thead><tbody>${l.map((x, i) => `<tr><td class="left">${esc(x.name)}</td><td class="left">${esc(profs?.[x.prof]?.name || x.prof)}</td><td class="left small"><code>${esc(x.code)}</code></td><td class="left"><button class="btn ghost small" data-open="${i}">Abrir</button> <button class="btn ghost small" data-copy="${i}">Copiar</button> <button class="icon-btn" data-del="${i}" title="Borrar">✕</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">Todavía no guardaste ninguna build. Se guardan sólo en este navegador.</p>';
  }

  view.addEventListener('click', async (e) => {
    const pc = e.target.closest('#bProfs [data-p]');
    if (pc) return selectProf(pc.dataset.p);
    const t = e.target.closest('.bld-trait');
    if (t) { const s = build.specs[Number(t.dataset.slot)]; const tier = Number(t.dataset.tier) - 1; const c = Number(t.dataset.choice); s.traits[tier] = s.traits[tier] === c ? 0 : c; return paint(); }
    const op = e.target.closest('[data-open]');
    if (op) { const x = loadSaved()[Number(op.dataset.open)]; if (x) loadCode(x.code); return; }
    const cp = e.target.closest('#bSaved [data-copy]');
    if (cp) { const x = loadSaved()[Number(cp.dataset.copy)]; try { await navigator.clipboard.writeText(x.code); toast('Código copiado'); } catch { toast(x.code); } return; }
    const dl = e.target.closest('#bSaved [data-del]');
    if (dl) { const l = loadSaved(); l.splice(Number(dl.dataset.del), 1); storeSaved(l); return paintSaved(); }
  });
  view.addEventListener('change', (e) => {
    const s = e.target.closest('[data-spec]');
    if (!s) return;
    const i = Number(s.dataset.spec);
    build.specs[i] = { id: Number(s.value) || 0, traits: [0, 0, 0] };
    paint();
  });
  function loadCode(code) {
    try {
      const b = decodeBuild(code);
      const name = Object.values(profs).find((p) => p.code === b.prof)?.id;
      if (!name) throw new Error('Profesión desconocida en el código.');
      build = b;
      selectProf(name, true);
      toast('Build cargada');
    } catch (err) { toast(err.message); }
  }
  view.querySelector('#bLoad').addEventListener('click', () => loadCode(view.querySelector('#bPaste').value));
  view.querySelector('#bPaste').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadCode(e.target.value); });
  view.querySelector('#bCopy').addEventListener('click', async () => { const c = encodeBuild(build); try { await navigator.clipboard.writeText(c); toast('Código copiado: pegalo en el panel de construcción del juego'); } catch { toast(c); } });
  view.querySelector('#bSave').addEventListener('click', () => {
    const name = prompt('Nombre para esta build:', `${profs?.[profName]?.name || profName} — mi build`);
    if (!name) return;
    const l = loadSaved();
    l.push({ name, prof: profName, code: encodeBuild(build), at: Date.now() });
    storeSaved(l); paintSaved(); toast('Build guardada');
  });
  view.querySelector('#bReset').addEventListener('click', () => { build = { prof: profs[profName].code, specs: [0, 1, 2].map(() => ({ id: 0, traits: [0, 0, 0] })), skills: null, raw: null }; paint(); });

  init().then(paintSaved);
  return { refresh() {} };
}
