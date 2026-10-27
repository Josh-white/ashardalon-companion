import { useEffect } from 'react'
import { audioContext } from './soundSetting.js'

// The 3D die lands this long after a roll's moment starts (ROLL_MS in Die3D.jsx).
export const DIE_LANDS_MS = 900
// A device that reconnects shouldn't replay the sound of a moment that's over.
const STALE_MS = 3000

// How long each sound lasts, so the narrator knows when it can talk.
const LENGTH_MS = {
  dice: 850,
  land: 250,
  clang: 900,
  whoosh: 450,
  thud: 600,
  growl: 800,
  roar: 1500,
  fanfare: 1700,
  trombone: 2300,
  victory: 1000,
  levelup: 1300,
  coins: 1000,
  card: 1400,
  poison: 1000,
  down: 1900,
  chime: 900,
}

// What a moment sounds like, as [sound, delay in ms] pairs. Rolls clatter straight
// away and play their result when the die lands.
export function momentSounds(moment) {
  if (!moment) return []
  const rolls = moment.rolls ?? (moment.value != null ? [{ value: moment.value }] : [])
  const values = rolls.map((r) => r.value)

  // Monster, trap and encounter attacks roll against heroes; a hero's attack rolls
  // against labeled monsters.
  if (rolls.some((r) => r.heroId && !r.label)) {
    const hit = rolls.some((r) => r.hit)
    const sounds = [['growl', 0], ['dice', 150], [hit ? 'thud' : 'whoosh', DIE_LANDS_MS]]
    if (moment.kind === 'monster-down') sounds.push(['down', DIE_LANDS_MS + 500])
    return sounds
  }

  if (rolls.length > 0) {
    const anyHit = rolls.some((r) => r.hit)
    const attack = rolls.some((r) => r.hit != null)
    let result = 'land'
    if (values.includes(20)) result = 'fanfare'
    else if (attack && anyHit) result = 'clang'
    else if (values.includes(1)) result = 'trombone'
    else if (attack) result = 'whoosh'
    const sounds = [['dice', 0], [result, DIE_LANDS_MS]]
    // A defeated monster (or an unlocked door) gets a little victory tune after the hit.
    if (moment.kind === 'defeat') sounds.push(['victory', DIE_LANDS_MS + (result === 'land' ? 200 : 600)])
    return sounds
  }

  const sound = {
    spawn: 'roar',
    monster: 'roar',
    'monster-down': 'down',
    down: 'down',
    defeat: 'victory',
    level: 'levelup',
    treasure: 'coins',
    encounter: 'card',
    poison: 'poison',
    fumble: 'thud',
    crit: 'fanfare',
    roll: 'chime',
  }[moment.kind]
  return sound ? [[sound, 0]] : []
}

// When this moment's sounds are over, in ms from the moment starting.
export function momentSoundMs(moment) {
  return Math.max(0, ...momentSounds(moment).map(([sound, delay]) => delay + LENGTH_MS[sound]))
}

// Plays each big moment's sounds on this device while sound is on.
export function useSoundEffects(moment, on) {
  useEffect(() => {
    if (!on || !moment || Date.now() - moment.at > STALE_MS) return
    const ctx = audioContext()
    if (!ctx || ctx.state !== 'running') return
    const start = ctx.currentTime + 0.02
    for (const [sound, delay] of momentSounds(moment)) SOUNDS[sound](ctx, start + delay / 1000, output(ctx))
  }, [moment?.id]) // eslint-disable-line react-hooks/exhaustive-deps
}

// Every sound goes through one gentle compressor so a fanfare on top of a clang
// doesn't clip.
let master = null
function output(ctx) {
  if (master?.context === ctx) return master
  const volume = ctx.createGain()
  volume.gain.value = 1
  const limiter = ctx.createDynamicsCompressor()
  volume.connect(limiter).connect(ctx.destination)
  master = volume
  return master
}

// --- Building blocks. Everything is made here from oscillators and noise, so there
// are no sound files to license or download.

let noiseBuffer = null
function noise(ctx) {
  if (noiseBuffer?.sampleRate !== ctx.sampleRate) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  const source = ctx.createBufferSource()
  source.buffer = noiseBuffer
  source.loop = true
  return source
}

// A gain that jumps to peak and dies away: the shape of a hit or a pluck.
function envelope(ctx, at, peak, attack, decay) {
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(peak, at + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay)
  return gain
}

function tone(ctx, out, { at, freq, type = 'sine', peak = 0.3, attack = 0.005, decay = 0.4, slideTo, filter }) {
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freq, at)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, at + attack + decay)
  const gain = envelope(ctx, at, peak, attack, decay)
  let node = osc
  if (filter) {
    const lowpass = ctx.createBiquadFilter()
    lowpass.type = 'lowpass'
    lowpass.frequency.value = filter
    node = node.connect(lowpass)
  }
  node.connect(gain).connect(out)
  osc.start(at)
  osc.stop(at + attack + decay + 0.05)
  return osc
}

