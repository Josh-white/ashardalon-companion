import { XP_TO_CANCEL_ENCOUNTER } from './heroes.js'

// Easy / Normal / Hard, picked in the lobby. Normal is the rulebook. Easy and Hard are a
// house dial for rough nights or a bigger challenge, in the spirit of the fan variants on
// BoardGameGeek: they change a few numbers, never the cards.
export const DIFFICULTIES = [
  { key: 'easy', icon: '😊', label: 'Easy', surges: 2, extraSurges: 2, secondChance: true, cancelCost: XP_TO_CANCEL_ENCOUNTER, detail: '+2 healing surges, and each hero can reroll one missed attack' },
  { key: 'normal', icon: '⚔️', label: 'Normal', surges: 2, extraSurges: 0, secondChance: false, cancelCost: XP_TO_CANCEL_ENCOUNTER, detail: 'The rulebook' },
  { key: 'hard', icon: '💀', label: 'Hard', surges: 1, extraSurges: 0, secondChance: false, cancelCost: 7, detail: '1 healing surge, and cancelling an encounter costs 7 XP' },
]

export const difficultyOf = (key) => DIFFICULTIES.find((d) => d.key === key) ?? DIFFICULTIES[1]

// What cancelling an encounter costs in this game (before Perseverance).
export const encounterCancelCost = (state) => difficultyOf(state?.difficulty).cancelCost

// Easy: each hero may reroll one missed attack roll per adventure.
export const hasSecondChance = (state, hero) =>
  Boolean(hero) && difficultyOf(state?.difficulty).secondChance && !(state.secondChances ?? []).includes(hero.id)
