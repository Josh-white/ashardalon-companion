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
import { distances } from '../board/paths.js'
import { boardGrid, heroEdges, heroReach, movesLeft, stayedOnBoard } from '../board/play.js'
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
import { heroItems } from '../data/items.js'
import { treasureInReach } from '../board/items.js'
import { escapeBlockers } from '../state/adventure.js'
import { escapeGoal, escapeHold, exitName, exitSquares } from '../board/exits.js'

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
export function simpleAttack(power) {
  if (!power || power.used || !power.card || powerNumber(power.card.attack) === null) return false
  const e = effectsOf(power)
  if (e.before || e.board?.before || e.ask || e.use || e.reaction || e.after === 'pass-monster') return false
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
    const range = powerRange(power.card.text) ?? 'adjacent'
    const inReach = foesInRange(state, hero.id, range, all)
    if (inReach.length === 0) continue
    const bonus = powerNumber(power.card.attack)
    const damage = powerNumber(power.card.damage) ?? 1
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
  // Dailies are saved for a villain, or a monster no at-will power could finish off.
  const atWillFinishes = new Set(options.filter((o) => o.power.type !== 'daily').flatMap((o) => o.finishes))
  return options
    .filter((o) => o.power.type !== 'daily' || o.villain || o.finishes.some((id) => !atWillFinishes.has(id)))
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

  // The goals are done: head for the way out, monsters or not (getting out wins the game).
  const out = exitGoal(state, hero)
  if (out) return out.here ? null : walkToward(state, hero, out.squares, `${hero.name} heads for the ${out.name}.`)

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
    const steps = stepsToGoals(state, foeSquares)
    const here = steps.get(key(at)) ?? 99
    const target = [...reach].sort((a, b) => (steps.get(a) ?? 99) - (steps.get(b) ?? 99) || nearer(a, b))[0]
    if (target && (steps.get(target) ?? 99) < here) return { to: parse(target), say: `${hero.name} heads toward the monsters.` }
    return null
  }

  // No monsters: pick up a Treasure token lying about, then explore. A hero on an edge
  // already stays to draw the tile.
  const loot = looseTreasure(state)
  if (loot.length > 0 && !treasureInReach(state, hero)) {
    const walk = walkToward(state, hero, loot, `${hero.name} goes for the Treasure token.`)
    if (walk) return walk
  }
  if (heroEdges(state).length > 0) return null
  const edgeSquares = unexploredEdges(grid).flatMap((e) => e.squares)
  if (edgeSquares.length === 0) return null
  const onEdge = new Set(edgeSquares.map(key))
  const landing = reach.filter((k) => onEdge.has(k)).sort(nearer)[0]
  if (landing) return { to: parse(landing), say: `${hero.name} goes to explore.` }
  const steps = stepsToGoals(state, edgeSquares)
  const here = steps.get(key(at)) ?? 99
  const target = [...reach].sort((a, b) => (steps.get(a) ?? 99) - (steps.get(b) ?? 99) || nearer(a, b))[0]
  if (target && (steps.get(target) ?? 99) < here) return { to: parse(target), say: `${hero.name} heads for the unexplored edge.` }
  return null
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
