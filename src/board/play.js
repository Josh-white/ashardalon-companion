// The virtual board inside the saved game (state.board), for solo games played without
// the physical tiles. Normal games have no board (null) and nothing here runs for them.
//
// state.board = {
//   defs: { [tileId]: tile layout },        the layouts of the tiles on the board
//   tiles: [{ uid, tileId, at, turn }],     where each tile sits (state/grid.js)
//   tokens: { [figure id]: [x, y] },        heroes, monsters and villains on their squares
//   pile: [tileId],                         the regular tiles not drawn yet, shuffled
// }
// The moves the active hero has made this turn live in state.turn.boardMoves, and the tiles
// laid this turn in state.turn.boardTiles ([{ uid, side, filled }]), so a new turn starts
// with none.

import { buildGrid, key, placeTile, scorchSquare, unexploredEdges } from './grid.js'
import { distances, reachable } from './paths.js'

// The board's grid, worked out once per board (the board object changes on every move).
const grids = new WeakMap()
export function boardGrid(board) {
  if (!grids.has(board)) grids.set(board, buildGrid(board, Object.values(board.defs)))
  return grids.get(board)
}

// The squares next to the Start tile's stairs where the heroes begin, in turn order.
function startSquares(def) {
  const stairs = def.features.find((f) => f.type === 'stairs')?.at ?? []
  const onStairs = new Set(stairs.map(key))
  const floor = []
  def.rows.forEach((row, y) => [...row].forEach((ch, x) => ch !== '#' && !onStairs.has(key([x, y])) && floor.push([x, y])))
  const touching = (sq) => stairs.some(([sx, sy]) => Math.max(Math.abs(sx - sq[0]), Math.abs(sy - sq[1])) === 1)
  return [...floor.filter(touching), ...floor.filter((sq) => !touching(sq))]
}

