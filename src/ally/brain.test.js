import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import { normalizeTiles } from '../board/tileDefs.js'
import { allyHostSeat, allyStep, attackOptions, simpleAttack } from './brain.js'
import { boardGrid } from '../board/play.js'

// A made-up Start tile: 3 floor columns and a wall column, open to the north.
const TILES = normalizeTiles(
  [
    {
      id: 'start', kind: 'start', rows: ['...#', '...#', '...#', '...#', '...#', '...#', '...#', '...#'],
      exits: { N: 'ooox', S: 'xxxx', W: 'xxxxxxxx', E: 'xxxxxxxx' },
      features: [{ type: 'stairs', at: [[1, 3], [2, 3], [1, 4], [2, 4]] }],
    },
  ],
  [],
)
const card = (id, type, attack, damage, text) => ({ id, name: id, type, attack, damage, text })
const fighter = HERO_TEMPLATES.find((t) => t.key === 'fighter')

// One fighter played by the computer, with an at-will and a daily that hit an adjacent monster.
function start({ powers = [card('Jab', 'at-will', '+6', '1', 'Attack one adjacent monster.'), card('Smash', 'daily', '+8', '3', 'Attack one adjacent monster.')] } = {}) {
  let hero = createHero(fighter)
  const given = new Set()
  const slots = hero.powers.map((p) => {
    const c = powers.find((x) => x.type === p.type && !given.has(x))
    if (!c) return { ...p, card: { id: `none-${p.id}`, name: `none-${p.id}`, type: p.type, attack: '', damage: '', text: '' } }
    given.add(c)
    return { ...p, card: c, name: c.name }
  })
  hero = { ...hero, ally: true, powers: slots }
  const state = gameReducer(initialState, { type: 'START_GAME', heroes: [hero], tileRandom: [], boardTiles: TILES })
  return { ...state, firstRoll: null, opening: null }
}
const withMonster = (state, at, { hp = 1, ac = 10, name = 'Rat', villain = false } = {}) => {
  const monster = { id: 'm1', name, maxHp: hp, hp, ac, xp: 1, ownerId: state.heroes[0].id, conditions: [], card: { hp, figures: 1, attacks: [], tactics: [] } }
  return { ...state, ...(villain ? { villains: [{ ...monster, villain: true }] } : { monsters: [monster] }), board: { ...state.board, tokens: { ...state.board.tokens, m1: at } } }
}
const roll = () => 15

