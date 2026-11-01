// Whether this screen is still playing something worth hearing to the end: a sound effect
// (a roar, a fanfare, the die) or the narrator. The computer allies (src/ally/) wait for
// it before their next step, so their turns don't run ahead of the sounds.

let sfxUntil = 0
let narrator = () => false

// A sound effect starts now and lasts `ms`.
export function soundPlaying(ms) {
  if (ms > 0) sfxUntil = Math.max(sfxUntil, Date.now() + ms)
}

// The narrator tells us how to know it is busy (speaking, or lines waiting to be said).
export function narratorBusyIs(check) {
  narrator = check
}

export const audioBusy = (now = Date.now()) => now < sfxUntil || narrator()
