// What the narrator says, and in whose voice. Compares the game before and after
// a change and returns the lines to speak, in order, as { text, voice }. Pure, so
// it is easy to test; the projector's useNarrator hook does the talking.

// The cast (the Pi's server/narrator.js picks the actual ElevenLabs voice for each):
// narrator tells the story, herald cheers the heroes on, danger brings bad news,
// and each villain speaks for itself in its own voice.
import { allyLine, COACHES } from '../data/coaches.js'
import { templateFor } from '../data/heroes.js'
import { VILLAIN_DEFAULT, VILLAIN_LINES } from '../data/villainLines.js'

export const VOICES = [
  ...new Set(['narrator', 'herald', 'danger', 'villain', ...Object.values(VILLAIN_LINES).map((v) => v.voice), ...Object.keys(COACHES).flatMap((key) => [`coach_${key}`, `hero_${key}`])]),
]

// A moment older than this is a device catching up, not news.
export const STALE_MS = 8000

const NEW_TILE = [
  'A new part of the dungeon is revealed…',
  'The darkness gives way to a new chamber…',
  'You step into the unknown…',
]
const SPAWN_OPENERS = ['Beware!', 'Look out!', 'From the shadows…']
// How each voice acts its lines (v3 performs these; the Pi drops them for older models).
const STORY = '[dramatic, mysterious]'
const OMINOUS = '[ominous]'
const CHEER = '[excited, triumphant]'
const ALARM = '[urgent, tense]'
// Lines can carry stage directions in square brackets ([menacing], [laughs]) that the
// expressive ElevenLabs voices act out; the Pi drops them for older models.

// A villain's line, in its own voice, or the danger voice for a beast.
const villainSays = (villain, when) => {
  const lines = VILLAIN_LINES[villain.name] ?? VILLAIN_DEFAULT
  return say(lines.voice, lines[when] ?? VILLAIN_DEFAULT[when])
}

// The narrator announces a villain, then the villain has its say.
const villainArrives = (villain, title = `${villain.fullName ?? villain.name} appears!`) => [
  say('narrator', `[dark, suspenseful] ${pick(SPAWN_OPENERS, title)} ${title}`),
  villainSays(villain, 'arrive'),
]
// A beaten villain gets its last words before the herald cheers.
const villainFalls = (villain, title = `${villain.name} defeated!`) => [villainSays(villain, 'fall'), say('herald', `${CHEER} ${title}`)]

// A villain that arrived, flipped or fell since the last state, when the screen's moment
// is something else (the chamber it waits in, the attack that beat it), so it still speaks.
// The lines match the recorded script (script.js), so nothing new needs ElevenLabs.
function villainCallLines(before, after, now, said) {
  const old = new Set((before.villainCalls ?? []).map((c) => c.id))
  const lines = []
  for (const call of after.villainCalls ?? []) {
    const villain = (after.villains ?? []).find((v) => v.id === call.villainId)
    if (old.has(call.id) || !villain || now - call.at >= STALE_MS) continue
    const own = call.when === 'arrive' ? villainArrives(villain) : call.when === 'fall' ? villainFalls(villain) : [villainSays(villain, 'enraged')]
    // The moment already gave the villain its line.
    if (said.some((line) => line?.text === villainSays(villain, call.when)?.text)) continue
    lines.push(...own)
  }
  return lines
}

