// The computer ally's brain: what a hero played by the computer does next on the virtual
// board. A plain function of the game state, so it can be tested without any screens.
//
// It makes the choices a player makes in the Hero Phase (spend a surge, attack, move, pick
// the extra power after levelling up) and answers "no tile" in the Exploration Phase when
// the hero isn't on an edge, and cancels a nasty encounter card when the party has XP to
// spare (cancelEncounter.js). Everything else (drawing the tile, the encounter card, every
// monster's turn, treasure) is a tap through the turn screen, where the board already
// answers the questions; AllyPanel.jsx taps those buttons. Returns
//   { action, say }  a tap to send, and what the ally is doing, in words
//   null             nothing for the brain to decide: tap the turn screen's next button

import { baseId, key, unexploredEdges } from '../board/grid.js'
import { adjacent, distances, tilesBetween } from '../board/paths.js'
import { boardGrid, caged, heroEdges, heroReach, movesLeft, occupied, stayedOnBoard, timeLeapt } from '../board/play.js'
import { foeDistance, foesInRange, powerRange } from '../board/monsters.js'
import { heroesInReach } from '../board/encounters.js'
import { moveChoices, moveTargets } from '../board/powerMoves.js'
import { attackDistances } from '../board/attackDistances.js'
import { effectsOf, maxRolls, onHitHeals, wolfBlocked } from '../data/powerEffects.js'
import { targetAllowed } from '../state/fanPowers.js'
import { statusesOf } from '../state/monsterStatus.js'
import { PHASES } from '../data/phases.js'
import { powerNumber } from '../state/combat.js'
import { foes } from '../state/gameHelpers.js'
import { attackGone, canBecomeWolf, naturesHealingOk } from '../state/heroTurn.js'
import { petsDue, petsOf } from '../state/pets.js'
import { XP_TO_LEVEL_UP } from '../data/heroes.js'
import { attackItems, heroItems, itemTrapBonus } from '../data/items.js'
import { boardMarkers, trapsToDisable } from '../board/markers.js'
import { treasureInReach } from '../board/items.js'
import { escapeBlockers } from '../state/adventure.js'
import { escapeGoal, escapeHold, exitName, exitSquares } from '../board/exits.js'
import { trapDisable } from '../state/encounterRules.js'
import { cancelEncounter } from './cancelEncounter.js'
import { badlyHurt, d20, heroById, missingHp, parse } from './helpers.js'
import { doorGoals, doorStep, goalDoor } from './doors.js'
import { castDaily, fearMove, figureHp, guardPower, placeHandToken, sphereStep } from './powers.js'
import { divertMove, divertPower, wizardEyeStep } from './boardPowers.js'
import { boostPower, buffPower, chorusStep, circleStep, fanMove, fearlessStep, fleetfooted, giftsStep, improvise, perchPower, rescueStride, seekersPower, shadowStep, shadowmerge, summonStep, trappingAttack } from './fanPowers.js'
import { hypnotismAttack, hypnotismPlan, moveFirst, moveFirstStep, offTurnMove, rescueSwap, startMove, sweepAttack } from './moveFirst.js'

export { offTurnMove }

// A d20 the way the screens roll one; tests pass their own.

// The hero whose turn it is, when the computer plays them.
export function activeAlly(state) {
  const hero = state?.status === 'playing' ? state.heroes[state.turn.heroIndex] : null
  return hero?.ally ? hero : null
}

// Attack powers the ally uses as a plain attack: a roll at one or more monsters, with
// healing or a shield to hand out afterwards (followUp) or a move it may skip after it.
// Powers that move a figure first (Charge, a swap, a pull, Hypnotism) do that move first
// (moveFirstPlans, hypnotismPlan below). Wrathful Thunder is fine: the board passes the monster.
const pullsFirst = (power) => {
  const steps = effectsOf(power).board?.before ?? []
  return steps.length > 0 && steps.every((m) => /^monster/.test(m.pick) && m.to === 'nextToSelf')
}

// A power whose move comes first (Charge, Into the Fray, Taunting Advance) is a plain attack
// once the ally has done that move this turn (moveFirst below).
const movedFirst = (state, power) => Boolean(state && state.turn.beforeMoved === power.id && !state.turn.boardMove)

export function simpleAttack(power, state = null) {
  if (!power || power.used || !power.card) return false
  const e = effectsOf(power)
  // Guiding Strike (a fan Bard's) has no attack number: it always hits.
  if (powerNumber(power.card.attack) === null && !e.autoHit) return false
  if (e.before && movedFirst(state, power)) return !e.use && !e.reaction && (!e.ask || ['started-adjacent', 'adjacent-count'].includes(e.ask))
  // Holy Strike's and Valiant Strike's questions the board answers (askAnswers).
  const asks = !e.ask || ['started-adjacent', 'adjacent-count'].includes(e.ask)
  // Divine Challenge pulls a monster next to the hero first; with one there already, it's a
  // plain attack on that one (the pull is optional, pullsFirst below).
  if ((e.before && !pullsFirst(power)) || !asks || e.use || e.reaction) return false
  return true
}

// Benign Transposition and King's Castle swap places with a hero first, then attack.
const swapsFirst = (power) => effectsOf(power).board?.before?.[0]?.to === 'swap'
// How far the attack after the swap reaches: the sentence of the card that attacks
// ("Attack 1 Monster within 2 tiles of you."), else a monster next to the hero.
function swapRange(power) {
  const sentence = String(power.card?.text ?? '').split(/\.\s*/).find((t) => /attack/i.test(t)) ?? ''
  return powerRange(sentence.replace(/swap\w*/gi, '')) ?? 'adjacent'
}


// The question an attack power asks afterwards (Sacred Flame's healing, Cleric's Shield,
// Righteous Smite): the most hurt hero on the ally's tile gets it.
function followUp(state, hero) {
  const last = state.turn.lastAttack
  if (!last || last.heroId !== hero.id || last.followUpDone) return null
  const power = hero.powers.find((p) => p.id === last.powerId)
  if (!power) return null
  const effects = effectsOf(power)
  const kind = onHitHeals(effects, last.rolls) ? 'heal-one' : effects.after
  if (!['heal-one', 'heal-tile', 'shield'].includes(kind)) return null
  const onTile = (heroesInReach(state, hero.id, 'sameTile') ?? [hero.id]).map((id) => heroById(state, id)).filter((h) => h && h.hp > 0)
  const neediest = [...onTile].sort((a, b) => missingHp(b) - missingHp(a) || a.hp - b.hp)[0] ?? hero
  const heroIds = kind === 'heal-tile' ? onTile.map((h) => h.id) : [kind === 'shield' ? [...onTile].sort((a, b) => a.hp - b.hp)[0]?.id ?? hero.id : neediest.id]
  const who = heroIds.length === 1 ? (heroIds[0] === hero.id ? 'itself' : heroById(state, heroIds[0])?.name) : 'everyone on the tile'
  return {
    action: { type: 'ATTACK_FOLLOW_UP', heroId: hero.id, powerId: power.id, heroIds },
    say: `${hero.name}'s ${power.name} ${kind === 'shield' ? 'shields' : 'heals'} ${who}.`,
  }
}

