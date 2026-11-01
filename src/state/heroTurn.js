// The flow of a hero's turn: curses, the checks each phase asks about, starting and
// ending the Hero Phase, whether the hero still has an attack, levelling up, items and
// the Scroll of Monster Control. The reducer is in game.js.
import { addedSlot, templateFor } from '../data/heroes.js'
import { PHASES } from '../data/phases.js'
import { difficultyOf } from '../data/difficulty.js'
import { heroItems } from '../data/items.js'
import { aliveVillagers, objectiveInPlay } from './adventure.js'
import { placeToken } from '../board/play.js'
import { boardAnswer } from '../board/checks.js'
import { wrathPull } from '../board/monsters.js'
import { queueMoves, queueWandOfFear } from '../board/powerMoves.js'
import { addCarpet } from '../board/items.js'
import { activeVillains, buildDeck, findFoe, heroLabel, lose, updateHero, validRoll, withLog, withMoment } from './gameHelpers.js'
import { discardMonsterCard, drawMonster } from './monsterDeck.js'
import { discardEncounterCard } from './encounterDeck.js'
import { spendItem } from './treasureDeck.js'
import { nextLevel } from './heroSetup.js'
import { besideGate, damageHeroes, defeatDetails, healHero, hurtMonster, poisonBonus, rollAgainst } from './combat.js'

// Invisibility lasts until the wizard's next turn, and a hero in the Astral Refuge comes
// back onto the board then.
function returnFromPowers(state, hero) {
  const tokens = hero?.tokens ?? {}
  if (!tokens.invisible && !tokens.refuge) return state
  let next = updateHero(state, hero.id, (h) => ({ tokens: { ...h.tokens, invisible: false, refuge: false } }))
  if (tokens.invisible) next = withLog(next, `${hero.name} is visible again.`)
  if (!tokens.refuge) return next
  return withMoment(withLog(next, `${hero.name} is back from the Astral Refuge.`), {
    kind: 'roll',
    heroId: hero.id,
    title: `${hero.name} returns!`,
    detail: `Put ${hero.name} on any tile.`,
  })
}

const curseTotal = (hero, field) => (hero.curses ?? []).reduce((sum, curse) => sum + (curse.card?.[field] ?? 0), 0)

export const removeCurse = (state, heroId, curseId, text) => {
  const hero = state.heroes.find((h) => h.id === heroId)
  const curse = hero?.curses?.find((c) => c.id === curseId)
  if (!curse) return state
  const next = updateHero(state, heroId, (h) => ({ curses: h.curses.filter((c) => c.id !== curseId) }))
  return withLog(discardEncounterCard(next, curse.cardId), text)
}

// The end of the Hero Phase, with villagers in play and no villager roll yet.
export const villagerRollDue = (state) => PHASES[state.turn.phase]?.key === 'hero' && !state.turn.villagerRoll && aliveVillagers(state).length > 0

// Which checks a phase shows. The Villain Phase has none, so a card drawn there waits
// for the next turn's Exploration Phase.
export const checksFor = (phaseKey) => (phaseKey === 'hero' || phaseKey === 'exploration' ? phaseKey : null)

// The questions a phase ends with, from the active hero's curses, the environment, and
// hazards on the board. Each has a key so it's asked once per turn, on every device.
export function phaseChecks(state, phaseKey) {
  const hero = state.heroes[state.turn.heroIndex]
  if (!hero) return []
  const sources = [
    ...(hero.curses ?? []).map((curse) => ({ id: curse.id, name: curse.name, checks: curse.checks, curseId: curse.id })),
    ...(state.environment ? [{ id: `env-${state.environment.cardId}`, name: state.environment.name, checks: state.environment.card.checks }] : []),
    ...(state.traps ?? []).map((trap) => ({ id: trap.id, name: trap.name, checks: trap.card.checks })),
    // The adventure's own questions (the Vast Gate spitting out monsters), while their objective stands.
    ...(state.adventure ? [{ id: 'adventure', name: state.adventure.card.title, checks: (state.adventure.card.checks ?? []).filter((c) => !c.whileObjective || objectiveInPlay(state, c.whileObjective)) }] : []),
  ]
  const done = state.turn.checksDone ?? []
  return sources.flatMap((source) =>
    (source.checks ?? [])
      .map((check, i) => ({ ...check, key: `${source.id}-${i}`, source: source.name, curseId: source.curseId ?? null, heroId: hero.id }))
      .filter((check) => check.phase === phaseKey && !done.includes(check.key))
      .filter((check) => !boardSaysNothing(state, hero, check)),
  )
}

