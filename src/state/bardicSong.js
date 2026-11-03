// Bardic Song (a fan Bard's card ability): 3 tokens a game, each spent to re-roll "any die
// roll made during the game by any Hero". A missed attack has its own button in the attack
// box (REROLL_ATTACK with bardicSong). This file covers the other rolls a hero makes: a
// roll to unlock a Locked Door, to disable a trap, to break free of a curse (the Cage),
// and Mind Over Body.
//
// Right after one of those rolls fails, and while a bard still has a song, the game keeps
// a copy of itself from just before the roll (state.songRoll). Singing puts that copy back
// and makes the same roll again with the new die, so whatever the first roll did is done
// over. Anything else that happens in the game first ends the chance.

import { BARDIC_SONGS, bardicSongsLeft } from './heroAttacks.js'
import { hasAbility } from '../data/heroes.js'
import { updateHero, withLog } from './gameHelpers.js'

const hasCurse = (state, heroId, curseId) => Boolean(state.heroes.find((h) => h.id === heroId)?.curses?.some((c) => c.id === curseId))
const hasCondition = (state, heroId, condition) => Boolean(state.heroes.find((h) => h.id === heroId)?.conditions?.includes(condition))

// The rolls a song can take again: who rolled, and whether the roll failed (after it).
const ROLLS = {
  DOOR_UNLOCK: { roller: (s, a) => a.heroId, failed: (after, a) => (after.adventure?.lockedDoors ?? []).some((d) => d.id === a.doorId), what: 'unlock the door' },
  DISABLE_TRAP: { roller: (s, a) => a.heroId, failed: (after, a) => (after.traps ?? []).some((t) => t.id === a.trapId), what: 'disable the trap' },
  CURSE_ROLL: { roller: (s) => s.heroes[s.turn.heroIndex]?.id, failed: (after, a) => hasCurse(after, a.heroId, a.curseId), what: 'break the curse' },
  MIND_OVER_BODY: { roller: (s, a) => a.heroId, failed: (after, a) => hasCondition(after, a.heroId, a.condition), what: 'shrug off the condition' },
}

// Things the screens send by themselves, which don't change the game: they leave the
// chance to sing open.
const QUIET = new Set([
  'CARD_READING', 'SET_CARD_READING', 'SKIP_READING', 'ALLY_HELP', 'ALLY_PAUSE', 'PLAY_BOARD_SOUND', 'ROLL_DIE',
  'ATTACH_MONSTER_CARDS', 'UPDATE_ENCOUNTER_CARDS', 'OPENING_NARRATING', 'OPENING_QUIET', 'FIRST_ROLL_NARRATING', 'FIRST_ROLL_QUIET',
])

// The bards who can sing right now: songs left and still in the dungeon (not escaped).
export const singers = (state) => (state?.heroes ?? []).filter((h) => bardicSongsLeft(h) > 0 && !h.escaped)

// Every bard in the game with their songs, for the token pips on the top bars.
export const songTokens = (state) =>
  (state?.heroes ?? []).filter((h) => hasAbility(h, 'bardic-song') && !h.escaped).map((h) => ({ id: h.id, name: h.name, left: bardicSongsLeft(h), total: BARDIC_SONGS }))

// After every action: keep the copy from before a failed roll, or let go of the old one.
export function trackSongRoll(before, after, action) {
  if (!after || after === before) return after
  const rule = ROLLS[action?.type]
  if (rule && after.status === 'playing' && singers(after).length > 0 && rule.failed(after, action)) {
    const { songRoll: _old, ...copy } = before
    return { ...after, songRoll: { before: copy, action, heroId: rule.roller(before, action) } }
  }
  if (after.songRoll && !QUIET.has(action?.type)) return { ...after, songRoll: null }
  return after
}

// What the failed roll was for, in a few words ("unlock the door").
export function songRollLabel(state) {
  const roll = state?.songRoll
  if (!roll) return null
  if (roll.action.type === 'MIND_OVER_BODY') return `shrug off being ${roll.action.condition}`
  return ROLLS[roll.action.type]?.what ?? 'roll'
}

// BARDIC_SONG { bardId, roll }: the bard spends a song and the failed roll is made again.
export function singAgain(state, action, reduce) {
  const roll = state.songRoll
  const bard = roll && roll.before.heroes.find((h) => h.id === action.bardId)
  if (!roll || !bard || bardicSongsLeft(bard) <= 0 || !Number.isInteger(action.roll) || action.roll < 1 || action.roll > 20) return state
  const roller = roll.before.heroes.find((h) => h.id === roll.heroId)
  let base = updateHero(roll.before, bard.id, (h) => ({ tokens: { ...h.tokens, bardicSongsUsed: (h.tokens?.bardicSongsUsed ?? 0) + 1 } }))
  base = withLog(base, `🎶 ${bard.name}'s Bardic Song: ${roller?.name ?? 'the hero'} rolls again to ${songRollLabel(state)}.`)
  return reduce(base, { ...roll.action, roll: action.roll })
}
