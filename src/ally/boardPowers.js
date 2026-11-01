// The last powers the computer heroes learned to play on the virtual board: the ones that
// move a monster away from a hurt hero (Command, Distant Diversion), the Wizard Eye for
// exploring from a distance, and the ones used on other players' turns too: Bravery and
// Noble Shield (a monster's turn), To Arms! (a new monster), One for the Team (another
// hero's encounter card). The powers that move a figure first and then attack (Divine
// Challenge, Benign Transposition, King's Castle, Hypnotism) are in brain.js, with Charge.
// Each returns { action, say } or null, like the rest of the brain.

import { baseId, key, unexploredEdges } from '../board/grid.js'
import { adjacent, distances, tilesBetween } from '../board/paths.js'
import { boardGrid, caged, heroEdges, heroReach } from '../board/play.js'
import { movableToken, tokenMoveTargets, tokenTargets } from '../board/heroTokens.js'
import { foeDistance } from '../board/monsters.js'
import { moveChoices, moveTargets, queueMoves } from '../board/powerMoves.js'
import { effectsOf, heroAc } from '../data/powerEffects.js'
import { PHASES } from '../data/phases.js'
import { foes } from '../state/gameHelpers.js'
import { villainInPlay } from '../state/monsterDeck.js'
import { encounterHarm } from './cancelEncounter.js'
import { foeFigures, standingHeroes, usable } from './powers.js'

const parse = (k) => k.split(',').map(Number)
const areaAt = (grid, sq) => (sq ? grid.get(key(sq))?.area : undefined)
// Down to half its hit points or less: worth spending a power to keep it safe.
const hurt = (h) => h.hp > 0 && h.hp <= Math.ceil(h.maxHp / 2)
const isVillain = (state, id) => (state.villains ?? []).some((v) => v.id === baseId(id))
const near1 = (d) => d === 'adjacent' || d === 'within1'

// ---- Command and Distant Diversion: a monster away from a hurt hero ----

// The power's one move is a monster put somewhere else.
const divertStep = (power) => {
  const steps = effectsOf(power).use?.board
  return steps?.length === 1 && /^monster/.test(steps[0].pick) ? steps : null
}

// With a power's move waiting on the board: the monster close to a hurt hero (on their tile
// or the next one) that the move takes farthest from them, and the square it goes to. Villains stay put (the cards say
// Monster). Null when no move gets a monster away from a hurt hero.
function bestDivert(state) {
  const grid = boardGrid(state.board)
  const tokens = state.board.tokens
  const party = standingHeroes(state)
  const weak = party.filter(hurt)
  if (weak.length === 0) return null
  // On a hurt hero's tile is worst, a tile away is still close enough to come and attack.
  const threat = (sq) => weak.reduce((sum, h) => sum + Math.max(0, 2 - tilesBetween(grid, sq, tokens[h.id])), 0)
  let best = null
  for (const id of moveChoices(state)) {
    if (isVillain(state, id)) continue
    const before = threat(tokens[id])
    if (before === 0) continue
    for (const k of moveTargets(state, id)) {
      const sq = parse(k)
      const after = threat(sq)
      if (after >= before) continue
      // Then as far from the party as it goes: the nearest hero first, then all of them.
      const apart = party.map((h) => tilesBetween(grid, sq, tokens[h.id]))
      const score = (before - after) * 10 + Math.min(...apart) + apart.reduce((a, b) => a + b, 0) / 10
      if (!best || score > best.score) best = { id, to: sq, score }
    }
  }
  return best
}

// At the end of the Hero Phase: Command (a monster on the hero's tile) or Distant Diversion
// (a monster within 3 tiles), when a monster is about to go after a hurt hero.
export function divertPower(state, hero) {
  if (!state.board?.tokens[hero.id] || state.turn.boardMove) return null
  const power = usable(hero, (e, p) => Boolean(divertStep(p)))
  if (!power) return null
  const queued = queueMoves(state, hero, power, divertStep(power))
  if (!queued.turn.boardMove || !bestDivert(queued)) return null
  return { action: { type: 'USE_POWER', heroId: hero.id, powerId: power.id, heroIds: [] }, say: `${hero.name} uses ${power.name} to get a monster away from a hurt friend.` }
}

