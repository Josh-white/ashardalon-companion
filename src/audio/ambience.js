import { TAP_EVENTS } from './soundSetting.js'
import { layer } from './mixer.js'
import { soundList } from './samples.js'

// Background music tracks: JJ's Tabletop Audio tracks, saved on the Pi as
// cards/sounds/loop-<name>.mp3 (kept out of git like the other recordings). music.js
// picks which to try, most specific first (loop-explore-tunnels, then loop-explore);
// where one is there, it plays in place of the made-up music.
//
// The tracks are ten minutes long, far too big to decode whole (about 200 MB each), so
// each streams from an <audio> element routed into the mixer's background layer, where
// it dips under the narrator like the made-up music.

// Tracks sit at about the same level as the made-up music.
const VOLUME = 0.3
// No track may overpower the game: each one is brought into this loudness band
// (integrated LUFS, measured on the Pi by scripts/measure-music.sh). JJ found Light the
// Beacons (-15 LUFS, all drums) too loud next to Dungeon I (-27), so loud tracks come
// down to LOUDEST and very quiet ones up to QUIETEST.
export const LOUDEST = -20
export const QUIETEST = -26
// A track the Pi hasn't measured yet plays at this, to be safe.
export const UNMEASURED = 0.5

// How much to turn a track up or down, from how loud it is.
export function trackLevel(lufs) {
  if (!Number.isFinite(lufs)) return UNMEASURED
  const target = Math.min(LOUDEST, Math.max(QUIETEST, lufs))
  return Math.pow(10, (target - lufs) / 20)
}
// A change of mood fades one track out while the next fades in.
export const CROSSFADE_S = 1.5

const tracks = new Map() // track name -> { audio, gain, level }
let playing = null // track name
// The tracks asked for last, so a track that finishes loading after the music moved on stays quiet.
let wanted = null

function fadeTo(ctx, gain, value, seconds) {
  const now = ctx.currentTime
  gain.gain.cancelScheduledValues(now)
  gain.gain.setValueAtTime(gain.gain.value, now)
  gain.gain.linearRampToValueAtTime(value, now + seconds)
}

// The first of `names` the Pi has, set up the first time it's asked for, or null if
// it has none of them.
async function trackFor(ctx, names) {
  const list = await soundList()
  const name = names.find((n) => list[n])
  if (!name || typeof Audio !== 'function') return null
  if (tracks.has(name)) return { name, ...tracks.get(name) }
  const entry = list[name]
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
  const track = { audio, gain, level: trackLevel(entry.lufs) }
  tracks.set(name, track)
  return { name, ...track }
}

// Fades out whatever track is playing.
export function stopLoop(ctx) {
  wanted = null
  if (!playing || !ctx) return
  const name = playing
  const { audio, gain } = tracks.get(name)
  playing = null
  fadeTo(ctx, gain, 0, CROSSFADE_S)
  // Paused once it's silent, unless it was asked for again meanwhile.
  setTimeout(() => playing !== name && audio.pause(), CROSSFADE_S * 1000 + 200)
}

// Crossfades to the first of the track `names` the Pi has. Resolves true if it has
// one (so the made-up music should stay quiet), false if not.
export async function playLoop(ctx, names) {
  if (!ctx) return false
  const key = names.join(' ')
  wanted = key
  const track = await trackFor(ctx, names)
  if (wanted !== key) return false
  // No track for this mood: the made-up music takes over, so the last track fades out.
  if (!track) {
    stopLoop(ctx)
    return false
  }
  if (playing === track.name) return true
  stopLoop(ctx)
  wanted = key
  playing = track.name
  track.audio.play().catch(() => {
    // Not allowed until a tap (iPads); the next tap starts it.
    whenTapped(() => playing === track.name && track.audio.play().catch(() => {}))
  })
  fadeTo(ctx, track.gain, VOLUME * track.level, CROSSFADE_S)
  return true
}

function whenTapped(then) {
  const once = () => {
    for (const type of TAP_EVENTS) window.removeEventListener(type, once)
    then()
  }
  for (const type of TAP_EVENTS) window.addEventListener(type, once)
}
