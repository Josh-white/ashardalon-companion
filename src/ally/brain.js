// The computer ally's brain: what a hero played by the computer does next on the virtual
// board. A plain function of the game state, so it can be tested without any screens.
//
// It makes the choices a player makes in the Hero Phase (spend a surge, attack, move, pick
// the extra power after levelling up) and answers "no tile" in the Exploration Phase when
// the hero isn't on an edge. Everything else (drawing the tile, the encounter card, every
// monster's turn, treasure) is a tap through the turn screen, where the board already
// answers the questions; AllyPanel.jsx taps those buttons. Returns
//   { action, say }  a tap to send, and what the ally is doing, in words
//   null             nothing for the brain to decide: tap the turn screen's next button

import { baseId, key, unexploredEdges } from '../board/grid.js'
import { adjacent, distances } from '../board/paths.js'
import { boardGrid, caged, heroEdges, heroReach, movesLeft, occupied, stayedOnBoard, timeLeapt } from '../board/play.js'
import { foeDistance, foesInRange, powerRange } from '../board/monsters.js'
import { heroesInReach } from '../board/encounters.js'
import { moveChoices, moveTargets } from '../board/powerMoves.js'
import { distanceChoices } from '../data/items.js'
import { effectsOf, maxRolls } from '../data/powerEffects.js'
import { PHASES } from '../data/phases.js'
import { powerNumber } from '../state/combat.js'
import { foes } from '../state/gameHelpers.js'
import { attackGone } from '../state/heroTurn.js'
import { XP_TO_LEVEL_UP } from '../data/heroes.js'
import { attackItems, heroItems, itemTrapBonus } from '../data/items.js'
import { boardMarkers, trapsToDisable } from '../board/markers.js'
import { treasureInReach } from '../board/items.js'
import { escapeBlockers } from '../state/adventure.js'
import { escapeGoal, escapeHold, exitName, exitSquares } from '../board/exits.js'
import { trapDisable } from '../state/encounterRules.js'

// A d20 the way the screens roll one; tests pass their own.
const d20 = () => Math.floor(Math.random() * 20) + 1

// The hero whose turn it is, when the computer plays them.
export function activeAlly(state) {
  const hero = state?.status === 'playing' ? state.heroes[state.turn.heroIndex] : null
  return hero?.ally ? hero : null
}

// Attack powers the ally knows how to use on its own: a roll at one or more monsters, with
// healing or a shield to hand out afterwards (followUp) or a move it may skip after it.
// Powers that move figures first, ask a question first, or pass a monster on are left to
// the players (the ally uses its other powers instead).
const pullsFirst = (power) => {
  const steps = effectsOf(power).board?.before ?? []
  return steps.length > 0 && steps.every((m) => /^monster/.test(m.pick) && m.to === 'nextToSelf')
}

export function simpleAttack(power) {
  if (!power || power.used || !power.card || powerNumber(power.card.attack) === null) return false
  const e = effectsOf(power)
  // Holy Strike's and Valiant Strike's questions the board answers (askAnswers).
  const asks = !e.ask || ['started-adjacent', 'adjacent-count'].includes(e.ask)
  // Divine Challenge pulls a monster next to the hero first; with one there already, it's a
  // plain attack on that one (the pull is optional, pullsFirst below).
  if ((e.before && !pullsFirst(power)) || !asks || e.use || e.reaction || e.after === 'pass-monster') return false
  return true
}

const heroById = (state, id) => state.heroes.find((h) => h.id === id)
const hurt = (h) => h.maxHp - h.hp

// The question an attack power asks afterwards (Sacred Flame's healing, Cleric's Shield,
// Righteous Smite): the most hurt hero on the ally's tile gets it.
function followUp(state, hero) {
  const last = state.turn.lastAttack
  if (!last || last.heroId !== hero.id || last.followUpDone) return null
  const power = hero.powers.find((p) => p.id === last.powerId)
  if (!power) return null
  const effects = effectsOf(power)
  const kind = effects.onHit?.heal && last.rolls.some((r) => r.hit) ? 'heal-one' : effects.after
  if (!['heal-one', 'heal-tile', 'shield'].includes(kind)) return null
  const onTile = (heroesInReach(state, hero.id, 'sameTile') ?? [hero.id]).map((id) => heroById(state, id)).filter((h) => h && h.hp > 0)
  const neediest = [...onTile].sort((a, b) => hurt(b) - hurt(a) || a.hp - b.hp)[0] ?? hero
  const heroIds = kind === 'heal-tile' ? onTile.map((h) => h.id) : [kind === 'shield' ? [...onTile].sort((a, b) => a.hp - b.hp)[0]?.id ?? hero.id : neediest.id]
  const who = heroIds.length === 1 ? (heroIds[0] === hero.id ? 'itself' : heroById(state, heroIds[0])?.name) : 'everyone on the tile'
  return {
    action: { type: 'ATTACK_FOLLOW_UP', heroId: hero.id, powerId: power.id, heroIds },
    say: `${hero.name}'s ${power.name} ${kind === 'shield' ? 'shields' : 'heals'} ${who}.`,
  }
}

