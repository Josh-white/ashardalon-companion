// What the narrator says. Compares the game before and after a change and
// returns the lines to speak, in order. Pure, so it is easy to test; the
// projector's useNarrator hook does the talking.

// A moment older than this is a device catching up, not news.
export const STALE_MS = 8000

const NEW_TILE = [
  'A new part of the dungeon is revealed…',
  'The darkness gives way to a new chamber…',
  'You step into the unknown…',
]
const SPAWN_OPENERS = ['Beware!', 'Look out!', 'From the shadows…']

const pick = (list, seed = '') => list[[...String(seed)].reduce((sum, c) => sum + c.charCodeAt(0), 0) % list.length]
const who = (hero) => hero?.player || hero?.name || 'Someone'

// One moment's line, or null for the everyday ones (plain rolls, monster attacks
// that hurt nobody badly) so the narrator doesn't talk over the whole game.
export function momentLine(moment, state) {
  const hero = state.heroes.find((h) => h.id === moment.heroId)
  const values = moment.value != null ? [moment.value] : (moment.rolls ?? []).map((r) => r.value)
  switch (moment.kind) {
    case 'crit':
      return hero ? `A natural twenty for ${who(hero)}! ${moment.title.includes(':') ? moment.title : ''}`.trim() : 'A natural twenty!'
    case 'fumble':
      return values.includes(1) ? `Oh no… ${who(hero)} rolled a one.` : moment.title
    case 'spawn':
      return `${pick(SPAWN_OPENERS, moment.title)} ${moment.title}`
    case 'encounter': {
      const card = state.encounter?.card
      // An encounter card being drawn: its name and its story line.
      if (card && card.name === moment.title) return `Encounter! ${card.name}. ${card.flavor ?? ''}`.trim()
      return moment.title
    }
    case 'treasure':
      return `Treasure! ${moment.title}`
    case 'level':
      return `${moment.title} All hail ${hero?.name ?? 'the hero'}!`
    case 'defeat':
    case 'down':
    case 'monster-down':
      return moment.title
    default:
      return null
  }
}

export function narrationFor(before, after, now = Date.now()) {
  if (!before || !after) return []
  const lines = []
  if (before.status === 'setup' && after.status === 'playing') {
    lines.push(`The adventure begins${after.adventure?.card?.title ? `: ${after.adventure.card.title}` : ''}! Heroes, enter the dungeon.`)
  }
  if (after.status === 'playing' && before.status === 'playing') {
    const turnChanged = before.turn.heroIndex !== after.turn.heroIndex || before.turn.round !== after.turn.round
    const hero = after.heroes[after.turn.heroIndex]
    if (turnChanged && after.turn.phase === 0 && hero) lines.push(`${who(hero)}, it's your turn. What will ${hero.name} do?`)
    if (!before.turn.explored && after.turn.explored) lines.push(pick(NEW_TILE, `${after.turn.round}-${after.turn.heroIndex}`))
  }
  const moment = after.moment
  if (moment && moment.id !== before.moment?.id && now - moment.at < STALE_MS) {
    const line = momentLine(moment, after)
    if (line) lines.push(line)
  }
  if (before.status !== after.status && after.status === 'won') lines.push('Victory! The heroes have triumphed. Songs will be sung of this day!')
  if (before.status !== after.status && after.status === 'lost') lines.push('Alas… the heroes have fallen. The dungeon claims another party.')
  return lines
}
