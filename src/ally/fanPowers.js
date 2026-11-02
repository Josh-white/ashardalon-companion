// The fan heroes' cards a computer hero plays (cards.json heroes from the fan sets, run on the
// test copy): the start-of-turn songs and stances (Song of Courage, Melody of Defense,
// Centered Defense), the boosts just before a big attack (Heavy Hitter, Power of Earth),
// Fleetfooted in place of a disable roll, and the things that happen on anyone's turn
// (Bardic Song rerolls, Mind Over Body rolls). Each returns { action, say } or null, like the
// rest of the brain (brain.js and powers.js call them).

import { key } from '../board/grid.js'
import { adjacent, tilesBetween } from '../board/paths.js'
import { boardGrid } from '../board/play.js'
import { moveChoices, moveTargets, queueMoves } from '../board/powerMoves.js'
import { effectsOf } from '../data/powerEffects.js'
import { hasAbility } from '../data/heroes.js'
import { powerNumber } from '../state/combat.js'
import { foes } from '../state/gameHelpers.js'
import { bardicSongsLeft } from '../state/heroAttacks.js'
import { canSpendAttack, mindOverBodyChoices } from '../state/heroTurn.js'
import { tilesWithin1, trapsOnTile } from '../state/fanPowers.js'
import { figureHp, foeFigures, standingHeroes, usable } from './powers.js'

const d20 = () => Math.floor(Math.random() * 20) + 1
const hurt = (h) => h.hp > 0 && h.hp <= Math.ceil(h.maxHp / 2)
const hasBuff = (hero, power) => (hero.buffs ?? []).some((b) => b.source === power.name)

// How many tiles the nearest monster or villain figure is from a square (99: none on the board).
function nearestFoe(state, at) {
  if (!at) return 99
  const grid = boardGrid(state.board)
  return foeFigures(state).reduce((best, f) => Math.min(best, tilesBetween(grid, at, f.at)), 99)
}

// The very start of the hero's Hero Phase: it hasn't moved, attacked or used its attack yet.
const phaseStart = (state, hero) => !(state.turn.boardMoves > 0) && canSpendAttack(state, hero) && !state.turn.lastAttack

// ---- Songs and stances at the start of the Hero Phase ----

// Song of Courage (+2 attack, everyone) when there's a fight on: 2 or more monster figures,
// or a villain. Melody of Defense (+2 AC, everyone) when a hurt hero has a monster within
// 1 tile. Centered Defense (+3 AC, the hero) when a monster is within 1 tile and the hero
// isn't at full HP. Courage first when both songs fit: finishing monsters keeps everyone safe too.
export function buffPower(state, hero) {
  if (!state.board?.tokens[hero.id] || !phaseStart(state, hero)) return null
  const figures = foeFigures(state)
  if (figures.length === 0) return null
  const party = standingHeroes(state)
  const tokens = state.board.tokens
  const mine = (test) => usable(hero, (e, p) => Boolean(e.use?.buff) && !e.use.xpCost && test(e.use.buff) && !hasBuff(hero, p))

  const courage = mine((b) => b.who === 'all' && b.attack > 0 && b.lasts !== 'thisPhase')
  if (courage && (figures.length >= 2 || figures.some((f) => f.foe.villain))) {
    return { action: { type: 'USE_POWER', heroId: hero.id, powerId: courage.id, heroIds: [] }, say: `${hero.name} sings ${courage.name}: everyone hits harder!` }
  }
  const melody = mine((b) => b.who === 'all' && b.ac > 0)
  if (melody && party.some((h) => hurt(h) && nearestFoe(state, tokens[h.id]) <= 1)) {
    return { action: { type: 'USE_POWER', heroId: hero.id, powerId: melody.id, heroIds: [] }, say: `${hero.name} sings ${melody.name}: everyone is harder to hit.` }
  }
  const stance = mine((b) => b.who === 'self' && b.ac > 0)
  if (stance && hero.hp < hero.maxHp && nearestFoe(state, tokens[hero.id]) <= 1) {
    return { action: { type: 'USE_POWER', heroId: hero.id, powerId: stance.id, heroIds: [] }, say: `${hero.name} uses ${stance.name}.` }
  }
  return null
}

