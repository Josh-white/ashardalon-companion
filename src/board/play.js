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

// The tile an adventure starts on and what goes next to it, read from its setup steps:
// most start on the Start tile, The Closed Doors on the Ancient Battlefield with the two
// white-triangle door tiles beside it, The Vast Gate Opens in the Dire Chamber with the
// chamber's tiles all around and the heroes next to the gate in its centre.
export function boardStart(card) {
  const setup = (card?.setup ?? []).join(' ')
  const tile = /Ancient Battlefield Start tile/i.test(setup)
    ? 'ancient-battlefield'
    : /Dire Chamber Start tile/i.test(setup)
      ? 'dire-chamber-start'
      : /Horrid Chamber Start tile/i.test(setup)
        ? 'horrid-chamber-start'
        : 'start'
  const around = setup.match(/place the (Dire|Horrid) Chamber tiles next to each unexplored edge of the \w+ Chamber Start tile/i)?.[1].toLowerCase() ?? null
  return { tile, around, doorTiles: /Door Tiles with white triangles/i.test(setup), centre: Boolean(card?.startObjective) }
}

// The floor square nearest the middle of a tile (where the Vast Gate marker goes).
function centreSquare(def) {
  const floor = []
  def.rows.forEach((row, y) => [...row].forEach((ch, x) => ch !== '#' && floor.push([x, y])))
  const mid = [(def.rows[0].length - 1) / 2, (def.rows.length - 1) / 2]
  const far = ([x, y]) => Math.abs(x - mid[0]) + Math.abs(y - mid[1])
  return [...floor].sort((a, b) => far(a) - far(b))[0]
}

// The squares around one square, nearest first (the heroes next to the Vast Gate).
function squaresAround(def, at) {
  const floor = []
  def.rows.forEach((row, y) => [...row].forEach((ch, x) => ch !== '#' && key([x, y]) !== key(at) && floor.push([x, y])))
  const far = ([x, y]) => Math.max(Math.abs(x - at[0]), Math.abs(y - at[1]))
  return floor.sort((a, b) => far(a) - far(b))
}

// Lays tiles on the open edges of one placed tile, in the order of `sides`, one tile per edge.
function layAround(board, uid, ids, sides = ['W', 'E', 'N', 'S']) {
  let next = board
  const edges = unexploredEdges(boardGrid(board))
    .filter((e) => e.tile === uid)
    .sort((a, b) => sides.indexOf(a.side) - sides.indexOf(b.side))
  for (const edge of edges) {
    const def = next.defs[ids[0]]
    if (!def) break
    const laid = placeTile(next, boardGrid(next), edge, def, `t${next.tiles.length}`)
    if (!laid) continue
    ids = ids.slice(1)
    next = laid
  }
  return next
}

// A new board: the adventure's start tile (the Start tile for most) with the heroes on it,
// and the regular tiles shuffled into a pile. `objectiveId` is a marker that starts in the
// tile's centre (the Vast Gate). Null when the tile layouts have no start tile.
export function newBoard(tiles, heroes, random, card, objectiveId) {
  const list = Array.isArray(tiles) ? tiles : []
  const how = boardStart(card)
  const start = list.find((t) => t.id === how.tile) ?? list.find((t) => t.id === 'start') ?? list.find((t) => t.kind === 'start')
  if (!start) return null
  const centre = how.centre && objectiveId ? centreSquare(start) : null
  const spots = centre ? squaresAround(start, centre) : startSquares(start)
  // The Closed Doors: the two regular tiles with a door and a white triangle go next to the start.
  const doorTiles = how.doorTiles ? list.filter((t) => t.kind === 'regular' && t.triangle === 'white' && t.features?.some((f) => f.type === 'door')).slice(0, 2).map((t) => t.id) : []
  let board = {
    defs: Object.fromEntries(list.map((t) => [t.id, t])),
    tiles: [{ uid: 'start', tileId: start.id, at: [0, 0], turn: 0 }],
    tokens: Object.fromEntries(heroes.map((h, i) => [h.id, spots[i % spots.length]])),
    pile: shuffle(list.filter((t) => t.kind === 'regular' && !doorTiles.includes(t.id)).map((t) => t.id), random),
  }
  if (centre) board.tokens[objectiveId] = centre
  if (doorTiles.length > 0) board = layAround(board, 'start', doorTiles)
  if (how.around) {
    const ids = shuffle(chamberIds(board, how.around), random?.slice?.(32))
    board = layAround(board, 'start', ids)
  }
  return board
}

