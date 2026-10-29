import { useState } from 'react'
import { heroArt, monsterArt } from '../data/art.js'
import { boardGrid, figureToken, figuresLeft, heroReach, moveSpeed, movesLeft } from '../board/play.js'
import { moveChoices, movePrompt, moveTargets } from '../board/powerMoves.js'
import { key } from '../board/grid.js'
import { activeVillains } from '../state/game.js'
import { artUrl, useArt } from '../state/useArt.js'
import { SQUARE, TileShapes } from './TileDrawing.jsx'
import { Button } from './ui.jsx'

// The virtual board of a solo game: the tiles laid so far and every figure on its square.
// Tap your hero to see where it can go, then tap a square to move there. "Move by hand"
// lets you put any figure on any free square, for anything the app doesn't move itself.

const TOKEN_COLORS = {
  sky: '#0ea5e9', red: '#ef4444', amber: '#f59e0b', emerald: '#10b981', violet: '#8b5cf6',
  teal: '#14b8a6', rose: '#f43f5e', orange: '#f97316', lime: '#84cc16', fuchsia: '#d946ef',
}
const ZOOMS = [0.6, 0.8, 1, 1.3, 1.6, 2]

// A placed tile drawn in board squares: moved to its spot and turned.
function PlacedTile({ placed, def }) {
  const w = def.rows[0].length * SQUARE
  const h = def.rows.length * SQUARE
  const [x, y] = [placed.at[0] * SQUARE, placed.at[1] * SQUARE]
  const shift = { 0: [0, 0], 90: [h, 0], 180: [w, h], 270: [0, w] }[placed.turn] ?? [0, 0]
  return (
    <g transform={`translate(${x + shift[0]} ${y + shift[1]}) rotate(${placed.turn})`}>
      <TileShapes tile={def} turn={placed.turn} />
    </g>
  )
}

// A round figure: its token art when there is some, else a coloured disc with its initial.
function Token({ id, at, label, color, art, selected, faded, onTap }) {
  const cx = at[0] * SQUARE + SQUARE / 2
  const cy = at[1] * SQUARE + SQUARE / 2
  const r = SQUARE / 2 - 3
  const clip = `clip-${id.replace(/#/g, '-')}`
  return (
    <g onClick={onTap} className={onTap ? 'cursor-pointer' : undefined} opacity={faded ? 0.6 : 1}>
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
    </g>
  )
}

