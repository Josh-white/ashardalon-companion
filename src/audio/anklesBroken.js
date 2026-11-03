// Easton's idea: once in a while, an attack that misses completely gets "ANKLES BROKEN!"
// on the screen and a bone crack. Every screen must agree, so the pick comes from the
// moment's id (the same on every screen), not from a fresh random number.

// About 1 in 20 misses. Easton asked for 1 in 100; JJ wanted it to show up now and then.
export const ANKLES_ODDS = 20

// A small, steady hash of a string (FNV-1a), so the same id always gives the same answer.
function hash(text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// True when every die in an attack missed: a hero's attack on monsters, or a monster's
// (or trap's) attack on heroes.
export function allMissed(moment) {
  const rolls = moment?.rolls ?? []
  return rolls.length > 0 && rolls.every((r) => r.hit === false)
}

// Whether this moment is one of the rare ankle-breaking misses.
export function anklesBroken(moment) {
  if (!moment?.id || !allMissed(moment)) return false
  return hash(`ankles:${moment.id}`) % ANKLES_ODDS === 0
}
