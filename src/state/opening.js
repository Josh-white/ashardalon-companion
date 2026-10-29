// The opening: when the heroes enter the dungeon, the narrator reads the adventure's
// story before anything else happens, so the roll for first turn and the starting
// treasure don't talk over it. Plain functions on the game state, used by the reducer.
//
// The screen playing the narration says when it starts and finishes (OPENING_NARRATING,
// OPENING_DONE). A game with no narration on any screen moves on once `until` passes, a
// guess at how long the story takes to read. Any screen can skip it.

// How fast the narrator reads a dramatic story, with a pause before and after.
const WORDS_PER_SECOND = 2.2
const PAD_MS = 2500
const MAX_MS = 90000

const words = (text) => (text ?? '').replace(/\[[^\]]*\]/g, ' ').split(/\s+/).filter(Boolean).length

// How long the opening lines take to read, roughly.
export function openingMs(state) {
  const adventure = state.adventure
  const said = `The adventure begins ${adventure?.card?.title ?? ''} Heroes, enter the dungeon. ${adventure?.story?.title ?? ''} ${adventure?.story?.text ?? ''}`
  return Math.min(MAX_MS, Math.round((words(said) / WORDS_PER_SECOND) * 1000) + PAD_MS)
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

export const openingNarrating = (state) =>
  state.opening && !state.opening.done ? { ...state, opening: { ...state.opening, narrating: true } } : state

// The story is over (or skipped): what waited for it comes out.
export function finishOpening(state) {
  if (!state.opening || state.opening.done) return state
  const after = state.opening.after
  const next = { ...state, opening: { ...state.opening, done: true, after: null } }
  return after ? { ...next, moment: { ...after, id: `${after.id}-after`, at: Date.now() } } : next
}
