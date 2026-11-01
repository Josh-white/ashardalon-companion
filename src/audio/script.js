// Every line the narrator can say ahead of time, built from the cards on the Pi.
// server/record-narration.js records them all once, so the narrator can keep
// playing them after the ElevenLabs key is gone. The lines come from the same
// functions the projector uses, so the words match exactly.
import { ALLY_LINES, allyLine, coachLine } from '../data/coaches.js'
import { heroTemplates } from '../data/heroes.js'
import { VILLAIN_LINES } from '../data/villainLines.js'
import { INTRO_LINE, firstTurnLine, momentLines, narrationFor, previouslyLine, readsCard } from './narration.js'
import { TILE_EVENTS } from '../data/tileEvents.js'

const article = (name) => (/^[aeiou]/i.test(name) ? 'An' : 'A')

export function narrationScript(cards) {
  // Every hero in cards.json, homebrew ones too, so their lines are recorded with the rest.
  const templates = cards.heroes ?? heroTemplates()
  const heroes = templates.map((h, i) => ({ id: `h${i}`, name: h.name }))
  const villains = (cards.villains ?? []).map((v, i) => ({ id: `v${i}`, name: v.name, fullName: v.fullName ?? v.name }))
  const base = { status: 'playing', heroes, villains, turn: { heroIndex: 0, phase: 0, round: 1 }, moment: null, encounter: null, adventure: null }
  const lines = []
  const moment = (m, state = base) => lines.push(...momentLines(m, state))
  const change = (before, after) => lines.push(...narrationFor({ ...base, ...before }, { ...base, ...after }, 0))

  // The intro screen, and the herald calling out each hero in the lobby.
  lines.push(INTRO_LINE)
  for (const hero of templates) change({ status: 'setup', lobby: [] }, { status: 'setup', lobby: [{ heroKey: hero.key }] })
  // Each hero's coach, for a player picking that hero for the first time (or asking again).
  for (const hero of templates) {
    const line = coachLine(hero.key)
    if (line) lines.push(line)
  }
  // What each coach says while the computer plays their hero.
  for (const hero of templates) for (const when of Object.keys(ALLY_LINES[hero.key] ?? {})) lines.push(allyLine(hero.key, when))
  // Who won the roll for first turn, and the Chronicle's look back between campaign adventures.
  for (const hero of heroes) lines.push(firstTurnLine(hero))
  for (const won of [true, false]) {
    lines.push(previouslyLine({ won, chamber: null }))
    for (const card of cards.chambers ?? []) lines.push(previouslyLine({ won, chamber: card.name }))
  }

  // The start of a game, with and without an adventure.
  change({ status: 'setup' }, {})
  for (const card of cards.adventures ?? []) {
    const adventure = (story) => ({ card, story })
    change({ status: 'setup' }, { adventure: adventure(null) })
    const stories = [
      { title: card.title, text: card.story?.start },
      { title: 'Victory!', text: card.story?.victory },
      ...(card.reveals ?? []).map((r) => ({ title: `The ${r.tile}!`, text: r.story })),
    ]
    stories.forEach((story, i) => story.text && change({ adventure: adventure(null) }, { adventure: adventure({ id: `s${i}`, ...story }) }))
  }

  // Whose turn it is, and new tiles (each of the three tile lines).
  heroes.forEach((hero, i) => change({ turn: { heroIndex: (i + heroes.length - 1) % heroes.length, phase: 2, round: 1 } }, { turn: { heroIndex: i, phase: 0, round: 2 } }))
  for (let round = 1; round <= 12; round++) {
    heroes.forEach((_, i) => change({ turn: { heroIndex: i, phase: 1, round } }, { turn: { heroIndex: i, phase: 1, round, explored: true } }))
  }

  for (const hero of heroes) {
    moment({ kind: 'crit', heroId: hero.id, value: 20, title: 'NATURAL 20!' })
    moment({ kind: 'fumble', heroId: hero.id, value: 1, title: 'Oops… a 1' })
    moment({ kind: 'level', heroId: hero.id, title: `${hero.name} reached level 2!` })
    moment({ kind: 'join', heroId: hero.id, title: `${hero.name} joins the party!` })
    moment({ kind: 'down', title: `${hero.name} is down!` })
    moment({ kind: 'defeat', heroId: hero.id, title: `${hero.name}: attack!` })
    moment({ kind: 'encounter', heroId: hero.id, title: `${hero.name} is back!` })
  }
  moment({ kind: 'down', title: 'Two heroes are down!' })
  moment({ kind: 'fumble', title: 'A Trapped Door!' })

  for (const card of cards.monsters ?? []) {
    const figures = card.figures ?? 1
    moment({ kind: 'spawn', title: figures > 1 ? `${figures} ${card.name}s appear!` : `${article(card.name)} ${card.name} appears!` })
    moment({ kind: 'defeat', title: `${card.name} defeated!` })
    moment({ kind: 'defeat', title: `The ${card.name} is destroyed!` })
  }
  for (const card of cards.chambers ?? []) moment({ kind: 'spawn', title: `The ${card.name}!` })
  for (const villain of villains) {
    moment({ kind: 'spawn', title: `${villain.fullName} appears!` })
    if (VILLAIN_LINES[villain.name]?.enraged) moment({ kind: 'spawn', title: `The ${villain.name} is enraged!` })
    moment({ kind: 'defeat', title: `${villain.name} defeated!` })
  }
  for (const card of cards.encounters ?? []) {
    moment({ kind: 'encounter', title: card.name }, { ...base, encounter: { card } })
  }
  for (const card of cards.treasures ?? []) moment({ kind: 'treasure', title: card.name })
  moment({ kind: 'treasure', title: 'Starting treasure!' })

  // The end of the game.
  change({}, { status: 'won' })
  change({}, { status: 'lost' })

  // Each line once.
  const seen = new Set()
  return lines.filter((line) => {
    const key = `${line.voice}|${line.text}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// Every card a hero can read out loud, in the voices of the heroes named (all of them
// when none are). Not part of the script above: all of it in every voice is more
// ElevenLabs credits than a month has, so a card is recorded the first time a hero reads
// it, or ahead of time with record-narration.js --cards=<hero,hero>.
export function cardReadingScript(cards, heroKeys = null) {
  const templates = (cards.heroes ?? heroTemplates()).filter((h) => !heroKeys || heroKeys.includes(h.key))
  const lines = []
  for (const template of templates) {
    const hero = { id: template.key, key: template.key }
    for (const card of cards.encounters ?? []) lines.push(readsCard(hero, card.text))
    for (const card of cards.treasures ?? []) lines.push(readsCard(hero, card.text))
    for (const card of cards.chambers ?? []) {
      lines.push(readsCard(hero, card.goal))
      lines.push(readsCard(hero, [card.goal, ...(card.setup ?? [])].filter(Boolean).join('\n')))
    }
    for (const card of cards.villagers ?? []) if (card.text) lines.push(readsCard(hero, `${card.name}.\n${card.text}`))
    for (const card of cards.boons ?? []) lines.push(readsCard(hero, card.text))
    for (const event of TILE_EVENTS) {
      lines.push(readsCard(hero, event.text))
    }
  }
  const seen = new Set()
  return lines.filter((line) => line && !seen.has(`${line.voice}|${line.text}`) && seen.add(`${line.voice}|${line.text}`))
}

