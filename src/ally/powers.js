// The powers a computer hero needs more than "roll at a monster" for: the ones that put
// tokens on the board (Flaming Sphere, Blade Barrier), hand out attacks (Cause Fear), hide a
// hero (Invisibility, Astral Refuge), and the reactions and hero card abilities that happen
// on anyone's turn (Tumbling Escape, Practiced Evasion, Furious Assault, Inspiring Advice,
// Saving Grace, Healing Hands, Brutal Recovery). Each returns { action, say } or null, like
// the rest of the brain (brain.js calls them).

import { baseId, key } from '../board/grid.js'
import { distances, tilesBetween } from '../board/paths.js'
import { boardGrid } from '../board/play.js'
import { HERO_TOKENS, movableToken, sphereOf, sphereVictims, tokenMoveTargets, tokenTargets } from '../board/heroTokens.js'
import { heroesInReach } from '../board/encounters.js'
import { foesInRange } from '../board/monsters.js'
import { effectsOf, pendingDodge } from '../data/powerEffects.js'
import { hasAbility } from '../data/heroes.js'
import { powerNumber } from '../state/combat.js'
import { foes } from '../state/gameHelpers.js'

const d20 = () => Math.floor(Math.random() * 20) + 1
const parse = (k) => k.split(',').map(Number)
const items = (state) => state.board?.items ?? []
const areaAt = (grid, sq) => (sq ? grid.get(key(sq))?.area : undefined)

// Hit points the monster's next figure has left (a group card loses one figure at a time).
export function figureHp(monster) {
  const per = monster.card?.figures > 1 && !monster.villain ? monster.card.hp : monster.maxHp
  if (!per) return monster.hp
  return monster.hp - per * (Math.ceil(monster.hp / per) - 1)
}

// Monster and villain figures on the board: [{ id (token), foe, at }].
function foeFigures(state) {
  const list = foes(state).filter((m) => !m.objective && m.hp > 0)
  return Object.entries(state.board?.tokens ?? {})
    .map(([id, at]) => ({ id, at, foe: list.find((m) => m.id === baseId(id)) }))
    .filter((f) => f.foe)
}
const standingHeroes = (state) => state.heroes.filter((h) => h.hp > 0 && !h.escaped && state.board?.tokens[h.id])
const usable = (hero, test) => hero.powers.find((p) => !p.used && p.card && test(effectsOf(p), p))

// ---- Tokens on the board ----

// Where a hero's token in hand goes. The Flaming Sphere: the tile within reach with the most
// monster figures on it (a villain counts double). The Blade Barrier: squares on the way from
// the monsters to the party, so they walk onto them. Anything else: the free square nearest
// the hero.
function bestTokenSquare(state, item) {
  const targets = tokenTargets(state, item)
  if (targets.length === 0) return null
  const grid = boardGrid(state.board)
  const figures = foeFigures(state)
  if (item.kind === 'sphere') {
    const score = (k) => figures.filter((f) => areaAt(grid, f.at) === areaAt(grid, parse(k))).reduce((s, f) => s + (f.foe.villain ? 2 : 1), 0)
    const near = distances(grid, state.board.tokens[item.owner])
    return [...targets].sort((a, b) => score(b) - score(a) || (near.get(a) ?? 99) - (near.get(b) ?? 99))[0]
  }
  if (item.kind === 'blade' && figures.length > 0) {
    const toFoe = new Map()
    const toParty = new Map()
    const nearest = (map, from) => {
      for (const [k, d] of distances(grid, from)) if (!map.has(k) || d < map.get(k)) map.set(k, d)
    }
    for (const f of figures) nearest(toFoe, f.at)
    for (const h of standingHeroes(state)) nearest(toParty, state.board.tokens[h.id])
    const score = (k) => (toFoe.get(k) ?? 99) + (toParty.get(k) ?? 99)
    return [...targets].sort((a, b) => score(a) - score(b) || (toParty.get(a) ?? 99) - (toParty.get(b) ?? 99))[0]
  }
  const near = distances(grid, state.board.tokens[item.owner])
  return [...targets].sort((a, b) => (near.get(a) ?? 99) - (near.get(b) ?? 99))[0]
}

// A token the hero just got from a power, still in hand: put it down.
export function placeHandToken(state, hero) {
  if (!state.board?.tokens[hero.id]) return null
  const item = items(state).find((i) => i.owner === hero.id && !i.at && HERO_TOKENS[i.kind])
  const to = item && bestTokenSquare(state, item)
  if (!to) return null
  return { action: { type: 'PLACE_ITEM', id: item.id, to: parse(to) }, say: `${hero.name} puts the ${HERO_TOKENS[item.kind].name} down.` }
}

