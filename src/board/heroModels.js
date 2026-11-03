// Which 3D figure each hero gets on the 3D board (Board3D.jsx, figureModels.js), the gear it
// carries and how tall it stands. The box's five heroes and the fan heroes Berryloaf and Darna
// have their own figures, made from their card art (scripts/models/make-monsters.py, Hero_*);
// other fan heroes get one of the KayKit Adventurers (CC0, src/models) by class. Every hero's
// cape is dyed the hero's colour, so two heroes on the same figure still look apart.
// Monsters stay standees with their card art, except the ones we made figures for
// (monsterModel below).

// The gear each figure comes with, all hidden but what a hero carries.
export const MODEL_PROPS = {
  Knight: ['1H_Sword', '1H_Sword_Offhand', '2H_Sword', 'Badge_Shield', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield', 'Knight_Helmet'],
  Barbarian: ['1H_Axe', '1H_Axe_Offhand', '2H_Axe', 'Barbarian_Round_Shield', 'Mug', 'Barbarian_Hat'],
  Mage: ['1H_Wand', '2H_Staff', 'Spellbook', 'Spellbook_open', 'Mage_Hat'],
  Rogue: ['Knife', 'Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Throwable'],
  Rogue_Hooded: ['Knife', 'Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Throwable'],
  Orc_Smasher: [],
  Orc_Archer: [],
  Kobold_Dragonshield: [],
  Human_Cultist: [],
  Duergar_Guard: [],
  Snake: [],
  Cave_Bear: [],
  Legion_Devil: [],
  Grell: [],
  Kobold_Dragonlord: [],
  Duergar_Captain: [],
  Orc_Storm_Shaman: [],
  Gauth: [],
  Otyugh: [],
  Rage_Drake: [],
  Ashardalon: [],
  Villager_Alek: [],
  Villager_Brandis: [],
  Villager_Cassi: [],
  Villager_Donnel: [],
  Villager_Elizar: [],
  Gibbering_Mouther: [],
  Hero_Quinn: [],
  Hero_Vistra: [],
  Hero_Keyleth: [],
  Hero_Tarak: [],
  Hero_Heskan: [],
  Hero_Berryloaf: [],
  Hero_Darna: [],
}

// By hero (the box's five by key), then the fan heroes we made figures for (by name), then by
// the words in a hero's class, for other fan heroes.
const own = (model) => ({ model, gear: [] })
const BY_KEY = {
  cleric: own('Hero_Quinn'),
  fighter: own('Hero_Vistra'),
  paladin: own('Hero_Keyleth'),
  rogue: own('Hero_Tarak'),
  wizard: own('Hero_Heskan'),
}
const BY_NAME = {
  berryloaf: own('Hero_Berryloaf'),
  darna: own('Hero_Darna'),
}
const BY_CLASS = [
  [/druid/, { model: 'Mage', gear: ['2H_Staff'] }],
  [/wizard|mage|sorcer|warlock/, { model: 'Mage', gear: ['2H_Staff', 'Mage_Hat'] }],
  [/ranger|archer/, { model: 'Rogue', gear: ['2H_Crossbow'] }],
  [/assassin/, { model: 'Rogue_Hooded', gear: ['Knife', 'Knife_Offhand'] }],
  [/monk/, { model: 'Rogue', gear: [] }],
  [/bard|rogue/, { model: 'Rogue', gear: ['Knife'] }],
  [/battlemaster|warlord/, { model: 'Knight', gear: ['2H_Sword', 'Knight_Helmet'] }],
  [/paladin|cleric|knight/, { model: 'Knight', gear: ['1H_Sword', 'Round_Shield'] }],
  [/dwarf/, { model: 'Barbarian', gear: ['1H_Axe', 'Barbarian_Round_Shield', 'Barbarian_Hat'], height: 0.88 }],
  [/fighter|barbarian|warrior/, { model: 'Barbarian', gear: ['2H_Axe'] }],
]
const FALLBACK = { model: 'Knight', gear: ['1H_Sword', 'Round_Shield'] }

// { model, gear, height } for a hero ({ key, className }).
export function heroModel(hero) {
  const pick = BY_KEY[hero?.key] ?? BY_NAME[hero?.name?.toLowerCase()] ?? BY_CLASS.find(([words]) => words.test(`${hero?.key ?? ''} ${hero?.className ?? ''}`.toLowerCase()))?.[1] ?? FALLBACK
  return { height: 1, ...pick }
}

// The monsters and villains with their own 3D figure (made by scripts/models/make-monsters.py),
// by card name. Any other monster or villain gets null and stays a standee.
export const MONSTER_FIGURES = [
  [/orc smasher/i, 'Orc_Smasher'],
  [/orc archer/i, 'Orc_Archer'],
  [/kobold dragonshield/i, 'Kobold_Dragonshield'],
  [/kobold dragonlord/i, 'Kobold_Dragonlord'],
  [/duergar captain/i, 'Duergar_Captain'],
  [/storm shaman/i, 'Orc_Storm_Shaman'],
  [/^gauth$/i, 'Gauth'],
  [/otyugh/i, 'Otyugh'],
  [/rage drake/i, 'Rage_Drake'],
  [/^ashardalon$/i, 'Ashardalon'],
  [/\balek$/i, 'Villager_Alek'],
  [/\bbrandis$/i, 'Villager_Brandis'],
  [/\bcassi$/i, 'Villager_Cassi'],
  [/\bdonnel$/i, 'Villager_Donnel'],
  [/\belizar$/i, 'Villager_Elizar'],
  [/cultist/i, 'Human_Cultist'],
  [/duergar guard/i, 'Duergar_Guard'],
  [/^snake$/i, 'Snake'],
  [/bear/i, 'Cave_Bear'],
  [/legion devil/i, 'Legion_Devil'],
  [/grell/i, 'Grell'],
  [/gibbering mouther/i, 'Gibbering_Mouther'],
]

// The figures above that are villains (the #models page lists them as villains).
export const VILLAIN_MODELS = new Set(['Kobold_Dragonlord', 'Duergar_Captain', 'Orc_Storm_Shaman', 'Gauth', 'Otyugh', 'Rage_Drake', 'Ashardalon'])

// The villagers (the #models page lists them as villagers).
export const VILLAGER_MODELS = new Set(['Villager_Alek', 'Villager_Brandis', 'Villager_Cassi', 'Villager_Donnel', 'Villager_Elizar'])

// { model, gear, height } for a monster ({ name }), or null.
export function monsterModel(monster) {
  const model = MONSTER_FIGURES.find(([words]) => words.test(monster?.name ?? ''))?.[1]
  return model ? { model, gear: [], height: 1 } : null
}

// The move a figure makes for an attack's look (board/attackFx.js).
export function attackMove(look) {
  if (look === 'arrow') return 'shoot'
  if (look === 'shield') return 'throw'
  if (['weapon', 'slash', 'bite', 'claw'].includes(look)) return 'attack'
  return 'cast'
}