// Heavy Hitter, Power of Earth: +attack for this Hero Phase, used just before an attack that
// matters (a finishing blow or the villain) when it isn't already a sure hit. A boost that
// only works for some attacks (Power of Earth: Longbow) needs that attack.
export function boostPower(state, hero, option) {
  if (!option || !(option.finishes.length > 0 || option.villain) || option.chance >= 0.9) return null
  const boost = usable(hero, (e, p) => {
    const b = e.use?.buff
    return Boolean(b) && b.who === 'self' && b.attack > 0 && b.lasts === 'thisPhase' && !e.use.xpCost && !hasBuff(hero, p) && (!b.only || option.power.name.startsWith(b.only))
  })
  if (!boost) return null
  return { action: { type: 'USE_POWER', heroId: hero.id, powerId: boost.id, heroIds: [] }, say: `${hero.name} uses ${boost.name} before attacking.` }
}

// ---- Traps ----

// Fleetfooted (a fan Assassin's): takes a trap on the hero's tile away, no roll, and the card
// stays in play. Used before rolling to disable one.
export function fleetfooted(state, hero) {
  if (!state.board?.tokens[hero.id]) return null
  const traps = trapsOnTile(state, hero)
  if (traps.length === 0) return null
  const power = usable(hero, (e) => Boolean(e.use?.removeTrap))
  if (!power) return null
  return { action: { type: 'USE_POWER', heroId: hero.id, powerId: power.id, heroIds: [], trapIds: [traps[0].id] }, say: `${hero.name} uses ${power.name} to take the ${traps[0].name} trap away.` }
}

// ---- On anyone's turn ----

// Mind Over Body (a fan Monk's ability): a computer hero always rolls for a new condition.
// Bardic Song (a fan Bard's ability): a computer bard's song for a computer hero's miss that
// would have finished a monster or hit a villain. The last song is kept for a villain. A
// player's miss is theirs to decide: the attack box offers the song to every screen.
export function fanReaction(state, roll = d20) {
  if (state?.status !== 'playing') return null
  for (const hero of state.heroes.filter((h) => h.ally && !h.escaped && h.hp > 0)) {
    const condition = mindOverBodyChoices(hero)[0]
    if (condition) return { action: { type: 'MIND_OVER_BODY', heroId: hero.id, condition, roll: roll() }, say: `${hero.name} tries to shrug off being ${condition} (Mind Over Body).` }
  }

  const last = state.turn.lastAttack
  const attacker = last && state.heroes.find((h) => h.id === last.heroId)
  if (!attacker?.ally) return null
  const power = attacker.powers.find((p) => p.id === last.powerId)
  const damage = powerNumber(power?.card?.damage) ?? 1
  const alive = (id) => foes(state).find((m) => m.id === id && m.hp > 0)
  const rows = last.rolls.filter((r) => !r.hit && !r.rerolled && alive(r.monsterId))
  for (const bard of state.heroes.filter((h) => h.ally && bardicSongsLeft(h) > 0)) {
    const left = bardicSongsLeft(bard)
    const row = rows.find((r) => alive(r.monsterId).villain || (left > 1 && damage >= figureHp(alive(r.monsterId))))
    if (row) {
      return {
        action: { type: 'REROLL_ATTACK', helperId: bard.id, bardicSong: true, monsterId: row.monsterId, roll: roll() },
        say: `${bard.name}'s Bardic Song: ${attacker.name} rolls again!`,
      }
    }
  }
  return null
}

// ---- Fesud (a fan Assassin): in and out of the shadows ----

const inShadow = (hero) => Boolean(hero.tokens?.shadow)

