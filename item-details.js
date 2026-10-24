// "Características" de un item, como el cartel del juego: daño, defensa, estadísticas, mejora incluida
// (runa/sello con sus bonificaciones o probabilidad de efecto), ranuras de infusión, estadísticas a elegir, efecto de consumibles…
// Se consulta directo a la API oficial (/v2/items, /v2/itemstats) desde el navegador.
const API = () => globalThis.GW2_API_BASE || 'https://api.guildwars2.com';
const cache = new Map();
const getJSON = async (path) => {
  if (cache.has(path)) return cache.get(path);
  const p = fetch(`${API()}${path}`, { signal: AbortSignal.timeout(20000) }).then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); });
  cache.set(path, p);
  p.catch(() => cache.delete(path));
  return p;
};

const ATTR = { Power: 'Potencia', Precision: 'Precisión', Toughness: 'Dureza', Vitality: 'Vitalidad', ConditionDamage: 'Daño de condición', ConditionDuration: 'Pericia', Healing: 'Poder de curación', BoonDuration: 'Concentración', CritDamage: 'Ferocidad', AgonyResistance: 'Resistencia a la agonía' };
const DMG = { Physical: 'Físico', Fire: 'Fuego', Ice: 'Hielo', Lightning: 'Relámpago', Choking: 'Asfixia' };
const WEIGHT = { Heavy: 'Pesada', Medium: 'Media', Light: 'Ligera', Clothing: 'Ropa' };
const SLOT = { Infusion: 'Infusión', Enrichment: 'Enriquecimiento', Agony: 'Agonía' };
const UPG = { Default: 'Mejora', Gem: 'Joya', Rune: 'Runa', Sigil: 'Sello' };
const CONS = { AppearanceChange: 'Cambio de apariencia', Booze: 'Bebida', ContractNpc: 'Contrato de NPC', Currency: 'Divisa', Food: 'Comida', Generic: 'Consumible', Halloween: 'Halloween', Immediate: 'Uso inmediato', MountRandomUnlock: 'Montura al azar', RandomUnlock: 'Desbloqueo al azar', Transmutation: 'Transmutación', Unlock: 'Desbloqueo', UpgradeRemoval: 'Quitar mejora', Utility: 'Utilidad (potenciador)', TeleportToFriend: 'Teletransporte a un amigo' };
const UNLOCK = { BagSlot: 'espacio de bolsa', BankTab: 'pestaña de banco', Champion: 'campeón de Mistlock', CollectibleCapacity: 'espacio en el depósito de materiales', Content: 'contenido', CraftingRecipe: 'receta de crafteo', Dye: 'tinte', GliderSkin: 'aspecto de planeador', Minipet: 'minimascota', Ms: 'aspecto de montura', Outfit: 'atuendo', RandomUlock: 'desbloqueo al azar', SharedSlot: 'espacio compartido de inventario' };
const TYPE_ES = { Axe: 'Hacha', Dagger: 'Daga', Mace: 'Maza', Pistol: 'Pistola', Scepter: 'Cetro', Sword: 'Espada', Focus: 'Foco', Shield: 'Escudo', Torch: 'Antorcha', Warhorn: 'Cuerno de guerra', Greatsword: 'Mandoble', Hammer: 'Martillo', LongBow: 'Arco largo', Rifle: 'Rifle', ShortBow: 'Arco corto', Staff: 'Báculo', Harpoon: 'Fusil de arpón', Speargun: 'Fusil de arpón', Spear: 'Lanza', Trident: 'Tridente', Boots: 'Botas', Coat: 'Pecho', Gloves: 'Guantes', Helm: 'Casco', HelmAquatic: 'Casco acuático', Leggings: 'Perneras', Shoulders: 'Hombreras', Accessory: 'Accesorio', Amulet: 'Amuleto', Ring: 'Anillo', HeavyArmor: 'armadura pesada', MediumArmor: 'armadura media', LightArmor: 'armadura ligera', Trinket: 'abalorios', Back: 'espalda', Infusion: 'infusión', Enrichment: 'enriquecimiento', Defense: 'defensa', Offense: 'ataque', Utility: 'utilidad', Agony: 'agonía', TwoHandedToy: 'juguete a dos manos', SmallBundle: 'objeto pequeño', LargeBundle: 'objeto grande', Toy: 'juguete' };
const fmtDur = (ms) => { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : m ? `${m} min` : `${Math.round(ms / 1000)} s`; };
const clean = (t) => String(t || '').replace(/<c=@[^>]*>/g, '').replace(/<\/c>/g, '').replace(/<br\s*\/?>/gi, '\n');

