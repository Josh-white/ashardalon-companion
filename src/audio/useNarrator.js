import { useCallback, useEffect, useRef, useState } from 'react'
import { narrationFor } from './narration.js'

const SETTING_KEY = 'ashardalon-companion/narrator'
// Lets a big moment's die land (and its sound effects play) before the narrator speaks.
const ROLL_DELAY_MS = 1200
const DELAY_MS = 400
// If the game moves faster than the narrator can talk, old lines are dropped.
const MAX_QUEUE = 3

// The last game this page saw. Kept outside the hook so that going from the
// setup screen to the game (a new component) still hears "The adventure begins".
let lastSeen = null

const readSetting = () => {
  try {
    return localStorage.getItem(SETTING_KEY) !== 'off'
  } catch {
    return true
  }
}

// The projector's narrator: speaks new tiles, monsters, encounters and big rolls
// through the Pi's /narrate endpoint. Browsers only play sound after a tap on
// the page, so `blocked` asks for one.
export function useNarrator(state) {
  const [available, setAvailable] = useState(false)
  const [on, setOn] = useState(readSetting)
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
    player.src = `/narrate?text=${encodeURIComponent(line)}`
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
    const moment = state.moment
    const isRoll = moment?.value != null || (moment?.rolls ?? []).length > 0
    // Not cancelled when the next change arrives: every line gets its turn.
    const timer = setTimeout(() => {
      timers.current.delete(timer)
      queue.current = [...queue.current, ...lines].slice(-MAX_QUEUE)
      playNext()
    }, isRoll ? ROLL_DELAY_MS : DELAY_MS)
    timers.current.add(timer)
  }, [state, available, on, playNext])

  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach(clearTimeout)
      audio.current?.pause()
    }
  }, [])

  const toggle = () => {
    const next = !on
    setOn(next)
    try {
      localStorage.setItem(SETTING_KEY, next ? 'on' : 'off')
    } catch {
      // Private mode: the choice lasts until the page reloads.
    }
    if (!next) {
      queue.current = []
      audio.current?.pause()
      speaking.current = false
    }
  }

  // Called from a tap, which is what lets the browser play sound.
  const unlock = () => {
    setBlocked(false)
    playNext()
  }

  return { available, on, blocked: available && on && blocked, toggle, unlock }
}
