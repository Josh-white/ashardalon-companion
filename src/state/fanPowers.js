// Fan heroes' powers that do more than heal, buff or move (cards.json `use` fields):
//   choose      [{ label, ...use }]  pick one of these (Nature's Gifts); action.option is its index
//   count       with heal + pick: up to this many heroes get the heal (reach limits who)
//   xpCost      spend this much party XP (Experienced)
//   afterMiss   only right after one of the hero's own attacks missed (Improvise)
//   selfHurt    the hero loses this much HP (Improvise)
//   hurt        damage to one monster (action.monsterIds[0]); hurtReach: 'adjacent' limits it on the board
//   moveTraps   n: up to n trap markers on the hero's tile go to a tile within 1 (action.trapIds,
//               action.tile); they hurt each monster there at the start of the hero's Villain
//               Phase and then go (Trapping Attack)
//   removeTrap  take one trap marker on the hero's tile away (action.trapIds[0]) (Fleetfooted)
//   perch       Treetop: on a wall next to the tile; monsters' adjacent attacks can't reach the
//               hero until the next Hero Phase, which then has Advantage (roll twice, keep the best)
//   mesmerize   Beast Ally: { types, names, from: [statuses], turns } Pacified/Trapped beasts become Mesmerized
//   charm       Charm Beast: { types: [monster types] } for the monster just drawn (action.monsterIds[0])

import { baseId, key } from '../board/grid.js'
import { adjacent, tilesBetween } from '../board/paths.js'
import { boardGrid, movesLeft } from '../board/play.js'
import { HERO_TOKENS, tokenTargets } from '../board/heroTokens.js'
import { queueMoves } from '../board/powerMoves.js'
import { addStatus, mesmerizedDue, statusesOf } from './monsterStatus.js'
import { inHeroPhase } from './heroTurn.js'
import { defeatDetails, hurtMonster } from './combat.js'
import { clamp, findFoe, updateHero, updateMonster, withLog, withMoment } from './gameHelpers.js'
import { discardMonsterCard } from './monsterDeck.js'

// The `use` a power works with once the player picked an option (null: no option picked yet).
export function resolveUse(use, option) {
  if (!use || !Array.isArray(use.choose)) return use
  const picked = use.choose[Number(option)]
  if (!picked) return null
  const rest = { ...use }
  delete rest.choose
  return { ...rest, ...picked }
}

// Why the power can't be used now, or null.
export function fanUseBlocked(state, hero, use) {
  if (!use) return 'Pick one first.'
  if (use.xpCost && (state.xp ?? 0) < use.xpCost) return `It takes ${use.xpCost} XP, and the party has ${state.xp ?? 0}.`
  if (use.afterMiss && !missedLast(state, hero)) return `Use it right after one of ${hero.name}'s attacks misses.`
  if (use.moveTraps && trapsOnTile(state, hero).length === 0) return `There's no trap on ${hero.name}'s tile.`
  if (use.removeTrap && trapsOnTile(state, hero).length === 0) return `There's no trap on ${hero.name}'s tile.`
  if (use.charm && !newestMonster(state)) return 'Use it when a new monster card is drawn.'
  if (use.mesmerize && mesmerizeTargets(state, use.mesmerize).length === 0) return 'No Pacified or Trapped beast to Mesmerize yet.'
  return null
}

function missedLast(state, hero) {
  const last = state.turn.lastAttack
  return Boolean(last && last.heroId === hero.id && last.rolls?.length > 0 && last.rolls.every((r) => !r.hit))
}

const heroTile = (state, hero) => {
  const at = state.board?.tokens[hero.id]
  return at ? boardGrid(state.board).get(key(at))?.area : undefined
}

// Trap markers (not hazards) on the hero's tile. Without a board every trap counts.
export function trapsOnTile(state, hero) {
  const traps = (state.traps ?? []).filter((t) => t.type === 'trap')
  if (!state.board) return traps
  const tile = heroTile(state, hero)
  return traps.filter((t) => t.tile !== undefined && t.tile === tile)
}

