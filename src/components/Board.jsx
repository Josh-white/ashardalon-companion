import { useEffect, useRef, useState } from 'react'
import { heroArt, monsterArt } from '../data/art.js'
import { boardGrid, figureToken, figuresLeft, heroReach, moveSpeed, movesLeft, timeLeapt } from '../board/play.js'
import { moveChoices, movePrompt, moveTargets } from '../board/powerMoves.js'
import { key, STEP, unexploredEdges } from '../board/grid.js'
import { boardMarkers } from '../board/markers.js'
import { activeVillains } from '../state/game.js'
import { artUrl, useArt } from '../state/useArt.js'
import { SQUARE, TileShapes } from './TileDrawing.jsx'
import { Button } from './ui.jsx'

// The virtual board (a solo game's, or the party's on the projector and iPads): the tiles laid so far and every figure on its square.
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

// The open sides of the dungeon a hero can still explore: a glowing dashed line along the
// edge and an arrow pointing out into the dark, so they don't look like walls.
const OPEN_EDGE = '#22d3ee'
function OpenEdges({ grid }) {
  return (
    <g pointerEvents="none" className="motion-safe:animate-pulse">
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

// Trap and hazard markers (Volcanic Vapors, Pit, Poisoned Dart Trap...): the marker's tile gets
// a colour wash and a dashed outline. The badges are drawn separately, on top of the figures.
function MarkerTiles({ markers }) {
  return (
    <g pointerEvents="none">
      {markers.map(({ marker, look, squares }) => {
        const xs = squares.map((sq) => sq.x)
        const ys = squares.map((sq) => sq.y)
        const [x0, y0] = [Math.min(...xs) * SQUARE, Math.min(...ys) * SQUARE]
        const [x1, y1] = [(Math.max(...xs) + 1) * SQUARE, (Math.max(...ys) + 1) * SQUARE]
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
function MarkerBadges({ markers, onTap }) {
  const seen = {}
  return markers.map(({ marker, look, squares, tile }) => {
    const n = (seen[tile] = (seen[tile] ?? -1) + 1)
    const cx = Math.min(...squares.map((sq) => sq.x)) * SQUARE + 22 + n * 40
    const cy = Math.min(...squares.map((sq) => sq.y)) * SQUARE + 22
    return (
      <g key={marker.id} data-marker={marker.id} className="cursor-pointer" onClick={() => onTap(marker.id)}>
        <circle cx={cx} cy={cy} r="18" fill="#18181b" stroke={look.color} strokeWidth="4" />
        <text x={cx} y={cy + 7} textAnchor="middle" fontSize="20">
          {look.icon}
        </text>
      </g>
    )
  })
}

// A round figure: its token art when there is some, else a coloured disc with its initial.
// The hero whose turn it is gets a pulsing gold glow so it is easy to spot.
function Token({ id, at, label, color, art, selected, active, faded, onTap }) {
  const cx = at[0] * SQUARE + SQUARE / 2
  const cy = at[1] * SQUARE + SQUARE / 2
  const r = SQUARE / 2 - 3
  const clip = `clip-${id.replace(/#/g, '-')}`
  return (
    <g data-token={id} onClick={onTap} className={onTap ? 'cursor-pointer' : undefined} opacity={faded ? 0.6 : 1}>
      {active && (
        <g pointerEvents="none" className="motion-safe:animate-pulse">
          <circle cx={cx} cy={cy} r={r + 8} fill="#facc15" fillOpacity="0.4" stroke="#422006" strokeWidth="2" />
          <circle cx={cx} cy={cy} r={r + 5} fill="none" stroke="#fde047" strokeWidth="4" />
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
    </g>
  )
}

// The size of an element, kept up to date as the screen turns or unfolds.
function useBoxSize() {
  const ref = useRef(null)
  const [size, setSize] = useState(null)
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }))
    watch.observe(ref.current)
    return () => watch.disconnect()
  }, [])
  return [ref, size]
}

// `fill`: the board takes the whole box it's in (the solo screen, the projector) and starts zoomed to fit,
// with + to zoom in on the active hero. Without it the board keeps its fixed zoom steps.
export default function Board({ state, dispatch, readOnly = false, fill = false, extraButtons = null }) {
  const art = useArt()
  const [picked, setPicked] = useState(null) // id of the figure being moved
  const [byHand, setByHand] = useState(false)
  const [reading, setReading] = useState(null) // id of the trap or hazard marker whose card is open
  const [zoom, setZoom] = useState(fill ? 'fit' : 4)
  const [boxRef, box] = useBoxSize()
  const board = state.board
  const activeId = state.heroes[state.turn.heroIndex]?.id
  const activeAt = board?.tokens[activeId]?.join(',')
  // Zoomed in, keep the active hero in the middle of the view as it moves or the turn passes.
  useEffect(() => {
    const el = boxRef.current
    if (!fill || zoom === 'fit' || !el || !activeAt) return
    const svg = el.querySelector('svg')
    const token = el.querySelector(`[data-token="${activeId}"]`)
    if (!svg || !token) return
    const [s, t] = [svg.getBoundingClientRect(), token.getBoundingClientRect()]
    el.scrollTo({ left: t.left - s.left + t.width / 2 - el.clientWidth / 2, top: t.top - s.top + t.height / 2 - el.clientHeight / 2, behavior: 'smooth' })
  }, [fill, zoom, activeId, activeAt]) // eslint-disable-line react-hooks/exhaustive-deps
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
  const markers = boardMarkers(state)
  const placedMarkers = markers.filter((m) => m.squares.length > 0)
  const open = markers.find((m) => m.marker.id === reading)
  // A hero lost in a Time Leap waits for their turn before coming back.
  const offBoard = figures.filter((f) => !board.tokens[f.id] && !state.heroes.some((h) => h.id === f.id && timeLeapt(h)))

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
  // Zoom to fit: the biggest size that shows the whole dungeon in the box. Zooming in from
  // there goes through the fixed steps bigger than it.
  const fitScale = box ? Math.min(box.w / (cols * SQUARE), box.h / (rows * SQUARE)) : 1
  const steps = fill ? ['fit', ...ZOOMS.map((_, i) => i).filter((i) => ZOOMS[i] > fitScale * 1.15)] : ZOOMS.map((_, i) => i)
  const step = Math.max(0, steps.indexOf(zoom))
  const fit = fill && steps[step] === 'fit'
  const scale = fit ? fitScale : ZOOMS[steps[step]]
  const left = active ? movesLeft(state, active) : 0
  // Read only and not filling a box: a small board to glance at.
  const small = readOnly && !fill

  return (
    <section className={`relative rounded-2xl border border-zinc-800 bg-zinc-950/80 ${fill ? 'flex h-full flex-col p-2' : 'p-3'}`}>
      {!readOnly && (
        <div className={`mb-2 flex items-center gap-2 ${fill ? '' : 'flex-wrap'}`}>
          <p className={`flex-1 text-zinc-300 ${fill ? 'text-xs leading-snug sm:text-sm' : 'text-sm'}`}>
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
          <Button className="!px-3 !py-1" disabled={step === 0} onClick={() => setZoom(steps[step - 1])} aria-label="Zoom out">−</Button>
          <Button className="!px-3 !py-1" disabled={step === steps.length - 1} onClick={() => setZoom(steps[step + 1])} aria-label="Zoom in">+</Button>
          <Button
            variant={byHand ? 'gold' : 'default'}
            className={`!py-1 text-sm ${fill ? '!px-2' : ''}`}
            title="Move by hand"
            onClick={() => {
              setByHand(!byHand)
              setPicked(null)
            }}
          >
            {fill ? '✋' : '✋ Move by hand'}
          </Button>
          {extraButtons}
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
      {markers.length > 0 && (
        <div className={`mb-2 flex items-center gap-2 ${fill ? 'overflow-x-auto whitespace-nowrap text-xs sm:text-sm' : 'flex-wrap text-sm'}`}>
          <span className="text-zinc-400">Markers:</span>
          {markers.map(({ marker, look, moves, squares }) => (
            <button
              key={marker.id}
              type="button"
              className={`shrink-0 rounded-full border-2 px-3 py-1 ${reading === marker.id ? 'bg-zinc-700' : 'bg-zinc-900'} text-zinc-100`}
              style={{ borderColor: look.color }}
              onClick={() => setReading(reading === marker.id ? null : marker.id)}
            >
              {look.icon} {marker.name}
              {squares.length === 0 && <span className="text-zinc-400">{moves ? ' (moves)' : ' (tile not known)'}</span>}
            </button>
          ))}
        </div>
      )}
      {open && (
        // Over the board when it fills the screen, so a phone's small board doesn't shrink further.
        <div className={`rounded-xl border-2 bg-zinc-900 p-3 ${fill ? 'absolute inset-x-2 bottom-2 z-[45] shadow-2xl shadow-black' : 'mb-2'}`} style={{ borderColor: open.look.color }}>
          <div className="flex items-start gap-2">
            <p className="flex-1 text-lg font-bold text-zinc-100">
              {open.look.icon} {open.marker.name} <span className="text-sm font-normal capitalize text-zinc-400">{open.marker.type}</span>
            </p>
            <Button className="!px-3 !py-1 text-sm" onClick={() => setReading(null)} aria-label="Close">
              ✕
            </Button>
          </div>
          {open.marker.card?.text && <p className="mt-1 whitespace-pre-line text-zinc-200">{open.marker.card.text}</p>}
          {open.moves && <p className="mt-1 text-sm text-amber-300">This marker moves when the trap goes off, so the board can't show where it is yet.</p>}
        </div>
      )}
      <div ref={boxRef} className={fill ? `min-h-0 flex-1 ${readOnly ? 'overflow-hidden' : 'overflow-auto'}` : readOnly ? '' : 'max-h-[70vh] overflow-auto'}>
        <svg
          viewBox={`${minX * SQUARE} ${minY * SQUARE} ${cols * SQUARE} ${rows * SQUARE}`}
          width={small || fit ? '100%' : cols * SQUARE * scale}
          height={small ? undefined : fit ? '100%' : rows * SQUARE * scale}
          className={small ? 'mx-auto max-h-[45vh]' : fit ? 'block' : 'mx-auto'}
          role="img"
          aria-label="The dungeon board"
        >
          <defs>
            <pattern id="board-dots" width={SQUARE} height={SQUARE} patternUnits="userSpaceOnUse">
              <circle cx={SQUARE / 2} cy={SQUARE / 2} r="1.5" fill="#334155" />
            </pattern>
          </defs>
          <rect x={minX * SQUARE} y={minY * SQUARE} width={cols * SQUARE} height={rows * SQUARE} fill="#0b1220" />
          <rect x={minX * SQUARE} y={minY * SQUARE} width={cols * SQUARE} height={rows * SQUARE} fill="url(#board-dots)" />
          {board.tiles.map((placed) => board.defs[placed.tileId] && <PlacedTile key={placed.uid} placed={placed} def={board.defs[placed.tileId]} />)}
          <MarkerTiles markers={placedMarkers} />
          <OpenEdges grid={grid} />
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
          {/* The active hero is drawn last so its glow sits on top of its neighbours. */}
          {[...onBoard.filter((f) => f.id !== activeId), ...onBoard.filter((f) => f.id === activeId)].map((f) => (
            <Token key={f.id} {...f} at={board.tokens[f.id]} active={f.id === activeId} selected={picked === f.id || (Boolean(powerMove) && !picked && movable.includes(f.id)) || (readOnly && f.id === activeId)} onTap={readOnly ? undefined : () => tapFigure(f.id)} />
          ))}
          <MarkerBadges markers={placedMarkers} onTap={(id) => setReading(reading === id ? null : id)} />
        </svg>
      </div>
    </section>
  )
}
