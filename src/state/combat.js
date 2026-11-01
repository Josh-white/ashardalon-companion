// Monsters, villains, traps and encounter cards attacking the heroes, villagers in
// danger, damage and defeats, and the hero card abilities a hit or a kill offers
// (Saving Grace, Healing Hands, Brutal Recovery). The reducer is in game.js.
import { hasAbility } from '../data/heroes.js'
import { monsterArt } from '../data/art.js'
import { PHASES } from '../data/phases.js'
import { tileAcBonus, tileGuards } from '../data/items.js'
import { effectsOf, heroAc } from '../data/powerEffects.js'
import { bottomToTop } from './tiles.js'
import { aliveVillagers, countDefeat, showStory, villagerForRoll } from './adventure.js'
import { placeNear, placeToken } from '../board/play.js'
import { sentryMoves } from '../board/monsters.js'
import { queueEncounterMoves } from '../board/powerMoves.js'
import { heroTile } from '../board/encounters.js'
import { guardsOnTile } from '../board/checks.js'
import { addTreasureToken } from '../board/items.js'
import { isLava, isMovingTrap } from '../board/traps.js'
import { activeVillains, clamp, findFoe, lose, markUsed, newId, shuffle, updateHero, updateMonster, validRoll, withLog, withMoment, withVillainCall } from './gameHelpers.js'
import { drawMonsterOfType, filterMonsterDeck, villainInPlay } from './monsterDeck.js'
import { discardEncounterCard, intoTopThree, oweEncounter } from './encounterDeck.js'
import { oweTreasure, treasureWords } from './treasureDeck.js'

// A hero's AC against an attack. Heroes standing on a Blessed Shield owner's tile get its
// bonus too: read from the virtual board, or asked on the iPad (tileGuarded) without one.
function targetAc(state, hero, tileGuarded) {
  const onBoard = guardsOnTile(state, hero, tileGuards(state.heroes, hero).map((g) => g.hero))
  if (onBoard) return heroAc(hero) + tileAcBonus(onBoard, hero)
  return heroAc(hero) + (Array.isArray(tileGuarded) && tileGuarded.includes(hero.id) ? tileAcBonus(state.heroes, hero) : 0)
}

