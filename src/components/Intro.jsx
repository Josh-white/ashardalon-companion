import { useCallback, useEffect, useRef, useState } from 'react'
import { duckMusic } from '../audio/music.js'
import { INTRO_LINE } from '../audio/narration.js'
import { play } from '../audio/sfx.js'
import { unlockAudio, voicePlayer, voiceSpeaking } from '../audio/soundSetting.js'
import { artUrl, useArt } from '../state/useArt.js'

const SEEN_KEY = 'ashardalon-companion/intro-seen'
// How long the dragon takes to wake after the tap, before the app shows.
const WAKE_MS = 3200
// The projector may have nobody near it to tap, so it moves on by itself (quietly).
const PROJECTOR_WAIT_MS = 20000

// The intro plays once each time the app is opened in a tab, not after every reload
// (screens reload themselves when the app is updated). Add ?intro to the address to
// see it again.
export function useIntro() {
  const [seen, setSeen] = useState(() => {
    try {
      if (new URLSearchParams(window.location.search).has('intro')) return false
      return sessionStorage.getItem(SEEN_KEY) === 'yes'
    } catch {
      return false
    }
  })
  const done = useCallback(() => {
    setSeen(true)
    try {
      sessionStorage.setItem(SEEN_KEY, 'yes')
    } catch {
      // Storage blocked: the intro shows again on the next reload.
    }
  }, [])
  return [!seen, done]
}

// The narrator's line has to start inside the tap, or an iPad won't play it.
function speakIntro() {
  const player = voicePlayer()
  if (!player || voiceSpeaking()) return
  voiceSpeaking(true)
  const done = () => voiceSpeaking(false)
  player.onended = done
  player.onerror = done
  player.onplaying = () => {
    if (Number.isFinite(player.duration)) duckMusic(player.duration * 1000)
  }
  player.src = `/narrate?voice=${INTRO_LINE.voice}&text=${encodeURIComponent(INTRO_LINE.text)}`
  player.play().catch(done)
}

const EMBERS = Array.from({ length: 14 }, (_, i) => ({
  left: `${(i * 37 + 11) % 97}%`,
  delay: `${(i * 1.7) % 7}s`,
  size: 3 + ((i * 5) % 4),
}))

// "The Dragon Wakes": the first thing every screen shows. Ashardalon's eyes open in
// the dark while embers drift up; a tap wakes him (roar and the narrator, where this
// screen's sound is on) and lets the browser play sound from then on.
export default function DragonIntro({ projector = false, soundOn, onDone }) {
  const art = useArt()
  const dragon = artUrl(art, 'villain-ashardalon')
  const [waking, setWaking] = useState(false)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    if (!projector || waking) return
    const wait = setTimeout(onDone, PROJECTOR_WAIT_MS)
    return () => clearTimeout(wait)
  }, [projector, waking, onDone])

  const tap = () => {
    // A second tap skips the rest.
    if (waking) return onDone()
    unlockAudio()
    if (soundOn) {
      play([['roar', 0], ['fire', 400]])
      speakIntro()
    }
    setWaking(true)
    timer.current = setTimeout(onDone, WAKE_MS)
  }

  return (
    <button
      type="button"
      onClick={tap}
      aria-label={waking ? 'Skip the intro' : 'Wake the dragon'}
      className={`intro fixed inset-0 z-[60] flex h-full w-full cursor-pointer flex-col items-center justify-center overflow-hidden text-center select-none ${waking ? 'intro-waking' : ''}`}
    >
      {dragon && <img src={dragon} alt="" draggable={false} className="intro-dragon pointer-events-none absolute" />}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0">
        {EMBERS.map((e, i) => (
          <span key={i} className="intro-ember" style={{ left: e.left, animationDelay: e.delay, width: e.size, height: e.size }} />
        ))}
      </span>
      <svg aria-hidden="true" viewBox="0 0 400 80" className="intro-eyes pointer-events-none relative">
        <defs>
          <radialGradient id="introEye" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="45%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#b91c1c" stopOpacity="0" />
          </radialGradient>
        </defs>
        {[110, 290].map((x) => (
          <g key={x} className="intro-eye">
            <ellipse cx={x} cy="40" rx="62" ry="20" fill="url(#introEye)" />
            <ellipse cx={x} cy="40" rx="5" ry="18" fill="#1c0603" />
          </g>
        ))}
      </svg>
      <span className="relative mt-[4vh] block font-display text-[clamp(0.9rem,2vw,1.6rem)] tracking-[0.35em] text-orange-300 uppercase">
        Dungeons &amp; Dragons
      </span>
      <span className="intro-title relative block px-4 font-display text-[clamp(2.6rem,8vw,7rem)] leading-none font-black text-amber-400">
        Wrath of Ashardalon
      </span>
      <span className="relative mt-[2vh] block max-w-[80vw] font-display text-[clamp(1.1rem,2.4vw,2rem)] text-amber-100/90 italic">
        “Beneath Firestorm Peak, the red dragon stirs. Who dares enter his halls?”
      </span>
      <span className="intro-cta relative mt-[6vh] inline-flex items-center gap-3 rounded-full border-2 border-amber-400 bg-gradient-to-b from-amber-700 to-orange-900 px-[2.4em] py-[0.8em] font-display text-[clamp(1.3rem,3vw,2.4rem)] font-bold text-amber-50">
        {waking ? 'The dragon wakes…' : projector ? 'Click to wake the dragon' : 'Tap to wake the dragon'}
      </span>
    </button>
  )
}