describe('the computer ally', () => {
  it('only plays a hero handed to it, on its own turn', () => {
    const state = start()
    const human = { ...state, heroes: state.heroes.map((h) => ({ ...h, ally: false })) }
    expect(allyStep(human)).toBeNull()
    expect(allyStep(state)).not.toBeNull()
  })

  it('spends a healing surge first', () => {
    const state = start()
    const down = { ...state, turn: { ...state.turn, startDamageDue: true } }
    expect(allyStep(down).action).toEqual({ type: 'USE_SURGE', heroId: state.heroes[0].id })
  })

  it('attacks an adjacent monster with its at-will, and keeps the daily for a finishing blow', () => {
    const base = start()
    const hero0 = base.heroes[0]
    const at = base.board.tokens[hero0.id]
    // A 2 HP monster: the at-will (1 damage) can't finish it, but the daily (3) can.
    const tough = withMonster(base, [at[0] + 1, at[1]], { hp: 2 })
    const step = allyStep(tough, { roll })
    expect(step.action.type).toBe('HERO_ATTACK')
    expect(hero0.powers.find((p) => p.id === step.action.powerId).name).toBe('Smash')
    expect(step.action.targets).toEqual([{ monsterId: 'm1', roll: 15 }])
    // A 1 HP monster: the at-will does it, so the daily waits.
    const weak = withMonster(base, [at[0] + 1, at[1]], { hp: 1 })
    expect(hero0.powers.find((p) => p.id === allyStep(weak, { roll }).action.powerId).name).toBe('Jab')
  })

  it("walks up to a monster it can't reach yet", () => {
    const state = withMonster(start(), [2, 7])
    expect(attackOptions(state, state.heroes[0])).toEqual([])
    const step = allyStep(state, { roll })
    expect(step.action.type).toBe('MOVE_HERO')
    const moved = gameReducer(state, step.action)
    expect(moved.board.tokens[state.heroes[0].id]).not.toEqual(state.board.tokens[state.heroes[0].id])
  })

  it('heads for an unexplored edge when there are no monsters, then ends the phase', () => {
    let state = start()
    const step = allyStep(state, { roll })
    expect(step.action.type).toBe('MOVE_HERO')
    state = gameReducer(state, step.action)
    // On the north edge now: nothing more to decide in the Hero Phase.
    expect(state.board.tokens[state.heroes[0].id][1]).toBe(0)
    expect(allyStep(state, { roll })).toBeNull()
  })

  it("answers \"no tile\" when the hero isn't on an edge in the Exploration Phase", () => {
    const state = start()
    const exploring = { ...state, turn: { ...state.turn, phase: 1 } }
    expect(allyStep(exploring, { roll }).action).toMatchObject({ type: 'SET_EXPLORED', explored: false })
  })

  it('leaves powers that move figures first to the players', () => {
    expect(simpleAttack({ used: false, card: { name: 'Charge', attack: '+6', damage: '2' } })).toBe(false)
    expect(simpleAttack({ used: false, card: { name: 'Sure Strike', attack: '+6', damage: '1' } })).toBe(true)
    expect(simpleAttack({ used: true, card: { name: 'Sure Strike', attack: '+6', damage: '1' } })).toBe(false)
  })

  it('takes a new power after levelling up', () => {
    const state = start()
    const hero = state.heroes[0]
    const leveled = { ...state, heroes: [{ ...hero, powers: [...hero.powers, { id: 'new', type: 'daily', name: 'Daily power', used: false, card: null }] }] }
    const spare = { id: 'Crush', hero: 'fighter', type: 'daily', name: 'Crush' }
    expect(allyStep(leveled, { powers: [spare] }).action).toEqual({ type: 'SET_POWER_CARD', heroId: hero.id, powerId: 'new', card: spare })
  })

  it('is played by one screen: the projector, else the table, else the first iPad', () => {
    expect(allyHostSeat(['wizard', 'projector', 'table'])).toBe('projector')
    expect(allyHostSeat(['wizard', 'table'])).toBe('table')
    expect(allyHostSeat(['wizard', 'cleric'])).toBe('cleric')
    expect(allyHostSeat([])).toBeNull()
  })
})