// A move waiting on the board for one of the ally's figures: Cause Fear's monsters run as
// far from the party as they can; a power's own move afterwards (Righteous Advance,
// Distracting Jab) is skipped; a move a monster's hit forces on the ally goes to the first
// square the board allows.
export function pendingMove(state, hero) {
  const move = state.turn.boardMove
  if (!move || move.heroId !== hero.id) return null
  const fear = fearMove(state, hero, moveChoices(state), (id) => moveTargets(state, id))
  if (fear) return fear
  const divert = divertMove(state, hero)
  if (divert) return divert
  const first = moveFirstStep(state, hero)
  if (first) return first
  // A fan power's move afterwards (Alshabbah, Flurry of Blows, Swift Evasion...).
  const fan = fanMove(state, hero)
  if (fan) return fan
  if (!move.from) return { action: { type: 'SKIP_BOARD_MOVE' }, say: `${hero.name} stays where it is.` }
  const id = moveChoices(state)[0]
  const to = id && moveTargets(state, id)[0]
  if (!to) return null
  return { action: { type: 'BOARD_MOVE', id, to: to.split(',').map(Number) }, say: `${hero.name} is pushed back.` }
}

// An extra At-Will attack the ally was given (Cause Fear, on anyone's turn): the best one in
// reach, or it passes.
export function bonusAttack(state, hero, roll = d20) {
  const extra = (state.turn.bonusAttacks ?? []).find((b) => b.heroId === hero.id)
  if (!extra) return null
  const free = { ...state, turn: { ...state.turn, lastAttack: null, attackSpent: null, boardMoves: 0 } }
  const option = attackOptions(free, hero, { atWill: true })[0]
  if (!option) return { action: { type: 'SKIP_BONUS_ATTACK', heroId: hero.id }, say: `${hero.name} has nothing in reach for the extra attack.` }
  return { action: { ...attackAction(state, hero, option, roll), bonusAttack: true }, say: option.say }
}

// Monster and villain figures next to the hero on the board (Valiant Strike's +1 each).
export function adjacentFoes(state, hero) {
  const at = state.board?.tokens[hero.id]
  if (!at) return 0
  const grid = boardGrid(state.board)
  const ids = new Set(foes(state).filter((m) => m.hp > 0 && !m.objective).map((m) => m.id))
  return Object.entries(state.board.tokens).filter(([id, sq]) => ids.has(baseId(id)) && adjacent(grid, at, sq)).length
}

// The answers to a power's question before the roll, from the board: how many monsters are
// next to the hero (Valiant Strike), and whether it started its Hero Phase next to the
// monster (Holy Strike: it hasn't moved this turn and is next to it now).
function askAnswers(state, hero, power) {
  const ask = effectsOf(power).ask
  if (ask === 'adjacent-count') return { adjacentCount: Math.max(1, adjacentFoes(state, hero)) }
  if (ask === 'started-adjacent') return { startedAdjacent: Boolean(stayedOnBoard(state, hero)) }
  return {}
}

// A free attack from an item (Ring of Shooting Stars, Throwing Shield: "it doesn't count as
// your attack") at the weakest monster in reach, finishing one off if it can.
export function freeItemAttack(state, hero, roll = d20) {
  if (!state.board || !state.board.tokens[hero.id]) return null
  const all = foes(state).filter((m) => m.ac && m.hp > 0 && !m.objective && onBoard(state, m))
  for (const item of attackItems(hero, state.turn).filter((i) => i.card.freeAttack)) {
    const range = powerRange(item.card.note ?? item.card.text) ?? 'within2'
    const inReach = foesInRange(state, hero.id, range, all).sort((a, b) => Number(item.card.attack.damage >= figureHp(b)) - Number(item.card.attack.damage >= figureHp(a)) || figureHp(a) - figureHp(b))
    const target = inReach[0]
    if (!target) continue
    const distance = foeDistance(state, hero.id, target.id)
    return {
      action: { type: 'HERO_ATTACK', heroId: hero.id, itemId: item.id, targets: [{ monsterId: target.id, roll: roll() }], bonusAttack: false, distances: distance ? { [target.id]: distance } : {}, stayed: stayedOnBoard(state, hero) ?? false },
      say: `${hero.name} uses the ${item.card.name ?? item.name} on the ${target.name}.`,
    }
  }
  return null
}

// A monster on or next to the tile of a hero at half HP or less: the one to slow down.
function threatensHurt(state, monster) {
  if (!state.board) return false
  const grid = boardGrid(state.board)
  const spots = Object.entries(state.board.tokens).filter(([id]) => baseId(id) === monster.id).map(([, at]) => at)
  return state.heroes.some((h) => badlyHurt(h) && state.board.tokens[h.id] && spots.some((at) => tilesBetween(grid, at, state.board.tokens[h.id]) <= 1))
}

// Attack the hero's buffs add to this power (Song of Courage, Heavy Hitter, a Longbow-only Power of Earth).
const buffBonus = (hero, power) => (hero.buffs ?? []).reduce((sum, b) => sum + (b.attack && (!b.only || power.name.startsWith(b.only)) ? b.attack : 0), 0)

// What a power does on top of its damage, in the same points as a monster's HP:
//   heal   healing (Sacred Flame and War Song Strike on a hit, Comeback Strike for the hero itself
//          on a hit, Righteous Smite for the whole tile hit or miss). A friend at half HP or less
//          is worth the most. Sacred Flame with nobody hurt still beats a plain attack a little,
//          so the healer keeps to it.
//   shield Cleric's Shield's +2 AC (hit or miss) for the weakest hero on the tile, worth more on a
//          hurt one, nothing when that hero already has this hero's shield.
// anyHit is the chance at least one of the attack's rolls hits.
const healPoints = (h, n) => Math.min(n, missingHp(h)) * (badlyHurt(h) ? 2.5 : 1.5)
function extraWorth(state, hero, effects, anyHit) {
  const onTile = (heroesInReach(state, hero.id, 'sameTile') ?? [hero.id]).map((id) => heroById(state, id)).filter((h) => h && h.hp > 0 && !h.escaped)
  let heal = 0
  if (effects.onHit?.heal) heal += (Math.max(0, ...onTile.map((h) => healPoints(h, effects.onHit.heal))) || 0.5) * (effects.onHit.even ? 0.5 : 1) * anyHit
  if (effects.onHit?.healSelf) heal += healPoints(hero, effects.onHit.healSelf) * anyHit
  if (effects.after === 'heal-tile') heal += onTile.reduce((sum, h) => sum + healPoints(h, 1), 0)
  let shield = 0
  if (effects.after === 'shield') {
    const target = [...onTile].sort((a, b) => a.hp - b.hp)[0] ?? hero
    shield = target.shieldedBy === hero.id ? 0 : badlyHurt(target) ? 1.2 : 0.6
  }
  return { heal, shield }
}

// Healing points (healPoints) that make a daily worth spending: 2 HP for friends, or 1 HP
// for a friend at half HP or less plus a bit more.
const HEALING_DAILY = 3

export const onBoard = (state, foe) => Object.keys(state.board.tokens).some((id) => baseId(id) === foe.id)

