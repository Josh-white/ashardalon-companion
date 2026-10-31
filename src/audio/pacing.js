// How the narrator spaces its lines, so one voice doesn't land on top of the next.

// A breath between two lines from the same speaker.
export const PAUSE_MS = 700
// A longer one when someone else speaks next (the narrator, then a villain).
export const SWITCH_PAUSE_MS = 1000
// A short pause after a moment's sound effects end, so the voice doesn't step on them.
export const AFTER_SFX_MS = 300

// The pause after `before` is said, when `next` is the line that follows.
export function pauseBetween(before, next) {
  if (!before) return 0
  return next && next.voice !== before.voice ? SWITCH_PAUSE_MS : PAUSE_MS
}

// How long the next line still has to wait at `now`: until the pause after the last
// line is over, and until any sound effects still playing are done.
export function waitMs(now, { restUntil = 0, sfxUntil = 0 } = {}) {
  return Math.max(0, restUntil - now, sfxUntil ? sfxUntil + AFTER_SFX_MS - now : 0)
}
