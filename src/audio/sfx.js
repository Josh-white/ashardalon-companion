import { useEffect, useRef } from 'react'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { audioContext } from './soundSetting.js'

// The 3D die lands this long after a roll's moment starts (ROLL_MS in Die3D.jsx).
export const DIE_LANDS_MS = 900
// After the die lands, sounds take turns: the next starts this long after the last
// began, or sooner if the last one is shorter.
const STEP_MS = 650
// A device that reconnects shouldn't replay the sound of a moment that's over.
const STALE_MS = 3000

// How long each sound lasts, so the narrator knows when it can talk.
const LENGTH_MS = {
  dice: 800,
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
  tile: 4300,
  fire: 900,
  frost: 900,
  zap: 800,
  boom: 900,
  arcane: 800,
  holy: 1000,
  psychic: 1000,
  arrow: 600,
  fizzle: 600,
  hurt: 450,
  'hurt-big': 600,
  'hurt-small': 350,
  'hurt-snake': 450,
  bear: 2000,
  hiss: 1500,
  bow: 900,
  smasher: 1100,
  chant: 2000,
  duergar: 1200,
  devil: 1700,
  gibber: 1600,
  grell: 1300,
  kobold: 900,
  dragonlord: 1500,
  warhorn: 1700,
  thunder: 1800,
  otyugh: 1600,
  drake: 1300,
  dragon: 2800,
  gauth: 1900,
  drumroll: 2900,
  applause: 2200,
}

// How long a sound lasts, in ms.
export const soundMs = (sound) => LENGTH_MS[sound] ?? 0

// How long a new tile's music lasts, so background music can make room for it.
export const TILE_MUSIC_MS = LENGTH_MS.tile

// Each monster's own sound when it's drawn, matched by name in the moment's title.
// Anything not listed (a chamber, a monster from a newer card file) gets the plain roar.
const MONSTER_VOICES = {
  'cave bear': 'bear',
  snake: 'hiss',
  'orc archer': 'bow',
  'orc smasher': 'smasher',
  'human cultist': 'chant',
  'duergar guard': 'duergar',
  'legion devil': 'devil',
  'gibbering mouther': 'gibber',
  grell: 'grell',
  'kobold dragonshield': 'kobold',
  'kobold dragonlord': 'dragonlord',
  'duergar captain': 'warhorn',
  'orc storm shaman': 'thunder',
  otyugh: 'otyugh',
  'rage drake': 'drake',
  ashardalon: 'dragon',
  gauth: 'gauth',
}

// The sound a power makes as it's cast, from words in its name, or failing that from
// the hero who used it (Heskan's powers are magic, Quinn's are holy). Null for a plain
// weapon swing, which keeps the sword clang.
const SPELL_WORDS = [
  ['fire', /flam|fire|burn|scorch|breath|blaze/],
  ['frost', /frost|ice\b|icy|cold|freez/],
  ['zap', /lightning|shock|spark/],
  ['boom', /thunder/],
  ['psychic', /fear|hypno|daze|dread|mind/],
  ['holy', /holy|sacred|smite|divine|radiant|righteous|hymn|blade barrier|bless/],
  ['arcane', /missile|spectral|arcane|magic|force|ray\b/],
  ['arrow', /shot|arrow|bow\b|sling/],
]
const HERO_SPELLS = { wizard: 'arcane', cleric: 'holy' }

export function spellKind(title = '') {
  // A hero attack's title is "Hero: Power name!".
  const [heroName, power = ''] = title.split(': ')
  const lower = power.toLowerCase()
  const match = SPELL_WORDS.find(([, words]) => words.test(lower))
  if (match) return match[0]
  const hero = HERO_TEMPLATES.find((h) => h.name === heroName)
  return HERO_SPELLS[hero?.key] ?? null
}

// How a monster yelps when it's hit: big ones grunt low, small ones squeak, snakes hiss.
const HURT_SIZES = {
  bear: 'hurt-big', smasher: 'hurt-big', otyugh: 'hurt-big', dragon: 'hurt-big', devil: 'hurt-big', warhorn: 'hurt-big',
  kobold: 'hurt-small', dragonlord: 'hurt-small', gibber: 'hurt-small', grell: 'hurt-small',
  hiss: 'hurt-snake',
}
export const hurtSound = (name) => HURT_SIZES[monsterVoice(name)] ?? 'hurt'