// A question the virtual board answers with an answer that does nothing (Volcanic Vapors
// when the hero never went near its tile, Walls of Magma away from a wall) isn't asked at
// all. Answers that do something still show, so the players can say the board is wrong.
function boardSaysNothing(state, hero, check) {
  if (!state.board || !check.ask) return false
  const board = boardAnswer(state, check.ask.replaceAll('{hero}', hero.name))
  if (!board) return false
  const effect = board.answer ? check.yes : check.no
  return !effect || Object.keys(effect).length === 0
}

// True when the game's copies of encounter cards are older than the card file, such as
// cards saved before the file gained its end-of-phase checks.
export function encounterCardsOutdated(state, cards = []) {
  const deck = state?.encounterDeck?.cards
  if (!deck) return false
  return cards.some((card) => deck[card.id] && JSON.stringify(deck[card.id]) !== JSON.stringify(card))
}

// Brings every saved copy of an encounter card up to date with the card file: the deck,
// the card being read out, the environment, markers on the board, and curses on heroes.
export function updateEncounterCards(state, cards) {
  const byId = Object.fromEntries((Array.isArray(cards) ? cards : []).map((c) => [c.id, c]))
  if (!encounterCardsOutdated(state, cards)) return state
  const fresh = (card) => byId[card?.id] ?? card
  return {
    ...state,
    encounterDeck: { ...state.encounterDeck, cards: Object.fromEntries(Object.entries(state.encounterDeck.cards).map(([id, c]) => [id, fresh(c)])) },
    encounter: state.encounter && { ...state.encounter, card: fresh(state.encounter.card) },
    environment: state.environment && { ...state.environment, card: fresh(state.environment.card) },
    traps: (state.traps ?? []).map((trap) => ({ ...trap, card: fresh(trap.card) })),
    heroes: state.heroes.map((hero) => ({
      ...hero,
      curses: (hero.curses ?? []).map((curse) =>
        byId[curse.cardId] ? { ...curse, card: byId[curse.cardId].curse ?? {}, checks: byId[curse.cardId].checks ?? [] } : curse,
      ),
    })),
  }
}

// The end-of-Exploration note of the Wrath of the Enemy curse.
export function isWrathCheck(state, check) {
  if (!state.board || check.ask) return false
  const hero = state.heroes.find((h) => h.id === check.heroId)
  return (hero?.curses ?? []).some((c) => c.id === check.curseId && c.cardId === 'wrath-of-the-enemy')
}

export function answerCheck(state, action) {
  const check = phaseChecks(state, checksFor(PHASES[state.turn.phase]?.key)).find((c) => c.key === action.key)
  if (!check) return state
  const hero = state.heroes.find((h) => h.id === check.heroId)
  let next = { ...state, turn: { ...state.turn, checksDone: [...(state.turn.checksDone ?? []), check.key] } }
  // Wrath of the Enemy on the virtual board: the board pulls the monster over itself.
  if (isWrathCheck(state, check)) {
    const pull = wrathPull(state, hero.id)
    if (pull) next = withLog(placeToken(next, pull.id, pull.to), `Wrath of the Enemy: the ${pull.name} was put next to ${hero.name}.`)
  }
  const effect = check.ask ? (action.answer ? check.yes : check.no) : null
  if (!effect) return next
  if (effect.damage) {
    const { next: hurt, downed } = damageHeroes(next, [hero.id], effect.damage, check.source)
    next = hurt
    next = withMoment(next, {
      kind: downed.length > 0 ? 'down' : 'monster',
      heroId: hero.id,
      title: downed.length > 0 ? `${hero.name} is down!` : `${check.source}: ${effect.damage} damage`,
      detail: downed.length > 0 ? 'Spend a healing surge to get back up.' : `${hero.name} takes ${effect.damage} damage.`,
    })
  }
  if (effect.condition && !hero.conditions.includes(effect.condition)) {
    next = withLog(updateHero(next, hero.id, (h) => ({ conditions: [...h.conditions, effect.condition] })), `${hero.name} is ${effect.condition} from ${check.source}.`)
  }
  if (effect.remove && check.curseId) next = removeCurse(next, hero.id, check.curseId, `${hero.name}'s ${check.source} curse is over.`)
  if (effect.drawMonster) {
    // Not the tile's monster, so the Exploration Phase's draw button stays as it was.
    const { monsterDrawn } = next.turn
    const withDeck = next.monsterDeck || !Array.isArray(action.cards) ? next : { ...next, monsterDeck: buildDeck(action.cards, action.random) }
    const before = next.monsters.length
    next = drawMonster(withDeck, hero.id, action.random)
    next = { ...next, turn: { ...next.turn, monsterDrawn } }
    next = besideGate(next, before)
  }
  return next
}

