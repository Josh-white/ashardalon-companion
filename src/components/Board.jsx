import { useEffect, useRef, useState } from 'react'
import { heroArt, monsterArt } from '../data/art.js'
import { boardGrid, figureToken, figuresLeft, moveSpeed, movesLeft, timeLeapt } from '../board/play.js'
import { moveChoices, movePrompt } from '../board/powerMoves.js'
import { key } from '../board/grid.js'
import { adventureTokenSpots, canFlyCarpet } from '../board/items.js'
import { HERO_TOKENS, isHeroToken, movableToken } from '../board/heroTokens.js'
import { boardMarkers } from '../board/markers.js'
import { exitSquares } from '../board/exits.js'
import { tapTargets } from '../board/taps.js'
import { escapeBlockers } from '../state/adventure.js'
import { activeVillains } from '../state/game.js'
import { artUrl, useArt } from '../state/useArt.js'
import { Carpet, Coin, ExitSquares, figureBadges, HeroTokenMark, heroTokenGroups, MarkerBadges, MarkerTiles, NewTileGlow, OpenEdges, PlacedTile, QuestToken, Token } from './BoardPieces.jsx'
import { dropStyle, useFreshTiles } from './useFreshTiles.js'
import { ClosedDoor, SQUARE } from './TileDrawing.jsx'
import { useBoardZoom } from './useBoardZoom.js'
import { useAimed } from './useAimed.js'
import Torchlight, { lightSources, useTorchlight } from './Torchlight.jsx'
import { Button } from './ui.jsx'
import AttackFx, { quakeDelay, quakes, tokenFx, useAttackFx } from './AttackFx.jsx'
import { HealFloat, useHealFx } from './HealFx.jsx'
import MonsterPeek, { peekTarget } from './MonsterPeek.jsx'

// The virtual board (a solo game's, or the party's on the projector and iPads): the tiles laid so far and every figure on its square.
// Tap your hero to see where it can go, then tap a square to move there. "Move by hand"
// lets you put any figure on any free square, for anything the app doesn't move itself.

const TOKEN_COLORS = {
  sky: '#0ea5e9', red: '#ef4444', amber: '#f59e0b', emerald: '#10b981', violet: '#8b5cf6',
  teal: '#14b8a6', rose: '#f43f5e', orange: '#f97316', lime: '#84cc16', fuchsia: '#d946ef',
}
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

