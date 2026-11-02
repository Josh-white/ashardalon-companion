// The power cards a computer hero (src/ally/) starts with: the rulebook's suggested picks, as
// a player gets them, with two of JJ's calls for the fan heroes:
//   - no Secret Paths or Paths of Darkness (path tokens add little when the computer walks
//     well anyway): the next card of that kind takes the slot;
//   - Savryna's Hunting Skills (one Longbow at-will) is Oak Arrow, the surest hit.

import { effectsOf } from '../data/powerEffects.js'
import { startingPicks } from '../components/Setup.jsx'

const pathCard = (card) => Boolean(card && (effectsOf(card).use?.tokens?.secretPaths || effectsOf(card).use?.tokens?.darknessLeft || effectsOf(card).use?.tokens?.darkness))
const longbow = (card) => /^longbow\b/i.test(card?.name ?? '')
const oak = (card) => /oak arrow/i.test(card?.name ?? '')

export function allyPicks(template, cards) {
  const picks = startingPicks(template, cards)
  const mine = cards.filter((c) => c.hero === template.key)
  const taken = () => new Set(picks.filter(Boolean).map((c) => c.id))
  picks.forEach((card, i) => {
    if (!pathCard(card)) return
    const other = mine.find((c) => c.type === card.type && !taken().has(c.id) && !pathCard(c))
    picks[i] = other ?? card
  })
  const bow = picks.findIndex((c) => longbow(c) && !oak(c) && c.type === 'at-will')
  const oakCard = mine.find((c) => oak(c) && c.type === 'at-will')
  if (bow >= 0 && oakCard && !taken().has(oakCard.id)) picks[bow] = oakCard
  return picks
}