// One monster attack against one or more heroes. Each target comes with the d20 the
// device rolled for it. A hit deals the damage and conditions; a miss deals the miss damage.
export function monsterAttack(state, action) {
  const monster = findFoe(state, action.monsterId)
  // A table of attacks (the Gauth's eye ray): the device's roll picks which one.
  const table = validRoll(action.tableRoll) && monster?.card?.attacks.filter((a) => a.group === action.attackId)
  const attack = table?.length
    ? table.find((a) => action.tableRoll >= a.roll[0] && action.tableRoll <= a.roll[1])
    : monster?.card?.attacks.find((a) => a.id === action.attackId)
  const all = (Array.isArray(action.targets) ? action.targets : []).filter((t) => validRoll(t?.roll))
  // Villagers count as heroes for monster tactics, so a monster can attack them too.
  const villagerTargets = all.filter((t) => aliveVillagers(state).some((v) => v.id === t.heroId))
  // A hero at 0 HP is down and out of the fight: attacks skip them.
  let targets = all.filter((t) => state.heroes.some((h) => h.id === t.heroId && h.hp > 0))
  if (!attack || targets.length + villagerTargets.length === 0) return state

  let next = table?.length ? withLog(state, `The ${monster.name} rolled ${action.tableRoll} for its ${action.attackId.replace(/-/g, ' ')}: ${attack.name}!`) : state
  // Noble Shield: Keyleth takes an attack aimed at several heroes alone, and it rolls a 20.
  const shield = action.nobleShield
  if (shield) {
    const keeper = state.heroes.find((h) => h.id === shield.heroId)
    const power = keeper?.powers.find((p) => p.id === shield.powerId)
    if (!power || power.used || effectsOf(power).reaction !== 'noble-shield' || targets.length < 2) return state
    if (!targets.some((t) => t.heroId === keeper.id)) return state
    targets = [{ heroId: keeper.id, roll: 20 }]
    next = withLog(markUsed(next, keeper.id, power.id), `${keeper.name} used Noble Shield to take the ${monster.name}'s attack alone.`)
  }

  const rolls = []
  const results = []
  const downed = []
  for (const { heroId, roll } of targets) {
    const hero = next.heroes.find((h) => h.id === heroId)
    const ac = targetAc(next, hero, action.tileGuarded)
    const total = roll + attack.bonus
    const hit = total >= ac
    const damage = hit ? attack.damage : attack.miss
    const conditions = hit ? attack.conditions.filter((c) => !hero.conditions.includes(c)) : []
    const hp = clamp(hero.hp - damage, 0, hero.maxHp)
    next = updateHero(next, hero.id, (h) => ({ hp, conditions: [...h.conditions, ...conditions] }))
    if (hero.hp > 0 && hp === 0) downed.push(hero.name)
    const result = [damage > 0 && `${damage} damage`, ...conditions].filter(Boolean).join(' and ')
    const outcome = hit ? `Hit! ${result || 'No damage'}` : damage > 0 ? `Miss, but ${result}` : 'Miss!'
    rolls.push({ heroId: hero.id, value: roll, total, ac, hit, outcome })
    results.push({ heroId: hero.id, value: roll, total, ac, hit, dealt: hero.hp - hp, miss: attack.miss, conditions, effect: attack.effect })
    next = withLog(
      next,
      `The ${monster.name} attacked ${hero.name} with its ${attack.name}: rolled ${roll} + ${attack.bonus} = ${total} against AC ${ac}. ${outcome}`,
    )
    // Each miss against Mirror Image pops one of the images.
    if (!hit && hero.tokens?.mirrorImage > 0) {
      next = updateHero(next, hero.id, (h) => ({ tokens: { ...h.tokens, mirrorImage: h.tokens.mirrorImage - 1 } }))
      next = withLog(next, `One of ${hero.name}'s mirror images vanished.`)
    }
  }
  for (const { heroId, roll } of villagerTargets) {
    const villager = next.villagers.find((v) => v.id === heroId)
    const total = roll + attack.bonus
    const hit = total >= villager.ac
    const damage = hit ? attack.damage : attack.miss
    const hp = clamp(villager.hp - damage, 0, villager.maxHp)
    const outcome = hit ? `Hit! ${damage} damage` : damage > 0 ? `Miss, but ${damage} damage` : 'Miss!'
    rolls.push({ heroId: villager.id, value: roll, total, ac: villager.ac, hit, outcome })
    results.push({ heroId: villager.id, villager: true, value: roll, total, ac: villager.ac, hit, dealt: villager.hp - hp, miss: attack.miss, conditions: [], effect: attack.effect })
    next = withLog(next, `The ${monster.name} attacked the villager ${villager.name} with its ${attack.name}: rolled ${roll} + ${attack.bonus} = ${total} against AC ${villager.ac}. ${outcome}`)
    next = hurtVillager(next, villager, hp)
    if (hp === 0) downed.push(villager.name)
  }
  // Remembered so Tumbling Escape can turn a hit into a miss.
  next = { ...next, turn: { ...next.turn, lastMonsterAttack: { monsterId: monster.id, attackId: attack.id, tableRoll: table?.length ? action.tableRoll : null, results } } }
  for (const name of downed) next = withLog(next, `${name} is down!`)
  if (next.status === 'lost') return next
  return withMoment(next, {
    kind: downed.length > 0 ? 'monster-down' : 'monster',
    monsterId: monster.id,
    art: monsterArt(monster),
    title: `${monster.name}: ${attack.name}!`,
    detail: downed.length > 0 ? `${downed.join(' and ')} ${downed.length > 1 ? 'are' : 'is'} down!` : '',
    rolls,
  })
}

