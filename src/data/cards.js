import { CONDITIONS, HERO_TEMPLATES } from './heroes.js'

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
  if (!list) return { powers, abilities: [], monsters: [], problems: ['The file needs a "powers" list.'] }

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
  return {
    powers,
    abilities: normalizeAbilities(data?.heroes, problems),
    monsters: normalizeMonsters(data?.monsters, problems),
    problems,
  }
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

// What a monster's tactics can ask about the board, in the order a card checks them.
export const TACTIC_CHECKS = ['adjacent', 'sameTile', 'within1', 'within2', 'aloneByUnexploredEdge']
const MOVES = ['adjacent', 'toward']
const wholeNumber = (value, min = 0) => Number.isInteger(value) && value >= min

// Monster cards, for the virtual monster deck and the guided Villain Phase. Optional.
// Each card lists its attacks and its tactics as steps: the first step whose `when`
// is true happens, and a step without `when` is the "Otherwise".
function normalizeMonsters(list, problems) {
  if (list === undefined) return []
  if (!Array.isArray(list)) {
    problems.push('"monsters" should be a list.')
    return []
  }
  const monsters = []
  const seen = new Set()
  list.forEach((card, i) => {
    const label = card?.name ? `"${card.name}"` : `monster #${i + 1}`
    if (!card || typeof card !== 'object') return problems.push(`${label} is not a card.`)
    if (!card.id || typeof card.id !== 'string') return problems.push(`${label} needs an "id".`)
    if (seen.has(card.id)) return problems.push(`${label} reuses the id "${card.id}".`)
    if (!card.name || typeof card.name !== 'string') return problems.push(`${label} needs a "name".`)
    for (const field of ['ac', 'hp', 'xp']) {
      if (!wholeNumber(card[field], field === 'xp' ? 0 : 1)) return problems.push(`${label} needs a number for "${field}".`)
    }
    const attacks = []
    for (const attack of Array.isArray(card.attacks) ? card.attacks : []) {
      if (!attack?.id || !attack.name || !wholeNumber(attack.bonus) || !wholeNumber(attack.damage ?? 0)) {
        return problems.push(`${label} has an attack that needs an "id", a "name", a "bonus" and a "damage".`)
      }
      attacks.push({
        id: String(attack.id),
        name: String(attack.name),
        bonus: attack.bonus,
        damage: attack.damage ?? 0,
        miss: wholeNumber(attack.miss) ? attack.miss : 0,
        conditions: (Array.isArray(attack.conditions) ? attack.conditions : []).filter((c) => CONDITIONS.includes(c)),
      })
    }
    const tactics = []
    for (const step of Array.isArray(card.tactics) ? card.tactics : []) {
      if (step?.when !== undefined && !TACTIC_CHECKS.includes(step.when)) {
        return problems.push(`${label} has a tactic with when "${step.when}"; use one of ${TACTIC_CHECKS.join(', ')}.`)
      }
      if (step.attack !== undefined && !attacks.some((a) => a.id === step.attack)) {
        return problems.push(`${label} has a tactic that uses the attack "${step.attack}", which isn't on the card.`)
      }
      if (step.move !== undefined && !MOVES.includes(step.move)) {
        return problems.push(`${label} has a tactic with move "${step.move}"; use one of ${MOVES.join(', ')}.`)
      }
      tactics.push({
        when: step.when ?? null,
        move: step.move ?? null,
        attack: step.attack ?? null,
        targets: step.targets === 'all' ? 'all' : 'one',
        explore: step.explore === true,
        text: typeof step.text === 'string' ? step.text : '',
      })
    }
    if (tactics.length === 0) return problems.push(`${label} needs a "tactics" list.`)
    seen.add(card.id)
    monsters.push({
      id: card.id,
      name: card.name,
      ac: card.ac,
      hp: card.hp,
      xp: card.xp,
      copies: wholeNumber(card.copies, 1) ? card.copies : 1,
      // Legion Devils come in threes: one card, three figures.
      figures: wholeNumber(card.figures, 1) ? card.figures : 1,
      special: typeof card.special === 'string' ? card.special : '',
      attacks,
      tactics,
    })
  })
  return monsters
}