// The chamber tiles of one family (Horrid or Dire) not on the board yet, without the Entrance.
const chamberIds = (board, family) =>
  Object.values(board.defs)
    .filter((d) => d.kind === 'chamber' && d.id.includes(family) && !/entrance/.test(d.id) && !board.tiles.some((t) => t.tileId === d.id))
    .map((d) => d.id)

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
    const area = grid.get(key(monsterAt))?.area
    const far = distances(grid, monsterAt)
    const steps = (e) => Math.min(...e.squares.map((sq) => far.get(key(sq)) ?? Infinity))
    return edges.filter((e) => e.area === area).sort((a, b) => steps(a) - steps(b))[0] ?? null
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

// A Chamber Entrance turned up: the chamber's tiles (Horrid or Dire, shuffled) go on each
// of the Entrance's open edges, turned to face it. They wait for the chamber's monsters.
export function layChamber(state, family, random) {
  const board = state.board
  const entrance = (state.turn.boardTiles ?? []).at(-1)
  if (!board || !entrance) return state
  const ids = shuffle(chamberIds(board, family), random)
  let next = state
  for (const edge of unexploredEdges(boardGrid(board)).filter((e) => e.tile === entrance.uid)) {
    const def = next.board.defs[ids.shift()]
    if (!def) break
    const uid = `t${next.board.tiles.length}`
    const laid = placeTile(next.board, boardGrid(next.board), edge, def, uid)
    if (!laid) continue
    next = { ...next, board: laid, turn: { ...next.turn, boardTiles: [...next.turn.boardTiles, { uid, side: edge.side, filled: false, chamber: true }] } }
  }
  return next
}

// The exit an adventure puts next to its chamber ("Place the Tunnel Exit tile next to any
// unexplored Chamber edge"): on the open chamber edge farthest from the active hero, so
// the heroes fight through the chamber to reach it. It takes no monster of its own.
export function layExit(state, name) {
  const board = state.board
  const def = board && Object.values(board.defs).find((d) => d.name.toLowerCase() === name.toLowerCase())
  if (!def || board.tiles.some((t) => t.tileId === def.id)) return state
  const chamber = new Set(
    board.tiles.filter((t) => board.defs[t.tileId]?.kind === 'chamber' && !/entrance/.test(t.tileId)).map((t) => t.uid),
  )
  const grid = boardGrid(board)
  const at = activeAt(state)
  const far = at ? distances(grid, at) : new Map()
  const steps = (e) => Math.min(...e.squares.map((sq) => far.get(key(sq)) ?? 0))
  const edges = unexploredEdges(grid)
    .filter((e) => chamber.has(e.tile))
    .sort((a, b) => steps(b) - steps(a))
  for (const edge of edges) {
    const laid = placeTile(board, grid, edge, def, `t${board.tiles.length}`)
    if (laid) return { ...state, board: laid }
  }
  return state
}

// The free squares nearest a tile's scorch mark, closest first.
function spotsOn(grid, uid, taken) {
  const mark = scorchSquare(grid, uid) ?? [...grid.values()].filter((sq) => sq.area === uid && sq.floor).map((sq) => [sq.x, sq.y])[0]
  if (!mark) return []
  return [...distances(grid, mark)].sort((a, b) => a[1] - b[1]).map(([k]) => k).filter((k) => !taken.has(k))
}