// A villager's HP after a hit. At 0 the villager is gone: its token comes off the board.
// When the last villager is gone, the heroes lose (Free the Captives).
export function hurtVillager(state, villager, hp) {
  let next = { ...state, villagers: state.villagers.map((v) => (v.id === villager.id ? { ...v, hp, removed: hp === 0 } : v)) }
  if (hp > 0 || villager.removed) return next
  next = withLog(next, `The villager ${villager.name} is gone. Take the token off the board.`)
  if (aliveVillagers(next).length > 0) return next
  const lost = lose(next, 'The last villager is gone. The heroes lose.')
  return withMoment(showStory(lost, 'The captives are lost', 'The last villager has fallen. There is no one left to rescue, and the heroes lose.'), {
    kind: 'down',
    title: 'The last villager is gone!',
    detail: 'The heroes lose.',
  })
}

// Puts villager tokens in a chamber: `n` villager cards drawn at random (all of them when n is 0).
export function placeVillagers(state, cards, n, random = []) {
  const list = Array.isArray(cards) ? cards : []
  if (list.length === 0) return withLog(state, 'The app has no villager cards, so place the villagers from the real cards.')
  const drawn = shuffle(list, random).slice(0, n > 0 ? n : list.length)
  const villagers = drawn.map((card) => ({ id: newId('villager'), cardId: card.id, name: card.name, hp: card.hp, maxHp: card.hp, ac: card.ac, removed: false, card }))
  return withLog({ ...state, villagers: [...(state.villagers ?? []), ...villagers] }, `Villagers in the chamber: ${villagers.map((v) => v.name).join(', ')}.`)
}

// The end of a Hero Phase with villagers in play: the d20 says which one acts.
export function villagerRoll(state, action) {
  const hero = state.heroes[state.turn.heroIndex]
  if (!hero || PHASES[state.turn.phase]?.key !== 'hero' || state.turn.villagerRoll || aliveVillagers(state).length === 0 || !validRoll(action.roll)) return state
  const villager = villagerForRoll(state, action.roll)
  const next = withLog(
    { ...state, turn: { ...state.turn, villagerRoll: { roll: action.roll, villagerId: villager?.id ?? null, attacked: false } } },
    villager ? `${hero.name} rolled ${action.roll}: the villager ${villager.name} acts.` : `${hero.name} rolled ${action.roll}: no villager acts.`,
  )
  return withMoment(next, {
    kind: 'roll',
    heroId: hero.id,
    value: action.roll,
    title: villager ? `${villager.name} acts!` : 'No villager acts',
    detail: villager ? 'Follow the villager card.' : 'That villager is no longer in play.',
  })
}

// A villager's punch at a monster, rolled on the device.
export function villagerAttack(state, action) {
  const turnRoll = state.turn.villagerRoll
  const villager = aliveVillagers(state).find((v) => v.id === action.villagerId)
  const monster = findFoe(state, action.monsterId)
  const attack = villager?.card.attack
  if (!turnRoll || turnRoll.attacked || turnRoll.villagerId !== villager?.id || !attack || !monster || monster.objective || !validRoll(action.roll)) return state
  const total = action.roll + attack.bonus
  const hit = total >= monster.ac
  let next = withLog(
    { ...state, turn: { ...state.turn, villagerRoll: { ...turnRoll, attacked: true } } },
    `${villager.name} punched the ${monster.name}: rolled ${action.roll} + ${attack.bonus} = ${total} against AC ${monster.ac}. ${hit ? `Hit! ${attack.damage} damage` : 'Miss!'}`,
  )
  let defeated = false
  if (hit) ({ state: next, defeated } = hurtMonster(next, monster, attack.damage))
  return withMoment(next, {
    kind: defeated ? 'defeat' : 'roll',
    value: action.roll,
    title: hit ? `${villager.name} hits the ${monster.name}!` : `${villager.name} misses`,
    detail: defeated ? `The ${monster.name} is defeated!` : hit ? `${attack.damage} damage.` : `Needed ${monster.ac} or more.`,
  })
}

