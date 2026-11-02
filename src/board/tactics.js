// The board questions a monster card's tactics ask, answered from the virtual board
// instead of a tap. The keys match the "when" values in cards.json and the questions in
// src/components/MonsterTurns.jsx.

import { key, unexploredEdges } from './grid.js'
import { adjacent, tilesBetween } from './paths.js'

// Invisibility: the hero doesn't count as the closest hero for any monster's tactics, so a
// step that goes for the closest hero acts as if they weren't there. Attacks on every hero
// in reach, and "adjacent to a Hero, attacks that Hero" steps, still find them.
// Invisibility and Shadowphage: monsters don't count this hero as the closest hero.
export const unseenByTactics = (hero) => Boolean(hero?.tokens?.invisible || hero?.tokens?.shadow)
export const seesInvisible = (step) => step?.targets === 'all' || (step?.when === 'adjacent' && !step.move)

// Which heroes make a tactic's condition true for a monster on `at`. `heroes` is a list
// of { id, at }. An empty list means the condition doesn't hold.
export function heroesFor(when, grid, at, heroes) {
  const tileOf = (sq) => grid.get(key(sq))?.area
  const within = (n) => heroes.filter((h) => tilesBetween(grid, at, h.at) <= n)
  switch (when) {
    case 'adjacent':
      return heroes.filter((h) => adjacent(grid, at, h.at))
    case 'adjacentMany': {
      const next = heroes.filter((h) => adjacent(grid, at, h.at))
      return next.length >= 2 ? next : []
    }
    case 'sameTile':
      return heroes.filter((h) => tileOf(h.at) === tileOf(at))
    case 'within1':
      return within(1)
    case 'within2':
      return within(2)
    case 'within3':
      return within(3)
    case 'tileWithMany': {
      // A tile with 2 or more heroes, on the monster's tile or one joined to it.
      const near = within(1)
      return near.filter((h) => near.filter((o) => tileOf(o.at) === tileOf(h.at)).length >= 2)
    }
    default:
      return []
  }
}

// The one tactic that is about the monster's own tile, not the heroes.
export function aloneByUnexploredEdge(grid, at, heroes) {
  const tile = grid.get(key(at))?.area
  if (heroes.some((h) => grid.get(key(h.at))?.area === tile)) return false
  return unexploredEdges(grid).some((edge) => edge.area === tile)
}

// Does the condition hold? (A tactic with no "when" always does.)
export function tacticHolds(when, grid, at, heroes) {
  if (!when) return true
  if (when === 'aloneByUnexploredEdge') return aloneByUnexploredEdge(grid, at, heroes)
  return heroesFor(when, grid, at, heroes).length > 0
}