// What the phase still needs before the turn moves on, as short labels for the screen.
// `cards` says which virtual decks are in use (the table may draw from the real ones).
export function phaseTodo(state, cards = {}) {
  const { phase, explored, triangle, monsterDrawn, acted = [] } = state.turn
  const hero = state.heroes[state.turn.heroIndex]
  if (!hero) return []
  const todo = []
  if (state.turn.startDamageDue) todo.push(`${hero.name}'s healing surge`)
  const key = PHASES[phase]?.key
  if (key === 'exploration') {
    if (explored === undefined) todo.push('the unexplored edge question')
    else if (explored === true && cards.monsters && !monsterDrawn) todo.push('the new monster')
  }
  if (key === 'villain') {
    for (const villain of activeVillains(state)) if (!acted.includes(villain.id)) todo.push(`the ${villain.name}'s turn`)
    if (cards.encounters) {
      if (explored === true && triangle === undefined) todo.push('the black triangle question')
      else if (state.encounter || encounterCount(state, hero) > 0) todo.push('the encounter card')
    }
    for (const monster of state.monsters.filter((m) => m.ownerId === hero.id)) if (!acted.includes(monster.id)) todo.push(`the ${monster.name}'s turn`)
    for (const trap of (state.traps ?? []).filter((t) => t.ownerId === hero.id && t.type === 'trap')) if (!acted.includes(trap.id)) todo.push(`the ${trap.name}`)
  }
  return todo
}

// Encounter cards the Villain Phase still owes: one without a new tile (or with a black
// triangle), plus curses (Bad Luck), the adventure's extras and "draw another" cards.
export function encounterCount(state, hero) {
  const { explored, triangle, encountersDrawn = 0, encountersOwed = 0 } = state.turn
  // After the Elite Regiment is found (Assault on Firestorm Peak), every encounter card is two.
  const base = (explored !== true || triangle === true ? 1 : 0) * (state.adventure?.doubleEncounters ? 2 : 1)
  const badLuck = (hero.curses ?? []).reduce((sum, c) => sum + (c.card?.extraEncounter ?? 0), 0)
  // Some adventures add an encounter to every Villain Phase (Roghar's Gear, once the Vault is found).
  const adventure = state.adventure?.extraEncounters ?? 0
  return Math.max(0, base + badLuck + adventure + encountersOwed - encountersDrawn)
}

// Poison (and Bloodlust) hurt at the start of the hero's turn, and a hero lost in a Time
// Leap comes back.
export function startTurn(state) {
  const hero = state.heroes[state.turn.heroIndex]
  state = returnFromPowers(state, hero)
  for (const curse of (hero?.curses ?? []).filter((c) => c.card?.removeAtTurnStart)) {
    // On the virtual board the hero waits under "Not on the board yet" for a tap.
    const put = state.board ? `Tap ${hero.name} under "Not on the board yet", then any square.` : `Put ${hero.name} on any tile.`
    state = removeCurse(state, hero.id, curse.id, `${hero.name} is back from the ${curse.name}. ${put}`)
    state = withMoment(state, { kind: 'encounter', heroId: hero.id, title: `${hero.name} is back!`, detail: `${curse.name} is over. ${put}` })
  }
  if (!hero) return state
  // A hero who starts the turn at 0 HP spends a healing surge first (USE_SURGE). The surge
  // clears conditions and curses (JJ's house rule), so no poison or curse damage follows.
  if (hero.hp === 0 && state.surges <= 0) {
    return lose(state, `${hero.name} is down at the start of the turn with no healing surges left.`)
  }
  state = storyTurnStart(state)
  if (hero.hp === 0) return { ...state, turn: { ...state.turn, startDamageDue: hero.id } }
  const healed = state.heroes.find((h) => h.id === hero.id)
  return startDamage(storyHeal(state, healed), healed)
}

