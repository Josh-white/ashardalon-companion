// Allies a fan hero puts on the virtual board (Aldred's Lizard & Lace). They are board items
// of kind 'pet' (board/heroTokens.js), each with its own card from cards.json:
//   use.summon: [{ name, icon, hp, ac, strong: attack, weak: attack }]
//   attack: { name, bonus, damage, status: 'stunned', push: 1 (the monster goes to a tile next to it) }
// They take their turn first in their hero's Villain Phase (PETS_ACT, with a roll each):
//   a Stunned monster within 1 tile: move next to it, strong attack;
//   else a monster within 1 tile: move next to it, weak attack;
//   else move 1 tile toward their hero.
// Monsters' tactics only go after heroes, so a pet only loses HP when the players say so (PET_HURT).

import { baseId, key } from '../board/grid.js'
import { adjacent, distances, tilesBetween } from '../board/paths.js'
import { boardGrid } from '../board/play.js'
import { queueMoves } from '../board/powerMoves.js'
import { addStatus, statusesOf } from './monsterStatus.js'
import { hurtFoe } from './fanPowers.js'
import { findFoe, newId, validRoll, withLog } from './gameHelpers.js'

const items = (state) => state.board?.items ?? []
const withItems = (state, list) => ({ ...state, board: { ...state.board, items: list } })
export const petsOf = (state, heroId) => items(state).filter((i) => i.kind === 'pet' && i.owner === heroId && i.at)

// Free floor squares: no figure, no marker.
function freeSquares(state, exceptId) {
  const grid = boardGrid(state.board)
  const taken = new Set([...Object.values(state.board.tokens), ...items(state).filter((i) => i.at && i.id !== exceptId).map((i) => i.at)].map(key))
  return [...grid.values()].filter((sq) => sq.floor && !taken.has(key([sq.x, sq.y]))).map((sq) => [sq.x, sq.y])
}

// Lizard & Lace: the pets go on free squares of the hero's tile, nearest the hero first.
export function summonPets(state, hero, cards, source) {
  const at = state.board?.tokens[hero.id]
  if (!at || !Array.isArray(cards)) return withLog(state, `${source}: put the allies on ${hero.name}'s tile and run them from their cards.`)
  const grid = boardGrid(state.board)
  const tile = grid.get(key(at))?.area
  const steps = distances(grid, at)
  let next = withItems(state, items(state).filter((i) => !(i.kind === 'pet' && i.owner === hero.id)))
  for (const card of cards) {
    const spot = freeSquares(next)
      .filter((sq) => grid.get(key(sq))?.area === tile)
      .sort((a, b) => (steps.get(key(a)) ?? 99) - (steps.get(key(b)) ?? 99))[0]
    if (!spot) break
    const pet = { id: newId('item'), kind: 'pet', owner: hero.id, at: spot, name: String(card.name ?? 'Ally'), icon: card.icon, hp: Number(card.hp) || 1, ac: Number(card.ac) || 10, strong: card.strong, weak: card.weak }
    next = withItems(next, [...items(next), pet])
  }
  return withLog(next, `${source}: ${cards.map((c) => c.name).join(' and ')} join ${hero.name}! They act first in ${hero.name}'s Villain Phase.`)
}

const foeSpots = (state) => Object.entries(state.board.tokens).filter(([id]) => findFoe(state, baseId(id)) && !findFoe(state, baseId(id)).objective)