// An attack on one or more heroes, from a monster, an encounter card or a trap. Each
// target comes with the d20 the device rolled for it. A hit deals the damage and
// conditions; a miss deals the miss damage (and any miss conditions). Heroes at 0 HP are skipped.
// `source` ({ kind: 'encounter' } or { kind: 'trap', trapId }) is remembered for Practiced Evasion.
export function attackHeroes(state, { who, attack, targets: list, moment, tileGuarded, source }) {
  const targets = (Array.isArray(list) ? list : []).filter(
    (t) => state.heroes.some((h) => h.id === t.heroId && h.hp > 0) && validRoll(t.roll),
  )
  if (!attack || targets.length === 0) return state

  let next = state
  const rolls = []
  const results = []
  const downed = []
  for (const { heroId, roll } of targets) {
    const hero = next.heroes.find((h) => h.id === heroId)
    const ac = targetAc(next, hero, tileGuarded)
    const total = roll + attack.bonus
    const hit = total >= ac
    const damage = hit ? attack.damage : attack.miss
    const conditions = (hit ? attack.conditions : attack.missConditions ?? []).filter((c) => !hero.conditions.includes(c))
    const hp = clamp(hero.hp - damage, 0, hero.maxHp)
    next = updateHero(next, hero.id, (h) => ({ hp, conditions: [...h.conditions, ...conditions] }))
    if (hero.hp > 0 && hp === 0) downed.push(hero.name)
    const result = [damage > 0 && `${damage} damage`, ...conditions].filter(Boolean).join(' and ')
    const outcome = hit ? `Hit! ${result || 'No damage'}` : result ? `Miss, but ${result}` : 'Miss!'
    rolls.push({ heroId: hero.id, value: roll, total, ac, hit, outcome })
    results.push({ heroId: hero.id, hit, dealt: hero.hp - hp, conditions, miss: attack.miss, missConditions: attack.missConditions ?? [] })
    next = withLog(next, `${who} attacked ${hero.name}: rolled ${roll} + ${attack.bonus} = ${total} against AC ${ac}. ${outcome}`)
    // Each miss against Mirror Image pops one of the images.
    if (!hit && hero.tokens?.mirrorImage > 0) {
      next = updateHero(next, hero.id, (h) => ({ tokens: { ...h.tokens, mirrorImage: h.tokens.mirrorImage - 1 } }))
      next = withLog(next, `One of ${hero.name}'s mirror images vanished.`)
    }
  }
  if (source) next = { ...next, turn: { ...next.turn, lastEventAttack: { ...source, results } } }
  for (const name of downed) next = withLog(next, `${name} is down!`)
  return withMoment(next, {
    kind: downed.length > 0 ? 'monster-down' : 'monster',
    ...moment,
    detail: downed.length > 0 ? `${downed.join(' and ')} ${downed.length > 1 ? 'are' : 'is'} down!` : moment.detail ?? '',
    rolls,
  })
}

// Damage that needs no roll, such as "Each Hero takes 1 damage."
export function damageHeroes(state, heroIds, damage, why) {
  let next = state
  const downed = []
  for (const hero of state.heroes.filter((h) => heroIds.includes(h.id) && h.hp > 0)) {
    const hp = clamp(hero.hp - damage, 0, hero.maxHp)
    next = withLog(updateHero(next, hero.id, () => ({ hp })), `${hero.name} took ${damage} damage from ${why}.`)
    if (hp === 0) downed.push(hero.name)
  }
  for (const name of downed) next = withLog(next, `${name} is down!`)
  return { next, downed }
}

