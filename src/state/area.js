import { activeVillains } from './game.js'

// Where the heroes are in the dungeon, for the screen's background and border.
// The app doesn't know which tile each hero stands on, so it goes by what it does
// know: a villain on the board, the last special tile revealed, and otherwise how
// far into the tile stack the party has drawn.

// `glow` is the border's colour (r g b), `wash` the background's light and where it
// comes from, `pulse` makes the border breathe.
export const AREAS = {
  start: { label: 'Start tile', emoji: '🔥', glow: '217 119 6', wash: ['217 119 6', 'top'] },
  battlefield: { label: 'Ancient Battlefield', emoji: '⚔️', glow: '161 98 7', wash: ['120 113 108', 'top'] },
  halls: { label: 'Upper halls', emoji: '🧱', glow: '100 116 139', wash: ['71 85 105', 'top'] },
  tunnels: { label: 'Deep tunnels', emoji: '🕳️', glow: '8 145 178', wash: ['14 116 144', 'bottom'] },
  depths: { label: 'Fiery depths', emoji: '🌋', glow: '234 88 12', wash: ['194 65 12', 'bottom'] },
  'dire-chamber': { label: 'Dire Chamber', emoji: '🔮', glow: '147 51 234', wash: ['126 34 206', 'center'] },
  'horrid-chamber': { label: 'Horrid Chamber', emoji: '🦠', glow: '101 163 13', wash: ['77 124 15', 'center'] },
  chamber: { label: 'Secret chamber', emoji: '🚪', glow: '168 85 247', wash: ['107 33 168', 'center'] },
  vault: { label: 'The Vault', emoji: '💰', glow: '234 179 8', wash: ['202 138 4', 'center'] },
  exit: { label: 'Near the way out', emoji: '🌤️', glow: '56 189 248', wash: ['125 211 252', 'top'] },
  villain: { label: 'Villain', emoji: '👑', glow: '219 39 119', wash: ['157 23 77', 'center'], pulse: true },
  ashardalon: { label: "Ashardalon's lair", emoji: '🐉', glow: '239 68 68', wash: ['220 38 38', 'bottom'], pulse: true },
}

// How many tiles drawn before the dungeon looks deeper.
export const DEEP_AT = 7
export const DEPTHS_AT = 14

// The area a special tile leads into, or null for one that doesn't change it.
export function tileArea(tile = '') {
  if (/dire chamber/i.test(tile)) return 'dire-chamber'
  if (/horrid chamber/i.test(tile)) return 'horrid-chamber'
  if (/chamber/i.test(tile)) return 'chamber'
  if (/vault/i.test(tile)) return 'vault'
  if (/exit/i.test(tile)) return 'exit'
  return null
}

// The area key for the game right now, or null outside a game. `label` names the
// villain when there is one.
export function dungeonArea(state) {
  if (state?.status !== 'playing') return null
  const villains = activeVillains(state)
  if (villains.some((v) => /ashardalon/i.test(v.name))) return { key: 'ashardalon', label: AREAS.ashardalon.label }
  if (villains.length > 0) return { key: 'villain', label: `${villains[0].name}'s lair` }

  const revealed = state.adventure?.revealed ?? []
  for (let i = revealed.length - 1; i >= 0; i--) {
    const key = tileArea(revealed[i])
    if (key) return { key, label: AREAS[key].label }
  }

  const drawn = state.tileStack?.drawn ?? (state.turn?.explored ? 1 : 0)
  let key = 'halls'
  if (drawn >= DEPTHS_AT) key = 'depths'
  else if (drawn >= DEEP_AT) key = 'tunnels'
  else if (drawn === 0) key = (state.adventure?.card.setup ?? []).some((line) => /Ancient Battlefield/i.test(line)) ? 'battlefield' : 'start'
  return { key, label: AREAS[key].label }
}
