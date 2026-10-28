// The page's mixer. Everything that makes a sound plugs into one of three layers, and
// all of them go through one gentle limiter so a fanfare on top of a clang doesn't clip:
//
//   sfx         sound effects and the sound board, always at full volume
//   voice       the narrator
//   background  the music and the ambient loops (each at its own level, about 30%),
//               which dip whenever something more important is playing
//
// What dips the background is a list of reasons to be quiet (the narrator talking,
// a big moment's sounds). The quietest one wins, so a voice over a natural 20 stays
// as quiet as the natural 20 needs.

// How far each reason brings the background down, as a share of its usual level.
// Music and loops sit at 30%: the narrator takes them to 10%, a big moment to 6%.
export const VOICE_DUCK = 1 / 3
export const MOMENT_DUCK = 0.2
// How fast the background goes down, how long it waits after the narrator stops
// (so back-to-back lines don't make it pump up and down), and how fast it comes back.
export const DOWN_S = 0.25
export const VOICE_HOLD_S = 0.4
export const UP_S = 1.2

let mixer = null

function build(ctx) {
  const limiter = ctx.createDynamicsCompressor()
  // Fast enough to catch the first crack of a clang or a hit.
  limiter.attack.value = 0.001
  limiter.connect(ctx.destination)
  const layer = () => {
    const gain = ctx.createGain()
    gain.gain.value = 1
    gain.connect(limiter)
    return gain
  }
  return { ctx, layers: { sfx: layer(), voice: layer(), background: layer() }, holds: new Map(), timer: null }
}

function current(ctx) {
  if (mixer?.ctx !== ctx) mixer = build(ctx)
  return mixer
}

// The layer to plug a sound into: 'sfx', 'voice' or 'background'.
export function layer(ctx, name) {
  return current(ctx).layers[name]
}

// How loud the background should be at `now` (seconds), from the reasons to be quiet:
// a Map of reason -> { level, until }. A reason with no `until` lasts until released.
export function quietLevel(holds, now) {
  let level = 1
  for (const { level: l, until } of holds.values()) if (until == null || until > now) level = Math.min(level, l)
  return level
}

// The next time a reason runs out, so the background can come back up then.
function nextExpiry(holds, now) {
  const times = [...holds.values()].map((h) => h.until).filter((t) => t != null && t > now)
  return times.length ? Math.min(...times) : null
}

function apply(m) {
  const now = m.ctx.currentTime
  for (const [reason, hold] of m.holds) if (hold.until != null && hold.until <= now) m.holds.delete(reason)
  const target = quietLevel(m.holds, now)
  const gain = m.layers.background.gain
  const from = gain.value
  gain.cancelScheduledValues(now)
  gain.setValueAtTime(from, now)
  if (Math.abs(from - target) > 0.001) gain.linearRampToValueAtTime(target, now + (target < from ? DOWN_S : UP_S))
  clearTimeout(m.timer)
  const next = nextExpiry(m.holds, now)
  if (next != null) m.timer = setTimeout(() => apply(m), (next - now) * 1000 + 20)
}

// Brings the background down for `reason`, for `ms` or until released.
export function holdQuiet(ctx, reason, level, ms) {
  if (!ctx) return
  const m = current(ctx)
  m.holds.set(reason, { level, until: ms != null ? m.ctx.currentTime + ms / 1000 : null })
  apply(m)
}

// Lets the background come back up for `reason`, after `afterS` seconds.
export function releaseQuiet(ctx, reason, afterS = 0) {
  if (!ctx) return
  const m = current(ctx)
  const hold = m.holds.get(reason)
  if (!hold) return
  if (afterS > 0) m.holds.set(reason, { ...hold, until: m.ctx.currentTime + afterS })
  else m.holds.delete(reason)
  apply(m)
}
