// Powers that move a figure first, then attack, for the computer hero (split out of
// brain.js, which calls these from allyStep). They use brain.js's attack planning in turn.

import { baseId, key } from '../board/grid.js'
import { distances } from '../board/paths.js'
import { boardGrid, caged, stayedOnBoard } from '../board/play.js'
import { foesInRange } from '../board/monsters.js'
import { hypnotized, moveChoices, moveTargets, queueMoves } from '../board/powerMoves.js'
import { effectsOf, wolfBlocked } from '../data/powerEffects.js'
import { powerNumber } from '../state/combat.js'
import { foes } from '../state/gameHelpers.js'
import { attackGone } from '../state/heroTurn.js'
import { badlyHurt, heroById, parse } from './helpers.js'
import { figureHp } from './powers.js'
import { activeAlly, adjacentFoes, attackOptions, onBoard, pendingMove, withHeroAt } from './brain.js'

// ---- Powers that move a figure first, then attack ----
// Charge, Into the Fray, Taunting Advance (the hero walks), Divine Challenge (a monster is
// pulled in), Benign Transposition, King's Castle (the hero swaps places with a friend) and
// Hypnotism (a monster is moved next to another monster, which gets attacked).

// The kind of move a power makes before its attack: 'walk', 'pull', 'swap', or null.
export function moveFirstKind(power) {
  const steps = effectsOf(power).board?.before ?? []
  if (steps.length === 0) return null
  const pulls = (s) => /^monster/.test(s.pick) && s.to === 'nextToSelf'
  if (steps.length === 1 && steps[0].to === 'swap' && /^hero/.test(steps[0].pick)) return 'swap'
  if (steps.every(pulls)) return 'pull'
  if (steps[0].pick === 'self' && ['squares', 'path', 'nextToHeroWithin2'].includes(steps[0].to) && steps.slice(1).every(pulls)) return 'walk'
  return null
}

export const placed = (state, id, at) => ({ ...state, board: { ...state.board, tokens: { ...state.board.tokens, [id]: at } } })
// A friend down to half HP or less next to a monster: a swap takes their place in the fight.
export const inDanger = (state, h) => badlyHurt(h) && adjacentFoes(state, h) > 0

// Where the hero would stand (or who it swaps with) for each move-first power, and how good
// the attack after it is: { power, to: "x,y" or null to stay, swapWith, rescue, score }. A
// pull afterwards (Taunting Advance) only needs a monster within 2 tiles of the square.
// `kinds` limits it to some kinds of move. A daily's swap is only worth it for a finishing
// blow, a villain, or to get a friend out of trouble.
export function moveFirstPlans(state, hero, { kinds = ['walk', 'pull', 'swap'] } = {}) {
  const at = state.board?.tokens[hero.id]
  if (!at || hero.conditions?.includes('Immobilized') || caged(hero)) return []
  const plans = []
  const attackAfter = (moved, power) => {
    const ready = { ...moved, turn: { ...moved.turn, beforeMoved: power.id } }
    return attackOptions(ready, ready.heroes.find((h) => h.id === hero.id), { all: true }).find((o) => o.power.id === power.id) ?? null
  }
  for (const power of hero.powers.filter((p) => !p.used && p.card && powerNumber(p.card.attack) !== null && state.turn.beforeMoved !== p.id && !wolfBlocked(hero, p))) {
    const kind = moveFirstKind(power)
    if (!kind || !kinds.includes(kind)) continue
    const steps = effectsOf(power).board.before
    const queued = queueMoves(state, hero, power, steps)
    if (!queued.turn.boardMove) continue
    let best = null
    if (kind === 'swap') {
      for (const id of moveChoices(queued)) {
        const friend = heroById(state, id)
        const option = attackAfter(placed(placed(state, hero.id, state.board.tokens[id]), id, at), power)
        if (!option || !friend) continue
        const rescue = inDanger(state, friend) && hero.hp > friend.hp && adjacentFoes(placed(state, id, at), friend) === 0
        if (power.type === 'daily' && !rescue && option.finishes.length === 0 && !option.villain) continue
        const score = option.score + (rescue ? 3 : 0)
        if (!best || score > best.score) best = { power, to: null, swapWith: id, rescue, score }
      }
    } else if (kind === 'pull') {
      for (const id of moveChoices(queued)) {
        const to = moveTargets(queued, id)[0]
        const option = to && attackAfter(placed(state, id, parse(to)), power)
        if (option && (!best || option.score > best.score)) best = { power, to: null, score: option.score }
      }
    } else {
      const squares = [key(at), ...moveTargets(queued, hero.id)]
      const pulls = steps.length > 1
      for (const k of squares) {
        const moved = withHeroAt(state, hero, parse(k))
        let score
        if (pulls) {
          const ready = { ...moved, turn: { ...moved.turn, beforeMoved: power.id } }
          const near = foesInRange(ready, hero.id, 'within2', foes(state).filter((m) => m.ac && m.hp > 0 && !m.objective && onBoard(state, m)))
          score = near.length > 0 ? 1 + near.length / 10 : 0
        } else {
          score = attackAfter(moved, power)?.score ?? 0
        }
        // Standing still counts a little more (no need to move).
        if (score > 0 && (!best || score > best.score || (score === best.score && k === key(at)))) best = { power, to: k === key(at) ? null : k, score }
      }
    }
    if (best) plans.push(best)
  }
  return plans.sort((a, b) => b.score - a.score)
}