// The tiles within 1 tile of the hero's (its own included), for Trapping Attack.
export function tilesWithin1(state, hero) {
  const at = state.board?.tokens[hero.id]
  if (!at) return []
  const grid = boardGrid(state.board)
  const areas = new Map()
  for (const sq of grid.values()) {
    if (!sq.floor || areas.has(sq.area)) continue
    if (tilesBetween(grid, at, [sq.x, sq.y]) <= 1) areas.set(sq.area, [sq.x, sq.y])
  }
  return [...areas.keys()]
}

// Monsters (and villains) the hero can hurt: next to the hero on the board, any of them at a table.
export function foesInReach(state, hero, reach) {
  const all = [...state.monsters.filter((m) => !m.objective), ...(state.villains ?? []).filter((v) => !v.defeated)]
  const at = state.board?.tokens[hero.id]
  if (!at || reach !== 'adjacent') return all.map((m) => m.id)
  const grid = boardGrid(state.board)
  const near = new Set(Object.entries(state.board.tokens).filter(([, spot]) => adjacent(grid, at, spot)).map(([id]) => baseId(id)))
  return all.filter((m) => near.has(m.id)).map((m) => m.id)
}

// The monster drawn most recently this turn (Charm Beast, Come and Get It).
export function newestMonster(state) {
  const now = `${state.turn.round}-${state.turn.heroIndex}` // campaignPlay.js turnKey
  const drawn = state.monsters.filter((m) => !m.objective && !m.villain && (m.drawnAt === undefined || m.drawnAt === now))
  return drawn[drawn.length - 1] ?? null
}

// Damage to one monster from a power, with the defeat and its XP/treasure.
export function hurtFoe(state, hero, monsterId, amount, source) {
  const monster = findFoe(state, monsterId)
  if (!monster || amount <= 0) return state
  let next = withLog(state, `${source}: the ${monster.name} takes ${amount} damage.`)
  const hurt = hurtMonster(next, monster, amount)
  const won = defeatDetails(hurt.state, hurt.defeated ? [monster] : [], hero.id)
  return withMoment(won.state, {
    kind: hurt.defeated ? 'defeat' : 'roll',
    heroId: hero.id,
    title: `${source}: ${amount} damage!`,
    detail: won.details.join(' '),
  })
}

// The fan `use` fields, applied after the power is marked used.
export function applyFanUse(state, before, hero, power, use, action) {
  let next = state
  if (use.xpCost) next = withLog({ ...next, xp: Math.max(0, next.xp - use.xpCost) }, `${hero.name} spends ${use.xpCost} XP.`)
  if (use.selfHurt) {
    next = updateHero(next, hero.id, (h) => ({ hp: clamp(h.hp - use.selfHurt, 0, h.maxHp) }))
    next = withLog(next, `${hero.name} loses ${use.selfHurt} HP.`)
  }
  const ids = Array.isArray(action.monsterIds) ? action.monsterIds : []
  if (use.hurt && ids[0] && foesInReach(before, hero, use.hurtReach).includes(ids[0])) next = hurtFoe(next, hero, ids[0], use.hurt, power.name)
  if (use.moveTraps) next = moveTraps(next, before, hero, power, use.moveTraps, action)
  if (use.removeTrap) {
    const trap = trapsOnTile(before, hero).find((t) => t.id === action.trapIds?.[0]) ?? trapsOnTile(before, hero)[0]
    if (trap) next = withLog({ ...next, traps: next.traps.filter((t) => t.id !== trap.id) }, `${hero.name} takes the ${trap.name} trap away.`)
  }
  if (use.perch) {
    next = updateHero(next, hero.id, (h) => ({ tokens: { ...h.tokens, treetop: true } }))
    next = withLog(next, `${hero.name} climbs up a wall: monsters next to ${hero.name} can't attack until the next Hero Phase.`)
  }
  if (use.charm) next = charmBeast(next, hero, power, use.charm, action)
  if (use.mesmerize) next = mesmerize(next, power, use.mesmerize)
  return next
}

