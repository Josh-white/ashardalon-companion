import { useCallback, useEffect, useRef, useState } from 'react'
import { narrationFor, nextReadings } from './narration.js'
import { momentSoundMs } from './sfx.js'
import { serverNow, useGameStates } from '../state/useSharedGame.js'
import { TAP_EVENTS, audioContext } from './soundSetting.js'
import { VOICE_DUCK, VOICE_HOLD_S, holdQuiet, layer, releaseQuiet } from './mixer.js'
import { SWITCH_PAUSE_MS, pauseBetween, waitMs } from './pacing.js'
import { narratorBusyIs } from './busy.js'

// If the game moves faster than the narrator can talk, old lines are dropped.
const MAX_QUEUE = 5
// The music stays down through the pause between two lines.
const HOLD_S = SWITCH_PAUSE_MS / 1000 + VOICE_HOLD_S

const lineUrl = (line) => `/narrate?voice=${line.voice}&text=${encodeURIComponent(line.text)}`

// Lines are fetched from the Pi and decoded into the page's one audio context, so they
// play through the mixer: the music dips under them, and they never stop a sound effect.
// The last few are kept, for a line that's said again.
const KEEP_LINES = 8
const decoded = new Map() // url -> Promise of an AudioBuffer
function fetchLine(ctx, line) {
  const url = lineUrl(line)
  if (!decoded.has(url)) {
    const buffer = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`narrator: ${response.status}`)
        return response.arrayBuffer()
      })
      // Older Safari only has the callback form.
      .then((data) => new Promise((resolve, reject) => ctx.decodeAudioData(data, resolve, reject)))
    // A line that failed can be tried again later.
    buffer.catch(() => decoded.delete(url))
    decoded.set(url, buffer)
    while (decoded.size > KEEP_LINES) decoded.delete(decoded.keys().next().value)
  }
  return decoded.get(url)
}

// What's being said right now on this page, if anything.
let speaking = null // { source, stopped, line }
// The last line said and when it ended, for the pause before the next one.
let last = null // { line, at }
// When the sound effects that are playing now (a roar, a fanfare) will be done.
let sfxUntil = 0
// The next line, waiting out a pause.
let waiting = null
function stopWaiting() {
  clearTimeout(waiting)
  waiting = null
}
function stopSpeaking(ctx) {
  stopWaiting()
  if (!speaking) return
  speaking.stopped = true
  try {
    speaking.source?.stop()
  } catch {
    // Not started yet, or already over.
  }
  speaking = null
  last = null
  releaseQuiet(ctx, 'voice')
}