// Story: the reroll comes back each turn.
function storyTurnStart(state) {
  if (!difficultyOf(state.difficulty).rerollEachTurn || !(state.secondChances ?? []).length) return state
  return { ...state, secondChances: [] }
}

// Story: a hero who is still standing heals 1 HP at the start of their turn.
function storyHeal(state, hero) {
  const heal = difficultyOf(state.difficulty).healEachTurn ?? 0
  if (!heal || hero.hp <= 0 || hero.hp >= hero.maxHp) return state
  const hp = Math.min(hero.maxHp, hero.hp + heal)
  return withLog(updateHero(state, hero.id, () => ({ hp })), `📖 Story: ${hero.name} heals ${hp - hero.hp} HP at the start of the turn.`)
}

// Poison and start-of-turn curse damage (Bloodlust).
export function startDamage(state, hero) {
  const poison = hero.conditions.includes('Poisoned') ? 1 : 0
  const curse = curseTotal(hero, 'startDamage')
  if (poison + curse === 0) return state
  const hp = Math.max(0, hero.hp - poison - curse)
  let next = updateHero(state, hero.id, () => ({ hp }))
  if (poison) next = withLog(next, `${hero.name} took 1 poison damage.`)
  if (curse) next = withLog(next, `${hero.name} took ${curse} damage from a curse.`)
  return withMoment(next, {
    kind: hp === 0 ? 'down' : 'poison',
    heroId: hero.id,
    title: hp === 0 ? `${hero.name} is down!` : `${hero.name} takes ${poison + curse} damage`,
    detail:
      hp === 0
        ? 'Spend a healing surge to get back up.'
        : poison
          ? 'Roll 10 or more after your Hero Phase to shake off the poison.'
          : 'A curse hurts at the start of your turn.',
  })
}

// What an item's card says about the hero's actions: "This attack does not count as an
// attack action", "Instead of moving, you can attack", or "Use instead of an attack".
export const itemAttackIsMove = (card) => /instead of moving/i.test(card?.text ?? '')

const itemReplacesAttack = (card) => /instead of an attack/i.test(card?.text ?? '')

export const inHeroPhase = (state, hero) => Boolean(hero) && PHASES[state.turn.phase]?.key === 'hero' && state.heroes[state.turn.heroIndex]?.id === hero.id

// Why the active hero has no attack left this Hero Phase, or null while they still have one.
// A Hero Phase is move and attack, attack and move, or move twice (a Dazed hero gets one
// of those). Using an At-Will or Daily power is the attack, even one without a roll
// (Cause Fear, Blade Barrier); utility powers don't use it. The app only counts moves made
// on the virtual board. Players can still attack anyway when a card says they can.
export function attackGone(state, hero) {
  if (!inHeroPhase(state, hero)) return null
  const dazed = hero.conditions.includes('Dazed')
  const spent = state.turn.attackSpent
  if (spent) return `${hero.name} used this turn's attack on ${spent.on}.`
  const last = state.turn.lastAttack
  if (last && !last.bonus && !last.free && last.heroId === hero.id) {
    return dazed ? `${hero.name} is Dazed, so that was the one action this turn.` : `${hero.name} already attacked this turn.`
  }
  const moves = state.board ? state.turn.boardMoves ?? 0 : 0
  if (dazed && moves >= 1) return `${hero.name} is Dazed and already moved, so there's no attack this turn.`
  if (moves >= 2) return `${hero.name} moved twice, so there's no attack this turn.`
  return null
}

// Whether using this power takes the place of the hero's attack right now.
export const powerUsesAttack = (state, hero, power) => inHeroPhase(state, hero) && (power?.type === 'at-will' || power?.type === 'daily')

// Opening the Cage or disabling a trap takes the place of the active hero's attack:
// once per Hero Phase, and not after they've attacked (or moved twice).
export function canSpendAttack(state, hero) {
  return inHeroPhase(state, hero) && !attackGone(state, hero)
}

export const spendAttack = (state, hero, on) => ({ ...state, turn: { ...state.turn, attackSpent: { heroId: hero.id, on } } })

