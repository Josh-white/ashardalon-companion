// One dungeon tile drawn from its layout in cards.json: floor, rock, the scorch mark,
// the triangle and anything the rules care about (stairs, a chest, a ladder). The board
// uses the same drawing for every tile it lays down.

const SQUARE = 40
const FEATURE_MARKS = { stairs: '≡', chest: '💰', ladder: '🪜' }

export default function TileDrawing({ tile, className = '' }) {
  const width = tile.rows[0].length
  const height = tile.rows.length
  const squares = []
  tile.rows.forEach((row, y) =>
    [...row].forEach((ch, x) => squares.push({ x, y, rock: ch === '#', scorch: ch === 'S' })),
  )
  const marks = tile.features.flatMap((f) => f.at.map(([x, y]) => ({ x, y, type: f.type })))
  // The triangle sits on the bottom edge, between the middle two squares.
  const cx = (width * SQUARE) / 2
  const by = height * SQUARE
  return (
    <svg
      viewBox={`-4 -4 ${width * SQUARE + 8} ${height * SQUARE + 8}`}
      className={className}
      role="img"
      aria-label={tile.name}
    >
      {squares.map(({ x, y, rock }) => (
        <rect
          key={`${x},${y}`}
          x={x * SQUARE}
          y={y * SQUARE}
          width={SQUARE}
          height={SQUARE}
          fill={rock ? '#18181b' : '#a1a1aa'}
          stroke={rock ? '#18181b' : '#52525b'}
          strokeWidth="1"
        />
      ))}
      {squares
        .filter((s) => s.scorch)
        .map(({ x, y }) => (
          <circle key="scorch" cx={x * SQUARE + SQUARE / 2} cy={y * SQUARE + SQUARE / 2} r={SQUARE / 2.6} fill="#3f3f46" opacity="0.85" />
        ))}
      {marks.map(({ x, y, type }) => (
        <text key={`${type}${x},${y}`} x={x * SQUARE + SQUARE / 2} y={y * SQUARE + SQUARE / 2 + 7} textAnchor="middle" fontSize="20" fill="#18181b">
          {FEATURE_MARKS[type] ?? '?'}
        </text>
      ))}
      {tile.walls.map(({ at: [x, y], side }) => {
        const x1 = (x + (side === 'E' ? 1 : 0)) * SQUARE
        const y1 = (y + (side === 'S' ? 1 : 0)) * SQUARE
        const across = side === 'N' || side === 'S'
        return <line key={`${x},${y},${side}`} x1={x1} y1={y1} x2={across ? x1 + SQUARE : x1} y2={across ? y1 : y1 + SQUARE} stroke="#f59e0b" strokeWidth="4" />
      })}
      {tile.triangle && (
        <path
          d={`M${cx - 9} ${by - 16}L${cx + 9} ${by - 16}L${cx} ${by}z`}
          fill={tile.triangle === 'black' ? '#09090b' : '#fafafa'}
          stroke="#09090b"
          strokeWidth="1"
        />
      )}
      <rect x="0" y="0" width={width * SQUARE} height={height * SQUARE} fill="none" stroke="#09090b" strokeWidth="2" />
    </svg>
  )
}