// Whirling Mantis Step, Comet Strike (a fan Monk's dailies): move first, then attack every
// monster next to the hero. Worth the daily when the walk reaches 2 or more monsters, a villain
// or a finishing blow, and does more than the best attack from here.
export function sweepAttack(state, hero, option) {
  if (state.turn.boardMove) return null
  const plan = moveFirstPlans(state, hero, { kinds: ['walk'] }).find((p) => p.power.type === 'daily' && effectsOf(p.power).targets === 'any')
  if (!plan || (option && plan.score <= option.score * 1.3)) return null
  const at = plan.to ? parse(plan.to) : state.board.tokens[hero.id]
  const ready = { ...withHeroAt(state, hero, at), turn: { ...state.turn, beforeMoved: plan.power.id } }
  const after = attackOptions(ready, ready.heroes.find((h) => h.id === hero.id), { all: true }).find((o) => o.power.id === plan.power.id)
  if (!after || !(after.targets.length >= 2 || after.villain || after.finishes.length > 0)) return null
  return startMove(hero, plan.power)
}

// A move waiting for a computer hero on someone else's turn (Swift Evasion or Tumbling Escape
// during a player's Villain Phase, a monster's push): the computer makes it, as on its own turn.
export function offTurnMove(state) {
  const move = state?.status === 'playing' ? state.turn.boardMove : null
  const hero = move && state.heroes.find((h) => h.id === move.heroId && h.ally)
  if (!hero || activeAlly(state)?.id === hero.id) return null
  return pendingMove(state, hero)
}

export const startMove = (hero, power) => ({ action: { type: 'START_BOARD_MOVE', heroId: hero.id, powerId: power.id }, say: `${hero.name} uses ${power.name}!` })

export function moveFirst(state, hero) {
  if (state.turn.boardMove) return null
  const plan = moveFirstPlans(state, hero)[0]
  return plan ? startMove(hero, plan.power) : null
}

// A swap that gets a hurt friend away from a monster, even when there's something else to hit.
export function rescueSwap(state, hero) {
  if (state.turn.boardMove) return null
  return moveFirstPlans(state, hero, { kinds: ['swap'] }).find((p) => p.rescue) ?? null
}

// Hypnotism: the best monster within 1 tile to move 1 tile next to another monster, and the
// one it attacks there: { power, id (token), to, victim, score }.
export function hypnotismPlan(state, hero) {
  if (!state.board?.tokens[hero.id] || attackGone(state, hero) || state.turn.boardMove) return null
  const grid = boardGrid(state.board)
  const alive = foes(state).filter((m) => m.ac && m.hp > 0 && !m.objective)
  let best = null
  for (const power of hero.powers.filter((p) => !p.used && p.card && effectsOf(p).ask === 'moved-monster' && powerNumber(p.card.attack) !== null && state.turn.beforeMoved !== p.id)) {
    const queued = queueMoves(state, hero, power, effectsOf(power).board?.before)
    if (!queued.turn.boardMove) continue
    const bonus = powerNumber(power.card.attack)
    const damage = powerNumber(power.card.damage) ?? 1
    for (const id of moveChoices(queued)) {
      for (const k of moveTargets(queued, id)) {
        const around = distances(grid, parse(k), { limit: 1 })
        const victims = Object.entries(state.board.tokens)
          .filter(([t, sq]) => baseId(t) !== baseId(id) && around.has(key(sq)))
          .map(([t]) => alive.find((m) => m.id === baseId(t)))
          .filter(Boolean)
        for (const m of victims) {
          const chance = Math.min(0.95, Math.max(0.05, (21 - (m.ac - bonus)) / 20))
          const score = chance * (damage + (damage >= figureHp(m) ? 4 : 0) + (m.villain ? 2 : 0))
          if (!best || score > best.score) best = { power, id, to: parse(k), victim: m.id, score }
        }
      }
    }
  }
  return best
}

