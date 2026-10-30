// One dungeon tile drawn from its layout in cards.json: floor, walls, the scorch mark,
// the triangle and anything the rules care about (stairs, a desk, a ladder, a door). The
// board draws every tile it lays down with the same shapes.
//
// The look is carved stone: every floor square is a slab with its own shade (picked from the
// tile and square, so it's the same on every screen), rock squares are brick blocks with a lit
// top edge and a shadow on the floor beside them, and the scorch mark is a burn. No gradients
// or patterns, so a tile needs nothing from <defs> and draws the same in any svg.

export const SQUARE = 40
const FEATURE_MARKS = { desk: '📖', ladder: '🪜' }
const TRIANGLE_COLORS = { black: '#09090b', white: '#fafafa', red: '#b91c1c' }
const SLABS = ['#9d9a93', '#918e87', '#aaa69e', '#88857e']
const GROUT = '#3f3a33'
const BRICKS = ['#5a5148', '#504840', '#625950']
const MORTAR = '#2e2924'
const STEPS = ['#6b6258', '#5a5148', '#4a423a', '#3b342e']
const DOOR_STONE = '#e4dfd3'
const DOOR_EDGE = '#8f8778'

// A steady 0..1 number for a square, so the slabs and bricks don't change between redraws.
export function squareNoise(seed, x, y, k = 0) {
  let h = k * 2654435761
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 2246822519)
  h = (h + Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function Slab({ x, y, noise }) {
  const [px, py] = [x * SQUARE, y * SQUARE]
  const crack = noise(1)
  return (
    <g>
      <rect x={px} y={py} width={SQUARE} height={SQUARE} fill={GROUT} />
      <rect x={px + 1.5} y={py + 1.5} width={SQUARE - 3} height={SQUARE - 3} rx="2.5" fill={SLABS[Math.floor(noise(0) * SLABS.length)]} />
      <path d={`M${px + 2} ${py + SQUARE - 2}V${py + 2}H${px + SQUARE - 2}`} fill="none" stroke="#fff" strokeOpacity="0.18" />
      {crack > 0.65 && (
        <path
          d={`M${px + 6 + crack * 14} ${py + 4}l${4 + crack * 4} 8l-3 7l6 6`}
          fill="none"
          stroke={GROUT}
          strokeOpacity="0.55"
          transform={`rotate(${Math.floor(noise(2) * 4) * 90} ${px + SQUARE / 2} ${py + SQUARE / 2})`}
        />
      )}
    </g>
  )
}

function Rock({ x, y, noise }) {
  const [px, py] = [x * SQUARE, y * SQUARE]
  const bricks = []
  for (let row = 0; row < 4; row++) {
    const offset = row % 2 ? 10 : 0
    for (let col = -1; col < 2; col++) {
      const x0 = Math.max(px + col * 20 + offset, px + 1)
      const x1 = Math.min(px + col * 20 + offset + 18, px + SQUARE - 1)
      if (x1 - x0 < 3) continue
      const shade = BRICKS[Math.floor(noise(row * 3 + col + 4) * BRICKS.length)]
      bricks.push(<rect key={`${row},${col}`} x={x0} y={py + row * 10 + 1} width={x1 - x0} height="8" rx="1" fill={shade} />)
    }
  }
  return (
    <g>
      <rect x={px} y={py} width={SQUARE} height={SQUARE} fill={MORTAR} />
      {bricks}
      <rect x={px} y={py} width={SQUARE} height="3" fill="#8a7f72" opacity="0.7" />
    </g>
  )
}

// The shadow a rock square throws on the floor square below it and to its right.
function shadowStrips(squares) {
  const floor = new Set(squares.filter((s) => !s.wall).map((s) => `${s.x},${s.y}`))
  return squares
    .filter((s) => s.wall)
    .flatMap(({ x, y }) => [
      floor.has(`${x},${y + 1}`) && [
        <rect key={`b${x},${y}`} x={x * SQUARE} y={(y + 1) * SQUARE} width={SQUARE} height="5" fill="#000" opacity="0.3" />,
        <rect key={`b2${x},${y}`} x={x * SQUARE} y={(y + 1) * SQUARE + 5} width={SQUARE} height="5" fill="#000" opacity="0.14" />,
      ],
      floor.has(`${x + 1},${y}`) && [
        <rect key={`r${x},${y}`} x={(x + 1) * SQUARE} y={y * SQUARE} width="4" height={SQUARE} fill="#000" opacity="0.25" />,
        <rect key={`r2${x},${y}`} x={(x + 1) * SQUARE + 4} y={y * SQUARE} width="4" height={SQUARE} fill="#000" opacity="0.1" />,
      ],
    ])
    .flat()
    .filter(Boolean)
}

// The scorch mark, where new monsters go. Hazard floors draw it again on top so it still shows.
export function Scorch({ x, y }) {
  const [cx, cy] = [x * SQUARE + SQUARE / 2, y * SQUARE + SQUARE / 2]
  return (
    <g>
      <circle cx={cx} cy={cy} r="17" fill="#3a2a1e" opacity="0.35" />
      <circle cx={cx} cy={cy} r="13" fill="#2b1a10" opacity="0.6" />
      <circle cx={cx} cy={cy} r="8" fill="#0a0806" opacity="0.85" />
      <path d={`M${cx - 11} ${cy - 3}l5 2-2 6 6-3 3 5 1-7 6-1-6-3`} fill="none" stroke="#000" strokeOpacity="0.5" />
    </g>
  )
}

// A stairs square: steps going down, darker the deeper they go.
function Steps({ x, y }) {
  const [px, py] = [x * SQUARE, y * SQUARE]
  return (
    <g>
      {STEPS.map((fill, i) => (
        <rect key={i} x={px + 3} y={py + 2 + i * 9} width={SQUARE - 6} height="8" fill={fill} stroke="#1c1917" />
      ))}
    </g>
  )
}

// A pale stone door leaf from its hinge (x1, y1) to its tip, with a darker lower edge so it
// stands up off the floor.
function Leaf({ x1, y1, x2, y2 }) {
  const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI
  const length = Math.hypot(x2 - x1, y2 - y1)
  return (
    <g transform={`translate(${x1} ${y1}) rotate(${angle})`}>
      <rect x="0" y="-3.5" width={length} height="11" rx="1.5" fill={DOOR_EDGE} />
      <rect x="0" y="-5.5" width={length} height="9" rx="1.5" fill={DOOR_STONE} stroke="#57534e" strokeWidth="0.8" />
    </g>
  )
}

// A doorway as printed on the tile: two stone leaves swung open, hinged on the rock at each
// end of the doorway squares and set toward the tile's nearer edge, swinging inward.
function Door({ at, width, height }) {
  const xs = at.map(([x]) => x)
  const ys = at.map(([, y]) => y)
  const across = new Set(xs).size === 1 && at.length > 1
  const hinges = []
  const leaves = []
  if (across) {
    const out = xs[0] >= width / 2 ? 1 : -1
    const hx = xs[0] * SQUARE + SQUARE / 2 + out * 4
    const [top, bottom] = [Math.min(...ys) * SQUARE, (Math.max(...ys) + 1) * SQUARE]
    hinges.push([hx, top], [hx, bottom])
    leaves.push([hx, top + 2, hx - out * 18, top + 34], [hx, bottom - 2, hx - out * 18, bottom - 34])
  } else {
    const out = ys[0] >= height / 2 ? 1 : -1
    const hy = ys[0] * SQUARE + SQUARE / 2 + out * 4
    const [left, right] = [Math.min(...xs) * SQUARE, (Math.max(...xs) + 1) * SQUARE]
    hinges.push([left, hy], [right, hy])
    leaves.push([left + 2, hy, left + 34, hy - out * 18], [right - 2, hy, right - 34, hy - out * 18])
  }
  return (
    <g>
      {leaves.map(([x1, y1, x2, y2], i) => (
        <Leaf key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
      ))}
      {hinges.map(([x, y], i) => (
        <rect key={`h${i}`} x={x - 4} y={y - 4} width="8" height="8" rx="1" fill="#141210" />
      ))}
    </g>
  )
}

// A Closed Door token on the board, over the squares it shuts (board units): a heavy stone
// door with iron bands. Face down it shows a ?, turned over and locked a lock. The door
// an adventure waits for (the Secret Chamber's) has a gold rim.
export function ClosedDoor({ squares, kind, special = false, spin = 0 }) {
  const xs = squares.map(([x]) => x)
  const ys = squares.map(([, y]) => y)
  const [x0, y0] = [Math.min(...xs) * SQUARE, Math.min(...ys) * SQUARE]
  const [w, h] = [(Math.max(...xs) + 1) * SQUARE - x0, (Math.max(...ys) + 1) * SQUARE - y0]
  const long = w >= h
  const bands = [0.25, 0.75].map((f) => (long ? x0 + w * f : y0 + h * f))
  const [cx, cy] = [x0 + w / 2, y0 + h / 2]
  return (
    <g pointerEvents="none">
      <rect x={x0 + 2} y={y0 + 5} width={w - 4} height={h - 4} rx="3" fill="#000" fillOpacity="0.45" />
      <rect x={x0 + 2} y={y0 + 2} width={w - 4} height={h - 4} rx="3" fill={DOOR_STONE} stroke={special ? '#fbbf24' : '#3f3a33'} strokeWidth={special ? 4 : 2} />
      <rect x={x0 + 7} y={y0 + 7} width={w - 14} height={h - 14} rx="2" fill="none" stroke={DOOR_EDGE} strokeWidth="1.5" />
      {bands.map((b, i) =>
        long ? (
          <rect key={i} x={b - 3} y={y0 + 2} width="6" height={h - 4} fill="#3b3631" />
        ) : (
          <rect key={i} x={x0 + 2} y={b - 3} width={w - 4} height="6" fill="#3b3631" />
        ),
      )}
      <circle cx={cx} cy={cy} r="11" fill="#1c1917" stroke="#a8a29e" strokeWidth="1.5" />
      <text x={cx} y={cy + 6} textAnchor="middle" fontSize={kind === 'locked' ? 13 : 16} fontWeight="bold" fill="#e7e5e4" transform={spin ? `rotate(${-spin} ${cx} ${cy})` : undefined}>
        {kind === 'locked' ? '🔒' : '?'}
      </text>
    </g>
  )
}

// The tile's shapes in its own frame (triangle at the bottom), SQUARE units per square.
// `turn` keeps the marks upright when the board turns the tile.
export function TileShapes({ tile, turn = 0 }) {
  const width = tile.rows[0].length
  const height = tile.rows.length
  const seed = tile.id ?? tile.name ?? ''
  const squares = []
  tile.rows.forEach((row, y) =>
    [...row].forEach((ch, x) => squares.push({ x, y, wall: ch === '#', scorch: ch === 'S' })),
  )
  const marks = (tile.features ?? []).flatMap((f) => f.at.map(([x, y]) => ({ x, y, type: f.type })))
  // The triangle sits on the bottom edge, between the middle two squares.
  const cx = (width * SQUARE) / 2
  const by = height * SQUARE
  return (
    <g>
      {squares.map(({ x, y, wall }) => {
        const noise = (k) => squareNoise(seed, x, y, k)
        return wall ? <Rock key={`${x},${y}`} x={x} y={y} noise={noise} /> : <Slab key={`${x},${y}`} x={x} y={y} noise={noise} />
      })}
      {shadowStrips(squares)}
      {squares.filter((s) => s.scorch).map(({ x, y }) => <Scorch key="scorch" x={x} y={y} />)}
      {marks.filter((m) => m.type === 'stairs').map(({ x, y }) => <Steps key={`stairs${x},${y}`} x={x} y={y} />)}
      {(tile.features ?? []).filter((f) => f.type === 'door').map((f, i) => <Door key={`door${i}`} at={f.at} width={width} height={height} />)}
      {marks
        .filter((m) => m.type !== 'stairs' && m.type !== 'door')
        .map(({ x, y, type }) => {
          const mx = x * SQUARE + SQUARE / 2
          const my = y * SQUARE + SQUARE / 2
          return (
            <text key={`${type}${x},${y}`} x={mx} y={my + 7} textAnchor="middle" fontSize="20" fill="#18181b" transform={turn ? `rotate(${-turn} ${mx} ${my})` : undefined}>
              {FEATURE_MARKS[type] ?? '?'}
            </text>
          )
        })}
      {(tile.walls ?? []).map(({ at: [x, y], side }) => {
        // A wall between two floor squares: a thin run of stone with a lit top.
        const x1 = (x + (side === 'E' ? 1 : 0)) * SQUARE
        const y1 = (y + (side === 'S' ? 1 : 0)) * SQUARE
        const across = side === 'N' || side === 'S'
        return across ? (
          <rect key={`${x},${y},${side}`} x={x1} y={y1 - 3.5} width={SQUARE} height="7" fill={BRICKS[2]} stroke="#1c1917" strokeWidth="1.5" />
        ) : (
          <rect key={`${x},${y},${side}`} x={x1 - 3.5} y={y1} width="7" height={SQUARE} fill={BRICKS[2]} stroke="#1c1917" strokeWidth="1.5" />
        )
      })}
      {tile.triangle && (
        <path
          d={`M${cx - 9} ${by - 16}L${cx + 9} ${by - 16}L${cx} ${by}z`}
          fill={TRIANGLE_COLORS[tile.triangle]}
          stroke={tile.triangle === 'white' ? '#09090b' : '#a8977f'}
          strokeWidth="1"
        />
      )}
      <rect x="0" y="0" width={width * SQUARE} height={height * SQUARE} fill="none" stroke="#17130f" strokeWidth="3" />
    </g>
  )
}

export default function TileDrawing({ tile, className = '' }) {
  const width = tile.rows[0].length
  const height = tile.rows.length
  return (
    <svg viewBox={`-4 -4 ${width * SQUARE + 8} ${height * SQUARE + 8}`} className={className} role="img" aria-label={tile.name}>
      <TileShapes tile={tile} />
    </svg>
  )
}