function moveTraps(state, before, hero, power, n, action) {
  const here = trapsOnTile(before, hero)
  const picked = (Array.isArray(action.trapIds) ? action.trapIds : here.map((t) => t.id)).filter((id) => here.some((t) => t.id === id)).slice(0, n)
  if (picked.length === 0) return state
  const tiles = tilesWithin1(before, hero)
  // The players would send them where the most monsters are, so the board does (ties: the hero's own tile).
  const crowd = (t) => Object.entries(before.board?.tokens ?? {}).filter(([id, at]) => findFoe(before, baseId(id)) && boardGrid(before.board).get(key(at))?.area === t).length
  const best = [...tiles].sort((a, b) => crowd(b) - crowd(a) || (b === heroTile(before, hero)) - (a === heroTile(before, hero)))[0]
  const tile = state.board ? (tiles.includes(action.tile) ? action.tile : best ?? heroTile(before, hero)) : undefined
  const traps = state.traps.map((t) => (picked.includes(t.id) ? { ...t, ...(tile !== undefined ? { tile } : {}), armedBy: hero.id } : t))
  return withLog({ ...state, traps }, `${hero.name} turns ${picked.length === 1 ? 'a trap' : `${picked.length} traps`} against the monsters: at the start of ${hero.name}'s Villain Phase ${picked.length === 1 ? 'it hurts' : 'they hurt'} every monster on that tile.`)
}

// Trapping Attack: at the start of the hero's Villain Phase each trap they armed deals 1 damage
// to every monster on its tile (at a table: the players say which), and goes.
export function springArmedTraps(state, hero) {
  const armed = (state.traps ?? []).filter((t) => t.armedBy === hero?.id)
  if (armed.length === 0) return state
  let next = { ...state, traps: state.traps.filter((t) => t.armedBy !== hero.id) }
  if (!state.board) return withLog(next, `${hero.name}'s traps go off: each monster on their tile takes 1 damage (do it at the table).`)
  const grid = boardGrid(state.board)
  for (const trap of armed) {
    const victims = [...new Set(Object.entries(state.board.tokens).filter(([id, at]) => findFoe(state, baseId(id)) && grid.get(key(at))?.area === trap.tile).map(([id]) => baseId(id)))]
    next = withLog(next, victims.length ? `${hero.name}'s ${trap.name} trap goes off!` : `${hero.name}'s ${trap.name} trap goes off, but no monster is on its tile.`)
    for (const id of victims) next = hurtFoe(next, hero, id, 1, trap.name)
  }
  return next
}

// Charm Beast's creatures and beasts: monsters with one of `types`, or named in `names`.
export function isCharmable(monster, charm = {}) {
  const types = (Array.isArray(charm.types) ? charm.types : []).map((t) => t.toLowerCase())
  const names = (Array.isArray(charm.names) ? charm.names : []).map((n) => n.toLowerCase())
  return (monster?.card?.types ?? []).some((t) => types.includes(t.toLowerCase())) || names.includes(String(monster?.name ?? '').toLowerCase())
}

// Charm Beast: a drawn monster that isn't a creature or beast is discarded; one that is attacks
// the nearest other monster (the device's roll) and sits out this Villain Phase.
function charmBeast(state, hero, power, charm, action) {
  const monster = findFoe(state, action.monsterIds?.[0]) ?? newestMonster(state)
  if (!monster || monster.villain) return state
  const beast = isCharmable(monster, charm)
  if (!beast) {
    const next = discardMonsterCard({ ...state, monsters: state.monsters.filter((m) => m.id !== monster.id) }, monster)
    return withLog(next, `${power.name}: the ${monster.name} isn't a creature or beast, so it's discarded.`)
  }
  // It has had its turn this Villain Phase.
  const acted = state.turn.acted ?? []
  const next = { ...state, turn: { ...state.turn, acted: acted.includes(monster.id) ? acted : [...acted, monster.id] } }
  return foeAttacksFoe(next, hero, monster, findFoe(state, action.targetId), action.roll, `${power.name}: the charmed ${monster.name}`)
}

