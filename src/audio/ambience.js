import { TAP_EVENTS } from './soundSetting.js'
import { layer } from './mixer.js'
import { soundList } from './samples.js'

// Background music tracks, one for each mood of the made-up music: JJ's Tabletop Audio
// tracks, saved on the Pi as cards/sounds/loop-explore.mp3, loop-battle.mp3 and
// loop-boss.mp3 (kept out of git like the other recordings). Where a mood has a track,
// it plays in place of the made-up music.
//
// The tracks are ten minutes long, far too big to decode whole (about 200 MB each), so
// each streams from an <audio> element routed into the mixer's background layer, where
// it dips under the narrator like the made-up music.

// Tracks sit at about the same level as the made-up music.
const VOLUME = 0.3
// A change of mood fades one track out while the next fades in.
export const CROSSFADE_S = 1.5

export const loopFor = (mood) => `loop-${mood}`

const tracks = new Map() // mood -> { audio, gain }
let playing = null // mood
// The mood asked for last, so a track that finishes loading after the mood moved on stays quiet.
let wanted = null

function fadeTo(ctx, gain, value, seconds) {
  const now = ctx.currentTime
  gain.gain.cancelScheduledValues(now)
  gain.gain.setValueAtTime(gain.gain.value, now)
  gain.gain.linearRampToValueAtTime(value, now + seconds)
}

// The track for `mood`, set up the first time it's asked for, or null if the Pi has none.
async function trackFor(ctx, mood) {
  if (tracks.has(mood)) return tracks.get(mood)
  const entry = (await soundList())[loopFor(mood)]
  if (!entry || typeof Audio !== 'function') return null
  if (tracks.has(mood)) return tracks.get(mood)
  const audio = new Audio(`/sounds/${entry.file}?v=${entry.v}`)
  audio.loop = true
  audio.preload = 'auto'
  const gain = ctx.createGain()
  gain.gain.value = 0
  gain.connect(layer(ctx, 'background'))
  ctx.createMediaElementSource(audio).connect(gain)
  // Start somewhere in the track, so the same few minutes don't open every game. After
  // that a mood picks up where it left off.
  audio.addEventListener('loadedmetadata', () => {
    if (Number.isFinite(audio.duration)) audio.currentTime = Math.random() * audio.duration * 0.8
  }, { once: true })
  const track = { audio, gain }
  tracks.set(mood, track)
  return track
}

// Fades out whatever track is playing.
export function stopLoop(ctx) {
  wanted = null
  if (!playing || !ctx) return
  const mood = playing
  const { audio, gain } = tracks.get(mood)
  playing = null
  fadeTo(ctx, gain, 0, CROSSFADE_S)
  // Paused once it's silent, unless it was asked for again meanwhile.
  setTimeout(() => playing !== mood && audio.pause(), CROSSFADE_S * 1000 + 200)
}

// Crossfades to `mood`'s track. Resolves true if the mood has one (so the made-up music
// should stay quiet), false if not.
export async function playLoop(ctx, mood) {
  if (!ctx) return false
  wanted = mood
  if (playing === mood) return true
  const track = await trackFor(ctx, mood)
  if (wanted !== mood) return false
  // No track for this mood: the made-up music takes over, so the last track fades out.
  if (!track) {
    stopLoop(ctx)
    return false
  }
  if (playing === mood) return true
  stopLoop(ctx)
  wanted = mood
  playing = mood
  track.audio.play().catch(() => {
    // Not allowed until a tap (iPads); the next tap starts it.
    whenTapped(() => playing === mood && track.audio.play().catch(() => {}))
  })
  fadeTo(ctx, track.gain, VOLUME, CROSSFADE_S)
  return true
}

function whenTapped(then) {
  const once = () => {
    for (const type of TAP_EVENTS) window.removeEventListener(type, once)
    then()
  }
  for (const type of TAP_EVENTS) window.addEventListener(type, once)
}