// Shadowphage instead of attacking: when the hero is hurt and the attack wouldn't finish a
// monster or hit a villain, or when there's nothing to attack. A hero already in the shadows
// strikes from them (the shadow bonus) instead.
export function shadowStep(state, hero, option) {
  if (!hasAbility(hero, 'shadowphage') || inShadow(hero) || !canSpendAttack(state, hero) || !state.board?.tokens[hero.id]) return null
  if (option && (option.finishes.length > 0 || option.villain || !hurt(hero))) return null
  if (!option && foeFigures(state).length === 0) return null
  return { action: { type: 'SET_SHADOW', heroId: hero.id, on: true }, say: `${hero.name} slips into the shadows.` }
}

// Shadowmerge: into the shadows for free just before an attack that matters (a finishing blow
// or the villain) and could miss, when the attack gets more from the shadows.
export function shadowmerge(state, hero, option) {
  if (!option || inShadow(hero) || !(option.finishes.length > 0 || option.villain) || option.chance >= 0.9) return null
  if (!effectsOf(option.power).shadowBonus) return null
  const merge = usable(hero, (e) => e.shadow === 'enter' && e.use && Object.keys(e.use).length === 0)
  if (!merge) return null
  return { action: { type: 'USE_POWER', heroId: hero.id, powerId: merge.id, heroIds: [] }, say: `${hero.name} uses ${merge.name} to strike from the shadows.` }
}

// Shadow Seekers: the tokens are ready as soon as monsters are about (one goes out each time
// the hero slips into the shadows).
export function seekersPower(state, hero) {
  if (!hasAbility(hero, 'shadowphage') || foeFigures(state).length === 0 || hero.tokens?.seekersLeft > 0) return null
  const seekers = usable(hero, (e) => e.use?.tokens?.seekersLeft > 0)
  if (!seekers) return null
  return { action: { type: 'USE_POWER', heroId: hero.id, powerId: seekers.id, heroIds: [] }, say: `${hero.name} readies ${seekers.name}.` }
}

// Trapping Attack: a trap on the hero's tile goes off on the busiest tile within 1 tile. Worth
// it with 2 or more monster figures (or a villain) on a tile there.
export function trappingAttack(state, hero) {
  if (!state.board?.tokens[hero.id] || trapsOnTile(state, hero).length === 0) return null
  const power = usable(hero, (e) => e.use?.moveTraps > 0)
  if (!power) return null
  const grid = boardGrid(state.board)
  const tiles = new Set(tilesWithin1(state, hero))
  const crowd = new Map()
  for (const f of foeFigures(state)) {
    const area = grid.get(key(f.at))?.area
    if (tiles.has(area)) crowd.set(area, (crowd.get(area) ?? 0) + (f.foe.villain ? 2 : 1))
  }
  if (Math.max(0, ...crowd.values()) < 2) return null
  return { action: { type: 'USE_POWER', heroId: hero.id, powerId: power.id, heroIds: [] }, say: `${hero.name} turns the trap against the monsters (${power.name}).` }
}

// ---- Swapping places: Psionic Stride, Yer Own Size ----

// A utility that swaps the hero with a friend: used to pull a hurt friend (half HP or less)
// out from next to a monster, when the hero has more HP and stays above half.
const swapUtility = (e) => e.use?.board?.length === 1 && /^(other)?[hH]ero/.test(e.use.board[0].pick) && e.use.board[0].to === 'swap'
function endangered(state, hero) {
  const tokens = state.board.tokens
  return standingHeroes(state).filter((h) => h.id !== hero.id && hurt(h) && h.hp < hero.hp && nearestFoe(state, tokens[h.id]) === 0 && nextToFoe(state, tokens[h.id]))
}
export function rescueStride(state, hero) {
  if (!state.board?.tokens[hero.id] || hurt(hero) || state.turn.boardMove) return null
  const power = usable(hero, swapUtility)
  if (!power || endangered(state, hero).length === 0) return null
  const queued = queueMoves(state, hero, power, effectsOf(power).use.board)
  if (!queued.turn.boardMove || !moveChoices(queued).some((id) => endangered(state, hero).some((h) => h.id === id))) return null
  return { action: { type: 'USE_POWER', heroId: hero.id, powerId: power.id, heroIds: [] }, say: `${hero.name} uses ${power.name} to take a hurt friend's place.` }
}