export default function Board({ state, dispatch, readOnly = false }) {
  const art = useArt()
  const [picked, setPicked] = useState(null) // id of the figure being moved
  const [byHand, setByHand] = useState(false)
  const [zoom, setZoom] = useState(4)
  const board = state.board
  if (!board) return null

  const grid = boardGrid(board)
  const active = state.heroes[state.turn.heroIndex]
  const figures = [
    ...state.heroes.map((h) => ({ id: h.id, label: h.name, color: TOKEN_COLORS[h.color] ?? '#71717a', art: artUrl(art, heroArt(h.key)), faded: h.hp <= 0 })),
    ...state.monsters.flatMap((m) =>
      Array.from({ length: figuresLeft(m) }, (_, i) => ({ id: figureToken(m.id, i + 1), label: figuresLeft(m) > 1 ? `${m.name} ${i + 1}` : m.name, color: '#7f1d1d', art: artUrl(art, monsterArt(m)) })),
    ),
    ...activeVillains(state).map((v) => ({ id: v.id, label: v.name, color: '#581c87', art: artUrl(art, monsterArt(v)) })),
    ...(state.villagers ?? []).filter((v) => !v.removed).map((v) => ({ id: v.id, label: v.name, color: '#065f46' })),
  ]
  const onBoard = figures.filter((f) => board.tokens[f.id])
  const offBoard = figures.filter((f) => !board.tokens[f.id])

  // Squares to light up: where the active hero can move, or every free floor square by hand.
  const taken = new Set(Object.values(board.tokens).map(key))
  // A power that moves a hero (Righteous Advance) takes over the taps until it's done.
  const powerMove = !readOnly && !byHand && state.turn.boardMove
  const movable = powerMove ? moveChoices(state) : []
  const swap = powerMove?.steps?.[0]?.to === 'swap'
  let targets = []
  if (!readOnly && picked) {
    if (powerMove) targets = moveTargets(state, picked)
    else if (byHand) targets = [...grid.values()].filter((sq) => sq.floor && !taken.has(key([sq.x, sq.y]))).map((sq) => key([sq.x, sq.y]))
    else if (picked === active?.id) targets = heroReach(state, active)
  }
  const tapSquare = (sq) => {
    if (!picked || !targets.includes(key(sq))) return
    dispatch(powerMove ? { type: 'BOARD_MOVE', id: picked, to: sq } : byHand ? { type: 'MOVE_TOKEN', id: picked, to: sq } : { type: 'MOVE_HERO', heroId: picked, to: sq })
    setPicked(null)
  }
  const tapFigure = (id) => {
    if (readOnly) return
    if (powerMove ? !movable.includes(id) : !byHand && id !== active?.id) return
    if (swap) {
      dispatch({ type: 'BOARD_MOVE', id })
      return
    }
    setPicked(picked === id ? null : id)
  }

  const squares = [...grid.values()]
  const xs = squares.map((s) => s.x)
  const ys = squares.map((s) => s.y)
  const [minX, minY] = [Math.min(...xs) - 1, Math.min(...ys) - 1]
  const [cols, rows] = [Math.max(...xs) - minX + 2, Math.max(...ys) - minY + 2]
  const scale = ZOOMS[zoom]
  const left = active ? movesLeft(state, active) : 0

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-3">
      {!readOnly && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <p className="flex-1 text-sm text-zinc-300">
            {byHand
              ? picked
                ? 'Tap a free square to put it there.'
                : 'Moving by hand: tap any figure, then a square.'
              : picked
                ? `Tap a lit square. ${active.name} moves up to ${moveSpeed(active)} squares.`
                : left > 0
                  ? `Tap ${active.name} to move (${left} ${left === 1 ? 'move' : 'moves'} left this turn).`
                  : state.turn.phase === 0
                    ? `${active?.name ?? 'The hero'} has no moves left this turn.`
                    : 'Heroes move in their Hero Phase.'}
          </p>
          <Button className="!px-3 !py-1" disabled={zoom === 0} onClick={() => setZoom(zoom - 1)} aria-label="Zoom out">−</Button>
          <Button className="!px-3 !py-1" disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom(zoom + 1)} aria-label="Zoom in">+</Button>
          <Button
            variant={byHand ? 'gold' : 'default'}
            className="!py-1 text-sm"
            onClick={() => {
              setByHand(!byHand)
              setPicked(null)
            }}
          >
            ✋ Move by hand
          </Button>
        </div>
      )}
      {powerMove && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl bg-amber-950/60 p-2 text-amber-200">
          <p className="flex-1">
            <b>{powerMove.source}:</b> {picked ? 'tap a lit square.' : movable.length === 0 ? 'nothing on the board can do this. Skip it.' : movePrompt(state)}
          </p>
          <Button className="!py-1 text-sm" onClick={() => { setPicked(null); dispatch({ type: 'SKIP_BOARD_MOVE' }) }}>
            Skip
          </Button>
        </div>
      )}
      {!readOnly && offBoard.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-zinc-400">Not on the board yet:</span>
          {offBoard.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`rounded-full px-3 py-1 ${picked === f.id ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-800 text-zinc-200'}`}
              onClick={() => {
                setByHand(true)
                setPicked(f.id)
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
      <div className={readOnly ? '' : 'max-h-[70vh] overflow-auto'}>
        <svg
          viewBox={`${minX * SQUARE} ${minY * SQUARE} ${cols * SQUARE} ${rows * SQUARE}`}
          width={readOnly ? '100%' : cols * SQUARE * scale}
          height={readOnly ? undefined : rows * SQUARE * scale}
          className={readOnly ? 'mx-auto max-h-[45vh]' : 'mx-auto'}
          role="img"
          aria-label="The dungeon board"
        >
          {board.tiles.map((placed) => board.defs[placed.tileId] && <PlacedTile key={placed.uid} placed={placed} def={board.defs[placed.tileId]} />)}
          {targets.map((k) => {
            const [x, y] = k.split(',').map(Number)
            return (
              <rect
                key={k}
                x={x * SQUARE + 2}
                y={y * SQUARE + 2}
                width={SQUARE - 4}
                height={SQUARE - 4}
                rx="6"
                fill="#34d399"
                fillOpacity="0.45"
                stroke="#059669"
                className="cursor-pointer"
                onClick={() => tapSquare([x, y])}
              />
            )
          })}
          {onBoard.map((f) => (
            <Token key={f.id} {...f} at={board.tokens[f.id]} selected={picked === f.id || (Boolean(powerMove) && !picked && movable.includes(f.id))} onTap={readOnly ? undefined : () => tapFigure(f.id)} />
          ))}
        </svg>
      </div>
    </section>
  )
}