export function monsterVoice(title = '') {
  const lower = title.toLowerCase()
  const name = Object.keys(MONSTER_VOICES).find((n) => lower.includes(n))
  return name ? MONSTER_VOICES[name] : 'roar'
}

// What a moment sounds like, as [sound, delay in ms] pairs. Rolls clatter straight
// away and play their result when the die lands.
export function momentSounds(moment) {
  if (!moment) return []
  const rolls = moment.rolls ?? (moment.value != null ? [{ value: moment.value }] : [])
  const values = rolls.map((r) => r.value)

  // The die rolls on its own; everything else waits until it lands, then plays one
  // sound after another (each starts once the last one's main hit is over).
  const sounds = [['dice', 0]]
  let next = DIE_LANDS_MS
  const then = (sound) => {
    sounds.push([sound, next])
    next += Math.min(LENGTH_MS[sound], STEP_MS)
  }

  // Monster, trap and encounter attacks roll against heroes; a hero's attack rolls
  // against labeled monsters.
  if (rolls.some((r) => r.heroId && !r.label)) {
    then(rolls.some((r) => r.hit) ? 'thud' : 'whoosh')
    if (moment.kind === 'monster-down') then('down')
    return sounds
  }

  if (rolls.length > 0) {
    const anyHit = rolls.some((r) => r.hit)
    const attack = rolls.some((r) => r.hit != null)
    const spell = attack ? spellKind(moment.title) : null
    if (values.includes(20)) then('fanfare')
    // A power cast at a monster makes its own sound once the die has landed.
    if (spell) then(spell)
    if (!values.includes(20)) {
      if (attack && anyHit) {
        if (!spell) then('clang')
      } else if (values.includes(1)) then('trombone')
      else if (attack) then(spell ? 'fizzle' : 'whoosh')
      else then('land')
    }
    // Each monster that was hit (up to two) yelps.
    for (const row of rolls.filter((r) => r.hit && r.label).slice(0, 2)) then(hurtSound(row.label))
    // A defeated monster (or an unlocked door) gets a little victory tune at the end.
    if (moment.kind === 'defeat') then('victory')
    return sounds
  }

  if (moment.kind === 'spawn') return [[monsterVoice(moment.title), 0]]

  const sound = {
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

// Whether a dungeon tile was just turned over: exploring, or the tile tracker drawing
// one. Each turn's draws are kept in turn.tiles by key; 'none' means the stack was empty.
export function tileRevealed(before, after) {
  if (!before || !after || before.status !== 'playing' || after.status !== 'playing') return false
  if (!before.turn.explored && after.turn.explored) return true
  const old = before.turn.tiles ?? {}
  return Object.entries(after.turn.tiles ?? {}).some(([key, tile]) => tile !== 'none' && old[key] === undefined)
}

function play(sounds) {
  const ctx = audioContext()
  if (!ctx || ctx.state !== 'running') return
  const start = ctx.currentTime + 0.02
  for (const [sound, delay] of sounds) SOUNDS[sound](ctx, start + delay / 1000, output(ctx))
}

// Plays each big moment's sounds, and music when a new tile is revealed, on this
// device while sound is on.
export function useSoundEffects(state, on) {
  const moment = state?.moment
  useEffect(() => {
    if (!on || !moment || Date.now() - moment.at > STALE_MS) return
    play(momentSounds(moment))
  }, [moment?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // The first state a device sees is catching up, not news, so it's only remembered.
  const last = useRef(null)
  useEffect(() => {
    const before = last.current
    last.current = state
    if (on && tileRevealed(before, state)) play([['tile', 0]])
  }, [state, on])
}

// Plays a sound someone tapped on the sound board (state.soundboard.last).
export function useBoardSounds(state, on) {
  const last = state?.soundboard?.last
  useEffect(() => {
    if (!on || !last || Date.now() - last.at > STALE_MS || !SOUNDS[last.sound]) return
    play([[last.sound, 0]])
  }, [last?.id]) // eslint-disable-line react-hooks/exhaustive-deps
}

// Every sound goes through one gentle compressor so a fanfare on top of a clang
// doesn't clip.
let master = null
export function output(ctx) {
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

export function tone(ctx, out, { at, freq, type = 'sine', peak = 0.3, attack = 0.005, decay = 0.4, slideTo, filter }) {
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

export function burst(ctx, out, { at, type = 'bandpass', freq = 2000, q = 1, peak = 0.3, attack = 0.002, decay = 0.1, sweepTo }) {
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

export const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12) // MIDI note number to Hz

// --- The sounds themselves. Each takes (ctx, start time, output). Exported so a
// browser test can render them offline.

export const SOUNDS = {
  // The d20 rattling across the table: clicks that slow down and get quieter.
  dice(ctx, at, out) {
    // One die: a few bounces, each closer together and softer, then a little wobble
    // as it settles. The same pitch throughout, because it's the same die.
    const pitch = 0.9 + Math.random() * 0.2
    const bounces = [0, 0.2, 0.36, 0.48, 0.57, 0.63]
    bounces.forEach((when, i) => {
      const t = at + when
      const loud = 0.9 * Math.pow(0.72, i)
      tone(ctx, out, { at: t, freq: 950 * pitch, slideTo: 700 * pitch, type: 'triangle', peak: loud * 0.5, decay: 0.05 })
      burst(ctx, out, { at: t, freq: 3200 * pitch, q: 5, peak: loud, decay: 0.025 })
      tone(ctx, out, { at: t, freq: 160, slideTo: 90, peak: loud * 0.35, decay: 0.06 })
    })
    for (let i = 0; i < 4; i++) burst(ctx, out, { at: at + 0.67 + i * 0.035, freq: 3200 * pitch, q: 5, peak: 0.08 / (i + 1), decay: 0.015 })
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

  // A new part of the dungeon: a low drone, a hollow minor chord swelling in, and a
  // music-box tune drifting over it.
  tile(ctx, at, out) {
    const tune = TILE_TUNES[Math.floor(Math.random() * TILE_TUNES.length)]
    pad(ctx, out, { at, freq: NOTE(45), length: 4.2, peak: 0.16, type: 'sine' })
    pad(ctx, out, { at, freq: NOTE(45), length: 4.2, peak: 0.05, type: 'sawtooth', detune: 7, tremolo: 0.7 })
    for (const note of [57, 60, 64]) pad(ctx, out, { at: at + 0.2, freq: NOTE(note), length: 3.8, peak: 0.045, detune: (note % 3) * 4, tremolo: 3 })
    tune.forEach((note, i) => {
      const t = at + 0.5 + i * 0.7
      tone(ctx, out, { at: t, freq: NOTE(note), peak: 0.13, decay: i === tune.length - 1 ? 1.4 : 0.9 })
      tone(ctx, out, { at: t, freq: NOTE(note + 12), peak: 0.03, decay: 0.5 })
    })
    burst(ctx, out, { at, freq: 300, q: 1, peak: 0.12, attack: 1.5, decay: 2.5, sweepTo: 900 })
  },

  // --- Monsters, when they're drawn.

  // Cave Bear: a huge, deep roar with a heavy breath.
  bear(ctx, at, out) {
    snarl(ctx, out, at, 1.9, 48, { rise: 1.8, fall: 0.7, rattle: 17, cutoff: 700, peak: 0.4, breath: 0.4 })
    snarl(ctx, out, at + 0.05, 1.8, 97, { rise: 1.6, fall: 0.6, rattle: 29, cutoff: 1200, peak: 0.12, breath: 0 })
  },

  // Snake: a long hiss with a dry rattle under it.
  hiss(ctx, at, out) {
    burst(ctx, out, { at, type: 'highpass', freq: 4500, peak: 0.35, attack: 0.15, decay: 1.25 })
    for (let i = 0; i < 14; i++) burst(ctx, out, { at: at + 0.1 + i * 0.06, freq: 6000, q: 6, peak: 0.12, decay: 0.02 })
  },

  // Orc Archer: a bowstring twang and an arrow flying past.
  bow(ctx, at, out) {
    tone(ctx, out, { at, freq: 180, slideTo: 150, type: 'sawtooth', peak: 0.3, decay: 0.35, filter: 1500 })
    burst(ctx, out, { at: at + 0.12, freq: 1200, q: 3, peak: 0.6, attack: 0.25, decay: 0.15, sweepTo: 3500 })
    tone(ctx, out, { at: at + 0.6, freq: 900, slideTo: 300, peak: 0.25, decay: 0.12 })
    burst(ctx, out, { at: at + 0.6, type: 'lowpass', freq: 1200, peak: 0.5, decay: 0.12 })
  },

  // Orc Smasher: two war drum hits and a battle grunt.
  smasher(ctx, at, out) {
    for (const t of [0, 0.25]) tone(ctx, out, { at: at + t, freq: 90, slideTo: 45, peak: 0.8, decay: 0.3 })
    snarl(ctx, out, at + 0.45, 0.6, 110, { rise: 1.5, fall: 0.6, rattle: 35, cutoff: 1400, peak: 0.35, breath: 0.15 })
  },

  // Human Cultist: a low, wordless chant.
  chant(ctx, at, out) {
    for (const [note, start] of [[43, 0], [50, 0.05], [46, 0.9]]) {
      const osc = ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.value = NOTE(note)
      // A vowel-like resonance turns the buzz into "ohhh".
      const vowel = ctx.createBiquadFilter()
      vowel.type = 'bandpass'
      vowel.frequency.value = 500
      vowel.Q.value = 5
      const length = start > 0.5 ? 1.0 : 1.9
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0001, at + start)
      gain.gain.linearRampToValueAtTime(0.5, at + start + 0.3)
      gain.gain.linearRampToValueAtTime(0.0001, at + start + length)
      osc.connect(vowel).connect(gain).connect(out)
      osc.start(at + start)
      osc.stop(at + start + length + 0.05)
    }
  },

  // Duergar Guard: armored boots clanking closer, then a gruff grunt.
  duergar(ctx, at, out) {
    for (let i = 0; i < 3; i++) {
      const t = at + i * 0.22
      burst(ctx, out, { at: t, type: 'lowpass', freq: 500, peak: 0.5 + i * 0.15, decay: 0.08 })
      tone(ctx, out, { at: t, freq: 1800 + i * 150, peak: 0.08, decay: 0.2 })
    }
    snarl(ctx, out, at + 0.7, 0.45, 85, { rise: 1.2, fall: 0.8, rattle: 30, cutoff: 800, peak: 0.3, breath: 0.1 })
  },

  // Legion Devil: a burst of hellfire and a deep, falling snarl.
  devil(ctx, at, out) {
    burst(ctx, out, { at, freq: 300, q: 0.8, peak: 0.5, attack: 0.05, decay: 0.8, sweepTo: 1800 })
    for (let i = 0; i < 10; i++) burst(ctx, out, { at: at + Math.random() * 1.2, freq: 2500, q: 2, peak: 0.15, decay: 0.03 })
    snarl(ctx, out, at + 0.25, 1.4, 120, { rise: 1.1, fall: 0.35, rattle: 40, cutoff: 1100, peak: 0.3, breath: 0 })
  },

  // Gibbering Mouther: many mouths babbling at once.
  gibber(ctx, at, out) {
    for (let i = 0; i < 22; i++) {
      const freq = 180 + Math.random() * 500
      const t = at + i * 0.065 + Math.random() * 0.03
      tone(ctx, out, { at: t, freq, slideTo: freq * (0.6 + Math.random()), type: 'sawtooth', peak: 0.22, decay: 0.08, filter: 1500 })
    }
    for (let i = 0; i < 6; i++) tone(ctx, out, { at: at + i * 0.22, freq: 200, slideTo: 500, peak: 0.25, decay: 0.07 })
  },

  // Grell: fast chittering clicks and a wet squelch.
  grell(ctx, at, out) {
    for (let i = 0; i < 16; i++) burst(ctx, out, { at: at + i * 0.045, freq: 3500 + (i % 3) * 800, q: 8, peak: 0.5, decay: 0.015 })
    burst(ctx, out, { at: at + 0.8, freq: 400, q: 3, peak: 0.45, attack: 0.02, decay: 0.3, sweepTo: 150 })
    tone(ctx, out, { at: at + 0.8, freq: 300, slideTo: 120, peak: 0.2, decay: 0.3 })
  },

  // Kobold Dragonshield: a yappy little snarl, twice.
  kobold(ctx, at, out) {
    snarl(ctx, out, at, 0.3, 260, { rise: 1.3, fall: 0.9, rattle: 45, cutoff: 2500, peak: 0.22, breath: 0.05 })
    snarl(ctx, out, at + 0.4, 0.4, 300, { rise: 1.3, fall: 0.7, rattle: 45, cutoff: 2500, peak: 0.22, breath: 0.05 })
  },

  // Kobold Dragonlord: a kobold's yap and a squeaky horn call.
  dragonlord(ctx, at, out) {
    SOUNDS.kobold(ctx, at, out)
    brass(ctx, out, { at: at + 0.75, freq: NOTE(62), length: 0.2, peak: 0.16 })
    brass(ctx, out, { at: at + 0.97, freq: NOTE(69), length: 0.5, peak: 0.16, wobble: 5 })
  },

  // Duergar Captain: a low war horn.
  warhorn(ctx, at, out) {
    brass(ctx, out, { at, freq: NOTE(41), length: 0.6, peak: 0.25 })
    brass(ctx, out, { at: at + 0.65, freq: NOTE(46), length: 1.0, peak: 0.25, wobble: 2, slideTo: NOTE(45) })
    brass(ctx, out, { at: at + 0.65, freq: NOTE(34), length: 1.0, peak: 0.15 })
  },

  // Orc Storm Shaman: a crack of lightning and rolling thunder.
  thunder(ctx, at, out) {
    burst(ctx, out, { at, type: 'highpass', freq: 1500, peak: 0.7, decay: 0.12 })
    burst(ctx, out, { at: at + 0.05, type: 'lowpass', freq: 250, peak: 1.4, attack: 0.05, decay: 1.6 })
    burst(ctx, out, { at: at + 0.4, type: 'lowpass', freq: 160, peak: 1, attack: 0.2, decay: 1.1 })
  },

  // Otyugh: a slimy gurgle from deep in a filthy pit.
  otyugh(ctx, at, out) {
    for (let i = 0; i < 12; i++) {
      const freq = 80 + Math.random() * 120
      tone(ctx, out, { at: at + i * 0.1 + Math.random() * 0.05, freq, slideTo: freq * 2, peak: 0.35, decay: 0.09 })
    }
    snarl(ctx, out, at + 0.2, 1.3, 55, { rise: 1.2, fall: 0.9, rattle: 12, cutoff: 500, peak: 0.25, breath: 0.1 })
  },

  // Rage Drake: a piercing reptile shriek.
  drake(ctx, at, out) {
    snarl(ctx, out, at, 1.2, 420, { rise: 1.5, fall: 0.6, rattle: 55, cutoff: 3500, peak: 0.22, breath: 0.15 })
    snarl(ctx, out, at, 1.1, 140, { rise: 1.4, fall: 0.6, rattle: 30, cutoff: 900, peak: 0.2, breath: 0 })
  },

  // Ashardalon: the great red dragon. A long, enormous roar over a rumble you can feel.
  dragon(ctx, at, out) {
    tone(ctx, out, { at, freq: 40, slideTo: 30, peak: 0.6, attack: 0.4, decay: 2.3 })
    snarl(ctx, out, at + 0.1, 2.6, 42, { rise: 2, fall: 0.6, rattle: 14, cutoff: 600, peak: 0.45, breath: 0.45 })
    snarl(ctx, out, at + 0.2, 2.4, 160, { rise: 1.7, fall: 0.5, rattle: 33, cutoff: 2200, peak: 0.14, breath: 0 })
    burst(ctx, out, { at: at + 0.3, freq: 600, q: 0.7, peak: 0.25, attack: 0.5, decay: 1.8, sweepTo: 2500 })
  },

  // Gauth: an eerie warbling hum, like a magic eye opening.
  gauth(ctx, at, out) {
    for (const [freq, tremolo] of [[220, 6], [233, 7.5], [330, 4]]) pad(ctx, out, { at, freq, length: 1.8, peak: 0.12, type: 'sine', tremolo })
    tone(ctx, out, { at: at + 0.2, freq: 900, slideTo: 1800, peak: 0.08, attack: 0.6, decay: 0.8 })
  },

  // Sound board: a snare roll that builds, then a cymbal crash.
  drumroll(ctx, at, out) {
    const hits = 34
    for (let i = 0; i < hits; i++) {
      const t = at + i * 0.045
      burst(ctx, out, { at: t, type: 'highpass', freq: 1800, peak: 0.15 + 0.5 * (i / hits), decay: 0.05 })
      tone(ctx, out, { at: t, freq: 190, slideTo: 150, peak: 0.08 + 0.2 * (i / hits), decay: 0.05 })
    }
    const crash = at + hits * 0.045 + 0.05
    burst(ctx, out, { at: crash, type: 'highpass', freq: 5000, peak: 0.7, decay: 1.2 })
    tone(ctx, out, { at: crash, freq: 80, slideTo: 45, peak: 0.8, decay: 0.4 })
  },

  // Sound board: a crowd clapping, many quick claps that fade out.
  applause(ctx, at, out) {
    for (let i = 0; i < 70; i++) {
      const t = at + Math.random() * 1.8
      const fade = 1 - (t - at) / 2.2
      burst(ctx, out, { at: t, freq: 1000 + Math.random() * 1800, q: 1.5, peak: 0.45 * fade, decay: 0.04 + Math.random() * 0.03 })
    }
    tone(ctx, out, { at, freq: NOTE(84), peak: 0.04, decay: 0.3 })
  },

  // --- Powers cast at a monster, and the monster getting hit.

  // Fire: a roaring whoosh with crackles.
  fire(ctx, at, out) {
    burst(ctx, out, { at, freq: 300, q: 0.8, peak: 0.7, attack: 0.15, decay: 0.6, sweepTo: 2000 })
    burst(ctx, out, { at, type: 'lowpass', freq: 600, peak: 0.5, attack: 0.1, decay: 0.6 })
    for (let i = 0; i < 8; i++) burst(ctx, out, { at: at + 0.1 + Math.random() * 0.6, freq: 3000, q: 3, peak: 0.25, decay: 0.02 })
  },

  // Frost: glassy chimes falling, then a crack of ice.
  frost(ctx, at, out) {
    ;[96, 91, 88, 84].forEach((note, i) => tone(ctx, out, { at: at + i * 0.07, freq: NOTE(note), type: 'triangle', peak: 0.15, decay: 0.4 }))
    burst(ctx, out, { at: at + 0.35, type: 'highpass', freq: 3500, peak: 0.3, decay: 0.08 })
    burst(ctx, out, { at: at + 0.1, type: 'highpass', freq: 6000, peak: 0.12, attack: 0.1, decay: 0.5 })
  },

  // Lightning: a buzzing electric crackle.
  zap(ctx, at, out) {
    for (let i = 0; i < 6; i++) {
      const t = at + i * 0.09
      tone(ctx, out, { at: t, freq: 1800 + Math.random() * 1200, slideTo: 200, type: 'sawtooth', peak: 0.08, decay: 0.07, filter: 5000 })
      burst(ctx, out, { at: t, type: 'highpass', freq: 2500, peak: 0.22, decay: 0.04 })
    }
    tone(ctx, out, { at, freq: 60, type: 'square', peak: 0.12, attack: 0.05, decay: 0.55, filter: 800 })
  },

  // Thunder: a deep boom with a shock wave.
  boom(ctx, at, out) {
    tone(ctx, out, { at, freq: 120, slideTo: 40, peak: 0.8, decay: 0.6 })
    burst(ctx, out, { at, type: 'lowpass', freq: 900, peak: 0.9, decay: 0.7 })
    burst(ctx, out, { at, type: 'highpass', freq: 2000, peak: 0.3, decay: 0.08 })
  },

  // Magic missiles and other arcane blasts: a rising "pew" and a sparkle.
  arcane(ctx, at, out) {
    for (const t of [0, 0.12, 0.24]) tone(ctx, out, { at: at + t, freq: 500, slideTo: 1800, type: 'square', peak: 0.25, decay: 0.12, filter: 3500 })
    for (let i = 0; i < 6; i++) tone(ctx, out, { at: at + 0.35 + i * 0.05, freq: NOTE(93 + (i % 3) * 4), peak: 0.2, decay: 0.15 })
  },

  // Holy power: a bright bell over a shining chord.
  holy(ctx, at, out) {
    for (const note of [72, 76, 79, 84]) pad(ctx, out, { at, freq: NOTE(note), length: 0.9, peak: 0.08, type: 'sine', tremolo: 6 })
    tone(ctx, out, { at: at + 0.05, freq: NOTE(84), peak: 0.25, decay: 0.8 })
    tone(ctx, out, { at: at + 0.05, freq: NOTE(84) * 2.76, peak: 0.08, decay: 0.5 })
  },

  // Fear and hypnosis: a woozy, wobbling tone.
  psychic(ctx, at, out) {
    for (const [freq, tremolo] of [[300, 7], [450, 5]]) pad(ctx, out, { at, freq, length: 0.9, peak: 0.15, type: 'sine', tremolo })
    tone(ctx, out, { at, freq: 900, slideTo: 250, type: 'triangle', peak: 0.15, attack: 0.1, decay: 0.8 })
  },

  // A ranged shot: bowstring and arrow.
  arrow(ctx, at, out) {
    tone(ctx, out, { at, freq: 200, slideTo: 160, type: 'sawtooth', peak: 0.25, decay: 0.25, filter: 1500 })
    burst(ctx, out, { at: at + 0.1, freq: 1500, q: 3, peak: 0.6, attack: 0.15, decay: 0.12, sweepTo: 4000 })
  },

  // A spell that misses: it sputters out.
  fizzle(ctx, at, out) {
    burst(ctx, out, { at, freq: 2500, q: 1, peak: 1, attack: 0.02, decay: 0.45, sweepTo: 400 })
    tone(ctx, out, { at, freq: 700, slideTo: 150, type: 'triangle', peak: 0.3, decay: 0.4 })
  },

  // A monster that's been hit.
  hurt(ctx, at, out) {
    snarl(ctx, out, at, 0.4, 160, { rise: 1.6, fall: 0.7, rattle: 35, cutoff: 1800, peak: 0.3, breath: 0.1 })
  },
  'hurt-big'(ctx, at, out) {
    snarl(ctx, out, at, 0.55, 90, { rise: 1.5, fall: 0.6, rattle: 25, cutoff: 1300, peak: 0.4, breath: 0.15 })
  },
  'hurt-small'(ctx, at, out) {
    snarl(ctx, out, at, 0.3, 330, { rise: 1.5, fall: 0.8, rattle: 50, cutoff: 3000, peak: 0.25, breath: 0.05 })
  },
  'hurt-snake'(ctx, at, out) {
    burst(ctx, out, { at, type: 'highpass', freq: 4000, peak: 0.45, attack: 0.03, decay: 0.4 })
  },
}

// A growl: a low buzzy voice with a ragged wobble, pushed through distortion. The
// options shape it into different beasts: how far the pitch rises and falls, how
// fast it rattles, how bright and how loud it is.
function snarl(ctx, out, at, length, freq, { rise = 1.4, fall = 0.8, rattle = 23, cutoff = 900, peak = 0.25, breath = 0.25 } = {}) {
  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(freq, at)
  osc.frequency.linearRampToValueAtTime(freq * rise, at + length * 0.3)
  osc.frequency.linearRampToValueAtTime(freq * fall, at + length)
  const lfo = ctx.createOscillator()
  const depth = ctx.createGain()
  lfo.type = 'square'
  lfo.frequency.value = rattle
  depth.gain.value = freq * 0.3
  lfo.connect(depth).connect(osc.frequency)

  const shaper = ctx.createWaveShaper()
  const curve = new Float32Array(256)
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(((i / 255) * 2 - 1) * 4)
  shaper.curve = curve
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = cutoff
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.linearRampToValueAtTime(peak, at + length * 0.2)
  gain.gain.linearRampToValueAtTime(peak * 0.7, at + length * 0.7)
  gain.gain.linearRampToValueAtTime(0.0001, at + length)
  osc.connect(shaper).connect(filter).connect(gain).connect(out)
  if (breath) burst(ctx, out, { at, type: 'lowpass', freq: cutoff * 0.8, peak: breath, attack: length * 0.2, decay: length * 0.8 })
  for (const node of [osc, lfo]) {
    node.start(at)
    node.stop(at + length + 0.05)
  }
}

// A held note with a slow swell, for pads and hums.
export function pad(ctx, out, { at, freq, length, peak = 0.08, type = 'triangle', detune = 0, tremolo = 0 }) {
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.value = freq
  osc.detune.value = detune
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.linearRampToValueAtTime(peak, at + length * 0.35)
  gain.gain.setValueAtTime(peak, at + length * 0.65)
  gain.gain.linearRampToValueAtTime(0.0001, at + length)
  let node = osc.connect(gain)
  const extra = []
  if (tremolo) {
    const wobble = ctx.createGain()
    const lfo = ctx.createOscillator()
    const depth = ctx.createGain()
    lfo.frequency.value = tremolo
    depth.gain.value = 0.5
    wobble.gain.value = 0.5
    lfo.connect(depth).connect(wobble.gain)
    node = node.connect(wobble)
    extra.push(lfo)
  }
  node.connect(out)
  for (const n of [osc, ...extra]) {
    n.start(at)
    n.stop(at + length + 0.05)
  }
}

// The tunes a new dungeon tile can play: a slow, eerie line over a low drone.
// A different one each time keeps it from wearing thin.
const TILE_TUNES = [
  [69, 72, 71, 68],
  [64, 65, 68, 69],
  [76, 74, 72, 71],
]
