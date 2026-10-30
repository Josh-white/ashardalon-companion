import { useState } from 'react'
import { HERO_COLORS } from '../data/heroes.js'
import { sinceLastTurn } from '../state/sinceLastTurn.js'
import { Button } from './ui.jsx'

// At the top of a hero's iPad when their turn starts: what happened on the other heroes'
// turns, lines about this hero first. One tap puts it away until their next turn.
export default function SinceLastTurn({ state, hero }) {
  const turnKey = `${state.turn.round}-${state.turn.heroIndex}`
  const [dismissed, setDismissed] = useState(null)
  const card = dismissed === turnKey ? null : sinceLastTurn(state, hero.id)
  if (!card) return null
  const color = HERO_COLORS[hero.color] ?? HERO_COLORS.amber
  return (
    <section className="rounded-3xl border-2 border-amber-500/60 bg-zinc-900 p-4" aria-label="Since your last turn">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-2xl font-bold text-amber-300">📜 Since your last turn</h2>
        <Button className="shrink-0" onClick={() => setDismissed(turnKey)}>
          Got it
        </Button>
      </div>
      {card.about.length > 0 && (
        <>
          <h3 className={`mt-3 text-sm font-bold uppercase tracking-widest ${color.text}`}>About {hero.name}</h3>
          <ul className="mt-1 space-y-1 text-base text-zinc-100">
            {card.about.map((entry) => (
              <li key={entry.id}>• {entry.text}</li>
            ))}
          </ul>
        </>
      )}
      {card.others.length > 0 && (
        <>
          <h3 className="mt-3 text-sm font-bold uppercase tracking-widest text-zinc-500">Around the dungeon</h3>
          <ul className="mt-1 space-y-1 text-sm text-zinc-300">
            {card.others.map((entry) => (
              <li key={entry.id}>• {entry.text}</li>
            ))}
          </ul>
          {card.moreOthers > 0 && <p className="mt-1 text-sm text-zinc-500">…and {card.moreOthers} more in the Log tab.</p>}
        </>
      )}
    </section>
  )
}
