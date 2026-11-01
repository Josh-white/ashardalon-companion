import { memo } from 'react'
import { key, STEP, unexploredEdges } from '../board/grid.js'
import { HERO_TOKENS, isHeroToken } from '../board/heroTokens.js'
import HazardFloor, { hasHazardFloor } from './HazardFloor.jsx'
import { SQUARE, TileShapes } from './TileDrawing.jsx'

// The pieces the virtual board draws (components/Board.jsx lays them out): tiles, open
// edges, exits, trap and hazard markers, the tokens heroes put down, and the figures.

// A placed tile drawn in board squares: moved to its spot and turned.
function PlacedTileDrawing({ placed, def, spin }) {
  const w = def.rows[0].length * SQUARE
  const h = def.rows.length * SQUARE
  const [x, y] = [placed.at[0] * SQUARE, placed.at[1] * SQUARE]
  const shift = { 0: [0, 0], 90: [h, 0], 180: [w, h], 270: [0, w] }[placed.turn] ?? [0, 0]
  return (
    <g transform={`translate(${x + shift[0]} ${y + shift[1]}) rotate(${placed.turn})`}>
      <TileShapes tile={def} turn={placed.turn + spin} />
    </g>
  )
}

// A tile never changes once it's down, but every tap anywhere sends the whole game again, so
// without this each tile's few hundred stone shapes were drawn over on every update.
const sameTile = (a, b) =>
  a.spin === b.spin &&
  a.placed.uid === b.placed.uid &&
  a.placed.turn === b.placed.turn &&
  a.placed.at[0] === b.placed.at[0] &&
  a.placed.at[1] === b.placed.at[1] &&
  (a.def === b.def || JSON.stringify(a.def) === JSON.stringify(b.def))
export const PlacedTile = memo(PlacedTileDrawing, sameTile)

// The open sides of the dungeon a hero can still explore: a glowing dashed line along the
// edge and an arrow pointing out into the dark, so they don't look like walls.
const OPEN_EDGE = '#22d3ee'
export function OpenEdges({ grid }) {
  return (
    <g pointerEvents="none" className="motion-safe:animate-pulse" data-open-edges="">
      {unexploredEdges(grid).map((edge) => {
        const [dx, dy] = STEP[edge.side]
        const lines = edge.squares.map(([x, y]) => {
          // The side of square (x, y) facing the unexplored spot.
          const [x1, y1] = [(x + (dx > 0 ? 1 : 0)) * SQUARE, (y + (dy > 0 ? 1 : 0)) * SQUARE]
          const [x2, y2] = dx ? [x1, y1 + SQUARE] : [x1 + SQUARE, y1]
          return { x1, y1, x2, y2 }
        })
        // The arrow sits half a square outside the middle of the opening.
        const mx = (Math.min(...lines.map((l) => l.x1)) + Math.max(...lines.map((l) => l.x2))) / 2 + (dx * SQUARE) / 2
        const my = (Math.min(...lines.map((l) => l.y1)) + Math.max(...lines.map((l) => l.y2))) / 2 + (dy * SQUARE) / 2
        const angle = { N: 0, E: 90, S: 180, W: 270 }[edge.side]
        return (
          <g key={edge.id} data-open-edge={edge.id}>
            {lines.map((l, i) => (
              <line key={i} {...l} stroke={OPEN_EDGE} strokeWidth="9" strokeOpacity="0.25" strokeLinecap="round" />
            ))}
            {lines.map((l, i) => (
              <line key={`d${i}`} {...l} stroke={OPEN_EDGE} strokeWidth="4" strokeDasharray="8 6" strokeLinecap="round" />
            ))}
            <path d="M-11 6L0 -8L11 6" transform={`translate(${mx} ${my}) rotate(${angle})`} fill="none" stroke={OPEN_EDGE} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )
      })}
    </g>
  )
}

// Trap and hazard markers on their tile. Lava Flow, Volcanic Vapors, Cave-in and Pit change the
// floor itself (HazardFloor); any other marker's tile gets a colour wash and a dashed outline.
// The badges are drawn separately, on top of the figures.
// The way out (the exit's stairs or ladder) in adventures that end with an escape: a faint
// outline while there's still work to do, a bright glow once the heroes can leave.
export function ExitSquares({ squares, open }) {
  if (squares.length === 0) return null
  return (
    <g pointerEvents="none" data-exit={open ? 'open' : 'closed'}>
      {squares.map((k) => {
        const [x, y] = k.split(',').map(Number)
        return (
          <rect key={k} x={x * SQUARE + 3} y={y * SQUARE + 3} width={SQUARE - 6} height={SQUARE - 6} rx="6" fill="#10b981" fillOpacity={open ? 0.35 : 0.08} stroke="#34d399" strokeWidth={open ? 4 : 2} strokeDasharray={open ? undefined : '6 6'}>
            {open && <animate attributeName="fill-opacity" values="0.2;0.5;0.2" dur="2s" repeatCount="indefinite" />}
          </rect>
        )
      })}
    </g>
  )
}