// A move waiting on the board for one of the ally's figures: a power's own move afterwards
// (Righteous Advance, Distracting Jab) is skipped; a move a monster's hit forces on the ally
// goes to the first square the board allows.
function pendingMove(state, hero) {
  const move = state.turn.boardMove
  if (!move || move.heroId !== hero.id) return null
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
function adjacentFoes(state, hero) {
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

// Hit points the monster's next figure has left (a group card loses one figure at a time).
function figureHp(monster) {
  const per = monster.card?.figures > 1 && !monster.villain ? monster.card.hp : monster.maxHp
  if (!per) return monster.hp
  return monster.hp - per * (Math.ceil(monster.hp / per) - 1)
}

const onBoard = (state, foe) => Object.keys(state.board.tokens).some((id) => baseId(id) === foe.id)

// Every attack the hero could make from where they stand: [{ power, targets, score, say }].
export function attackOptions(state, hero, { atWill = false } = {}) {
  if (!state.board || attackGone(state, hero) || !state.board.tokens[hero.id]) return []
  const all = foes(state).filter((m) => m.ac && m.hp > 0 && onBoard(state, m))
  if (all.length === 0) return []
  const options = []
  for (const power of hero.powers.filter((p) => simpleAttack(p) && (!atWill || p.type === 'at-will'))) {
    const effects = effectsOf(power)
    // A card that doesn't say how far it reaches is used on a monster next to the hero.
    const range = pullsFirst(power) ? 'adjacent' : powerRange(power.card.text) ?? 'adjacent'
    const inReach = foesInRange(state, hero.id, range, all)
    if (inReach.length === 0) continue
    const answers = askAnswers(state, hero, power)
    const bonus = powerNumber(power.card.attack) + (answers.adjacentCount ?? 0)
    const damage = (powerNumber(power.card.damage) ?? 1) + (answers.startedAdjacent ? 1 : 0)
    const chance = (m) => Math.min(0.95, Math.max(0.05, (21 - (m.ac - bonus)) / 20))
    const kills = (m) => damage >= figureHp(m)
    // Finish off what it can, then the weakest, villains first among equals.
    const order = [...inReach].sort((a, b) => Number(kills(b)) - Number(kills(a)) || Number(Boolean(b.villain)) - Number(Boolean(a.villain)) || figureHp(a) - figureHp(b))
    const limit = maxRolls(power)
    let picked
    if (effects.sameTarget) picked = Array(limit).fill(order[0].id)
    else if (effects.attacks) picked = Array.from({ length: limit }, (_, i) => order[i % order.length].id)
    else picked = order.slice(0, Number.isFinite(limit) ? limit : order.length).map((m) => m.id)
    const hit = picked.map((id) => order.find((m) => m.id === id))
    const score = hit.reduce((sum, m) => sum + chance(m) * (damage + (kills(m) ? 4 : 0) + (m.villain ? 2 : 0)), 0)
    const names = [...new Set(hit.map((m) => m.name))].join(' and the ')
    options.push({ power, targets: picked, score, finishes: hit.filter(kills).map((m) => m.id), villain: hit.some((m) => m.villain), say: `${hero.name} attacks the ${names} with ${power.name}.` })
  }
  // Dailies are saved for a villain, or a monster no at-will power could finish off. With no
  // at-will that can reach anything, the daily is better than doing nothing.
  const atWills = options.filter((o) => o.power.type !== 'daily')
  const atWillFinishes = new Set(atWills.flatMap((o) => o.finishes))
  return options
    .filter((o) => o.power.type !== 'daily' || atWills.length === 0 || o.villain || o.finishes.some((id) => !atWillFinishes.has(id)))
    .sort((a, b) => b.score - a.score)
}

function attackAction(state, hero, option, roll) {
  const choices = distanceChoices(hero)
  const dist = Object.fromEntries(
    [...new Set(option.targets)]
      .map((id) => [id, foeDistance(state, hero.id, id)])
      .filter(([, d]) => d)
      .map(([id, d]) => [id, choices && !choices.includes(d) ? 'far' : d]),
  )
  return {
    type: 'HERO_ATTACK',
    heroId: hero.id,
    powerId: option.power.id,
    targets: option.targets.map((monsterId) => ({ monsterId, roll: roll() })),
    bonusAttack: false,
    distances: dist,
    stayed: stayedOnBoard(state, hero) ?? false,
    ...askAnswers(state, hero, option.power),
  }
}

const withHeroAt = (state, hero, at) => ({ ...state, board: { ...state.board, tokens: { ...state.board.tokens, [hero.id]: at } } })
const parse = (k) => k.split(',').map(Number)

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
const neediest = (list) => [...list].sort((a, b) => hurt(b) - hurt(a) || a.hp - b.hp)[0] ?? null
const foesOnBoard = (state) => foes(state).filter((m) => !m.objective && m.hp > 0 && onBoard(state, m))
// Conditions a power or item can end (not curses).
const ENDABLE = ['Dazed', 'Poisoned', 'Immobilized', 'Slowed', 'Weakened']
const endable = (h) => (h.conditions ?? []).find((c) => ENDABLE.includes(c)) ?? null

// A utility power the ally knows: one that heals (Healing Hymn, Lay On Hands, Dwarven
// Resilience), ends a condition (Virtue's Touch) or puts Mirror Image up when monsters are
// around. Used only when it does some good. Powers that place things on the board stay
// with the players.
export function supportPower(state, hero) {
  for (const power of hero.powers.filter((p) => !p.used && p.card)) {
    const use = effectsOf(power).use
    if (!use || use.board || use.causeFear || use.refuge || use.invisible || use.ask) continue
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
    const selfGood = use.healSelf && hurt(hero) >= use.healSelf
    const otherGood = use.heal && other && hurt(other) >= use.heal
    if (use.pick === 'other' && !use.optional && !use.healSelf ? !otherGood : !(selfGood || otherGood)) continue
    const heroIds = use.pick && other && (otherGood || !use.optional) ? [other.id] : []
    const who = [use.healSelf && hero.name, heroIds[0] && other.name].filter(Boolean).join(' and ')
    return { action: { type: 'USE_POWER', heroId: hero.id, powerId: power.id, heroIds }, say: `${hero.name} uses ${power.name} to heal ${who}.` }
  }
  return null
}

// A healing potion or a cure among the ally's items, for itself or a hero next to it who
// needs it: healing once a hero is down to 2 HP or less, a cure for a condition.
export function supportItem(state, hero) {
  for (const item of heroItems(hero).filter((i) => !i.used && i.card)) {
    const card = item.card
    const close = nearby(state, hero, 'adjacent')
    if (card.use === 'heal') {
      const who = neediest(close.filter((h) => h.hp <= 2 && hurt(h) > 0))
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

  if (foeSquares.length > 0) {
    // Already attacked: stay where it is rather than walk away from the fight.
    if (attackGone(state, hero)) return null
    if (attackOptions(state, hero).length > 0) return null
    let best = null
    for (const k of reach) {
      const moved = withHeroAt(state, hero, parse(k))
      const option = attackOptions(moved, moved.heroes.find((h) => h.id === hero.id))[0]
      if (option && (!best || option.score > best.score || (option.score === best.score && nearer(k, best.k) < 0))) best = { k, score: option.score, option }
    }
    if (best) return { to: parse(best.k), say: `${hero.name} moves in to attack.` }
    // The monster nearest the party, not one off on its own somewhere.
    const foe = groupedGoal(state, hero, foeSquares.map((sq) => [sq]))
    return walkToward(state, hero, foe ?? foeSquares, `${hero.name} heads toward the monsters.`)
  }

  // No monsters: pick up a Treasure token lying about, then explore. A hero on an edge
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
  const edges = unexploredEdges(grid)
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

// The ally's next tap, or null to tap through the turn screen.
export function allyStep(state, { powers = [], roll = d20 } = {}) {
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

  const after = followUp(state, hero) ?? pendingMove(state, hero)
  if (after) return after
  // A moving trap or the lava with more than one way to go: the first tile the board lights.
  const trapPick = state.turn.trapPick
  if (trapPick?.tiles?.length > 0) return { action: { type: 'TRAP_STEP', trapId: trapPick.trapId, tile: trapPick.tiles[0] }, say: 'The trap moves on.' }
  if (phase === 'hero') {
    // A move waiting for someone else, or someone's extra attack: those come first.
    if (state.turn.boardMove || (state.turn.bonusAttacks ?? []).length > 0) return null
    if (hero.level === 1 && state.turn.natural20 === hero.id && state.xp >= XP_TO_LEVEL_UP) {
      return { action: { type: 'LEVEL_UP', heroId: hero.id }, say: `Natural 20! ${hero.name} levels up.` }
    }
    const care = supportItem(state, hero) ?? supportPower(state, hero)
    if (care) return care
    // A Treasure token on or next to the hero: pick it up (nothing else waiting to be handed out).
    const token = treasureInReach(state, hero)
    if (token && !state.treasure && !state.turn.treasureOwed && !state.turn.tokenOwed) {
      return { action: { type: 'PICK_UP_TREASURE', id: token.id, heroId: hero.id }, say: `${hero.name} picks up the Treasure token.` }
    }
    const free = freeItemAttack(state, hero, roll)
    if (free) return free
    // A friend stuck in the Cage: get onto their tile first if this move does it, then roll.
    const rescue = attackGone(state, hero) ? null : toStuckFriend(state, hero, { arriving: true })
    if (rescue) return { action: { type: 'MOVE_HERO', heroId: hero.id, to: rescue.to }, say: rescue.say }
    const unlock = freeFromCurse(state, hero, roll)
    if (unlock) return unlock
    const disable = disableTrap(state, hero, roll)
    if (disable) return disable
    const option = attackOptions(state, hero)[0]
    if (option) return { action: attackAction(state, hero, option, roll), say: option.say }
    const move = bestMove(state, hero)
    if (move) return { action: { type: 'MOVE_HERO', heroId: hero.id, to: move.to }, say: move.say }
    return null
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
