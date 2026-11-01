import { POWER_EFFECT_NAMES, effectsOf } from './powerEffects.js'

// Encounter cards the app does something special for, found by their id in cards.json.
// If the id in cards.json is spelled differently, the card still works, but without
// the extra help, and nothing else says so. cardCheck.test.js keeps this list in step
// with the code.
export const ENCOUNTER_IDS = {
  cage: "Cage: reminds the hero they are caged, and the virtual board won't let them move",
  'dragon-s-tribute': "Dragon's Tribute: draws two treasures and keeps the lower one",
  'high-alert': 'High Alert: reminder in the turn guide; the virtual board passes the monster card itself',
  'warp-in-time': 'Warp in Time: the virtual board passes the monster cards itself',
  surrounded: 'Surrounded!: reminder in the turn guide',
  'occupied-lair': 'Occupied Lair: draws the bottom tile and puts a Treasure token on the virtual board',
  'scream-of-the-sentry': 'Scream of the Sentry: draws the bottom tile, next to the chosen monster on the virtual board',
  spotted: 'Spotted!: draws the bottom tile',
  lost: 'Lost: puts the bottom tile on top of the stack',
  'thief-in-the-dark': 'Thief in the Dark: picks the treasure to lose',
  'wrath-of-the-enemy': 'Wrath of the Enemy: the virtual board pulls the monster next to the hero',
  'concussive-blast': 'Concussive Blast: the virtual board asks where each hero is pushed',
  'quick-advance': 'Quick Advance: the virtual board asks which monster moves closer',
  'blinding-bomb': 'Blinding Bomb: the virtual board moves the Sentry monsters',
  'hidden-treasure': 'Hidden Treasure: puts a Treasure token on the virtual board',
}

// What the app expects to find in the card file but can't, as sentences for the
// Card check page and the Pi's log. Only the card file's own cards count: the
// example cards are made up, so they would miss everything.
export function missingCards(cards) {
  if (cards?.source !== 'custom') return []
  const missing = []
  const powers = cards.powers ?? []
  for (const name of POWER_EFFECT_NAMES) {
    const effect = effectsOf({ name })
    if (!powers.some((card) => effectsOf(card) === effect)) {
      missing.push(`No power card named "${name}", so its effect isn't done for you.`)
    }
  }
  const encounterIds = new Set((cards.encounters ?? []).map((card) => card.id))
  for (const [id, what] of Object.entries(ENCOUNTER_IDS)) {
    if (!encounterIds.has(id)) missing.push(`No encounter card with id "${id}" (${what}).`)
  }
  return missing
}