// The same shuffle as the decks (random numbers sent by the device, so Undo works).
function shuffle(list, random = []) {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const r = Number(random[i])
    const j = Number.isFinite(r) && r >= 0 && r < 1 ? Math.floor(r * (i + 1)) : i
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// A new board: the Start tile with the heroes next to its stairs, and the regular tiles
// shuffled into a pile. Null when the tile layouts have no start tile.
export function newBoard(tiles, heroes, random) {
  const list = Array.isArray(tiles) ? tiles : []
  const start = list.find((t) => t.id === 'start') ?? list.find((t) => t.kind === 'start')
  if (!start) return null
  const spots = startSquares(start)
  return {
    defs: Object.fromEntries(list.map((t) => [t.id, t])),
    tiles: [{ uid: 'start', tileId: start.id, at: [0, 0], turn: 0 }],
    tokens: Object.fromEntries(heroes.map((h, i) => [h.id, spots[i % spots.length]])),
    pile: shuffle(list.filter((t) => t.kind === 'regular').map((t) => t.id), random),
  }
}

const activeAt = (state) => state.board?.tokens[state.heroes[state.turn.heroIndex]?.id] ?? null

// The unexplored edges the active hero stands on (a corner square can touch two).
export function heroEdges(state) {
  const at = activeAt(state)
  if (!at) return []
  return unexploredEdges(boardGrid(state.board)).filter((e) => e.squares.some((sq) => key(sq) === key(at)))
}

// Where a drawn tile goes: the edge the hero explores, a long hallway's far end, or for a
// card that draws a tile, the unexplored edge closest to the hero.
function edgeFor(state, grid, drawKey, edgeId) {
  const edges = unexploredEdges(grid)
  if (drawKey === 'explore') {
    const mine = heroEdges(state)
    return mine.find((e) => e.id === edgeId) ?? mine[0] ?? null
  }
  const last = (state.turn.boardTiles ?? []).at(-1)
  if (drawKey.startsWith('hallway-')) return last ? edges.find((e) => e.tile === last.uid && e.side === last.side) ?? null : null
  // A monster that explores (the Duergar Guard) puts the tile next to its own tile.
  const monsterAt = drawKey.startsWith('monster-') && state.board.tokens[drawKey.slice('monster-'.length)]
  if (monsterAt) {
    const tile = grid.get(key(monsterAt))?.tile
    const far = distances(grid, monsterAt)
    const steps = (e) => Math.min(...e.squares.map((sq) => far.get(key(sq)) ?? Infinity))
    return edges.filter((e) => e.tile === tile).sort((a, b) => steps(a) - steps(b))[0] ?? null
  }
  const at = activeAt(state)
  if (!at) return null
  const far = distances(grid, at)
  const steps = (e) => Math.min(...e.squares.map((sq) => far.get(key(sq)) ?? Infinity))
  return [...edges].sort((a, b) => steps(a) - steps(b))[0] ?? null
}

// A tile drawn from the stack goes on the board: '' is the next regular tile of the pile,
// anything else is a special tile by name. Returns the new state and the tile laid (or
// null when there was no tile for it or no room, so the player puts it by hand).
export function layTile(state, drawn, drawKey = 'explore', edgeId) {
  const board = state.board
  if (!board || typeof drawn !== 'string') return { state, def: null }
  let pile = board.pile ?? []
  let def
  if (drawn === '') {
    def = board.defs[pile[0]]
    pile = pile.slice(1)
  } else {
    def = Object.values(board.defs).find((d) => d.name.toLowerCase() === drawn.toLowerCase())
  }
  const withPile = { ...state, board: { ...board, pile } }
  if (!def) return { state: withPile, def: null }
  const grid = boardGrid(board)
  const edge = edgeFor(state, grid, drawKey, edgeId)
  const uid = `t${board.tiles.length}`
  const laid = edge && placeTile(withPile.board, grid, edge, def, uid)
  if (!laid) return { state: withPile, def: null }
  // The long hallway's monster goes on the tile at its far end, so it takes none itself.
  const entry = { uid, side: edge.side, filled: def.name === 'Long Hallway' }
  return { state: { ...withPile, board: laid, turn: { ...state.turn, boardTiles: [...(state.turn.boardTiles ?? []), entry] } }, def }
}

// Monsters and villains that just came into play go on the scorch mark of the tile laid
// this turn that hasn't had its monster yet (the nearest free squares when there are several).
// Anything else stays off the board for the player to put down by hand.
export function placeNewFigures(before, state) {
  const board = state.board
  if (!board) return state
  const open = (state.turn.boardTiles ?? []).filter((t) => !t.filled).at(-1)
  if (!open) return state
  const known = new Set([...before.monsters, ...(before.villains ?? [])].map((f) => f.id))
  const fresh = [...state.monsters, ...(state.villains ?? []).filter((v) => !v.defeated)]
    .filter((f) => !known.has(f.id) && !board.tokens[f.id] && !f.objective)
    .flatMap((f) => Array.from({ length: figuresLeft(f) }, (_, i) => ({ id: figureToken(f.id, i + 1) })))
  if (fresh.length === 0) return state
  const grid = boardGrid(board)
  const mark = scorchSquare(grid, open.uid) ?? [...grid.values()].find((sq) => sq.tile === open.uid && sq.floor)
  if (!mark) return state
  const from = Array.isArray(mark) ? mark : [mark.x, mark.y]
  const taken = new Set(Object.values(board.tokens).map(key))
  const near = [...distances(grid, from)].sort((a, b) => a[1] - b[1]).map(([k]) => k).filter((k) => !taken.has(k))
  const tokens = { ...board.tokens }
  fresh.forEach((f, i) => {
    if (near[i]) tokens[f.id] = near[i].split(',').map(Number)
  })
  const boardTiles = state.turn.boardTiles.map((t) => (t.uid === open.uid ? { ...t, filled: true } : t))
  return { ...state, board: { ...board, tokens }, turn: { ...state.turn, boardTiles } }
}

// A monster card with several figures (the Legion Devil's 3) has a token for each figure
// still standing: the monster's id, then id#2, id#3.
export const figureToken = (monsterId, n) => (n <= 1 ? monsterId : `${monsterId}#${n}`)
const baseId = (tokenId) => tokenId.split('#')[0]
export const figuresLeft = (monster) => (monster.card?.figures > 1 && !monster.villain ? Math.max(0, Math.ceil(monster.hp / monster.card.hp)) : 1)

const has = (hero, condition) => (hero.conditions ?? []).includes(condition)

// How far the hero walks in one move: Slowed heroes only 2 squares.
export const moveSpeed = (hero) => (has(hero, 'Slowed') ? Math.min(2, hero.speed ?? 6) : hero.speed ?? 6)

// Whether the active hero can still move this Hero Phase: move twice, or move and attack
// (in either order). A Dazed hero gets one action; an Immobilized hero can't move.
export function movesLeft(state, hero) {
  if (!state.board || state.status !== 'playing' || state.turn.phase !== 0) return 0
  if (state.heroes[state.turn.heroIndex]?.id !== hero.id || hero.hp <= 0 || has(hero, 'Immobilized')) return 0
  const last = state.turn.lastAttack
  const attacked = Boolean(state.turn.attackSpent || (last && last.heroId === hero.id && !last.bonus && !last.free))
  const actions = has(hero, 'Dazed') ? 1 : 2
  return Math.max(0, actions - (attacked ? 1 : 0) - (state.turn.boardMoves ?? 0))
}

// Squares with a figure on them, and those of monsters and villains (which heroes can't walk through).
export function occupied(state, exceptId) {
  const foes = new Set([...state.monsters, ...(state.villains ?? [])].map((m) => m.id))
  const taken = new Set()
  const stops = new Set()
  for (const [id, at] of Object.entries(state.board.tokens)) {
    if (id === exceptId) continue
    taken.add(key(at))
    if (foes.has(baseId(id))) stops.add(key(at))
  }
  return { taken, stops }
}

// The squares the hero can move to now (as "x,y" keys), or none.
export function heroReach(state, hero) {
  const at = state.board?.tokens[hero.id]
  if (!at || movesLeft(state, hero) === 0) return []
  return reachable(boardGrid(state.board), at, moveSpeed(hero), occupied(state, hero.id))
}

export const placeToken = (state, id, at) => ({ ...state, board: { ...state.board, tokens: { ...state.board.tokens, [id]: [at[0], at[1]] } } })

// A hero's move in their Hero Phase: only to a square they can reach, and it uses up a move.
export function moveHero(state, action) {
  const hero = state.heroes.find((h) => h.id === action.heroId)
  const to = Array.isArray(action.to) ? action.to : null
  if (!hero || !to || !heroReach(state, hero).includes(key(to))) return state
  const moved = placeToken(state, hero.id, to)
  return { ...moved, turn: { ...moved.turn, boardMoves: (state.turn.boardMoves ?? 0) + 1 } }
}

// Moving any figure by hand, for anything the app doesn't move itself yet: onto any free
// floor square. It doesn't use up a move.
export function moveToken(state, action) {
  if (!state.board || !Array.isArray(action.to)) return state
  const figures = [...state.heroes, ...state.monsters, ...(state.villains ?? []), ...(state.villagers ?? [])]
  if (typeof action.id !== 'string' || !figures.some((f) => f.id === baseId(action.id))) return state
  if (action.id.includes('#')) {
    const monster = state.monsters.find((m) => m.id === baseId(action.id))
    if (!monster || Number(action.id.split('#')[1]) > figuresLeft(monster)) return state
  }
  const square = boardGrid(state.board).get(key(action.to))
  if (!square?.floor || occupied(state, action.id).taken.has(key(action.to))) return state
  return placeToken(state, action.id, action.to)
}

// Figures that left play take their token with them. When one figure of a monster card
// falls, its token nearest the active hero (the one most likely just attacked) goes, and
// the rest are numbered again.
export function pruneTokens(state) {
  const board = state.board
  if (!board) return state
  const live = new Set(
    [...state.heroes, ...state.monsters, ...(state.villains ?? []).filter((v) => !v.defeated), ...(state.villagers ?? []).filter((v) => !v.removed)].map((f) => f.id),
  )
  let tokens = Object.fromEntries(Object.entries(board.tokens).filter(([id]) => live.has(baseId(id))))
  const hero = tokens[state.heroes[state.turn.heroIndex]?.id]
  for (const monster of state.monsters) {
    const mine = Object.keys(tokens).filter((id) => baseId(id) === monster.id)
    const left = figuresLeft(monster)
    if (mine.length <= left) continue
    const far = (id) => (hero ? Math.max(Math.abs(tokens[id][0] - hero[0]), Math.abs(tokens[id][1] - hero[1])) : 0)
    const keep = [...mine].sort((a, b) => far(b) - far(a)).slice(0, left)
    const rest = Object.fromEntries(Object.entries(tokens).filter(([id]) => baseId(id) !== monster.id))
    keep.forEach((id, i) => (rest[figureToken(monster.id, i + 1)] = tokens[id]))
    tokens = rest
  }
  const same = Object.keys(tokens).length === Object.keys(board.tokens).length && Object.entries(tokens).every(([id, at]) => board.tokens[id] === at)
  return same ? state : { ...state, board: { ...board, tokens } }
}