// ---- Where the figures go after a fan power's move ----

function nextToFoe(state, at) {
  const grid = boardGrid(state.board)
  return foeFigures(state).some((f) => adjacent(grid, at, f.at))
}
// Farther from every monster is better: whole tiles first, then squares.
function safety(state, at) {
  const near = foeFigures(state).map((f) => f.at)
  if (near.length === 0) return 0
  return nearestFoe(state, at) * 100 + Math.min(...near.map((f) => Math.abs(f[0] - at[0]) + Math.abs(f[1] - at[1])))
}
const parse = (k) => k.split(',').map(Number)

// A move a fan power left for one of the hero's figures, once the attack is done:
//   the hero itself or a friend (Alshabbah, Swift Evasion, Tune of Ice and Wind): a hurt
//     hero gets away from the monsters; one in good shape stays put. A move toward a monster
//     (Crane's Wings, Willbreaker) is taken while the hero is above half HP.
//   a monster (Flurry of Blows, One Hundred Leaves, Mighty Heave, the staffs): as far from
//     the other heroes as it can go, the hurt ones most, staying near the hero.
//   a monster pulled closer (Vicious Mockery): left where it is.
// Null leaves it to the brain (which skips a move it may skip).
export function fanMove(state, hero) {
  const move = state.turn.boardMove
  if (!move || move.heroId !== hero.id || move.from || !state.board) return null
  const s = move.steps?.[0]
  const id = moveChoices(state)[0]
  if (!s || !id || s.to === 'swap' || s.to === 'tileCloser') return swapPick(state, hero, s)
  const targets = moveTargets(state, id).map(parse)
  if (targets.length === 0) return null
  const tokens = state.board.tokens
  const person = state.heroes.find((h) => h.id === id)
  if (person) {
    if (/monster|attacked/i.test(s.to)) {
      if (hurt(person)) return null
      return { action: { type: 'BOARD_MOVE', id, to: targets[0] }, say: `${person.name} closes in.` }
    }
    if (!hurt(person) || !nextToFoe(state, tokens[id])) return null
    const best = [...targets].sort((a, b) => safety(state, b) - safety(state, a))[0]
    if (safety(state, best) <= safety(state, tokens[id])) return null
    return { action: { type: 'BOARD_MOVE', id, to: best }, say: `${person.name} gets away from the monsters.` }
  }
  // A monster figure: away from the others, the hurt ones most; near the hero among equals.
  const grid = boardGrid(state.board)
  const others = standingHeroes(state).filter((h) => h.id !== hero.id)
  const self = tokens[hero.id]
  const squares = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])
  const score = (at) =>
    others.reduce((sum, h) => sum + (Math.min(3, tilesBetween(grid, at, tokens[h.id])) * 100 + Math.min(8, squares(at, tokens[h.id]))) * (hurt(h) ? 3 : 1), 0) - (self ? squares(at, self) / 10 : 0)
  const best = [...targets].sort((a, b) => score(b) - score(a))[0]
  return { action: { type: 'BOARD_MOVE', id, to: best }, say: `${hero.name} sends the monster away from the others.` }
}

// A swap a utility asked for: the hurt friend next to a monster (null skips it).
function swapPick(state, hero, s) {
  if (s?.to !== 'swap') return null
  const friend = endangered(state, hero).find((h) => moveChoices(state).includes(h.id))
  if (!friend) return null
  return { action: { type: 'BOARD_MOVE', id: friend.id, to: state.board.tokens[friend.id] }, say: `${hero.name} swaps places with ${friend.name}.` }
}