// Every attack the hero could make from where they stand: [{ power, targets, score, say }].
// `all` keeps the dailies the ally would rather save (for planning a power's move first).
export function attackOptions(state, hero, { atWill = false, all: every = false } = {}) {
  if (!state.board || attackGone(state, hero) || !state.board.tokens[hero.id]) return []
  const all = foes(state).filter((m) => m.ac && m.hp > 0 && onBoard(state, m))
  if (all.length === 0) return []
  const options = []
  // As the wolf (a fan Druid's Wolf Form) only the wolf's attacks work, and those only as the wolf.
  for (const power of hero.powers.filter((p) => simpleAttack(p, state) && !wolfBlocked(hero, p) && (!atWill || p.type === 'at-will'))) {
    const effects = effectsOf(power)
    // A card that doesn't say how far it reaches is used on a monster next to the hero.
    const range = swapsFirst(power) ? swapRange(power) : pullsFirst(power) || effects.before ? 'adjacent' : effects.range ?? powerRange(power.card.text) ?? 'adjacent'
    // Fan cards that only hit some monsters: villains only, not on the hero's tile, next to another hero.
    const inReach = foesInRange(state, hero.id, range, all).filter((m) => !effects.targetOnly || targetAllowed(state, hero, effects, m))
    if (inReach.length === 0) continue
    const answers = askAnswers(state, hero, power)
    const bonus = (powerNumber(power.card.attack) ?? 0) + (answers.adjacentCount ?? 0) + buffBonus(hero, power) + (hero.tokens?.shadow ? effects.shadowBonus ?? 0 : 0)
    const damage = (powerNumber(power.card.damage) ?? 1) + (answers.startedAdjacent ? 1 : 0)
    const chance = (m) => (effects.autoHit ? 1 : Math.min(0.95, Math.max(0.05, (21 - (m.ac - bonus)) / 20)))
    const kills = (m) => damage >= figureHp(m)
    // Finish off what it can, then the weakest, villains first among equals.
    let order = [...inReach].sort((a, b) => Number(kills(b)) - Number(kills(a)) || Number(Boolean(b.villain)) - Number(Boolean(a.villain)) || figureHp(a) - figureHp(b))
    // Trapping Shot, Hurled Breath, Shock Sphere: every monster it attacks is on one tile. A power
    // that hits them all takes the tile with the most to hit (finishing blows count double).
    if (effects.oneTile) {
      const group = (first) => order.filter((m) => targetAllowed(state, hero, effects, m, [first.id]))
      const worth = (list) => list.length + list.filter(kills).length
      const anchor = maxRolls(power) === Infinity ? order.reduce((best, m) => (worth(group(m)) > worth(group(best)) ? m : best), order[0]) : order[0]
      order = group(anchor)
      order = [anchor, ...order.filter((m) => m !== anchor)]
    }
    const limit = maxRolls(power)
    let picked
    if (effects.sameTarget) picked = Array(limit).fill(order[0].id)
    else if (effects.attacks) picked = Array.from({ length: limit }, (_, i) => order[i % order.length].id)
    else picked = order.slice(0, Number.isFinite(limit) ? limit : order.length).map((m) => m.id)
    const hit = picked.map((id) => order.find((m) => m.id === id))
    // A status on the hit (Trapped, Pacified, Immobilized...) is worth most on a monster about to go
    // after a hurt friend, or the villain; nothing on one that has it already or dies anyway.
    const status = effects.onHit?.status
    const statusWorth = (m) => (!status || kills(m) || statusesOf(m).some((x) => x.kind === status) ? 0 : m.villain || threatensHurt(state, m) ? 2 : 0.5)
    // Healing on a hit happens once, when any of the rolls hits.
    const extra = extraWorth(state, hero, effects, 1 - hit.reduce((miss, m) => miss * (1 - chance(m)), 1))
    // Lucky Strike: +1 damage on an even die, about half of the hits.
    const even = (effects.evenBonus ?? 0) / 2
    const score = extra.heal + extra.shield + hit.reduce((sum, m) => sum + chance(m) * (damage + even + (kills(m) ? 4 : 0) + (m.villain ? 2 : 0) + statusWorth(m)), 0)
    const names = [...new Set(hit.map((m) => m.name))].join(' and the ')
    // Wolf Fangs costs the hero HP: only for a finishing blow or the villain, with HP to spare.
    if (effects.selfDamage && (hero.hp <= effects.selfDamage + 1 || !(hit.some(kills) || hit.some((m) => m.villain)))) continue
    options.push({
      power,
      targets: picked,
      score,
      chance: Math.min(...hit.map(chance)),
      ranged: !['adjacent', 'sameTile'].includes(range),
      finishes: hit.filter(kills).map((m) => m.id),
      villain: hit.some((m) => m.villain),
      heals: extra.heal,
      say: `${hero.name} attacks the ${names} with ${power.name}.`,
    })
  }
  // Dailies are saved for a villain, or a monster no at-will power could finish off, or real
  // healing (Righteous Smite on a hurt tile, Comeback Strike when the hero is badly hurt). With
  // no at-will that can reach anything, the daily is better than doing nothing.
  const atWills = options.filter((o) => o.power.type !== 'daily')
  const atWillFinishes = new Set(atWills.flatMap((o) => o.finishes))
  return options
    // A daily that isn't used up when it misses from the shadows (Into Darkness) is fine there too.
    .filter((o) => every || o.power.type !== 'daily' || atWills.length === 0 || o.villain || o.heals >= HEALING_DAILY || o.finishes.some((id) => !atWillFinishes.has(id)) || (hero.tokens?.shadow && effectsOf(o.power).shadowKeep))
    .sort((a, b) => b.score - a.score)
}

function attackAction(state, hero, option, roll) {
  const dist = attackDistances(state, hero, option.targets, option.power)
  return {
    type: 'HERO_ATTACK',
    heroId: hero.id,
    powerId: option.power.id,
    targets: option.targets.map((monsterId) => ({ monsterId, roll: roll() })),
    bonusAttack: false,
    distances: dist,
    stayed: stayedOnBoard(state, hero) ?? false,
    ...askAnswers(state, hero, option.power),
    // Follow My Lead: the friend closest to a monster follows up.
    ...(effectsOf(option.power).follower ? { followerId: followerFor(state, hero) } : {}),
    // The wolf Pounces (-2, Slows on a hit) on a monster about to go after a hurt friend.
    ...(effectsOf(option.power).wolf ? { pounce: pounceOn(state, option) } : {}),
  }
}

function pounceOn(state, option) {
  const target = foes(state).find((m) => m.id === option.targets[0])
  return Boolean(target) && option.finishes.length === 0 && option.chance > 0.5 && threatensHurt(state, target) && !statusesOf(target).some((x) => x.kind === 'slowed')
}

// The other standing hero nearest a monster (Follow My Lead's follower).
function followerFor(state, hero) {
  const grid = boardGrid(state.board)
  const spots = Object.entries(state.board.tokens).filter(([id]) => foes(state).some((m) => m.id === baseId(id) && m.hp > 0 && !m.objective)).map(([, at]) => at)
  const near = (h) => Math.min(99, ...spots.map((at) => tilesBetween(grid, at, state.board.tokens[h.id])))
  return state.heroes.filter((h) => h.id !== hero.id && h.hp > 0 && !h.escaped && state.board.tokens[h.id]).sort((a, b) => near(a) - near(b))[0]?.id ?? null
}

