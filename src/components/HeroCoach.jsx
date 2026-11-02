import { useState } from 'react'
import { coachFor, coachLine } from '../data/coaches.js'
import { HERO_COLORS, templateFor } from '../data/heroes.js'
import { unlockAudio } from '../audio/soundSetting.js'

// The hero coach on "Ready your hero": a veteran's tips for the hero, read aloud in the
// coach's own voice. A player new to the hero gets it open (and it plays as they pick the
// hero, see Setup.jsx); anyone else can open it and hear it again. `isNew` is null while
// the Pi's records load. `voice` is the narrator ({ available, say, quiet }), or null.
export default function HeroCoach({ heroKey, isNew, voice }) {
  const coach = coachFor(heroKey)
  const [open, setOpen] = useState(null)
  // Settled once the records load, so the coach doesn't open and close while a name is typed.
  const [firstNew, setFirstNew] = useState(isNew)
  if (firstNew === null && isNew !== null) setFirstNew(isNew)
  if (!coach) return null
  const color = HERO_COLORS[templateFor(heroKey)?.color] ?? HERO_COLORS.sky
  const shown = open ?? Boolean(firstNew)
  const canHear = Boolean(voice?.available)
  const hear = () => {
    setOpen(true)
    // The tap lets this iPad play sound, even with its game sound switched off.
    unlockAudio()
    // One telling at a time: a second tap while the coach talks does nothing.
    if (voice.quiet()) voice.say([coachLine(heroKey)], { force: true })
  }

  if (!shown) {
    return (
      <button
        type="button"
        className="flex w-full items-center gap-3 rounded-xl border border-amber-900/60 bg-zinc-950/70 px-4 py-3 text-left transition active:scale-[0.98]"
        onClick={canHear ? hear : () => setOpen(true)}
      >
        <span className="text-2xl" aria-hidden>
          🎓
        </span>
        <span className="mr-auto">
          <span className="block font-display text-lg font-bold text-amber-200">{canHear ? `Hear ${coach.coach}'s tips` : `${coach.coach}'s tips`}</span>
          <span className="block text-sm text-zinc-400">{coach.role}</span>
        </span>
        <span className="text-zinc-500">{canHear ? '🔊' : '›'}</span>
      </button>
    )
  }

  return (
    <section className="rounded-2xl border border-amber-700/70 bg-gradient-to-b from-amber-950/60 to-zinc-950/80 p-4 shadow-[0_0_30px_rgb(245_158_11/0.2)]">
      {firstNew && <p className="mb-1 text-xs font-bold tracking-widest text-amber-400 uppercase">New hero for you! Meet your coach</p>}
      <div className="flex items-start gap-3">
        <span className="text-4xl" aria-hidden>
          🎓
        </span>
        <div className="mr-auto">
          <h3 className={`font-display text-2xl font-bold ${color.text}`}>{coach.coach}</h3>
          <p className="text-sm text-zinc-400">{coach.role}</p>
        </div>
        <button type="button" className="-my-1 py-1 text-sm text-zinc-400 underline" onClick={() => setOpen(false)}>
          Hide
        </button>
      </div>
      <ul className="mt-3 space-y-2 text-lg text-amber-50">
        {coach.tips.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
      {canHear && (
        <button
          type="button"
          className="mt-4 w-full rounded-full border-2 border-amber-600 bg-amber-950/60 px-4 py-3 font-display text-xl font-bold text-amber-200 transition active:scale-[0.98]"
          onClick={hear}
        >
          🔊 Hear {coach.coach}
        </button>
      )}
    </section>
  )
}
