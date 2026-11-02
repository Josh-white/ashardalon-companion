// A hero attacking: the attack numbers, the roll against the monster's AC, rerolls,
// follow-ups, power damage and the powers that dodge a hit. The reducer is in game.js.
import { XP_TO_LEVEL_UP, hasAbility, levelCrits } from '../data/heroes.js'
import { attackItems, heroItems, itemAttackParts } from '../data/items.js'
import { hasSecondChance } from '../data/difficulty.js'
import { effectsOf, maxRolls, shadowAfter, shadowKept } from '../data/powerEffects.js'
import { queueFearMove, queueMoves } from '../board/powerMoves.js'
import { clamp, findFoe, foes, heroLabel, markUsed, updateHero, updateMonster, validRoll, withCast, withLog, withMoment } from './gameHelpers.js'
import { spendItem } from './treasureDeck.js'
import { applyPasses, heroOnRight, thunderPass } from './passMonsters.js'
import { defeatDetails, healHero, hurtMonster, offerBrutalRecovery, powerNumber, rollAgainst } from './combat.js'
import { canSpendAttack, inHeroPhase, itemAttackIsMove, powerUsesAttack, removeCurse, spendAttack } from './heroTurn.js'

// One attack's numbers against a monster at this distance, with where each comes from so the
// attack box can show the sum: { bonus, damage, miss, evenBonus, crits, parts }. parts.bonus and
// parts.damage are [{ label, value }]; parts.crits are [{ label, from }] (+1 damage on a high roll).
export function attackNumbers(hero, { item = null, power = null, extraAttack = null, adjacentCount = 0, startedAdjacent = false, distance, stayed = false } = {}) {
  const effects = effectsOf(power)
  const source = item ?? power
  const bonusParts = [{ label: source.name, value: item ? item.card.attack.bonus : powerNumber(power.card?.attack) ?? 0 }]
  if (extraAttack?.bonus) bonusParts.push({ label: extraAttack.source, value: extraAttack.bonus })
  const adjacent = effects.ask === 'adjacent-count' ? clamp(Number(adjacentCount) || 0, 0, 8) : 0
  if (adjacent) bonusParts.push({ label: adjacent === 1 ? '1 monster next to you' : `${adjacent} monsters next to you`, value: adjacent })
  if (effects.shadowBonus && hero.tokens?.shadow) bonusParts.push({ label: 'From the shadows', value: effects.shadowBonus })
  for (const buff of hero.buffs ?? []) if (buff.attack) bonusParts.push({ label: buff.source, value: buff.attack })
  for (const curse of hero.curses ?? []) if (curse.card?.attackPenalty) bonusParts.push({ label: curse.name, value: -curse.card.attackPenalty })
  const damageParts = [{ label: source.name, value: item ? item.card.attack.damage : powerNumber(power.card?.damage) ?? 0 }]
  if (effects.ask === 'started-adjacent' && startedAdjacent) damageParts.push({ label: 'Started next to it', value: 1 })
  const items = itemAttackParts(hero, distance, stayed)
  if (items.attack) bonusParts.push(items.attack)
  damageParts.push(...items.damage)
  const crits = [...items.crits, ...levelCrits(hero)]
  const total = (parts) => parts.reduce((n, p) => n + p.value, 0)
  return {
    bonus: total(bonusParts),
    damage: total(damageParts),
    // "3 (Miss: 1)": some powers still hurt on a miss.
    miss: item ? 0 : powerNumber(/miss\D*(\d+)/i.exec(power.card?.damage ?? '')?.[1]) ?? 0,
    evenBonus: effects.evenBonus ?? 0,
    // Dragontooth Pick, Vorpal Sword and Critical Hit at level 2.
    crits: crits.map((c) => c.from),
    parts: { bonus: bonusParts, damage: damageParts, crits },
  }
}