export const withHeroAt = (state, hero, at) => ({ ...state, board: { ...state.board, tokens: { ...state.board.tokens, [hero.id]: at } } })

// Steps from every square to the nearest of some goal squares.
function stepsToGoals(state, goals) {
  const grid = boardGrid(state.board)
  const best = new Map()
  for (const goal of goals) {
    for (const [k, d] of distances(grid, goal)) if (!best.has(k) || d < best.get(k)) best.set(k, d)
  }
  return best
}


// ---- Looking after the party (slice 3): heals, items, treasure and the way out ----

// Heroes still standing within a reach of the ally ('sameTile', 'adjacent', 'within2'), the ally first.
const nearby = (state, hero, reach) => (heroesInReach(state, hero.id, reach) ?? [hero.id]).map((id) => heroById(state, id)).filter((h) => h && h.hp > 0 && !h.escaped)
const neediest = (list) => [...list].sort((a, b) => missingHp(b) - missingHp(a) || a.hp - b.hp)[0] ?? null
const foesOnBoard = (state) => foes(state).filter((m) => !m.objective && m.hp > 0 && onBoard(state, m))
// Conditions a power or item can end (not curses).
// A heal whose card says it's for a hero at 0 HP (Ballad of Life).
export const forTheFallen = (power) => Boolean(effectsOf(power).use?.heal) && /\b0 HP\b/i.test(String(power.card?.text ?? ''))

const ENDABLE = ['Dazed', 'Poisoned', 'Immobilized', 'Slowed', 'Weakened']
const endable = (h) => (h.conditions ?? []).find((c) => ENDABLE.includes(c)) ?? null

// A utility power the ally knows: one that heals (Healing Hymn, Lay On Hands, Dwarven
// Resilience), ends a condition (Virtue's Touch) or puts Mirror Image up when monsters are
// around. Used only when it does some good. Powers that place things on the board stay
// with the players.
export function supportPower(state, hero) {
  for (const power of hero.powers.filter((p) => !p.used && p.card && !wolfBlocked(hero, p))) {
    const use = effectsOf(power).use
    if (!use || use.board || use.causeFear || use.refuge || use.invisible || use.ask) continue
    // Ballad of Life (a fan Bard's): only for a hero who is down at 0 HP.
    if (forTheFallen(power)) {
      const down = state.heroes.find((h) => h.id !== hero.id && h.hp <= 0 && !h.escaped)
      if (down) return { action: { type: 'USE_POWER', heroId: hero.id, powerId: power.id, heroIds: [down.id] }, say: `${hero.name} uses ${power.name}: ${down.name} gets back up!` }
      continue
    }
    if (use.tokens && !use.tokens.mirrorImage) continue
    // Healing that isn't worth it yet: save it until someone has lost this much.
    const amount = Math.max(use.healSelf ?? 0, use.heal ?? 0)
    if (use.move && movesLeft(state, hero) === 0) continue
    if (use.endCondition) {
      const who = nearby(state, hero, use.reach ?? 'adjacent').find((h) => (use.pick !== 'other' || h.id !== hero.id) && endable(h))
      if (who) return { action: { type: 'USE_POWER', heroId: hero.id, powerId: power.id, heroIds: [who.id], condition: endable(who) }, say: `${hero.name} uses ${power.name}: ${who.name} is no longer ${endable(who)}.` }
      continue
    }
    if (use.tokens?.mirrorImage) {
      if (hero.tokens?.mirrorImage || foesOnBoard(state).length === 0 || hero.hp > hero.maxHp / 2) continue
      return { action: { type: 'USE_POWER', heroId: hero.id, powerId: power.id, heroIds: [] }, say: `${hero.name} casts ${power.name}.` }
    }
    if (!amount) continue
    const others = use.pick ? nearby(state, hero, use.reach ?? 'sameTile').filter((h) => h.id !== hero.id) : []
    const other = neediest(others)
    const selfGood = use.healSelf && missingHp(hero) >= use.healSelf
    const otherGood = use.heal && other && missingHp(other) >= use.heal
    if (use.pick === 'other' && !use.optional && !use.healSelf ? !otherGood : !(selfGood || otherGood)) continue
    const heroIds = use.pick && other && (otherGood || !use.optional) ? [other.id] : []
    const who = [use.healSelf && hero.name, heroIds[0] && other.name].filter(Boolean).join(' and ')
    return { action: { type: 'USE_POWER', heroId: hero.id, powerId: power.id, heroIds }, say: `${hero.name} uses ${power.name} to heal ${who}.` }
  }
  return null
}

// A healing utility that only reaches a friend next to the hero or on its tile (Lay On Hands,
// Healing Hymn): with both actions left, walk to where it reaches a friend who has lost at
// least that much, and use it there (supportPower, next step). The attack is still left.
export function healWalk(state, hero) {
  if (movesLeft(state, hero) < 2 || state.turn.beforeMoved) return null
  const at = state.board?.tokens[hero.id]
  if (!at) return null
  const fromHere = distances(boardGrid(state.board), at)
  let best = null
  for (const power of hero.powers.filter((p) => !p.used && p.card && !wolfBlocked(hero, p))) {
    const use = effectsOf(power).use
    if (!use?.heal || use.pick !== 'other' || use.board || use.move || forTheFallen(power)) continue
    const reach = use.reach ?? 'sameTile'
    const close = new Set(nearby(state, hero, reach).map((h) => h.id))
    const needy = state.heroes.filter((h) => h.id !== hero.id && h.hp > 0 && !h.escaped && state.board.tokens[h.id] && missingHp(h) >= use.heal && !close.has(h.id))
    if (needy.length === 0) continue
    for (const k of heroReach(state, hero)) {
      const moved = withHeroAt(state, hero, parse(k))
      const there = nearby(moved, hero, reach).filter((h) => needy.some((n) => n.id === h.id))
      const who = neediest(there)
      if (!who) continue
      const steps = fromHere.get(k) ?? 99
      // A square it can still attack from is better, among the ones that reach the friend.
      const worth = healPoints(who, use.heal) + (attackOptions(moved, hero)[0]?.score ?? 0)
      if (!best || worth > best.worth || (worth === best.worth && steps < best.steps)) best = { k, worth, steps, who, power }
    }
  }
  if (!best) return null
  return { action: { type: 'MOVE_HERO', heroId: hero.id, to: parse(best.k) }, say: `${hero.name} goes to ${best.who.name} to use ${best.power.name}.` }
}