function burst(ctx, out, { at, type = 'bandpass', freq = 2000, q = 1, peak = 0.3, attack = 0.002, decay = 0.1, sweepTo }) {
  const source = noise(ctx)
  const filter = ctx.createBiquadFilter()
  filter.type = type
  filter.frequency.setValueAtTime(freq, at)
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, at + attack + decay)
  filter.Q.value = q
  source.connect(filter).connect(envelope(ctx, at, peak, attack, decay)).connect(out)
  source.start(at, Math.random() * 0.5)
  source.stop(at + attack + decay + 0.05)
}

// A brassy note: a sawtooth whose filter opens as it's blown, for horns and trombones.
function brass(ctx, out, { at, freq, length, peak = 0.18, wobble = 0, slideTo }) {
  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(freq, at)
  if (slideTo) osc.frequency.linearRampToValueAtTime(slideTo, at + length)
  if (wobble) {
    const lfo = ctx.createOscillator()
    const depth = ctx.createGain()
    lfo.frequency.value = 5.5
    depth.gain.value = wobble
    lfo.connect(depth).connect(osc.frequency)
    lfo.start(at)
    lfo.stop(at + length + 0.1)
  }
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = 2
  filter.frequency.setValueAtTime(freq * 1.5, at)
  filter.frequency.linearRampToValueAtTime(freq * 6, at + 0.06)
  filter.frequency.linearRampToValueAtTime(freq * 3, at + length)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.linearRampToValueAtTime(peak, at + 0.04)
  gain.gain.setValueAtTime(peak * 0.85, at + Math.max(0.05, length - 0.08))
  gain.gain.linearRampToValueAtTime(0.0001, at + length)
  osc.connect(filter).connect(gain).connect(out)
  osc.start(at)
  osc.stop(at + length + 0.05)
}

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12) // MIDI note number to Hz

// --- The sounds themselves. Each takes (ctx, start time, output). Exported so a
// browser test can render them offline.