// A monster turned against the others (Charm Beast, Mesmerized) attacks one with its first attack.
export function foeAttacksFoe(state, hero, monster, target, roll, who) {
  const attack = monster.card?.attacks?.[0]
  if (!target || !attack || !(roll >= 1 && roll <= 20)) return withLog(state, `${who} has no other monster to attack.`)
  const total = roll + (attack.bonus ?? 0)
  const hit = total >= target.ac
  let next = withLog(state, `${who} attacks the ${target.name} with ${attack.name}: ${roll} + ${attack.bonus ?? 0} = ${total} vs AC ${target.ac}, ${hit ? 'a hit' : 'a miss'}.`)
  if (hit) next = hurtFoe(next, hero, target.id, attack.damage ?? 1, `The ${monster.name}'s ${attack.name}`)
  else if (attack.miss) next = hurtFoe(next, hero, target.id, attack.miss, `The ${monster.name}'s ${attack.name}`)
  return next
}

// Beast Ally (a fan Ranger): every Pacified or Trapped forest creature becomes Mesmerized.
export function mesmerizeTargets(state, rule) {
  const from = Array.isArray(rule?.from) ? rule.from : ['pacified', 'trapped']
  return state.monsters.filter((m) => isCharmable(m, rule) && statusesOf(m).some((s) => from.includes(s.kind)))
}
function mesmerize(state, power, rule) {
  const from = Array.isArray(rule?.from) ? rule.from : ['pacified', 'trapped']
  let next = state
  for (const monster of mesmerizeTargets(state, rule)) {
    const statuses = [...statusesOf(monster).filter((s) => !from.includes(s.kind) && s.kind !== 'mesmerized'), { kind: 'mesmerized', tokens: Number(rule.turns) || 2, source: power.name }]
    next = withLog(updateMonster(next, monster.id, () => ({ statuses })), `The ${monster.name} is Mesmerized (${power.name}): on its next ${Number(rule.turns) || 2} turns it attacks the nearest other monster.`)
  }
  return next
}

// A Mesmerized monster's turn: it attacks the nearest other monster (the device's roll).
export function mesmerizedTurn(state, action) {
  const monster = findFoe(state, action.id)
  if (!monster || !mesmerizedDue(monster)) return state
  const hero = state.heroes[state.turn.heroIndex]
  return foeAttacksFoe(state, hero, monster, nearestOtherFoe(state, monster.id), Number(action.roll), `The Mesmerized ${monster.name}`)
}

// The monster nearest the charmed one, for Charm Beast's attack (any other one at a table).
export function nearestOtherFoe(state, monsterId) {
  const others = [...state.monsters.filter((m) => !m.objective && m.id !== monsterId), ...(state.villains ?? []).filter((v) => !v.defeated)]
  const from = state.board?.tokens[monsterId]
  if (!from) return others[0] ?? null
  const grid = boardGrid(state.board)
  const dist = (m) => {
    const spots = Object.entries(state.board.tokens).filter(([id]) => baseId(id) === m.id).map(([, at]) => at)
    return Math.min(...spots.map((at) => Math.abs(at[0] - from[0]) + Math.abs(at[1] - from[1]) + 100 * tilesBetween(grid, from, at)), Infinity)
  }
  return [...others].sort((a, b) => dist(a) - dist(b))[0] ?? null
}

// Fan heroes' board tokens springing after an action (board/heroTokens.js):
//   Boobytrap / Spiked Growth: a monster that moves onto their tile is Trapped / Stunned, and the token goes.
//   Shadow Seeker: the monster it's next to takes 1 damage when it moves or attacks, and the token goes.
export function springFanTokens(before, state) {
  const list = state.board?.items ?? []
  if (!before?.board || !list.some((i) => i.at && (HERO_TOKENS[i.kind]?.springs || i.kind === 'seeker'))) return state
  const grid = boardGrid(state.board)
  const area = (at) => grid.get(key(at))?.area
  const moved = Object.entries(state.board.tokens).filter(([id, at]) => {
    const was = before.board.tokens[id]
    return was && findFoe(state, baseId(id)) && key(was) !== key(at)
  })
  const attacker = state.turn.lastMonsterAttack !== before.turn?.lastMonsterAttack ? state.turn.lastMonsterAttack?.monsterId : null
  let next = state
  const spend = (s, item) => {
    const look = HERO_TOKENS[item.kind]
    const board = { ...s.board, items: s.board.items.filter((i) => i.id !== item.id) }
    return updateHero({ ...s, board }, item.owner, (h) => ({ tokens: { ...h.tokens, [look.counter]: Math.max(0, (Number(h.tokens?.[look.counter]) || 1) - 1) } }))
  }
  for (const [id, at] of moved) {
    if (area(before.board.tokens[id]) === area(at)) continue
    const item = (next.board.items ?? []).find((i) => i.at && HERO_TOKENS[i.kind]?.springs && area(i.at) === area(at))
    if (!item) continue
    next = addStatus(spend(next, item), baseId(id), HERO_TOKENS[item.kind].springs, HERO_TOKENS[item.kind].name)
  }
  for (const item of (next.board.items ?? []).filter((i) => i.kind === 'seeker' && i.at && i.target)) {
    const target = baseId(item.target)
    const triggered = moved.some(([id]) => id === item.target) || attacker === target
    if (!triggered || !findFoe(next, target)) continue
    const owner = next.heroes.find((h) => h.id === item.owner)
    next = spend(next, item)
    if (owner) next = hurtFoe(next, owner, target, 1, 'A Shadow Seeker')
  }
  return next
}

