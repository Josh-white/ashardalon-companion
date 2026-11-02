// Tokens the heroes put on the virtual board: Quinn's Blade Barrier (five tokens on five
// squares of a tile within 2 tiles), Heskan's Flaming Sphere (a stack of 3 on a square
// within 1 tile) and Wizard Eye (on a tile within 1 tile), and the Box of Caltrops (three
// squares of your own tile). They are state.board.items like the Treasure tokens, with the
// hero who put them down as `owner`. How many are left still lives on the hero
// (hero.tokens.bladeBarrier and so on), and the board follows that count.
//
// - A monster placed on a Blade Barrier or Caltrop token takes 1 damage and the token goes
//   (game.js springs them after every action).
// - The Flaming Sphere burns its own tile at the end of the owner's Hero Phase (a button).
// - Instead of moving, the owner can move the Flaming Sphere or the Wizard Eye 1 tile.
// - The owner can explore from any unexplored edge on the Wizard Eye's tile.

import { baseId, key } from './grid.js'
import { adjacent, distances, tilesBetween } from './paths.js'
import { boardGrid, movesLeft } from './play.js'
import { newId, withLog } from '../state/gameHelpers.js'

export const HERO_TOKENS = {
  blade: { counter: 'bladeBarrier', name: 'Blade Barrier', icon: '🗡️', color: '#64748b' },
  caltrop: { counter: 'caltrops', name: 'Caltrop', icon: '📌', color: '#78716c' },
  sphere: { counter: 'flamingSphere', name: 'Flaming Sphere', icon: '🔥', color: '#c2410c', stack: true, moves: true },
  eye: { counter: 'wizardEye', name: 'Wizard Eye', icon: '👁️', color: '#6d28d9', stack: true, moves: true },
  // Fan heroes' tokens (fanTokens below says what they do).
  boobytrap: { counter: 'boobytraps', name: 'Boobytrap', icon: '🪤', color: '#92400e', springs: 'trapped' },
  spike: { counter: 'spikedGrowth', name: 'Spiked Growth', icon: '🌵', color: '#3f6212', springs: 'stunned' },
  secret: { counter: 'secretPaths', name: 'Secret Path', icon: '🌿', color: '#15803d', path: true },
  darkness: { counter: 'darkness', name: 'Darkness', icon: '🌑', color: '#1e1b4b', path: true },
  seeker: { counter: 'seekers', name: 'Shadow Seeker', icon: '👤', color: '#3b0764' },
  // Lizard & Lace (state/pets.js): put down and moved by the app, not counted on the hero.
  pet: { counter: 'pets', name: 'Ally', icon: '🦎', color: '#166534', manual: true },
}
export const isHeroToken = (item) => Boolean(item && HERO_TOKENS[item.kind])

const items = (state) => state.board?.items ?? []
const withItems = (state, list) => ({ ...state, board: { ...state.board, items: list } })

// How many tokens of this kind the hero should have on the board (a stack counts as one).
function wanted(hero, kind) {
  const count = Number(hero.tokens?.[HERO_TOKENS[kind].counter]) || 0
  if (HERO_TOKENS[kind].stack) return count > 0 || hero.tokens?.[HERO_TOKENS[kind].counter] === true ? 1 : 0
  return count
}

// The board keeps up with the heroes' counts: a power just used puts its tokens in hand,
// waiting for their squares, and a token used up (or a count fixed by hand) leaves the board,
// the ones still in hand first.
export function syncHeroTokens(state) {
  if (!state.board) return state
  let list = items(state)
  let changed = false
  for (const hero of state.heroes) {
    for (const kind of Object.keys(HERO_TOKENS).filter((k) => !HERO_TOKENS[k].manual)) {
      const mine = list.filter((i) => i.kind === kind && i.owner === hero.id)
      const want = wanted(hero, kind)
      if (mine.length < want) {
        list = [...list, ...Array.from({ length: want - mine.length }, () => ({ id: newId('item'), kind, owner: hero.id, at: null }))]
        changed = true
      } else if (mine.length > want) {
        const drop = new Set([...mine].sort((a, b) => Boolean(a.at) - Boolean(b.at)).slice(0, mine.length - want).map((i) => i.id))
        list = list.filter((i) => !drop.has(i.id))
        changed = true
      }
    }
  }
  return changed ? withItems(state, list) : state
}