// A hero attacks one or more monsters with a power or an item (Crossbow of Speed). Each
// target comes with the d20 the device rolled. Monsters brought to 0 HP are defeated, and
// a daily power is used up. The power's own effects (powerEffects.js) and the hero's
// items (items.js) are applied here too.
export function heroAttack(state, action) {
  const hero = state.heroes.find((h) => h.id === action.heroId)
  const item = action.itemId ? attackItems(hero, state.turn).find((i) => i.id === action.itemId) : null
  const power = item ? null : hero?.powers.find((p) => p.id === action.powerId)
  const source = item ?? power
  const effects = effectsOf(power)
  // Items whose own attack isn't the hero's attack: the Throwing Shield and Ring of Shooting
  // Stars say so, and the Crossbow of Speed fires instead of moving.
  const itemMove = Boolean(item) && itemAttackIsMove(item.card)
  const freeAttack = Boolean(effects.free || item?.card.freeAttack || itemMove || /not count as an attack action/i.test(item?.card.text ?? ''))
  // Cause Fear and Acrobatic Onslaught hand out an extra at-will attack.
  const bonusAttacks = state.turn.bonusAttacks ?? []
  const extraAttack = action.bonusAttack ? bonusAttacks.find((b) => b.heroId === hero?.id) : null
  if (action.bonusAttack && (!extraAttack || power?.type !== 'at-will')) return state
  const baseBonus = item ? item.card.attack.bonus : powerNumber(power?.card?.attack)
  const targets = (Array.isArray(action.targets) ? action.targets : [])
    .filter((t) => foes(state).some((m) => m.id === t.monsterId && m.ac) && validRoll(t.roll))
    // Hypnotism never hurts the monster it moved.
    .filter((t) => effects.ask !== 'moved-monster' || t.monsterId !== action.movedId)
    .slice(0, item ? 1 : maxRolls(power))
  if (!source || baseBonus === null || power?.used || targets.length === 0) return state

  // Magic weapons add to rolls against monsters close enough, so each target can differ.
  const distances = action.distances && typeof action.distances === 'object' ? action.distances : {}
  const numbers = (monsterId) =>
    attackNumbers(hero, {
      item,
      power,
      extraAttack,
      adjacentCount: action.adjacentCount,
      startedAdjacent: action.startedAdjacent,
      distance: distances[monsterId],
      stayed: action.stayed === true,
    })
  const attack = numbers(null)

  let next = state
  const rolls = []
  const defeated = []
  for (const { monsterId, roll } of targets) {
    const monster = findFoe(next, monsterId)
    if (!monster) {
      // Tornado Strike can aim a second roll at a monster the first one already beat.
      next = withLog(next, `${hero.name}'s ${source.name}: that monster was already defeated.`)
      continue
    }
    const rowAttack = numbers(monsterId)
    const result = rollAgainst(monster, roll, rowAttack)
    rolls.push({ monsterId, label: monster.name, value: roll, total: result.total, ac: monster.ac, hit: result.hit, outcome: result.outcome, dealt: result.dealt, attack: rowAttack })
    next = withLog(
      next,
      `${hero.name}'s ${source.name} vs the ${monster.name}: rolled ${roll} + ${rowAttack.bonus} = ${result.total} against AC ${monster.ac}. ${result.outcome}`,
    )
    const hurt = hurtMonster(next, monster, result.dealt)
    next = hurt.state
    if (hurt.defeated) defeated.push(monster)
  }
  const anyHit = rolls.some((r) => r.hit)

  // A daily is used up, except Comeback Strike when it misses. Ring of Shooting Stars flips over.
  if (power?.type === 'daily' && (anyHit || !(effects.keepOnMiss || shadowKept(hero, effects, true)))) next = markUsed(next, hero.id, power.id)
  if (item?.card.after) next = spendItem(next, hero.id, item.id)
  if (effects.onHit?.healSelf && anyHit) next = healHero(next, hero.id, effects.onHit.healSelf, power.name)
  if (effects.shadow) next = moveShadow(next, hero, effects, !anyHit)

  let extras = extraAttack ? bonusAttacks.filter((b) => b !== extraAttack) : bonusAttacks
  if (effects.after === 'at-will') extras = [...extras, { heroId: hero.id, bonus: 0, source: power.name }]
  next = {
    ...next,
    turn: {
      ...next.turn,
      bonusAttacks: extras,
      // Remembered for Inspiring Advice, Furious Assault and the power's own follow-up question.
      itemAttacks: item ? [...(next.turn.itemAttacks ?? []), item.id] : next.turn.itemAttacks,
      lastAttack: { heroId: hero.id, powerId: power?.id ?? null, itemId: item?.id ?? null, attack, rolls, followUpDone: false, bonus: Boolean(extraAttack), free: freeAttack },
    },
  }

  if (itemMove && state.board && inHeroPhase(state, hero)) next = { ...next, turn: { ...next.turn, boardMoves: (next.turn.boardMoves ?? 0) + 1 } }

  // On the virtual board a power that moves a hero waits for the player to pick the square.
  // Wrathful Thunder: on the virtual board the app picks the monster on the hero's tile and
  // passes its card, so there's no question after the attack.
  if (effects.after === 'pass-monster' && next.board) {
    const pass = thunderPass(next, hero.id)
    next = { ...next, turn: { ...next.turn, lastAttack: { ...next.turn.lastAttack, followUpDone: true } } }
    next = pass ? applyPasses(next, [pass], `${hero.name}'s ${power.name}`) : withLog(next, `${hero.name}'s ${power.name}: no monster on ${hero.name}'s tile to pass.`)
  }
  if (effects.board?.after) next = queueMoves(next, hero, power, effects.board.after, { attacked: targets.map((t) => t.monsterId), hit: anyHit })
  next = queueFearMove(next)

  // Bloodlust ends when the hero defeats a monster.
  const ending = defeated.length > 0 ? (hero.curses ?? []).filter((c) => c.card?.removeOnDefeat) : []
  for (const curse of ending) next = removeCurse(next, hero.id, curse.id, `${hero.name}'s ${curse.name} curse is over.`)
  const natural20 = rolls.some((r) => r.value === 20)
  const canLevel = natural20 && hero.level === 1 && next.xp >= XP_TO_LEVEL_UP
  // A natural 20 on an attack is what lets a hero level up this turn.
  if (natural20) next = offerBrutalRecovery({ ...next, turn: { ...next.turn, natural20: hero.id } })
  const won = defeatDetails(next, defeated, hero.id)
  next = won.state
  return withMoment(next, {
    kind: natural20 ? 'crit' : defeated.length > 0 ? 'defeat' : 'roll',
    heroId: hero.id,
    title: `${hero.name}: ${source.name}!`,
    detail: [...won.details, canLevel && 'Natural 20! You can level up.'].filter(Boolean).join(' '),
    rolls,
  })
}