// After the encounter card is read out (and any attack rolled), the app does what it
// can and puts the card where it goes: on the hero (curse), in play (environment), on
// the board (trap, hazard), or in the discards (event).
export function resolveEncounter(state, action) {
  const encounter = state.encounter
  if (!encounter) return state
  const { card } = encounter
  const hero = state.heroes.find((h) => h.id === encounter.heroId)
  let next = { ...state, encounter: null }
  let downed = []
  // Its villain or objective isn't in play: the card is just discarded.
  if (!villainInPlay(state, card)) return withLog(discardEncounterCard(next, card.id), `${card.name} was discarded: it has nothing to do.`)

  if (card.damageEach > 0) {
    ;({ next, downed } = damageHeroes(next, next.heroes.map((h) => h.id), card.damageEach, card.name))
  }
  if (card.damageIfMonsterOnTile > 0 && action.monsterOnTile && hero) {
    ;({ next, downed } = damageHeroes(next, [hero.id], card.damageIfMonsterOnTile, card.name))
  }
  if (card.damagePoisoned > 0) {
    const poisoned = next.heroes.filter((h) => h.conditions.includes('Poisoned')).map((h) => h.id)
    ;({ next, downed } = damageHeroes(next, poisoned, card.damagePoisoned, card.name))
  }
  if (card.filterMonsters && !encounter.filtered) next = filterMonsterDeck(next, card.filterMonsters, action.random, action.monsterCards)
  if (card.placeVillain) next = placeVillain(next, { type: 'PLACE_VILLAIN', name: card.placeVillain, cards: action.villains ?? [] })
  if (card.drawMonsterType && hero) {
    const before = next.monsters.length
    next = drawMonsterOfType(next, hero.id, card.drawMonsterType, action.random, action.monsterCards)
    next = besideGate(next, before)
  }
  if (card.timeToken) next = removeTimeToken(next, card.name)
  // Concussive Blast, Quick Advance: the virtual board asks for the moves.
  next = queueEncounterMoves(next, hero, card)
  // Blinding Bomb: the Sentry monsters head for the unexplored edges.
  if (card.id === 'blinding-bomb') {
    for (const { id, to } of sentryMoves(next)) next = placeToken(next, id, to)
  }
  // Hidden Treasure, Occupied Lair: on the virtual board, a Treasure token waits for a player to tap its square.
  if ((card.placeTreasure || card.id === 'hidden-treasure' || card.id === 'occupied-lair') && next.board) next = addTreasureToken(next)

  if (card.type === 'curse' && hero) {
    const curse = { id: newId('curse'), cardId: card.id, name: card.name, text: card.text, card: card.curse ?? {}, checks: card.checks ?? [] }
    next = withLog(updateHero(next, hero.id, (h) => ({ curses: [...(h.curses ?? []), curse] })), `${hero.name} is cursed: ${card.name}.`)
  } else if (card.type === 'environment') {
    if (next.environment) next = discardEncounterCard(next, next.environment.cardId)
    next = withLog({ ...next, environment: { cardId: card.id, name: card.name, card } }, `${card.name} is the new environment.`)
  } else if (card.type === 'trap' || card.type === 'hazard') {
    const marker = { id: newId('trap'), cardId: card.id, name: card.name, type: card.type, ownerId: encounter.heroId, card }
    // On the virtual board the marker remembers its tile, so the trap knows who it reaches.
    const tile = heroTile(state, encounter.heroId)
    if (tile !== undefined) {
      marker.tile = tile
      // The board follows moving traps (Rolling Boulder) and spreading lava from here on.
      if (isMovingTrap(card)) marker.tracked = true
      if (isLava(card)) marker.tiles = [tile]
    }
    next = withLog({ ...next, traps: [...(next.traps ?? []), marker] }, `A ${card.name} marker goes on ${hero?.name ?? 'the hero'}'s tile.`)
  } else if (card.returnToTop) {
    next = withLog({ ...next, encounterDeck: intoTopThree(next.encounterDeck, card.id, card, action.random?.slice(-1)) }, `${card.name} was shuffled back into the top of the encounter deck.`)
  } else if (card.afterDrawTop) {
    next = { ...next, encounterAfter: [...(next.encounterAfter ?? []).filter((id) => id !== card.id), card.id] }
  } else {
    next = discardEncounterCard(next, card.id)
  }
  if (card.id === 'lost') next = bottomToTop(next)
  if (card.drawAnother) next = oweEncounter(next, `${card.name} says to draw another encounter card.`)
  if (downed.length > 0) {
    next = withMoment(next, { kind: 'down', title: `${downed.join(' and ')} ${downed.length > 1 ? 'are' : 'is'} down!`, detail: card.name })
  }
  return next
}

