import { useEffect, useState } from 'react'
import { playerFigures, playerKey } from '../data/workshop.js'
import { builderFigures } from '../data/forge.js'

// The players' own figures that they turned on for the game: from the 🧙 Model Workshop
// ({ url, tweaks }) or the 🛠️ Hero Builder ({ recipe }), by player: { "colton": {…} }. Read from the Pi once per screen, and again every few
// minutes so a figure turned on mid-game shows up. A friend's screen can't read the workshop
// (it's the family's), so it just gets none.
const EVERY_MS = 5 * 60 * 1000
let cached = {}
let fetchedAt = 0
const listeners = new Set()

async function refresh() {
  fetchedAt = Date.now()
  try {
    const read = (path) => fetch(path, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null), () => null)
    const [workshop, forge] = await Promise.all([read('/workshop.json'), read('/forge.json')])
    if (!workshop && !forge) return
    // The Pi keeps one on per player; were both on, the Hero Builder's wins.
    const next = { ...playerFigures(workshop?.requests ?? []), ...builderFigures(forge?.figures ?? []) }
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

// A hero's look on the 3D board: the player's own figure when they have one on.
export function withPlayerFigure(figure, own) {
  const mine = figure.kind === 'hero' ? own[playerKey(figure.player)] : null
  if (!mine) return figure
  if (mine.recipe) return { ...figure, model: { recipe: mine.recipe, gear: [], height: 1 } }
  return { ...figure, model: { url: mine.url, tweaks: mine.tweaks, gear: [], height: 1 } }
}