// The end of the Hero Phase with a Flaming Sphere out: move it onto a tile with more monsters
// (that's instead of a move, so only with a move to spare that the hero doesn't need), then
// burn every monster on its tile.
export function sphereStep(state, hero) {
  if (!state.board || !(hero.tokens?.flamingSphere > 0) || state.turn.sphereBurned) return null
  const sphere = sphereOf(state, hero)
  if (!sphere) return null
  const grid = boardGrid(state.board)
  const figures = foeFigures(state)
  const count = (sq) => figures.filter((f) => areaAt(grid, f.at) === areaAt(grid, sq)).length
  const here = count(sphere.at)
  if (movableToken(state, hero, sphere)) {
    const better = tokenMoveTargets(state, sphere).map(parse).sort((a, b) => count(b) - count(a))[0]
    if (better && count(better) > here) {
      return { action: { type: 'MOVE_HERO_ITEM', id: sphere.id, to: better }, say: `${hero.name} rolls the Flaming Sphere toward the monsters.` }
    }
  }
  const victims = sphereVictims(state, hero)
  if (victims.length === 0) return null
  return {
    action: { type: 'POWER_DAMAGE', source: 'flamingSphere', heroId: hero.id, monsterIds: victims },
    say: `${hero.name}'s Flaming Sphere burns ${victims.length > 1 ? `${victims.length} monsters` : 'the monster'} on its tile.`,
  }
}

// ---- Dailies that take the place of the attack ----

// The best tile for a Flaming Sphere cast now: how many monster figures, and whether a villain is there.
function sphereTile(state, hero) {
  const targets = tokenTargets(state, { id: '_ally', kind: 'sphere', owner: hero.id, at: null })
  const grid = boardGrid(state.board)
  const areas = new Set(targets.map((k) => areaAt(grid, parse(k))))
  let best = { count: 0, villain: false, hp: 0 }
  for (const area of areas) {
    const here = foeFigures(state).filter((f) => areaAt(grid, f.at) === area)
    const villain = here.some((f) => f.foe.villain)
    const hp = here.reduce((s, f) => s + figureHp(f.foe), 0)
    if (here.length + (villain ? 1 : 0) > best.count + (best.villain ? 1 : 0)) best = { count: here.length, villain, hp }
  }
  return best
}

// Monster figures within 2 tiles of the hero that aren't next to a hero yet (they'll walk in).
function approaching(state, hero) {
  const grid = boardGrid(state.board)
  const at = state.board.tokens[hero.id]
  const heroes = standingHeroes(state).map((h) => state.board.tokens[h.id])
  return foeFigures(state).filter((f) => tilesBetween(grid, at, f.at) <= 2 && !heroes.some((h) => (distances(grid, h, { limit: 1 }).get(key(f.at)) ?? 9) <= 1))
}

// Other heroes who'd get an extra attack from Cause Fear: ones with an at-will in reach.
function fearHelpers(state, hero, canAttack) {
  return standingHeroes(state).filter((h) => h.id !== hero.id && !h.tokens?.refuge && canAttack(h))
}