// Hypnotism's attack, once the monster was moved: the monster it ended up next to that's
// best to hit (one it can finish first). Null if it ended up next to nobody.
export function hypnotismAttack(state, hero, roll) {
  const power = hero.powers.find((p) => p.id === state.turn.beforeMoved && effectsOf(p).ask === 'moved-monster')
  if (!power || power.used || state.turn.boardMove || attackGone(state, hero)) return null
  const moved = hypnotized(state, power.name)
  if (!moved) return null
  const damage = powerNumber(power.card.damage) ?? 1
  const victims = moved.nextTo.map((id) => foes(state).find((m) => m.id === id && m.hp > 0 && m.ac)).filter(Boolean)
  const victim = victims.sort((a, b) => Number(damage >= figureHp(b)) - Number(damage >= figureHp(a)) || Number(Boolean(b.villain)) - Number(Boolean(a.villain)) || figureHp(a) - figureHp(b))[0]
  if (!victim) return null
  const thrall = foes(state).find((m) => m.id === moved.id)
  return {
    action: { type: 'HERO_ATTACK', heroId: hero.id, powerId: power.id, movedId: moved.id, targets: [{ monsterId: victim.id, roll: roll() }], bonusAttack: false, distances: {}, stayed: stayedOnBoard(state, hero) ?? false },
    say: `The hypnotized ${thrall?.name ?? 'monster'} attacks the ${victim.name}!`,
  }
}

// The board waits on a move-first power's step: go to the planned square, swap with the
// planned friend, move the hypnotized monster, or pull the weakest monster (one the attack
// can finish first) next to the hero.
export function moveFirstStep(state, hero) {
  const move = state.turn.boardMove
  const power = move && hero.powers.find((p) => p.id === state.turn.beforeMoved && p.name === move.source)
  const s = move?.steps?.[0]
  if (!power || !s) return null
  const queued = { ...state, turn: { ...state.turn, boardMove: null, beforeMoved: null } }
  if (effectsOf(power).ask === 'moved-monster') {
    const plan = hypnotismPlan(queued, hero)
    if (!plan) return { action: { type: 'SKIP_BOARD_MOVE' }, say: `${hero.name} can't find a monster to hypnotize.` }
    return { action: { type: 'BOARD_MOVE', id: plan.id, to: plan.to }, say: `${hero.name} hypnotizes a monster and walks it over.` }
  }
  if (s.to === 'swap') {
    const plan = moveFirstPlans(queued, hero, { kinds: ['swap'] }).find((p) => p.power.id === power.id)
    if (!plan?.swapWith) return { action: { type: 'SKIP_BOARD_MOVE' }, say: `${hero.name} stays where it is.` }
    return { action: { type: 'BOARD_MOVE', id: plan.swapWith }, say: `${hero.name} swaps places with ${heroById(state, plan.swapWith)?.name}.` }
  }
  if (s.pick === 'self') {
    const plan = moveFirstPlans(queued, hero).find((p) => p.power.id === power.id)
    if (!plan?.to) return { action: { type: 'SKIP_BOARD_MOVE' }, say: `${hero.name} stays where it is.` }
    return { action: { type: 'BOARD_MOVE', id: hero.id, to: parse(plan.to) }, say: `${hero.name} rushes in.` }
  }
  const damage = powerNumber(power.card.damage) ?? 1
  const choices = moveChoices(state).map((id) => ({ id, foe: foes(state).find((m) => m.id === baseId(id)) })).filter((c) => c.foe)
  const pick = choices.sort((a, b) => Number(damage >= figureHp(b.foe)) - Number(damage >= figureHp(a.foe)) || Number(Boolean(b.foe.villain)) - Number(Boolean(a.foe.villain)) || figureHp(a.foe) - figureHp(b.foe))[0]
  const to = pick && moveTargets(state, pick.id)[0]
  if (!to) return { action: { type: 'SKIP_BOARD_MOVE' }, say: `${hero.name} has nothing to pull in.` }
  return { action: { type: 'BOARD_MOVE', id: pick.id, to: parse(to) }, say: `${hero.name} pulls the ${pick.foe.name} in.` }
}