// The move a Command or Distant Diversion is waiting on.
export function divertMove(state, hero) {
  const move = state.turn.boardMove
  if (!move || move.heroId !== hero.id) return null
  const power = hero.powers.find((p) => p.name === move.source && divertStep(p))
  if (!power) return null
  const plan = bestDivert(state)
  if (!plan) return { action: { type: 'SKIP_BOARD_MOVE' }, say: `${hero.name} leaves the monster where it is.` }
  const foe = foes(state).find((m) => m.id === baseId(plan.id))
  return { action: { type: 'BOARD_MOVE', id: plan.id, to: plan.to }, say: `${hero.name} sends the ${foe?.name ?? 'monster'} away.` }
}

// ---- Wizard Eye: exploring from a distance ----

// No monsters about and no unexplored edge the wizard can walk to this turn: put the Wizard
// Eye on a tile with an unexplored edge, or move the Eye (instead of a move) to one.
export function wizardEyeStep(state, hero) {
  if (!state.board?.tokens[hero.id] || foeFigures(state).length > 0 || heroEdges(state).length > 0) return null
  const grid = boardGrid(state.board)
  const edges = unexploredEdges(grid)
  if (edges.length === 0) return null
  const edgeSquares = new Set(edges.flatMap((e) => e.squares.map(key)))
  if (heroReach(state, hero).some((k) => edgeSquares.has(k))) return null
  const edgeAreas = new Set(edges.map((e) => e.area))
  const onEdge = (k) => edgeAreas.has(areaAt(grid, parse(k)))
  const eye = (state.board.items ?? []).find((i) => i.kind === 'eye' && i.owner === hero.id && i.at)
  if (!eye) {
    const power = usable(hero, (e) => e.use?.tokens?.wizardEye)
    if (!power || hero.tokens?.wizardEye) return null
    if (!tokenTargets(state, { id: '_ally', kind: 'eye', owner: hero.id, at: null }).some(onEdge)) return null
    return { action: { type: 'USE_POWER', heroId: hero.id, powerId: power.id, heroIds: [] }, say: `${hero.name} casts ${power.name} to look around the corner.` }
  }
  if (!movableToken(state, hero, eye)) return null
  const at = state.board.tokens[hero.id]
  const fromHero = distances(grid, at)
  const to = tokenMoveTargets(state, eye).filter(onEdge).sort((a, b) => (fromHero.get(a) ?? 99) - (fromHero.get(b) ?? 99))[0]
  if (!to) return null
  return { action: { type: 'MOVE_HERO_ITEM', id: eye.id, to: parse(to) }, say: `${hero.name} sends the Wizard Eye floating ahead.` }
}

// ---- On a monster's turn: Bravery and Noble Shield ----

// The acting monster's figure nearest the hero.
function nearestFigure(state, hero, foeId) {
  const grid = boardGrid(state.board)
  const from = distances(grid, state.board.tokens[hero.id])
  return Object.entries(state.board.tokens)
    .filter(([id]) => baseId(id) === foeId)
    .sort(([, a], [, b]) => (from.get(key(a)) ?? 99) - (from.get(key(b)) ?? 99))[0]?.[0] ?? null
}

// Bravery, when a monster within 1 tile of a computer paladin starts its turn: worth it for
// the 1 HP when hurt (stepping next to it only when the paladin can take a hit), or to stand
// in front of a friend down to 2 HP or less that the monster could go after.
function bravery(state) {
  const id = state.turn.acting
  const foe = id && foes(state).find((m) => m.id === id && m.hp > 0 && !m.objective)
  if (!foe || state.turn.boardMove || state.turn.lastMonsterAttack?.monsterId === id) return null
  for (const hero of standingHeroes(state).filter((h) => h.ally && !h.tokens?.refuge)) {
    const power = hero.powers.find((p) => !p.used && effectsOf(p).reaction === 'bravery')
    const distance = power && foeDistance(state, hero.id, id)
    if (!near1(distance)) continue
    const healing = hero.hp < hero.maxHp && (distance === 'adjacent' || hero.hp >= 3)
    const guarding = hero.hp >= 3 && standingHeroes(state).some((h) => h.id !== hero.id && h.hp <= 2 && h.hp < hero.hp && near1(foeDistance(state, h.id, id)))
    if (!healing && !guarding) continue
    const token = nearestFigure(state, hero, id)
    if (!token) continue
    return {
      action: { type: 'USE_POWER', heroId: hero.id, powerId: power.id, heroIds: [], foeToken: token },
      say: `${hero.name} uses ${power.name}: steps up to the ${foe.name} and gets 1 HP.`,
    }
  }
  return null
}