// Inspiring Advice or a Lucky Charm: a hero who missed rolls again. The miss damage
// comes back off, and the advice card is only used up if the new roll hits. The charm
// is discarded either way.
export function rerollAttack(state, action) {
  const last = state.turn.lastAttack
  const helper = state.heroes.find((h) => h.id === action.helperId)
  const advice = action.helperItemId || action.secondChance ? null : helper?.powers.find((p) => p.id === action.helperPowerId)
  const charm = action.helperItemId ? heroItems(helper).find((i) => i.id === action.helperItemId && !i.used && i.card?.use === 'reroll') : null
  // Easy games: the hero who missed may roll again once per adventure.
  const second = Boolean(action.secondChance) && helper?.id === last?.heroId && hasSecondChance(state, helper)
  const row = last?.rolls.find((r) => r.monsterId === action.monsterId && !r.hit && !r.rerolled)
  const monster = findFoe(state, action.monsterId)
  const hero = state.heroes.find((h) => h.id === last?.heroId)
  const power = hero?.powers.find((p) => p.id === last.powerId)
  const helps = second || charm || (advice && !advice.used && effectsOf(advice).reaction === 'reroll')
  if (!row || !monster || !helps || !validRoll(action.roll)) return state

  const helpName = second ? `${helper.name}'s second chance` : charm ? `${helper.name}'s Lucky Charm` : `${helper.name}'s Inspiring Advice`
  const attack = row.attack ?? last.attack
  const before = { ...monster, hp: Math.min(monster.maxHp, monster.hp + row.dealt) }
  let next = updateMonster(state, monster.id, () => ({ hp: before.hp }))
  if (charm) next = spendItem(next, helper.id, charm.id)
  if (second) next = { ...next, secondChances: [...(next.secondChances ?? []), helper.id] }
  const result = rollAgainst(before, action.roll, attack)
  next = withLog(
    next,
    `${helpName}: ${hero.name} rolled again, ${action.roll} + ${attack.bonus} = ${result.total} against AC ${monster.ac}. ${result.outcome}`,
  )
  const hurt = hurtMonster(next, before, result.dealt)
  next = hurt.state
  const rolls = last.rolls.map((r) => (r === row ? { ...r, value: action.roll, total: result.total, hit: result.hit, outcome: result.outcome, dealt: result.dealt, rerolled: true } : r))
  next = { ...next, turn: { ...next.turn, lastAttack: { ...last, rolls } } }
  if (result.hit) {
    if (advice) next = markUsed(next, helper.id, advice.id)
    const effects = effectsOf(power)
    if (power?.type === 'daily') next = markUsed(next, hero.id, power.id)
    if (effects.onHit?.healSelf && !last.rolls.some((r) => r.hit)) next = healHero(next, hero.id, effects.onHit.healSelf, power.name)
  }
  if (action.roll === 20) next = offerBrutalRecovery({ ...next, turn: { ...next.turn, natural20: hero.id } })
  const won = defeatDetails(next, hurt.defeated ? [monster] : [], hero.id)
  return withMoment(won.state, {
    kind: action.roll === 20 ? 'crit' : hurt.defeated ? 'defeat' : 'roll',
    heroId: hero.id,
    title: `${second ? 'Second chance' : charm ? 'Lucky Charm' : 'Inspiring Advice'}: ${result.hit ? 'Hit!' : 'Missed again'}`,
    detail: won.details.join(' '),
    rolls: [{ monsterId: monster.id, label: monster.name, value: action.roll, total: result.total, ac: monster.ac, hit: result.hit, outcome: result.outcome }],
  })
}

