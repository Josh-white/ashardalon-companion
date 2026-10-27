// The adventure being played: its goal, how far the party has got, and the special
// tiles still to come. Plain functions on the game state, used by the game reducer.

// Bigger features an adventure can need. The picker only offers an adventure once the
// app has every feature it needs; the others show what they're waiting for.
export const SUPPORTED_FEATURES = ['villains']

export const FEATURE_LABELS = {
  villains: 'villains',
  chambers: 'chambers',
  doors: 'doors',
  villagers: 'villagers',
  'adventure-encounters': 'adventure encounter cards',
  'vast-gate': 'the Vast Gate',
  'time-tokens': 'time tokens',
  campaign: 'campaigns',
}

export const missingFeatures = (adventure) => adventure.needs.filter((f) => !SUPPORTED_FEATURES.includes(f))
export const isPlayable = (adventure) => missingFeatures(adventure).length === 0

export const MIN_SURGES = 1
export const MAX_SURGES = 3

let storyCounter = 0
const story = (title, text, steps = []) => (text || steps.length > 0 ? { id: `story-${Date.now().toString(36)}-${storyCounter++}`, title, text, steps } : null)

// A fresh adventure for a new game, with its start text ready to read aloud.
export function newAdventure(card) {
  return {
    card,
    revealed: [], // tiles already revealed
    figuresDefeated: 0,
    guardians: 0, // guardians placed by a reveal
    guardiansDefeated: 0,
    tokens: [], // objective tokens such as Roghar's Gear: { name, heldBy }
    escaped: false,
    extraEncounters: 0, // encounter cards every Villain Phase on top of the usual ones
    onceSeen: [], // onceOnly monsters already drawn
    won: false,
    story: story(card.title, card.story.start),
  }
}

const update = (state, change) => ({ ...state, adventure: { ...state.adventure, ...change(state.adventure) } })

export const showStory = (state, title, text, steps) => update(state, () => ({ story: story(title, text, steps) }))

// Counts defeated monster figures and guardians toward the goal.
export function countDefeat(state, monster, figures, defeated) {
  if (!state.adventure || figures <= 0) return state
  return update(state, (a) => ({
    figuresDefeated: a.figuresDefeated + figures,
    guardiansDefeated: a.guardiansDefeated + (defeated && monster.guardian ? 1 : 0),
  }))
}

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase()

// A monster card the adventure allows only once per game (Monster Hunt's Legion Devil).
// Returns 'discard' for a later copy; the first copy is noted.
export function onceOnlyDraw(state, card) {
  const adventure = state.adventure
  if (!adventure || !adventure.card.onceOnly.some((name) => sameName(name, card.name))) return { state, discard: false }
  if (adventure.onceSeen.some((name) => sameName(name, card.name))) return { state, discard: true }
  return { state: update(state, (a) => ({ onceSeen: [...a.onceSeen, card.name] })), discard: false }
}

// The adventure's special tiles that haven't turned up yet.
export const tilesToCome = (adventure) => (adventure ? adventure.card.reveals.filter((r) => !adventure.revealed.includes(r.tile)) : [])

// The goal, split into the parts the app checks, each with whether it's done.
export function goalParts(state) {
  const adventure = state.adventure
  if (!adventure) return []
  const { win } = adventure.card
  const parts = []
  if (win.figures > 0) {
    parts.push({ key: 'figures', label: `Defeat ${win.figures} monsters`, progress: `${Math.min(adventure.figuresDefeated, win.figures)} of ${win.figures}`, done: adventure.figuresDefeated >= win.figures })
  }
  if (win.guardians) {
    const placed = adventure.guardians > 0
    parts.push({
      key: 'guardians',
      label: 'Defeat the guardians',
      progress: placed ? `${adventure.guardiansDefeated} of ${adventure.guardians}` : 'not found yet',
      done: placed && adventure.guardiansDefeated >= adventure.guardians,
    })
  }
  for (const name of win.tokens) {
    const token = adventure.tokens.find((t) => sameName(t.name, name))
    const holder = token?.heldBy && state.heroes.find((h) => h.id === token.heldBy)
    parts.push({ key: `token-${name}`, label: `Get the ${name}`, progress: holder ? `${holder.name} has it` : token ? 'waiting to be picked up' : 'not found yet', done: Boolean(holder) })
  }
  for (const name of win.villains) {
    const villain = (state.villains ?? []).find((v) => sameName(v.name, name))
    parts.push({ key: `villain-${name}`, label: `Defeat the ${name}`, progress: villain?.defeated ? 'defeated' : villain ? 'in play' : 'not found yet', done: Boolean(villain?.defeated) })
  }
  if (win.escape) parts.push({ key: 'escape', label: 'Escape the dungeon', progress: adventure.escaped ? 'escaped' : '', done: adventure.escaped })
  return parts
}

export const goalMet = (state) => {
  const parts = goalParts(state)
  return parts.length > 0 && parts.every((p) => p.done)
}

// Calls the victory as soon as the goal is met, with the book's victory text to read.
export function checkVictory(state) {
  const adventure = state.adventure
  if (!adventure || adventure.won || state.status !== 'playing' || !goalMet(state)) return state
  const won = update({ ...state, status: 'won' }, () => ({ won: true }))
  return showStory(won, 'Victory!', adventure.card.story.victory)
}

export const takeToken = (state, name, heroId) =>
  update(state, (a) => ({ tokens: a.tokens.map((t) => (sameName(t.name, name) ? { ...t, heldBy: heroId } : t)) }))
