import { useEffect, useId, useState } from 'react'
import { Scorch, SQUARE, squareNoise } from './TileDrawing.jsx'

// What a hazard does to the floor of its tile on the virtual board: Lava Flow turns it into
// slow-moving lava, Volcanic Vapors fills it with drifting fog and bubbles, a Cave-in leaves
// rubble and a Pit opens a hole. Only these hazard tiles move, so the board stays light.
// With Reduce Motion on, the same pictures stand still.

const FLOORS = new Set(['lava-flow', 'volcanic-vapors', 'cave-in', 'pit'])

export function hasHazardFloor(marker) {
  return FLOORS.has(marker.cardId)
}

function useReducedMotion() {
  const query = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : null
  const [reduced, setReduced] = useState(Boolean(query?.matches))
  useEffect(() => {
    if (!query) return undefined
    const change = () => setReduced(query.matches)
    query.addEventListener?.('change', change)
    return () => query.removeEventListener?.('change', change)
  }, [query])
  return reduced
}

function Lava({ id, box, squares, still }) {
  return (
    <g>
      <defs>
        <pattern id={`${id}lava`} width="80" height="80" patternUnits="userSpaceOnUse">
          <rect width="80" height="80" fill="#b91c1c" />
          <path d="M0 18C20 8 40 30 80 16V40C50 52 30 30 0 44Z" fill="#f97316" />
          <path d="M0 30C22 24 38 40 80 28V34C46 44 28 32 0 37Z" fill="#fde047" />
          <path d="M0 62C24 54 52 72 80 60V70C50 80 26 64 0 74Z" fill="#ea580c" />
          <path d="M8 4l10 3-4 6-9-2zM50 46l12 2-3 7-11-3zM60 6l8 4-6 4z" fill="#3b0a07" opacity="0.85" />
          {!still && <animateTransform attributeName="patternTransform" type="translate" from="0 0" to="80 40" dur="7s" repeatCount="indefinite" />}
        </pattern>
      </defs>
      <rect x={box.x0} y={box.y0} width={box.x1 - box.x0} height={box.y1 - box.y0} fill={`url(#${id}lava)`} />
      {squares.map((sq) => (
        <rect key={`${sq.x},${sq.y}`} x={sq.x * SQUARE + 0.5} y={sq.y * SQUARE + 0.5} width={SQUARE - 1} height={SQUARE - 1} fill="none" stroke="#3b0a07" strokeOpacity="0.5" />
      ))}
      <rect className="hazard-glow" x={box.x0} y={box.y0} width={box.x1 - box.x0} height={box.y1 - box.y0} fill="#fde047" opacity="0.15" />
    </g>
  )
}