// A healing potion or a cure among the ally's items, for itself or a hero next to it who
// needs it: healing once a hero is down to 2 HP or less, a cure for a condition.
export function supportItem(state, hero) {
  for (const item of heroItems(hero).filter((i) => !i.used && i.card)) {
    const card = item.card
    const close = nearby(state, hero, 'adjacent')
    if (card.use === 'heal') {
      const who = neediest(close.filter((h) => h.hp <= 2 && missingHp(h) > 0))
      if (who) return { action: { type: 'USE_ITEM', heroId: hero.id, itemId: item.id, heroIds: [who.id] }, say: `${hero.name} uses the ${card.name} on ${who.id === hero.id ? 'itself' : who.name}.` }
    }
    // Tome of Experience: level up straight away.
    if (card.use === 'levelUp' && hero.level === 1) return { action: { type: 'USE_ITEM', heroId: hero.id, itemId: item.id, heroIds: [] }, say: `${hero.name} reads the ${card.name} and levels up!` }
    // Potion of Rejuvenation, Pearl of Power: a used daily power flips back up.
    if (card.use === 'refreshPower' || card.use === 'refreshAny') {
      const spent = hero.powers.find((p) => p.used && p.type === 'daily') ?? hero.powers.find((p) => p.used)
      if (spent) return { action: { type: 'USE_ITEM', heroId: hero.id, itemId: item.id, heroIds: [], targetId: spent.id }, say: `${hero.name} uses the ${card.name}: ${spent.name} is ready again.` }
    }
    if (card.use === 'endCondition') {
      const who = close.find(endable)
      if (who) return { action: { type: 'USE_ITEM', heroId: hero.id, itemId: item.id, heroIds: [who.id], condition: endable(who) }, say: `${hero.name} uses the ${card.name}: ${who.name} is no longer ${endable(who)}.` }
    }
  }
  return null
}

// The way out, once the adventure's goals are done and this hero can leave (carrying the
// item it has to, if any). Null while there's nothing to escape to.
export function exitGoal(state, hero) {
  if (!state.board || !escapeGoal(state) || state.adventure.escaped || escapeBlockers(state).length > 0) return null
  const hold = escapeHold(state, hero)
  if (hold === 'token' || hold === 'goals' || hold === 'no-escape') return null
  const squares = [...exitSquares(state)].map(parse)
  return squares.length > 0 ? { squares, name: exitName(state), here: hold === '' } : null
}

// Walks the hero toward some goal squares, as far as it can this move. Null when it can't get closer.
function walkToward(state, hero, goals, say) {
  const reach = heroReach(state, hero)
  const at = state.board.tokens[hero.id]
  if (!at || reach.length === 0 || goals.length === 0) return null
  const steps = stepsToGoals(state, goals)
  const here = steps.get(key(at)) ?? 99
  const target = [...reach].sort((a, b) => (steps.get(a) ?? 99) - (steps.get(b) ?? 99))[0]
  if (target && (steps.get(target) ?? 99) < here) return { to: parse(target), say }
  return null
}

// Treasure tokens lying on the board that nobody has picked up (Hidden Treasure).
const looseTreasure = (state) => (state.board.items ?? []).filter((i) => i.kind === 'treasure' && i.at).map((i) => i.at)


// ---- Traps (Poisoned Dart Trap, Whirling Blades...) ----

// The roll the hero needs to disable a trap, after tools (Thieves' Tools) and Kobold Trappers.
const disableNeeds = (state, hero, trap) => trapDisable(state, hero, trap).needs
// Placed traps the board knows the tile of, with the floor squares of those tiles.
const placedTraps = (state) => boardMarkers(state).filter((m) => m.marker.type === 'trap' && m.squares.length > 0)

// Who the party sends to a trap: the computer hero with the best chance (tools first),
// Tarak the rogue among equals, then the nearest. Players' own heroes decide for themselves.
function trapExpert(state, trapSquares) {
  let best = null
  for (const h of state.heroes.filter((x) => x.ally && x.hp > 0 && !x.escaped && state.board.tokens[x.id])) {
    const steps = stepsToGoals(state, trapSquares).get(key(state.board.tokens[h.id])) ?? 99
    const score = itemTrapBonus(h) * 10 + (h.key === 'rogue' ? 5 : 0) - steps
    if (!best || score > best.score) best = { hero: h, score }
  }
  return best?.hero ?? null
}

// On a trap's tile in the Hero Phase: roll to disable it instead of attacking, unless an
// attack would finish a monster or hit a villain (that's worth more this turn).
export function disableTrap(state, hero, roll = d20) {
  if (!state.board || attackGone(state, hero)) return null
  const { here } = trapsToDisable(state, hero)
  const placed = new Set(placedTraps(state).map((m) => m.marker.id))
  const traps = here.filter((t) => placed.has(t.id)).sort((a, b) => disableNeeds(state, hero, a) - disableNeeds(state, hero, b))
  const trap = traps[0]
  if (!trap) return null
  const best = attackOptions(state, hero)[0]
  if (best && (best.finishes.length > 0 || best.villain)) return null
  return { action: { type: 'DISABLE_TRAP', trapId: trap.id, heroId: hero.id, roll: roll() }, say: `${hero.name} tries to disable the ${trap.name} (needs ${Math.max(1, disableNeeds(state, hero, trap))}).` }
}

// Walking to a trap's tile to disable it: the party's trap expert, when it has nothing to
// attack from where it stands and can still attack after the move.
function toTrap(state, hero) {
  const traps = placedTraps(state)
  if (traps.length === 0 || attackGone(state, hero) || movesLeft(state, hero) < 2) return null
  if (trapsToDisable(state, hero).here.some((t) => traps.some((m) => m.marker.id === t.id))) return null
  const squares = traps.flatMap((m) => m.squares.filter((sq) => sq.floor).map((sq) => [sq.x, sq.y]))
  if (trapExpert(state, squares)?.id !== hero.id) return null
  const best = attackOptions(state, hero)[0]
  if (best && (best.finishes.length > 0 || best.villain)) return null
  return walkToward(state, hero, squares, `${hero.name} heads for the trap to disable it.`)
}

// ---- Sticking together: freeing a caged friend, and not wandering off ----

// Curses a hero, or a hero on their tile, can roll to end instead of attacking (the Cage).
const actionCurses = (h) => (h.curses ?? []).filter((c) => c.card?.removeRoll?.phase === 'action')
const areaOf = (grid, at) => (at ? grid.get(key(at))?.area : undefined)
const standing = (state, h) => h.hp > 0 && !h.escaped && Boolean(state.board?.tokens[h.id])

// Heroes stuck in such a curse, still on the board, other than this one.
const stuckFriends = (state, hero) => state.heroes.filter((h) => h.id !== hero.id && !h.escaped && state.board.tokens[h.id] && actionCurses(h).length > 0)

// The floor squares of a hero's tile (the Start tile's halves count as two tiles).
function tileSquares(state, heroId) {
  const grid = boardGrid(state.board)
  const area = areaOf(grid, state.board.tokens[heroId])
  return [...grid.values()].filter((sq) => sq.floor && sq.area === area).map((sq) => [sq.x, sq.y])
}

// In the Hero Phase, instead of attacking: roll to open the Cage on itself or on a hero on
// its tile. An attack that finishes off a monster comes first.
export function freeFromCurse(state, hero, roll = d20) {
  if (!state.board || attackGone(state, hero) || !state.board.tokens[hero.id]) return null
  const grid = boardGrid(state.board)
  const here = areaOf(grid, state.board.tokens[hero.id])
  const own = actionCurses(hero).map((curse) => ({ cursed: hero, curse }))
  const friends = stuckFriends(state, hero)
    .filter((h) => areaOf(grid, state.board.tokens[h.id]) === here)
    .flatMap((h) => actionCurses(h).map((curse) => ({ cursed: h, curse })))
  const pick = [...own, ...friends][0]
  if (!pick) return null
  const best = attackOptions(state, hero)[0]
  if (best && best.finishes.length > 0) return null
  const { cursed, curse } = pick
  const what = (curse.card.removeRoll.label || `end the ${curse.name}`).replace(/^./, (c) => c.toLowerCase())
  return {
    action: { type: 'CURSE_ROLL', heroId: cursed.id, curseId: curse.id, roll: roll() },
    say: cursed.id === hero.id ? `${hero.name} tries to ${what.replace(/^try to /, '')}.` : `${hero.name} helps ${cursed.name}: ${what}.`,
  }
}

