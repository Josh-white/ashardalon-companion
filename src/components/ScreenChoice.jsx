import { unlockAudio } from '../audio/soundSetting.js'

// A laptop or TV (a mouse and a wide window) is most likely the big screen.
export function looksLikeBigScreen() {
  try {
    return window.matchMedia('(pointer: fine) and (min-width: 1100px)').matches
  } catch {
    return false
  }
}

function Door({ icon, title, text, lit, onClick }) {
  return (
    <button
      type="button"
      onClick={() => {
        unlockAudio()
        onClick()
      }}
      className={`screen-door flex w-full items-center gap-4 border-2 px-6 py-5 text-left transition active:scale-[0.98] ${
        lit ? 'border-amber-400 shadow-[0_0_28px_rgb(245_158_11/0.35)]' : 'border-amber-900/80 hover:border-amber-600'
      }`}
    >
      <span aria-hidden="true" className="w-12 text-center text-4xl">
        {icon}
      </span>
      <span>
        <span className="block font-display text-2xl font-bold text-amber-50 sm:text-3xl">{title}</span>
        <span className="text-zinc-300 sm:text-lg">{text}</span>
      </span>
    </button>
  )
}

// "Who stands here?": right after the intro, each new screen says what it's for. The
// answer is remembered, so a screen only asks once. A wide screen with a mouse has the
// big screen lit up first; an iPad or phone has the hero. No demo game (onDemo null) while a
// campaign is going, since it would take the campaign's place.
export default function ScreenChoice({ onHero, onBigScreen, onSolo, onDemo, onArt }) {
  const big = looksLikeBigScreen()
  const hero = <Door key="hero" icon="🛡️" title="I'm a hero" text="Pick your hero on this screen" lit={!big} onClick={onHero} />
  const screen = <Door key="big" icon="📽️" title="The big screen" text="Projector or TV: shows the whole party" lit={big} onClick={onBigScreen} />
  return (
    <div className="mx-auto flex min-h-[85vh] max-w-xl flex-col items-center justify-center gap-6 p-4 text-center sm:p-8">
      <header>
        <h1 className="lobby-title font-display text-5xl font-black text-amber-400 sm:text-6xl">Who stands here?</h1>
        <p className="mt-3 font-display text-xl text-amber-100/90 italic">The dragon wants to know who he's facing.</p>
      </header>
      <div className="flex w-full flex-col gap-4">
        {big ? [screen, hero] : [hero, screen]}
        {onSolo && <Door icon="🗺️" title="Play solo" text="This screen runs one to five heroes on a virtual board" onClick={onSolo} />}
      </div>
      <p className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-zinc-400">
        {onDemo && (
          <button type="button" className="underline" onClick={onDemo}>
            Start a demo game
          </button>
        )}
        {onArt && (
          <button type="button" className="underline" onClick={onArt}>
            📷 Add photos of your cards
          </button>
        )}
      </p>
    </div>
  )
}
