import { unlockAudio } from '../audio/soundSetting.js'

// Turns sound effects on or off for this device.
export function SoundToggle({ on, setOn, className = '' }) {
  return (
    <button
      type="button"
      className={`rounded-xl px-3 py-2 transition hover:bg-zinc-800 active:scale-95 ${on ? 'text-zinc-300' : 'text-zinc-500'} ${className}`}
      onClick={() => setOn(!on)}
      aria-pressed={on}
    >
      {on ? '🔊 Sound on' : '🔇 Sound off'}
    </button>
  )
}

// Browsers won't play anything until someone taps the page. While sound is on and
// still blocked, this asks for that tap (any tap on the page works).
export function TapForSound({ locked, big = false }) {
  if (!locked) return null
  return (
    <button
      type="button"
      onClick={unlockAudio}
      className={`fixed bottom-4 right-4 z-50 animate-pulse rounded-full border border-amber-500 bg-zinc-900/95 font-semibold text-amber-300 shadow-lg ${
        big ? 'px-[1.5vw] py-[1vh] text-[1.4vw]' : 'px-4 py-2 text-sm'
      }`}
    >
      🔈 Tap for sound
    </button>
  )
}
