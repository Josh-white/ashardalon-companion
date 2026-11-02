import { useEffect, useRef, useState } from 'react'

// The tiles laid since this screen last drew the board, so they can glow for a moment
// (Board.jsx, NewTileGlow). A tile is known by its uid, tile and spot together, since a new
// game hands out the same uids again.
const tileKey = (t) => `${t.uid}|${t.tileId}|${t.at.join(',')}`
// The board first moves to make room (the glide in useBoardZoom, 700 ms, or the scroll to
// the new tile when zoomed in), holds still a moment so everyone sees where it'll go, and
// only then does the tile drop in (JJ's ask). Figures on it (the monster it brought) appear
// once it's down, then the glow flashes.
export const LAND_MS = 1300
export const DROP_MS = 600
export const GLOW_MS = LAND_MS + DROP_MS + 3600
// CSS custom properties for the drop and glow (index.css: .tile-drop, .figure-arrive).
export const dropStyle = { '--land-delay': `${LAND_MS}ms`, '--drop-ms': `${DROP_MS}ms`, '--landed': `${LAND_MS + DROP_MS}ms` }
// Coming back to the board (another tab on an iPad, the art screen), only a few tiles laid
// meanwhile glow; more than that is a different game, or a long time away.
const CATCH_UP = 4

// What this page saw last, so a board drawn again later still knows what's new.
let seenOnPage = null

export function useFreshTiles(tiles) {
  const keys = (tiles ?? []).map(tileKey)
  const seen = useRef(null)
  const [fresh, setFresh] = useState(null)
  const sig = keys.join(';')
  useEffect(() => {
    if (!tiles) return
    const first = seen.current === null
    const before = first ? seenOnPage : seen.current
    seen.current = new Set(keys)
    seenOnPage = seen.current
    if (!before) return
    const added = tiles.filter((t) => !before.has(tileKey(t)))
    if (added.length === 0 || (first && added.length > CATCH_UP) || added.length === tiles.length) return
    setFresh({ key: sig, uids: added.map((t) => t.uid) })
  }, [sig]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!fresh) return
    const timer = setTimeout(() => setFresh(null), GLOW_MS)
    return () => clearTimeout(timer)
  }, [fresh?.key]) // eslint-disable-line react-hooks/exhaustive-deps
  // Once the tile is down it's an ordinary tile again, so a hero stepping onto it while it
  // still glows doesn't pop in like the monster it brought.
  useEffect(() => {
    if (!fresh || fresh.landed) return
    const timer = setTimeout(() => setFresh((f) => (f && f.key === fresh.key ? { ...f, landed: true } : f)), LAND_MS + DROP_MS + 400)
    return () => clearTimeout(timer)
  }, [fresh?.key]) // eslint-disable-line react-hooks/exhaustive-deps
  return fresh
}
