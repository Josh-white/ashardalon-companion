// Yes/no questions about where figures stand ("Is another hero on Quinn's tile?"),
// answered from the virtual board instead of asked. The cards' questions are plain text
// in cards.json, so they're recognised by their wording. Null means the board can't tell
// (no board, a question it doesn't know, or a figure that isn't on it), so the screen asks.

import { OPPOSITE, STEP, baseId, key, unexploredEdges } from './grid.js'
import { adjacent, tilesBetween } from './paths.js'
import { boardGrid, heroTrail } from './play.js'

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

// Next to a wall: a wall along one of the square's 4 sides (a tile edge with no opening,
// a thin wall, or a solid black square beside it). Only touching a wall at a corner
// doesn't count (JJ's call for Walls of Magma).
export function nextToWall(grid, at) {
  const square = grid.get(key(at))
  if (!square) return null
  if (square.blocked.size > 0) return true
  for (const [side, [dx, dy]] of Object.entries(STEP)) {
    const next = grid.get(key([at[0] + dx, at[1] + dy]))
    if (next && (!next.floor || next.blocked.has(OPPOSITE[side]))) return true
  }
  return false
}

// The board's answer to a question, as { answer, why }, or null. `question` has the
// hero's name filled in already.
export function boardAnswer(state, question) {
  if (!state?.board || typeof question !== 'string') return null
  const grid = boardGrid(state.board)
  const tileOf = (at) => grid.get(key(at))?.area
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

  // Volcanic Vapors: "Did Quinn start the turn on the Volcanic Vapors tile, or move onto it?"
  // Only the active hero's turn is followed.
  if ((m = ask.match(/^Did (.+?) start the turn on the (.+?) tile, or move onto it\?/i))) {
    const who = figureNamed(state, m[1])
    const marker = (state.traps ?? []).find((t) => squeeze(t.name) === squeeze(m[2]) && t.tile !== undefined)
    const trail = who && who.id === state.heroes[state.turn?.heroIndex]?.id ? heroTrail(state, who.id) : null
    if (!marker || !trail) return null
    if (trail.start === marker.tile) return { answer: true, why: `${who.name} started the turn on the ${marker.name} tile.` }
    if (trail.entered.includes(marker.tile)) return { answer: true, why: `${who.name} moved onto the ${marker.name} tile.` }
    return { answer: false, why: `${who.name} didn't start on or move onto the ${marker.name} tile.` }
  }

  // A Gap in the Armor: "Did Quinn move during this Hero Phase?" (any move: walking, a power, the carpet).
  if ((m = ask.match(/^Did (.+?) move during this Hero Phase\?/i))) {
    const who = figureNamed(state, m[1])
    if (!who || who.id !== state.heroes[state.turn?.heroIndex]?.id) return null
    const moved = (state.turn.heroesMoved ?? []).includes(who.id)
    return moved ? { answer: true, why: `${who.name} moved this Hero Phase.` } : { answer: false, why: `${who.name} hasn't moved this Hero Phase.` }
  }

  // Dragon Fear: "Did Quinn move onto a new tile this Hero Phase?"
  if ((m = ask.match(/^Did (.+?) move onto a new tile this Hero Phase\?/i))) {
    const who = figureNamed(state, m[1])
    const trail = who && who.id === state.heroes[state.turn?.heroIndex]?.id ? heroTrail(state, who.id) : null
    if (!trail) return null
    const n = trail.entered.length
    return n > 0
      ? { answer: true, why: `${who.name} moved onto ${n === 1 ? 'a new tile' : `${n} new tiles`} this turn.` }
      : { answer: false, why: `${who.name} stayed on the same tile.` }
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
    const open = unexploredEdges(grid).some((edge) => edge.area === tileOf(who.at))
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
  const tile = grid.get(key(at))?.area
  return guards.filter((g) => !g.tokens?.refuge && state.board.tokens[g.id] && grid.get(key(state.board.tokens[g.id]))?.area === tile)
}