// Some curses end on a roll at the end of a phase ("Roll a die at the end of your Hero
// Phase: 10+ discard this card"). The device sends the dice with NEXT_PHASE.
export function endPhaseCurses(state, hero, phaseKey, rolls = []) {
  let next = state
  let i = 0
  for (const curse of (hero?.curses ?? []).filter((c) => c.card?.removeRoll?.phase === phaseKey)) {
    const roll = rolls[i++]
    if (!validRoll(roll)) continue
    const { target } = curse.card.removeRoll
    const broken = roll >= target
    next = broken
      ? removeCurse(next, hero.id, curse.id, `${hero.name} rolled ${roll} and broke the ${curse.name} curse!`)
      : withLog(next, `${hero.name} rolled ${roll} against the ${curse.name} curse (needed ${target}). Still cursed.`)
    // Shown on the big screen too, so nobody wonders whether the roll happened.
    next = withMoment(next, {
      kind: broken ? 'defeat' : 'roll',
      heroId: hero.id,
      value: roll,
      title: broken ? `${hero.name} broke the ${curse.name} curse!` : `${hero.name} is still under ${curse.name}`,
      detail: `The curse roll needed ${target}.`,
    })
  }
  return next
}

// After the Hero Phase, Dazed wears off and a poisoned hero rolls (the device sends
// the d20 with the action) to shake off the poison on a 10 or more.
export function endHeroPhase(state, hero, roll) {
  if (!hero) return state
  let next = state
  if (hero.conditions.includes('Dazed')) {
    next = withLog(
      updateHero(next, hero.id, (h) => ({ conditions: h.conditions.filter((c) => c !== 'Dazed') })),
      `${hero.name} is no longer Dazed.`,
    )
  }
  if (!hero.conditions.includes('Poisoned') || !Number.isInteger(roll) || roll < 1 || roll > 20) return next
  const bonus = poisonBonus(hero)
  const cured = roll + bonus >= 10
  const rolled = bonus ? `${roll} + ${bonus} (Cast-Iron Stomach) = ${roll + bonus}` : roll
  if (cured) next = updateHero(next, hero.id, (h) => ({ conditions: h.conditions.filter((c) => c !== 'Poisoned') }))
  next = withLog(next, `${hero.name} rolled ${rolled} against the poison${cured ? ' and shook it off!' : '. Still poisoned.'}`)
  return withMoment(next, {
    kind: 'poison',
    heroId: hero.id,
    value: roll,
    title: cured ? 'Poison gone!' : 'Still poisoned',
    detail: bonus ? `${hero.name} needed 10 or more, with +${bonus} from Cast-Iron Stomach.` : `${hero.name} needed 10 or more.`,
  })
}

export function levelUp(state, hero) {
  const leveled = updateHero(state, hero.id, nextLevel)
  const level = hero.level + 1
  const slot = addedSlot(templateFor(hero.key), level)
  return withMoment(withLog(leveled, `${hero.name} reached level ${level}!`), {
    kind: 'level',
    heroId: hero.id,
    title: `${hero.name} reached level ${level}!`,
    detail: `Flip your hero card and choose another ${slot} power!`,
  })
}