// Noble Shield, for a computer paladin among an attack's targets: take the hit alone (it
// counts as a 20) when that saves a friend from being knocked down, or saves more damage
// than it costs. Never when the hit would knock the paladin down. `attack` is the
// monster's attack, `bonus` its attack bonus.
export function nobleShieldWorth(state, keeper, targetIds, attack, bonus = 0) {
  if (!keeper?.ally || !attack || targetIds.length < 2 || !targetIds.includes(keeper.id)) return false
  const damage = (attack.damage ?? 0) + (attack.conditions?.length ?? 0)
  if (damage === 0 || keeper.hp <= (attack.damage ?? 0)) return false
  const chance = (h) => Math.min(0.95, Math.max(0.05, (21 - (heroAc(h) - bonus)) / 20))
  const others = targetIds.map((id) => state.heroes.find((h) => h.id === id)).filter((h) => h && h.id !== keeper.id && h.hp > 0)
  if (others.some((h) => h.hp <= (attack.damage ?? 0) && chance(h) >= 0.25)) return true
  const saved = others.reduce((sum, h) => sum + chance(h) * damage, 0)
  return saved > (1 - chance(keeper)) * damage + 0.5
}

// ---- To Arms!: a new monster on the board ----

// The newest monster, when the Exploration Phase just put it on the new tile.
function newMonster(state) {
  if (PHASES[state.turn.phase]?.key !== 'exploration' || !state.turn.monsterDrawn) return null
  const last = (state.turn.boardTiles ?? []).at(-1)
  const monster = state.monsters.at(-1)
  if (!last || !monster || monster.hp <= 0) return null
  const grid = boardGrid(state.board)
  const figures = Object.entries(state.board.tokens).filter(([id, at]) => baseId(id) === monster.id && grid.get(key(at))?.tile === last.uid)
  return figures.length > 0 ? { monster, squares: figures.map(([, at]) => at) } : null
}

const TO_ARMS_SELF = (power) => (effectsOf(power).use?.board ?? []).filter((s) => s.pick === 'self')

// Squares next to the new monster that the hero can walk to with the power's move.
function chargeSquares(state, hero, power, squares) {
  const queued = queueMoves(state, hero, power, TO_ARMS_SELF(power))
  if (!queued.turn.boardMove) return []
  const grid = boardGrid(state.board)
  return moveTargets(queued, hero.id).filter((k) => squares.some((sq) => adjacent(grid, parse(k), sq)))
}

// A new monster turns up: a computer fighter not busy with another monster (and with HP to
// spare) uses To Arms! to rush next to it, ready to attack on its next turn.
function toArms(state) {
  if (!state.board || state.turn.boardMove) return null
  const fresh = newMonster(state)
  if (!fresh) return null
  const grid = boardGrid(state.board)
  const foeSquares = foeFigures(state).map((f) => f.at)
  for (const hero of standingHeroes(state).filter((h) => h.ally && h.hp > 2 && !caged(h) && !h.conditions?.includes('Immobilized'))) {
    const power = hero.powers.find((p) => !p.used && p.card && TO_ARMS_SELF(p).length > 0 && /^other/.test(effectsOf(p).use?.board?.[0]?.pick ?? ''))
    if (!power) continue
    const at = state.board.tokens[hero.id]
    if (foeSquares.some((sq) => adjacent(grid, at, sq))) continue
    if (chargeSquares(state, hero, power, fresh.squares).length === 0) continue
    return { action: { type: 'USE_POWER', heroId: hero.id, powerId: power.id, heroIds: [] }, say: `${hero.name} calls ${power.name} and rushes at the ${fresh.monster.name}!` }
  }
  return null
}