export const SOUNDS = {
  // The d20 rattling across the table: clicks that slow down and get quieter.
  dice(ctx, at, out) {
    let t = at
    for (let i = 0; i < 9; i++) {
      burst(ctx, out, { at: t, freq: 2500 + Math.random() * 2500, q: 4, peak: 0.8 * (1 - i / 11), decay: 0.03 })
      t += 0.04 + i * 0.012 + Math.random() * 0.03
    }
  },

  // The die settling on its number.
  land(ctx, at, out) {
    tone(ctx, out, { at, freq: 220, slideTo: 140, peak: 0.8, decay: 0.15 })
    burst(ctx, out, { at, freq: 3000, q: 3, peak: 0.6, decay: 0.03 })
  },

  // Steel on armor: a bright crack, then metal ringing at clashing pitches.
  clang(ctx, at, out) {
    burst(ctx, out, { at, type: 'highpass', freq: 3000, peak: 0.6, decay: 0.06 })
    for (const [freq, decay] of [[523, 0.8], [1375, 0.6], [2213, 0.45], [3170, 0.3], [4430, 0.2]]) {
      tone(ctx, out, { at, freq, peak: 0.16, decay })
    }
    tone(ctx, out, { at, freq: 120, slideTo: 60, peak: 0.5, decay: 0.15 })
  },

  // A swing that cuts through air and nothing else.
  whoosh(ctx, at, out) {
    burst(ctx, out, { at, freq: 400, q: 2, peak: 1.2, attack: 0.15, decay: 0.25, sweepTo: 2500 })
  },

  // A heavy blow landing on a hero.
  thud(ctx, at, out) {
    tone(ctx, out, { at, freq: 110, slideTo: 40, peak: 0.9, decay: 0.45 })
    burst(ctx, out, { at, type: 'lowpass', freq: 900, peak: 0.8, decay: 0.2 })
  },

  // A monster about to strike.
  growl(ctx, at, out) {
    snarl(ctx, out, at, 0.75, 70)
  },

  // A monster arriving.
  roar(ctx, at, out) {
    snarl(ctx, out, at, 1.4, 85)
  },

  // Natural 20: ta-ta-ta-TAAA, with a chord under the last note.
  fanfare(ctx, at, out) {
    const steps = [[67, 0, 0.12], [72, 0.14, 0.12], [76, 0.28, 0.12], [79, 0.42, 1.2]]
    for (const [note, when, length] of steps) brass(ctx, out, { at: at + when, freq: NOTE(note), length, wobble: length > 1 ? 4 : 0 })
    for (const note of [60, 64]) brass(ctx, out, { at: at + 0.42, freq: NOTE(note), length: 1.2, peak: 0.1 })
    tone(ctx, out, { at: at + 0.42, freq: NOTE(91), peak: 0.06, decay: 1.1 })
  },

  // Natural 1: wah, wah, wah, waaaah.
  trombone(ctx, at, out) {
    const steps = [[58, 0, 0.4], [57, 0.45, 0.4], [56, 0.9, 0.4], [55, 1.35, 0.9]]
    for (const [note, when, length] of steps) {
      const last = length > 0.5
      brass(ctx, out, { at: at + when, freq: NOTE(note), length, peak: 0.22, wobble: last ? 6 : 0, slideTo: last ? NOTE(note - 1) : undefined })
    }
  },

  // A monster beaten: a quick bright arpeggio.
  victory(ctx, at, out) {
    ;[72, 76, 79, 84].forEach((note, i) => {
      tone(ctx, out, { at: at + i * 0.08, freq: NOTE(note), type: 'square', peak: 0.2, decay: i === 3 ? 0.6 : 0.15, filter: 3000 })
    })
  },

  // Leveling up: a two-octave climb with a sparkle on top.
  levelup(ctx, at, out) {
    const notes = [60, 64, 67, 72, 76, 79, 84]
    notes.forEach((note, i) => {
      tone(ctx, out, { at: at + i * 0.07, freq: NOTE(note), type: 'square', peak: 0.18, decay: i === notes.length - 1 ? 0.7 : 0.12, filter: 4000 })
    })
    for (let i = 0; i < 5; i++) tone(ctx, out, { at: at + 0.5 + i * 0.09, freq: NOTE(96 + (i % 2) * 3), peak: 0.12, decay: 0.2 })
  },

  // Treasure: coins clinking.
  coins(ctx, at, out) {
    for (let i = 0; i < 6; i++) {
      const t = at + i * 0.09 + Math.random() * 0.05
      tone(ctx, out, { at: t, freq: NOTE(95), type: 'triangle', peak: 0.2, decay: 0.08 })
      tone(ctx, out, { at: t + 0.06, freq: NOTE(100), type: 'triangle', peak: 0.2, decay: 0.3 })
    }
  },

  // An encounter card: a card flip and a spooky chord.
  card(ctx, at, out) {
    burst(ctx, out, { at, freq: 1500, q: 0.7, peak: 0.3, decay: 0.12, sweepTo: 4000 })
    for (const note of [57, 60, 63, 66]) tone(ctx, out, { at: at + 0.1, freq: NOTE(note), type: 'triangle', peak: 0.07, attack: 0.3, decay: 1 })
  },

  // Poison: little bubbles.
  poison(ctx, at, out) {
    for (let i = 0; i < 8; i++) {
      const freq = 250 + Math.random() * 400
      tone(ctx, out, { at: at + i * 0.1 + Math.random() * 0.05, freq, slideTo: freq * 2.5, peak: 0.2, decay: 0.07 })
    }
  },

  // A hero down: a deep boom and a sad falling tune.
  down(ctx, at, out) {
    tone(ctx, out, { at, freq: 80, slideTo: 35, peak: 0.7, decay: 1.2 })
    ;[64, 60, 57].forEach((note, i) => {
      tone(ctx, out, { at: at + 0.15 + i * 0.35, freq: NOTE(note), type: 'triangle', peak: 0.18, attack: 0.02, decay: i === 2 ? 0.9 : 0.3 })
    })
  },

  // Anything else worth a little ding.
  chime(ctx, at, out) {
    tone(ctx, out, { at, freq: NOTE(81), peak: 0.3, decay: 0.5 })
    tone(ctx, out, { at: at + 0.12, freq: NOTE(88), peak: 0.25, decay: 0.7 })
  },
}

// A growl: a low buzzy voice with a ragged wobble, pushed through distortion.
function snarl(ctx, out, at, length, freq) {
  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(freq, at)
  osc.frequency.linearRampToValueAtTime(freq * 1.4, at + length * 0.3)
  osc.frequency.linearRampToValueAtTime(freq * 0.8, at + length)
  const lfo = ctx.createOscillator()
  const depth = ctx.createGain()
  lfo.type = 'square'
  lfo.frequency.value = 23
  depth.gain.value = freq * 0.3
  lfo.connect(depth).connect(osc.frequency)

  const shaper = ctx.createWaveShaper()
  const curve = new Float32Array(256)
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(((i / 255) * 2 - 1) * 4)
  shaper.curve = curve
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 900
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.linearRampToValueAtTime(0.25, at + length * 0.2)
  gain.gain.linearRampToValueAtTime(0.18, at + length * 0.7)
  gain.gain.linearRampToValueAtTime(0.0001, at + length)
  osc.connect(shaper).connect(filter).connect(gain).connect(out)
  burst(ctx, out, { at, type: 'lowpass', freq: 700, peak: 0.25, attack: length * 0.2, decay: length * 0.8 })
  for (const node of [osc, lfo]) {
    node.start(at)
    node.stop(at + length + 0.05)
  }
}
