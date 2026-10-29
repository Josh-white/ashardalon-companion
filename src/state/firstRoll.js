// Roll for first turn: once the heroes enter the dungeon, each player rolls a d20 and
// the highest roll takes the first turn. Heroes who tie for the highest roll again.
// Plain functions on the game state, used by the game reducer.

// How long the projector and iPads keep showing who won, once the roll is decided.
export const FIRST_ROLL_SHOW_MS = 4500

// A new roll-off, when the game starts with more than one hero.
export const newFirstRoll = (heroes) =>
  heroes.length > 1 ? { contenders: heroes.map((h) => h.id), rolls: {}, round: 1, winner: null, decidedAt: null } : null

// The heroes who still have to roll this round.
export const waitingToRoll = (firstRoll) => (firstRoll && !firstRoll.winner ? firstRoll.contenders.filter((id) => firstRoll.rolls[id] == null) : [])

// While the narrator cheers the roll ("A natural twenty…", "X goes first!"), the winner
// stays on screen and the starting treasure waits, but never longer than this.
export const FIRST_ROLL_MAX_MS = 15000

// Whether the roll-off still covers the screen: until it's decided, then a few seconds
// more, or until the narrator has finished with it.
export const firstRollShowing = (state, now) => {
  const roll = state?.status === 'playing' ? state.firstRoll : null
  if (!roll) return false
  if (!roll.winner) return true
  const since = now - roll.decidedAt
  return since < FIRST_ROLL_SHOW_MS || (Boolean(roll.narrating) && since < FIRST_ROLL_MAX_MS)
}

// One hero's roll. Once everyone this round has rolled, the highest goes first, or the
// heroes who tied roll again. Returns the new firstRoll and what happened, or null if
// the roll doesn't count (not this hero's turn to roll, or already decided).
export function rollFirst(firstRoll, heroId, value, now) {
  if (!firstRoll || firstRoll.winner || !waitingToRoll(firstRoll).includes(heroId)) return null
  const v = Math.min(20, Math.max(1, Math.round(Number(value)) || 1))
  const rolls = { ...firstRoll.rolls, [heroId]: v }
  // count goes up with every roll, so each screen knows to play the dice; last is that
  // roll, so a natural 20 gets its cheer in turn.
  const next = { ...firstRoll, rolls, count: (firstRoll.count ?? 0) + 1, last: { heroId, value: v } }
  if (firstRoll.contenders.some((id) => rolls[id] == null)) return { firstRoll: next, result: null }
  const best = Math.max(...firstRoll.contenders.map((id) => rolls[id]))
  const top = firstRoll.contenders.filter((id) => rolls[id] === best)
  if (top.length === 1) return { firstRoll: { ...next, winner: top[0], decidedAt: now }, result: { winner: top[0] } }
  // A tie: only the tied heroes roll again. Earlier rolls stay on screen for the others.
  const others = Object.fromEntries(Object.entries(rolls).filter(([id]) => !top.includes(id)))
  return { firstRoll: { ...next, contenders: top, rolls: others, tied: { value: best, heroIds: top }, round: firstRoll.round + 1 }, result: { tie: top } }
}
