import {
  HERO_TEMPLATES,
  LEVEL_UP_AC_BONUS,
  LEVEL_UP_HP_BONUS,
  LEVEL_UP_SURGE_BONUS,
  STARTING_SURGES,
  XP_TO_CANCEL_ENCOUNTER,
  XP_TO_LEVEL_UP,
} from '../data/heroes.js'
import { PHASES } from '../data/phases.js'
import { effectsOf, heroAc, maxRolls } from '../data/powerEffects.js'

export const SAVE_VERSION = 1

let idCounter = 0
const newId = (prefix) => `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`

export const initialState = {
  version: SAVE_VERSION,
  status: 'setup', // setup | playing | won | lost
  heroes: [],
  surges: STARTING_SURGES,
  xp: 0,
  monsters: [],
  turn: { heroIndex: 0, phase: 0, round: 1 },
  log: [],
  moment: null, // the latest big moment, shown on every screen for a few seconds
  // Before the game starts, each iPad claims one hero and picks its powers here.
  lobby: [], // { deviceId, heroKey, player, picks: [card | null] per power slot, ready }
  // The virtual monster deck, built from the monster cards on the first draw.
  monsterDeck: null, // { cards: { [cardId]: card }, draw: [cardId], discard: [cardId] }
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const withLog = (state, text) => ({
  ...state,
  log: [{ id: newId('log'), round: state.turn.round, text }, ...state.log].slice(0, 50),
})

const withMoment = (state, moment) => ({
  ...state,
  moment: { id: newId('moment'), at: Date.now(), ...moment },
})

const heroLabel = (hero) => hero.player || hero.name

const updateHero = (state, heroId, change) => ({
  ...state,
  heroes: state.heroes.map((hero) => (hero.id === heroId ? { ...hero, ...change(hero) } : hero)),
})

const updateMonster = (state, monsterId, change) => ({
  ...state,
  monsters: state.monsters.map((monster) =>
    monster.id === monsterId ? { ...monster, ...change(monster) } : monster,
  ),
})

const toggle = (list, item) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item])

