import { useEffect, useState } from 'react'
import { playerFigures, playerKey } from '../data/workshop.js'

// The players' own figures from the 🧙 Model Workshop that they turned on ("Use it in the
// game"): { "colton": { url, tweaks } }. Read from the Pi once per screen, and again every few
// minutes so a figure turned on mid-game shows up. A friend's screen can't read the workshop
// (it's the family's), so it just gets none.
const EVERY_MS = 5 * 60 * 1000
let cached = {}
let fetchedAt = 0
const listeners = new Set()

async function refresh() {
  fetchedAt = Date.now()
  try {
    const res = await fetch('/workshop.json', { cache: 'no-store' })
    if (!res.ok) return
    const next = playerFigures((await res.json()).requests)
    if (JSON.stringify(next) === JSON.stringify(cached)) return
    cached = next
    for (const l of listeners) l(cached)
  } catch {
    // No Pi (the tests, a dev server without one): no figures.
  }
}

export function useWorkshopFigures() {
  const [figures, setFigures] = useState(cached)
  useEffect(() => {
    listeners.add(setFigures)
    if (Date.now() - fetchedAt > EVERY_MS / 5) refresh()
    const timer = setInterval(refresh, EVERY_MS)
    return () => {
      listeners.delete(setFigures)
      clearInterval(timer)
    }
  }, [])
  return figures
}

// A hero's look on the 3D board: the player's own workshop figure when they have one on.
export function withPlayerFigure(figure, own) {
  const mine = figure.kind === 'hero' ? own[playerKey(figure.player)] : null
  return mine ? { ...figure, model: { url: mine.url, tweaks: mine.tweaks, gear: [], height: 1 } } : figure
}
