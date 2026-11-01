import { useEffect, useRef, useState } from 'react'
import { SQUARE } from './TileDrawing.jsx'
import { serverNow } from '../state/useSharedGame.js'
import { momentCoverMs } from './MomentOverlay.jsx'

// The green "+N" that floats up from a hero's token when the hero gains HP
// (board/healFx.js), drawn to the same scale as the red "-N" of an attack.

// A device that reconnects shouldn't replay a heal that is long over.
const STALE_MS = 8000
// The float itself (index.css heal-float).
export const HEAL_MS = 2200

// The heals showing on this board right now: [{ key, heroId, amount, delay }].
export function useHealFx(healFx, moment) {
  const [showing, setShowing] = useState([])
  const seen = useRef(new Set())
  const timers = useRef([])
  useEffect(() => {
    if (!healFx || seen.current.has(healFx.id)) return
    seen.current.add(healFx.id)
    const now = serverNow()
    if (now - healFx.at > STALE_MS) return
    // A heal that came with a roll or a card waits until that screen steps aside.
    const cover = healFx.momentId && moment?.id === healFx.momentId ? momentCoverMs(moment) : 0
    const delay = Math.max(0, healFx.at + cover - now)
    const added = healFx.heals.map((h) => ({ ...h, key: `${healFx.id}-${h.heroId}`, delay }))
    setShowing((list) => [...list.filter((s) => !added.some((a) => a.heroId === s.heroId)), ...added])
    const keys = new Set(added.map((a) => a.key))
    timers.current.push(setTimeout(() => setShowing((list) => list.filter((s) => !keys.has(s.key))), delay + HEAL_MS + 200))
  }, [healFx?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  return showing
}

// One floating "+N" over the token on `at`, with a soft green glow on the token.
export function HealFloat({ at, amount, delay, spin }) {
  const cx = at[0] * SQUARE + SQUARE / 2
  const cy = at[1] * SQUARE + SQUARE / 2
  const r = SQUARE / 2 - 3
  const size = r * 1.2
  return (
    <g pointerEvents="none" data-heal={amount} transform={spin ? `rotate(${-spin} ${cx} ${cy})` : undefined} style={{ '--fx-delay': `${delay}ms` }}>
      <circle cx={cx} cy={cy} r={r + 4} fill="#4ade80" fillOpacity="0.35" stroke="#86efac" strokeWidth="4" className="heal-glow" />
      <text
        x={cx}
        y={cy - r - 6}
        textAnchor="middle"
        fontSize={size}
        fontWeight="800"
        fill="#4ade80"
        stroke="#120a04"
        strokeWidth={size / 6}
        strokeLinejoin="round"
        paintOrder="stroke"
        className="heal-float"
      >
        +{amount}
      </text>
    </g>
  )
}