// Shuffles with random numbers the device sent along (0 ≤ n < 1), so every
// device and the server agree on the result and Undo puts the deck back.
export function shuffle(list, random = []) {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const r = Number(random[i])
    const j = Number.isFinite(r) && r >= 0 && r < 1 ? Math.floor(r * (i + 1)) : i
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function buildMonsterDeck(cards = [], random) {
  const byId = Object.fromEntries(cards.map((card) => [card.id, card]))
  const ids = cards.flatMap((card) => Array.from({ length: card.copies ?? 1 }, () => card.id))
  return { cards: byId, draw: shuffle(ids, random), discard: [] }
}

// A monster in play, with the card copied in so its tactics and attacks travel with it.
function monsterFromCard(card, ownerId) {
  const figures = card.figures ?? 1
  return {
    id: newId('monster'),
    cardId: card.id,
    name: card.name,
    maxHp: card.hp * figures,
    hp: card.hp * figures,
    ac: card.ac,
    xp: card.xp,
    ownerId,
    conditions: [],
    card: { hp: card.hp, figures, special: card.special ?? '', attacks: card.attacks, tactics: card.tactics },
  }
}

const article = (name) => (/^[AEIOU]/.test(name) ? 'an' : 'a')

// Draws a monster card for a hero. A hero never has two cards of the same monster, so
// cards they already have are discarded until a new one turns up. The discards are
// shuffled into a new deck when the deck runs out.
function drawMonster(state, heroId, random) {
  const hero = state.heroes.find((h) => h.id === heroId)
  const deck = state.monsterDeck
  if (!hero || !deck) return state
  const owned = new Set(state.monsters.filter((m) => m.ownerId === hero.id).map((m) => m.cardId))
  let { draw, discard } = deck
  let next = state
  let reshuffled = false
  const skipped = []
  let cardId = null
  while (cardId === null) {
    if (draw.length === 0) {
      if (discard.length === 0 || reshuffled) {
        return withLog(state, `There's no monster card left that ${hero.name} doesn't already have.`)
      }
      draw = shuffle(discard, random)
      discard = []
      reshuffled = true
      next = withLog(next, 'The monster discards were shuffled into a new deck.')
    }
    const [top, ...rest] = draw
    draw = rest
    if (owned.has(top)) skipped.push(top)
    else cardId = top
  }
  discard = [...discard, ...skipped]
  for (const id of skipped) {
    const name = deck.cards[id]?.name ?? 'monster'
    next = withLog(next, `Discarded ${article(name)} ${name}: ${hero.name} already has one.`)
  }
  const card = deck.cards[cardId]
  if (!card) return state
  const monster = monsterFromCard(card, hero.id)
  const figures = monster.card.figures
  // One monster per new tile: the Exploration Phase's draw button locks after this.
  const exploring = PHASES[next.turn.phase]?.key === 'exploration' && next.heroes[next.turn.heroIndex]?.id === hero.id
  next = {
    ...next,
    monsterDeck: { ...deck, draw, discard },
    monsters: [...next.monsters, monster],
    turn: exploring ? { ...next.turn, monsterDrawn: true } : next.turn,
  }
  return withMoment(withLog(next, `${heroLabel(hero)} drew ${article(card.name)} ${card.name}!`), {
    kind: 'spawn',
    heroId: hero.id,
    title: figures > 1 ? `${figures} ${card.name}s appear!` : `${article(card.name) === 'an' ? 'An' : 'A'} ${card.name} appears!`,
    detail: figures > 1 ? `Place ${figures} ${card.name} figures on the new tile.` : 'Place its figure on the new tile.',
  })
}

// A defeated monster's card goes to the party's XP pile (the xp count), never back into
// the deck. Only a monster removed by mistake goes to the discards.
const discardMonsterCard = (state, monster) =>
  monster.cardId && state.monsterDeck
    ? { ...state, monsterDeck: { ...state.monsterDeck, discard: [...state.monsterDeck.discard, monster.cardId] } }
    : state

// One monster attack against one or more heroes. Each target comes with the d20 the
// device rolled for it. A hit deals the damage and conditions; a miss deals the miss damage.
function monsterAttack(state, action) {
  const monster = state.monsters.find((m) => m.id === action.monsterId)
  const attack = monster?.card?.attacks.find((a) => a.id === action.attackId)
  let targets = (Array.isArray(action.targets) ? action.targets : []).filter(
    (t) => state.heroes.some((h) => h.id === t.heroId) && validRoll(t.roll),
  )
  if (!attack || targets.length === 0) return state

  let next = state
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
    const ac = heroAc(hero)
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
    results.push({ heroId: hero.id, value: roll, total, ac, hit, dealt: hero.hp - hp, miss: attack.miss, conditions })
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
  // Remembered so Tumbling Escape can turn a hit into a miss.
  next = { ...next, turn: { ...next.turn, lastMonsterAttack: { monsterId: monster.id, attackId: attack.id, results } } }
  for (const name of downed) next = withLog(next, `${name} is down!`)
  return withMoment(next, {
    kind: downed.length > 0 ? 'monster-down' : 'monster',
    monsterId: monster.id,
    title: `${monster.name}: ${attack.name}!`,
    detail: downed.length > 0 ? `${downed.join(' and ')} ${downed.length > 1 ? 'are' : 'is'} down!` : '',
    rolls,
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
function hurtMonster(state, monster, dealt) {
  const hp = dealt > 0 ? damageMonster(monster, dealt) : monster.hp
  if (hp > 0) return { state: updateMonster(state, monster.id, () => ({ hp })), defeated: false }
  const next = { ...state, xp: state.xp + monster.xp, monsters: state.monsters.filter((m) => m.id !== monster.id) }
  return { state: withLog(next, `The ${monster.name} was defeated! +${monster.xp} XP`), defeated: true }
}

// The first monster defeated in a turn earns a treasure card. Returns the moment's words.
function defeatDetails(state, defeated) {
  if (defeated.length === 0) return { state, details: [] }
  const treasure = !state.turn.treasureDrawn
  const next = treasure ? { ...state, turn: { ...state.turn, treasureDrawn: true } } : state
  const xp = defeated.reduce((sum, m) => sum + m.xp, 0)
  return {
    state: next,
    details: [`${defeated.map((m) => m.name).join(' and ')} defeated! +${xp} XP`, treasure && 'Draw a treasure card!'].filter(Boolean),
  }
}

const markUsed = (state, heroId, powerId) =>
  updateHero(state, heroId, (h) => ({ powers: h.powers.map((p) => (p.id === powerId ? { ...p, used: true } : p)) }))

// Heals a hero (never past max HP) and logs it.
function healHero(state, heroId, amount, source) {
  const hero = state.heroes.find((h) => h.id === heroId)
  if (!hero || amount <= 0) return state
  const hp = Math.min(hero.maxHp, hero.hp + amount)
  if (hp === hero.hp) return withLog(state, `${hero.name} is already at full HP.`)
  return withLog(updateHero(state, hero.id, () => ({ hp })), `${hero.name} regained ${hp - hero.hp} HP from ${source}.`)
}

const validRoll = (roll) => Number.isInteger(roll) && roll >= 1 && roll <= 20

// One attack roll's sums. The parts that don't depend on the die are worked out once per attack.
function rollAgainst(monster, roll, attack) {
  const total = roll + attack.bonus
  const hit = total >= monster.ac
  const extra = hit && attack.evenBonus && roll % 2 === 0 ? attack.evenBonus : 0
  const damage = attack.damage + extra
  const dealt = hit ? damage : attack.miss
  const outcome = hit ? (damage > 0 ? `Hit! ${damage} damage` : 'Hit!') : attack.miss > 0 ? `Miss, but ${attack.miss} damage` : 'Miss!'
  return { total, hit, dealt, outcome }
}

// A hero attacks one or more monsters with a power. Each target comes with the d20 the
// device rolled. Monsters brought to 0 HP are defeated, and a daily power is used up.
// The power's own effects (powerEffects.js) are applied here too.
function heroAttack(state, action) {
  const hero = state.heroes.find((h) => h.id === action.heroId)
  const power = hero?.powers.find((p) => p.id === action.powerId)
  const effects = effectsOf(power)
  // Cause Fear and Acrobatic Onslaught hand out an extra at-will attack.
  const bonusAttacks = state.turn.bonusAttacks ?? []
  const extraAttack = action.bonusAttack ? bonusAttacks.find((b) => b.heroId === hero?.id) : null
  if (action.bonusAttack && (!extraAttack || power?.type !== 'at-will')) return state
  const baseBonus = powerNumber(power?.card?.attack)
  const targets = (Array.isArray(action.targets) ? action.targets : [])
    .filter((t) => state.monsters.some((m) => m.id === t.monsterId && m.ac) && validRoll(t.roll))
    .slice(0, maxRolls(power))
  if (!power || baseBonus === null || power.used || targets.length === 0) return state

  const adjacent = effects.ask === 'adjacent-count' ? clamp(Number(action.adjacentCount) || 0, 0, 8) : 0
  const attack = {
    bonus: baseBonus + (extraAttack?.bonus ?? 0) + adjacent,
    damage: (powerNumber(power.card.damage) ?? 0) + (effects.ask === 'started-adjacent' && action.startedAdjacent ? 1 : 0),
    // "3 (Miss: 1)": some powers still hurt on a miss.
    miss: powerNumber(/miss\D*(\d+)/i.exec(power.card.damage ?? '')?.[1]) ?? 0,
    evenBonus: effects.evenBonus ?? 0,
  }

  let next = state
  const rolls = []
  const defeated = []
  for (const { monsterId, roll } of targets) {
    const monster = next.monsters.find((m) => m.id === monsterId)
    if (!monster) {
      // Tornado Strike can aim a second roll at a monster the first one already beat.
      next = withLog(next, `${hero.name}'s ${power.name}: that monster was already defeated.`)
      continue
    }
    const result = rollAgainst(monster, roll, attack)
    rolls.push({ monsterId, label: monster.name, value: roll, total: result.total, ac: monster.ac, hit: result.hit, outcome: result.outcome, dealt: result.dealt })
    next = withLog(
      next,
      `${hero.name}'s ${power.name} vs the ${monster.name}: rolled ${roll} + ${attack.bonus} = ${result.total} against AC ${monster.ac}. ${result.outcome}`,
    )
    const hurt = hurtMonster(next, monster, result.dealt)
    next = hurt.state
    if (hurt.defeated) defeated.push(monster)
  }
  const anyHit = rolls.some((r) => r.hit)

  // A daily is used up, except Comeback Strike when it misses.
  if (power.type === 'daily' && (anyHit || !effects.keepOnMiss)) next = markUsed(next, hero.id, power.id)
  if (effects.onHit?.healSelf && anyHit) next = healHero(next, hero.id, effects.onHit.healSelf, power.name)

  let extras = extraAttack ? bonusAttacks.filter((b) => b !== extraAttack) : bonusAttacks
  if (effects.after === 'at-will') extras = [...extras, { heroId: hero.id, bonus: 0, source: power.name }]
  next = {
    ...next,
    turn: {
      ...next.turn,
      bonusAttacks: extras,
      // Remembered for Inspiring Advice, Furious Assault and the power's own follow-up question.
      lastAttack: { heroId: hero.id, powerId: power.id, attack, rolls, followUpDone: false, bonus: Boolean(extraAttack) },
    },
  }

  const natural20 = rolls.some((r) => r.value === 20)
  const canLevel = natural20 && hero.level === 1 && next.xp >= XP_TO_LEVEL_UP
  // A natural 20 on an attack is what lets a hero level up this turn.
  if (natural20) next = { ...next, turn: { ...next.turn, natural20: hero.id } }
  const won = defeatDetails(next, defeated)
  next = won.state
  return withMoment(next, {
    kind: natural20 ? 'crit' : defeated.length > 0 ? 'defeat' : 'roll',
    heroId: hero.id,
    title: `${hero.name}: ${power.name}!`,
    detail: [...won.details, canLevel && 'Natural 20! You can level up.'].filter(Boolean).join(' '),
    rolls,
  })
}

// Inspiring Advice: a hero who missed rolls again. The miss damage comes back off, and
// the advice card is only used up if the new roll hits.
function rerollAttack(state, action) {
  const last = state.turn.lastAttack
  const helper = state.heroes.find((h) => h.id === action.helperId)
  const advice = helper?.powers.find((p) => p.id === action.helperPowerId)
  const row = last?.rolls.find((r) => r.monsterId === action.monsterId && !r.hit && !r.rerolled)
  const monster = state.monsters.find((m) => m.id === action.monsterId)
  const hero = state.heroes.find((h) => h.id === last?.heroId)
  const power = hero?.powers.find((p) => p.id === last.powerId)
  if (!row || !monster || !advice || advice.used || effectsOf(advice).reaction !== 'reroll' || !validRoll(action.roll)) return state

  const before = { ...monster, hp: Math.min(monster.maxHp, monster.hp + row.dealt) }
  let next = updateMonster(state, monster.id, () => ({ hp: before.hp }))
  const result = rollAgainst(before, action.roll, last.attack)
  next = withLog(
    next,
    `${helper.name}'s Inspiring Advice: ${hero.name} rolled again, ${action.roll} + ${last.attack.bonus} = ${result.total} against AC ${monster.ac}. ${result.outcome}`,
  )
  const hurt = hurtMonster(next, before, result.dealt)
  next = hurt.state
  const rolls = last.rolls.map((r) => (r === row ? { ...r, value: action.roll, total: result.total, hit: result.hit, outcome: result.outcome, dealt: result.dealt, rerolled: true } : r))
  next = { ...next, turn: { ...next.turn, lastAttack: { ...last, rolls } } }
  if (result.hit) {
    next = markUsed(next, helper.id, advice.id)
    const effects = effectsOf(power)
    if (power.type === 'daily') next = markUsed(next, hero.id, power.id)
    if (effects.onHit?.healSelf && !last.rolls.some((r) => r.hit)) next = healHero(next, hero.id, effects.onHit.healSelf, power.name)
  }
  if (action.roll === 20) next = { ...next, turn: { ...next.turn, natural20: hero.id } }
  const won = defeatDetails(next, hurt.defeated ? [monster] : [])
  return withMoment(won.state, {
    kind: action.roll === 20 ? 'crit' : hurt.defeated ? 'defeat' : 'roll',
    heroId: hero.id,
    title: `Inspiring Advice: ${result.hit ? 'Hit!' : 'Missed again'}`,
    detail: won.details.join(' '),
    rolls: [{ monsterId: monster.id, label: monster.name, value: action.roll, total: result.total, ac: monster.ac, hit: result.hit, outcome: result.outcome }],
  })
}

// The question a power asks after its attack: who gets healed or shielded, or which
// monster goes to the next player. Answered once per attack.
function attackFollowUp(state, action) {
  const last = state.turn.lastAttack
  const hero = state.heroes.find((h) => h.id === action.heroId)
  const power = hero?.powers.find((p) => p.id === action.powerId)
  if (!last || last.followUpDone || last.heroId !== hero?.id || last.powerId !== power?.id) return state
  const effects = effectsOf(power)
  const heroIds = (Array.isArray(action.heroIds) ? action.heroIds : []).filter((id) => state.heroes.some((h) => h.id === id))
  let next = { ...state, turn: { ...state.turn, lastAttack: { ...last, followUpDone: true } } }

  if (effects.onHit?.heal && last.rolls.some((r) => r.hit) && heroIds.length === 1) {
    return healHero(next, heroIds[0], effects.onHit.heal, power.name)
  }
  if (effects.after === 'heal-tile' && heroIds.length > 0) {
    for (const id of heroIds) next = healHero(next, id, 1, power.name)
    return next
  }
  if (effects.after === 'shield' && heroIds.length === 1) {
    // Only one hero has Quinn's shield at a time: using the power again moves it.
    next = { ...next, heroes: next.heroes.map((h) => (h.shieldedBy === hero.id ? { ...h, shieldedBy: null } : h)) }
    next = updateHero(next, heroIds[0], () => ({ shieldedBy: hero.id }))
    const target = next.heroes.find((h) => h.id === heroIds[0])
    return withLog(next, `${target.name} has +2 AC from ${hero.name}'s Cleric's Shield.`)
  }
  if (effects.after === 'pass-monster') {
    const monster = state.monsters.find((m) => m.id === action.monsterId)
    if (!monster) return state
    // Turns go to the left, so the player on your right is the one who went before you.
    const index = state.heroes.indexOf(hero)
    const right = state.heroes[(index - 1 + state.heroes.length) % state.heroes.length]
    next = updateMonster(next, monster.id, () => ({ ownerId: right.id }))
    return withLog(next, `${hero.name}'s Wrathful Thunder sent the ${monster.name} to ${heroLabel(right)}.`)
  }
  return state
}

// Damage that isn't an attack roll: Furious Assault's +1, a Blade Barrier token, or the
// Flaming Sphere burning every monster on its tile.
function powerDamage(state, action) {
  const hero = state.heroes.find((h) => h.id === action.heroId)
  const monsters = (Array.isArray(action.monsterIds) ? action.monsterIds : [])
    .map((id) => state.monsters.find((m) => m.id === id))
    .filter(Boolean)
  if (!hero || monsters.length === 0) return state
  const tokens = hero.tokens ?? {}
  let next = state
  let source
  if (action.source === 'furious') {
    const power = hero.powers.find((p) => p.id === action.powerId)
    const last = state.turn.lastAttack
    const hit = last?.heroId === hero.id && last.rolls.some((r) => r.hit && r.monsterId === monsters[0].id)
    if (!power || power.used || effectsOf(power).reaction !== 'furious' || !hit || monsters.length !== 1) return state
    next = markUsed(next, hero.id, power.id)
    source = 'Furious Assault'
  } else if (action.source === 'bladeBarrier' && tokens.bladeBarrier > 0 && monsters.length === 1) {
    next = updateHero(next, hero.id, (h) => ({ tokens: { ...h.tokens, bladeBarrier: h.tokens.bladeBarrier - 1 } }))
    source = 'a Blade Barrier'
  } else if (action.source === 'flamingSphere' && tokens.flamingSphere > 0 && !state.turn.sphereBurned) {
    next = updateHero(next, hero.id, (h) => ({ tokens: { ...h.tokens, flamingSphere: h.tokens.flamingSphere - 1 } }))
    next = { ...next, turn: { ...next.turn, sphereBurned: true } }
    source = 'the Flaming Sphere'
  } else {
    return state
  }
  const defeated = []
  for (const monster of monsters) {
    next = withLog(next, `The ${monster.name} took 1 damage from ${source}.`)
    const hurt = hurtMonster(next, monster, 1)
    next = hurt.state
    if (hurt.defeated) defeated.push(monster)
  }
  const won = defeatDetails(next, defeated)
  return withMoment(won.state, {
    kind: defeated.length > 0 ? 'defeat' : 'roll',
    heroId: hero.id,
    title: `${source[0].toUpperCase()}${source.slice(1)}: 1 damage!`,
    detail: won.details.join(' '),
  })
}

// A power used from its tile: healing, tokens, ending a condition, and so on.
function usePower(state, action) {
  const hero = state.heroes.find((h) => h.id === action.heroId)
  const power = hero?.powers.find((p) => p.id === action.powerId)
  const use = effectsOf(power).use
  if (!power || power.used || !use) return state
  const heroIds = (Array.isArray(action.heroIds) ? action.heroIds : []).filter((id) => state.heroes.some((h) => h.id === id))
  const picked = heroIds[0] && state.heroes.find((h) => h.id === heroIds[0])
  if (use.pick && !picked && !use.optional) return state
  if (use.pick === 'other' && picked?.id === hero.id) return state

  let next = power.type === 'at-will' ? state : markUsed(state, hero.id, power.id)
  next = withLog(next, `${heroLabel(hero)} used ${power.name}.`)
  if (use.healSelf) next = healHero(next, hero.id, use.healSelf, power.name)
  if (use.heal && picked) next = healHero(next, picked.id, use.heal, power.name)
  if (use.tokens) next = updateHero(next, hero.id, (h) => ({ tokens: { ...h.tokens, ...use.tokens } }))
  if (use.invisible) next = updateHero(next, hero.id, (h) => ({ tokens: { ...h.tokens, invisible: true } }))
  if (use.refuge) {
    next = updateHero(next, picked.id, (h) => ({ tokens: { ...h.tokens, refuge: true } }))
    next = withLog(next, `${picked.name} is safe in the Astral Refuge until their next turn.`)
  }
  if (use.endCondition) {
    if (!picked.conditions.includes(action.condition)) return state
    next = updateHero(next, picked.id, (h) => ({ conditions: h.conditions.filter((c) => c !== action.condition) }))
    next = withLog(next, `${picked.name} is no longer ${action.condition}.`)
  }
  if (use.causeFear) {
    const extras = heroIds.filter((id) => id !== hero.id).map((heroId) => ({ heroId, bonus: 2, source: power.name }))
    next = { ...next, turn: { ...next.turn, bonusAttacks: [...(next.turn.bonusAttacks ?? []), ...extras] } }
  }
  return next
}

// Tumbling Escape: the monster's hit becomes a miss. The damage and conditions come back
// off, and the attack's miss damage (if any) is dealt instead.
function dodgeHit(state, action) {
  const last = state.turn.lastMonsterAttack
  const hero = state.heroes.find((h) => h.id === action.heroId)
  const power = hero?.powers.find((p) => p.id === action.powerId)
  const row = last?.results.find((r) => r.heroId === hero?.id && r.hit && !r.dodged)
  if (!row || !power || power.used || effectsOf(power).reaction !== 'dodge') return state
  let next = markUsed(state, hero.id, power.id)
  next = updateHero(next, hero.id, (h) => ({
    hp: clamp(h.hp + row.dealt - row.miss, 0, h.maxHp),
    conditions: h.conditions.filter((c) => !row.conditions.includes(c)),
  }))
  const results = last.results.map((r) => (r === row ? { ...r, dodged: true } : r))
  next = { ...next, turn: { ...next.turn, lastMonsterAttack: { ...last, results } } }
  return withLog(next, `${hero.name} used Tumbling Escape: the attack misses!${row.miss > 0 ? ` (${row.miss} miss damage)` : ''} Put ${hero.name} on a tile within 1 tile.`)
}

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

// Poison hurts at the start of the poisoned hero's turn.
function startTurn(state) {
  const hero = state.heroes[state.turn.heroIndex]
  state = returnFromPowers(state, hero)
  if (!hero?.conditions.includes('Poisoned') || hero.hp === 0) return state
  const hp = hero.hp - 1
  const next = withLog(updateHero(state, hero.id, () => ({ hp })), `${hero.name} took 1 poison damage.`)
  return withMoment(next, {
    kind: hp === 0 ? 'down' : 'poison',
    heroId: hero.id,
    title: hp === 0 ? `${hero.name} is down!` : `${hero.name} takes 1 poison damage`,
    detail: hp === 0 ? 'Spend a healing surge to get back up.' : 'Roll 10 or more after your Hero Phase to shake it off.',
  })
}

// After the Hero Phase, Dazed wears off and a poisoned hero rolls (the device sends
// the d20 with the action) to shake off the poison on a 10 or more.
function endHeroPhase(state, hero, roll) {
  if (!hero) return state
  let next = state
  if (hero.conditions.includes('Dazed')) {
    next = withLog(
      updateHero(next, hero.id, (h) => ({ conditions: h.conditions.filter((c) => c !== 'Dazed') })),
      `${hero.name} is no longer Dazed.`,
    )
  }
  if (!hero.conditions.includes('Poisoned') || !Number.isInteger(roll) || roll < 1 || roll > 20) return next
  const cured = roll >= 10
  if (cured) next = updateHero(next, hero.id, (h) => ({ conditions: h.conditions.filter((c) => c !== 'Poisoned') }))
  next = withLog(next, `${hero.name} rolled ${roll} against the poison${cured ? ' and shook it off!' : '. Still poisoned.'}`)
  return withMoment(next, {
    kind: 'poison',
    heroId: hero.id,
    value: roll,
    title: cured ? 'Poison gone!' : 'Still poisoned',
    detail: `${hero.name} needed 10 or more.`,
  })
}

// Each hero card names one power the hero always has (Keyleth's Lay on Hands, Tarak's
// Furious Assault), plus 1 utility, 2 at-wills, and 1 daily to choose. Most fixed powers
// are utilities. A template sets its own `powerSlots` when its fixed power is another
// type (Heskan's Hurled Breath and Vistra's Dwarven Resilience are dailies).
export const STARTING_POWER_SLOTS = ['at-will', 'at-will', 'utility', 'utility', 'daily']

export const powerSlotsFor = (template) => template.powerSlots ?? STARTING_POWER_SLOTS

// The card is copied into the game, so later edits to the card file don't change a game in progress.
const copyCard = (card) =>
  card
    ? {
        id: String(card.id),
        name: String(card.name),
        text: String(card.text ?? ''),
        attack: card.attack ? String(card.attack) : '',
        damage: card.damage ? String(card.damage) : '',
      }
    : null

const updateClaim = (state, deviceId, change) => ({
  ...state,
  lobby: (state.lobby ?? []).map((claim) => (claim.deviceId === deviceId ? { ...claim, ...change(claim) } : claim)),
})

// Turns the lobby into heroes, in the order they were claimed.
// Fills a new hero's power slots with picked cards, in slot order.
const withPicks = (hero, picks = []) => ({
  ...hero,
  powers: hero.powers.map((power, i) => {
    const card = copyCard(picks[i])
    return card ? { ...power, name: card.name, card } : power
  }),
})

// True when another slot already holds this card, so no hero gets the same power twice.
const pickedElsewhere = (cards, slot, card) => Boolean(card) && cards.some((c, i) => i !== slot && c?.id === card.id)

function heroesFromLobby(lobby) {
  return lobby.flatMap((claim) => {
    const template = HERO_TEMPLATES.find((t) => t.key === claim.heroKey)
    if (!template) return []
    return [{ ...withPicks(createHero(template), claim.picks), player: claim.player }]
  })
}

const POWER_LABELS = { 'at-will': 'At-will power', utility: 'Utility power', daily: 'Daily power' }

const newPower = (type, name = POWER_LABELS[type] ?? 'Power') => ({ id: newId('power'), type, name, used: false, card: null })

export function createHero(template, overrides = {}) {
  const hero = { ...template, ...overrides }
  return {
    id: newId('hero'),
    key: hero.key,
    name: hero.name,
    className: hero.className,
    color: hero.color,
    maxHp: hero.maxHp,
    hp: hero.maxHp,
    ac: hero.ac,
    surgeValue: hero.surgeValue,
    speed: hero.speed,
    level: 1,
    conditions: [],
    // Power tokens (Mirror Image, Blade Barrier, Flaming Sphere) and markers (invisible, refuge).
    tokens: {},
    shieldedBy: null, // the cleric whose Cleric's Shield gives this hero +2 AC
    powers: powerSlotsFor(hero).map((type) => newPower(type)),
  }
}

export function gameReducer(state, action) {
  switch (action.type) {
    case 'NEW_GAME':
      return initialState

    case 'START_GAME': {
      // Without a hero list, the heroes come from the lobby.
      // Everyone in the lobby has to be ready first.
      if (!action.heroes && !(state.lobby ?? []).every((c) => c.ready)) return state
      const heroes = action.heroes ?? heroesFromLobby(state.lobby ?? [])
      if (state.status !== 'setup' || heroes.length === 0) return state
      const started = { ...initialState, status: 'playing', heroes }
      return withLog(started, `The adventure begins with ${heroes.map((h) => h.name).join(', ')}.`)
    }

    case 'CLAIM_HERO': {
      const template = HERO_TEMPLATES.find((t) => t.key === action.heroKey)
      const lobby = state.lobby ?? []
      if (state.status !== 'setup' || !template || !action.deviceId) return state
      // One hero per iPad, and nobody can take a hero another iPad already has.
      if (lobby.some((c) => c.heroKey === template.key && c.deviceId !== action.deviceId)) return state
      const previous = lobby.find((c) => c.deviceId === action.deviceId)
      const slots = powerSlotsFor(template)
      const picks = slots.map((_, i) => copyCard(action.picks?.[i]))
      const claim = { deviceId: action.deviceId, heroKey: template.key, player: previous?.player ?? '', picks, ready: false }
      return { ...state, lobby: [...lobby.filter((c) => c.deviceId !== action.deviceId), claim] }
    }

    case 'RELEASE_HERO':
      return { ...state, lobby: (state.lobby ?? []).filter((c) => c.deviceId !== action.deviceId) }

    case 'SET_LOBBY_PLAYER':
      return updateClaim(state, action.deviceId, (claim) => {
        const player = String(action.player ?? '').slice(0, 40)
        // A player can't stay ready without a name; the turn screens greet them by it.
        return { player, ready: claim.ready && player.trim() !== '' }
      })

    case 'SET_LOBBY_PICK': {
      const claim = (state.lobby ?? []).find((c) => c.deviceId === action.deviceId)
      if (claim && pickedElsewhere(claim.picks, action.slot, action.card)) return state
      return updateClaim(state, action.deviceId, (claim) => ({
        picks: claim.picks.map((card, i) => (i === action.slot ? copyCard(action.card) : card)),
        ready: false,
      }))
    }

    case 'SET_LOBBY_READY':
      return updateClaim(state, action.deviceId, (claim) => ({ ready: Boolean(action.ready) && claim.player.trim() !== '' }))

    case 'START_DEMO': {
      // A game already in progress, for trying features without setting one up:
      // every hero, a few monsters, some XP, and a hero with a condition.
      // `picks` gives each hero's starting cards by hero key (the rulebook's suggestions).
      const heroes = HERO_TEMPLATES.map((t) => ({ ...withPicks(createHero(t), action.picks?.[t.key]), player: '' }))
      heroes[1] = { ...heroes[1], hp: heroes[1].maxHp - 3 }
      heroes[3] = { ...heroes[3], conditions: ['Poisoned'] }
      const monster = (name, hp, xp, owner) => ({
        id: newId('monster'), name, maxHp: hp, hp, xp, ownerId: heroes[owner].id, conditions: [],
      })
      let demo = {
        ...initialState,
        status: 'playing',
        heroes,
        monsters: [monster('Kobold Dragonshield', 2, 1, 0), monster('Orc Smasher', 2, 2, 2), monster('Grell', 2, 2, 4)],
        xp: 3,
        turn: { ...initialState.turn, round: 2 },
      }
      // With monster cards, the demo's monsters come off the virtual deck instead.
      if (action.monsterCards?.length > 0) {
        demo = { ...demo, monsters: [], monsterDeck: buildMonsterDeck(action.monsterCards, action.random) }
        for (const owner of [0, 2, 4]) demo = drawMonster(demo, heroes[owner].id, action.random)
        demo = { ...demo, log: [], moment: null }
      }
      return withLog(demo, 'A demo game begins. Nothing here is your real game.')
    }

    case 'ADJUST_HP': {
      const hero = state.heroes.find((h) => h.id === action.heroId)
      if (!hero) return state
      const next = updateHero(state, hero.id, (h) => ({ hp: clamp(h.hp + action.amount, 0, h.maxHp) }))
      if (hero.hp === 0 || next.heroes.find((h) => h.id === hero.id).hp !== 0) return next
      return withMoment(withLog(next, `${hero.name} is down!`), {
        kind: 'down',
        heroId: hero.id,
        title: `${hero.name} is down!`,
        detail: state.surges > 0 ? 'Spend a healing surge at the start of your turn.' : 'No healing surges left!',
      })
    }

    case 'ROLL_DIE': {
      const value = Number(action.value)
      if (!Number.isInteger(value) || value < 1 || value > 20) return state
      const hero = state.heroes.find((h) => h.id === action.heroId)
      const who = hero ? heroLabel(hero) : 'Someone'
      const kind = value === 20 ? 'crit' : value === 1 ? 'fumble' : 'roll'
      const title = kind === 'crit' ? 'NATURAL 20!' : kind === 'fumble' ? 'Oops… a 1' : `${who} rolled ${value}`
      return withMoment(withLog(state, `${who} rolled a ${value}.`), {
        kind,
        heroId: hero?.id ?? null,
        value,
        title,
        detail: kind === 'crit' ? `${who} rolled a critical hit!` : kind === 'fumble' ? `${who} rolled a 1.` : '',
      })
    }

    case 'USE_SURGE': {
      const hero = state.heroes.find((h) => h.id === action.heroId)
      if (!hero) return state
      if (state.surges <= 0) {
        return withLog({ ...state, status: 'lost' }, `${hero.name} fell with no healing surges left.`)
      }
      const healed = updateHero({ ...state, surges: state.surges - 1 }, hero.id, (h) => ({
        hp: Math.min(h.maxHp, h.surgeValue),
      }))
      return withLog(healed, `${hero.name} used a healing surge.`)
    }

    case 'TOGGLE_POWER':
      return updateHero(state, action.heroId, (hero) => ({
        powers: hero.powers.map((p) =>
          p.id === action.powerId && p.type !== 'at-will' ? { ...p, used: !p.used } : p,
        ),
      }))

    case 'SET_POWER_CARD': {
      const hero = state.heroes.find((h) => h.id === action.heroId)
      const slot = hero?.powers.findIndex((p) => p.id === action.powerId)
      if (hero && pickedElsewhere(hero.powers.map((p) => p.card), slot, action.card)) return state
      const card = copyCard(action.card)
      return updateHero(state, action.heroId, (hero) => ({
        powers: hero.powers.map((p) =>
          p.id === action.powerId ? { ...p, card, name: card ? card.name : POWER_LABELS[p.type] ?? 'Power' } : p,
        ),
      }))
    }

    case 'RENAME_POWER':
      return updateHero(state, action.heroId, (hero) => ({
        powers: hero.powers.map((p) => (p.id === action.powerId ? { ...p, name: action.name } : p)),
      }))

    case 'ADD_POWER':
      return updateHero(state, action.heroId, (hero) => ({
        powers: [...hero.powers, newPower(action.powerType, action.name)],
      }))

    case 'TOGGLE_HERO_CONDITION':
      return updateHero(state, action.heroId, (hero) => ({ conditions: toggle(hero.conditions, action.condition) }))

    case 'LEVEL_UP': {
      const hero = state.heroes.find((h) => h.id === action.heroId)
      if (!hero || hero.level >= 2 || state.xp < XP_TO_LEVEL_UP || state.turn.natural20 !== hero.id) return state
      const leveled = updateHero({ ...state, xp: state.xp - XP_TO_LEVEL_UP }, hero.id, (h) => ({
        level: 2,
        maxHp: h.maxHp + LEVEL_UP_HP_BONUS,
        hp: h.hp + LEVEL_UP_HP_BONUS,
        ac: h.ac + LEVEL_UP_AC_BONUS,
        surgeValue: h.surgeValue + LEVEL_UP_SURGE_BONUS,
        powers: [...h.powers, newPower('daily')],
      }))
      return withMoment(withLog(leveled, `${hero.name} reached level 2!`), {
        kind: 'level',
        heroId: hero.id,
        title: `${hero.name} reached level 2!`,
        detail: 'Flip your hero card and choose another daily power!',
      })
    }

    case 'ADD_MONSTER': {
      const monster = {
        id: newId('monster'),
        name: action.name,
        maxHp: action.hp,
        hp: action.hp,
        xp: action.xp,
        ownerId: action.ownerId,
        conditions: [],
      }
      return withLog({ ...state, monsters: [...state.monsters, monster] }, `${monster.name} appeared!`)
    }

    case 'DRAW_MONSTER': {
      // The deck is built from the card file the first time anyone draws.
      const withDeck = state.monsterDeck ? state : { ...state, monsterDeck: buildMonsterDeck(action.cards, action.random) }
      return drawMonster(withDeck, action.heroId, action.random)
    }

    case 'MONSTER_ATTACK':
      return monsterAttack(state, action)

    case 'HERO_ATTACK':
      return heroAttack(state, action)

    case 'REROLL_ATTACK':
      return rerollAttack(state, action)

    case 'ATTACK_FOLLOW_UP':
      return attackFollowUp(state, action)

    case 'POWER_DAMAGE':
      return powerDamage(state, action)

    case 'USE_POWER':
      return usePower(state, action)

    case 'DODGE_HIT':
      return dodgeHit(state, action)

    case 'ATTACH_MONSTER_CARDS': {
      // Monsters added before the deck existed get their card, so they can take guided
      // turns and be attacked against their AC. Matched by name.
      const cards = Array.isArray(action.cards) ? action.cards : []
      let changed = false
      const monsters = state.monsters.map((monster) => {
        const card = !monster.card && cards.find((c) => c.name.toLowerCase() === monster.name.toLowerCase())
        if (!card) return monster
        changed = true
        const { id, hp, maxHp, ownerId, conditions } = monster
        return { ...monsterFromCard(card, ownerId), id, hp: Math.min(hp, card.hp * (card.figures ?? 1)), maxHp: Math.max(maxHp, card.hp), conditions }
      })
      return changed ? { ...state, monsters } : state
    }

    case 'SET_EXPLORED': {
      // The Exploration Phase's question: is the hero on an unexplored edge? With no
      // new tile the phase is over, and the Villain Phase knows to draw an encounter.
      if (PHASES[state.turn.phase]?.key !== 'exploration') return state
      const explored = Boolean(action.explored)
      return { ...state, turn: { ...state.turn, explored, phase: explored ? state.turn.phase : state.turn.phase + 1 } }
    }

    case 'ADJUST_MONSTER_HP':
      return updateMonster(state, action.monsterId, (m) => ({ hp: clamp(m.hp + action.amount, 0, m.maxHp) }))

    case 'TOGGLE_MONSTER_CONDITION':
      return updateMonster(state, action.monsterId, (m) => ({ conditions: toggle(m.conditions, action.condition) }))

    case 'DEFEAT_MONSTER': {
      const monster = state.monsters.find((m) => m.id === action.monsterId)
      if (!monster) return state
      // One treasure card per turn, for the first monster defeated.
      const treasure = !state.turn.treasureDrawn
      const next = {
        ...state,
        xp: state.xp + monster.xp,
        monsters: state.monsters.filter((m) => m.id !== monster.id),
        turn: { ...state.turn, treasureDrawn: true },
      }
      return withMoment(withLog(next, `The ${monster.name} was defeated! +${monster.xp} XP`), {
        kind: 'defeat',
        title: `${monster.name} defeated!`,
        detail: `+${monster.xp} XP for the party${treasure ? '. Draw a treasure card!' : ''}`,
      })
    }

    case 'REMOVE_MONSTER': {
      const monster = state.monsters.find((m) => m.id === action.monsterId)
      if (!monster) return state
      return discardMonsterCard({ ...state, monsters: state.monsters.filter((m) => m.id !== monster.id) }, monster)
    }

    case 'ADJUST_XP':
      return { ...state, xp: Math.max(0, state.xp + action.amount) }

    case 'CANCEL_ENCOUNTER': {
      // Perseverance takes 1 XP off the cost for each hero on Quinn's tile.
      const p = action.perseverance
      const hero = p && state.heroes.find((h) => h.id === p.heroId)
      const power = hero?.powers.find((x) => x.id === p.powerId)
      const helps = power && !power.used && effectsOf(power).reaction === 'perseverance'
      const cost = helps ? Math.max(0, XP_TO_CANCEL_ENCOUNTER - clamp(Number(p.heroesOnTile) || 0, 1, state.heroes.length)) : XP_TO_CANCEL_ENCOUNTER
      if (state.xp < cost || (p && !helps)) return state
      const next = helps ? markUsed(state, hero.id, power.id) : state
      return withLog({ ...next, xp: next.xp - cost }, `Spent ${cost} XP to cancel an encounter${helps ? ' with Perseverance' : ''}.`)
    }

    case 'ADJUST_SURGES':
      return { ...state, surges: Math.max(0, state.surges + action.amount) }

    case 'NEXT_PHASE': {
      const { heroIndex, phase, round } = state.turn
      if (phase < PHASES.length - 1) {
        const next = { ...state, turn: { ...state.turn, phase: phase + 1 } }
        return PHASES[phase].key === 'hero' ? endHeroPhase(next, state.heroes[heroIndex], action.roll) : next
      }
      const nextIndex = (heroIndex + 1) % state.heroes.length
      return startTurn({
        ...state,
        turn: { heroIndex: nextIndex, phase: 0, round: nextIndex === 0 ? round + 1 : round },
      })
    }

    case 'PREVIOUS_PHASE': {
      const { heroIndex, phase, round } = state.turn
      if (phase > 0) return { ...state, turn: { ...state.turn, phase: phase - 1 } }
      if (heroIndex === 0 && round === 1) return state
      const prevIndex = (heroIndex - 1 + state.heroes.length) % state.heroes.length
      return {
        ...state,
        turn: { heroIndex: prevIndex, phase: PHASES.length - 1, round: prevIndex === state.heroes.length - 1 ? round - 1 : round },
      }
    }

    case 'END_GAME':
      return withLog({ ...state, status: action.result }, action.result === 'won' ? 'Victory!' : 'The party was defeated.')

    case 'RESUME':
      return { ...state, status: 'playing' }

    default:
      return state
  }
}
