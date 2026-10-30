import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { heroArt, monsterArt } from '../data/art.js'
import { boardGrid, figureToken, figuresLeft, heroReach, moveSpeed, movesLeft, timeLeapt } from '../board/play.js'
import { moveChoices, movePrompt, moveTargets } from '../board/powerMoves.js'
import { key, STEP, unexploredEdges } from '../board/grid.js'
import { canFlyCarpet, carpetTargets } from '../board/items.js'
import { boardMarkers } from '../board/markers.js'
import { exitSquares } from '../board/exits.js'
import { escapeBlockers } from '../state/adventure.js'
import { activeVillains } from '../state/game.js'
import { artUrl, useArt } from '../state/useArt.js'
import HazardFloor, { hasHazardFloor } from './HazardFloor.jsx'
import { ClosedDoor, SQUARE, TileShapes } from './TileDrawing.jsx'
import { Button } from './ui.jsx'

// The virtual board (a solo game's, or the party's on the projector and iPads): the tiles laid so far and every figure on its square.
// Tap your hero to see where it can go, then tap a square to move there. "Move by hand"
// lets you put any figure on any free square, for anything the app doesn't move itself.

const TOKEN_COLORS = {
  sky: '#0ea5e9', red: '#ef4444', amber: '#f59e0b', emerald: '#10b981', violet: '#8b5cf6',
  teal: '#14b8a6', rose: '#f43f5e', orange: '#f97316', lime: '#84cc16', fuchsia: '#d946ef',
}
const ZOOMS = [0.6, 0.8, 1, 1.3, 1.6, 2, 2.5, 3]
// Room round the dungeon for the open-edge arrows, in board units.
const PAD = 32

// The dungeon's outline in board units: left, top, width and height.
export function boardBounds(board) {
  const squares = [...boardGrid(board).values()]
  if (squares.length === 0) return { x: 0, y: 0, w: SQUARE, h: SQUARE }
  const xs = squares.map((s) => s.x)
  const ys = squares.map((s) => s.y)
  const [x, y] = [Math.min(...xs) * SQUARE - PAD, Math.min(...ys) * SQUARE - PAD]
  return { x, y, w: (Math.max(...xs) + 1) * SQUARE + PAD - x, h: (Math.max(...ys) + 1) * SQUARE + PAD - y }
}