// The question a power asks after its attack: who gets healed or shielded, or which
// monster goes to the next player. Answered once per attack.
export function attackFollowUp(state, action) {
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
    const right = heroOnRight(state, hero.id)
    if (!right) return state
    next = updateMonster(next, monster.id, () => ({ ownerId: right.id }))
    return withLog(next, `${hero.name}'s Wrathful Thunder sent the ${monster.name} to ${heroLabel(right)}.`)
  }
  return state
}

// Damage that isn't an attack roll: Furious Assault's +1, a Blade Barrier or Caltrop
// token, or the Flaming Sphere burning every monster on its tile.
export function powerDamage(state, action) {
  const hero = state.heroes.find((h) => h.id === action.heroId)
  const monsters = (Array.isArray(action.monsterIds) ? action.monsterIds : [])
    .map((id) => findFoe(state, id))
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
  } else if (action.source === 'caltrops' && tokens.caltrops > 0 && monsters.length === 1) {
    next = updateHero(next, hero.id, (h) => ({ tokens: { ...h.tokens, caltrops: h.tokens.caltrops - 1 } }))
    source = 'a Caltrop'
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
  const won = defeatDetails(next, defeated, hero.id)
  return withMoment(won.state, {
    kind: defeated.length > 0 ? 'defeat' : 'roll',
    heroId: hero.id,
    title: `${source[0].toUpperCase()}${source.slice(1)}: 1 damage!`,
    detail: won.details.join(' '),
  })
}

