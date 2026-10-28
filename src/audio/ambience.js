import { layer } from './mixer.js'
import { loadLoop } from './samples.js'

// Ambient loops: recordings of a dripping cave, war drums and so on, one for each
// mood of the music (cards/sounds/loop-explore.mp3, loop-battle.mp3, loop-boss.mp3,
// only on the Pi). Where a mood has a loop it plays in place of the made-up music.

// Loops sit at about the same level as the made-up music.
const VOLUME = 0.3
// A change of mood fades one loop out while the next fades in.
export const CROSSFADE_S = 1.5

export const loopFor = (mood) => `loop-${mood}`

let playing = null // { mood, source, gain }
// The mood asked for last, so a loop that finishes loading after the mood moved on stays quiet.
let wanted = null

function fadeTo(ctx, gain, value, seconds) {
  const now = ctx.currentTime
  gain.gain.cancelScheduledValues(now)
  gain.gain.setValueAtTime(gain.gain.value, now)
  gain.gain.linearRampToValueAtTime(value, now + seconds)
}

// Fades out whatever loop is playing.
export function stopLoop(ctx) {
  wanted = null
  if (!playing || !ctx) return
  const { source, gain } = playing
  playing = null
  fadeTo(ctx, gain, 0, CROSSFADE_S)
  setTimeout(() => {
    try {
      source.stop()
    } catch {
      // Already stopped.
    }
    gain.disconnect()
  }, CROSSFADE_S * 1000 + 200)
}

// Crossfades to `mood`'s loop. Resolves true if the mood has a loop (so the made-up
// music should stay quiet), false if not.
export async function playLoop(ctx, mood) {
  if (!ctx) return false
  wanted = mood
  if (playing?.mood === mood) return true
  const loop = await loadLoop(ctx, loopFor(mood))
  if (wanted !== mood) return false
  // No loop for this mood: the made-up music takes over, so the last loop fades out.
  if (!loop) {
    stopLoop(ctx)
    return false
  }
  if (playing?.mood === mood) return true
  stopLoop(ctx)
  wanted = mood
  const gain = ctx.createGain()
  gain.gain.value = 0
  gain.connect(layer(ctx, 'background'))
  const level = ctx.createGain()
  level.gain.value = loop.gain
  level.connect(gain)
  const source = ctx.createBufferSource()
  source.buffer = loop.buffer
  source.loop = true
  source.connect(level)
  // Start somewhere in the middle, so the same few seconds don't open every game.
  source.start(ctx.currentTime, Math.random() * loop.buffer.duration)
  fadeTo(ctx, gain, VOLUME, CROSSFADE_S)
  playing = { mood, source, gain }
  return true
}
