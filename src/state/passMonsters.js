// Cards that pass monster cards to "the player on your right": Warp in Time (each player
// passes one), High Alert (the active hero passes one at the end of every Villain Phase) and
// Quinn's Wrathful Thunder (a monster on Quinn's tile). At a real table the players pass the
// cards and say who has each one; on the virtual board the app knows every card and figure,
// so it passes them itself (JJ, 2026-11-01).
import { baseId, key } from '../board/grid.js'
import { boardGrid } from '../board/play.js'
import { escapedHero } from '../board/exits.js'
import { updateMonster, withLog } from './gameHelpers.js'

const tileAt = (grid, at) => (at ? grid.get(key(at))?.area : undefined)

// Turns go to the left, so the player on your right is the hero who went before you.
// A hero who escaped (The Vast Gate Opens) is out of the game and gets no cards.
export function heroOnRight(state, heroId) {
  const index = state.heroes.findIndex((h) => h.id === heroId)
  if (index < 0) return null
  for (let step = 1; step < state.heroes.length; step++) {
    const hero = state.heroes[(index - step + state.heroes.length) % state.heroes.length]
    if (!escapedHero(hero)) return hero
  }
  return null
}

// A hero's monster cards, oldest first (the order they were drawn).
const cardsOf = (state, heroId) => state.monsters.filter((m) => m.ownerId === heroId && !m.objective && m.hp > 0)

// "Passes one Monster Card": the one that has been in front of them longest, unless the
// player on the right already has that monster (two of one card in a row is confusing).
function oneCard(state, hero, to) {
  const cards = cardsOf(state, hero.id)
  const theirs = new Set(cardsOf(state, to.id).map((m) => m.name))
  return cards.find((m) => !theirs.has(m.name)) ?? cards[0] ?? null
}

// Warp in Time: every player passes at once, so each pass is worked out from who had what
// before anyone passed. [{ monster, from, to }]
export function warpPasses(state) {
  const passes = []
  for (const hero of state.heroes) {
    if (escapedHero(hero)) continue
    const to = heroOnRight(state, hero.id)
    if (!to || to.id === hero.id) continue
    const monster = oneCard(state, hero, to)
    if (monster) passes.push({ monster, from: hero, to })
  }
  return passes
}

// High Alert, at the end of the active hero's Villain Phase. { monster, from, to } or null.
export function highAlertPass(state) {
  const hero = state.heroes[state.turn.heroIndex]
  const to = hero && heroOnRight(state, hero.id)
  if (!to || to.id === hero.id) return null
  const monster = oneCard(state, hero, to)
  return monster ? { monster, from: hero, to } : null
}

// Wrathful Thunder: "choose one Monster on your tile". The board picks the one that helps the
// heroes most: the player on the right goes last before Quinn, so the card that would have
// activated soonest (Quinn's own, then the next hero's...) is the one worth sending there.
export function thunderPass(state, heroId) {
  if (!state.board) return null
  const hero = state.heroes.find((h) => h.id === heroId)
  const to = hero && heroOnRight(state, hero.id)
  if (!to || to.id === hero.id) return null
  const grid = boardGrid(state.board)
  const tile = tileAt(grid, state.board.tokens[hero.id])
  if (tile === undefined) return null
  const tokens = Object.entries(state.board.tokens)
  const onTile = state.monsters.filter(
    (m) => m.ownerId && m.ownerId !== to.id && !m.objective && m.hp > 0 && tokens.some(([id, sq]) => baseId(id) === m.id && tileAt(grid, sq) === tile),
  )
  if (onTile.length === 0) return null
  const index = state.heroes.indexOf(hero)
  const wait = (m) => {
    const owner = state.heroes.findIndex((h) => h.id === m.ownerId)
    return owner < 0 ? state.heroes.length : (owner - index + state.heroes.length) % state.heroes.length
  }
  const monster = [...onTile].sort((a, b) => wait(a) - wait(b))[0]
  return { monster, from: state.heroes.find((h) => h.id === monster.ownerId) ?? hero, to }
}

// The words for a pass, for the log and the card on screen.
export const passWords = ({ monster, from, to }) => `${from.name}'s ${monster.name} goes to ${to.name}`

// Move the cards. Each pass is checked against the state again so a stale plan does nothing.
export function applyPasses(state, passes, source) {
  let next = state
  const done = []
  for (const pass of passes) {
    const monster = next.monsters.find((m) => m.id === pass.monster.id)
    if (!monster || !next.heroes.some((h) => h.id === pass.to.id)) continue
    next = updateMonster(next, monster.id, () => ({ ownerId: pass.to.id }))
    done.push(passWords(pass))
  }
  if (done.length === 0) return withLog(next, `${source}: no monster cards to pass.`)
  return withLog(next, `${source}: ${done.join('; ')}.`)
}
