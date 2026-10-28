// What the narrator says, and in whose voice. Compares the game before and after
// a change and returns the lines to speak, in order, as { text, voice }. Pure, so
// it is easy to test; the projector's useNarrator hook does the talking.

// The cast (the Pi's server/narrator.js picks the actual ElevenLabs voice for each):
// narrator tells the story, herald cheers the heroes on, danger brings bad news,
// and each villain speaks for itself in its own voice.
import { VILLAIN_DEFAULT, VILLAIN_LINES } from '../data/villainLines.js'

export const VOICES = [...new Set(['narrator', 'herald', 'danger', 'villain', ...Object.values(VILLAIN_LINES).map((v) => v.voice)])]

// A moment older than this is a device catching up, not news.
export const STALE_MS = 8000

const NEW_TILE = [
  'A new part of the dungeon is revealed…',
  'The darkness gives way to a new chamber…',
  'You step into the unknown…',
]
const SPAWN_OPENERS = ['Beware!', 'Look out!', 'From the shadows…']
// Lines can carry stage directions in square brackets ([menacing], [laughs]) that the
// expressive ElevenLabs voices act out; the Pi drops them for older models.

// A villain's line, in its own voice, or the danger voice for a beast.
const villainSays = (villain, when) => {
  const lines = VILLAIN_LINES[villain.name] ?? VILLAIN_DEFAULT
  return say(lines.voice, lines[when] ?? VILLAIN_DEFAULT[when])
}

const pick = (list, seed = '') => list[[...String(seed)].reduce((sum, c) => sum + c.charCodeAt(0), 0) % list.length]
const say = (voice, text) => (text ? { text, voice } : null)
const who = (hero) => hero?.player || hero?.name || 'Someone'

// A villain on the board whose name is in the moment's title, if any.
const villainIn = (title, state) =>
  (state.villains ?? []).find((v) => title.includes(v.fullName ?? v.name) || title.includes(v.name))

// One moment's lines, or none for the everyday ones (plain rolls, monster attacks
// that hurt nobody badly) so the narrator doesn't talk over the whole game.
export function momentLines(moment, state) {
  const hero = state.heroes.find((h) => h.id === moment.heroId)
  const values = moment.value != null ? [moment.value] : (moment.rolls ?? []).map((r) => r.value)
  switch (moment.kind) {
    case 'crit':
      return [say('herald', hero ? `[excited] A natural twenty for ${who(hero)}! ${moment.title.includes(':') ? moment.title : ''}`.trim() : 'A natural twenty!')]
    case 'fumble':
      return [say('danger', values.includes(1) ? `[sighs] Oh no… ${who(hero)} rolled a one.` : moment.title)]
    case 'spawn': {
      const villain = villainIn(moment.title, state)
      if (!villain) return [say('danger', `${pick(SPAWN_OPENERS, moment.title)} ${moment.title}`)]
      // The narrator announces a villain, then the villain has its say.
      if (moment.title.includes('enraged')) return [villainSays(villain, 'enraged')]
      return [say('narrator', `${pick(SPAWN_OPENERS, moment.title)} ${moment.title}`), villainSays(villain, 'arrive')]
    }
    case 'encounter': {
      const card = state.encounter?.card
      // An encounter card being drawn: its name and its story line.
      if (card && card.name === moment.title) return [say('narrator', `Encounter! ${card.name}. ${card.flavor ?? ''}`.trim())]
      return [say('narrator', moment.title)]
    }
    case 'treasure':
      return [say('herald', `Treasure! ${moment.title}`)]
    case 'level':
      return [say('herald', `${moment.title} All hail ${hero?.name ?? 'the hero'}!`)]
    case 'defeat': {
      // A beaten villain gets its last words before the herald cheers.
      const villain = villainIn(moment.title, state)
      return villain ? [villainSays(villain, 'fall'), say('herald', moment.title)] : [say('herald', moment.title)]
    }
    case 'down':
    case 'monster-down':
      return [say('danger', moment.title)]
    default:
      return []
  }
}

export function narrationFor(before, after, now = Date.now()) {
  if (!before || !after) return []
  const lines = []
  if (before.status === 'setup' && after.status === 'playing') {
    lines.push(say('narrator', `The adventure begins${after.adventure?.card?.title ? `: ${after.adventure.card.title}` : ''}! Heroes, enter the dungeon.`))
  }
  if (after.status === 'playing' && before.status === 'playing') {
    const turnChanged = before.turn.heroIndex !== after.turn.heroIndex || before.turn.round !== after.turn.round
    const hero = after.heroes[after.turn.heroIndex]
    if (turnChanged && after.turn.phase === 0 && hero) lines.push(say('narrator', `${who(hero)}, it's your turn. What will ${hero.name} do?`))
    if (!before.turn.explored && after.turn.explored) lines.push(say('narrator', pick(NEW_TILE, `${after.turn.round}-${after.turn.heroIndex}`)))
  }
  // An adventure's red "Read aloud" box: the whole story, not just its title.
  const story = after.adventure?.story
  const newStory = story?.text && story.id !== before.adventure?.story?.id
  if (newStory) {
    const title = story.title === after.adventure.card?.title || story.title === 'Victory!' ? '' : story.title
    lines.push(say('narrator', `${title} ${story.text}`.trim()))
  }
  const moment = after.moment
  if (moment && moment.id !== before.moment?.id && now - moment.at < STALE_MS) {
    lines.push(...momentLines(moment, after))
  }
  if (before.status !== after.status && after.status === 'won' && !newStory) lines.push(say('herald', '[excited] Victory! The heroes have triumphed. Songs will be sung of this day!'))
  if (before.status !== after.status && after.status === 'lost') lines.push(say('narrator', 'Alas… the heroes have fallen. The dungeon claims another party.'))
  return lines.filter(Boolean)
}