// The narrator: speaks new tiles, monsters, encounters and big rolls through the Pi's
// /narrate endpoint, on every screen whose sound is on. It hears every state the Pi
// sends, so a line isn't skipped when two changes land together. Browsers only play
// sound after a tap on the page, so `blocked` asks for one.
// `onHold(hold, 'start' | 'done')` hears when lines that something waits for (a line's
// `hold`: the opening story, the roll for first turn) start and end here, so the other
// screens can wait for them.
// `onReading(line | null)` hears when a hero starts and stops reading a card here.
export function useNarrator(on, { onHold, onReading } = {}) {
  const [available, setAvailable] = useState(false)
  const [blocked, setBlocked] = useState(false)
  // A hero is reading a card out loud here, so the screen can offer to skip it.
  const [reading, setReading] = useState(false)
  const queue = useRef([])
  const hold = useRef(onHold)
  const readingHeard = useRef(onReading)
  useEffect(() => {
    hold.current = onHold
    readingHeard.current = onReading
  })
  // Every screen hears a card is being read from the moment it's waiting here (it can take
  // a few seconds to record the first time), until the last card waiting is read or skipped,
  // so the encounter's buttons wait for it.
  const told = useRef(null) // the read line the other screens were told about
  const syncReading = useCallback(() => {
    // A line waiting on a tap to unlock the sound could wait a long time: the board doesn't.
    const running = audioContext()?.state === 'running'
    const line = !running ? null : speaking?.line?.read ? speaking.line : queue.current.find((l) => l.read) ?? null
    if (Boolean(line) === Boolean(told.current)) return
    told.current = line
    readingHeard.current?.(line)
  }, [])
  // The computer allies wait while the narrator talks (not while a line waits on a tap
  // to unlock the sound: that could be a long wait).
  const busy = useRef({ on, blocked })
  busy.current = { on, blocked }
  useEffect(() => {
    narratorBusyIs(() => busy.current.on && !busy.current.blocked && (Boolean(speaking) || queue.current.length > 0))
    return () => narratorBusyIs(() => false)
  }, [])

  useEffect(() => {
    fetch('/narrate')
      .then((r) => r.json())
      .then((r) => setAvailable(Boolean(r.enabled)))
      .catch(() => setAvailable(false))
  }, [])

  const playNext = useCallback(() => {
    if (speaking || queue.current.length === 0) return
    // A breath after the last line (longer when someone else speaks next), and never
    // over a sound effect that's still playing.
    const restUntil = last ? last.at + pauseBetween(last.line, queue.current[0]) : 0
    const wait = waitMs(Date.now(), { restUntil, sfxUntil })
    if (wait > 0) {
      if (!waiting) waiting = setTimeout(() => {
        waiting = null
        playNext()
      }, wait)
      return
    }
    const ctx = audioContext()
    if (!ctx) return
    if (ctx.state !== 'running') {
      // Paused until a tap (or after a phone call on an iPad): try to start again, and
      // keep the line for after the tap if that isn't allowed yet.
      ctx.resume().then(
        () => (ctx.state === 'running' ? playNext() : (setBlocked(true), syncReading())),
        () => (setBlocked(true), syncReading()),
      )
      return
    }
    setBlocked(false)
    const line = queue.current.shift()
    const turn = { source: null, stopped: false, line }
    speaking = turn
    setReading(Boolean(line.read))
    syncReading()
    const done = (said) => {
      if (speaking !== turn) return
      speaking = null
      setReading(false)
      syncReading()
      if (said) last = { line, at: Date.now() }
      if (line.hold && !queue.current.some((l) => l.hold === line.hold)) hold.current?.(line.hold, 'done')
      // The music waits a moment before coming back, in case another line follows.
      releaseQuiet(ctx, 'voice', HOLD_S)
      playNext()
    }
    fetchLine(ctx, line).then(
      (buffer) => {
        if (turn.stopped) return
        const source = ctx.createBufferSource()
        source.buffer = buffer
        source.connect(layer(ctx, 'voice'))
        source.onended = () => done(true)
        turn.source = source
        // The music dips while the narrator talks, and comes back when it's done.
        holdQuiet(ctx, 'voice', VOICE_DUCK)
        source.start()
      },
      () => done(false),
    )
  }, [syncReading])

  // Skip a hero reading a card: stop it, and drop any other card waiting to be read.
  const skipNow = () => {
    queue.current = queue.current.filter((l) => !l.read)
    if (speaking?.line?.read) stopSpeaking(audioContext())
    setReading(false)
    syncReading()
    playNext()
  }

  useGameStates((before, after) => {
    // Someone tapped Skip on a hero reading a card, on this screen or another.
    if (before && (after?.readSkips ?? 0) > (before.readSkips ?? 0)) skipNow()
    // The opening story was skipped: stop reading it.
    if (before?.opening && !before.opening.done && after?.opening?.done) {
      queue.current = queue.current.filter((l) => l.hold !== 'opening')
      if (speaking?.line?.hold === 'opening') {
        stopSpeaking(audioContext())
        playNext()
      }
    }
    // A new moment's sound effects (die landing, fanfare, roar): the next line waits
    // for them, whether it's this moment's line or one already waiting.
    const moment = after.moment?.id !== before?.moment?.id ? after.moment : null
    if (moment) sfxUntil = Math.max(sfxUntil, Date.now() + momentSoundMs(moment))
    if (!available || !on) return
    // The card the hero whose turn it is would draw next gets recorded now, so it's read
    // the moment it's drawn instead of a few seconds later.
    const ahead = audioContext()
    // Heroes reading cards aloud can be switched off for the game (players who know the cards).
    const cardsOff = Boolean(after.readCardsOff)
    if (ahead && !cardsOff) for (const line of nextReadings(before, after)) fetchLine(ahead, line).catch(() => {})
    const lines = narrationFor(before, after, serverNow()).filter((line) => !(cardsOff && line.read))
    if (lines.length === 0) return
    queue.current = [...queue.current, ...lines].slice(-MAX_QUEUE)
    syncReading()
    // Whatever waits for these lines starts waiting now, before they're even said.
    for (const name of new Set(lines.map((l) => l.hold).filter(Boolean))) hold.current?.(name, 'start')
    // Ask for every waiting line now, so the Pi records the next one (a villain's
    // reply, say) while the current one is still playing.
    const ctx = audioContext()
    if (ctx) for (const line of queue.current) fetchLine(ctx, line).catch(() => {})
    playNext()
  })

  useEffect(() => () => stopSpeaking(audioContext()), [])

  // While a line waits on a tap, the next tap anywhere plays it (a tap is what lets
  // the browser play sound).
  useEffect(() => {
    if (!blocked) return
    const unlock = () => {
      setBlocked(false)
      playNext()
    }
    for (const type of TAP_EVENTS) window.addEventListener(type, unlock)
    return () => {
      for (const type of TAP_EVENTS) window.removeEventListener(type, unlock)
    }
  }, [blocked, playNext])

  // Sound turned off: stop talking and forget what was waiting.
  useEffect(() => {
    if (on) return
    queue.current = []
    stopSpeaking(audioContext())
    syncReading()
  }, [on, syncReading])

  // Says lines straight away (the intro screen's line, say), outside any game change.
  // force: say them even where this screen's sound is off by default.
  const say = useCallback(
    (lines, { force = false } = {}) => {
      if (!available || (!on && !force)) return
      queue.current = [...queue.current, ...lines].slice(-MAX_QUEUE)
      const ctx = audioContext()
      if (ctx) for (const line of lines) fetchLine(ctx, line).catch(() => {})
      playNext()
    },
    [available, on, playNext],
  )


  // Nothing being said or waiting to be said.
  const quiet = useCallback(() => !speaking && queue.current.length === 0, [])

  return { available, blocked: available && on && blocked, say, quiet, reading: available && on && reading }
}
