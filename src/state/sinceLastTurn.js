// What happened since a hero's last turn, for the card on their iPad when their turn
// starts: every log entry from the turns between that hero's last turn and this one,
// oldest first. Lines that name the hero (or their player) come first, as "about you";
// the rest are the other heroes' turns, cut to the newest few.

const OTHERS_SHOWN = 6

// A turn as one number that grows through the game: round 2's turns all come after round 1's.
const turnOrder = (round, heroIndex, heroCount) => round * heroCount + heroIndex

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Whether a log line is about this hero: their hero's name or their player's name as a word.
export function mentions(text, hero) {
  return [hero.name, hero.player].filter(Boolean).some((name) => new RegExp(`\\b${escape(name)}\\b`, 'i').test(text))
}

// { about: [entries], others: [entries], moreOthers: number }, or null when there's
// nothing to show: round 1 (everyone just watched the first turns), a game with one hero,
// not this hero's turn, or nothing logged since. Entries from before this change have no
// heroIndex and are left out.
export function sinceLastTurn(state, heroId) {
  const { heroes, turn, log = [] } = state
  const count = heroes.length
  if (count < 2 || turn.round < 2 || heroes[turn.heroIndex]?.id !== heroId) return null
  const hero = heroes[turn.heroIndex]
  const now = turnOrder(turn.round, turn.heroIndex, count)
  const last = now - count
  const between = log
    .filter((entry) => Number.isInteger(entry.heroIndex))
    .filter((entry) => {
      const at = turnOrder(entry.round, entry.heroIndex, count)
      return at > last && at < now
    })
    .reverse()
  if (between.length === 0) return null
  const about = between.filter((entry) => mentions(entry.text, hero))
  const rest = between.filter((entry) => !mentions(entry.text, hero))
  const others = rest.slice(-OTHERS_SHOWN)
  return { about, others, moreOthers: rest.length - others.length }
}