// Using an item from its card: healing, ending a condition, flipping a power back up, and
// so on. Then it flips over or is discarded, if the card says so.
export function useItem(state, action) {
  const hero = state.heroes.find((h) => h.id === action.heroId)
  const item = heroItems(hero).find((i) => i.id === action.itemId && !i.used)
  const card = item?.card
  if (!card?.use || card.use === 'monsterControl') return state
  const picked = state.heroes.find((h) => h.id === (Array.isArray(action.heroIds) && action.heroIds[0])) ?? hero
  let next = withLog(state, `${heroLabel(hero)} used the ${card.name}.`)

  switch (card.use) {
    case 'heal':
      next = healHero(next, picked.id, card.heal, `the ${card.name}`)
      break
    case 'reduceDamage':
      // "Reduce the damage by 1": the app already took it off, so it comes back.
      next = healHero(next, hero.id, 1, `the ${card.name}`)
      break
    case 'endCondition': {
      if (!picked.conditions.includes(action.condition)) return state
      next = updateHero(next, picked.id, (h) => ({ conditions: h.conditions.filter((c) => c !== action.condition) }))
      next = withLog(next, `${picked.name} is no longer ${action.condition}.`)
      break
    }
    case 'refreshPower':
    case 'refreshAny': {
      // A used power, or (Pearl of Power) a used item, flips back up.
      const power = hero.powers.find((p) => p.id === action.targetId && p.used)
      const other = card.use === 'refreshAny' && heroItems(hero).find((i) => i.id === action.targetId && i.used && i.id !== item.id)
      if (power) next = updateHero(next, hero.id, (h) => ({ powers: h.powers.map((p) => (p.id === power.id ? { ...p, used: false } : p)) }))
      else if (other) next = updateHero(next, hero.id, (h) => ({ items: h.items.map((i) => (i.id === other.id ? { ...i, used: false } : i)) }))
      else return state
      next = withLog(next, `${hero.name}'s ${(power ?? other).name} is ready again.`)
      break
    }
    case 'levelUp':
      if (hero.level !== 1) return state
      next = levelUp(next, hero)
      break
    case 'polymorph': {
      // The monster is swapped for the next card off the monster deck, with the same owner.
      const monster = state.monsters.find((m) => m.id === action.monsterId)
      if (!monster) return state
      const owner = state.heroes.find((h) => h.id === monster.ownerId) ?? hero
      next = discardMonsterCard({ ...next, monsters: next.monsters.filter((m) => m.id !== monster.id) }, monster)
      next = withLog(next, `The ${monster.name} was turned into something else!`)
      const withDeck = next.monsterDeck || !(action.cards?.length > 0) ? next : { ...next, monsterDeck: buildDeck(action.cards, action.random) }
      next = withDeck.monsterDeck ? drawMonster(withDeck, owner.id, action.random) : withDeck
      break
    }
    case 'caltrops':
      next = updateHero(next, hero.id, (h) => ({ tokens: { ...h.tokens, caltrops: (h.tokens?.caltrops ?? 0) + card.tokens } }))
      break
    default:
      // The Flying Carpet's marker goes on the virtual board, waiting for its square.
      if (item.cardId === 'flying-carpet') next = addCarpet(next)
      // Potion of Speed: on the virtual board the hero walks their speed.
      if (item.cardId === 'potion-of-speed') next = queueMoves(next, hero, card, [{ pick: 'self', to: 'squares', n: 'speed' }])
      if (item.cardId === 'wand-of-fear') next = queueWandOfFear(next, hero, card)
      // A Lucky Charm used on another roll: the table does the rest.
      break
  }
  // Wands "used instead of an attack" take the place of the hero's attack.
  if (itemReplacesAttack(card) && inHeroPhase(state, hero)) next = spendAttack(next, hero, `the ${card.name}`)
  return spendItem(next, hero.id, item.id)
}

// Scroll of Monster Control: during the Villain Phase a monster attacks another monster
// instead of acting. The scroll's owner gets the XP (and a treasure, if it's the first).
export function monsterControl(state, action) {
  const hero = state.heroes.find((h) => h.id === action.heroId)
  const item = heroItems(hero).find((i) => i.id === action.itemId && !i.used && i.card?.use === 'monsterControl')
  // Villains count as monsters here: a villain can be controlled, or attacked.
  const monster = findFoe(state, action.monsterId)
  const target = action.targetId !== action.monsterId ? findFoe(state, action.targetId) : null
  if (!item || !monster || !target?.ac || !validRoll(action.roll)) return state
  const attack = item.card.monsterAttack ?? { bonus: 9, damage: 1 }
  const result = rollAgainst(target, action.roll, { ...attack, miss: 0 })
  let next = spendItem(state, hero.id, item.id, 'discard')
  next = withLog(
    next,
    `${hero.name}'s ${item.name}: the ${monster.name} attacked the ${target.name}, rolled ${action.roll} + ${attack.bonus} = ${result.total} against AC ${target.ac}. ${result.outcome}`,
  )
  const hurt = hurtMonster(next, target, result.dealt)
  const won = defeatDetails(hurt.state, hurt.defeated ? [target] : [], hero.id)
  return withMoment(won.state, {
    kind: hurt.defeated ? 'defeat' : 'roll',
    heroId: hero.id,
    title: `The ${monster.name} attacks the ${target.name}!`,
    detail: won.details.join(' '),
    rolls: [{ monsterId: target.id, label: target.name, value: action.roll, total: result.total, ac: target.ac, hit: result.hit, outcome: result.outcome }],
  })
}
