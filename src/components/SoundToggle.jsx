import { unlockAudio } from '../audio/soundSetting.js'
import { useStayAwakeSetting } from '../state/stayAwake.js'

// Turns sound effects and the narrator on or off for this device. `elsewhere` says
// the projector is playing them while this screen is quiet.
export function SoundToggle({ on, setOn, elsewhere = false, className = '' }) {
  return (
    <button
      type="button"
      className={`rounded-xl px-3 py-2 transition hover:bg-zinc-800 active:scale-95 ${on ? 'text-zinc-300' : 'text-zinc-500'} ${className}`}
      onClick={() => setOn(!on)}
      aria-pressed={on}
      title={elsewhere ? 'The projector is playing the sound. Tap to play it on this screen too.' : undefined}
    >
      {on ? '🔊 Sound on' : elsewhere ? '🔇 Sound on projector' : '🔇 Sound off'}
    </button>
  )
}

// Turns background music on or off for this device. It only plays while sound is on.
export function MusicToggle({ on, setOn, soundOn, className = '' }) {
  return (
    <button
      type="button"
      className={`rounded-xl px-3 py-2 transition hover:bg-zinc-800 active:scale-95 ${on && soundOn ? 'text-zinc-300' : 'text-zinc-500'} ${className}`}
      onClick={() => setOn(!on)}
      aria-pressed={on}
      title={soundOn ? undefined : 'Turn sound on to hear the music'}
    >
      {on ? '🎵 Music on' : '🎵 Music off'}
    </button>
  )
}

// Keeps this screen from going to sleep during the game (on by default on every screen).
export function StayAwakeToggle({ className = '' }) {
  const [on, setOn] = useStayAwakeSetting()
  return (
    <button
      type="button"
      className={`rounded-xl px-3 py-2 transition hover:bg-zinc-800 active:scale-95 ${on ? 'text-zinc-300' : 'text-zinc-500'} ${className}`}
      onClick={() => setOn(!on)}
      aria-pressed={on}
      title={on ? 'This screen stays on during the game. Tap to let it sleep.' : 'Tap to keep this screen from going to sleep.'}
    >
      {on ? '☀️ Screen stays on' : '🌙 Screen can sleep'}
    </button>
  )
}

// Browsers won't play anything until someone taps the page, and iPads ask again
// after every reload or nap. While sound is on and still blocked, this asks for that
// tap (any tap on the page works). On a hero's iPad it's a big bar across the top,
// so it isn't missed.
export function TapForSound({ locked, big = false, ipad = false }) {
  if (!locked) return null
  if (ipad) {
    return (
      <button
        type="button"
        onClick={unlockAudio}
        className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 border-b-2 border-amber-500 bg-amber-950/95 px-4 py-4 text-lg font-bold text-amber-200 shadow-xl"
      >
        <span className="animate-pulse text-2xl">🔊</span> Tap here to start sound on this device
      </button>
    )
  }
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
