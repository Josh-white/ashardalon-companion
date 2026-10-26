import { HERO_TEMPLATES } from './heroes.js'

// "Attack +8 · Damage 1", to compare cards while choosing.
export function cardStats(card) {
  return [card?.attack && `Attack ${card.attack}`, card?.damage && `Damage ${card.damage}`].filter(Boolean).join(' · ')
}

export const POWER_TYPES = ['at-will', 'utility', 'daily']
const HERO_KEYS = HERO_TEMPLATES.map((t) => t.key)

// Checks a card file and keeps the cards that can be used. Problems are listed
// so a typo in cards.json is easy to find instead of silently hiding a card.
export function normalizeCardFile(data) {
  const problems = []
  const powers = []
  const seen = new Set()
  const list = Array.isArray(data?.powers) ? data.powers : null
  if (!list) return { powers, abilities: [], problems: ['The file needs a "powers" list.'] }

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
      // Filled in on the setup screen: "always" cards are fixed (Keyleth's Lay on Hands),
      // "suggested" ones are the rulebook's picks and can be swapped.
      always: card.always === true,
      suggested: card.suggested === true,
    })
  })
  return { powers, abilities: normalizeAbilities(data?.heroes, problems), problems }
}

// Hero card abilities, such as Keyleth's Healing Hands. Optional; `level` 2 means
// the ability is only on the 2nd-level side of the card.
function normalizeAbilities(list, problems) {
  if (list === undefined) return []
  if (!Array.isArray(list)) {
    problems.push('"heroes" should be a list.')
    return []
  }
  const abilities = []
  list.forEach((entry, i) => {
    if (!HERO_KEYS.includes(entry?.hero)) {
      return problems.push(`Hero entry #${i + 1} has hero "${entry?.hero}"; use one of ${HERO_KEYS.join(', ')}.`)
    }
    for (const ability of Array.isArray(entry.abilities) ? entry.abilities : []) {
      if (!ability?.name || typeof ability.name !== 'string') {
        problems.push(`An ability for ${entry.hero} needs a "name".`)
        continue
      }
      abilities.push({
        hero: entry.hero,
        name: ability.name,
        text: typeof ability.text === 'string' ? ability.text : '',
        level: ability.level === 2 ? 2 : 1,
      })
    }
  })
  return abilities
}
