// How far each attacked monster is, in the words magic weapons use (adjacent, within1, far),
// read off the virtual board. A power that attacks the monsters the hero was next to while
// moving (Whirling Mantis Step, Comet Strike) hits each of them while they're next to the hero,
// so they all count as next to the hero, wherever the walk ended.

import { foeDistance } from './monsters.js'
import { distanceChoices } from '../data/items.js'
import { effectsOf } from '../data/powerEffects.js'

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