// The squares where a token in hand can go, as "x,y" keys: free floor squares (no figure,
// no other marker) on the tiles its card allows, measured from the hero who owns it.
export function tokenTargets(state, item) {
  const board = state.board
  const at = board?.tokens[item.owner]
  if (!at || item.at) return []
  const grid = boardGrid(board)
  const taken = new Set(Object.values(board.tokens).map(key))
  const marked = new Set(items(state).filter((i) => i.at && i.id !== item.id).map((i) => key(i.at)))
  const own = grid.get(key(at))?.area
  // The Blade Barrier's tokens all go on one tile: once one is down, the rest follow it.
  const placed = items(state).find((i) => i.kind === item.kind && i.owner === item.owner && i.at)
  const barrierTile = item.kind === 'blade' && placed ? grid.get(key(placed.at))?.area : null
  const mine = items(state).filter((i) => i.kind === item.kind && i.owner === item.owner && i.at)
  const usedTiles = new Set(mine.map((i) => grid.get(key(i.at))?.area))
  const seekerSpots = item.kind === 'seeker' ? new Set(seekerSquares(state, item.owner)) : null
  return [...grid.values()]
    .filter((sq) => sq.floor && !taken.has(key([sq.x, sq.y])) && !marked.has(key([sq.x, sq.y])))
    .filter((sq) => {
      const here = [sq.x, sq.y]
      if (item.kind === 'caltrop') return sq.area === own
      // Boobytraps: two different tiles within 1 tile. Spiked Growth: squares within 2 tiles.
      if (item.kind === 'boobytrap') return !usedTiles.has(sq.area) && tilesBetween(grid, at, here) <= 1
      if (item.kind === 'spike') return tilesBetween(grid, at, here) <= 2
      // Secret Paths: one on the hero's own tile, the other anywhere.
      if (item.kind === 'secret') return mine.length > 0 || sq.area === own
      // Paths of Darkness: next to the hero.
      if (item.kind === 'darkness') return adjacent(grid, at, here)
      if (seekerSpots) return seekerSpots.has(key(here))
      if (barrierTile) return sq.area === barrierTile
      return tilesBetween(grid, at, [sq.x, sq.y]) <= (item.kind === 'blade' ? 2 : 1)
    })
    .map((sq) => key([sq.x, sq.y]))
}

// The Flaming Sphere or Wizard Eye the active hero can move instead of moving, or null.
export function movableToken(state, hero, item) {
  return Boolean(hero && item?.at && HERO_TOKENS[item.kind]?.moves && item.owner === hero.id && movesLeft(state, hero) > 0)
}

// Where the owner can move a Flaming Sphere or Wizard Eye: a square without another marker
// on its own tile or a tile next to it.
export function tokenMoveTargets(state, item) {
  if (!item?.at) return []
  const grid = boardGrid(state.board)
  const marked = new Set(items(state).filter((i) => i.at && i.id !== item.id).map((i) => key(i.at)))
  return [...grid.values()]
    .filter((sq) => sq.floor && key([sq.x, sq.y]) !== key(item.at) && !marked.has(key([sq.x, sq.y])))
    .filter((sq) => tilesBetween(grid, item.at, [sq.x, sq.y]) <= 1)
    .map((sq) => key([sq.x, sq.y]))
}

// "Instead of moving during your Hero Phase, you can move the Flaming Sphere stack (the
// Wizard Eye marker) 1 tile": it uses up one of the hero's moves.
export function moveHeroToken(state, action) {
  const hero = state.heroes[state.turn.heroIndex]
  const item = items(state).find((i) => i.id === action.id)
  const to = Array.isArray(action.to) ? action.to : null
  if (!to || !movableToken(state, hero, item) || !tokenMoveTargets(state, item).includes(key(to))) return state
  const moved = withItems(state, items(state).map((i) => (i.id === item.id ? { ...i, at: [to[0], to[1]] } : i)))
  return withLog({ ...moved, turn: { ...moved.turn, boardMoves: (state.turn.boardMoves ?? 0) + 1 } }, `${hero.name} moved the ${HERO_TOKENS[item.kind].name} instead of moving.`)
}