function Vapors({ id, box, still }) {
  const [cx, cy] = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2]
  const [w, h] = [box.x1 - box.x0, box.y1 - box.y0]
  const bubbles = Math.max(2, Math.round(w / 32))
  return (
    <g>
      <defs>
        <radialGradient id={`${id}fog`}>
          <stop offset="0" stopColor="#d9f99d" stopOpacity="0.75" />
          <stop offset="1" stopColor="#84cc16" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x={box.x0} y={box.y0} width={w} height={h} fill="#65a30d" opacity="0.3" />
      <ellipse className="hazard-fog" cx={cx - w / 5} cy={cy - h / 10} rx={w * 0.45} ry={h * 0.26} fill={`url(#${id}fog)`} />
      <ellipse className="hazard-fog hazard-fog-back" cx={cx + w / 5} cy={cy + h / 6} rx={w * 0.4} ry={h * 0.24} fill={`url(#${id}fog)`} />
      {!still &&
        Array.from({ length: bubbles }, (_, i) => {
          const bx = box.x0 + 18 + (i * (w - 36)) / Math.max(1, bubbles - 1)
          const dur = `${2.6 + (i % 3) * 0.4}s`
          return (
            <circle key={i} cx={bx} cy={box.y1 - 8} r={3 + (i % 2)} fill="none" stroke="#ecfccb" strokeWidth="1.5" opacity="0">
              <animate attributeName="cy" from={box.y1 - 8} to={box.y0 + 12} dur={dur} begin={`${i * 0.5}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" values="0;1;0" dur={dur} begin={`${i * 0.5}s`} repeatCount="indefinite" />
            </circle>
          )
        })}
    </g>
  )
}

function Rubble({ squares, seed }) {
  const shades = ['#78716c', '#57534e', '#a8a29e']
  return (
    <g>
      {squares.flatMap((sq) =>
        shades.map((fill, k) => {
          const r = squareNoise(seed, sq.x, sq.y, k + 5)
          const px = sq.x * SQUARE + 8 + r * 24
          const py = sq.y * SQUARE + 8 + squareNoise(seed, sq.y, sq.x, k) * 24
          const z = 5 + r * 6
          return <path key={`${sq.x},${sq.y},${k}`} d={`M${px - z} ${py}l${z * 0.6} ${-z}l${z} ${z * 0.3}l${-z * 0.2} ${z}z`} fill={fill} stroke="#1c1917" />
        }),
      )}
    </g>
  )
}

// The hole sits where four floor squares meet, away from the scorch mark so new monsters
// still have their spot.
function pitSpot(floor) {
  const at = new Set(floor.map((sq) => `${sq.x},${sq.y}`))
  const scorch = floor.find((sq) => sq.scorch)
  const [mx, my] = [floor.reduce((n, sq) => n + sq.x + 0.5, 0) / floor.length, floor.reduce((n, sq) => n + sq.y + 0.5, 0) / floor.length]
  let best = null
  for (const { x, y } of floor) {
    const [cx, cy] = [x + 1, y + 1]
    if (![[x + 1, y], [x, y + 1], [x + 1, y + 1]].every(([a, b]) => at.has(`${a},${b}`))) continue
    const away = scorch ? Math.hypot(cx - scorch.x - 0.5, cy - scorch.y - 0.5) : 0
    const score = Math.min(away, 1.5) * 10 - Math.hypot(cx - mx, cy - my)
    if (!best || score > best.score) best = { cx, cy, score }
  }
  return best ? [best.cx * SQUARE, best.cy * SQUARE] : [floor[0].x * SQUARE + SQUARE / 2, floor[0].y * SQUARE + SQUARE / 2]
}

function Pit({ id, floor }) {
  const [cx, cy] = pitSpot(floor)
  return (
    <g>
      <defs>
        <radialGradient id={`${id}pit`}>
          <stop offset="0" stopColor="#000" />
          <stop offset="0.7" stopColor="#0c0a09" />
          <stop offset="1" stopColor="#44403c" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r="30" fill={`url(#${id}pit)`} stroke="#1c1917" strokeWidth="3" />
      <path d={`M${cx - 26} ${cy - 6}a27 27 0 0 1 52 0`} fill="none" stroke="#a8a29e" strokeOpacity="0.35" strokeWidth="2" />
    </g>
  )
}

// The hazard drawn over the floor squares of its tile (walls stay walls).
export default function HazardFloor({ marker, squares }) {
  const id = `hz${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const still = useReducedMotion()
  const floor = squares.filter((sq) => sq.floor)
  if (floor.length === 0) return null
  const box = {
    x0: Math.min(...floor.map((sq) => sq.x)) * SQUARE,
    y0: Math.min(...floor.map((sq) => sq.y)) * SQUARE,
    x1: (Math.max(...floor.map((sq) => sq.x)) + 1) * SQUARE,
    y1: (Math.max(...floor.map((sq) => sq.y)) + 1) * SQUARE,
  }
  const kind = marker.cardId
  return (
    <g>
      <defs>
        <clipPath id={`${id}clip`}>
          {floor.map((sq) => (
            <rect key={`${sq.x},${sq.y}`} x={sq.x * SQUARE} y={sq.y * SQUARE} width={SQUARE} height={SQUARE} />
          ))}
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}clip)`}>
        {kind === 'lava-flow' && <Lava id={id} box={box} squares={floor} still={still} />}
        {kind === 'volcanic-vapors' && <Vapors id={id} box={box} still={still} />}
        {kind === 'cave-in' && <Rubble squares={floor} seed={String(marker.id)} />}
        {kind === 'pit' && <Pit id={id} floor={floor} />}
      </g>
      {floor.filter((sq) => sq.scorch).map((sq) => <Scorch key={`${sq.x},${sq.y}`} x={sq.x} y={sq.y} />)}
    </g>
  )
}