// A power used from its tile: healing, tokens, ending a condition, and so on.
// A party or self bonus from a power (Song of Courage: all heroes +2 to attack until the end
// of your next Hero Phase). Used in the caster's Hero Phase, that phase's end counts as one.
function addBuff(next, state, hero, power, buff) {
  const lasts = buff.lasts === 'turnStart' ? { untilTurnStart: true } : { phaseEnds: inHeroPhase(state, hero) ? 2 : 1 }
  const entry = { source: power.name, casterId: hero.id, attack: Number(buff.attack) || 0, ac: Number(buff.ac) || 0, ...lasts }
  const who = buff.who === 'self' ? [hero.id] : next.heroes.map((h) => h.id)
  for (const id of who) {
    next = updateHero(next, id, (h) => ({ buffs: [...(h.buffs ?? []).filter((b) => b.source !== power.name), entry] }))
  }
  const what = [entry.attack && `+${entry.attack} to attack`, entry.ac && `+${entry.ac} AC`].filter(Boolean).join(' and ')
  const until = lasts.untilTurnStart ? `the start of ${hero.name}'s next turn` : `the end of ${hero.name}'s ${lasts.phaseEnds === 2 ? 'next ' : ''}Hero Phase`
  return withLog(next, `${buff.who === 'self' ? hero.name : 'Every hero'} gets ${what} until ${until}.`)
}

// Shadowphage (Fesud, a fan hero): a power can take him into or out of the shadows.
function moveShadow(state, hero, effects, missed = false) {
  const was = Boolean(hero.tokens?.shadow)
  const now = shadowAfter(hero, effects, missed)
  if (was === now) return state
  const next = updateHero(state, hero.id, (h) => ({ tokens: { ...h.tokens, shadow: now } }))
  return withLog(next, now ? `${hero.name} slips into the shadows.` : `${hero.name} steps out of the shadows.`)
}

// Shadowphage's own switch: entering the shadows takes the hero's attack in their Hero Phase
// ("instead of attacking"); stepping out is free.
export function setShadow(state, action) {
  const hero = state.heroes.find((h) => h.id === action.heroId)
  if (!hero || !hasAbility(hero, 'shadowphage')) return state
  const on = Boolean(action.on)
  if (on === Boolean(hero.tokens?.shadow)) return state
  if (on && inHeroPhase(state, hero) && !canSpendAttack(state, hero)) return state
  let next = moveShadow(state, hero, { shadow: on ? 'enter' : 'leave' })
  if (on && inHeroPhase(state, hero)) next = spendAttack(next, hero, 'Shadowphage')
  return next
}

