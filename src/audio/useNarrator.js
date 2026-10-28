import { useCallback, useEffect, useRef, useState } from 'react'
import { narrationFor } from './narration.js'
import { momentSoundMs } from './sfx.js'

// A short pause after the sound effects end, so the voice doesn't step on them.
const DELAY_MS = 300
// If the game moves faster than the narrator can talk, old lines are dropped.
const MAX_QUEUE = 3

// The last game this page saw. Kept outside the hook so that going from the
// setup screen to the game (a new component) still hears "The adventure begins".
let lastSeen = null

// The projector's narrator: speaks new tiles, monsters, encounters and big rolls
// through the Pi's /narrate endpoint. Browsers only play sound after a tap on
// the page, so `blocked` asks for one. `on` is the device's one sound switch.
export function useNarrator(state, on) {
  const [available, setAvailable] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const queue = useRef([])
  const speaking = useRef(false)
  const audio = useRef(null)
  const timers = useRef(new Set())

  useEffect(() => {
    fetch('/narrate')
      .then((r) => r.json())
      .then((r) => setAvailable(Boolean(r.enabled)))
      .catch(() => setAvailable(false))
  }, [])

  const playNext = useCallback(() => {
    if (speaking.current) return
    const line = queue.current.shift()
    if (!line) return
    speaking.current = true
    const player = audio.current ?? (audio.current = new Audio())
    const done = () => {
      speaking.current = false
      playNext()
    }
    player.onended = done
    player.onerror = done
    player.src = `/narrate?voice=${line.voice}&text=${encodeURIComponent(line.text)}`
    player.play().then(
      () => setBlocked(false),
      (error) => {
        speaking.current = false
        if (error?.name === 'NotAllowedError') {
          // Keep the line for after the tap.
          queue.current.unshift(line)
          setBlocked(true)
        } else done()
      },
    )
  }, [])

  useEffect(() => {
    const before = lastSeen
    lastSeen = state
    if (!available || !on) return
    const lines = narrationFor(before, state)
    if (lines.length === 0) return
    // Wait for this moment's sound effects (die landing, fanfare, roar) to finish.
    const moment = state.moment?.id !== before?.moment?.id ? state.moment : null
    // Not cancelled when the next change arrives: every line gets its turn.
    const timer = setTimeout(() => {
      timers.current.delete(timer)
      queue.current = [...queue.current, ...lines].slice(-MAX_QUEUE)
      playNext()
    }, (moment ? momentSoundMs(moment) : 0) + DELAY_MS)
    timers.current.add(timer)
  }, [state, available, on, playNext])

  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach(clearTimeout)
      audio.current?.pause()
    }
  }, [])

  // Called from a tap, which is what lets the browser play sound.
  const unlock = () => {
    setBlocked(false)
    playNext()
  }

  // Sound turned off: stop talking and forget what was waiting.
  useEffect(() => {
    if (on) return
    queue.current = []
    audio.current?.pause()
    speaking.current = false
  }, [on])

  return { available, blocked: available && on && blocked, unlock }
}
