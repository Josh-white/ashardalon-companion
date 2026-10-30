import { useEffect } from 'react'
import { activeVillains } from '../state/game.js'
import { dungeonArea } from '../state/area.js'
import { NOTE, burst, changeSounds, soundMs, pad, tone } from './sfx.js'
import { useGameStates } from '../state/useSharedGame.js'
import { audioContext } from './soundSetting.js'
import { MOMENT_DUCK, holdQuiet, layer } from './mixer.js'
import { playLoop, stopLoop } from './ambience.js'

// Background music, like an RPG's: calm and eerie while exploring, drums when
// monsters are about, darker still when a villain is on the board, and a slow lament
// after a loss. A mood with an ambient loop on the Pi (see ambience.js) plays that; the
// rest is made up as it plays from a few chords and scales, so it never loops the same
// way twice.

const VOLUME = 0.3
const FADE_S = 2.5
// How far ahead notes are booked, and how often the booking runs.
const LOOKAHEAD_S = 0.4
const TICK_MS = 100

// Chords as MIDI notes, each lasting `barsPerChord` bars of 8 eighth notes.
export const MOODS = {
  explore: {
    bpm: 66,
    barsPerChord: 2,
    chords: [[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 48, 52]],
    scale: [62, 64, 65, 67, 69, 70, 72, 74],
    melody: 0.22,
  },
  battle: {
    bpm: 124,
    barsPerChord: 1,
    chords: [[52, 55, 59], [48, 52, 55], [50, 54, 57], [47, 51, 54]],
    scale: [64, 66, 67, 69, 71, 72, 75, 76],
    melody: 0.3,
  },
  boss: {
    bpm: 92,
    barsPerChord: 2,
    chords: [[48, 51, 55], [49, 53, 56], [48, 51, 55], [47, 50, 53]],
    scale: [60, 61, 63, 65, 67, 68, 70, 72],
    melody: 0.18,
  },
  // After a loss: slow, soft and sad, under the recap.
  lament: {
    bpm: 50,
    barsPerChord: 2,
    chords: [[45, 48, 52], [41, 45, 48], [43, 46, 50], [40, 44, 47]],
    scale: [57, 59, 60, 62, 64, 65, 67, 69],
    melody: 0.14,
  },
}

// Which music fits the game right now, or null for none. Victory has a track on the Pi
// or nothing: there's no made-up music for it.
export function musicMood(state) {
  if (state?.status === 'lost') return 'lament'
  if (state?.status === 'won') return 'victory'
  if (state?.status !== 'playing') return null
  if (activeVillains(state).length > 0) return 'boss'
  if (state.monsters.length > 0) return 'battle'
  return 'explore'
}

// Explore music by dungeon area (src/state/area.js). The Start tile and the way out
// keep the plain explore track.
const AREA_MUSIC = {
  battlefield: 'halls',
  halls: 'halls',
  tunnels: 'tunnels',
  depths: 'depths',
  'dire-chamber': 'chamber',
  'horrid-chamber': 'chamber',
  chamber: 'chamber',
  vault: 'chamber',
}

// The Pi's tracks to try for `mood` (cards/sounds/<name>.mp3), most specific first.
export function musicTracks(state, mood) {
  if (!mood) return []
  const area = dungeonArea(state)?.key
  if (mood === 'explore' && AREA_MUSIC[area]) return [`loop-explore-${AREA_MUSIC[area]}`, 'loop-explore']
  if (mood === 'boss' && area === 'ashardalon') return ['loop-boss-ashardalon', 'loop-boss']
  return [`loop-${mood}`]
}

