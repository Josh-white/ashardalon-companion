import { useEffect, useId, useState } from 'react'
import { SQUARE } from './TileDrawing.jsx'

// Torchlight over the virtual board: the dungeon sits in the dark and each hero carries a
// warm pool of light, the hero whose turn it is the biggest. Lava Flow tiles glow too.
// Figures, lit squares and badges are drawn on top, so nothing you tap ever hides.
//
// The darkness is one masked rect: every light is a soft circle cut out of it, so pools
// add up where heroes stand close. Torches flicker by fading their warm glow (opacity only,
// which phones and iPads draw cheaply). With Reduce Motion on, or on a slow device, the
// light stands still; 🔥 on the board turns it off on that screen.

const KEY = 'ashardalon-torchlight'
const DARK = 0.66

export function torchlightWanted() {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

export function useTorchlight() {
  const [on, setOn] = useState(torchlightWanted)
  const toggle = () => {
    setOn(!on)
    try {
      localStorage.setItem(KEY, on ? 'off' : 'on')
    } catch {
      // Private mode: the switch lasts until the page reloads.
    }
  }
  return [on, toggle]
}

// Still light on a Reduce Motion setting or a device with few cores or little memory.
function useStill() {
  const query = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : null
  const [reduced, setReduced] = useState(Boolean(query?.matches))
  useEffect(() => {
    if (!query) return undefined
    const change = () => setReduced(query.matches)
    query.addEventListener?.('change', change)
    return () => query.removeEventListener?.('change', change)
  }, [query])
  const nav = typeof navigator !== 'undefined' ? navigator : {}
  const slow = (nav.hardwareConcurrency && nav.hardwareConcurrency <= 2) || (nav.deviceMemory && nav.deviceMemory < 2)
  return reduced || Boolean(slow)
}

// Where the light comes from, in board units: [{ id, cx, cy, r, kind }].
export function lightSources({ heroes, tokens, activeId, markers }) {
  const lights = []
  for (const h of heroes) {
    const at = tokens[h.id]
    if (!at) continue
    const active = h.id === activeId
    const r = SQUARE * (h.hp <= 0 ? 1.4 : active ? 3.4 : 2.4)
    lights.push({ id: h.id, cx: at[0] * SQUARE + SQUARE / 2, cy: at[1] * SQUARE + SQUARE / 2, r, kind: active ? 'active' : 'hero' })
  }
  for (const m of markers) {
    if (m.marker.cardId !== 'lava-flow') continue
    for (const tile of m.tiles) {
      const sq = m.squares.filter((s) => s.area === tile)
      if (sq.length === 0) continue
      const cx = (sq.reduce((n, s) => n + s.x + 0.5, 0) / sq.length) * SQUARE
      const cy = (sq.reduce((n, s) => n + s.y + 0.5, 0) / sq.length) * SQUARE
      lights.push({ id: `${m.marker.id}-${tile}`, cx, cy, r: SQUARE * 3, kind: 'lava' })
    }
  }
  return lights
}

const GLOW = { active: '#fbbf24', hero: '#f59e0b', lava: '#f97316' }

export default function Torchlight({ bounds, lights }) {
  const id = useId().replace(/:/g, '')
  const still = useStill()
  return (
    <g pointerEvents="none" data-torchlight={still ? 'still' : 'flicker'}>
      <defs>
        <radialGradient id={`${id}cut`}>
          <stop offset="0" stopColor="#000" stopOpacity="1" />
          <stop offset="0.45" stopColor="#000" stopOpacity="0.85" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        {Object.entries(GLOW).map(([kind, color]) => (
          <radialGradient key={kind} id={`${id}${kind}`}>
            <stop offset="0" stopColor={color} stopOpacity="0.32" />
            <stop offset="0.6" stopColor={color} stopOpacity="0.1" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </radialGradient>
        ))}
        <mask id={`${id}dark`} maskUnits="userSpaceOnUse" x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h}>
          <rect x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h} fill="#fff" />
          {lights.map((l) => (
            <circle key={l.id} cx={l.cx} cy={l.cy} r={l.r} fill={`url(#${id}cut)`} />
          ))}
        </mask>
      </defs>
      <rect x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h} fill="#05060a" opacity={DARK} mask={`url(#${id}dark)`} />
      {lights.map((l, i) => (
        <circle
          key={l.id}
          cx={l.cx}
          cy={l.cy}
          r={l.r}
          fill={`url(#${id}${l.kind})`}
          className={still ? undefined : 'torch-flicker'}
          style={still ? undefined : { animationDelay: `${-(i * 0.73) % 3}s`, animationDuration: l.kind === 'lava' ? '4.5s' : '2.6s' }}
        />
      ))}
    </g>
  )
}