const pick = (list, seed = '') => list[[...String(seed)].reduce((sum, c) => sum + c.charCodeAt(0), 0) % list.length]
const say = (voice, text) => (text ? { text, voice } : null)
// Lines use hero names, not the players' names typed in each game, so every line
// can be recorded once on the Pi and played back without ElevenLabs.
const heroName = (hero) => hero?.name ?? 'the hero'
// "Keyleth is down!" for one hero; anything longer gets one set line.
const downLine = (text) => text.match(/^[\w' -]+ is down!/)?.[0] ?? 'The heroes are falling!'

// A villain on the board whose name is in the moment's title, if any.
// A hero reads a card out loud, like a player reading it to the table: the drawing
// hero's own voice (hero_<key> on the Pi) says what the card makes happen. Card text
// comes from cards.json on the Pi, so these recordings are made there the first time a
// hero reads a card, and never go in the repository. `read` marks it for Skip.
export const READ_TAG = '[reading aloud]'
// How each hero reads, acted out by v3 (picked with JJ). A homebrew hero reads plainly.
export const HERO_READ_TAGS = {
  cleric: '[kind, reading aloud]',
  fighter: '[gruff, reading aloud]',
  paladin: '[noble, reading aloud]',
  rogue: '[swagger, reading aloud]',
  wizard: '[dramatic, reading aloud]',
}
export const cardWords = (text) =>
  String(text ?? '')
    .replace(/[•▪]\s*/g, '')
    // Card headings in capitals (OPEN THE CAGE:) would be shouted; AC, HP and XP stay.
    .replace(/\b[A-Z]{3,}\b/g, (word) => word[0] + word.slice(1).toLowerCase())
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (/[.!?:…)"”]$/.test(part) ? part : `${part}.`))
    .join(' ')
export function readsCard(hero, text) {
  const words = cardWords(text)
  if (!hero?.key || !words) return null
  return { text: `${HERO_READ_TAGS[hero.key] ?? READ_TAG} ${words}`, voice: `hero_${hero.key}`, read: true, heroId: hero.id }
}

// Cards found since the last state that aren't a moment of their own, read by the
// active hero: a chamber card (its goal, and its setup with real tiles, where the
// players place the figures), the villagers waiting in it, and a tile event.
export function cardReadings(before, after) {
  if (before.status !== 'playing' || after.status !== 'playing') return []
  const hero = after.heroes[after.turn.heroIndex]
  if (!hero) return []
  const lines = []
  const chamber = after.adventure?.chamber?.card
  if (chamber && chamber.id !== before.adventure?.chamber?.card?.id) {
    const setup = after.board ? [] : (chamber.setup ?? [])
    lines.push(readsCard(hero, [chamber.goal, ...setup].filter(Boolean).join('\n')))
  }
  const had = new Set((before.villagers ?? []).map((v) => v.id))
  for (const villager of after.villagers ?? []) {
    if (!had.has(villager.id) && villager.card?.text) lines.push(readsCard(hero, `${villager.name}.\n${villager.card.text}`))
  }
  const event = after.turn.tileEvent
  if (event?.text && (after.tileEventsSeen?.length ?? 0) > (before.tileEventsSeen?.length ?? 0)) lines.push(readsCard(hero, event.text))
  return lines.filter(Boolean)
}

const villainIn = (title, state) =>
  (state.villains ?? []).find((v) => title.includes(v.fullName ?? v.name) || title.includes(v.name))

// One moment's lines, or none for the everyday ones (plain rolls, monster attacks
// that hurt nobody badly) so the narrator doesn't talk over the whole game.
export function momentLines(moment, state) {
  const lines = momentSays(moment, state)
  // A card a moment brings along to be read (a boon): by the moment's hero, or whoever's turn it is.
  const reader = state.heroes.find((h) => h.id === moment.heroId) ?? state.heroes[state.turn?.heroIndex ?? -1]
  if (moment.read) lines.push(readsCard(reader, moment.read))
  return lines.filter(Boolean)
}

function momentSays(moment, state) {
  const hero = state.heroes.find((h) => h.id === moment.heroId)
  const values = moment.value != null ? [moment.value] : (moment.rolls ?? []).map((r) => r.value)
  switch (moment.kind) {
    case 'crit':
      return [say('herald', `${CHEER} A natural twenty for ${heroName(hero)}!`)]
    case 'fumble':
      return [say('danger', values.includes(1) ? `[disappointed sigh] Oh no… ${heroName(hero)} rolled a one.` : `${ALARM} ${moment.title}`)]
    case 'spawn': {
      const villain = villainIn(moment.title, state)
      if (!villain) return [say('danger', `${ALARM} ${pick(SPAWN_OPENERS, moment.title)} ${moment.title}`)]
      // The narrator announces a villain, then the villain has its say.
      if (moment.title.includes('enraged')) return [villainSays(villain, 'enraged')]
      return villainArrives(villain, moment.title)
    }
    case 'encounter': {
      const card = state.encounter?.card
      // An encounter card being drawn: its name and its story line.
      // The narrator names it, then the hero who drew it reads what happens.
      if (card && card.name === moment.title) return [say('narrator', `${OMINOUS} Encounter! ${card.name}. ${card.flavor ?? ''}`.trim()), readsCard(hero, card.text)].filter(Boolean)
      return [say('narrator', moment.title)]
    }
    case 'treasure': {
      // A treasure card just drawn: the hero who found it reads what it does.
      const card = state.treasure?.card
      const reads = card && card.name === moment.title ? readsCard(hero, card.text) : null
      return [say('herald', `${CHEER} Treasure! ${moment.title}`), reads].filter(Boolean)
    }
    case 'join':
      return [say('herald', `${CHEER} ${heroName(hero)} joins the party!`)]
    case 'level':
      return [say('herald', `${CHEER} ${moment.title} All hail ${hero?.name ?? 'the hero'}!`)]
    case 'defeat': {
      // A beaten villain gets its last words before the herald cheers.
      const villain = villainIn(moment.title, state)
      if (villain) return villainFalls(villain, moment.title)
      // A hero's attack ("Keyleth: Sun Strike!") changes with every power, so it gets
      // a set line per hero that can be recorded ahead of time.
      return [say('herald', `${CHEER} ${moment.title.includes(':') ? `${heroName(hero)} wins the fight!` : moment.title}`)]
    }
    case 'down':
      return [say('danger', `${ALARM} ${downLine(moment.title)}`)]
    case 'monster-down':
      // The title names the attack; the detail says who went down.
      return [say('danger', `${ALARM} ${downLine(moment.detail ?? '')}`)]
    default:
      return []
  }
}

// The intro screen's line, spoken when someone taps to wake the dragon.
export const INTRO_LINE = say('narrator', `${STORY} Beneath Firestorm Peak, the red dragon stirs. Who dares enter his halls?`)

// The herald calls out each hero as their torch is lit in the lobby.
export const arrivalLine = (heroKey) => {
  const template = templateFor(heroKey)
  return template ? say('herald', `${CHEER} ${template.name} the ${template.className} has arrived!`) : null
}

// Heroes picked on an iPad since the last state.
export const newArrivals = (before, after) => {
  if (before?.status !== 'setup' || after?.status !== 'setup') return []
  const had = new Set((before.lobby ?? []).map((c) => c.heroKey))
  return (after.lobby ?? []).map((c) => c.heroKey).filter((key) => !had.has(key))
}

const turnLine = (hero) => say('narrator', `[commanding, steady] ${hero.name}, it's your turn. What will you do?`)

// The herald names who won the roll for first turn.
export const firstTurnLine = (hero) => say('herald', `${CHEER} ${heroName(hero)} wins the roll and goes first!`)

// The Chronicle: back in the lobby between campaign adventures, the narrator recalls
// how the last one went.
const chamberPlace = (name) => (!name ? 'the chamber' : /'s\b/.test(name) ? name : `the ${name}`)
export const previouslyLine = (last) =>
  last.won
    ? say('narrator', `${STORY} Previously… the heroes conquered ${chamberPlace(last.chamber)}. But greater dangers still wait below.`)
    : say('narrator', `${STORY} Previously… the heroes were driven back from ${chamberPlace(last.chamber)}. They return, wiser and warier.`)

// The coach of a hero the computer plays (src/ally/) speaks up when it takes the hero
// over or hands it back, when it needs the players' help, and when the hero beats a monster.
export function allyLines(before, after, now = Date.now()) {
  if (before.status !== 'playing' || after.status !== 'playing') return []
  const lines = []
  for (const hero of after.heroes) {
    const was = before.heroes.find((h) => h.id === hero.id)
    if (Boolean(was?.ally) !== Boolean(hero.ally) && (was || hero.ally)) lines.push(allyLine(hero.key, hero.ally ? 'take' : 'back'))
  }
  const active = after.heroes[after.turn.heroIndex]
  if (!active?.ally) return lines
  if (after.turn.allyHelp && !before.turn.allyHelp) lines.push(allyLine(active.key, 'help'))
  const moment = after.moment
  const fresh = moment && moment.id !== before.moment?.id && now - moment.at < STALE_MS
  if (fresh && moment.kind === 'defeat' && /defeated|destroyed/i.test(moment.title ?? '')) lines.push(allyLine(active.key, 'defeat'))
  return lines
}

export function narrationFor(before, after, now = Date.now()) {
  if (!before || !after) return []
  const lines = newArrivals(before, after).map(arrivalLine)
  if (before.status !== 'setup' && after.status === 'setup' && after.campaign?.last) lines.push(previouslyLine(after.campaign.last))
  // The roll for first turn: a natural 20's cheer, then who goes first.
  const rolled = (after.firstRoll?.count ?? 0) > (before.firstRoll?.count ?? 0) ? after.firstRoll.last : null
  const rollLines = []
  if (rolled?.value === 20) rollLines.push(say('herald', `${CHEER} A natural twenty for ${heroName(after.heroes.find((h) => h.id === rolled.heroId))}!`))
  const winner = after.firstRoll?.winner
  if (winner && !before.firstRoll?.winner) rollLines.push(firstTurnLine(after.heroes.find((h) => h.id === winner)))
  // The winner stays on screen, and the starting treasure waits, while these are said.
  lines.push(...rollLines.filter(Boolean).map((line) => ({ ...line, hold: 'firstRoll' })))
  // The first hero is told it's their turn once the roll and the starting treasure are over.
  const rollOver = (before.firstRoll?.after && !after.firstRoll?.after) || (before.firstRoll && !after.firstRoll)
  const waitingOnRoll = Boolean(after.firstRoll?.after)
  if (after.status === 'playing' && before.status === 'playing') {
    const turnChanged = before.turn.heroIndex !== after.turn.heroIndex || before.turn.round !== after.turn.round
    const hero = after.heroes[after.turn.heroIndex]
    if (turnChanged && after.turn.phase === 0 && hero && !waitingOnRoll) lines.push(turnLine(hero))
    if (!before.turn.explored && after.turn.explored) lines.push(say('narrator', `${OMINOUS} ${pick(NEW_TILE, `${after.turn.round}-${after.turn.heroIndex}`)}`))
  }
  // A new game, from the lobby or Try again after a loss (not Back to the game).
  const starting = after.status === 'playing' && (before.status === 'setup' || (before.status !== 'playing' && Boolean(after.opening) && after.opening.until !== before.opening?.until))
  const storyAt = lines.length
  // An adventure's red "Read aloud" box: the whole story, not just its title.
  const story = after.adventure?.story
  const newStory = story?.text && story.id !== before.adventure?.story?.id
  if (newStory) {
    const title = story.title === after.adventure.card?.title || story.title === 'Victory!' ? '' : story.title
    lines.push(say('narrator', `${STORY} ${title} ${story.text}`.replace(/\s+/g, ' ').trim()))
  }
  // A new game reads like its opening screen, top to bottom: the adventure's name, its story,
  // then the call into the dungeon.
  if (starting) {
    lines.splice(storyAt, 0, say('narrator', `${STORY} The adventure begins${after.adventure?.card?.title ? `: ${after.adventure.card.title}` : ''}!`))
    const goal = after.adventure?.card?.goal
    if (goal) lines.push(say('narrator', `${STORY} Your quest: ${goal}`))
    lines.push(say('narrator', `${STORY} Heroes, enter the dungeon!`))
  }
  // The lines that open a game are the opening story (state/opening.js): the roll for
  // first turn waits for them. `hold` names what waits for a line.
  if (starting) {
    for (let i = 0; i < lines.length; i++) if (lines[i]) lines[i] = { ...lines[i], hold: 'opening' }
  }
  const moment = after.moment
  if (moment && moment.id !== before.moment?.id && now - moment.at < STALE_MS) {
    lines.push(...momentLines(moment, after))
  }
  lines.push(...cardReadings(before, after))
  lines.push(...villainCallLines(before, after, now, lines))
  lines.push(...allyLines(before, after, now))
  if (rollOver && after.status === 'playing' && after.turn.phase === 0 && after.heroes[after.turn.heroIndex]) lines.push(turnLine(after.heroes[after.turn.heroIndex]))
  if (before.status !== after.status && after.status === 'won' && !newStory) lines.push(say('herald', `${CHEER} Victory! The heroes have triumphed. Songs will be sung of this day!`))
  if (before.status !== after.status && after.status === 'lost') lines.push(say('narrator', '[somber, tragic] Alas… the heroes have fallen. The dungeon claims another party.'))
  return lines.filter(Boolean)
}