// Blade Barrier and Caltrop tokens with a monster or villain now standing on them.
export function trippedTokens(state) {
  const board = state.board
  if (!board) return []
  const foes = new Set([...state.monsters.filter((m) => !m.objective), ...(state.villains ?? []).filter((v) => !v.defeated)].map((m) => m.id))
  const standing = new Map(Object.entries(board.tokens).filter(([id]) => foes.has(baseId(id))).map(([id, at]) => [key(at), baseId(id)]))
  return items(state)
    .filter((i) => (i.kind === 'blade' || i.kind === 'caltrop') && i.at && standing.has(key(i.at)))
    .map((item) => ({ item, foeId: standing.get(key(item.at)) }))
}

// A monster the board moves stops on the first Blade Barrier or Caltrop token along its way,
// the way the players at the table walk it onto one on purpose: any free token square on a
// shortest walk from where it stands to where it was going, the nearest one first. Null
// when there's none on the way.
export function trapOnWay(state, from, to) {
  const board = state.board
  if (!board || !from || !to || key(from) === key(to)) return null
  const taken = new Set(Object.values(board.tokens).map(key))
  const traps = items(state).filter((i) => (i.kind === 'blade' || i.kind === 'caltrop') && i.at && !taken.has(key(i.at)))
  if (traps.length === 0) return null
  const grid = boardGrid(board)
  const fromHere = distances(grid, from)
  const toThere = distances(grid, to)
  const total = fromHere.get(key(to))
  if (total === undefined) return null
  const onWay = traps
    .filter((t) => fromHere.get(key(t.at)) + toThere.get(key(t.at)) === total)
    .sort((a, b) => fromHere.get(key(a.at)) - fromHere.get(key(b.at)))
  return onWay.length > 0 ? [onWay[0].at[0], onWay[0].at[1]] : null
}

// Did a monster headed next to a figure stop short on a token, so it can't attack this turn?
export function stoppedShort(state, square, targetAt) {
  if (!state.board || !square || !targetAt) return false
  const onTrap = items(state).some((i) => (i.kind === 'blade' || i.kind === 'caltrop') && i.at && key(i.at) === key(square))
  return onTrap && !adjacent(boardGrid(state.board), square, targetAt)
}

export const dropItem = (state, id) => withItems(state, items(state).filter((i) => i.id !== id))

// The hero's Flaming Sphere on the board, and the monsters and villains on its tile.
export function sphereOf(state, hero) {
  return items(state).find((i) => i.kind === 'sphere' && i.owner === hero.id && i.at) ?? null
}
export function sphereVictims(state, hero) {
  const sphere = sphereOf(state, hero)
  if (!sphere) return []
  const grid = boardGrid(state.board)
  const area = grid.get(key(sphere.at))?.area
  const foes = new Set([...state.monsters.filter((m) => !m.objective), ...(state.villains ?? []).filter((v) => !v.defeated)].map((m) => m.id))
  return [...new Set(Object.entries(state.board.tokens).filter(([id, at]) => foes.has(baseId(id)) && grid.get(key(at))?.area === area).map(([id]) => baseId(id)))]
}

// Shadow Seekers (a fan Assassin): a token goes next to the nearest monster within 1 tile of
// the hero. The squares next to that monster (or those monsters, when tied).
function seekerSquares(state, heroId) {
  const board = state.board
  const at = board?.tokens[heroId]
  if (!at) return []
  const grid = boardGrid(board)
  const foes = new Set([...state.monsters.filter((m) => !m.objective), ...(state.villains ?? []).filter((v) => !v.defeated)].map((m) => m.id))
  const near = Object.entries(board.tokens).filter(([id, spot]) => foes.has(baseId(id)) && tilesBetween(grid, at, spot) <= 1)
  if (near.length === 0) return []
  const steps = distances(grid, at)
  const far = (spot) => steps.get(key(spot)) ?? Infinity
  const best = Math.min(...near.map(([, spot]) => far(spot)))
  return near.filter(([, spot]) => far(spot) === best).flatMap(([, spot]) => [...grid.values()].filter((sq) => sq.floor && adjacent(grid, spot, [sq.x, sq.y])).map((sq) => key([sq.x, sq.y])))
}

// Which monster a Shadow Seeker token is next to (it hurts that one when it moves or attacks).
export function seekerTarget(state, square) {
  const board = state.board
  if (!board || !square) return null
  const grid = boardGrid(board)
  const foes = new Set([...state.monsters.filter((m) => !m.objective), ...(state.villains ?? []).filter((v) => !v.defeated)].map((m) => m.id))
  const found = Object.entries(board.tokens).find(([id, spot]) => foes.has(baseId(id)) && adjacent(grid, spot, square))
  return found ? found[0] : null
}
