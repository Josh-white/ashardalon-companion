// Starting stats for the five heroes in the box. Every number can be changed
// on the setup screen, so check them against your hero cards.
// For heroes whose fixed power is a daily: 2 at-wills, 1 utility, the fixed daily and 1 chosen daily.
const DAILY_FIXED_POWER_SLOTS = ['at-will', 'at-will', 'utility', 'daily', 'daily']

export const HERO_TEMPLATES = [
  { key: 'cleric', name: 'Quinn', className: 'Human Cleric', color: 'sky', maxHp: 8, ac: 17, surgeValue: 4, speed: 5 },
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
  },
  // Checked against Keyleth's hero card.
  { key: 'paladin', name: 'Keyleth', className: 'Elf Paladin', color: 'amber', maxHp: 8, ac: 17, surgeValue: 4, speed: 6 },
  // Checked against Tarak's hero card.
  { key: 'rogue', name: 'Tarak', className: 'Half-Orc Rogue', color: 'emerald', maxHp: 8, ac: 14, surgeValue: 4, speed: 6 },
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
  },
]

export const STARTING_SURGES = 2
export const XP_TO_CANCEL_ENCOUNTER = 5
export const XP_TO_LEVEL_UP = 5
// From the 2nd-level side of the hero cards: +2 HP, +1 AC, +1 surge value, and one more daily power.
export const LEVEL_UP_HP_BONUS = 2
export const LEVEL_UP_AC_BONUS = 1
export const LEVEL_UP_SURGE_BONUS = 1

export const CONDITIONS = ['Dazed', 'Immobilized', 'Poisoned', 'Slowed', 'Weakened']

// Tailwind needs full class names in the source, so they are spelled out here.
export const HERO_COLORS = {
  sky: { ring: 'ring-sky-400', text: 'text-sky-300', bg: 'bg-sky-900/40', solid: 'bg-sky-500' },
  red: { ring: 'ring-red-400', text: 'text-red-300', bg: 'bg-red-900/40', solid: 'bg-red-500' },
  amber: { ring: 'ring-amber-400', text: 'text-amber-300', bg: 'bg-amber-900/40', solid: 'bg-amber-500' },
  emerald: { ring: 'ring-emerald-400', text: 'text-emerald-300', bg: 'bg-emerald-900/40', solid: 'bg-emerald-500' },
  violet: { ring: 'ring-violet-400', text: 'text-violet-300', bg: 'bg-violet-900/40', solid: 'bg-violet-500' },
}
