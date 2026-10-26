// Starting stats for the five heroes in the box. Every number can be changed
// on the setup screen, so check them against your hero cards.
export const HERO_TEMPLATES = [
  { key: 'cleric', name: 'Quinn', className: 'Human Cleric', color: 'sky', maxHp: 8, ac: 17, surgeValue: 4, speed: 5 },
  { key: 'fighter', name: 'Vistra', className: 'Dwarf Fighter', color: 'red', maxHp: 10, ac: 18, surgeValue: 5, speed: 5 },
  { key: 'paladin', name: 'Keyleth', className: 'Dragonborn Paladin', color: 'amber', maxHp: 10, ac: 18, surgeValue: 5, speed: 5 },
  { key: 'rogue', name: 'Tarak', className: 'Half-Orc Rogue', color: 'emerald', maxHp: 8, ac: 17, surgeValue: 4, speed: 7 },
  { key: 'wizard', name: 'Heskan', className: 'Dragonborn Wizard', color: 'violet', maxHp: 6, ac: 14, surgeValue: 3, speed: 5 },
]

export const STARTING_SURGES = 2
export const XP_TO_CANCEL_ENCOUNTER = 5
export const XP_TO_LEVEL_UP = 5
export const LEVEL_UP_HP_BONUS = 2

export const CONDITIONS = ['Dazed', 'Immobilized', 'Poisoned', 'Slowed', 'Weakened']

// Tailwind needs full class names in the source, so they are spelled out here.
export const HERO_COLORS = {
  sky: { ring: 'ring-sky-400', text: 'text-sky-300', bg: 'bg-sky-900/40', solid: 'bg-sky-500' },
  red: { ring: 'ring-red-400', text: 'text-red-300', bg: 'bg-red-900/40', solid: 'bg-red-500' },
  amber: { ring: 'ring-amber-400', text: 'text-amber-300', bg: 'bg-amber-900/40', solid: 'bg-amber-500' },
  emerald: { ring: 'ring-emerald-400', text: 'text-emerald-300', bg: 'bg-emerald-900/40', solid: 'bg-emerald-500' },
  violet: { ring: 'ring-violet-400', text: 'text-violet-300', bg: 'bg-violet-900/40', solid: 'bg-violet-500' },
}