// Ceremony Progresses!: one Time token off the Vast Gate. When the last one goes, the gate
// opens and the heroes lose.
function removeTimeToken(state, why) {
  const left = state.adventure?.timeTokens
  if (!Number.isInteger(left) || left <= 0) return state
  const next = withLog({ ...state, adventure: { ...state.adventure, timeTokens: left - 1 } }, `${why}: a Time token comes off the Vast Gate. ${left - 1} left.`)
  if (left - 1 > 0) {
    return withMoment(next, { kind: 'encounter', title: `${left - 1} Time token${left - 1 === 1 ? '' : 's'} left!`, detail: 'Take one Time token off the Vast Gate. Destroy it before they run out!' })
  }
  const lost = lose(next, 'The last Time token is gone. The Vast Gate opens!')
  const defeat = state.adventure.card.story.defeat
  return withMoment(showStory(lost, 'The Vast Gate opens!', defeat || 'The last Time token is gone, and a horde of aberrant monsters pours out of the Far Realm. The heroes lose.'), {
    kind: 'down',
    title: 'The Vast Gate opens!',
    detail: 'The last Time token is gone.',
  })
}

// "+6" → 6, "2" → 2. A power without a number has no attack roll.
export const powerNumber = (text) => {
  const match = /[+-]?\d+/.exec(String(text ?? ''))
  return match ? Number(match[0]) : null
}

// Damage to a monster. A group card (three Legion Devils) loses one figure at a
// time, so extra damage doesn't spill onto the next figure.
function damageMonster(monster, damage) {
  const perFigure = monster.card?.figures > 1 ? monster.card.hp : monster.maxHp
  const current = monster.hp - perFigure * (Math.ceil(monster.hp / perFigure) - 1)
  return monster.hp - Math.min(damage, current)
}

// Takes `dealt` HP off a monster. At 0 HP it is defeated: off the board, and its XP to the party.
export function hurtMonster(state, monster, dealt) {
  const hp = dealt > 0 ? damageMonster(monster, dealt) : monster.hp
  if (monster.villain) return hp > 0 ? { state: updateMonster(state, monster.id, () => ({ hp })), defeated: false } : defeatVillain(state, monster)
  // Figures taken off the board count toward adventures such as Monster Hunt.
  const counted = countDefeat(state, monster, figuresLeft(monster, monster.hp) - figuresLeft(monster, hp), hp === 0)
  if (hp > 0) return { state: updateMonster(counted, monster.id, () => ({ hp })), defeated: false }
  const next = { ...counted, xp: state.xp + monster.xp, monsters: state.monsters.filter((m) => m.id !== monster.id) }
  return { state: withLog(next, `The ${monster.name} was defeated! +${monster.xp} XP`), defeated: true }
}

