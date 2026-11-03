import { useState } from 'react'
import { HERO_COLORS } from '../data/heroes.js'
import { sinceLastTurn } from '../state/sinceLastTurn.js'
import { Button } from './ui.jsx'

// "Got it" is remembered on this screen (not in the card), because switching tabs, flipping
// the board to 3D or the auto-reload after an update throws the card away and builds it
// again: it used to come back every time. The key is the turn plus the newest line on the
// card, so the same hero in another game (or a restarted one) still gets their card.
const KEY = 'ashardalon-companion/since-last-turn-seen'
let seenHere = {} // fallback when the browser blocks storage: lasts until the page reloads

function readSeen() {
  try {
    return { ...seenHere, ...JSON.parse(window.localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return seenHere
  }
}

function writeSeen(heroId, cardKey) {
  // One entry per hero: only this turn's card matters, so the list never grows.
  seenHere = { ...readSeen(), [heroId]: cardKey }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(seenHere))
  } catch {
    // Storage blocked: seenHere still keeps it put away until a reload.
  }
}

const keyFor = (state, card) => `${state.turn.round}-${state.turn.heroIndex}:${card.about[0]?.id ?? ''}:${card.others[0]?.id ?? ''}`

// At the top of a hero's iPad when their turn starts: what happened on the other heroes'
// turns, lines about this hero first. One tap puts it away until their next turn.
export default function SinceLastTurn({ state, hero }) {
  const [seen, setSeen] = useState(readSeen)
  const card = sinceLastTurn(state, hero.id)
  if (!card) return null
  const cardKey = keyFor(state, card)
  if (seen[hero.id] === cardKey) return null
  const dismiss = () => {
    writeSeen(hero.id, cardKey)
    setSeen(readSeen())
  }
  const color = HERO_COLORS[hero.color] ?? HERO_COLORS.amber
  return (
    <section className="rounded-3xl border-2 border-amber-500/60 bg-zinc-900 p-4" aria-label="Since your last turn">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-2xl font-bold text-amber-300">📜 Since your last turn</h2>
        <Button className="shrink-0" onClick={dismiss}>
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
