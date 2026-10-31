// The opening: when the heroes enter the dungeon, the narrator reads the adventure's
// story before anything else happens, so the roll for first turn and the starting
// treasure don't talk over it. Plain functions on the game state, used by the reducer.
//
// The screen playing the narration says when it starts and finishes (OPENING_NARRATING,
// OPENING_QUIET). Either way the screens move on (OPENING_DONE) once `until` passes, a guess
// at how long the story takes to read plus time to read the briefing's rules, or once the
// narrator finishes if that's later. Any screen can skip it.

// How fast the narrator reads a dramatic story, with a pause before and after.
const WORDS_PER_SECOND = 2.2
const PAD_MS = 2500
const MAX_MS = 90000

// How fast the players read the briefing's rules to themselves (they aren't read aloud).
const READ_WORDS_PER_SECOND = 3

const words = (text) => (text ?? '').replace(/\[[^\]]*\]/g, ' ').split(/\s+/).filter(Boolean).length

// Rules every game has, or that only matter after the adventure: not part of the briefing.
const NOT_BRIEFED = /^(victory|defeat|between adventures)$/i

// The briefing under the story: the adventure's goal, how to win tonight (when that
// differs from the goal, as in a campaign) and its special rules.
export function briefing(card) {
  if (!card) return null
  const rules = card.rules ?? []
  const victory = rules.find((r) => /^victory$/i.test(r.name))?.text ?? ''
  return {
    goal: card.goal ?? '',
    win: card.campaign && victory ? victory : '',
    rules: rules.filter((r) => !NOT_BRIEFED.test(r.name) && r.text),
  }
}

// How long the opening lines take to read, roughly, plus time to read the briefing.
export function openingMs(state) {
  const adventure = state.adventure
  const brief = briefing(adventure?.card)
  const said = `The adventure begins ${adventure?.card?.title ?? ''} Heroes, enter the dungeon. ${adventure?.story?.title ?? ''} ${adventure?.story?.text ?? ''} ${brief?.goal ? `Your quest: ${brief.goal}` : ''}`
  const read = brief ? words([brief.win, ...brief.rules.map((r) => `${r.name} ${r.text}`)].join(' ')) / READ_WORDS_PER_SECOND : 0
  return Math.min(MAX_MS, Math.round((words(said) / WORDS_PER_SECOND + read) * 1000) + PAD_MS)
}

// A game that just began. A moment that came with it (one hero's starting treasure) waits
// for the story too; with a roll for first turn, the roll is what waits.
export function startOpening(state, now) {
  const held = !state.firstRoll && state.moment ? state.moment : null
  return {
    ...state,
    moment: held ? null : state.moment,
    opening: { until: now + openingMs(state), narrating: false, done: false, after: held },
  }
}

// Whether the story is still being told.
export const openingPlaying = (state, now) => {
  const opening = state?.status === 'playing' ? state.opening : null
  return Boolean(opening && !opening.done && (opening.narrating || now < opening.until))
}

export const openingNarrating = (state, narrating = true) =>
  state.opening && !state.opening.done && state.opening.narrating !== narrating ? { ...state, opening: { ...state.opening, narrating } } : state

// The story is over (or skipped): what waited for it comes out.
export function finishOpening(state) {
  if (!state.opening || state.opening.done) return state
  const after = state.opening.after
  const next = { ...state, opening: { ...state.opening, done: true, after: null } }
  return after ? { ...next, moment: { ...after, id: `${after.id}-after`, at: Date.now() } } : next
}