// A daily that's better than the hero's best attack right now: Flaming Sphere on a tile of
// monsters, Blade Barrier in the way of monsters coming at the party, Cause Fear when the
// others have monsters to hit. `options` are the hero's attacks (attackOptions), best first;
// `canAttack(h)` says whether another hero has an at-will in reach.
export function castDaily(state, hero, options, canAttack = () => false) {
  if (!state.board?.tokens[hero.id]) return null
  const best = options[0]
  // A finishing blow or a hit on the villain beats any of these.
  if (best && (best.finishes.length > 0 || best.villain)) return null
  const atWills = options.filter((o) => o.power.type !== 'daily')

  const sphere = usable(hero, (e) => e.use?.tokens?.flamingSphere)
  if (sphere && !(hero.tokens?.flamingSphere > 0)) {
    const tile = sphereTile(state, hero)
    // Three turns of sure damage: worth it on two monsters, a villain, or one tough monster
    // when there's no at-will to use instead.
    if (tile.count >= 2 || tile.villain || (tile.count === 1 && (atWills.length === 0 || tile.hp >= 2))) {
      return { action: { type: 'USE_POWER', heroId: hero.id, powerId: sphere.id, heroIds: [] }, say: `${hero.name} casts ${sphere.name}!` }
    }
  }

  const barrier = usable(hero, (e) => e.use?.tokens?.bladeBarrier)
  if (barrier && !(hero.tokens?.bladeBarrier > 0)) {
    const coming = approaching(state, hero).length
    if (coming >= 2 || (coming === 1 && atWills.length === 0)) {
      return { action: { type: 'USE_POWER', heroId: hero.id, powerId: barrier.id, heroIds: [] }, say: `${hero.name} casts ${barrier.name}.` }
    }
  }

  const fear = usable(hero, (e) => e.use?.causeFear)
  if (fear) {
    const helpers = fearHelpers(state, hero, canAttack)
    if (helpers.length >= 2 || (helpers.length === 1 && atWills.length === 0)) {
      return {
        action: { type: 'USE_POWER', heroId: hero.id, powerId: fear.id, heroIds: helpers.map((h) => h.id) },
        say: `${hero.name} casts ${fear.name}: ${helpers.map((h) => h.name).join(' and ')} get${helpers.length === 1 ? 's' : ''} an extra attack!`,
      }
    }
  }
  return null
}

// ---- Keeping heroes alive (utilities, end of the Hero Phase) ----

// Invisibility for a hurt hero with a monster close by; Astral Refuge for a hero (itself
// too) down to 2 HP or less with a monster within 1 tile of them.
export function guardPower(state, hero) {
  if (!state.board?.tokens[hero.id]) return null
  const all = foeFigures(state).map((f) => f.foe)
  if (all.length === 0) return null
  const threatened = (h) => foesInRange(state, h.id, 'within1', [...new Set(all)]).length > 0

  const invisible = usable(hero, (e) => e.use?.invisible)
  if (invisible && !hero.tokens?.invisible && hero.hp <= Math.ceil(hero.maxHp / 2) && threatened(hero)) {
    return { action: { type: 'USE_POWER', heroId: hero.id, powerId: invisible.id, heroIds: [] }, say: `${hero.name} turns invisible.` }
  }

  const refuge = usable(hero, (e) => e.use?.refuge)
  if (refuge) {
    const near = (heroesInReach(state, hero.id, 'within2') ?? [hero.id]).map((id) => state.heroes.find((h) => h.id === id))
    const who = near
      .filter((h) => h && h.hp > 0 && h.hp <= 2 && !h.tokens?.refuge && threatened(h))
      .sort((a, b) => a.hp - b.hp)[0]
    if (who) {
      return {
        action: { type: 'USE_POWER', heroId: hero.id, powerId: refuge.id, heroIds: [who.id] },
        say: `${hero.name} sends ${who.id === hero.id ? 'itself' : who.name} to the Astral Refuge, safe until ${who.id === hero.id ? 'its' : 'their'} next turn.`,
      }
    }
  }
  return null
}

// A Cause Fear move waiting for the ally: each monster left on its tile goes to the square
// farthest from the party. Null for any other move.
export function fearMove(state, hero, choices, targets) {
  const move = state.turn.boardMove
  if (!move || move.heroId !== hero.id || !effectsOf({ name: move.source }).use?.causeFear) return null
  const id = choices[0]
  if (!id) return null
  const grid = boardGrid(state.board)
  const party = new Map()
  for (const h of standingHeroes(state)) {
    for (const [k, d] of distances(grid, state.board.tokens[h.id])) if (!party.has(k) || d < party.get(k)) party.set(k, d)
  }
  const to = [...targets(id)].sort((a, b) => (party.get(b) ?? 0) - (party.get(a) ?? 0))[0]
  return to ? { action: { type: 'BOARD_MOVE', id, to: parse(to) }, say: 'The frightened monster runs away.' } : null
}

// ---- Reactions and hero card abilities, on anyone's turn ----

const CONDITION_ORDER = ['Dazed', 'Immobilized', 'Poisoned', 'Weakened', 'Slowed']
const worstCondition = (h) => [...(h.conditions ?? [])].sort((a, b) => (CONDITION_ORDER.indexOf(a) + 99) % 99 - (CONDITION_ORDER.indexOf(b) + 99) % 99)[0]
const sameTile = (state, a, b) => a.id === b.id || (heroesInReach(state, a.id, 'sameTile') ?? []).includes(b.id)

