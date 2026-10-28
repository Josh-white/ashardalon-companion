import { useCallback, useEffect, useState } from 'react'

const SOUND_KEY = 'ashardalon-companion/sound'

// Seats that play sound unless someone turns it off: the shared screens. Four iPads
// all playing the same sound a beat apart would just be noise.
const LOUD_SEATS = ['projector', 'table']

// Older iPads only count touchend as a tap that may start sound.
const UNLOCK_EVENTS = ['pointerdown', 'touchend', 'keydown']

let context = null

// The one AudioContext for this page, made on first use. Browsers start it paused
// until someone taps the page; see unlockAudio.
export function audioContext() {
  if (context) return context
  const Context = window.AudioContext || window.webkitAudioContext
  if (!Context) return null
  context = new Context()
  return context
}

// Call from a tap or key press: that's the only time a browser lets sound start.
// iPads also need something to actually play inside the tap.
export function unlockAudio() {
  const ctx = audioContext()
  if (!ctx) return
  if (ctx.state !== 'running') ctx.resume().catch(() => {})
  const source = ctx.createBufferSource()
  source.buffer = ctx.createBuffer(1, 1, 22050)
  source.connect(ctx.destination)
  source.start(0)
}

// Whether this device plays sound effects (and the narrator). Stored per device;
// the projector and table screens start with it on, hero iPads with it off.
export function useSoundSetting(seat) {
  const [saved, setSaved] = useState(() => {
    try {
      return localStorage.getItem(SOUND_KEY)
    } catch {
      return null
    }
  })
  const on = saved ? saved === 'on' : LOUD_SEATS.includes(seat)
  const setOn = useCallback((value) => {
    setSaved(value ? 'on' : 'off')
    try {
      localStorage.setItem(SOUND_KEY, value ? 'on' : 'off')
    } catch {
      // Storage blocked: the choice lasts until the page reloads.
    }
    if (value) unlockAudio()
  }, [])
  return [on, setOn]
}

const MUSIC_KEY = 'ashardalon-companion/music'

// Whether this device plays background music (only while sound is on too). Stored per
// device; only the projector starts with it on.
export function useMusicSetting(seat) {
  const [saved, setSaved] = useState(() => {
    try {
      return localStorage.getItem(MUSIC_KEY)
    } catch {
      return null
    }
  })
  const on = saved ? saved === 'on' : seat === 'projector'
  const setOn = useCallback((value) => {
    setSaved(value ? 'on' : 'off')
    try {
      localStorage.setItem(MUSIC_KEY, value ? 'on' : 'off')
    } catch {
      // Storage blocked: the choice lasts until the page reloads.
    }
  }, [])
  return [on, setOn]
}

// True while sound is on but the browser is still waiting for a tap before it will
// play anything. Any tap or key press on the page unlocks it.
export function useAudioLocked(on) {
  const [locked, setLocked] = useState(false)
  useEffect(() => {
    if (!on) {
      setLocked(false)
      return
    }
    const ctx = audioContext()
    if (!ctx) return
    const update = () => setLocked(ctx.state !== 'running')
    const unlock = () => unlockAudio()
    update()
    ctx.addEventListener('statechange', update)
    for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlock)
    return () => {
      ctx.removeEventListener('statechange', update)
      for (const type of UNLOCK_EVENTS) window.removeEventListener(type, unlock)
    }
  }, [on])
  return locked
}
