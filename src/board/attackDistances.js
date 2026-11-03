// How far each attacked monster is, in the words magic weapons use (adjacent, within1, far),
// read off the virtual board. A power that attacks the monsters the hero was next to while
// moving (Whirling Mantis Step, Comet Strike) hits each of them while they're next to the hero,
// so they all count as next to the hero, wherever the walk ended.

import { foeDistance, powerRange } from './monsters.js'
import { distanceChoices } from '../data/items.js'
import { effectsOf } from '../data/powerEffects.js'
import { baseId } from './grid.js'
import { adjacent } from './paths.js'
import { boardGrid, stayedOnBoard } from './play.js'
import { foes } from '../state/gameHelpers.js'

// The power attacks monsters the hero passed next to: its board walk is a path, or the card says
// "adjacent to you during the movement" (older saved copies of the card still walk in one jump).
export function attacksWhilePassing(power) {
  const steps = effectsOf(power).board?.before ?? []
  const text = `${power?.card?.text ?? ''} ${effectsOf(power).before ?? ''}`
  return steps.some((s) => s.to === 'path') || /during the movement|you passed next to|you were next to along the way/i.test(text)
}

// { [monsterId]: 'adjacent' | 'within1' | 'far' } for the monsters the board can place.
// When the hero's items only ask "next to you or not", within1 counts as far.
export function attackDistances(state, hero, ids, power) {
  const choices = distanceChoices(hero)
  const passed = state.turn?.powerPassed
  const walkedPast = power && passed?.heroId === hero.id && passed.source === power.name ? passed.ids : []
  const allNext = power && attacksWhilePassing(power)
  return Object.fromEntries(
    [...new Set(ids)]
      .map((id) => [id, allNext || walkedPast.includes(id) ? 'adjacent' : foeDistance(state, hero.id, id)])
      .filter(([, d]) => d)
      .map(([id, d]) => [id, choices && !choices.includes(d) ? 'far' : d]),
  )
}

// Which monsters an attack power reaches on the virtual board (a range for foesInRange), or null
// for every monster. A power that moves first (Charge, Divine Challenge, King's Castle) reads
// its card's words until that move is done; then it reaches what the card attacks after the
// move (its `range`: a monster next to the hero for most of them).
export function attackRange(state, power, text = power?.card?.text) {
  const effects = effectsOf(power)
  const fromText = powerRange(text)
  if (!effects.board?.before) return effects.range ?? fromText
  const moved = state.turn?.beforeMoved === power?.id && state.turn?.boardMove?.source !== power?.name
  return moved ? effects.range ?? fromText : fromText
}

// The answers to a power's question before the roll that the virtual board knows, for the
// monster(s) picked: how many monster figures stand next to the hero (Valiant Strike), and
// whether the hero started this Hero Phase next to the monster (Holy Strike: only known while
// the hero hasn't moved this turn; then it's whether the monster is next to it now). {} when
// the board can't say, so the players answer.
export function boardAnswers(state, hero, power, chosen = []) {
  const ask = effectsOf(power).ask
  const at = state.board?.tokens[hero.id]
  if (!at || !ask) return {}
  if (ask === 'adjacent-count') {
    const grid = boardGrid(state.board)
    const ids = new Set(foes(state).filter((m) => m.hp > 0 && !m.objective).map((m) => m.id))
    const count = Object.entries(state.board.tokens).filter(([id, sq]) => ids.has(baseId(id)) && adjacent(grid, at, sq)).length
    return count > 0 ? { adjacentCount: count } : {}
  }
  if (ask === 'started-adjacent' && chosen.length > 0 && stayedOnBoard(state, hero) === true) {
    return { startedAdjacent: chosen.every((id) => foeDistance(state, hero.id, id) === 'adjacent') }
  }
  return {}
}
