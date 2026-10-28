// One dungeon tile drawn from its layout in cards.json: floor, walls, the scorch mark,
// the triangle and anything the rules care about (stairs, a desk, a ladder, a door). The
// board draws every tile it lays down with the same shapes.

export const SQUARE = 40
const FEATURE_MARKS = { stairs: '≡', desk: '📖', ladder: '🪜', door: '🚪' }
const TRIANGLE_COLORS = { black: '#09090b', white: '#fafafa', red: '#b91c1c' }

// The tile's shapes in its own frame (triangle at the bottom), SQUARE units per square.
// `turn` keeps the marks upright when the board turns the tile.
export function TileShapes({ tile, turn = 0 }) {
  const width = tile.rows[0].length
  const height = tile.rows.length
  const squares = []
  tile.rows.forEach((row, y) =>
    [...row].forEach((ch, x) => squares.push({ x, y, wall: ch === '#', scorch: ch === 'S' })),
  )
  const marks = tile.features.flatMap((f) => f.at.map(([x, y]) => ({ x, y, type: f.type })))
  // The triangle sits on the bottom edge, between the middle two squares.
  const cx = (width * SQUARE) / 2
  const by = height * SQUARE
  return (
    <g>
      {squares.map(({ x, y, wall }) => (
        <rect
          key={`${x},${y}`}
          x={x * SQUARE}
          y={y * SQUARE}
          width={SQUARE}
          height={SQUARE}
          fill={wall ? '#18181b' : '#a1a1aa'}
          stroke={wall ? '#18181b' : '#52525b'}
          strokeWidth="1"
        />
      ))}
      {squares
        .filter((s) => s.scorch)
        .map(({ x, y }) => (
          <circle key="scorch" cx={x * SQUARE + SQUARE / 2} cy={y * SQUARE + SQUARE / 2} r={SQUARE / 2.6} fill="#3f3f46" opacity="0.85" />
        ))}
      {marks.map(({ x, y, type }) => {
        const mx = x * SQUARE + SQUARE / 2
        const my = y * SQUARE + SQUARE / 2
        return (
          <text key={`${type}${x},${y}`} x={mx} y={my + 7} textAnchor="middle" fontSize="20" fill="#18181b" transform={turn ? `rotate(${-turn} ${mx} ${my})` : undefined}>
            {FEATURE_MARKS[type] ?? '?'}
          </text>
        )
      })}
      {tile.walls.map(({ at: [x, y], side }) => {
        const x1 = (x + (side === 'E' ? 1 : 0)) * SQUARE
        const y1 = (y + (side === 'S' ? 1 : 0)) * SQUARE
        const across = side === 'N' || side === 'S'
        return <line key={`${x},${y},${side}`} x1={x1} y1={y1} x2={across ? x1 + SQUARE : x1} y2={across ? y1 : y1 + SQUARE} stroke="#f59e0b" strokeWidth="4" />
      })}
      {tile.triangle && (
        <path
          d={`M${cx - 9} ${by - 16}L${cx + 9} ${by - 16}L${cx} ${by}z`}
          fill={TRIANGLE_COLORS[tile.triangle]}
          stroke="#09090b"
          strokeWidth="1"
        />
      )}
      <rect x="0" y="0" width={width * SQUARE} height={height * SQUARE} fill="none" stroke="#09090b" strokeWidth="2" />
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