describe('the ally looks after the party', () => {
  const hymn = card('Healing Hymn', 'utility', '', '', 'You and one hero on your tile regain 2 HP.')
  const powers = [card('Jab', 'at-will', '+6', '1', 'Attack one adjacent monster.'), hymn]
  const hurtBy = (state, n) => ({ ...state, heroes: state.heroes.map((h) => ({ ...h, hp: h.maxHp - n })) })

  it('sings Healing Hymn once it has lost 2 HP, not before', () => {
    const state = start({ powers })
    expect(allyStep(hurtBy(state, 1), { roll })?.action.type).not.toBe('USE_POWER')
    const step = allyStep(hurtBy(state, 2), { roll })
    expect(step.action).toMatchObject({ type: 'USE_POWER', powerId: state.heroes[0].powers.find((p) => p.name === 'Healing Hymn').id })
    const healed = gameReducer(hurtBy(state, 2), step.action)
    expect(healed.heroes[0].hp).toBe(healed.heroes[0].maxHp)
  })

  it('drinks a healing potion at 2 HP or less', () => {
    const state = start()
    const potion = { id: 'i1', cardId: 'potion', name: 'Potion', used: false, card: { name: 'Potion', use: 'heal', heal: 2, after: 'discard' } }
    const low = { ...state, heroes: state.heroes.map((h) => ({ ...h, hp: 2, items: [potion] })) }
    expect(allyStep(low, { roll }).action).toEqual({ type: 'USE_ITEM', heroId: state.heroes[0].id, itemId: 'i1', heroIds: [state.heroes[0].id] })
    const fine = { ...low, heroes: low.heroes.map((h) => ({ ...h, hp: 5 })) }
    expect(allyStep(fine, { roll })?.action.type).not.toBe('USE_ITEM')
  })

  it('walks to a Treasure token and picks it up', () => {
    const state = start()
    const at = state.board.tokens[state.heroes[0].id]
    const far = { ...state, board: { ...state.board, items: [{ id: 't1', kind: 'treasure', at: [at[0], 7] }] } }
    const step = allyStep(far, { roll })
    expect(step.action.type).toBe('MOVE_HERO')
    expect(gameReducer(far, step.action).board.tokens[state.heroes[0].id][1]).toBeGreaterThan(at[1])
    const near = { ...state, board: { ...state.board, items: [{ id: 't1', kind: 'treasure', at: [at[0], at[1] + 1] }] } }
    expect(allyStep(near, { roll }).action).toEqual({ type: 'PICK_UP_TREASURE', id: 't1', heroId: state.heroes[0].id })
  })
})

describe("Keyleth's attacks and items", () => {
  const holy = card('Holy Strike', 'at-will', '+8', '1', 'Attack one adjacent Monster. If you started your Hero Phase adjacent to the Monster, deal +1 damage if you hit.')
  const valiant = card('Valiant Strike', 'at-will', '+8', '1', 'Attack one adjacent Monster. When making this attack, you get a +1 bonus to attack for each Monster adjacent to your Hero.')
  const smite = card('Righteous Smite', 'daily', '+9', '3', 'Attack one adjacent Monster.')

  it('attacks with Holy Strike or Valiant Strike, answering their questions from the board', () => {
    const state = start({ powers: [holy, valiant, smite] })
    const at = state.board.tokens[state.heroes[0].id]
    const step = allyStep(withMonster(state, [at[0] + 1, at[1]], { hp: 4 }), { roll })
    expect(step.action.type).toBe('HERO_ATTACK')
    expect(['Holy Strike', 'Valiant Strike']).toContain(state.heroes[0].powers.find((p) => p.id === step.action.powerId).name)
    expect(step.action.startedAdjacent ?? step.action.adjacentCount).toBeTruthy()
  })

  it('uses Divine Challenge on a monster already next to it, not one it would have to pull', () => {
    const challenge = card('Divine Challenge', 'at-will', '+8', '1', 'Choose one Monster within 1 tile of you. Place that Monster adjacent to your Hero. Attack one adjacent Monster.')
    const state = start({ powers: [challenge] })
    const at = state.board.tokens[state.heroes[0].id]
    expect(allyStep(withMonster(state, [at[0] + 1, at[1]], { hp: 4 }), { roll }).action.type).toBe('HERO_ATTACK')
    const away = withMonster(state, [at[0], at[1] + 3], { hp: 4 })
    expect(attackOptions(away, away.heroes[0])).toEqual([])
  })

  it('fires a Ring of Shooting Stars, which is not its attack', () => {
    const state = start()
    const at = state.board.tokens[state.heroes[0].id]
    const ring = { id: 'r1', cardId: 'ring-of-shooting-stars', name: 'Ring of Shooting Stars', used: false, card: { name: 'Ring of Shooting Stars', attack: { bonus: 8, damage: 1 }, after: 'flip', freeAttack: true, note: "Attack a monster within 2 tiles. It doesn't count as your attack." } }
    const armed = withMonster({ ...state, heroes: state.heroes.map((h) => ({ ...h, items: [ring] })) }, [at[0], at[1] + 3], { hp: 4 })
    const step = allyStep(armed, { roll })
    expect(step.action).toMatchObject({ type: 'HERO_ATTACK', itemId: 'r1', targets: [{ monsterId: 'm1', roll: 15 }] })
    const after = gameReducer(armed, step.action)
    expect(after.monsters[0].hp).toBe(3)
    // The ring is used up, and the hero still has its own attack.
    expect(allyStep(after, { roll })?.action.itemId).toBeUndefined()
  })

  it('uses a daily when no at-will can reach, rather than doing nothing', () => {
    const state = start({ powers: [smite] })
    const at = state.board.tokens[state.heroes[0].id]
    expect(allyStep(withMonster(state, [at[0] + 1, at[1]], { hp: 9 }), { roll }).action.type).toBe('HERO_ATTACK')
  })

  it('reads a Tome of Experience at level 1, and flips a used daily back with a Potion of Rejuvenation', () => {
    const state = start()
    const tome = { id: 'i1', cardId: 'tome-of-experience', name: 'Tome of Experience', used: false, card: { name: 'Tome of Experience', use: 'levelUp', after: 'discard' } }
    const withTome = { ...state, heroes: state.heroes.map((h) => ({ ...h, items: [tome] })) }
    const step = allyStep(withTome, { roll })
    expect(step.action).toMatchObject({ type: 'USE_ITEM', itemId: 'i1' })
    expect(gameReducer(withTome, step.action).heroes[0].level).toBe(2)
    const potion = { id: 'i2', cardId: 'potion-of-rejuvenation', name: 'Potion of Rejuvenation', used: false, card: { name: 'Potion of Rejuvenation', use: 'refreshPower', after: 'discard' } }
    const spent = { ...state, heroes: state.heroes.map((h) => ({ ...h, items: [potion], powers: h.powers.map((p) => (p.type === 'daily' ? { ...p, used: true } : p)) })) }
    const daily = spent.heroes[0].powers.find((p) => p.type === 'daily')
    expect(allyStep(spent, { roll }).action).toMatchObject({ type: 'USE_ITEM', itemId: 'i2', targetId: daily.id })
  })
})

