// Escaping the dungeon on the virtual board. The adventures that end with an escape say
// where: "ending his or her Hero Phase on the stairs on the Tunnel Exit tile", "on the
// ladder on the Secure Exit tile", or (Sneaky Endeavor) "on the stairs on the Start tile or
// on the Tunnel Exit tile". The board lights those squares and, once nothing else stands
// in the way, lets the hero out at the end of their Hero Phase. The Vast Gate Opens wants
// every hero out: each one who makes it leaves the board and sits out the rest of the game.

import { boardSquares, key } from './grid.js'
import { escapeBlockers } from '../state/adventure.js'
import { sameName, updateHero, withLog, withMoment } from '../state/gameHelpers.js'

const EXIT_FEATURES = ['stairs', 'ladder']

// Does this game end with an escape (the adventure's goal, or its chamber card's)?
export const escapeGoal = (state) => Boolean(state.adventure && (state.adventure.card.win.escape || state.adventure.chamber?.card.win.escape))

// The words that say how the heroes get out: the adventure's Victory rule and its chamber
// card's goal and setup (Refuse Pit's Tunnel Exit).
function escapeText(state) {
  const adventure = state.adventure
  const victory = adventure?.card.rules.find((r) => /victory/i.test(r.name))?.text ?? ''
  const chamber = adventure?.chamber?.card
  return [victory, adventure?.card.victoryText ?? '', chamber?.goal ?? '', ...(chamber?.setup ?? [])].join(' ')
}

// Everyone has to get out (The Vast Gate Opens), not just one hero.
export const everyoneEscapes = (state) => /\ball (?:the )?heroes escape|\beach ends\b/i.test(escapeText(state))

// The token the escaping hero has to carry out (Sneaky Endeavor's stolen treasure), or null.
export function escapeToken(state) {
  if (!/carrying|with the item/i.test(escapeText(state))) return null
  return state.adventure.card.win.tokens[0] ?? null
}

// The placed tiles a hero escapes from: the exit tiles the words name (the Start tile too
// when they say so), or every exit tile on the board when they name none.
function exitTiles(state) {
  const board = state.board
  if (!board || !escapeGoal(state)) return []
  const text = escapeText(state)
  const withExit = board.tiles.filter((t) => (board.defs[t.tileId]?.features ?? []).some((f) => EXIT_FEATURES.includes(f.type)))
  const special = withExit.filter((t) => board.defs[t.tileId].kind === 'special')
  const named = special.filter((t) => new RegExp(board.defs[t.tileId].name, 'i').test(text))
  const start = /stairs on the Start tile/i.test(text) ? withExit.filter((t) => board.defs[t.tileId].kind === 'start') : []
  const picked = [...named, ...start]
  return picked.length > 0 ? picked : special
}

// The squares a hero escapes from (the stairs or the ladder), as "x,y" keys.
export function exitSquares(state) {
  const board = state.board
  return new Set(
    exitTiles(state).flatMap((t) => {
      const def = board.defs[t.tileId]
      return def.features.filter((f) => EXIT_FEATURES.includes(f.type)).flatMap((f) => boardSquares(t, def, f.at).map(key))
    }),
  )
}

// What to call the way out: "stairs" or "ladder".
export function exitName(state) {
  const board = state.board
  const types = exitTiles(state).flatMap((t) => board.defs[t.tileId].features.filter((f) => EXIT_FEATURES.includes(f.type)).map((f) => f.type))
  return types.length > 0 && types.every((t) => t === 'ladder') ? 'ladder' : 'stairs'
}

// Is this hero standing on a way out?
export function onExit(state, heroId) {
  const at = state.board?.tokens[heroId]
  return Boolean(at) && exitSquares(state).has(key(at))
}

// Why this hero can't escape yet ('' when they can): goals still to do, the item they
// have to carry, or not standing on the way out.
export function escapeHold(state, hero) {
  if (!state.board || !escapeGoal(state) || state.adventure.escaped) return 'no-escape'
  if (escapeBlockers(state).length > 0) return 'goals'
  const token = escapeToken(state)
  if (token && !state.adventure.tokens.some((t) => sameName(t.name, token) && t.heldBy === hero.id)) return 'token'
  if (!onExit(state, hero.id)) return 'not-on-exit'
  return ''
}

// A hero who escaped (The Vast Gate Opens) is out of the game: off the board, no more turns.
export const escapedHero = (hero) => Boolean(hero?.escaped)

// The end of a Hero Phase on the stairs: the hero gets out. With one hero to save, the
// heroes win; when everyone has to escape, this one leaves the board and the rest follow.
export function escapeAtPhaseEnd(state, hero) {
  if (!hero || escapeHold(state, hero)) return state
  if (!everyoneEscapes(state)) return withLog({ ...state, adventure: { ...state.adventure, escaped: true } }, `${hero.name} escaped the dungeon!`)
  let next = updateHero(state, hero.id, () => ({ escaped: true }))
  const tokens = { ...next.board.tokens }
  delete tokens[hero.id]
  next = withLog({ ...next, board: { ...next.board, tokens } }, `${hero.name} escaped through the exit!`)
  const left = next.heroes.filter((h) => !h.escaped)
  if (left.length === 0) return withLog({ ...next, adventure: { ...next.adventure, escaped: true } }, 'Every hero is out of the dungeon!')
  return withMoment(next, {
    kind: 'roll',
    heroId: hero.id,
    title: `${hero.name} escaped!`,
    detail: `${left.map((h) => h.name).join(', ')} still ${left.length > 1 ? 'have' : 'has'} to get out.`,
  })
}
