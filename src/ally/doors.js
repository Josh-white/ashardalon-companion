// Closed Doors for a computer hero (src/board/doors.js): walk up to a door, turn its token
// over, and roll to unlock a Locked Door instead of attacking. Doors only come up in the
// adventures that use the door rules (The Closed Doors, Find the Secret Tunnel, Free the
// Captives), and a door can stand between the party and its goal or the last edges left.

import { hasAbility } from '../data/heroes.js'
import { key } from '../board/grid.js'
import { distances } from '../board/paths.js'
import { boardGrid } from '../board/play.js'
import { doorsNearHero, nextToDoor } from '../board/doors.js'
import { canSpendAttack } from '../state/heroTurn.js'
import { DOOR_UNLOCK_ROLL } from '../state/adventure.js'
import { randomNumbers, shuffleNumbers } from '../state/random.js'
import { d20 } from './helpers.js'


const doorsOf = (state) => state.board?.doors ?? []

// The cards opening a door may need: the Secret Chamber's door fills the chamber.
const doorCards = (cards = {}) => ({
  cards: cards.monsters ?? [],
  villains: cards.villains ?? [],
  chambers: cards.chambers ?? [],
  villagerCards: cards.villagers ?? [],
  random: shuffleNumbers(),
})

// The door next to the hero to deal with now, as an action: a face-down one is turned over
// (that's free); a Locked one is rolled for when the hero still has its attack. The caller
// only asks when the hero has nothing better to attack.
export function doorStep(state, hero, { cards = {}, roll = d20, random = () => randomNumbers(1)[0] } = {}) {
  if (doorsOf(state).length === 0) return null
  const near = doorsNearHero(state, hero, hasAbility(hero, 'mage-hand')) ?? []
  // The door the adventure is waiting for (the Secret Chamber's) first.
  const shut = near.filter((d) => !d.kind).sort((a, b) => Number(Boolean(b.reveal)) - Number(Boolean(a.reveal)))[0]
  if (shut) {
    return {
      action: { type: 'DOOR_REVEALED', pick: random(), heroId: hero.id, doorId: shut.id, ...doorCards(cards) },
      say: `${hero.name} opens the door.`,
    }
  }
  const locked = near.find((d) => d.kind === 'locked' && (state.adventure?.lockedDoors ?? []).some((l) => l.id === d.id))
  if (locked && canSpendAttack(state, hero)) {
    return {
      action: { type: 'DOOR_UNLOCK', doorId: locked.id, heroId: hero.id, roll: roll(), ...doorCards(cards) },
      say: `${hero.name} tries to unlock the door (${DOOR_UNLOCK_ROLL}+).`,
    }
  }
  return null
}

// The squares next to each door on the board that the hero can walk to, door by door:
// [{ door, squares }]. A Locked Door only counts while the hero could still roll for it
// some turn (always, so it's listed too).
export function doorGoals(state, hero) {
  const board = state.board
  const at = board?.tokens[hero.id]
  if (!at || doorsOf(state).length === 0) return []
  const grid = boardGrid(board)
  const fromHere = distances(grid, at)
  return doorsOf(state)
    .map((door) => {
      const squares = []
      const seen = new Set()
      for (const [x, y] of door.squares) {
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const sq = [x + dx, y + dy]
            const k = key(sq)
            if (seen.has(k)) continue
            seen.add(k)
            if (grid.get(k)?.floor && fromHere.has(k) && nextToDoor(board, door, sq)) squares.push(sq)
          }
        }
      }
      return { door, squares }
    })
    .filter((g) => g.squares.length > 0)
}

// Whether a door matters more than exploring: it's the one the adventure is waiting for, or
// a chamber waits behind it.
export const goalDoor = (door) => Boolean(door.reveal || (door.leadsTo ?? []).length > 0)