// Where a monster drawn without a new tile goes (an encounter card's, a curse's): the active
// hero's tile when the card says so (Lurker's Strike), otherwise the tile with an unexplored
// edge closest to the active hero (Wandering Monster, Frenzied Leap, Trip Wire), or the
// hero's own tile when the board has no unexplored edge left.
function tileForDrawnMonster(state, grid) {
  const at = activeAt(state)
  if (!at) return null
  const own = grid.get(key(at))?.area
  if (/on the active hero's tile/i.test(state.encounter?.card?.text?.match(/place its figure[^.]*/i)?.[0] ?? '')) return own
  const far = distances(grid, at)
  const steps = (e) => Math.min(...e.squares.map((sq) => far.get(key(sq)) ?? Infinity))
  return [...unexploredEdges(grid)].sort((a, b) => steps(a) - steps(b))[0]?.area ?? own
}

// Monsters and villains that just came into play go on the scorch mark of the tile laid
// this turn that hasn't had its monster yet (the nearest free squares when there are several).
// A chamber's monsters, villain, villagers and objective spread over its tiles, one tile
// each before doubling up. A monster drawn with no new tile waiting goes where
// tileForDrawnMonster says; "Move by hand" fixes it when that's wrong.
export function placeNewFigures(before, state) {
  const board = state.board
  if (!board) return state
  const unfilled = (state.turn.boardTiles ?? []).filter((t) => !t.filled)
  const chamber = unfilled.filter((t) => t.chamber)
  const open = chamber.length > 0 ? chamber : unfilled.slice(-1)
  if (open.length === 0) return placeDrawnMonsters(state)
  const known = new Set([...before.monsters, ...(before.villains ?? []), ...(before.villagers ?? [])].map((f) => f.id))
  const candidates = [
    ...state.monsters.filter((m) => chamber.length > 0 || !m.objective),
    ...(state.villains ?? []).filter((v) => !v.defeated),
    ...(chamber.length > 0 ? (state.villagers ?? []).filter((v) => !v.removed) : []),
  ]
  const fresh = candidates
    .filter((f) => !known.has(f.id) && !board.tokens[f.id])
    .flatMap((f) => Array.from({ length: figuresLeft(f) }, (_, i) => ({ id: figureToken(f.id, i + 1) })))
  if (fresh.length === 0) return state
  const grid = boardGrid(board)
  const tokens = { ...board.tokens }
  fresh.forEach((f, i) => {
    const tile = open[i % open.length]
    const spot = spotsOn(grid, tile.uid, new Set(Object.values(tokens).map(key)))[0]
    if (spot) tokens[f.id] = spot.split(',').map(Number)
  })
  const placed = new Set(open.map((t) => t.uid))
  const boardTiles = state.turn.boardTiles.map((t) => (placed.has(t.uid) ? { ...t, filled: true } : t))
  return { ...state, board: { ...board, tokens }, turn: { ...state.turn, boardTiles } }
}

// Monsters with no figure on the board and no tile waiting for them (also one drawn before
// this fix, in an older save), put on the tile tileForDrawnMonster picks.
function placeDrawnMonsters(state) {
  const board = state.board
  const fresh = state.monsters
    .filter((m) => !m.objective && !board.tokens[m.id])
    .flatMap((m) => Array.from({ length: figuresLeft(m) }, (_, i) => figureToken(m.id, i + 1)))
  if (fresh.length === 0) return state
  const grid = boardGrid(board)
  const tile = tileForDrawnMonster(state, grid)
  if (tile === null || tile === undefined) return state
  const tokens = { ...board.tokens }
  for (const id of fresh) {
    const spot = spotsOn(grid, tile, new Set(Object.values(tokens).map(key)))[0]
    if (spot) tokens[id] = spot.split(',').map(Number)
  }
  return { ...state, board: { ...board, tokens } }
}

// A new monster's figures on the free squares nearest a square (out of the Vast Gate).
export function placeNear(state, monster, at) {
  const grid = boardGrid(state.board)
  const taken = new Set(Object.values(state.board.tokens).map(key))
  const free = [...distances(grid, at)].sort((a, b) => a[1] - b[1]).map(([k]) => k).filter((k) => !taken.has(k))
  const tokens = { ...state.board.tokens }
  for (let i = 0; i < figuresLeft(monster) && free[i]; i++) tokens[figureToken(monster.id, i + 1)] = free[i].split(',').map(Number)
  return { ...state, board: { ...state.board, tokens } }
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

// Puts a figure on a square. A hero that changes tile also leaves a trail for this turn in
// state.turn.heroTiles[id] = { start, entered }: the tile it started on and each tile it
// moved onto, so the board can answer Volcanic Vapors and Dragon Fear.
export function placeToken(state, id, at) {
  const placed = { ...state, board: { ...state.board, tokens: { ...state.board.tokens, [id]: [at[0], at[1]] } } }
  const was = state.board.tokens[id]
  if (!was || !state.turn || !state.heroes?.some((h) => h.id === id)) return placed
  const grid = boardGrid(state.board)
  const [from, to] = [grid.get(key(was))?.area, grid.get(key(at))?.area]
  if (from === undefined || to === undefined || from === to) return placed
  const trail = state.turn.heroTiles?.[id] ?? { start: from, entered: [] }
  return { ...placed, turn: { ...state.turn, heroTiles: { ...state.turn.heroTiles, [id]: { start: trail.start, entered: [...trail.entered, to] } } } }
}

// The tile a hero started this turn on and the tiles it moved onto since. A hero that
// hasn't changed tile this turn is still on its starting tile.
export function heroTrail(state, heroId) {
  const trail = state.turn?.heroTiles?.[heroId]
  if (trail) return trail
  const at = state.board?.tokens[heroId]
  const start = at ? boardGrid(state.board).get(key(at))?.area : undefined
  return start === undefined ? null : { start, entered: [] }
}

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