export function MarkerTiles({ markers }) {
  return (
    <g pointerEvents="none">
      {markers.map(({ marker, look, squares }) => {
        const xs = squares.map((sq) => sq.x)
        const ys = squares.map((sq) => sq.y)
        const [x0, y0] = [Math.min(...xs) * SQUARE, Math.min(...ys) * SQUARE]
        const [x1, y1] = [(Math.max(...xs) + 1) * SQUARE, (Math.max(...ys) + 1) * SQUARE]
        if (hasHazardFloor(marker)) {
          return (
            <g key={marker.id} data-marker-tile={marker.id}>
              <HazardFloor marker={marker} squares={squares} />
            </g>
          )
        }
        return (
          <g key={marker.id} data-marker-tile={marker.id}>
            {squares.map((sq) => (
              <rect key={key([sq.x, sq.y])} x={sq.x * SQUARE} y={sq.y * SQUARE} width={SQUARE} height={SQUARE} fill={look.color} fillOpacity="0.3" />
            ))}
            <rect x={x0 + 3} y={y0 + 3} width={x1 - x0 - 6} height={y1 - y0 - 6} rx="8" fill="none" stroke={look.color} strokeWidth="4" strokeDasharray="12 8" />
          </g>
        )
      })}
    </g>
  )
}

// A round badge in the top-left corner of the marker's tile; tap it to read the card.
// A second marker on the same tile sits next to the first.
export function MarkerBadges({ markers, spin, onTap, taken = new Set() }) {
  const used = new Set(taken)
  return markers.map(({ marker, look, squares, tile }) => {
    // The badge sits on a free square of its tile (top-left first) so it never hides a
    // figure standing there; with every square taken it shrinks into the tile's corner.
    const own = squares.filter((sq) => sq.area === tile)
    const order = (own.length > 0 ? own : squares).slice().sort((a, b) => a.y - b.y || a.x - b.x)
    const free = order.find((sq) => !used.has(`${sq.x},${sq.y}`))
    const corner = order[0]
    if (free) used.add(`${free.x},${free.y}`)
    const at = free ?? corner
    const r = free ? 16 : 9
    const cx = at.x * SQUARE + (free ? SQUARE / 2 : r + 1)
    const cy = at.y * SQUARE + (free ? SQUARE / 2 : r + 1)
    return (
      <g key={marker.id} data-marker={marker.id} className="cursor-pointer" onClick={() => onTap(marker.id)}>
        <circle cx={cx} cy={cy} r={r} fill="#18181b" stroke={look.color} strokeWidth={free ? 4 : 2} />
        <text x={cx} y={cy + r * 0.38} textAnchor="middle" fontSize={r * 1.1} transform={spin ? `rotate(${-spin} ${cx} ${cy})` : undefined}>
          {look.icon}
        </text>
      </g>
    )
  })
}

// A Treasure token lying on a square: a gold coin. Tap it to move it or hand it out.
export function Coin({ item, selected, spin, onTap }) {
  const cx = item.at[0] * SQUARE + SQUARE / 2
  const cy = item.at[1] * SQUARE + SQUARE / 2
  return (
    <g data-item={item.id} onClick={onTap} className={onTap ? 'cursor-pointer' : undefined}>
      <circle cx={cx} cy={cy} r="15" fill="#f59e0b" stroke={selected ? '#fde047' : '#78350f'} strokeWidth={selected ? 5 : 3} />
      <text x={cx} y={cy + 6} textAnchor="middle" fontSize="17" transform={spin ? `rotate(${-spin} ${cx} ${cy})` : undefined}>
        💰
      </text>
    </g>
  )
}

// An adventure token waiting to be picked up (Roghar's Gear on the Vault's desk).
export function QuestToken({ spot, spin }) {
  const cx = spot.at[0] * SQUARE + SQUARE / 2
  const cy = spot.at[1] * SQUARE + SQUARE / 2
  return (
    <g data-quest-token={spot.name} pointerEvents="none">
      <title>{spot.name}</title>
      <circle cx={cx} cy={cy} r="17" fill="#0e7490" stroke="#fde047" strokeWidth="3" className="motion-safe:animate-pulse" />
      <text x={cx} y={cy + 7} textAnchor="middle" fontSize="19" transform={spin ? `rotate(${-spin} ${cx} ${cy})` : undefined}>
        ⚙️
      </text>
    </g>
  )
}

