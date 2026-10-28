// The sound board: buttons on each iPad that play a sound on the projector. The
// limits live here, on the Pi, so no iPad can get around them.

export const BOARD_SOUNDS = [
  { key: 'tada', emoji: '🎉', label: 'Ta-da!' },
  { key: 'wahwah', emoji: '😢', label: 'Wah-wah' },
  { key: 'dundun', emoji: '😱', label: 'Dun dun DUNNN' },
  { key: 'rimshot', emoji: '🥁', label: 'Ba-dum-tss' },
  { key: 'crickets', emoji: '🦗', label: 'Crickets' },
  { key: 'laugh', emoji: '😈', label: 'Evil laugh' },
  { key: 'clang', emoji: '⚔️', label: 'Sword clang' },
  { key: 'drumroll', emoji: '🪘', label: 'Drumroll' },
]

// Each player's taps per hero turn; everyone's count starts over when the turn passes.
export const USES_PER_TURN = 2
// After any board sound, nobody can play another for this long.
export const COOLDOWN_MS = 8000
// The board waits this long after a big moment (a roll, a monster), so it doesn't
// talk over the game's own sounds and the narrator.
export const MOMENT_QUIET_MS = 5000

const EMPTY = { off: false, last: null, turn: null, used: {} }

export const boardOf = (state) => ({ ...EMPTY, ...state.soundboard })
const turnKey = (state) => `${state.turn.round}-${state.turn.heroIndex}`

// This turn's taps by player (a hero id, or 'table').
function usedThisTurn(state) {
  const board = boardOf(state)
  return board.turn === turnKey(state) ? board.used : {}
}

// Whether `who` can play a sound right now. waitMs says how long until they can,
// when it's only a matter of waiting.
export function boardStatus(state, who, now = Date.now()) {
  const board = boardOf(state)
  const usesLeft = Math.max(0, USES_PER_TURN - (usedThisTurn(state)[who] ?? 0))
  if (state.status !== 'playing') return { ok: false, usesLeft, reason: 'The sound board opens in the dungeon.' }
  if (board.off) return { ok: false, usesLeft, reason: 'The sound board is switched off.' }
  if (usesLeft === 0) return { ok: false, usesLeft, reason: 'All used up! You get more next turn.' }
  const waits = [board.last && board.last.at + COOLDOWN_MS - now, state.moment && state.moment.at + MOMENT_QUIET_MS - now]
  const waitMs = Math.max(0, ...waits.filter((w) => w > 0))
  if (waitMs > 0) return { ok: false, usesLeft, waitMs, reason: `Wait ${Math.ceil(waitMs / 1000)}s` }
  return { ok: true, usesLeft }
}

let counter = 0

export function playBoardSound(state, { who, sound }, now = Date.now()) {
  const known = who === 'table' || state.heroes.some((h) => h.id === who)
  if (!known || !BOARD_SOUNDS.some((s) => s.key === sound) || !boardStatus(state, who, now).ok) return state
  const used = usedThisTurn(state)
  return {
    ...state,
    soundboard: {
      ...boardOf(state),
      last: { id: `board-${now.toString(36)}-${(counter++).toString(36)}`, sound, who, at: now },
      turn: turnKey(state),
      used: { ...used, [who]: (used[who] ?? 0) + 1 },
    },
  }
}

export const setBoardOff = (state, off) => ({ ...state, soundboard: { ...boardOf(state), off: Boolean(off) } })
