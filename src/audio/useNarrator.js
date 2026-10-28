import { useCallback, useEffect, useRef, useState } from 'react'
import { narrationFor } from './narration.js'
import { momentSoundMs } from './sfx.js'
import { duckMusic } from './music.js'
import { serverNow, useGameStates } from '../state/useSharedGame.js'
import { TAP_EVENTS, voicePlayer, voiceSpeaking } from './soundSetting.js'

// A short pause after the sound effects end, so the voice doesn't step on them.
const DELAY_MS = 300
// If the game moves faster than the narrator can talk, old lines are dropped.
const MAX_QUEUE = 3

const lineUrl = (line) => `/narrate?voice=${line.voice}&text=${encodeURIComponent(line.text)}`

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
    if (voiceSpeaking()) return
    const line = queue.current.shift()
    if (!line) return
    const player = voicePlayer()
    if (!player) return
    voiceSpeaking(true)
    const done = () => {
      voiceSpeaking(false)
      playNext()
    }
    player.onended = done
    player.onerror = done
    // Music dips while the narrator talks, and comes back when it's done.
    player.onplaying = () => {
      if (Number.isFinite(player.duration)) duckMusic(player.duration * 1000)
    }
    player.src = lineUrl(line)
    player.play().then(
      () => setBlocked(false),
      (error) => {
        voiceSpeaking(false)
        if (error?.name === 'NotAllowedError') {
          // Keep the line for after the tap.
          queue.current.unshift(line)
          setBlocked(true)
        } else done()
      },
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
      for (const line of queue.current) fetch(lineUrl(line)).catch(() => {})
      playNext()
    }, (moment ? momentSoundMs(moment) : 0) + DELAY_MS)
    timers.current.add(timer)
  })

  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach(clearTimeout)
      voicePlayer()?.pause()
      voiceSpeaking(false)
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
    voicePlayer()?.pause()
    voiceSpeaking(false)
  }, [on])

  return { available, blocked: available && on && blocked }
}