// A placed tile drawn in board squares: moved to its spot and turned.
function PlacedTile({ placed, def, spin }) {
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

// Trap and hazard markers on their tile. Lava Flow, Volcanic Vapors, Cave-in and Pit change the
// floor itself (HazardFloor); any other marker's tile gets a colour wash and a dashed outline.
// The badges are drawn separately, on top of the figures.
// The way out (the exit's stairs or ladder) in adventures that end with an escape: a faint
// outline while there's still work to do, a bright glow once the heroes can leave.
function ExitSquares({ squares, open }) {
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

function MarkerTiles({ markers }) {
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
function MarkerBadges({ markers, spin, onTap }) {
  const seen = {}
  return markers.map(({ marker, look, squares, tile }) => {
    const n = (seen[tile] = (seen[tile] ?? -1) + 1)
    const cx = Math.min(...squares.map((sq) => sq.x)) * SQUARE + 22 + n * 40
    const cy = Math.min(...squares.map((sq) => sq.y)) * SQUARE + 22
    return (
      <g key={marker.id} data-marker={marker.id} className="cursor-pointer" onClick={() => onTap(marker.id)}>
        <circle cx={cx} cy={cy} r="18" fill="#18181b" stroke={look.color} strokeWidth="4" />
        <text x={cx} y={cy + 7} textAnchor="middle" fontSize="20" transform={spin ? `rotate(${-spin} ${cx} ${cy})` : undefined}>
          {look.icon}
        </text>
      </g>
    )
  })
}

// A Treasure token lying on a square: a gold coin. Tap it to move it or hand it out.
function Coin({ item, selected, spin, onTap }) {
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

// The Flying Carpet: a purple rug under the square's figure. Tap it to move it by hand.
function Carpet({ item, selected, onTap }) {
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
function Token({ id, at, label, color, art, selected, active, faded, spin, onTap }) {
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
  // 'fit' (the whole dungeon fills the box) or how many screen pixels per board unit.
  const [zoom, setZoom] = useState(fill ? 'fit' : 1.6)
  const [boxRef, box] = useBoxSize()
  const board = state.board
  const activeId = state.heroes[state.turn.heroIndex]?.id
  const activeAt = board?.tokens[activeId]?.join(',')
  const live = useRef({}) // the latest sizes, for the pinch handlers
  const pinch = useRef(null)
  const pinched = useRef(false)
  // Where the dungeon itself is on screen (zoomed to fit, the svg has empty bands round it).
  const drawn = () => {
    const r = boxRef.current.querySelector('svg').getBoundingClientRect()
    const { scale, viewW, viewH } = live.current
    const [w, h] = [viewW * scale, viewH * scale]
    return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, width: w, height: h }
  }
  // Zoomed in, keep the active hero in the middle of the view as it moves or the turn passes
  // (but not straight after a pinch, which zooms on the fingers instead).
  useEffect(() => {
    const el = boxRef.current
    if (!fill || zoom === 'fit' || !el || !activeAt || pinched.current) return
    const token = el.querySelector(`[data-token="${activeId}"]`)
    if (!token) return
    const [b, t] = [el.getBoundingClientRect(), token.getBoundingClientRect()]
    el.scrollTo({ left: el.scrollLeft + t.left - b.left + t.width / 2 - el.clientWidth / 2, top: el.scrollTop + t.top - b.top + t.height / 2 - el.clientHeight / 2, behavior: 'smooth' })
  }, [fill, zoom, activeId, activeAt]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    pinched.current = false
  }, [activeId, activeAt])
  // Two fingers zoom the board (not the whole page); one finger scrolls it.
  useEffect(() => {
    const el = boxRef.current
    if (!fill || !el) return
    const gap = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const middle = (t) => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2]
    const start = (e) => {
      if (e.touches.length !== 2) return
      pinch.current = { gap: gap(e.touches), scale: live.current.scale }
    }
    const move = (e) => {
      if (e.touches.length !== 2 || !pinch.current) return
      e.preventDefault()
      const { fitScale } = live.current
      const next = Math.min(ZOOMS[ZOOMS.length - 1], (pinch.current.scale * gap(e.touches)) / pinch.current.gap)
      // Keep the board point under the fingers where it is.
      const r = drawn()
      const [mx, my] = middle(e.touches)
      live.current.anchor = { mx, my, fx: (mx - r.left) / r.width, fy: (my - r.top) / r.height }
      pinched.current = true
      setZoom(next <= fitScale * 1.05 ? 'fit' : next)
    }
    const end = (e) => {
      if (e.touches.length < 2) pinch.current = null
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
    }
  }, [fill]) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = boxRef.current
    const a = live.current.anchor
    if (!el || !a) return
    live.current.anchor = null
    const r = drawn()
    el.scrollLeft += r.left + a.fx * r.width - a.mx
    el.scrollTop += r.top + a.fy * r.height - a.my
  }, [zoom]) // eslint-disable-line react-hooks/exhaustive-deps
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
  // A hero lost in a Time Leap waits for their turn before coming back; one who escaped is gone.
  const exits = [...exitSquares(state)]
  const exitOpen = exits.length > 0 && !state.adventure?.escaped && escapeBlockers(state).length === 0
  const offBoard = figures.filter((f) => !board.tokens[f.id] && !state.heroes.some((h) => h.id === f.id && (timeLeapt(h) || h.escaped)))

  // Squares to light up: where the active hero can move, or every free floor square by hand.
  const taken = new Set(Object.values(board.tokens).map(key))
  // A power that moves a hero (Righteous Advance) takes over the taps until it's done.
  const powerMove = !readOnly && !byHand && state.turn.boardMove
  const movable = powerMove ? moveChoices(state) : []
  const swap = powerMove?.steps?.[0]?.to === 'swap'
  let targets = []
  // Watching someone else's turn, the board still zooms, and ✋ moves any figure by hand.
  const watching = readOnly && !byHand
  // The projector's board has no dispatch: nothing to tap there.
  const tools = !readOnly || (fill && Boolean(dispatch))
  const items = board.items ?? []
  const pickedItem = items.find((i) => i.id === picked)
  // A Treasure token goes on a free square of a tile with no hero on it (Hidden Treasure).
  const heroAreas = new Set(state.heroes.map((h) => board.tokens[h.id] && grid.get(key(board.tokens[h.id]))?.area))
  const itemSquares = new Set(items.filter((i) => i.at && i.id !== picked).map((i) => key(i.at)))
  // The Flying Carpet goes on any tile without a marker, under a hero if they like. The
  // hero standing on it can fly it instead of moving (FLY_CARPET).
  const carpet = items.find((i) => i.kind === 'carpet')
  const flying = picked === 'fly-carpet'
  const markerAreas = new Set(placedMarkers.flatMap((m) => m.tiles))
  const heroSquares = new Set(state.heroes.map((h) => board.tokens[h.id] && key(board.tokens[h.id])))
  // A trap that can move or spread more than one way (Rolling Boulder, Lava Flow) lights the
  // tiles it can go to, and a tap anywhere on one picks it.
  const trapPick = !readOnly && !byHand && !powerMove && state.turn.trapPick
  const trapPicking = trapPick ? (state.traps ?? []).find((t) => t.id === trapPick.trapId) : null
  if (trapPicking) {
    targets = [...grid.values()].filter((sq) => sq.floor && trapPick.tiles.includes(sq.area)).map((sq) => key([sq.x, sq.y]))
  } else if (flying) {
    targets = carpetTargets(state)
  } else if (tools && pickedItem?.kind === 'carpet') {
    targets = [...grid.values()].filter((sq) => sq.floor && !markerAreas.has(sq.area) && (!taken.has(key([sq.x, sq.y])) || heroSquares.has(key([sq.x, sq.y]))) && !itemSquares.has(key([sq.x, sq.y]))).map((sq) => key([sq.x, sq.y]))
  } else if (tools && pickedItem) {
    targets = [...grid.values()].filter((sq) => sq.floor && !heroAreas.has(sq.area) && !taken.has(key([sq.x, sq.y])) && !itemSquares.has(key([sq.x, sq.y]))).map((sq) => key([sq.x, sq.y]))
  } else if (!watching && picked) {
    if (powerMove) targets = moveTargets(state, picked)
    else if (byHand) targets = [...grid.values()].filter((sq) => sq.floor && !taken.has(key([sq.x, sq.y]))).map((sq) => key([sq.x, sq.y]))
    else if (picked === active?.id) targets = heroReach(state, active)
  }
  const tapSquare = (sq) => {
    if (trapPicking && targets.includes(key(sq))) {
      dispatch({ type: 'TRAP_STEP', trapId: trapPicking.id, tile: grid.get(key(sq)).area })
      return
    }
    if (!picked || !targets.includes(key(sq))) return
    if (flying) {
      dispatch({ type: 'FLY_CARPET', to: sq })
      setPicked(null)
      return
    }
    if (pickedItem) {
      dispatch({ type: 'PLACE_ITEM', id: picked, to: sq })
      setPicked(null)
      return
    }
    dispatch(powerMove ? { type: 'BOARD_MOVE', id: picked, to: sq } : byHand ? { type: 'MOVE_TOKEN', id: picked, to: sq } : { type: 'MOVE_HERO', heroId: picked, to: sq })
    setPicked(null)
  }
  const tapFigure = (id) => {
    if (watching) return
    if (trapPicking) {
      tapSquare(board.tokens[id])
      return
    }
    // The carpet can go down under a hero: their token covers the lit square.
    if (pickedItem?.kind === 'carpet' && board.tokens[id] && targets.includes(key(board.tokens[id]))) {
      tapSquare(board.tokens[id])
      return
    }
    if (powerMove ? !movable.includes(id) : !byHand && id !== active?.id) return
    if (swap) {
      dispatch({ type: 'BOARD_MOVE', id })
      return
    }
    setPicked(picked === id ? null : id)
  }

  const bounds = boardBounds(board)
  // A long, thin dungeon in a box the other shape (a tall one on the projector's wide
  // screen) turns a quarter turn when that makes it clearly bigger. The figures stay upright.
  const fitFor = (w, h) => (box ? Math.min(box.w / w, box.h / h) : 1)
  const spin = fill && fitFor(bounds.h, bounds.w) > fitFor(bounds.w, bounds.h) * 1.2 ? 90 : 0
  const [viewW, viewH] = spin ? [bounds.h, bounds.w] : [bounds.w, bounds.h]
  // rotate(90) sends (x, y) to (-y, x), so the turned dungeon sits left of the origin.
  const viewBox = spin ? `${-(bounds.y + bounds.h)} ${bounds.x} ${bounds.h} ${bounds.w}` : `${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`
  // Zoom to fit: the biggest size that shows the whole dungeon in the box. The buttons step
  // through the fixed sizes bigger than it; a pinch goes anywhere in between.
  const fitScale = fitFor(viewW, viewH)
  const fit = fill && zoom === 'fit'
  const scale = fit ? fitScale : zoom
  const sizes = fill ? ZOOMS.filter((z) => z > fitScale * 1.15) : ZOOMS
  const zoomOut = fit ? null : [...sizes].reverse().find((z) => z < scale / 1.05) ?? (fill ? 'fit' : null)
  const zoomIn = sizes.find((z) => z > (fit ? fitScale : scale) * 1.05) ?? null
  const zoomTo = (z) => {
    pinched.current = false
    setZoom(z)
  }
  live.current.scale = scale
  live.current.fitScale = fitScale
  live.current.viewW = viewW
  live.current.viewH = viewH
  const left = active ? movesLeft(state, active) : 0
  // Read only and not filling a box: a small board to glance at.
  const small = readOnly && !fill

  return (
    <section className={`relative rounded-2xl border border-zinc-800 bg-zinc-950/80 ${fill ? 'flex h-full flex-col p-2' : 'p-3'}`}>
      {tools && (
        <div className={`mb-2 flex items-center gap-2 ${fill ? '' : 'flex-wrap'}`}>
          <p className={`flex-1 text-zinc-300 ${fill ? 'text-xs leading-snug sm:text-sm' : 'text-sm'}`}>
            {flying
              ? `Tap a lit square: the carpet flies ${active.name} up to 1 tile.`
              : pickedItem
              ? `Tap a lit square to put the ${pickedItem.kind === 'carpet' ? 'Flying Carpet' : 'Treasure token'} there.`
              : watching
              ? `${active?.name ?? 'Someone'}'s turn. ✋ moves a figure by hand.`
              : byHand
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
          <Button className="min-h-10 min-w-10 !px-3 !py-1" disabled={zoomOut === null} onClick={() => zoomTo(zoomOut)} aria-label="Zoom out">−</Button>
          <Button className="min-h-10 min-w-10 !px-3 !py-1" disabled={zoomIn === null} onClick={() => zoomTo(zoomIn)} aria-label="Zoom in">+</Button>
          <Button
            variant={byHand ? 'gold' : 'default'}
            className={`min-h-10 min-w-10 !py-1 text-sm ${fill ? '!px-2' : ''}`}
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
      {trapPicking && (
        <p className="mb-2 rounded-xl bg-amber-950/60 p-2 text-amber-200">
          <b>{trapPicking.name}:</b> {trapPicking.cardId === 'lava-flow' ? 'tap a lit tile for the lava to spread to.' : 'two ways are just as close. Tap the lit tile it moves to.'}
        </p>
      )}
      {tools && offBoard.length > 0 && (
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
      {tools && (byHand || items.length > 0) && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
          {items.filter((i) => !i.at).map((i) => (
            <button
              key={i.id}
              type="button"
              className={`rounded-full px-3 py-1 font-semibold ${picked === i.id ? 'bg-amber-500 text-zinc-950' : 'bg-amber-900 text-amber-100 motion-safe:animate-pulse'}`}
              onClick={() => setPicked(picked === i.id ? null : i.id)}
            >
              {i.kind === 'carpet'
                ? `🧞 ${picked === i.id ? 'Tap a lit square (a tile with no marker)' : 'Put the Flying Carpet down'}`
                : `💰 ${picked === i.id ? 'Tap a lit square (a tile with no hero)' : 'Put the Treasure token down'}`}
            </button>
          ))}
          {!readOnly && carpet?.at && canFlyCarpet(state, active) && (
            <button
              type="button"
              className={`rounded-full px-3 py-1 font-semibold ${flying ? 'bg-amber-500 text-zinc-950' : 'bg-violet-800 text-violet-100'}`}
              onClick={() => {
                setByHand(false)
                setPicked(flying ? null : 'fly-carpet')
              }}
            >
              🧞 {flying ? 'Tap a lit square (up to 1 tile away)' : 'Fly the carpet instead of moving'}
            </button>
          )}
          {pickedItem?.kind === 'carpet' && pickedItem.at && (
            <>
              <span className="text-amber-200">🧞 Flying Carpet: tap a lit square to move it by hand, or</span>
              <Button variant="ghost" className="!py-1 text-sm" onClick={() => { setPicked(null); dispatch({ type: 'REMOVE_ITEM', id: pickedItem.id }) }}>
                Remove it
              </Button>
            </>
          )}
          {pickedItem?.kind !== 'carpet' && pickedItem?.at && (
            <>
              <span className="text-amber-200">💰 Treasure token: tap a lit square to move it, or</span>
              {active && (
                <Button className="!py-1 text-sm" onClick={() => { setPicked(null); dispatch({ type: 'PICK_UP_TREASURE', id: pickedItem.id, heroId: active.id }) }}>
                  {active.name} picks it up
                </Button>
              )}
              <Button variant="ghost" className="!py-1 text-sm" onClick={() => { setPicked(null); dispatch({ type: 'REMOVE_ITEM', id: pickedItem.id }) }}>
                Remove it
              </Button>
            </>
          )}
          {byHand && !pickedItem && (
            <Button className="!py-1 text-sm" onClick={() => dispatch({ type: 'ADD_TREASURE_TOKEN' })}>
              + 💰 Treasure token
            </Button>
          )}
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
          {open.moves && open.squares.length === 0 && <p className="mt-1 text-sm text-amber-300">This marker went down before the board followed moving traps, so the board can't show where it is.</p>}
        </div>
      )}
      <div ref={boxRef} className={fill ? 'min-h-0 flex-1 touch-pan-x touch-pan-y overflow-auto' : readOnly ? '' : 'max-h-[70vh] overflow-auto'}>
        <svg
          viewBox={viewBox}
          width={small || fit ? '100%' : viewW * scale}
          height={small ? undefined : fit ? '100%' : viewH * scale}
          className={small ? 'mx-auto max-h-[45vh]' : fit ? 'block' : 'mx-auto'}
          role="img"
          aria-label="The dungeon board"
        >
          <defs>
            <pattern id="board-dots" width={SQUARE} height={SQUARE} patternUnits="userSpaceOnUse">
              <circle cx={SQUARE / 2} cy={SQUARE / 2} r="1.5" fill="#334155" />
            </pattern>
          </defs>
          <g transform={spin ? `rotate(${spin})` : undefined}>
            <rect x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h} fill="#0a0c10" />
            <rect x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h} fill="url(#board-dots)" opacity="0.6" />
            {board.tiles.map((placed) => board.defs[placed.tileId] && <PlacedTile key={placed.uid} placed={placed} def={board.defs[placed.tileId]} spin={spin} />)}
            <MarkerTiles markers={placedMarkers} />
            {(board.doors ?? []).map((door) => (
              <ClosedDoor key={door.id} squares={door.squares} kind={door.kind} special={Boolean(door.reveal)} spin={spin} />
            ))}
            <OpenEdges grid={grid} />
            <ExitSquares squares={exits} open={exitOpen} />
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
            {items.filter((i) => i.at && i.kind === 'carpet').map((i) => (
              <Carpet key={i.id} item={i} selected={picked === i.id} onTap={tools ? () => setPicked(picked === i.id ? null : i.id) : undefined} />
            ))}
            {items.filter((i) => i.at && i.kind !== 'carpet').map((i) => (
              <Coin key={i.id} item={i} spin={spin} selected={picked === i.id} onTap={tools ? () => setPicked(picked === i.id ? null : i.id) : undefined} />
            ))}
            {/* The active hero is drawn last so its glow sits on top of its neighbours. */}
            {[...onBoard.filter((f) => f.id !== activeId), ...onBoard.filter((f) => f.id === activeId)].map((f) => (
              <Token key={f.id} {...f} spin={spin} at={board.tokens[f.id]} active={f.id === activeId} selected={picked === f.id || (Boolean(powerMove) && !picked && movable.includes(f.id)) || (readOnly && f.id === activeId)} onTap={watching ? undefined : () => tapFigure(f.id)} />
            ))}
            <MarkerBadges markers={placedMarkers} spin={spin} onTap={(id) => setReading(reading === id ? null : id)} />
          </g>
        </svg>
      </div>
    </section>
  )
}