export function usePower(state, action) {
  const hero = state.heroes.find((h) => h.id === action.heroId)
  const power = hero?.powers.find((p) => p.id === action.powerId)
  const use = effectsOf(power).use
  if (!power || power.used || !use) return state
  const heroIds = (Array.isArray(action.heroIds) ? action.heroIds : []).filter((id) => state.heroes.some((h) => h.id === id))
  const picked = heroIds[0] && state.heroes.find((h) => h.id === heroIds[0])
  if (use.pick && !picked && !use.optional) return state
  if (use.pick === 'other' && picked?.id === hero.id) return state
  // One for the Team: only while another hero's encounter card is waiting to be done.
  const taken = use.takeEncounter ? state.encounter : null
  if (use.takeEncounter && (!taken || taken.attacked || taken.heroId === hero.id)) return state

  let next = withCast(power.type === 'at-will' ? state : markUsed(state, hero.id, power.id), power)
  next = withLog(next, `${heroLabel(hero)} used ${power.name}.`)
  if (use.healSelf) next = healHero(next, hero.id, use.healSelf, power.name)
  if (use.heal && picked) next = healHero(next, picked.id, use.heal, power.name)
  if (use.tokens) next = updateHero(next, hero.id, (h) => ({ tokens: { ...h.tokens, ...use.tokens } }))
  if (use.invisible) next = updateHero(next, hero.id, (h) => ({ tokens: { ...h.tokens, invisible: true } }))
  if (effectsOf(power).shadow) next = moveShadow(next, hero, effectsOf(power))
  if (use.buff) next = addBuff(next, state, hero, power, use.buff)
  if (use.refuge) {
    next = updateHero(next, picked.id, (h) => ({ tokens: { ...h.tokens, refuge: true } }))
    next = withLog(next, `${picked.name} is safe in the Astral Refuge until their next turn.`)
  }
  if (use.endCondition) {
    if (!picked.conditions.includes(action.condition)) return state
    next = updateHero(next, picked.id, (h) => ({ conditions: h.conditions.filter((c) => c !== action.condition) }))
    next = withLog(next, `${picked.name} is no longer ${action.condition}.`)
  }
  if (taken) {
    next = { ...next, encounter: { ...next.encounter, heroId: hero.id } }
    next = withLog(next, `${hero.name} takes ${taken.card.name} instead, as if ${hero.name} drew it.`)
  }
  if (use.causeFear) {
    const extras = heroIds.filter((id) => id !== hero.id).map((heroId) => ({ heroId, bonus: 2, source: power.name }))
    // Afterwards the monsters left on the cleric's tile are moved (on the virtual board).
    const causeFear = { heroId: hero.id, source: power.name }
    next = { ...next, turn: { ...next.turn, bonusAttacks: [...(next.turn.bonusAttacks ?? []), ...extras], causeFear } }
    next = queueFearMove(next)
  }
  // Bravery, offered on a monster's turn, carries that monster's token so the hero goes next to it.
  const foe = typeof action.foeToken === 'string' && findFoe(state, action.foeToken.split('#')[0])
  if (use.board) next = queueMoves(next, hero, power, use.board, foe ? { from: action.foeToken, fromName: foe.name } : {})
  // A Daily or At-Will power is the hero's attack; Dwarven Resilience is a move.
  if (powerUsesAttack(state, hero, power)) next = spendAttack(next, hero, power.name)
  if (use.move && inHeroPhase(state, hero) && state.board) next = { ...next, turn: { ...next.turn, boardMoves: (next.turn.boardMoves ?? 0) + 1 } }
  return next
}

// Tumbling Escape: the monster's hit becomes a miss. The damage and conditions come back
// off, and the attack's miss damage (if any) is dealt instead.
export function dodgeHit(state, action) {
  const last = state.turn.lastMonsterAttack
  const hero = state.heroes.find((h) => h.id === action.heroId)
  const power = hero?.powers.find((p) => p.id === action.powerId)
  const row = last?.results.find((r) => r.heroId === hero?.id && r.hit && !r.dodged)
  if (!row || !power || power.used || effectsOf(power).reaction !== 'dodge') return state
  let next = withCast(markUsed(state, hero.id, power.id), power)
  next = updateHero(next, hero.id, (h) => ({
    hp: clamp(h.hp + row.dealt - row.miss, 0, h.maxHp),
    conditions: h.conditions.filter((c) => !row.conditions.includes(c)),
  }))
  const results = last.results.map((r) => (r === row ? { ...r, dodged: true } : r))
  next = { ...next, turn: { ...next.turn, lastMonsterAttack: { ...last, results } } }
  next = queueMoves(next, hero, power, effectsOf(power).board?.dodge)
  return withLog(next, `${hero.name} used Tumbling Escape: the attack misses!${row.miss > 0 ? ` (${row.miss} miss damage)` : ''} Put ${hero.name} on a tile within 1 tile.`)
}