// Who goes to a caged hero: the nearest computer hero that can still move, isn't stuck
// itself and isn't already on that tile with someone. Players' own heroes decide for themselves.
function rescuerFor(state, stuck) {
  const squares = tileSquares(state, stuck.id)
  const steps = stepsToGoals(state, squares)
  let best = null
  for (const h of state.heroes.filter((x) => x.ally && x.id !== stuck.id && standing(state, x) && actionCurses(x).length === 0 && !caged(x))) {
    const d = steps.get(key(state.board.tokens[h.id])) ?? 99
    if (d >= 99) continue
    if (!best || d < best.d) best = { hero: h, d }
  }
  return best?.hero ?? null
}

// Walking to a caged friend's tile to open the cage. `arriving` only when the move gets it
// onto the tile this turn (so it can still roll after); otherwise as close as it can.
export function toStuckFriend(state, hero, { arriving = false } = {}) {
  if (!state.board || movesLeft(state, hero) === 0) return null
  const grid = boardGrid(state.board)
  const here = areaOf(grid, state.board.tokens[hero.id])
  for (const stuck of stuckFriends(state, hero)) {
    const squares = tileSquares(state, stuck.id)
    if (areaOf(grid, state.board.tokens[stuck.id]) === here) continue
    if (rescuerFor(state, stuck)?.id !== hero.id) continue
    const onTile = new Set(squares.map(key))
    const landing = heroReach(state, hero).filter((k) => onTile.has(k))[0]
    const say = `${hero.name} goes to help ${stuck.name} out of the ${actionCurses(stuck)[0].name}.`
    if (landing) return { to: parse(landing), say }
    if (arriving) continue
    const walk = walkToward(state, hero, squares, say)
    if (walk) return walk
  }
  return null
}

// The other heroes still in the dungeon with this one, where they stand.
const partySquares = (state, hero) => state.heroes.filter((h) => h.id !== hero.id && standing(state, h)).map((h) => state.board.tokens[h.id])

// How far a hero may drift from the nearest friend before it walks back: about two tiles.
export const STRAY_STEPS = 8

// Steps from the hero to the nearest other hero (Infinity when it's on its own).
export function strayDistance(state, hero) {
  const at = state.board?.tokens[hero.id]
  const others = at ? partySquares(state, hero) : []
  if (others.length === 0) return Infinity
  const far = distances(boardGrid(state.board), at)
  return Math.min(...others.map((sq) => far.get(key(sq)) ?? 99))
}

// Picks among goal groups the one that keeps the party together: the hero's own steps to it
// plus how far, on average, the rest of the party is from it. Each group is a list of squares.
function groupedGoal(state, hero, groups) {
  const grid = boardGrid(state.board)
  const mine = distances(grid, state.board.tokens[hero.id])
  const theirs = partySquares(state, hero).map((sq) => distances(grid, sq))
  const near = (map, squares) => Math.min(...squares.map((sq) => map.get(key(sq)) ?? 99))
  const score = (squares) => near(mine, squares) + (theirs.length ? theirs.reduce((s, m) => s + near(m, squares), 0) / theirs.length : 0)
  return [...groups].sort((a, b) => score(a) - score(b))[0] ?? null
}

// A healer with both actions left (Sacred Flame, Righteous Smite) steps onto a hurt friend's
// tile first when an attack from there is worth more, healing included.
const healsOnAttack = (e) => Boolean(e.onHit?.heal || e.after === 'heal-tile')
export function healerMove(state, hero, option) {
  if (movesLeft(state, hero) < 2 || state.turn.beforeMoved) return null
  if (!hero.powers.some((p) => simpleAttack(p, state) && healsOnAttack(effectsOf(p)))) return null
  if (!state.heroes.some((h) => h.id !== hero.id && h.hp > 0 && missingHp(h) > 0 && state.board.tokens[h.id])) return null
  const at = state.board.tokens[hero.id]
  const fromHere = distances(boardGrid(state.board), at)
  let best = null
  for (const k of heroReach(state, hero)) {
    if (k === key(at)) continue
    const moved = withHeroAt(state, hero, parse(k))
    const found = attackOptions(moved, moved.heroes.find((h) => h.id === hero.id))[0]
    if (!found?.heals) continue
    const steps = fromHere.get(k) ?? 99
    if (!best || found.score > best.score || (found.score === best.score && steps < best.steps)) best = { k, score: found.score, steps }
  }
  // Only for a real gain: a hurt friend to heal that this square can't reach.
  if (!best || best.score < (option?.score ?? 0) + 0.75) return null
  return { action: { type: 'MOVE_HERO', heroId: hero.id, to: parse(best.k) }, say: `${hero.name} moves onto a hurt friend's tile to heal them.` }
}

