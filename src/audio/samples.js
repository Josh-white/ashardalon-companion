// Recorded sounds. A recording on the Pi (cards/sounds/<sound>.mp3, kept out of git
// like the card art) plays in place of the made-up sound of the same name in sfx.js,
// so a real sad trombone or a real dice roll can stand in. Until a recording has
// loaded, or if there isn't one, the made-up sound plays.

// The loudest moment of each recording is brought to this level (RMS over 0.4 s, in
// dBFS), so recordings from different places come out about as loud as the rest.
const TARGET_DB = -17
// Anything quieter than this at the start is silence to skip.
const SILENCE = 0.01

// Ambient loops (cards/sounds/loop-<mood>.mp3) are long, so they're left out here and
// loaded only by a screen that plays background music; see loadLoop.
export const isLoop = (sound) => sound.startsWith('loop-')
// Loops are evened out on their average loudness instead, since they have no one big hit.
const LOOP_TARGET_DB = -20

const recordings = new Map() // sound -> { buffer, gain, offset }
let loading = null
let listing = null

// How loud a recording is at its loudest, and where its sound starts.
export function measure(data, sampleRate) {
  const window = Math.max(1, Math.round(sampleRate * 0.4))
  let sum = 0
  let loudest = 0
  for (let i = 0; i < data.length; i++) {
    sum += data[i] * data[i]
    if (i >= window) sum -= data[i - window] * data[i - window]
    if (sum > loudest) loudest = sum
  }
  const rms = Math.sqrt(loudest / Math.min(window, data.length))
  let start = 0
  while (start < data.length && Math.abs(data[start]) < SILENCE) start++
  const gain = rms > 0 ? Math.min(10, Math.pow(10, TARGET_DB / 20) / rms) : 1
  return { gain, offset: start < data.length ? start / sampleRate : 0 }
}

// How loud a loop is on average, as the gain that brings it to LOOP_TARGET_DB.
export function loopGain(data) {
  let sum = 0
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
  const rms = Math.sqrt(sum / Math.max(1, data.length))
  return rms > 0 ? Math.min(10, Math.pow(10, LOOP_TARGET_DB / 20) / rms) : 1
}

// The Pi's list of recordings ({ sound: { file, v } }), fetched once per page.
export function soundList() {
  if (listing || typeof fetch !== 'function') return listing ?? Promise.resolve({})
  listing = fetch('/sounds.json', { cache: 'no-store' })
    .then((response) => (response.ok ? response.json() : {}))
    .catch(() => ({}))
  return listing
}

async function decode(ctx, { file, v }) {
  const response = await fetch(`/sounds/${file}?v=${v}`)
  if (!response.ok) throw new Error(`${file}: ${response.status}`)
  const data = await response.arrayBuffer()
  // Older Safari only has the callback form.
  return new Promise((resolve, reject) => ctx.decodeAudioData(data, resolve, reject))
}

// Fetches and decodes the Pi's recordings once per page. Safe to call often.
export function loadSamples(ctx) {
  if (loading || !ctx || typeof fetch !== 'function') return loading
  loading = (async () => {
    const list = await soundList()
    await Promise.all(
      Object.entries(list)
        .filter(([sound]) => !isLoop(sound))
        .map(async ([sound, entry]) => {
          try {
            const buffer = await decode(ctx, entry)
            recordings.set(sound, { buffer, ...measure(buffer.getChannelData(0), buffer.sampleRate) })
          } catch {
            // Keep the made-up sound for this one.
          }
        }),
    )
  })()
  return loading
}

const loops = new Map() // sound -> Promise of { buffer, gain }, or of null without one

// The ambient loop `sound` (say 'loop-explore'), decoded and evened out, or null if the
// Pi has none. Fetched the first time it's asked for.
export function loadLoop(ctx, sound) {
  if (!loops.has(sound)) {
    loops.set(
      sound,
      soundList().then(async (list) => {
        if (!list[sound]) return null
        try {
          const buffer = await decode(ctx, list[sound])
          return { buffer, gain: loopGain(buffer.getChannelData(0)) }
        } catch {
          return null
        }
      }),
    )
  }
  return loops.get(sound)
}

// How long the recording for `sound` lasts in ms, or null if there isn't one.
export function sampleMs(sound) {
  const rec = recordings.get(sound)
  return rec ? Math.round((rec.buffer.duration - rec.offset) * 1000) : null
}

// Plays the recording for `sound` at `at` if it has loaded, and says whether it did.
export function playSample(ctx, sound, at, out, rate = 1) {
  const rec = recordings.get(sound)
  if (!rec) return false
  const level = ctx.createGain()
  level.gain.value = rec.gain
  const source = ctx.createBufferSource()
  source.buffer = rec.buffer
  source.playbackRate.value = rate
  source.connect(level).connect(out)
  source.start(at, rec.offset)
  return true
}
