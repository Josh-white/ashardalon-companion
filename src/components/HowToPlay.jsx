import { useEffect, useState } from 'react'
import { HOW_TO_PLAY, howToPlayLine } from '../data/howToPlay.js'
import { unlockAudio } from '../audio/soundSetting.js'
import { Button } from './ui.jsx'

// How to play in a minute: six cards, one at a time, with Back/Next and Skip. "Read to me"
// has the narrator read the card, and every card after it as you page on. `voice` is the
// narrator ({ available, say }), or null. `onDone` closes it (Skip, or Done on the last card).
export function HowToPlayCards({ voice = null, onDone, big = false }) {
  const [at, setAt] = useState(0)
  const [reading, setReading] = useState(false)
  const card = HOW_TO_PLAY[at]
  const last = at === HOW_TO_PLAY.length - 1
  const canHear = Boolean(voice?.available)
  const read = (i) => voice?.say([howToPlayLine(HOW_TO_PLAY[i])], { force: true, replace: true })
  const go = (i) => {
    setAt(i)
    if (reading) read(i)
  }
  const startReading = () => {
    // The tap lets this device play sound, even with its game sound switched off.
    unlockAudio()
    setReading(true)
    read(at)
  }
  const finish = () => {
    if (reading) voice?.say([], { force: true, replace: true })
    onDone?.()
  }

  return (
    <div className={`flex flex-col gap-4 text-center ${big ? 'text-[1.6vw]' : ''}`} data-how-to-play="">
      <div className="flex justify-center gap-1.5" aria-label={`Card ${at + 1} of ${HOW_TO_PLAY.length}`}>
        {HOW_TO_PLAY.map((c, i) => (
          <button
            key={c.key}
            type="button"
            aria-label={c.title}
            className={`h-2.5 w-2.5 rounded-full ${i === at ? 'bg-amber-400' : 'bg-zinc-700'}`}
            onClick={() => go(i)}
          />
        ))}
      </div>
      <div key={card.key} className="moment-pop flex min-h-[16rem] flex-col justify-center gap-3">
        <div className={big ? 'text-[5vw]' : 'text-6xl'} aria-hidden>
          {card.pic}
        </div>
        <h3 className={`font-display font-bold text-amber-300 ${big ? 'text-[3vw]' : 'text-3xl'}`}>{card.title}</h3>
        {card.steps ? (
          <ul className="space-y-2 text-left">
            {card.steps.map(([step, what]) => (
              <li key={step} className="rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-zinc-200">
                <span className="font-bold text-zinc-50">{step}:</span> {what}
              </li>
            ))}
          </ul>
        ) : (
          <p className={`mx-auto max-w-prose text-zinc-100 ${big ? '' : 'text-xl'}`}>{card.text}</p>
        )}
        {card.steps && <p className="text-zinc-400">{card.text}</p>}
      </div>
      {canHear && !reading && (
        <button type="button" className="mx-auto rounded-full border border-amber-700 px-4 py-2 text-amber-200" onClick={startReading}>
          🔊 Read it to me
        </button>
      )}
      <div className="flex gap-2">
        {at > 0 ? (
          <Button variant="ghost" className="flex-1 py-3" onClick={() => go(at - 1)}>
            ← Back
          </Button>
        ) : (
          <Button variant="ghost" className="flex-1 py-3" onClick={finish}>
            Skip
          </Button>
        )}
        <Button variant="gold" className="flex-1 py-3 text-lg" onClick={last ? finish : () => go(at + 1)}>
          {last ? "Got it, let's play!" : 'Next →'}
        </Button>
      </div>
    </div>
  )
}

// The cards over the whole screen, from the "How to play" button.
export function HowToPlayOverlay({ voice, onClose, big = false }) {
  useEffect(() => {
    const key = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[35] flex items-center justify-center overflow-y-auto bg-zinc-950/90 p-4" role="dialog" aria-label="How to play">
      <div className={`w-full rounded-3xl border-2 border-amber-700/70 bg-zinc-950 p-5 shadow-2xl ${big ? 'max-w-[60vw]' : 'max-w-md'}`}>
        <p className="mb-2 text-center text-xs font-bold tracking-widest text-amber-400 uppercase">How to play</p>
        <HowToPlayCards voice={voice} onDone={onClose} big={big} />
      </div>
    </div>
  )
}

// A "📖 How to play" button that opens the cards.
export function HowToPlayButton({ voice = null, className = '', big = false }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="ghost" className={className} onClick={() => setOpen(true)}>
        📖 How to play
      </Button>
      {open && <HowToPlayOverlay voice={voice} big={big} onClose={() => setOpen(false)} />}
    </>
  )
}

// On "Ready your hero", a player who has never played gets the cards right there, open.
// Hidden again with Skip or at the end. Waits a moment after typing stops, so it doesn't
// pop open and shut while a known name is half typed.
export function NewPlayerHowTo({ isNew, voice }) {
  const [settled, setSettled] = useState(null)
  const [closed, setClosed] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSettled(isNew), 1200)
    return () => clearTimeout(t)
  }, [isNew])
  if (closed || !settled || !isNew) return null
  return (
    <section className="rounded-2xl border border-amber-700/70 bg-gradient-to-b from-amber-950/50 to-zinc-950/80 p-4">
      <p className="mb-2 text-center text-xs font-bold tracking-widest text-amber-400 uppercase">New to Wrath of Ashardalon? Here&apos;s how to play</p>
      <HowToPlayCards voice={voice} onDone={() => setClosed(true)} />
    </section>
  )
}
