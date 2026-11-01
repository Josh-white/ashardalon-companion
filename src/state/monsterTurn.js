import { aliveVillagers } from './adventure.js'

// The rules of one monster's turn, for the monster turn screen (MonsterActivation in
// components/MonsterTurns.jsx). The screen keeps which step the players are on and what
// they tapped; these work out what that means, so they can be tested without a screen.

// How many figures a card has on the board: the Legion Devil's card is several figures,
// each with its own turn. A villain is always one.
export const figureCount = (monster) => (monster.villain ? 1 : Math.max(1, Math.ceil(monster.hp / monster.card.hp)))

// Heroes in the Astral Refuge are off the board, so monsters can't find or attack them.
export const inRefuge = (state) => state.heroes.filter((h) => h.tokens?.refuge)

// True when every hero is in the Astral Refuge and no villager is left to go after.
export const nobodyToAttack = (state) => inRefuge(state).length === state.heroes.length && aliveVillagers(state).length === 0

// Steps a monster still takes with nobody on the board: its "alone by an unexplored edge"
// question, and exploring.
const needsNobody = (step) => step.when === 'aloneByUnexploredEdge' || (!step.when && step.explore)

// The step the monster is really on: with nobody on the board, the steps that need a
// hero are skipped.
export function currentStepIndex(tactics, stepIndex, nobody) {
  let index = stepIndex
  while (nobody && tactics[index] && !needsNobody(tactics[index])) index++
  return index
}

// The attack a step uses. A table of attacks (the Gauth's eye ray) rolls to pick one:
// `table` is its rows, and `attack` stands in for the whole table until the die picks.
export function stepAttack(card, step) {
  const table = card.attacks.filter((a) => a.group && a.group === step?.attack)
  const attack =
    card.attacks.find((a) => a.id === step?.attack) ??
    (table.length > 0 ? { ...table[0], id: step.attack, name: step.attack.replace(/-/g, ' ') } : null)
  return { attack, table }
}

// Who a monster can attack. Villagers count as heroes for monster tactics (Free the
// Captives), listed first because a monster goes for a villager when it can.
export function monsterTargets(state) {
  const villagers = aliveVillagers(state).map((v) => ({ ...v, villager: true }))
  return [...villagers, ...state.heroes.filter((h) => h.hp > 0 && !h.tokens?.refuge)]
}

// Whether the players tap several heroes for this step: it attacks them all, or the app
// picks the one with the most HP from the heroes tapped.
export const tapsMany = (step) => step?.targets === 'all' || step?.target === 'mostHp'

// A tap on a hero in the target picker.
export const toggleTarget = (chosen, heroId, many) =>
  many ? (chosen.includes(heroId) ? chosen.filter((id) => id !== heroId) : [...chosen, heroId]) : [heroId]

// The hero with the most HP, or null when two or more are tied for it.
export function mostHp(heroes) {
  const top = Math.max(...heroes.map((h) => h.hp))
  const tied = heroes.filter((h) => h.hp === top)
  return tied.length === 1 ? tied[0] : null
}

// Who the attack goes at, from the heroes tapped. For "the hero with the most HP" the app
// picks, unless there's a tie: then `tied` lists them and the players' `tiePick` decides.
export function chooseTargets(step, targetable, chosen, tiePick) {
  const tapped = targetable.filter((h) => chosen.includes(h.id))
  if (step?.target !== 'mostHp') return { tapped, strongest: null, tied: [], top: -Infinity, targetIds: chosen }
  const strongest = tapped.length > 0 ? mostHp(tapped) : null
  const top = Math.max(...tapped.map((h) => h.hp))
  const tied = strongest ? [] : tapped.filter((h) => h.hp === top)
  const tieTarget = tied.find((h) => h.id === tiePick)
  return { tapped, strongest, tied, top, targetIds: strongest ? [strongest.id] : tieTarget ? [tieTarget.id] : [] }
}

// What a hit or a miss does, in words: "2 damage and Dazed", "no damage".
export function attackEffect(attack, hit) {
  const damage = hit ? attack.damage : attack.miss
  const parts = [damage > 0 && `${damage} damage`, ...(hit ? attack.conditions : [])].filter(Boolean)
  return parts.length > 0 ? parts.join(' and ') : 'no damage'
}

// The hero a "move toward the hero with the most HP" step goes after, or null when it's
// a tie (the players pick) or the step moves toward the closest hero instead. It goes by
// the HP each hero has left right now (not their full HP), and skips heroes who are down
// (0 HP), in the Astral Refuge, or not on the virtual board when there is one.
export function towardHero(state, step) {
  if (step?.toward !== 'mostHp') return null
  const tokens = state.board?.tokens
  const living = state.heroes.filter((h) => h.hp > 0 && !h.tokens?.refuge && (!tokens || tokens[h.id]))
  return living.length > 0 ? mostHp(living) : null
}
