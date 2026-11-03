// The attack animation on the virtual board (Colton's idea): when a hero attacks a
// monster, or a monster attacks a hero, the attack flies from one token to the other
// and the target flinches, dodges or falls. The reducer works out what to draw once,
// from the board before the attack, and puts it on the moment as `fx`, so every screen
// draws the same thing (a defeated monster's token is already gone from the board).
// AttackFx.jsx draws it.
import { monsterArt } from '../data/art.js'
import { powerKey, spellKind } from '../audio/spellKind.js'
import { findFoe } from '../state/gameHelpers.js'
import { figureToken } from './play.js'
import { baseId } from './grid.js'

// The moment's own screen shows the die first; the board animation starts once it's read.
export const FX_DELAY_MS = 2400
// The whole animation, with its slow motion at the hit.
export const FX_MS = 2300
// When the attack reaches its target, from the animation's start.
export const FX_IMPACT_MS = 1000
// A monster that walks up to a hero before it attacks walks first, in view: the die and the
// animation wait this long (about the 3D figure's walk, a step at a time).
const WALK_STEP_MS = 290
// A moment can also wait for something already playing on the board (`moment.wait`, in ms):
// a Time Leap's monster card waits for the hero to vanish up the beam of light first. And
// one that comes while the last attack's animation is still playing waits for it to end
// (`moment.after`, in ms, see withMomentQueue), so a card never covers an attack.
export function fxLeadMs(moment) {
  const steps = moment?.fx?.walk ?? 0
  return (moment?.after ?? 0) + (moment?.wait ?? 0) + (steps > 0 ? Math.min(6, steps) * WALK_STEP_MS + 250 : 0)
}

// When a moment's attack animation is over on the board, in ms from the moment (0 for a
// moment with no animation).
export const fxEndMs = (moment) => (moment?.fx ? fxLeadMs(moment) + FX_DELAY_MS + FX_MS : 0)

// The reducer's last step: a new moment that comes while the last one's attack is still
// playing (the treasure after a kill, the next monster's turn, a quick tap) waits for the
// attack to finish: its card, sounds, narrator and its moves on the board all hold back.
// An Undo (an older moment coming back) doesn't wait.
export function withMomentQueue(before, after, now = Date.now()) {
  const last = before?.moment
  const next = after?.moment
  if (!last?.fx || !next || next.id === last.id || next.after != null || next.at < last.at) return after
  const left = last.at + fxEndMs(last) - now
  return left > 0 ? { ...after, moment: { ...next, after: left } } : after
}

// How long a hero takes to rise up the beam of light off the 3D board (board3dFx.js
// playExit3D), and a monster or villager to drop through the portal.
export const HERO_EXIT_MS = 1800
export const FIGURE_EXIT_MS = 1500

// How a monster's attack looks, from its name on the card.
const MONSTER_LOOKS = [
  ['arrow', /arrow|bow|quill|spear|javelin|dart|shot/],
  ['wind', /wind|gust|whirl/],
  ['zap', /lightning|shock|storm/],
  ['ray', /\bray\b/],
  ['fire', /fire|flame|breath|burn/],
  ['bite', /bite|fang|jaw|maw/],
  ['claw', /claw|tentacle|tail|sweep|slam|swipe|talon/],
  ['psychic', /gibber|scream|fear|mind|howl/],
]
export function monsterLook(attackName = '') {
  const lower = attackName.toLowerCase()
  return MONSTER_LOOKS.find(([, words]) => words.test(lower))?.[0] ?? 'slash'
}

// The colour of a gauth's eye ray.
export function rayColor(attackName = '') {
  const lower = attackName.toLowerCase()
  if (/fire/.test(lower)) return '#fb923c'
  if (/poison/.test(lower)) return '#a3e635'
  if (/exhaust/.test(lower)) return '#94a3b8'
  if (/anti|magic/.test(lower)) return '#c084fc'
  return '#7dd3fc'
}

// Attacks with a look of their own, by the power's (or item's) name.
const NAMED_LOOKS = { 'throwing shield': 'shield' }

// A hero's attack looks like its sound: lightning, fire, frost and so on, or a sword
// swing for a weapon attack. The Throwing Shield flies at the monster and comes back.
export const heroLook = (title = '') => NAMED_LOOKS[powerKey(title.split(': ')[1] ?? '')] ?? spellKind(title) ?? 'weapon'