// One eighth note of a mood: what each part plays on it. Exported so a browser
// test can render it offline.
export function playStep(ctx, out, mood, step, at) {
  const m = MOODS[mood]
  const eighth = 30 / m.bpm
  const stepsPerChord = 8 * m.barsPerChord
  const chord = m.chords[Math.floor(step / stepsPerChord) % m.chords.length]
  const inBar = step % 8
  const root = chord[0]

  // A held chord under everything, swelling in at each change.
  if (step % stepsPerChord === 0) {
    const length = stepsPerChord * eighth
    for (const note of chord) pad(ctx, out, { at, freq: NOTE(note), length: length + 0.3, peak: 0.07, detune: (note % 4) * 3, tremolo: mood === 'boss' ? 5 : 0 })
  }

  if (mood === 'explore') {
    if (inBar === 0 || inBar === 4) tone(ctx, out, { at, freq: NOTE(root - 12), peak: 0.35, attack: 0.05, decay: eighth * 3.5 })
    if (inBar === 0) burst(ctx, out, { at, type: 'lowpass', freq: 200, peak: 0.25, decay: 0.4 })
  }

  if (mood === 'battle') {
    // A driving bass, and drums: kick on 1 and the "and" of 2, a snare on 2 and 4.
    tone(ctx, out, { at, freq: NOTE(root - 12 + (inBar === 7 ? 7 : 0)), type: 'sawtooth', peak: 0.16, decay: eighth * 0.8, filter: 500 })
    if ([0, 3, 4].includes(inBar)) tone(ctx, out, { at, freq: 110, slideTo: 45, peak: 0.6, decay: 0.18 })
    if (inBar === 2 || inBar === 6) burst(ctx, out, { at, freq: 1800, q: 0.7, peak: 0.25, decay: 0.12 })
    if (inBar % 2 === 1) burst(ctx, out, { at, type: 'highpass', freq: 7000, peak: 0.06, decay: 0.03 })
  }

  if (mood === 'lament') {
    // Just a low, slow bell at the start of each bar.
    if (inBar === 0) tone(ctx, out, { at, freq: NOTE(root - 12), peak: 0.25, attack: 0.08, decay: eighth * 6 })
  }

  if (mood === 'boss') {
    // Slow, heavy timpani and a low brass stab at each bar.
    if (inBar === 0) {
      tone(ctx, out, { at, freq: NOTE(root - 24), slideTo: NOTE(root - 25), peak: 0.7, decay: 1.2 })
      tone(ctx, out, { at, freq: NOTE(root - 12), type: 'sawtooth', peak: 0.12, attack: 0.03, decay: 0.6, filter: 800 })
    }
    if (inBar === 6 || inBar === 7) tone(ctx, out, { at, freq: NOTE(root - 24), peak: 0.35, decay: 0.3 })
    if (inBar === 4) burst(ctx, out, { at, type: 'lowpass', freq: 300, peak: 0.3, decay: 0.5 })
  }

  // A wandering tune on top, mostly on chord notes so it fits.
  if (Math.random() < m.melody) {
    const fits = m.scale.filter((n) => chord.some((c) => (n - c) % 12 === 0))
    const pool = Math.random() < 0.6 && fits.length ? fits : m.scale
    const note = pool[Math.floor(Math.random() * pool.length)]
    const soft = mood === 'explore' || mood === 'lament'
    tone(ctx, out, { at, freq: NOTE(note), type: soft ? 'sine' : 'triangle', peak: mood === 'battle' ? 0.12 : 0.16, attack: 0.01, decay: eighth * (soft ? 4 : 1.5) })
  }
}

// The music player: one per page. Each mood gets its own volume control so a
// change of mood can fade one out while the next fades in.
const player = {
  // The mood the game is in, and the one the made-up music is playing (null while a
  // loop plays instead).
  wanted: null,
  mood: null,
  step: 0,
  nextAt: 0,
  timer: null,
  volume: null,
  moodGain: null,

  // `music` is "<mood> <tracks to try...>", so a new area changes it too.
  setMood(music) {
    if (music === this.wanted) return
    this.wanted = music
    const ctx = audioContext()
    if (!ctx) return
    if (!music) {
      stopLoop(ctx)
      this.makeUp(null)
      return
    }
    const [mood, ...names] = music.split(' ')
    playLoop(ctx, names).then((looped) => {
      if (this.wanted === music) this.makeUp(looped || !MOODS[mood] ? null : mood)
    })
  },

  // Plays the made-up music for `mood`, or none.
  makeUp(mood) {
    if (mood === this.mood) return
    const ctx = audioContext()
    if (!ctx) return
    this.mood = mood
    if (this.moodGain) fadeOut(ctx, this.moodGain)
    this.moodGain = null
    if (!mood) {
      clearInterval(this.timer)
      this.timer = null
      return
    }
    if (!this.volume) {
      this.volume = ctx.createGain()
      this.volume.gain.value = VOLUME
      this.volume.connect(layer(ctx, 'background'))
    }
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(1, ctx.currentTime + FADE_S)
    gain.connect(this.volume)
    this.moodGain = gain
    this.step = 0
    this.nextAt = 0
    if (!this.timer) this.timer = setInterval(() => this.tick(), TICK_MS)
  },

  // Books every eighth note due in the next moment or so.
  tick() {
    const ctx = audioContext()
    if (!ctx || !this.mood || !this.moodGain) return
    // Paused until someone taps the page: start fresh when it's allowed.
    if (ctx.state !== 'running') {
      this.nextAt = 0
      return
    }
    if (this.nextAt < ctx.currentTime) this.nextAt = ctx.currentTime + 0.05
    const eighth = 30 / MOODS[this.mood].bpm
    while (this.nextAt < ctx.currentTime + LOOKAHEAD_S) {
      playStep(ctx, this.moodGain, this.mood, this.step, this.nextAt)
      this.step += 1
      this.nextAt += eighth
    }
  },
}

function fadeOut(ctx, gain) {
  const now = ctx.currentTime
  gain.gain.cancelScheduledValues(now)
  gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + FADE_S)
  setTimeout(() => gain.disconnect(), FADE_S * 1000 + 500)
}

// Plays the music that fits the game while `on`, and dips it under big moments.
export function useMusic(state, on) {
  const mood = on ? musicMood(state) : null
  const music = mood && [mood, ...musicTracks(state, mood)].join(' ')
  useEffect(() => {
    player.setMood(music)
  }, [music])
  useEffect(() => () => player.setMood(null), [])

  // Every state from the Pi, so two changes that land together both duck the music.
  useGameStates((before, after) => {
    if (!on) return
    const ms = Math.max(0, ...changeSounds(before, after).map(([sound, delay]) => delay + soundMs(sound)))
    if (ms > 0) holdQuiet(audioContext(), 'moment', MOMENT_DUCK, ms)
  })
}