// A token a hero put down (board/heroTokens.js): its icon in a coloured disc, with the
// Flaming Sphere's stack height beside it.
export function HeroTokenMark({ item, count, spin, selected, onTap }) {
  const look = HERO_TOKENS[item.kind]
  const cx = item.at[0] * SQUARE + SQUARE / 2
  const cy = item.at[1] * SQUARE + SQUARE / 2
  return (
    <g data-item={item.id} data-kind={item.kind} onClick={onTap} className={onTap ? 'cursor-pointer' : undefined} transform={spin ? `rotate(${-spin} ${cx} ${cy})` : undefined}>
      <circle cx={cx} cy={cy} r={SQUARE * 0.3} fill={look.color} fillOpacity="0.85" stroke={selected ? '#f59e0b' : '#0a0c10'} strokeWidth={selected ? 4 : 2} />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={SQUARE * 0.32} pointerEvents="none">
        {look.icon}
      </text>
      {count > 1 && (
        <text x={cx + SQUARE * 0.3} y={cy - SQUARE * 0.24} textAnchor="middle" fontSize={SQUARE * 0.22} fontWeight="bold" fill="#fde68a" stroke="#0a0c10" strokeWidth="3" paintOrder="stroke" pointerEvents="none">
          {count}
        </text>
      )}
    </g>
  )
}

// Hero tokens still in hand, one group per kind and owner.
export function heroTokenGroups(items) {
  const groups = new Map()
  for (const i of items.filter((x) => isHeroToken(x) && !x.at)) {
    const k = `${i.kind}-${i.owner}`
    if (!groups.has(k)) groups.set(k, { first: i, left: 0, kind: i.kind, owner: i.owner })
    groups.get(k).left++
  }
  return [...groups.values()]
}

// The Flying Carpet: a purple rug under the square's figure. Tap it to move it by hand.
export function Carpet({ item, selected, onTap }) {
  const [x, y] = [item.at[0] * SQUARE, item.at[1] * SQUARE]
  return (
    <g data-item={item.id} onClick={onTap} className={onTap ? 'cursor-pointer' : undefined}>
      <rect x={x + 1} y={y + 1} width={SQUARE - 2} height={SQUARE - 2} rx="4" fill="#7c3aed" stroke={selected ? '#fde047' : '#fbbf24'} strokeWidth={selected ? 5 : 3} strokeDasharray="6 3" />
      <rect x={x + 7} y={y + 7} width={SQUARE - 14} height={SQUARE - 14} rx="2" fill="none" stroke="#c4b5fd" strokeWidth="2" />
    </g>
  )
}

// A round figure: its token art when there is some, else a coloured disc with its initial.
// The hero whose turn it is gets a pulsing gold glow so it is easy to spot.
// Small icons around a figure for its conditions, so the big screen shows them at a glance.
export const CONDITION_ICONS = { Dazed: '💫', Immobilized: '⛓️', Poisoned: '🧪', Slowed: '🐌', Weakened: '💔' }
export function figureBadges(figure) {
  const badges = (figure.conditions ?? []).filter((c) => CONDITION_ICONS[c]).map((c) => ({ id: c, icon: CONDITION_ICONS[c] }))
  if (figure.tokens?.invisible) badges.push({ id: 'Invisible', icon: '👻' })
  return badges
}

function Badges({ cx, cy, r, badges }) {
  // Around the top of the token, right to left, so two or three still fit on a square.
  return (
    <g pointerEvents="none">
      {badges.map((b, i) => {
        const angle = (-50 - i * 40) * (Math.PI / 180)
        const [bx, by] = [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]
        return (
          <g key={b.id} data-badge={b.id}>
            <title>{b.id}</title>
            <circle cx={bx} cy={by} r={SQUARE * 0.21} fill="#0a0c10" stroke="#e4e4e7" strokeWidth="1.5" />
            <text x={bx} y={by} textAnchor="middle" dominantBaseline="central" fontSize={SQUARE * 0.26}>
              {b.icon}
            </text>
          </g>
        )
      })}
    </g>
  )
}

