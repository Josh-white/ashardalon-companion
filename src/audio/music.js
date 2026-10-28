import { useEffect, useRef } from 'react'
import { activeVillains } from '../state/game.js'
import { NOTE, TILE_MUSIC_MS, burst, momentSoundMs, output, soundMs, pad, tileRevealed, tone } from './sfx.js'
import { audioContext } from './soundSetting.js'

// Background music, like an RPG's: calm and eerie while exploring, drums when
// monsters are about, darker still when a villain is on the board. It's made up as
// it plays from a few chords and scales, so it never loops the same way twice.

const VOLUME = 0.3
// Quieter while a big moment's sound effects or a new tile's music play.
const DUCKED = 0.06
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
}

// Which music fits the game right now, or null for none.
export function musicMood(state) {
  if (state?.status !== 'playing') return null
  if (activeVillains(state).length > 0) return 'boss'
  if (state.monsters.length > 0) return 'battle'
  return 'explore'
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
    const type = mood === 'explore' ? 'sine' : 'triangle'
    tone(ctx, out, { at, freq: NOTE(note), type, peak: mood === 'battle' ? 0.12 : 0.16, attack: 0.01, decay: eighth * (mood === 'explore' ? 4 : 1.5) })
  }
}

// The music player: one per page. Each mood gets its own volume control so a
// change of mood can fade one out while the next fades in.
const player = {
  mood: null,
  step: 0,
  nextAt: 0,
  timer: null,
  volume: null,
  moodGain: null,

  setMood(mood) {
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
      this.volume.connect(output(ctx))
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

  // Dips the music under a sound effect or the tile music, then brings it back.
  duck(ms) {
    const ctx = audioContext()
    if (!ctx || !this.volume || ms <= 0) return
    const g = this.volume.gain
    const now = ctx.currentTime
    g.cancelScheduledValues(now)
    g.setValueAtTime(g.value, now)
    g.linearRampToValueAtTime(DUCKED, now + 0.15)
    g.setValueAtTime(DUCKED, now + ms / 1000)
    g.linearRampToValueAtTime(VOLUME, now + ms / 1000 + 1.5)
  },
}

function fadeOut(ctx, gain) {
  const now = ctx.currentTime
  gain.gain.cancelScheduledValues(now)
  gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + FADE_S)
  setTimeout(() => gain.disconnect(), FADE_S * 1000 + 500)
}

// Plays the music that fits the game while `on`, and ducks it under big moments.
export function useMusic(state, on) {
  const mood = on ? musicMood(state) : null
  useEffect(() => {
    player.setMood(mood)
  }, [mood])
  useEffect(() => () => player.setMood(null), [])

  const moment = state?.moment
  useEffect(() => {
    if (on && moment && Date.now() - moment.at < 3000) player.duck(momentSoundMs(moment))
  }, [moment?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const board = state?.soundboard?.last
  useEffect(() => {
    if (on && board && Date.now() - board.at < 3000) player.duck(soundMs(board.sound))
  }, [board?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const last = useRef(null)
  useEffect(() => {
    const before = last.current
    last.current = state
    if (on && tileRevealed(before, state)) player.duck(TILE_MUSIC_MS)
  }, [state, on])
}