export async function renderDetails(box, id, { esc }) {
  box.innerHTML = '<div class="skeleton" style="height:60px"></div>';
  try {
    const it = await getJSON(`/v2/items/${id}?lang=es`);
    const d = it.details || {};
    const rows = [];
    const add = (k, v) => { if (v != null && v !== '') rows.push(`<div class="ch-row"><span class="k">${k}</span><span class="v">${v}</span></div>`); };

    // Tipo y números base
    if (it.type === 'Weapon') {
      add('Arma', esc(TYPE_ES[d.type] || d.type));
      if (d.max_power) add('Fuerza del arma', `<b>${d.min_power.toLocaleString('es-AR')} – ${d.max_power.toLocaleString('es-AR')}</b>${d.damage_type && d.damage_type !== 'Physical' ? ` <span class="muted">(daño de ${DMG[d.damage_type] || d.damage_type})</span>` : ''}`);
      if (d.defense) add('Defensa', d.defense.toLocaleString('es-AR'));
    } else if (it.type === 'Armor') {
      add('Armadura', `${esc(TYPE_ES[d.type] || d.type)} · ${esc(WEIGHT[d.weight_class] || d.weight_class || '')}`);
      if (d.defense) add('Defensa', `<b>${d.defense.toLocaleString('es-AR')}</b>`);
    } else if (it.type === 'Trinket') add('Abalorio', esc(TYPE_ES[d.type] || d.type));
    else if (it.type === 'Back') add('Espalda', 'Objeto para espalda');
    else if (it.type === 'Bag') add('Bolsa', `${d.size} espacios${d.no_sell_or_sort ? ' · invisible (no se vende ni se ordena lo que guarda)' : ''}`);
    else if (it.type === 'Gathering') add('Herramienta de recolección', esc({ Foraging: 'Hoz', Logging: 'Hacha de leñador', Mining: 'Pico', Foo: 'Cebo', Bait: 'Cebo', Lure: 'Señuelo' }[d.type] || d.type));
    else if (it.type === 'Tool') add('Herramienta', `${d.charges ? `${d.charges} usos` : ''}`);
    else if (it.type === 'Container') add('Contenedor', esc({ Default: 'Se abre con doble clic', GiftBox: 'Caja de regalo', Immediate: 'Se abre al recibirlo', OpenUI: 'Abre una ventana para elegir' }[d.type] || d.type));

    // Estadísticas fijas (infix) + set
    const infix = d.infix_upgrade;
    if (infix?.attributes?.length) {
      let setName = '';
      if (infix.id) { try { setName = (await getJSON(`/v2/itemstats/${infix.id}?lang=es`)).name || ''; } catch {} }
      add(`Estadísticas${setName ? ` <span class="pill">${esc(setName)}</span>` : ''}`, infix.attributes.map((a) => `<span class="ch-attr">+${a.modifier.toLocaleString('es-AR')} ${esc(ATTR[a.attribute] || a.attribute)}</span>`).join(''));
    }
    // Efecto especial (sellos, comida, mejoras): suele traer la "probabilidad de…"
    if (infix?.buff?.description) add(it.type === 'UpgradeComponent' && d.type === 'Sigil' ? 'Efecto del sello' : 'Efecto', `<span class="ch-buff">${esc(clean(infix.buff.description)).replace(/\n/g, '<br>')}</span>`);

    // Estadísticas a elegir (legendarias, ascendidas con selección)
    if (d.stat_choices?.length) {
      try {
        const st = await getJSON(`/v2/itemstats?ids=${d.stat_choices.join(',')}&lang=es`);
        const adj = d.attribute_adjustment || 0;
        add(`Estadísticas a elegir (${st.length})`, `<details class="ch-choices"><summary>Ver opciones con sus valores</summary><ul>${st.filter((s) => s.name).sort((a, b) => a.name.localeCompare(b.name, 'es')).map((s) => `<li><b>${esc(s.name)}</b>: ${s.attributes.map((a) => `+${Math.round(adj * a.multiplier + a.value).toLocaleString('es-AR')} ${esc(ATTR[a.attribute] || a.attribute)}`).join(', ')}</li>`).join('')}</ul></details>`);
      } catch { add('Estadísticas a elegir', `${d.stat_choices.length} opciones`); }
    }

    // Mejoras incluidas (runa, sello, joya)
    const ups = [d.suffix_item_id, d.secondary_suffix_item_id].filter(Boolean);
    for (const uid of ups) {
      try {
        const u = await getJSON(`/v2/items/${uid}?lang=es`);
        add('Mejora incluida', `<a href="#/item/${u.id}" class="ch-up">${u.icon ? `<img src="${esc(u.icon)}" alt="">` : ''}<b class="rar-${esc(u.rarity)}">${esc(u.name)}</b></a>${upgradeText(u, esc)}`);
      } catch { add('Mejora incluida', `<a href="#/item/${uid}">item #${uid}</a>`); }
    }
    // Si el propio item es una mejora: bonificaciones de runa, etc.
    if (it.type === 'UpgradeComponent') {
      add('Tipo de mejora', `${esc(UPG[d.type] || d.type)}${d.flags?.length ? ` <span class="muted small">— para ${esc([...new Set(d.flags.map((f) => TYPE_ES[f] || f))].slice(0, 14).join(', '))}${new Set(d.flags.map((f) => TYPE_ES[f] || f)).size > 14 ? '…' : ''}</span>` : ''}`);
      if (d.bonuses?.length) add('Bonificaciones (por cantidad de piezas)', `<ol class="ch-bonus">${d.bonuses.map((b) => `<li>${esc(clean(b))}</li>`).join('')}</ol>`);
      if (d.infusion_upgrade_flags?.length) add('Encaja en', esc(d.infusion_upgrade_flags.map((f) => SLOT[f] || f).join(', ')));
    }
    // Ranuras de infusión
    if (d.infusion_slots?.length) add('Ranuras', d.infusion_slots.map((s) => `<span class="pill">${esc((s.flags || []).map((f) => SLOT[f] || f).join('/') || 'Infusión')}${s.item_id ? ' (ocupada)' : ' (vacía)'}</span>`).join(' '));
    // Consumibles
    if (it.type === 'Consumable') {
      add('Consumible', esc(CONS[d.type] || d.type || ''));
      if (d.name || d.description) add('Efecto al usarlo', `${d.name && !/^consumible$/i.test(d.name) ? `<b>${esc(d.name)}</b><br>` : ''}${esc(clean(d.description || '')).replace(/\n/g, '<br>')}`);
      if (d.duration_ms) add('Duración', fmtDur(d.duration_ms));
      if (d.apply_count) add('Cargas', d.apply_count);
      if (d.unlock_type) add('Desbloquea', esc(UNLOCK[d.unlock_type] || d.unlock_type));
      if (d.recipe_id) add('Enseña la receta', `#${d.recipe_id}`);
    }
    // Requisitos y otros datos
    if (it.level) add('Nivel requerido', it.level);
    if (it.restrictions?.length) add('Restringido a', esc(it.restrictions.join(', ')));
    if (it.default_skin && it.type !== 'Consumable') add('Aspecto', `desbloquea su apariencia en el armario`);

    box.innerHTML = rows.length ? `<div class="ch-grid">${rows.join('')}</div>` : '<p class="muted small">La API no publica características especiales para este item.</p>';
  } catch (e) {
    box.innerHTML = `<p class="muted small">No pude traer las características (${esc(e.message)}). ${/404/.test(e.message) ? 'Este item ya no está en la API oficial.' : ''}</p>`;
  }
}

function upgradeText(u, esc) {
  const d = u.details || {};
  const parts = [];
  if (d.infix_upgrade?.attributes?.length) parts.push(d.infix_upgrade.attributes.map((a) => `+${a.modifier} ${ATTR[a.attribute] || a.attribute}`).join(', '));
  if (d.infix_upgrade?.buff?.description) parts.push(clean(d.infix_upgrade.buff.description));
  const body = parts.length ? `<div class="small">${esc(parts.join(' · ')).replace(/\n/g, '<br>')}</div>` : '';
  const bon = d.bonuses?.length ? `<ol class="ch-bonus small">${d.bonuses.map((b) => `<li>${esc(clean(b))}</li>`).join('')}</ol>` : '';
  return body + bon;
}
