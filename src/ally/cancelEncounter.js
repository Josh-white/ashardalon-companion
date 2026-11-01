// Should the computer ally spend party XP to cancel the encounter card it just drew?
//
// Party XP does two jobs: 5 XP levels a hero up on a natural 20, and 5 XP (Story 3, Hard 7)
// cancels an encounter. Levelling up is worth more, so the ally keeps back enough XP for
// every hero still at level 1 (human heroes too: the party shares the XP) and only spends
// what's left over. With XP to spare it cancels the nasty cards (curses, traps, a monster,
// attacks that hurt), and leaves the harmless or helpful ones (Hidden Treasure, a
// flipped-up Daily). The one time it dips into the level-up XP: the card could knock a
// hero out and the party has no healing surges left, which would end the game.

import { encounterTargetIds } from '../board/encounters.js'
import { MAX_LEVEL, XP_TO_LEVEL_UP } from '../data/heroes.js'
import { encounterCancelCost, foeBonus } from '../data/difficulty.js'
import { villainInPlay } from '../state/monsterDeck.js'

// Cards that help the party (or do next to nothing): never worth XP.
const HELPFUL = new Set(['hidden-treasure', 'dragon-s-tribute', 'ancient-spirit-s-blessing'])

// XP kept back for levelling up: 5 for each hero not yet at the top level.
export const levelUpReserve = (state) => state.heroes.filter((h) => h.level < MAX_LEVEL).length * XP_TO_LEVEL_UP

// XP the party can spend on cancelling without anyone missing a level up.
export const spareXp = (state) => Math.max(0, state.xp - levelUpReserve(state))

// The heroes an encounter attack would go after (heroes at 0 HP are skipped).
function attackTargets(state, card, hero) {
  const up = state.heroes.filter((h) => h.hp > 0)
  const t = card.attack.targets
  if (t === 'all') return up
  if (t === 'active') return hero.hp > 0 ? [hero] : []
  const ids = encounterTargetIds(state, t, hero)
  return ids ? up.filter((h) => ids.includes(h.id)) : [hero]
}

// How bad the card is for the party, roughly in "damage": 0 does nothing worth XP, 3+ is nasty.
// `lethal` is true when its attack could knock a hero down.
export function encounterHarm(state, card, hero) {
  if (HELPFUL.has(card.id) || card.refreshDaily) return { score: 0, lethal: false }
  if (card.villain && !villainInPlay(state, card)) return { score: 0, lethal: false }
  let score = 0
  let lethal = false
  if (card.type === 'curse' || card.type === 'trap') score += 3
  else if (card.type === 'environment') score += 2
  else if (card.type === 'hazard') score += 1
  if (card.drawMonster) score += 3
  if (card.attack) {
    // A sure hit counts in full, a long shot less (an easy-to-hit hero takes it all).
    for (const target of attackTargets(state, card, hero)) {
      const chance = Math.min(1, Math.max(0.05, (21 - (target.ac - foeBonus(state, card.attack))) / 20))
      const hurt = (card.attack.damage ?? 0) + (card.attack.conditions?.length ?? 0)
      score += Math.max(card.attack.miss ?? 0, hurt * chance)
      if ((card.attack.damage ?? 0) >= target.hp) lethal = true
    }
  }
  if (card.damageEach) {
    const up = state.heroes.filter((h) => h.hp > 0)
    score += up.length * card.damageEach
    if (up.some((h) => h.hp <= card.damageEach)) lethal = true
  }
  if (card.damagePoisoned) score += state.heroes.filter((h) => h.hp > 0 && h.conditions?.includes('Poisoned')).length * card.damagePoisoned
  if (card.healMonster) score += state.monsters.some((m) => m.hp < m.maxHp) ? 1 : 0
  if (card.drawAnother) score += 1
  // Everything else (stacking the monster deck, passing monster cards, Lost...): a nuisance.
  if (score === 0) score = 1
  return { score, lethal }
}

// The ally's cancel, or null to play the card.
export function cancelEncounter(state, hero) {
  const encounter = state.encounter
  if (!encounter || encounter.attacked || encounter.card.noCancel) return null
  const cost = encounterCancelCost(state)
  if (state.xp < cost) return null
  const { score, lethal } = encounterHarm(state, encounter.card, hero)
  if (score === 0) return null
  const spare = spareXp(state)
  const say = `${hero.name} spends ${cost} XP to cancel ${encounter.card.name}.`
  // No surges left and this could knock someone out: that ends the game, so pay for it.
  if (lethal && state.surges === 0) return { action: { type: 'CANCEL_ENCOUNTER' }, say }
  if (spare < cost) return null
  // Plenty to spare: cancel the merely annoying cards too.
  const bar = spare >= cost * 2 ? 2 : 3
  return score >= bar ? { action: { type: 'CANCEL_ENCOUNTER' }, say } : null
}