// The square a monster's token stands on (its first figure, for a card with several).
const foeSquare = (board, id) => board.tokens[id] ?? board.tokens[figureToken(id, 2)] ?? board.tokens[figureToken(id, 3)] ?? null

const sameSquare = (a, b) => a[0] === b[0] && a[1] === b[1]
const steps = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]))
// The squares of a monster card's figures on a board, nearest the hero first.
const figureSquares = (board, id, from) =>
  Object.entries(board?.tokens ?? {})
    .filter(([token]) => baseId(token) === id)
    .map(([, at]) => at)
    .sort((a, b) => steps(a, from) - steps(b, from))

// Which square each shot flies to. A card with several figures (the Legion Devils) has a
// token for each, so a hit that fells one aims at the token that left the board, and the
// other shots at the figures still standing, nearest the hero first, one figure each.
function aimShots(before, after, rolls, from) {
  const groups = new Map()
  const group = (id) => {
    if (!groups.has(id)) {
      const was = figureSquares(before.board, id, from)
      const still = figureSquares(after.board, id, from)
      const gone = was.filter((at) => !still.some((s) => sameSquare(s, at)))
      const lost = Math.max(0, was.length - still.length)
      groups.set(id, { fallen: gone.slice(0, lost), standing: [...was.filter((at) => !gone.slice(0, lost).includes(at))], used: 0, kills: 0 })
    }
    return groups.get(id)
  }
  return rolls.map((r) => {
    if (!r.monsterId) return null
    const g = group(r.monsterId)
    if (r.hit && g.kills < g.fallen.length) return { to: g.fallen[g.kills++], fell: true }
    const to = g.standing.length > 0 ? g.standing[g.used++ % g.standing.length] : g.fallen[0] ?? foeSquare(before.board, r.monsterId)
    return to ? { to, fell: false } : null
  })
}

// What to animate for this action, or null: { look, by: 'hero' | 'monster', from, shots }.
// Each shot is { to, result: 'hit' | 'miss' | 'kill' | 'down', dealt, art? }, squares are [x, y].
export function attackFx(before, after, action) {
  const board = before?.board
  const moment = after?.moment
  if (!board || !moment || moment.id === before.moment?.id || !(moment.rolls?.length > 0)) return null

  if (action.type === 'HERO_ATTACK') {
    const from = board.tokens[action.heroId]
    if (!from) return null
    const aims = aimShots(before, after, moment.rolls, from)
    const shots = moment.rolls.flatMap((r, i) => {
      const aim = aims[i]
      if (!aim) return []
      const foe = findFoe(before, r.monsterId)
      const gone = aim.fell || !findFoe(after, r.monsterId)
      return [{ to: aim.to, result: r.hit ? (gone ? 'kill' : 'hit') : 'miss', dealt: r.dealt ?? 0, art: r.hit && gone ? monsterArt(foe) : null }]
    })
    return shots.length > 0 ? { look: heroLook(moment.title), by: 'hero', from, shots } : null
  }

  if (action.type === 'MONSTER_ATTACK') {
    // The figure taking its turn, for a card with several (the Legion Devils).
    const from = (action.token && board.tokens[action.token]) || foeSquare(board, action.monsterId)
    if (!from) return null
    const results = after.turn?.lastMonsterAttack?.results ?? []
    const shots = moment.rolls.flatMap((r) => {
      const to = board.tokens[r.heroId]
      if (!to) return []
      const row = results.find((x) => x.heroId === r.heroId)
      const was = [...before.heroes, ...(before.villagers ?? [])].find((h) => h.id === r.heroId)
      const now = [...after.heroes, ...(after.villagers ?? [])].find((h) => h.id === r.heroId)
      const down = was?.hp > 0 && now?.hp === 0
      return [{ to, result: r.hit ? (down ? 'down' : 'hit') : 'miss', dealt: row?.dealt ?? 0 }]
    })
    const attackName = moment.title?.split(': ')[1]?.replace(/!$/, '') ?? ''
    const look = monsterLook(attackName)
    const walk = action.walked > 0 ? { walk: action.walked } : {}
    return shots.length > 0 ? { look, by: 'monster', from, shots, ...walk, ...(look === 'ray' ? { color: rayColor(attackName) } : {}) } : null
  }
  return null
}

// The reducer's last step: an attack on the virtual board gets its animation.
export function withAttackFx(before, after, action) {
  if (after === before || !after.board) return after
  const fx = attackFx(before, after, action)
  return fx ? { ...after, moment: { ...after.moment, fx } } : after
}
