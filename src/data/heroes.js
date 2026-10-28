// Level-1 stats for the five heroes in the box, from the 1st-level side of each hero card.
// For heroes whose fixed power is a daily: 2 at-wills, 1 utility, the fixed daily and 1 chosen daily.
// `abilityEffects` are the hero card abilities the app does for you (ABILITY_EFFECTS below).
const DAILY_FIXED_POWER_SLOTS = ['at-will', 'at-will', 'utility', 'daily', 'daily']

export const HERO_TEMPLATES = [
  // Checked against Quinn's hero card.
  { key: 'cleric', name: 'Quinn', className: 'Human Cleric', color: 'sky', maxHp: 8, ac: 16, surgeValue: 4, speed: 5, abilityEffects: ['saving-grace'], spellSound: 'holy' },
  // Checked against Vistra's hero card. Her fixed power, Dwarven Resilience, is a daily.
  {
    key: 'fighter',
    name: 'Vistra',
    className: 'Dwarf Fighter',
    color: 'red',
    maxHp: 8,
    ac: 17,
    surgeValue: 4,
    speed: 5,
    powerSlots: DAILY_FIXED_POWER_SLOTS,
    abilityEffects: ['cast-iron-stomach'],
  },
  // Checked against Keyleth's hero card.
  { key: 'paladin', name: 'Keyleth', className: 'Elf Paladin', color: 'amber', maxHp: 8, ac: 17, surgeValue: 4, speed: 6, abilityEffects: ['healing-hands'] },
  // Checked against Tarak's hero card.
  { key: 'rogue', name: 'Tarak', className: 'Half-Orc Rogue', color: 'emerald', maxHp: 8, ac: 14, surgeValue: 4, speed: 6, abilityEffects: ['brutal-recovery'] },
  // Checked against Heskan's hero card. His fixed power, Hurled Breath, is a daily.
  {
    key: 'wizard',
    name: 'Heskan',
    className: 'Dragonborn Wizard',
    color: 'violet',
    maxHp: 6,
    ac: 14,
    surgeValue: 3,
    speed: 6,
    powerSlots: DAILY_FIXED_POWER_SLOTS,
    abilityEffects: ['mage-hand'],
    spellSound: 'arcane',
  },
]

// The heroes players can pick: the box's five, plus any homebrew heroes in cards.json.
// The Pi and each screen set this from the card file (setHeroTemplates); until then,
// and when the file lists none, it's the five in the box.
let templates = HERO_TEMPLATES
export const heroTemplates = () => templates
export const templateFor = (key) => templates.find((t) => t.key === key) ?? HERO_TEMPLATES.find((t) => t.key === key)
export function setHeroTemplates(list) {
  templates = Array.isArray(list) && list.length > 0 ? list : HERO_TEMPLATES
}

// What a hero card ability can do for you, for abilities written in cards.json with an `effect`.
export const ABILITY_EFFECTS = [
  'saving-grace', // a hero who regains HP can also end a condition (Quinn)
  'healing-hands', // a healing surge heals 1 more (Keyleth)
  'brutal-recovery', // a natural 20 can flip Furious Assault back over (Tarak)
  'cast-iron-stomach', // +5 to rolls to end Poisoned (Vistra)
  'mage-hand', // opens doors anywhere on the hero's tile (Heskan)
]
// A hero in a saved game from before abilities were saved on the hero uses its template's.
export const hasAbility = (hero, effect) => Boolean(hero) && (hero.abilityEffects ?? templateFor(hero.key)?.abilityEffects ?? []).includes(effect)

export const STARTING_SURGES = 2
export const XP_TO_CANCEL_ENCOUNTER = 5
export const XP_TO_LEVEL_UP = 5
// From the 2nd-level side of the hero cards: +2 HP, +1 AC, +1 surge value, and one more daily power.
export const LEVEL_UP_HP_BONUS = 2
export const LEVEL_UP_AC_BONUS = 1
export const LEVEL_UP_SURGE_BONUS = 1
// The box's heroes stop at level 2. A homebrew hero's `levels` can list more rows for later.
export const MAX_LEVEL = 2
export const LEVEL_STATS = ['maxHp', 'ac', 'surgeValue', 'speed']

// A hero's HP, AC, surge value and speed at `level`. Each level after the first uses the
// template's row for it (a homebrew hero's `levels`), or the box's level-2 bonuses.
export function statsAtLevel(template, level = 1) {
  let stats = Object.fromEntries(LEVEL_STATS.map((stat) => [stat, template[stat]]))
  for (let n = 2; n <= level; n++) {
    const row = template.levels?.find((r) => r.level === n)
    stats = row
      ? { ...stats, ...Object.fromEntries(LEVEL_STATS.filter((stat) => row[stat] !== undefined).map((stat) => [stat, row[stat]])) }
      : { ...stats, maxHp: stats.maxHp + LEVEL_UP_HP_BONUS, ac: stats.ac + LEVEL_UP_AC_BONUS, surgeValue: stats.surgeValue + LEVEL_UP_SURGE_BONUS }
  }
  return stats
}

// The power card a level adds: one more daily, unless a homebrew hero's row says otherwise.
export const addedSlot = (template, level) => template?.levels?.find((r) => r.level === level)?.addSlot ?? 'daily'

export const CONDITIONS = ['Dazed', 'Immobilized', 'Poisoned', 'Slowed', 'Weakened']

// Tailwind needs full class names in the source, so they are spelled out here.
export const HERO_COLORS = {
  sky: { ring: 'ring-sky-400', text: 'text-sky-300', bg: 'bg-sky-900/40', solid: 'bg-sky-500' },
  red: { ring: 'ring-red-400', text: 'text-red-300', bg: 'bg-red-900/40', solid: 'bg-red-500' },
  amber: { ring: 'ring-amber-400', text: 'text-amber-300', bg: 'bg-amber-900/40', solid: 'bg-amber-500' },
  emerald: { ring: 'ring-emerald-400', text: 'text-emerald-300', bg: 'bg-emerald-900/40', solid: 'bg-emerald-500' },
  violet: { ring: 'ring-violet-400', text: 'text-violet-300', bg: 'bg-violet-900/40', solid: 'bg-violet-500' },
  // Spare colors for homebrew heroes.
  teal: { ring: 'ring-teal-400', text: 'text-teal-300', bg: 'bg-teal-900/40', solid: 'bg-teal-500' },
  rose: { ring: 'ring-rose-400', text: 'text-rose-300', bg: 'bg-rose-900/40', solid: 'bg-rose-500' },
  orange: { ring: 'ring-orange-400', text: 'text-orange-300', bg: 'bg-orange-900/40', solid: 'bg-orange-500' },
  lime: { ring: 'ring-lime-400', text: 'text-lime-300', bg: 'bg-lime-900/40', solid: 'bg-lime-500' },
  fuchsia: { ring: 'ring-fuchsia-400', text: 'text-fuchsia-300', bg: 'bg-fuchsia-900/40', solid: 'bg-fuchsia-500' },
}
