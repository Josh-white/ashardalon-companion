import { useCallback, useEffect, useRef, useState } from 'react'
import { narrationFor } from './narration.js'
import { momentSoundMs } from './sfx.js'
import { serverNow, useGameStates } from '../state/useSharedGame.js'
import { TAP_EVENTS, audioContext } from './soundSetting.js'
import { VOICE_DUCK, VOICE_HOLD_S, holdQuiet, layer, releaseQuiet } from './mixer.js'

// A short pause after the sound effects end, so the voice doesn't step on them.
const DELAY_MS = 300
// If the game moves faster than the narrator can talk, old lines are dropped.
const MAX_QUEUE = 3

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
let speaking = null // { source, stopped }
function stopSpeaking(ctx) {
  if (!speaking) return
  speaking.stopped = true
  try {
    speaking.source?.stop()
  } catch {
    // Not started yet, or already over.
  }
  speaking = null
  releaseQuiet(ctx, 'voice')
}

// The narrator: speaks new tiles, monsters, encounters and big rolls through the Pi's
// /narrate endpoint, on every screen whose sound is on. It hears every state the Pi
// sends, so a line isn't skipped when two changes land together. Browsers only play
// sound after a tap on the page, so `blocked` asks for one.
export function useNarrator(on) {
  const [available, setAvailable] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const queue = useRef([])
  const timers = useRef(new Set())

  useEffect(() => {
    fetch('/narrate')
      .then((r) => r.json())
      .then((r) => setAvailable(Boolean(r.enabled)))
      .catch(() => setAvailable(false))
  }, [])

  const playNext = useCallback(() => {
    if (speaking || queue.current.length === 0) return
    const ctx = audioContext()
    if (!ctx) return
    if (ctx.state !== 'running') {
      // Paused until a tap (or after a phone call on an iPad): try to start again, and
      // keep the line for after the tap if that isn't allowed yet.
      ctx.resume().then(
        () => (ctx.state === 'running' ? playNext() : setBlocked(true)),
        () => setBlocked(true),
      )
      return
    }
    setBlocked(false)
    const line = queue.current.shift()
    const turn = { source: null, stopped: false }
    speaking = turn
    const done = () => {
      if (speaking !== turn) return
      speaking = null
      // The music waits a moment before coming back, in case another line follows.
      releaseQuiet(ctx, 'voice', VOICE_HOLD_S)
      playNext()
    }
    fetchLine(ctx, line).then(
      (buffer) => {
        if (turn.stopped) return
        const source = ctx.createBufferSource()
        source.buffer = buffer
        source.connect(layer(ctx, 'voice'))
        source.onended = done
        turn.source = source
        // The music dips while the narrator talks, and comes back when it's done.
        holdQuiet(ctx, 'voice', VOICE_DUCK)
        source.start()
      },
      done,
    )
  }, [])

  useGameStates((before, after) => {
    if (!available || !on) return
    const lines = narrationFor(before, after, serverNow())
    if (lines.length === 0) return
    // Wait for this moment's sound effects (die landing, fanfare, roar) to finish.
    const moment = after.moment?.id !== before?.moment?.id ? after.moment : null
    // Not cancelled when the next change arrives: every line gets its turn.
    const timer = setTimeout(() => {
      timers.current.delete(timer)
      queue.current = [...queue.current, ...lines].slice(-MAX_QUEUE)
      // Ask for every waiting line now, so the Pi records the next one (a villain's
      // reply, say) while the current one is still playing.
      const ctx = audioContext()
      if (ctx) for (const line of queue.current) fetchLine(ctx, line).catch(() => {})
      playNext()
    }, (moment ? momentSoundMs(moment) : 0) + DELAY_MS)
    timers.current.add(timer)
  })

  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach(clearTimeout)
      stopSpeaking(audioContext())
    }
  }, [])

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
  }, [on])

  // Says lines straight away (the intro screen's line, say), outside any game change.
  const say = useCallback(
    (lines) => {
      if (!available || !on) return
      queue.current = [...queue.current, ...lines].slice(-MAX_QUEUE)
      const ctx = audioContext()
      if (ctx) for (const line of lines) fetchLine(ctx, line).catch(() => {})
      playNext()
    },
    [available, on, playNext],
  )

  return { available, blocked: available && on && blocked, say }
}
