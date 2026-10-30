import { useEffect, useState } from 'react'
import { enteredDungeon } from '../audio/sfx.js'
import { useGameStates } from '../state/useSharedGame.js'

// How long the doors take to swing open, from the lobby to the dungeon.
export const DOORS_MS = 1800

// When this screen last saw the heroes enter the dungeon. Used by App on every screen, so
// it hears the change while the lobby is still showing.
export function useDoorsOpening() {
  const [at, setAt] = useState(null)
  useGameStates((before, after) => {
    if (enteredDungeon(before, after)) setAt(Date.now())
  })
  useEffect(() => {
    if (!at) return
    const timer = setTimeout(() => setAt(null), DOORS_MS)
    return () => clearTimeout(timer)
  }, [at])
  return at
}

function Door({ side }) {
  return (
    <div className={`dungeon-door dungeon-door-${side} absolute inset-y-0 w-1/2 ${side === 'left' ? 'left-0' : 'right-0'}`}>
      {/* Iron bands and a ring on each half. */}
      {[18, 50, 82].map((top) => (
        <span key={top} className="absolute inset-x-0 h-[2.2%] bg-stone-950/70 shadow-[0_2px_0_rgb(120_113_108/0.35)]" style={{ top: `${top}%` }} />
      ))}
      <span className={`absolute top-1/2 h-[9vmin] w-[9vmin] -translate-y-1/2 rounded-full border-[1.4vmin] border-stone-900 ${side === 'left' ? 'right-[6%]' : 'left-[6%]'}`} />
    </div>
  )
}

// Two great stone doors cover the screen and swing apart onto the dungeon, as everyone
// enters from the lobby. Nothing to tap: it's over in a moment.
export default function DungeonDoors({ at }) {
  if (!at) return null
  return (
    <div key={at} aria-hidden="true" className="dungeon-doors pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      <span className="dungeon-doors-light absolute inset-0" />
      <Door side="left" />
      <Door side="right" />
    </div>
  )
}