// A villain at 0 HP. The Rage Drake flips to its enraged side the first time; any other
// villain is defeated, and stays in the villain list marked defeated for the adventure.
export function defeatVillain(state, villain) {
  const rage = villain.card.enraged
  if (rage) {
    const card = { ...villain.card, hp: rage.hp, attacks: rage.attacks, tactics: rage.tactics, enraged: null }
    const next = withVillainCall(updateMonster(state, villain.id, () => ({ hp: rage.hp, maxHp: rage.hp, ac: rage.ac, enraged: true, card })), villain, 'enraged')
    return {
      state: withMoment(withLog(next, `The ${villain.name} is enraged! It's back up with ${rage.hp} HP and AC ${rage.ac}.`), {
        kind: 'spawn',
        art: monsterArt(villain),
        title: `The ${villain.name} is enraged!`,
        detail: `It gets back up with ${rage.hp} HP, AC ${rage.ac} and nastier tactics. Flip its card over.`,
      }),
      defeated: false,
    }
  }
  // Official FAQ: a villain is worth experience equal to its level.
  const xp = Number(villain.card?.level) || 0
  const next = withVillainCall(updateMonster({ ...state, xp: state.xp + xp }, villain.id, () => ({ hp: 0, defeated: true })), villain, 'fall')
  return { state: withLog(next, `The villain ${villain.name} was defeated!${xp ? ` +${xp} XP` : ''}`), defeated: true }
}

// Figures still on the board for a monster card at this HP (three for a full group of Legion Devils).
export function figuresLeft(monster, hp) {
  const perFigure = monster.card?.figures > 1 ? monster.card.hp : monster.maxHp
  return Math.ceil(hp / perFigure)
}

// The first monster defeated in a turn earns a treasure card for the hero who defeated
// it (a villain or a chamber's Altar doesn't). Returns the moment's words.
export function defeatDetails(state, defeated, heroId) {
  if (defeated.length === 0) return { state, details: [] }
  if (defeated.every((m) => m.villain || m.objective)) return { state, details: [`${defeated.map((m) => m.name).join(' and ')} defeated!`] }
  const treasure = !state.turn.treasureDrawn
  const next = treasure ? { ...state, turn: oweTreasure(state, heroId ?? null) } : state
  const xp = defeated.reduce((sum, m) => sum + (m.xp ?? 0), 0)
  return {
    state: next,
    details: [`${defeated.map((m) => m.name).join(' and ')} defeated! +${xp} XP`, treasure && treasureWords(state)].filter(Boolean),
  }
}

// Heals a hero (never past max HP) and logs it.
export function healHero(state, heroId, amount, source) {
  const hero = state.heroes.find((h) => h.id === heroId)
  if (!hero || amount <= 0) return state
  const hp = Math.min(hero.maxHp, hero.hp + amount)
  if (hp === hero.hp) return withLog(state, `${hero.name} is already at full HP.`)
  const next = withLog(updateHero(state, hero.id, () => ({ hp })), `${hero.name} regained ${hp - hero.hp} HP from ${source}.`)
  return offerSavingGrace(next, hero)
}

// The heroes' own abilities (the hero cards), offered for the rest of the turn on the hero
// card they help: turn.abilityOffers = { savingGrace: [heroId], healingHands: [heroId], brutalRecovery }.
export const heroWith = (state, effect) => state.heroes.find((h) => hasAbility(h, effect))

export const offers = (state) => state.turn.abilityOffers ?? {}

export function addOffer(state, kind, value) {
  const now = offers(state)
  const merged = value === true ? true : [...new Set([...(now[kind] ?? []), value])]
  return { ...state, turn: { ...state.turn, abilityOffers: { ...now, [kind]: merged } } }
}

export function dropOffer(state, kind, heroId) {
  const now = offers(state)
  const left = heroId ? (now[kind] ?? []).filter((id) => id !== heroId) : false
  return { ...state, turn: { ...state.turn, abilityOffers: { ...now, [kind]: left } } }
}

// Quinn's Saving Grace: a hero on Quinn's tile who regains HP can also end a condition.
export function offerSavingGrace(state, hero) {
  if (!heroWith(state, 'saving-grace') || hero.conditions.length === 0) return state
  return addOffer(state, 'savingGrace', hero.id)
}

