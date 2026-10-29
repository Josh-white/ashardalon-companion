// Yes/no questions about where figures stand ("Is another hero on Quinn's tile?"),
// answered from the virtual board instead of asked. The cards' questions are plain text
// in cards.json, so they're recognised by their wording. Null means the board can't tell
// (no board, a question it doesn't know, or a figure that isn't on it), so the screen asks.

import { OPPOSITE, STEP, key, unexploredEdges } from './grid.js'
import { adjacent, tilesBetween } from './paths.js'
import { boardGrid } from './play.js'

const baseId = (tokenId) => tokenId.split('#')[0]
const squeeze = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, '')
const listNames = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`)

// Heroes on the board (not off in the Astral Refuge), with their squares.
function heroesOnBoard(state) {
  return state.heroes.filter((h) => !h.tokens?.refuge && state.board.tokens[h.id]).map((h) => ({ id: h.id, name: h.name, at: state.board.tokens[h.id] }))
}

// Every monster and villain figure on the board (not objectives like the Vast Gate).
function foesOnBoard(state) {
  const foes = new Map([...state.monsters, ...(state.villains ?? []).filter((v) => !v.defeated)].filter((m) => !m.objective).map((m) => [m.id, m]))
  return Object.entries(state.board.tokens)
    .filter(([id]) => foes.has(baseId(id)))
    .map(([id, at]) => ({ id, name: foes.get(baseId(id)).name, at }))
}

// A hero or villager by name, with their square.
function figureNamed(state, name) {
  const wanted = squeeze(name)
  const figure = [...state.heroes, ...(state.villagers ?? []).filter((v) => !v.removed)].find((f) => squeeze(f.name) === wanted)
  const at = figure && !figure.tokens?.refuge ? state.board.tokens[figure.id] : null
  return at ? { id: figure.id, name: figure.name, at } : null
}

// Next to a wall: a wall on one of the square's sides (a tile edge with no opening or a
// thin wall), or a solid black square on any of the 8 around it.
export function nextToWall(grid, at) {
  const square = grid.get(key(at))
  if (!square) return null
  if (square.blocked.size > 0) return true
  for (const [side, [dx, dy]] of Object.entries(STEP)) {
    const next = grid.get(key([at[0] + dx, at[1] + dy]))
    if (next && (!next.floor || next.blocked.has(OPPOSITE[side]))) return true
  }
  for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const next = grid.get(key([at[0] + dx, at[1] + dy]))
    if (next && !next.floor) return true
  }
  return false
}

// The board's answer to a question, as { answer, why }, or null. `question` has the
// hero's name filled in already.
export function boardAnswer(state, question) {
  if (!state?.board || typeof question !== 'string') return null
  const grid = boardGrid(state.board)
  const tileOf = (at) => grid.get(key(at))?.tile
  const ask = question.trim()
  let m

  // Hidden Snipers.
  if ((m = ask.match(/^Is another hero on (.+?)'s tile\?/i))) {
    const who = figureNamed(state, m[1])
    if (!who) return null
    const others = heroesOnBoard(state).filter((h) => h.id !== who.id && tileOf(h.at) === tileOf(who.at))
    return others.length > 0
      ? { answer: true, why: `${listNames(others.map((h) => h.name))} ${others.length > 1 ? 'are' : 'is'} on ${who.name}'s tile.` }
      : { answer: false, why: `No other hero is on ${who.name}'s tile.` }
  }

  // Walls of Magma.
  if ((m = ask.match(/^Is (.+?) next to a wall\?/i))) {
    const who = figureNamed(state, m[1])
    const wall = who ? nextToWall(grid, who.at) : null
    if (wall === null) return null
    return { answer: wall, why: wall ? `${who.name} is next to a wall.` : `${who.name} isn't next to a wall.` }
  }

  // The Vast Gate: "Is there a monster on the Dire Chamber Start tile?"
  if ((m = ask.match(/^Is there a monster on the (.+?) tile\b/i))) {
    const wanted = squeeze(m[1])
    const uids = new Set(state.board.tiles.filter((t) => squeeze(state.board.defs[t.tileId]?.name ?? '') === wanted).map((t) => t.uid))
    if (uids.size === 0) return null
    const there = foesOnBoard(state).filter((f) => uids.has(tileOf(f.at)))
    return there.length > 0
      ? { answer: true, why: `The ${there[0].name} is on the ${m[1]} tile.` }
      : { answer: false, why: `No monster is on the ${m[1]} tile.` }
  }

  // Villagers: "Is Alek within 1 tile of a hero?", "Is Donnel within 1 tile of a monster?"
  if ((m = ask.match(/^Is (.+?) within (\d+) tiles? of an? (hero|monster)\?/i))) {
    const who = figureNamed(state, m[1])
    if (!who) return null
    const n = Number(m[2])
    const pool = m[3].toLowerCase() === 'hero' ? heroesOnBoard(state) : foesOnBoard(state)
    const near = pool.filter((f) => f.id !== who.id && tilesBetween(grid, who.at, f.at) <= n)
    return near.length > 0
      ? { answer: true, why: `${near[0].name} is within ${n} tile${n === 1 ? '' : 's'} of ${who.name}.` }
      : { answer: false, why: `No ${m[3].toLowerCase()} is within ${n} tile${n === 1 ? '' : 's'} of ${who.name}.` }
  }

  // "Is Alek next to a monster?"
  if ((m = ask.match(/^Is (.+?) next to an? (hero|monster)\?/i))) {
    const who = figureNamed(state, m[1])
    if (!who) return null
    const pool = m[2].toLowerCase() === 'hero' ? heroesOnBoard(state) : foesOnBoard(state)
    const next = pool.filter((f) => f.id !== who.id && adjacent(grid, who.at, f.at))
    return next.length > 0
      ? { answer: true, why: `${next[0].name} is next to ${who.name}.` }
      : { answer: false, why: `No ${m[2].toLowerCase()} is next to ${who.name}.` }
  }

  // "Is Brandis on a tile with an unexplored edge?"
  if ((m = ask.match(/^Is (.+?) on a tile with an unexplored edge\?/i))) {
    const who = figureNamed(state, m[1])
    if (!who) return null
    const open = unexploredEdges(grid).some((edge) => edge.tile === tileOf(who.at))
    return { answer: open, why: open ? `${who.name}'s tile has an unexplored edge.` : `${who.name}'s tile has no unexplored edge.` }
  }

  return null
}

// Blessed Shield on the virtual board: the heroes whose shield guards `hero` because they
// share its tile. Null when the board can't tell, so the screen asks.
export function guardsOnTile(state, hero, guards) {
  if (!state.board) return null
  const grid = boardGrid(state.board)
  const at = hero.tokens?.refuge ? null : state.board.tokens[hero.id]
  if (!at) return null
  const tile = grid.get(key(at))?.tile
  return guards.filter((g) => !g.tokens?.refuge && state.board.tokens[g.id] && grid.get(key(state.board.tokens[g.id]))?.tile === tile)
}