// Where the hero goes now, or null to stay put: next to a monster it can attack from there,
// closer to the monsters, or on to the nearest unexplored edge when there are none.
export function bestMove(state, hero) {
  const reach = heroReach(state, hero)
  const at = state.board?.tokens[hero.id]
  if (!at || reach.length === 0) return null
  const foeSquares = Object.entries(state.board.tokens)
    .filter(([id]) => foes(state).some((m) => m.id === baseId(id) && !m.objective && m.hp > 0))
    .map(([, sq]) => sq)
  const grid = boardGrid(state.board)
  const fromHere = distances(grid, at)
  const nearer = (a, b) => (fromHere.get(a) ?? 99) - (fromHere.get(b) ?? 99)

  // A friend stuck in the Cage: the nearest computer hero goes to let them out.
  const rescue = toStuckFriend(state, hero)
  if (rescue) return rescue
  // The goals are done: head for the way out, monsters or not (getting out wins the game).
  const out = exitGoal(state, hero)
  if (out) return out.here ? null : walkToward(state, hero, out.squares, `${hero.name} heads for the ${out.name}.`)
  // A trap hurting the party: the best one at it goes to disable it.
  const trap = toTrap(state, hero)
  if (trap) return trap

  // Monsters the hero can't walk to (behind a wall, a closed door or a Cave In) don't hold
  // it up: with none it can reach, it explores instead of waiting for them for ever.
  const reachableFoes = foeSquares.filter((sq) => fromHere.has(key(sq)))
  if (reachableFoes.length > 0 || (foeSquares.length > 0 && attackOptions(state, hero).length > 0)) {
    // Already attacked: stay where it is rather than walk away from the fight.
    if (attackGone(state, hero)) return null
    if (attackOptions(state, hero).length > 0) return null
    let best = null
    for (const k of reach) {
      const moved = withHeroAt(state, hero, parse(k))
      const option = attackOptions(moved, moved.heroes.find((h) => h.id === hero.id))[0]
      // An archer (a ranged best attack) would rather not stand next to a monster to shoot.
      const score = option ? option.score - (option.ranged && adjacentFoes(moved, hero) > 0 ? 0.3 : 0) : 0
      if (option && (!best || score > best.score || (score === best.score && nearer(k, best.k) < 0))) best = { k, score, option }
    }
    if (best) return { to: parse(best.k), say: `${hero.name} moves in to attack.` }
    // The monster nearest the party, not one off on its own somewhere.
    const foe = groupedGoal(state, hero, reachableFoes.map((sq) => [sq]))
    return walkToward(state, hero, foe ?? reachableFoes, `${hero.name} heads toward the monsters.`)
  }

  // No monsters it can reach: pick up a Treasure token lying about, then explore. A hero on an edge
  // already stays to draw the tile.
  const loot = looseTreasure(state)
  if (loot.length > 0 && !treasureInReach(state, hero)) {
    const walk = walkToward(state, hero, loot, `${hero.name} goes for the Treasure token.`)
    if (walk) return walk
  }
  // Explore where the party is: the unexplored edge that's close to this hero and to the
  // others. A hero already on an edge draws there, unless it has wandered off on its own.
  const stray = strayDistance(state, hero) > STRAY_STEPS
  if (heroEdges(state).length > 0 && !stray) return null
  // Closed Doors: the one the adventure waits for (or with a chamber behind it) comes before
  // exploring; any other once there's no edge left to walk to.
  const doors = doorGoals(state, hero)
  const toDoor = (list) => {
    const squares = list.flatMap((g) => g.squares)
    if (squares.some((sq) => key(sq) === key(at))) return null
    return walkToward(state, hero, groupedGoal(state, hero, list.map((g) => g.squares)) ?? squares, `${hero.name} heads for the door.`)
  }
  const keyDoors = doors.filter((g) => goalDoor(g.door))
  if (keyDoors.length > 0) return toDoor(keyDoors)
  // Edges it can walk to: one behind a closed door or a wall doesn't count.
  const edges = unexploredEdges(grid).filter((e) => e.squares.some((sq) => fromHere.has(key(sq))))
  if (edges.length === 0 && doors.length > 0) return toDoor(doors)
  if (edges.length === 0) return stray ? walkToward(state, hero, partySquares(state, hero), `${hero.name} goes back to the others.`) : null
  const goal = groupedGoal(state, hero, edges.map((e) => e.squares))
  const onEdge = new Set(goal.map(key))
  if (onEdge.has(key(at))) return null
  const landing = reach.filter((k) => onEdge.has(k)).sort(nearer)[0]
  if (landing) return { to: parse(landing), say: stray ? `${hero.name} goes back to the others to explore.` : `${hero.name} goes to explore.` }
  return walkToward(state, hero, goal, stray ? `${hero.name} goes back to the others.` : `${hero.name} heads for the unexplored edge.`)
}

// A hero with no token (back from a Time Leap, which lets the player put them on any tile)
// goes on the free square nearest another hero still on the board, or on the Start tile
// when nobody is. Null when the hero is on the board, escaped or still leapt.
export function returnToBoard(state, hero) {
  if (!state.board || state.board.tokens[hero.id] || hero.escaped || timeLeapt(hero)) return null
  const grid = boardGrid(state.board)
  const others = state.heroes.filter((h) => h.id !== hero.id && state.board.tokens[h.id])
  const anchor = state.board.tokens[(others.find((h) => h.hp > 0) ?? others[0])?.id] ?? firstFloor(grid)
  if (!anchor) return null
  const { taken } = occupied(state, hero.id)
  const spot = [...distances(grid, anchor)].sort((a, b) => a[1] - b[1]).map(([k]) => k).find((k) => !taken.has(k) && grid.get(k)?.floor)
  if (!spot) return null
  const near = others.length > 0 ? ` next to ${others.find((h) => state.board.tokens[h.id] === anchor)?.name ?? 'the party'}` : ''
  return { action: { type: 'MOVE_TOKEN', id: hero.id, to: parse(spot) }, say: `${hero.name} is back on the board${near}.` }
}

// The first floor square on the board (the Start tile, placed first).
function firstFloor(grid) {
  const found = [...grid.entries()].find(([, sq]) => sq.floor)
  return found ? parse(found[0]) : null
}

// The power card a hero who just levelled up takes for the new slot: the first one of the
// right kind it doesn't have yet, from the cards the screens loaded.
function levelUpPick(hero, powerCards = []) {
  const slot = hero.powers.find((p) => !p.card)
  if (!slot) return null
  const have = new Set(hero.powers.map((p) => p.card?.id).filter(Boolean))
  const card = powerCards.find((c) => c.hero === hero.key && c.type === slot.type && !have.has(c.id))
  return card ? { slot, card } : null
}

// Nature's Healing (a fan Druid), at the very start of the Hero Phase: the whole phase for 2 HP
// when there's no monster about and the hero is already on an unexplored edge (it still
// explores) and down 2 or more; the attack for 1 HP when the hero is hurt and no monster is in
// reach, even after a move.
function naturesHealingStep(state, hero) {
  if (!naturesHealingOk(state, hero) || hero.hp >= hero.maxHp || !state.board.tokens[hero.id]) return null
  const quiet = foesOnBoard(state).length === 0
  if (quiet && heroEdges(state).length > 0 && hero.maxHp - hero.hp >= 2) {
    return { action: { type: 'NATURES_HEALING', heroId: hero.id, give: 'phase' }, say: `${hero.name} rests for Nature's Healing (+2 HP).` }
  }
  if (attackOptions(state, hero).length > 0) return null
  const reach = quiet ? [] : heroReach(state, hero)
  if (reach.some((k) => attackOptions(withHeroAt(state, hero, parse(k)), hero).length > 0)) return null
  if (quiet && heroEdges(state).length === 0) return null
  return { action: { type: 'NATURES_HEALING', heroId: hero.id, give: 'attack' }, say: `${hero.name} gives up the attack for Nature's Healing (+1 HP).` }
}

// Wolf Form (a fan Druid): at the start of the Hero Phase, when the hero is above half HP and
// a monster is next to them.
function wolfStep(state, hero) {
  if (!canBecomeWolf(state, hero) || state.turn.boardMoves > 0 || state.turn.lastAttack) return null
  if (hero.hp <= Math.ceil(hero.maxHp / 2) || adjacentFoes(state, hero) === 0) return null
  return { action: { type: 'WOLF_FORM', heroId: hero.id, on: true }, say: `${hero.name} becomes the Ancient Wolf!` }
}