// Tarak's Brutal Recovery: a natural 20 by a hero on Tarak's tile can flip Furious Assault back over.
export function offerBrutalRecovery(state) {
  const tarak = heroWith(state, 'brutal-recovery')
  if (!tarak?.powers.some((p) => p.used && effectsOf(p).reaction === 'furious')) return state
  return addOffer(state, 'brutalRecovery', true)
}

// Vistra's Cast-Iron Stomach: +5 to rolls to end Poisoned.
export const poisonBonus = (hero) => (hasAbility(hero, 'cast-iron-stomach') ? 5 : 0)

// One attack roll's sums. The parts that don't depend on the die are worked out once per attack.
export function rollAgainst(monster, roll, attack) {
  const total = roll + attack.bonus
  const hit = total >= monster.ac
  const even = hit && attack.evenBonus && roll % 2 === 0 ? attack.evenBonus : 0
  // Dragontooth Pick and Vorpal Sword: +1 damage on a high natural roll.
  const crit = hit ? (attack.crits ?? []).filter((from) => roll >= from).length : 0
  const damage = attack.damage + even + crit
  const dealt = hit ? damage : attack.miss
  const outcome = hit ? (damage > 0 ? `Hit! ${damage} damage` : 'Hit!') : attack.miss > 0 ? `Miss, but ${attack.miss} damage` : 'Miss!'
  return { total, hit, dealt, outcome }
}

// On the virtual board a monster out of the Vast Gate (the adventure's own check, The Vast
// Gate Flares!) goes next to the gate. `before` is how many monsters there were.
export function besideGate(state, before) {
  const gate = state.board && state.monsters.find((m) => m.objective && state.board.tokens[m.id])
  return gate && state.monsters.length > before ? placeNear(state, state.monsters.at(-1), state.board.tokens[gate.id]) : state
}

// Puts a villain on the board, found by its card's id or name ("Kobold Dragonlord").
// An adventure does this when its villain's tile is revealed.
export function placeVillain(state, action) {
  const wanted = String(action.name ?? '').toLowerCase()
  const card = (Array.isArray(action.cards) ? action.cards : []).find(
    (c) => c.id.toLowerCase() === wanted || c.name.toLowerCase() === wanted || c.fullName?.toLowerCase() === wanted,
  )
  if (!card) return withLog(state, `The app has no villain card called "${action.name}".`)
  if (activeVillains(state).some((v) => v.cardId === card.id)) return state
  const villain = {
    id: newId('villain'),
    villain: true,
    cardId: card.id,
    name: card.name,
    fullName: card.fullName ?? card.name,
    maxHp: card.hp,
    hp: card.hp,
    ac: card.ac,
    xp: 0,
    ownerId: null,
    conditions: [],
    defeated: false,
    enraged: false,
    card: {
      hp: card.hp,
      figures: 1,
      level: card.level ?? null,
      flavor: card.flavor ?? '',
      special: card.special ?? '',
      onPlace: card.onPlace ?? '',
      types: card.types ?? [],
      attacks: card.attacks,
      tactics: card.tactics,
      enraged: card.enraged ?? null,
    },
  }
  let next = { ...state, villains: [...(state.villains ?? []), villain] }
  // Ashardalon brings his breath card: it goes into the top of the encounter deck before the next draw.
  if (card.addEncounter) next = { ...next, encounterAdds: [...(next.encounterAdds ?? []).filter((id) => id !== card.addEncounter), card.addEncounter] }
  next = withVillainCall(next, villain, 'arrive')
  return withMoment(withLog(next, `The villain ${villain.fullName} appears!`), {
    kind: 'spawn',
    art: monsterArt(villain),
    title: `${villain.fullName} appears!`,
    detail: [
      `Place the ${villain.name} figure. It takes a turn at the start of every Villain Phase.`,
      card.addEncounter ? 'The app shuffles its special encounter card into the top of the encounter deck.' : card.onPlace,
    ].filter(Boolean).join(' '),
  })
}
