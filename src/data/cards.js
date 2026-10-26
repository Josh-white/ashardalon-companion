import { HERO_TEMPLATES } from './heroes.js'

export const POWER_TYPES = ['at-will', 'utility', 'daily']
const HERO_KEYS = HERO_TEMPLATES.map((t) => t.key)

// Checks a card file and keeps the cards that can be used. Problems are listed
// so a typo in cards.json is easy to find instead of silently hiding a card.
export function normalizeCardFile(data) {
  const problems = []
  const powers = []
  const seen = new Set()
  const list = Array.isArray(data?.powers) ? data.powers : null
  if (!list) return { powers, problems: ['The file needs a "powers" list.'] }

  list.forEach((card, i) => {
    const label = card?.name ? `"${card.name}"` : `power #${i + 1}`
    if (!card || typeof card !== 'object') return problems.push(`${label} is not a card.`)
    if (!card.id || typeof card.id !== 'string') return problems.push(`${label} needs an "id".`)
    if (seen.has(card.id)) return problems.push(`${label} reuses the id "${card.id}".`)
    if (!card.name || typeof card.name !== 'string') return problems.push(`${label} needs a "name".`)
    if (!HERO_KEYS.includes(card.hero)) {
      return problems.push(`${label} has hero "${card.hero}"; use one of ${HERO_KEYS.join(', ')}.`)
    }
    if (!POWER_TYPES.includes(card.type)) {
      return problems.push(`${label} has type "${card.type}"; use one of ${POWER_TYPES.join(', ')}.`)
    }
    seen.add(card.id)
    powers.push({
      id: card.id,
      hero: card.hero,
      type: card.type,
      name: card.name,
      attack: typeof card.attack === 'string' ? card.attack : '',
      damage: typeof card.damage === 'string' ? card.damage : '',
      text: typeof card.text === 'string' ? card.text : '',
    })
  })
  return { powers, problems }
}