describe('the ally and traps', () => {
  const dart = (area) => ({ id: 'trap1', type: 'trap', cardId: 'poisoned-dart-trap', name: 'Poisoned Dart Trap', tile: area, card: { trap: { disable: 10 } } })
  const areaOf = (state, at) => boardGrid(state.board).get(`${at[0]},${at[1]}`).area

  it('disables a trap on its tile instead of attacking', () => {
    const state = start()
    const at = state.board.tokens[state.heroes[0].id]
    const trapped = { ...state, traps: [dart(areaOf(state, at))] }
    const step = allyStep(trapped, { roll: () => 12 })
    expect(step.action).toEqual({ type: 'DISABLE_TRAP', trapId: 'trap1', heroId: state.heroes[0].id, roll: 12 })
    expect(gameReducer(trapped, step.action).traps).toEqual([])
  })

  it('still attacks when that finishes a monster off', () => {
    const state = start()
    const at = state.board.tokens[state.heroes[0].id]
    const both = withMonster({ ...state, traps: [dart(areaOf(state, at))] }, [at[0] + 1, at[1]], { hp: 1 })
    expect(allyStep(both, { roll }).action.type).toBe('HERO_ATTACK')
  })

  it("walks over to a trap's tile", () => {
    const state = start()
    const at = state.board.tokens[state.heroes[0].id]
    // The far half of the Start tile (it counts as two tiles).
    const far = [...boardGrid(state.board).values()].find((sq) => sq.floor && sq.area !== areaOf(state, at))
    const trapped = { ...state, traps: [dart(far.area)] }
    const step = allyStep(trapped, { roll })
    expect(step.action.type).toBe('MOVE_HERO')
    expect(areaOf(state, step.action.to)).toBe(far.area)
  })
})