// Whether a hit is bad enough to spend Tumbling Escape or Practiced Evasion on: 2 or more
// damage, a condition, or the hero left at 2 HP or less.
const worthDodging = (hero, row) => row && (row.dealt - (row.miss ?? 0) >= 2 || (row.conditions ?? []).length > 0 || hero.hp <= 2)

export function allyReaction(state, roll = d20) {
  if (state?.status !== 'playing') return null
  const offers = state.turn.abilityOffers ?? {}
  for (const hero of state.heroes.filter((h) => h.ally && !h.escaped)) {
    // Tumbling Escape (a monster's hit) and Practiced Evasion (a trap's or an encounter's).
    for (const power of hero.powers.filter((p) => !p.used && p.card)) {
      const dodge = pendingDodge(state, hero, power)
      if (!dodge) continue
      const last = dodge.type === 'DODGE_HIT' ? state.turn.lastMonsterAttack : state.turn.lastEventAttack
      if (!worthDodging(hero, last.results.find((r) => r.heroId === hero.id && r.hit))) continue
      return { action: dodge.type === 'EVADE_HIT' ? { ...dodge, disableRoll: roll() } : dodge, say: `${hero.name} uses ${power.name}: the attack misses!` }
    }

    // Keyleth's Healing Hands (+1 HP on a surge) and Quinn's Saving Grace (end a condition).
    const keyleth = state.heroes.find((h) => hasAbility(h, 'healing-hands'))
    if (keyleth && offers.healingHands?.includes(hero.id) && hero.hp < hero.maxHp && sameTile(state, keyleth, hero)) {
      return { action: { type: 'HEALING_HANDS', heroId: hero.id }, say: `${keyleth.name}'s Healing Hands: ${hero.name} gets 1 more HP.` }
    }
    const quinn = state.heroes.find((h) => hasAbility(h, 'saving-grace'))
    if (quinn && offers.savingGrace?.includes(hero.id) && hero.conditions.length > 0 && sameTile(state, quinn, hero)) {
      const condition = worstCondition(hero)
      return { action: { type: 'SAVING_GRACE', heroId: hero.id, condition }, say: `${quinn.name}'s Saving Grace: ${hero.name} is no longer ${condition}.` }
    }
    // Tarak's Brutal Recovery: a natural 20 on Tarak's tile flips Furious Assault back over.
    const rolled = state.heroes.find((h) => h.id === state.turn.natural20)
    if (offers.brutalRecovery && hasAbility(hero, 'brutal-recovery') && rolled && sameTile(state, hero, rolled)) {
      return { action: { type: 'BRUTAL_RECOVERY' }, say: `Brutal Recovery: ${hero.name} flips Furious Assault back over.` }
    }
  }

  const last = state.turn.lastAttack
  const attacker = last && state.heroes.find((h) => h.id === last.heroId)
  if (!attacker) return null
  const alive = (id) => foes(state).find((m) => m.id === id && m.hp > 0)

  // Furious Assault: +1 damage on the ally's own hit, when it finishes the monster off or it's a villain.
  if (attacker.ally) {
    const furious = usable(attacker, (e) => e.reaction === 'furious')
    const row = furious && last.rolls.find((r) => r.hit && alive(r.monsterId) && (figureHp(alive(r.monsterId)) <= 1 || alive(r.monsterId).villain))
    if (row) {
      return {
        action: { type: 'POWER_DAMAGE', source: 'furious', heroId: attacker.id, powerId: furious.id, monsterIds: [row.monsterId] },
        say: `${attacker.name} uses ${furious.name} on the ${alive(row.monsterId).name}!`,
      }
    }
  }

  // Inspiring Advice: a computer hero's miss that would have finished a monster or hit a villain.
  const power = attacker.powers.find((p) => p.id === last.powerId)
  const damage = powerNumber(power?.card?.damage) ?? 1
  const missed = attacker.ally && last.rolls.find((r) => !r.hit && !r.rerolled && alive(r.monsterId) && (damage >= figureHp(alive(r.monsterId)) || alive(r.monsterId).villain))
  if (missed) {
    for (const helper of state.heroes.filter((h) => h.ally && h.hp > 0)) {
      const advice = usable(helper, (e) => e.reaction === 'reroll')
      if (advice) {
        return {
          action: { type: 'REROLL_ATTACK', helperId: helper.id, helperPowerId: advice.id, monsterId: missed.monsterId, roll: roll() },
          say: `${helper.name}'s ${advice.name}: ${attacker.name} rolls again!`,
        }
      }
    }
  }
  return null
}

