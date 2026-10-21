// Traducciones de los valores fijos que la API devuelve en inglés aunque pidas lang=es.

export const TYPES = {
  Armor: 'Armadura',
  Back: 'Espalda',
  Bag: 'Bolsa',
  Consumable: 'Consumible',
  Container: 'Contenedor',
  CraftingMaterial: 'Material de artesanía',
  Gathering: 'Herramienta de recolección',
  Gizmo: 'Artilugio',
  JadeTechModule: 'Módulo de tecnología de jade',
  Key: 'Llave',
  MiniPet: 'Minimascota',
  PowerCore: 'Núcleo de energía',
  Relic: 'Reliquia',
  Tool: 'Herramienta',
  Trait: 'Guía de rasgo',
  Trinket: 'Abalorio',
  Trophy: 'Trofeo',
  UpgradeComponent: 'Componente de mejora',
  Weapon: 'Arma',
};

export const RARITIES = {
  Junk: 'Basura',
  Basic: 'Básico',
  Fine: 'Bueno',
  Masterwork: 'Obra maestra',
  Rare: 'Raro',
  Exotic: 'Exótico',
  Ascended: 'Ascendido',
  Legendary: 'Legendario',
};

export const RARITY_ORDER = ['Junk', 'Basic', 'Fine', 'Masterwork', 'Rare', 'Exotic', 'Ascended', 'Legendary'];

export const DISCIPLINES = {
  Armorsmith: 'Forjador de armaduras',
  Artificer: 'Artífice',
  Chef: 'Cocinero',
  Homesteader: 'Hacendado',
  Huntsman: 'Cazador',
  Jeweler: 'Joyero',
  Leatherworker: 'Peletero',
  Scribe: 'Escriba',
  Tailor: 'Sastre',
  Weaponsmith: 'Armero',
};

export const GAME_TYPES = {
  Activity: 'Actividades',
  Dungeon: 'Mazmorras',
  Pve: 'PvE',
  Pvp: 'PvP',
  PvpLobby: 'Lobby PvP',
  Wvw: 'WvW',
};

export const RECIPE_FLAGS = {
  AutoLearned: 'Se aprende al subir la disciplina',
  LearnedFromItem: 'Requiere aprender la receta (item de receta)',
};

// Pistas generales por tipo de item, para cuando la wiki no está disponible.
export const GENERIC_HINTS = {
  CraftingMaterial: [
    'Los materiales básicos se recolectan en nodos (minería, tala, cosecha) o salen de reciclar equipo.',
    'Muchos materiales finos (sangre, colmillos, garras, etc.) caen de enemigos y de bolsas de botín.',
    'Revisá el depósito de materiales: lo que guardes ahí se puede vender directo desde el bazar.',
  ],
  Trophy: [
    'Los trofeos suelen caer de enemigos, eventos y bolsas de botín.',
    'Algunos se obtienen reciclando items (por ejemplo, el ectoplasma sale de reciclar equipo raro/exótico).',
  ],
  Container: [
    'Los contenedores suelen salir de eventos, recompensas de logros, mapas o la Forja Mística.',
  ],
  Consumable: [
    'Los consumibles se craftean (cocinero, artífice, escriba) o se compran a comerciantes y en el bazar.',
  ],
  UpgradeComponent: [
    'Runas y sigilos: se craftean, salen de reciclar equipo exótico con un kit, o se compran en el bazar.',
  ],
  Weapon: [
    'Las armas se craftean (forjador de armas, artífice, cazador), caen de enemigos o se compran a comerciantes de karma/insignias.',
  ],
  Armor: [
    'Las armaduras se craftean (forjador de armaduras, peletero, sastre), caen como botín o se compran con karma/insignias de mazmorras y WvW.',
  ],
  Trinket: ['Los abalorios los craftea el joyero o se obtienen con monedas de mapa, laurel o WvW.'],
  MiniPet: ['Las minis suelen salir de la tienda de gemas, la Forja Mística o eventos de temporada.'],
  Gizmo: ['Los artilugios suelen venir de la tienda de gemas, eventos de festival o logros.'],
};