// One pet's turn: where it goes and what it attacks (null: nothing to attack, it walks).
export function petPlan(state, pet) {
  const grid = boardGrid(state.board)
  const near = foeSpots(state).filter(([, at]) => tilesBetween(grid, pet.at, at) <= 1)
  const stunned = near.filter(([id]) => statusesOf(findFoe(state, baseId(id))).some((s) => s.kind === 'stunned'))
  const pick = stunned[0] ?? near[0]
  const free = freeSquares(state, pet.id)
  const steps = distances(grid, pet.at)
  const byDistance = (a, b) => (steps.get(key(a)) ?? 99) - (steps.get(key(b)) ?? 99)
  if (pick) {
    const [tokenId, at] = pick
    const spot = adjacent(grid, pet.at, at) ? pet.at : free.filter((sq) => adjacent(grid, sq, at)).sort(byDistance)[0] ?? pet.at
    return { to: spot, tokenId, attack: stunned[0] ? pet.strong : pet.weak, reach: adjacent(grid, spot, at) }
  }
  const home = state.board.tokens[pet.owner]
  if (!home) return { to: pet.at }
  const apart = tilesBetween(grid, pet.at, home)
  if (apart === 0) return { to: pet.at }
  const closer = free.filter((sq) => tilesBetween(grid, sq, home) === apart - 1 && tilesBetween(grid, pet.at, sq) <= 1)
  const homeSteps = distances(grid, home)
  return { to: closer.sort((a, b) => (homeSteps.get(key(a)) ?? 99) - (homeSteps.get(key(b)) ?? 99))[0] ?? pet.at }
}

export const petsDue = (state, hero) => Boolean(hero) && petsOf(state, hero.id).length > 0 && state.turn.petsActed !== hero.id

export function petsAct(state, action) {
  const hero = state.heroes[state.turn.heroIndex]
  if (!hero || hero.id !== action.heroId || !petsDue(state, hero)) return state
  const rolls = Array.isArray(action.rolls) ? action.rolls : []
  let next = { ...state, turn: { ...state.turn, petsActed: hero.id } }
  const pushes = []
  petsOf(state, hero.id).forEach((pet, i) => {
    const current = items(next).find((x) => x.id === pet.id)
    if (!current) return
    const plan = petPlan(next, current)
    next = withItems(next, items(next).map((x) => (x.id === pet.id ? { ...x, at: plan.to } : x)))
    const foe = plan.tokenId && findFoe(next, baseId(plan.tokenId))
    if (!foe || !plan.attack || !plan.reach) {
      next = withLog(next, `${pet.name} moves ${plan.tokenId ? 'toward a monster' : `toward ${hero.name}`}.`)
      return
    }
    const roll = validRoll(rolls[i]) ? rolls[i] : null
    if (roll === null) return
    const total = roll + (Number(plan.attack.bonus) || 0)
    const hit = total >= foe.ac
    next = withLog(next, `${pet.name}'s ${plan.attack.name} vs the ${foe.name}: rolled ${roll} + ${plan.attack.bonus} = ${total} against AC ${foe.ac}. ${hit ? 'Hit!' : 'Miss.'}`)
    if (!hit) return
    if (plan.attack.damage) next = hurtFoe(next, hero, foe.id, Number(plan.attack.damage), `${pet.name}'s ${plan.attack.name}`)
    if (plan.attack.status && findFoe(next, foe.id)) next = addStatus(next, foe.id, plan.attack.status, `${pet.name}'s ${plan.attack.name}`)
    if (plan.attack.push && next.board.tokens[plan.tokenId]) pushes.push(plan.tokenId)
  })
  // Lizard's Tail: the players move the monster 1 tile, any way.
  if (pushes.length) next = queueMoves(next, hero, { name: 'Tail' }, pushes.map(() => ({ pick: 'listed', to: 'adjacentTile' })), { tokens: pushes })
  return next
}

// The players say a pet got hurt (an encounter, a trap): at 0 HP it's gone.
export function petHurt(state, action) {
  const pet = items(state).find((i) => i.id === action.id && i.kind === 'pet')
  if (!pet) return state
  const hp = Math.max(0, pet.hp - (Number(action.amount) || 1))
  if (hp > 0) return withLog(withItems(state, items(state).map((i) => (i.id === pet.id ? { ...i, hp } : i))), `${pet.name} has ${hp} HP left.`)
  return withLog(withItems(state, items(state).filter((i) => i.id !== pet.id)), `${pet.name} is defeated.`)
}
