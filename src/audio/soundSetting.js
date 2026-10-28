import { useCallback, useEffect, useState } from 'react'

const SOUND_KEY = 'ashardalon-companion/sound'

// Until someone flips the switch on a device, the projector plays the sound, and the
// table screen plays it only when no projector screen is open (a one-screen game).
// Hero iPads stay quiet: four iPads playing the same sound a beat apart is just noise.
export function soundOnByDefault(seat, projectorOpen) {
  if (seat === 'projector') return true
  if (seat === 'table') return !projectorOpen
  return false
}

// Older iPads only count touchend as a tap that may start sound.
export const TAP_EVENTS = ['pointerdown', 'touchend', 'keydown']

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
// iPads also need something to actually play inside the tap. The narrator plays
// through the same audio context, so this one unlock covers everything.
export function unlockAudio() {
  // Sound plays even with the iPad's silent mode on (Safari 16.4 and later).
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback'
  } catch {
    // Older Safari: nothing to set.
  }
  const ctx = audioContext()
  if (ctx) {
    if (ctx.state !== 'running') ctx.resume().catch(() => {})
    const source = ctx.createBufferSource()
    source.buffer = ctx.createBuffer(1, 1, 22050)
    source.connect(ctx.destination)
    source.start(0)
  }
}

// Whether this device plays sound effects and the narrator. Stored per device once
// someone flips the switch; until then see soundOnByDefault.
export function useSoundSetting(seat, projectorOpen) {
  const [saved, setSaved] = useState(() => {
    try {
      return localStorage.getItem(SOUND_KEY)
    } catch {
      return null
    }
  })
  const on = saved ? saved === 'on' : soundOnByDefault(seat, projectorOpen)
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
    for (const type of TAP_EVENTS) window.addEventListener(type, unlock)
    return () => {
      ctx.removeEventListener('statechange', update)
      for (const type of TAP_EVENTS) window.removeEventListener(type, unlock)
    }
  }, [on])
  return locked
}