describe('handing a hero to the computer', () => {
  it('only on the virtual board, and back again', () => {
    const state = { ...start(), heroes: start().heroes.map((h) => ({ ...h, ally: false })) }
    const id = state.heroes[0].id
    const handed = gameReducer(state, { type: 'SET_ALLY', heroId: id, ally: true })
    expect(handed.heroes[0].ally).toBe(true)
    expect(gameReducer(handed, { type: 'SET_ALLY', heroId: id, ally: false }).heroes[0].ally).toBe(false)
    expect(gameReducer({ ...state, board: null }, { type: 'SET_ALLY', heroId: id, ally: true }).heroes[0].ally).toBe(false)
  })

  it('pauses, and asks for a hand', () => {
    const state = start()
    const paused = gameReducer(state, { type: 'ALLY_PAUSE', paused: true })
    expect(paused.allyPaused).toBe(true)
    const help = gameReducer(state, { type: 'ALLY_HELP', reason: 'Vistra needs a hand.' })
    expect(help.turn.allyHelp).toBe('Vistra needs a hand.')
    // Pausing clears the request: someone is playing that turn now.
    expect(gameReducer(help, { type: 'ALLY_PAUSE', paused: true }).turn.allyHelp).toBeNull()
  })

  it('a computer ally in the lobby is ready at once, and only plays on the virtual board', () => {
    let lobby = gameReducer(initialState, { type: 'CLAIM_HERO', deviceId: 'ally~fighter', heroKey: 'fighter', picks: [], ally: true })
    expect(lobby.lobby[0]).toMatchObject({ ally: true, ready: true })
    const onBoard = gameReducer(lobby, { type: 'START_GAME', tileRandom: [], boardTiles: TILES })
    expect(onBoard.heroes[0].ally).toBe(true)
    const onTiles = gameReducer(lobby, { type: 'START_GAME', tileRandom: [] })
    expect(onTiles.heroes[0].ally).toBe(false)
    // The solo screen ticks "the computer plays" on one of its own heroes.
    lobby = gameReducer(initialState, { type: 'CLAIM_HERO', deviceId: 'solo~1', heroKey: 'fighter', picks: [] })
    expect(gameReducer(lobby, { type: 'SET_LOBBY_ALLY', deviceId: 'solo~1', ally: true }).lobby[0].ally).toBe(true)
  })
})

describe('an ally back from a Time Leap', () => {
  it('puts itself back on the board next to another hero before doing anything else', () => {
    const base = start()
    const other = { ...base.heroes[0], id: 'h2', name: 'Quinn', ally: false }
    const otherAt = base.board.tokens[base.heroes[0].id]
    const me = base.heroes[0]
    const tokens = { [other.id]: otherAt }
    const state = { ...base, heroes: [me, other], board: { ...base.board, tokens } }
    const step = allyStep(state, { roll })
    expect(step.action.type).toBe('MOVE_TOKEN')
    expect(step.action.id).toBe(me.id)
    expect(step.say).toMatch(/back on the board next to Quinn/)
    const after = gameReducer(state, step.action)
    const at = after.board.tokens[me.id]
    expect(at).toBeTruthy()
    expect(Math.max(Math.abs(at[0] - otherAt[0]), Math.abs(at[1] - otherAt[1]))).toBe(1)
    expect(allyStep(after, { roll })?.action?.type).not.toBe('MOVE_TOKEN')
  })

  it('waits while the Time Leap curse is still on', () => {
    const base = start()
    const me = { ...base.heroes[0], curses: [{ id: 'c1', name: 'Time Leap', card: { removeAtTurnStart: true } }] }
    const state = { ...base, heroes: [me], board: { ...base.board, tokens: {} } }
    expect(allyStep(state, { roll })?.action?.type).not.toBe('MOVE_TOKEN')
  })
})
