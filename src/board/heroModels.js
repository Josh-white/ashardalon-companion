// Which 3D figure each hero gets on the 3D board (Board3D.jsx, figureModels.js): one of the
// KayKit Adventurers (CC0, src/models), the gear it carries and how tall it stands. The
// hero's cape is dyed the hero's colour, so two heroes on the same figure still look apart.
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
}

// By hero (the box's five by key), then by the words in a hero's class, for fan heroes.
const BY_KEY = {
  cleric: { model: 'Knight', gear: ['1H_Sword', 'Badge_Shield'] },
  fighter: { model: 'Barbarian', gear: ['1H_Axe', 'Barbarian_Round_Shield', 'Barbarian_Hat'], height: 0.88 },
  paladin: { model: 'Knight', gear: ['1H_Sword', 'Rectangle_Shield', 'Knight_Helmet'] },
  rogue: { model: 'Rogue_Hooded', gear: ['Knife', 'Knife_Offhand'] },
  wizard: { model: 'Mage', gear: ['2H_Staff', 'Mage_Hat'] },
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
  const pick = BY_KEY[hero?.key] ?? BY_CLASS.find(([words]) => words.test(`${hero?.key ?? ''} ${hero?.className ?? ''}`.toLowerCase()))?.[1] ?? FALLBACK
  return { height: 1, ...pick }
}

// The monsters with their own 3D figure (made by scripts/models/make-test-orc.py), by card
// name. Any other monster gets null and stays a standee.
const MONSTER_FIGURES = [
  [/orc smasher/i, 'Orc_Smasher'],
  [/orc archer/i, 'Orc_Archer'],
]

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