// Shadow Seekers: going into the shadows sends one of the hero's tokens out (if a monster is within 1 tile).
export function sendSeeker(state, hero) {
  if (!state.board || !(hero?.tokens?.seekersLeft > 0)) return state
  const probe = { id: '_seeker', kind: 'seeker', owner: hero.id, at: null }
  if (tokenTargets(state, probe).length === 0) return state
  const next = updateHero(state, hero.id, (h) => ({ tokens: { ...h.tokens, seekersLeft: h.tokens.seekersLeft - 1, seekers: (Number(h.tokens.seekers) || 0) + 1 } }))
  return withLog(next, `${hero.name} sends a Shadow Seeker out: tap a lit square next to the nearest monster.`)
}

// Paths of Darkness: in the shadows, the hero can step out of them to put a Darkness token next to them.
export const canDropDarkness = (state, hero) => Boolean(state.board && hero?.tokens?.shadow && hero.tokens.darknessLeft > 0)
export function dropDarkness(state, action) {
  const hero = state.heroes.find((h) => h.id === action.heroId)
  if (!canDropDarkness(state, hero)) return state
  const next = updateHero(state, hero.id, (h) => ({ tokens: { ...h.tokens, shadow: false, darknessLeft: h.tokens.darknessLeft - 1, darkness: (Number(h.tokens.darkness) || 0) + 1 } }))
  return withLog(next, `${hero.name} steps out of the shadows and leaves a Darkness token: tap a lit square next to ${hero.name}.`)
}

// Secret Paths / Paths of Darkness: the active hero, standing on or next to one of these
// tokens, uses a move to come out at another one. The token kinds the hero can use now.
export function pathKinds(state, hero) {
  if (!state.board || !hero || !inHeroPhase(state, hero) || movesLeft(state, hero) <= 0) return []
  const at = state.board.tokens[hero.id]
  if (!at) return []
  const grid = boardGrid(state.board)
  const list = (state.board.items ?? []).filter((i) => i.at && HERO_TOKENS[i.kind]?.path)
  return Object.keys(HERO_TOKENS).filter((kind) => {
    if (!HERO_TOKENS[kind].path) return false
    const mine = list.filter((i) => i.kind === kind && (kind !== 'darkness' || (i.owner === hero.id && hero.tokens?.shadow)))
    return mine.length > 1 && mine.some((i) => key(i.at) === key(at) || adjacent(grid, at, i.at))
  })
}
export function takePath(state, action) {
  const hero = state.heroes[state.turn.heroIndex]
  if (!hero || hero.id !== action.heroId || !pathKinds(state, hero).includes(action.kind)) return state
  const step = { pick: 'self', to: 'onToken', kind: action.kind, own: action.kind === 'darkness' }
  const next = queueMoves({ ...state, turn: { ...state.turn, boardMoves: (state.turn.boardMoves ?? 0) + 1 } }, hero, { name: HERO_TOKENS[action.kind].name }, [step])
  return withLog(next, `${hero.name} takes the ${HERO_TOKENS[action.kind].name}.`)
}