export function Token({ id, at, label, color, art, selected, active, aimed, acting, faded, spin, badges = [], onTap }) {
  const cx = at[0] * SQUARE + SQUARE / 2
  const cy = at[1] * SQUARE + SQUARE / 2
  const r = SQUARE / 2 - 3
  const clip = `clip-${id.replace(/#/g, '-')}`
  return (
    // On a turned board the figure turns back so its picture stays upright.
    <g data-token={id} onClick={onTap} className={onTap ? 'cursor-pointer' : undefined} opacity={faded ? 0.6 : 1} transform={spin ? `rotate(${-spin} ${cx} ${cy})` : undefined}>
      {active && (
        <g pointerEvents="none" className="motion-safe:animate-pulse">
          <circle cx={cx} cy={cy} r={r + 8} fill="#facc15" fillOpacity="0.4" stroke="#422006" strokeWidth="2" />
          <circle cx={cx} cy={cy} r={r + 5} fill="none" stroke="#fde047" strokeWidth="4" />
        </g>
      )}
      {/* A monster or villain taking its turn in the Villain Phase: a wide pulsing orange glow. */}
      {acting && (
        <g pointerEvents="none" className="motion-safe:animate-pulse" data-acting="true">
          <circle cx={cx} cy={cy} r={r + 11} fill="#f97316" fillOpacity="0.45" stroke="#431407" strokeWidth="2" />
          <circle cx={cx} cy={cy} r={r + 6} fill="none" stroke="#fb923c" strokeWidth="5" />
        </g>
      )}
      {/* A monster picked to attack: a pulsing red glow, like the active hero's gold one. */}
      {aimed && (
        <g pointerEvents="none" className="motion-safe:animate-pulse" data-aimed="true">
          <circle cx={cx} cy={cy} r={r + 8} fill="#ef4444" fillOpacity="0.45" stroke="#450a0a" strokeWidth="2" />
          <circle cx={cx} cy={cy} r={r + 5} fill="none" stroke="#f87171" strokeWidth="4" />
        </g>
      )}
      <clipPath id={clip}>
        <circle cx={cx} cy={cy} r={r} />
      </clipPath>
      <circle cx={cx} cy={cy} r={r} fill={color} />
      {art ? (
        <image href={art} x={cx - r} y={cy - r} width={r * 2} height={r * 2} clipPath={`url(#${clip})`} preserveAspectRatio="xMidYMid slice" />
      ) : (
        <text x={cx} y={cy + 6} textAnchor="middle" fontSize="17" fontWeight="700" fill="#fafafa">
          {label.slice(0, 1)}
        </text>
      )}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={selected ? '#fbbf24' : '#09090b'} strokeWidth={selected ? 4 : 2} />
      {badges.length > 0 && <Badges cx={cx} cy={cy} r={r} badges={badges} />}
    </g>
  )
}

// A tile just laid (useFreshTiles): a warm wash and a bright outline round its squares that
// flash a few times and fade, so everyone spots it while the board settles into its new fit.
export function NewTileGlow({ grid, uids }) {
  const squares = [...grid.values()].filter((sq) => uids.includes(sq.area))
  if (squares.length === 0) return null
  const own = new Set(squares.map((sq) => key([sq.x, sq.y])))
  const sides = squares.flatMap((sq) =>
    Object.entries(STEP)
      .filter(([, [dx, dy]]) => !own.has(key([sq.x + dx, sq.y + dy])))
      .map(([side, [dx, dy]]) => {
        const [x1, y1] = [(sq.x + (dx > 0 ? 1 : 0)) * SQUARE, (sq.y + (dy > 0 ? 1 : 0)) * SQUARE]
        return { id: `${sq.x},${sq.y},${side}`, x1, y1, x2: dx ? x1 : x1 + SQUARE, y2: dx ? y1 + SQUARE : y1 }
      }),
  )
  return (
    <g pointerEvents="none" className="new-tile-glow" data-new-tile={uids.join(' ')}>
      {squares.map((sq) => (
        <rect key={`${sq.x},${sq.y}`} x={sq.x * SQUARE} y={sq.y * SQUARE} width={SQUARE} height={SQUARE} fill="#fde68a" fillOpacity="0.28" />
      ))}
      {sides.map(({ id, ...l }) => (
        <line key={`h${id}`} {...l} stroke="#fbbf24" strokeWidth="16" strokeOpacity="0.35" strokeLinecap="round" />
      ))}
      {sides.map(({ id, ...l }) => (
        <line key={id} {...l} stroke="#fef3c7" strokeWidth="5" strokeLinecap="round" />
      ))}
    </g>
  )
}
