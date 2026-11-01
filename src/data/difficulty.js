import { XP_TO_CANCEL_ENCOUNTER } from './heroes.js'

// Easy / Normal / Hard, picked in the lobby. Normal is the rulebook. Easy and Hard are a
// house dial for rough nights or a bigger challenge, in the spirit of the fan variants on
// BoardGameGeek: they change a few numbers, never the cards.
// Story is easier than Easy, for nights when the party keeps getting wrecked: monsters, traps
// and encounters attack at -2, each hero heals 1 HP at the start of their turn, and the
// reroll comes back every turn. Every setting can be switched mid-game (SET_DIFFICULTY).
export const DIFFICULTIES = [
  {
    key: 'story', icon: '📖', label: 'Story', surges: 2, extraSurges: 3, secondChance: true, rerollEachTurn: true, cancelCost: 3, attackShift: -2, healEachTurn: 1, fullSurge: true,
    detail: '+3 healing surges that heal to full HP, monsters and traps attack at −2, heroes heal 1 HP each turn, a reroll every turn, and cancelling an encounter costs 3 XP',
  },
  { key: 'easy', icon: '😊', label: 'Easy', surges: 2, extraSurges: 2, secondChance: true, cancelCost: XP_TO_CANCEL_ENCOUNTER, detail: '+2 healing surges, and each hero can reroll one missed attack' },
  { key: 'normal', icon: '⚔️', label: 'Normal', surges: 2, extraSurges: 0, secondChance: false, cancelCost: XP_TO_CANCEL_ENCOUNTER, detail: 'The rulebook' },
  { key: 'hard', icon: '💀', label: 'Hard', surges: 1, extraSurges: 0, secondChance: false, cancelCost: 7, detail: '1 healing surge, and cancelling an encounter costs 7 XP' },
]

export const difficultyOf = (key) => DIFFICULTIES.find((d) => d.key === key) ?? DIFFICULTIES[1]

// What cancelling an encounter costs in this game (before Perseverance).
export const encounterCancelCost = (state) => difficultyOf(state?.difficulty).cancelCost

// Story: what a monster, trap or encounter attack adds to (or takes off) its bonus.
export const attackShift = (state) => difficultyOf(state?.difficulty).attackShift ?? 0

// An attack's bonus in this game, after Story's -2.
export const foeBonus = (state, attack) => (attack?.bonus ?? 0) + attackShift(state)

// "+5" on Normal, "+5 −2" on Story, for the "rolled 14 + 5 −2 = 17" lines.
export const bonusWords = (state, attack) => {
  const shift = attackShift(state)
  return `+ ${attack?.bonus ?? 0}${shift ? ` − ${-shift} (Story)` : ''}`
}

// The HP a healing surge brings a hero back up to (Story: full HP).
export const surgeHp = (state, hero) => (difficultyOf(state?.difficulty).fullSurge ? hero.maxHp : hero.surgeValue)

// Easy: each hero may reroll one missed attack roll per adventure (Story: one per turn).
export const hasSecondChance = (state, hero) =>
  Boolean(hero) && difficultyOf(state?.difficulty).secondChance && !(state.secondChances ?? []).includes(hero.id)