// `fill`: the board takes the whole box it's in (the solo screen, the projector) and starts zoomed to fit,
// with + to zoom in on the active hero. Without it the board keeps its fixed zoom steps.
// `calm` (iPads, phones, the table screen): the torchlight, the open edges and the hazard
// floors stand still, so the board isn't redrawn many times a second all game. The big
// screen keeps them moving. Attacks still fly and the active hero still glows.
export default function Board({ state, dispatch, readOnly = false, fill = false, calm = false, extraButtons = null }) {
  const art = useArt()
  const [picked, setPicked] = useState(null) // id of the figure being moved
  const [byHand, setByHand] = useState(false)
  const [reading, setReading] = useState(null) // id of the trap or hazard marker whose card is open
  const [peek, setPeek] = useState(null) // token id of the monster whose card is open (tapped on the board)
  const [torch, toggleTorch] = useTorchlight()
  const board = state.board
  const activeId = state.heroes[state.turn.heroIndex]?.id
  const activeAt = board?.tokens[activeId]?.join(',')
  const bounds = board ? boardBounds(board) : null
  // Monsters picked in this screen's attack box glow red, and the last one picked is brought
  // into view at the zoom the board is at (a group like the Legion Devils glows together).
  const aimed = useAimed()
  // The monster or villain taking its turn in the Villain Phase glows on every screen, and
  // comes into view on a zoomed-in board (the first figure of a group).
  const acting = state.turn.acting && !(state.turn.acted ?? []).includes(state.turn.acting) ? state.turn.acting : null
  const focusId = aimed.length ? aimed[aimed.length - 1] : acting && board?.tokens[acting] ? acting : null
  // A tile just laid glows for a few seconds while the board glides to its new fit.
  const fresh = useFreshTiles(board?.tiles)
  // The tiles still dropping in (and the figures on them) wait for the board to move first.
  const freshUids = new Set(fresh && !fresh.landed ? fresh.uids : [])
  const { boxRef, spin, viewW, viewH, viewBox, fit, scale, zoomIn, zoomOut, zoomTo } = useBoardZoom({ fill, bounds, activeId, activeAt, focusId, freshKey: fresh?.key })
  // An attack flying across the board (Colton's idea), once its die has been read.
  const playing = useAttackFx(state.moment)
  // A hero gaining HP: a green +N floats up from the token.
  const heals = useHealFx(state.healFx, state.moment)
  const anchorRef = useRef(null)
  const svgRef = useRef(null)
  // The lava's flow and the exit's glow are SVG animations, which CSS can't stop: pause them.
  useEffect(() => {
    if (calm) svgRef.current?.pauseAnimations?.()
    else svgRef.current?.unpauseAnimations?.()
  })
  if (!board) return null

  const grid = boardGrid(board)
  const active = state.heroes[state.turn.heroIndex]
  const figures = [
    ...state.heroes.map((h) => ({ id: h.id, label: h.name, color: TOKEN_COLORS[h.color] ?? '#71717a', art: artUrl(art, heroArt(h.key)), faded: h.hp <= 0, badges: figureBadges(h) })),
    ...state.monsters.flatMap((m) =>
      Array.from({ length: figuresLeft(m) }, (_, i) => ({ id: figureToken(m.id, i + 1), label: figuresLeft(m) > 1 ? `${m.name} ${i + 1}` : m.name, color: '#7f1d1d', art: artUrl(art, monsterArt(m)), badges: figureBadges(m) })),
    ),
    ...activeVillains(state).map((v) => ({ id: v.id, label: v.name, color: '#581c87', art: artUrl(art, monsterArt(v)), badges: figureBadges(v) })),
    ...(state.villagers ?? []).filter((v) => !v.removed).map((v) => ({ id: v.id, label: v.name, color: '#065f46' })),
  ]
  const onBoard = figures.filter((f) => board.tokens[f.id])
  // Figures standing on a tile that's still dropping in show up once it's down.
  const arriving = (at) => freshUids.size > 0 && Boolean(at) && freshUids.has(grid.get(key(at))?.area)
  const markers = boardMarkers(state)
  const placedMarkers = markers.filter((m) => m.squares.length > 0)
  const questTokens = adventureTokenSpots(state)
  const open = markers.find((m) => m.marker.id === reading)
  // A hero lost in a Time Leap waits for their turn before coming back; one who escaped is gone.
  const exits = [...exitSquares(state)]
  const exitOpen = exits.length > 0 && !state.adventure?.escaped && escapeBlockers(state).length === 0
  const offBoard = figures.filter((f) => !board.tokens[f.id] && !state.heroes.some((h) => h.id === f.id && (timeLeapt(h) || h.escaped)))

  // A power that moves a hero (Righteous Advance) takes over the taps until it's done.
  const powerMove = !readOnly && !byHand && state.turn.boardMove
  const movable = powerMove ? moveChoices(state) : []
  const swap = powerMove?.steps?.[0]?.to === 'swap'
  // Watching someone else's turn, the board still zooms, and ✋ moves any figure by hand.
  const watching = readOnly && !byHand
  // The projector's board has no dispatch: nothing to tap there.
  const tools = !readOnly || (fill && Boolean(dispatch))
  const items = board.items ?? []
  const ownerName = (item) => state.heroes.find((h) => h.id === item.owner)?.name ?? 'The hero'
  const pickedItem = items.find((i) => i.id === picked)
  // The hero standing on the Flying Carpet can fly it instead of moving (FLY_CARPET).
  const carpet = items.find((i) => i.kind === 'carpet')
  const flying = picked === 'fly-carpet'
  // A trap that can move or spread more than one way (Rolling Boulder, Lava Flow): pick its tile.
  const trapPick = !readOnly && !byHand && !powerMove && state.turn.trapPick
  const trapPicking = trapPick ? (state.traps ?? []).find((t) => t.id === trapPick.trapId) : null
  // Squares to light up (board/taps.js).
  const targets = tapTargets(state, { picked, byHand, tools, watching, powerMove, trapPick: trapPicking ? trapPick : null })
  const tapSquare = (sq) => {
    setPeek(null)
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
    if (isHeroToken(pickedItem) && pickedItem.at && !byHand) {
      dispatch({ type: 'MOVE_HERO_ITEM', id: picked, to: sq })
      setPicked(null)
      return
    }
    if (pickedItem) {
      dispatch({ type: 'PLACE_ITEM', id: picked, to: sq })
      // The Blade Barrier's five (and the three Caltrops) go down one after another.
      const nextOne = isHeroToken(pickedItem) && !pickedItem.at && items.find((i) => i.id !== picked && !i.at && i.kind === pickedItem.kind && i.owner === pickedItem.owner)
      setPicked(nextOne ? nextOne.id : null)
      return
    }
    dispatch(powerMove ? { type: 'BOARD_MOVE', id: picked, to: sq } : byHand ? { type: 'MOVE_TOKEN', id: picked, to: sq } : { type: 'MOVE_HERO', heroId: picked, to: sq })
    setPicked(null)
  }
  // A tap on a monster or villain that does nothing else shows which one it is.
  const peekAt = (id) => {
    if (!peekTarget(state, id)) {
      setPeek(null)
      return
    }
    setReading(null)
    setPeek(peek === id ? null : id)
  }
  const tapFigure = (id) => {
    if (watching) {
      peekAt(id)
      return
    }
    if (trapPicking) {
      tapSquare(board.tokens[id])
      return
    }
    // The carpet can go down under a hero: their token covers the lit square.
    if (pickedItem?.kind === 'carpet' && board.tokens[id] && targets.includes(key(board.tokens[id]))) {
      tapSquare(board.tokens[id])
      return
    }
    if (powerMove ? !movable.includes(id) : !byHand && id !== active?.id) {
      peekAt(id)
      return
    }
    setPeek(null)
    if (swap) {
      dispatch({ type: 'BOARD_MOVE', id })
      return
    }
    setPicked(picked === id ? null : id)
  }

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
              : isHeroToken(pickedItem)
              ? pickedItem.at && !byHand
                ? targets.length > 0
                  ? `Tap a lit square: the ${HERO_TOKENS[pickedItem.kind].name} moves up to 1 tile, instead of ${ownerName(pickedItem)} moving.`
                  : `The ${HERO_TOKENS[pickedItem.kind].name} can only move in ${ownerName(pickedItem)}'s Hero Phase, instead of moving.`
                : `Tap a lit square to put the ${HERO_TOKENS[pickedItem.kind].name} token there.`
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
          <Button
            variant={torch ? 'gold' : 'default'}
            className={`min-h-10 min-w-10 !py-1 text-sm ${fill ? '!px-2' : ''}`}
            title={torch ? 'Turn torchlight off' : 'Turn torchlight on'}
            aria-pressed={torch}
            onClick={toggleTorch}
          >
            {fill ? '🔥' : '🔥 Torchlight'}
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
          {heroTokenGroups(items).map(({ first, left, kind, owner }) => (
            <button
              key={`${kind}-${owner}`}
              type="button"
              className={`rounded-full px-3 py-1 font-semibold ${items.some((i) => i.id === picked && i.kind === kind && i.owner === owner) ? 'bg-amber-500 text-zinc-950' : 'bg-amber-900 text-amber-100 motion-safe:animate-pulse'}`}
              onClick={() => setPicked(picked === first.id ? null : first.id)}
            >
              {HERO_TOKENS[kind].icon} Put down {ownerName(first)}'s {HERO_TOKENS[kind].name}{left > 1 ? ` (${left} tokens)` : ''}
            </button>
          ))}
          {!readOnly && items.filter((i) => isHeroToken(i) && i.at && movableToken(state, active, i)).map((i) => (
            <button
              key={`move-${i.id}`}
              type="button"
              className={`rounded-full px-3 py-1 font-semibold ${picked === i.id ? 'bg-amber-500 text-zinc-950' : 'bg-violet-800 text-violet-100'}`}
              onClick={() => {
                setByHand(false)
                setPicked(picked === i.id ? null : i.id)
              }}
            >
              {HERO_TOKENS[i.kind].icon} {picked === i.id ? 'Tap a lit square (up to 1 tile away)' : `Move the ${HERO_TOKENS[i.kind].name} instead of moving`}
            </button>
          ))}
          {items.filter((i) => !i.at && !isHeroToken(i)).map((i) => (
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
          {pickedItem?.kind === 'treasure' && pickedItem?.at && (
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
              onClick={() => { setPeek(null); setReading(reading === marker.id ? null : marker.id) }}
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
      {peek && <MonsterPeek state={state} tokenId={peek} fill={fill} onClose={() => setPeek(null)} />}
      {/* A tap anywhere on the board but a figure closes the monster's card. */}
      <div ref={boxRef} onClick={peek ? (e) => { if (!e.target.closest?.('[data-token]')) setPeek(null) } : undefined} className={fill ? 'min-h-0 flex-1 touch-pan-x touch-pan-y overflow-auto' : readOnly ? '' : 'max-h-[70vh] overflow-auto'}>
        <svg
          ref={svgRef}
          viewBox={viewBox}
          width={small || fit ? '100%' : viewW * scale}
          height={small ? undefined : fit ? '100%' : viewH * scale}
          className={`${small ? 'mx-auto max-h-[45vh]' : fit ? 'block' : 'mx-auto'} ${quakes(playing) ? 'fx-quake' : ''} ${calm ? 'board-calm' : ''}`}
          style={quakes(playing) ? { '--fx-delay': quakeDelay() } : undefined}
          role="img"
          aria-label="The dungeon board"
        >
          <defs>
            <pattern id="board-dots" width={SQUARE} height={SQUARE} patternUnits="userSpaceOnUse">
              <circle cx={SQUARE / 2} cy={SQUARE / 2} r="1.5" fill="#334155" />
            </pattern>
          </defs>
          <g transform={spin ? `rotate(${spin})` : undefined}>
            <g ref={anchorRef} />
            <rect x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h} fill="#0a0c10" />
            <rect x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h} fill="url(#board-dots)" opacity="0.6" />
            {/* A tile just laid waits for the board to move, then drops in (useFreshTiles). */}
            {board.tiles.map((placed) => board.defs[placed.tileId] && (
              <g key={placed.uid} className={freshUids.has(placed.uid) ? 'tile-drop' : undefined} style={freshUids.has(placed.uid) ? dropStyle : undefined} data-dropping={freshUids.has(placed.uid) ? '' : undefined}>
                <PlacedTile placed={placed} def={board.defs[placed.tileId]} spin={spin} />
              </g>
            ))}
            <MarkerTiles markers={placedMarkers} />
            {(board.doors ?? []).map((door) => (
              <ClosedDoor key={door.id} squares={door.squares} kind={door.kind} special={Boolean(door.reveal)} spin={spin} />
            ))}
            {/* Open edges, exits, lit squares and figures stay on top of the dark. */}
            {torch && <Torchlight bounds={bounds} lights={lightSources({ heroes: state.heroes, tokens: board.tokens, activeId, markers: placedMarkers })} />}
            {fresh && <NewTileGlow key={fresh.key} grid={grid} uids={fresh.uids} style={dropStyle} />}
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
            {questTokens.map((spot) => (
              <QuestToken key={spot.name} spot={spot} spin={spin} />
            ))}
            {items.filter((i) => i.at && i.kind === 'carpet').map((i) => (
              <Carpet key={i.id} item={i} selected={picked === i.id} onTap={tools ? () => setPicked(picked === i.id ? null : i.id) : undefined} />
            ))}
            {items.filter((i) => i.at && isHeroToken(i)).map((i) => (
              <HeroTokenMark key={i.id} item={i} spin={spin} count={i.kind === 'sphere' ? state.heroes.find((h) => h.id === i.owner)?.tokens?.flamingSphere : null} selected={picked === i.id} onTap={tools ? () => setPicked(picked === i.id ? null : i.id) : undefined} />
            ))}
            {items.filter((i) => i.at && i.kind === 'treasure').map((i) => (
              <Coin key={i.id} item={i} spin={spin} selected={picked === i.id} onTap={tools ? () => setPicked(picked === i.id ? null : i.id) : undefined} />
            ))}
            {/* The active hero is drawn last so its glow sits on top of its neighbours. */}
            {[...onBoard.filter((f) => f.id !== activeId), ...onBoard.filter((f) => f.id === activeId)].map((f) => (
              // An attack makes its target flinch or dodge, and a sword swing lunges in.
              <g key={f.id} {...tokenFx(playing, board.tokens[f.id])}>
                <g className={arriving(board.tokens[f.id]) ? 'figure-arrive' : undefined} style={arriving(board.tokens[f.id]) ? dropStyle : undefined}>
                <Token {...f} spin={spin} at={board.tokens[f.id]} active={f.id === activeId} aimed={aimed.includes(f.id.split('#')[0])} acting={acting === f.id.split('#')[0]} selected={picked === f.id || (Boolean(powerMove) && !picked && movable.includes(f.id)) || (readOnly && f.id === activeId)} onTap={watching && !peekTarget(state, f.id) ? undefined : () => tapFigure(f.id)} />
                </g>
              </g>
            ))}
            <MarkerBadges markers={placedMarkers} spin={spin} taken={new Set([...Object.values(board.tokens), ...items.filter((i) => i.at).map((i) => i.at), ...questTokens.map((q) => q.at)].map(key))} onTap={(id) => { setPeek(null); setReading(reading === id ? null : id) }} />
            {heals.filter((h) => board.tokens[h.heroId]).map((h) => (
              <HealFloat key={h.key} at={board.tokens[h.heroId]} amount={h.amount} delay={h.delay} spin={spin} />
            ))}
          </g>
        </svg>
      </div>
      <AttackFx playing={playing} anchorRef={anchorRef} artFor={(name) => artUrl(art, name)} />
    </section>
  )
}