// The ally's next tap, or null to tap through the turn screen.
export function allyStep(state, { powers = [], roll = d20, cards = {} } = {}) {
  const hero = activeAlly(state)
  if (!hero || !state.board) return null
  const phase = PHASES[state.turn.phase]?.key
  if (state.turn.startDamageDue && state.surges > 0) return { action: { type: 'USE_SURGE', heroId: hero.id }, say: `${hero.name} uses a healing surge.` }
  // Back from a Time Leap (or otherwise off the board): put the hero back before anything else.
  const back = returnToBoard(state, hero)
  if (back) return back
  // The new power after levelling up (any phase: it's picked when the hero levels).
  const pick = levelUpPick(hero, powers)
  if (pick) return { action: { type: 'SET_POWER_CARD', heroId: hero.id, powerId: pick.slot.id, card: pick.card }, say: `${hero.name} learns ${pick.card.name}.` }
  // A Flaming Sphere, Blade Barrier or Wizard Eye just cast: put its tokens on the board.
  const token = placeHandToken(state, hero)
  if (token) return token

  const after = followUp(state, hero) ?? pendingMove(state, hero)
  if (after) return after
  // A moving trap or the lava with more than one way to go: the first tile the board lights.
  const trapPick = state.turn.trapPick
  if (trapPick?.tiles?.length > 0) return { action: { type: 'TRAP_STEP', trapId: trapPick.trapId, tile: trapPick.tiles[0] }, say: 'The trap moves on.' }
  // An encounter card just drawn: cancel it with spare XP when it's a nasty one.
  const cancel = cancelEncounter(state, hero)
  if (cancel) return cancel
  if (phase === 'hero') {
    // A move waiting for someone else, or someone's extra attack: those come first.
    if (state.turn.boardMove || (state.turn.bonusAttacks ?? []).length > 0) return null
    if (hero.level === 1 && state.turn.natural20 === hero.id && state.xp >= XP_TO_LEVEL_UP) {
      return { action: { type: 'LEVEL_UP', heroId: hero.id }, say: `Natural 20! ${hero.name} levels up.` }
    }
    // Nature's Healing and Wolf Form come before anything else in the Hero Phase.
    const start = naturesHealingStep(state, hero) ?? wolfStep(state, hero)
    if (start) return start
    const care = improvise(state, hero) ?? supportItem(state, hero) ?? supportPower(state, hero) ?? buffPower(state, hero) ?? chorusStep(state, hero) ?? giftsStep(state, hero) ?? rescueStride(state, hero) ?? circleStep(state, hero) ?? seekersPower(state, hero)
    if (care) return care
    const walk = healWalk(state, hero)
    if (walk) return walk
    // A Treasure token on or next to the hero: pick it up (nothing else waiting to be handed out).
    const loot = treasureInReach(state, hero)
    if (loot && !state.treasure && !state.turn.treasureOwed && !state.turn.tokenOwed) {
      return { action: { type: 'PICK_UP_TREASURE', id: loot.id, heroId: hero.id }, say: `${hero.name} picks up the Treasure token.` }
    }
    const free = freeItemAttack(state, hero, roll)
    if (free) return free
    // A friend stuck in the Cage: get onto their tile first if this move does it, then roll.
    const rescue = attackGone(state, hero) ? null : toStuckFriend(state, hero, { arriving: true })
    if (rescue) return { action: { type: 'MOVE_HERO', heroId: hero.id, to: rescue.to }, say: rescue.say }
    const unlock = freeFromCurse(state, hero, roll)
    if (unlock) return unlock
    const disable = fleetfooted(state, hero) ?? trappingAttack(state, hero) ?? disableTrap(state, hero, roll)
    if (disable) return disable
    // Hypnotism's monster was moved: now it attacks the monster it ended up next to.
    const thrall = hypnotismAttack(state, hero, roll)
    if (thrall) return thrall
    // A power's move came first (Charge, a swap, a pull): its own attack follows.
    const committed = state.turn.beforeMoved && !state.turn.boardMove ? attackOptions(state, hero, { all: true }).find((o) => o.power.id === state.turn.beforeMoved) : null
    if (committed) return { action: attackAction(state, hero, committed, roll), say: committed.say }
    const options = attackOptions(state, hero)
    // Benign Transposition or King's Castle to take a hurt friend's place next to a monster.
    const swap = attackGone(state, hero) ? null : rescueSwap(state, hero)
    if (swap && (!options[0] || swap.score > options[0].score)) return { action: startMove(hero, swap.power).action, say: `${hero.name} uses ${swap.power.name} to take ${heroById(state, swap.swapWith)?.name}'s place!` }
    // A daily that does more than an attack would (Flaming Sphere, Blade Barrier, Cause Fear).
    const daily = attackGone(state, hero) ? null : castDaily(state, hero, options, (h) => attackOptions(state, h, { atWill: true }).length > 0)
    if (daily) return daily
    const option = options[0]
    // Lizard & Lace, once there's a monster about.
    const pets = attackGone(state, hero) ? null : summonStep(state, hero, option)
    if (pets) return pets
    // Hypnotism, when walking one monster over to hit another beats the best attack.
    const hypnosis = attackGone(state, hero) ? null : hypnotismPlan(state, hero)
    if (hypnosis && (!option || hypnosis.score > option.score)) return startMove(hero, hypnosis.power)
    // Heavy Hitter, Power of Earth or Shadowmerge first, when the attack matters and could miss.
    const boost = boostPower(state, hero, option) ?? shadowmerge(state, hero, option)
    if (boost) return boost
    // Shadowphage: a hurt hero slips into the shadows instead of a so-so attack.
    const shade = option ? shadowStep(state, hero, option) : null
    if (shade) return shade
    // A daily that walks first (Whirling Mantis Step, Comet Strike) when it reaches more.
    const sweep = attackGone(state, hero) ? null : sweepAttack(state, hero, option)
    if (sweep) return sweep
    // Sacred Flame heals someone on the hero's tile: with both actions left, step onto a hurt
    // friend's tile first when the monster is still in reach from there.
    const healer = healerMove(state, hero, option)
    if (healer) return healer
    if (option) return { action: attackAction(state, hero, option, roll), say: option.say }
    // Nothing in reach: Charge, Into the Fray or Taunting Advance moves first, then attacks.
    const charge = attackGone(state, hero) ? null : moveFirst(state, hero)
    if (charge) return charge
    // Nothing to fight and no edge in reach: the Wizard Eye explores from farther away.
    const eye = exitGoal(state, hero) || looseTreasure(state).length > 0 ? null : wizardEyeStep(state, hero)
    if (eye) return eye
    // Next to a Closed Door, with nothing to attack: open it, or roll to unlock it.
    const door = doorStep(state, hero, { cards, roll })
    if (door) return door
    const move = bestMove(state, hero)
    if (move) return { action: { type: 'MOVE_HERO', heroId: hero.id, to: move.to }, say: move.say }
    // The end of the Hero Phase: the Flaming Sphere burns, a hurt hero hides, and Command or
    // Distant Diversion sends a monster away from a hurt friend.
    return sphereStep(state, hero) ?? guardPower(state, hero) ?? perchPower(state, hero) ?? divertPower(state, hero) ?? shadowStep(state, hero, null) ?? fearlessStep(state, hero)
  }
  // Lizard & Lace: the hero's allies take their turn first in the Villain Phase.
  if (phase === 'villain' && petsDue(state, hero)) {
    return { action: { type: 'PETS_ACT', heroId: hero.id, rolls: petsOf(state, hero.id).map(() => roll()) }, say: `${hero.name}'s allies take their turn.` }
  }
  if (phase === 'exploration' && state.turn.explored !== true && state.turn.explored !== false && heroEdges(state).length === 0) {
    return { action: { type: 'SET_EXPLORED', explored: false, rolls: [roll(), roll()] }, say: `${hero.name} isn't on an unexplored edge.` }
  }
  return null
}

// Which open screen plays the allies: the projector, else the table screen, else the first
// hero iPad by seat. Every screen works it out from the same list, so only one does it.
export function allyHostSeat(seats = []) {
  if (seats.includes('projector')) return 'projector'
  if (seats.includes('table')) return 'table'
  return [...seats].sort()[0] ?? null
}