// The moves of a To Arms! a computer hero used: the other hero on the tile stays put (it's
// their choice), and the computer hero goes next to the new monster.
function toArmsMove(state) {
  const move = state.turn.boardMove
  const hero = move && state.heroes.find((h) => h.id === move.heroId && h.ally)
  const power = hero?.powers.find((p) => p.name === move.source && TO_ARMS_SELF(p).length > 0 && /^other/.test(effectsOf(p).use?.board?.[0]?.pick ?? ''))
  if (!power) return null
  const step = move.steps[0]
  if (step.pick !== 'self') return { action: { type: 'SKIP_BOARD_MOVE' }, say: `${hero.name} lets the others choose for themselves.` }
  const fresh = newMonster(state)
  const grid = boardGrid(state.board)
  const at = state.board.tokens[hero.id]
  const from = distances(grid, at)
  const to = fresh && moveTargets(state, hero.id).filter((k) => fresh.squares.some((sq) => adjacent(grid, parse(k), sq))).sort((a, b) => (from.get(a) ?? 99) - (from.get(b) ?? 99))[0]
  if (!to) return { action: { type: 'SKIP_BOARD_MOVE' }, say: `${hero.name} stays where it is.` }
  return { action: { type: 'BOARD_MOVE', id: hero.id, to: parse(to) }, say: `${hero.name} charges in.` }
}

// The move Bravery queued: next to the monster (staying put when already there).
function braveryMove(state) {
  const move = state.turn.boardMove
  const hero = move && state.heroes.find((h) => h.id === move.heroId && h.ally)
  if (!hero || effectsOf({ name: move.source }).reaction !== 'bravery') return null
  const targets = moveTargets(state, hero.id)
  const at = state.board.tokens[hero.id]
  const foeAt = state.board.tokens[move.from]
  const grid = boardGrid(state.board)
  if (foeAt && adjacent(grid, at, foeAt)) return { action: { type: 'SKIP_BOARD_MOVE' }, say: `${hero.name} stands its ground.` }
  const from = distances(grid, at)
  const to = [...targets].sort((a, b) => (from.get(a) ?? 99) - (from.get(b) ?? 99))[0]
  if (!to) return { action: { type: 'SKIP_BOARD_MOVE' }, say: `${hero.name} stays where it is.` }
  return { action: { type: 'BOARD_MOVE', id: hero.id, to: parse(to) }, say: `${hero.name} steps up to the monster.` }
}

// ---- One for the Team: taking a friend's encounter card ----

// Cards that only hit the hero who drew them (a curse, an attack on the active hero, damage
// if a monster is on their tile): those are the ones another hero can take for them.
const personal = (card) => card.type === 'curse' || card.attack?.targets === 'active' || card.damageIfMonsterOnTile > 0

// A computer fighter takes the card for a friend it could knock down, or for a hurt friend
// when the fighter has HP to spare, and never when it would knock the fighter down instead.
function oneForTheTeam(state) {
  const encounter = state.encounter
  if (!encounter || encounter.attacked || !personal(encounter.card) || !villainInPlay(state, encounter.card)) return null
  const drawer = state.heroes.find((h) => h.id === encounter.heroId)
  if (!drawer || drawer.hp <= 0) return null
  const harm = encounterHarm(state, encounter.card, drawer)
  if (harm.score < 2) return null
  for (const hero of state.heroes.filter((h) => h.ally && h.hp > 0 && !h.escaped && h.id !== drawer.id)) {
    const power = hero.powers.find((p) => !p.used && effectsOf(p).use?.takeEncounter)
    if (!power) continue
    const mine = encounterHarm(state, encounter.card, hero)
    if (mine.lethal || hero.hp <= drawer.hp) continue
    if (!harm.lethal && !(hurt(drawer) && hero.hp >= drawer.hp + 2)) continue
    return { action: { type: 'USE_POWER', heroId: hero.id, powerId: power.id, heroIds: [] }, say: `${hero.name} uses ${power.name}: "I'll take that one, ${drawer.name}!"` }
  }
  return null
}

// What a computer hero does on anyone's turn with these powers, or null.
export function teamReaction(state) {
  if (state?.status !== 'playing' || !state.board) return null
  return oneForTheTeam(state) ?? toArmsMove(state) ?? braveryMove(state) ?? bravery(state) ?? toArms(state)
}
