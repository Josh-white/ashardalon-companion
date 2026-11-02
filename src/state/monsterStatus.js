// Statuses fan heroes put on monsters and villains (monster.statuses: [{ kind, tokens, source }]).
// Each one is counted down by hourglass tokens: one comes off at the end of the monster's turn
// in the Villain Phase (MARK_ACTED), and being attacked can take them off too.
//   skip     the monster doesn't activate (Pacified, Stunned)
//   roll     a d20 at the start of its turn: under 11 it doesn't activate (Cowardly)
//   stays    it can't leave its tile (Trapped) or can't move at all (Immobilized)
import { findFoe, updateMonster, validRoll, withLog } from './gameHelpers.js'

export const STATUSES = {
  pacified: { label: 'Pacified', icon: '😌', tokens: 1, skip: true, onAttacked: 'all', text: "It doesn't activate this Villain Phase." },
  stunned: { label: 'Stunned', icon: '💫', tokens: 1, skip: true, text: "It doesn't activate this Villain Phase." },
  cowardly: { label: 'Cowardly', icon: '😨', tokens: 1, roll: true, text: 'Roll a d20 before its turn: under 11, it doesn\'t activate.' },
  trapped: { label: 'Trapped', icon: '🕸️', tokens: 2, onAttacked: 'one', text: "It can't move off its tile. It can still attack next to it or at range." },
  immobilized: { label: 'Immobilized', icon: '⛓️', tokens: 1, text: "It can't move this turn. It can still attack." },
  slowed: { label: 'Slowed', icon: '🐌', tokens: 1, text: 'It moves at most 1 tile this turn.' },
}

export const statusesOf = (monster) => (monster?.statuses ?? []).filter((s) => STATUSES[s.kind] && s.tokens > 0)
export const skipsTurn = (monster) => statusesOf(monster).find((s) => STATUSES[s.kind].skip) ?? null
export const cowardlyDue = (monster) => statusesOf(monster).find((s) => STATUSES[s.kind].roll && !s.rolled) ?? null

export function addStatus(state, monsterId, kind, source) {
  const monster = findFoe(state, monsterId)
  const rule = STATUSES[kind]
  if (!monster || !rule) return state
  const statuses = [...statusesOf(monster).filter((s) => s.kind !== kind), { kind, tokens: rule.tokens, ...(source ? { source } : {}) }]
  return withLog(updateMonster(state, monsterId, () => ({ statuses })), `The ${monster.name} is ${rule.label}${source ? ` (${source})` : ''}.`)
}

// An attack on the monster: Pacified ends, Trapped loses a token.
export function attackedStatus(state, monsterId) {
  const monster = findFoe(state, monsterId)
  const list = statusesOf(monster)
  if (!list.some((s) => STATUSES[s.kind].onAttacked)) return state
  const statuses = list
    .map((s) => (STATUSES[s.kind].onAttacked === 'all' ? { ...s, tokens: 0 } : STATUSES[s.kind].onAttacked === 'one' ? { ...s, tokens: s.tokens - 1 } : s))
    .filter((s) => s.tokens > 0)
  const gone = list.filter((s) => !statuses.some((t) => t.kind === s.kind)).map((s) => STATUSES[s.kind].label)
  const next = updateMonster(state, monsterId, () => ({ statuses }))
  return gone.length ? withLog(next, `The ${monster.name} is no longer ${gone.join(' or ')}.`) : next
}

// The end of the monster's turn in the Villain Phase (or the turn it skipped): one token off each.
export function endTurnStatus(state, monsterId) {
  const monster = findFoe(state, monsterId)
  const list = statusesOf(monster)
  if (list.length === 0) return state
  const statuses = list.map((s) => ({ ...s, tokens: s.tokens - 1, rolled: undefined })).filter((s) => s.tokens > 0)
  const gone = list.filter((s) => !statuses.some((t) => t.kind === s.kind)).map((s) => STATUSES[s.kind].label)
  const next = updateMonster(state, monsterId, () => ({ statuses }))
  return gone.length ? withLog(next, `The ${monster.name} is no longer ${gone.join(' or ')}.`) : next
}

// Cowardly: the roll before its turn. Under 11 it doesn't activate (game.js marks its turn done).
export function cowardlyRoll(state, action) {
  const monster = findFoe(state, action.id)
  const status = cowardlyDue(monster)
  if (!status || !validRoll(action.roll)) return { state, flees: false }
  const flees = action.roll < 11
  const statuses = statusesOf(monster).map((s) => (s === status ? { ...s, rolled: action.roll } : s))
  const next = withLog(updateMonster(state, monster.id, () => ({ statuses })), `The Cowardly ${monster.name} rolled ${action.roll}: ${flees ? "it doesn't activate." : 'it takes its turn.'}`)
  return { state: next, flees }
}
