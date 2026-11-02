// The fan heroes' cards a computer hero plays (cards.json heroes from the fan sets, run on the
// test copy): the start-of-turn songs and stances (Song of Courage, Melody of Defense,
// Centered Defense), the boosts just before a big attack (Heavy Hitter, Power of Earth),
// Fleetfooted in place of a disable roll, and the things that happen on anyone's turn
// (Bardic Song rerolls, Mind Over Body rolls). Each returns { action, say } or null, like the
// rest of the brain (brain.js and powers.js call them).

import { tilesBetween } from '../board/paths.js'
import { boardGrid } from '../board/play.js'
import { powerNumber } from '../state/combat.js'
import { foes } from '../state/gameHelpers.js'
import { bardicSongsLeft } from '../state/heroAttacks.js'
import { canSpendAttack, mindOverBodyChoices } from '../state/heroTurn.js'
import { trapsOnTile } from '../state/fanPowers.js'
import { figureHp, foeFigures, standingHeroes, usable } from './powers.js'

const d20 = () => Math.floor(Math.random() * 20) + 1
const hurt = (h) => h.hp > 0 && h.hp <= Math.ceil(h.maxHp / 2)
const hasBuff = (hero, power) => (hero.buffs ?? []).some((b) => b.source === power.name)

// How many tiles the nearest monster or villain figure is from a square (99: none on the board).
function nearestFoe(state, at) {
  if (!at) return 99
  const grid = boardGrid(state.board)
  return foeFigures(state).reduce((best, f) => Math.min(best, tilesBetween(grid, at, f.at)), 99)
}

// The very start of the hero's Hero Phase: it hasn't moved, attacked or used its attack yet.
const phaseStart = (state, hero) => !(state.turn.boardMoves > 0) && canSpendAttack(state, hero) && !state.turn.lastAttack

// ---- Songs and stances at the start of the Hero Phase ----

// Song of Courage (+2 attack, everyone) when there's a fight on: 2 or more monster figures,
// or a villain. Melody of Defense (+2 AC, everyone) when a hurt hero has a monster within
// 1 tile. Centered Defense (+3 AC, the hero) when a monster is within 1 tile and the hero
// isn't at full HP. Courage first when both songs fit: finishing monsters keeps everyone safe too.
export function buffPower(state, hero) {
  if (!state.board?.tokens[hero.id] || !phaseStart(state, hero)) return null
  const figures = foeFigures(state)
  if (figures.length === 0) return null
  const party = standingHeroes(state)
  const tokens = state.board.tokens
  const mine = (test) => usable(hero, (e, p) => Boolean(e.use?.buff) && !e.use.xpCost && test(e.use.buff) && !hasBuff(hero, p))

  const courage = mine((b) => b.who === 'all' && b.attack > 0 && b.lasts !== 'thisPhase')
  if (courage && (figures.length >= 2 || figures.some((f) => f.foe.villain))) {
    return { action: { type: 'USE_POWER', heroId: hero.id, powerId: courage.id, heroIds: [] }, say: `${hero.name} sings ${courage.name}: everyone hits harder!` }
  }
  const melody = mine((b) => b.who === 'all' && b.ac > 0)
  if (melody && party.some((h) => hurt(h) && nearestFoe(state, tokens[h.id]) <= 1)) {
    return { action: { type: 'USE_POWER', heroId: hero.id, powerId: melody.id, heroIds: [] }, say: `${hero.name} sings ${melody.name}: everyone is harder to hit.` }
  }
  const stance = mine((b) => b.who === 'self' && b.ac > 0)
  if (stance && hero.hp < hero.maxHp && nearestFoe(state, tokens[hero.id]) <= 1) {
    return { action: { type: 'USE_POWER', heroId: hero.id, powerId: stance.id, heroIds: [] }, say: `${hero.name} uses ${stance.name}.` }
  }
  return null
}

// Heavy Hitter, Power of Earth: +attack for this Hero Phase, used just before an attack that
// matters (a finishing blow or the villain) when it isn't already a sure hit. A boost that
// only works for some attacks (Power of Earth: Longbow) needs that attack.
export function boostPower(state, hero, option) {
  if (!option || !(option.finishes.length > 0 || option.villain) || option.chance >= 0.9) return null
  const boost = usable(hero, (e, p) => {
    const b = e.use?.buff
    return Boolean(b) && b.who === 'self' && b.attack > 0 && b.lasts === 'thisPhase' && !e.use.xpCost && !hasBuff(hero, p) && (!b.only || option.power.name.startsWith(b.only))
  })
  if (!boost) return null
  return { action: { type: 'USE_POWER', heroId: hero.id, powerId: boost.id, heroIds: [] }, say: `${hero.name} uses ${boost.name} before attacking.` }
}

// ---- Traps ----

// Fleetfooted (a fan Assassin's): takes a trap on the hero's tile away, no roll, and the card
// stays in play. Used before rolling to disable one.
export function fleetfooted(state, hero) {
  if (!state.board?.tokens[hero.id]) return null
  const traps = trapsOnTile(state, hero)
  if (traps.length === 0) return null
  const power = usable(hero, (e) => Boolean(e.use?.removeTrap))
  if (!power) return null
  return { action: { type: 'USE_POWER', heroId: hero.id, powerId: power.id, heroIds: [], trapIds: [traps[0].id] }, say: `${hero.name} uses ${power.name} to take the ${traps[0].name} trap away.` }
}

// ---- On anyone's turn ----

// Mind Over Body (a fan Monk's ability): a computer hero always rolls for a new condition.
// Bardic Song (a fan Bard's ability): a computer bard's song for a computer hero's miss that
// would have finished a monster or hit a villain. The last song is kept for a villain. A
// player's miss is theirs to decide: the attack box offers the song to every screen.
export function fanReaction(state, roll = d20) {
  if (state?.status !== 'playing') return null
  for (const hero of state.heroes.filter((h) => h.ally && !h.escaped && h.hp > 0)) {
    const condition = mindOverBodyChoices(hero)[0]
    if (condition) return { action: { type: 'MIND_OVER_BODY', heroId: hero.id, condition, roll: roll() }, say: `${hero.name} tries to shrug off being ${condition} (Mind Over Body).` }
  }

  const last = state.turn.lastAttack
  const attacker = last && state.heroes.find((h) => h.id === last.heroId)
  if (!attacker?.ally) return null
  const power = attacker.powers.find((p) => p.id === last.powerId)
  const damage = powerNumber(power?.card?.damage) ?? 1
  const alive = (id) => foes(state).find((m) => m.id === id && m.hp > 0)
  const rows = last.rolls.filter((r) => !r.hit && !r.rerolled && alive(r.monsterId))
  for (const bard of state.heroes.filter((h) => h.ally && bardicSongsLeft(h) > 0)) {
    const left = bardicSongsLeft(bard)
    const row = rows.find((r) => alive(r.monsterId).villain || (left > 1 && damage >= figureHp(alive(r.monsterId))))
    if (row) {
      return {
        action: { type: 'REROLL_ATTACK', helperId: bard.id, bardicSong: true, monsterId: row.monsterId, roll: roll() },
        say: `${bard.name}'s Bardic Song: ${attacker.name} rolls again!`,
      }
    }
  }
  return null
}
