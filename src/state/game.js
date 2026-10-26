import {
  LEVEL_UP_HP_BONUS,
  STARTING_SURGES,
  XP_TO_CANCEL_ENCOUNTER,
  XP_TO_LEVEL_UP,
} from '../data/heroes.js'
import { PHASES } from '../data/phases.js'

export const SAVE_KEY = 'ashardalon-companion/game'
const SAVE_VERSION = 1

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
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const withLog = (state, text) => ({
  ...state,
  log: [{ id: newId('log'), round: state.turn.round, text }, ...state.log].slice(0, 50),
})

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
    powers: [
      { id: newId('power'), type: 'daily', name: 'Daily power', used: false },
      { id: newId('power'), type: 'utility', name: 'Utility power', used: false },
    ],
  }
}

export function gameReducer(state, action) {
  switch (action.type) {
    case 'NEW_GAME':
      return initialState

    case 'START_GAME': {
      if (action.heroes.length === 0) return state
      const started = { ...initialState, status: 'playing', heroes: action.heroes }
      return withLog(started, `The adventure begins with ${action.heroes.map((h) => h.name).join(', ')}.`)
    }

    case 'ADJUST_HP':
      return updateHero(state, action.heroId, (hero) => ({ hp: clamp(hero.hp + action.amount, 0, hero.maxHp) }))

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
        powers: hero.powers.map((p) => (p.id === action.powerId ? { ...p, used: !p.used } : p)),
      }))

    case 'RENAME_POWER':
      return updateHero(state, action.heroId, (hero) => ({
        powers: hero.powers.map((p) => (p.id === action.powerId ? { ...p, name: action.name } : p)),
      }))

    case 'ADD_POWER':
      return updateHero(state, action.heroId, (hero) => ({
        powers: [...hero.powers, { id: newId('power'), type: action.powerType, name: action.name, used: false }],
      }))

    case 'TOGGLE_HERO_CONDITION':
      return updateHero(state, action.heroId, (hero) => ({ conditions: toggle(hero.conditions, action.condition) }))

    case 'LEVEL_UP': {
      const hero = state.heroes.find((h) => h.id === action.heroId)
      if (!hero || hero.level >= 2 || state.xp < XP_TO_LEVEL_UP) return state
      const leveled = updateHero({ ...state, xp: state.xp - XP_TO_LEVEL_UP }, hero.id, (h) => ({
        level: 2,
        maxHp: h.maxHp + LEVEL_UP_HP_BONUS,
        hp: h.hp + LEVEL_UP_HP_BONUS,
      }))
      return withLog(leveled, `${hero.name} reached level 2!`)
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

    case 'ADJUST_MONSTER_HP':
      return updateMonster(state, action.monsterId, (m) => ({ hp: clamp(m.hp + action.amount, 0, m.maxHp) }))

    case 'TOGGLE_MONSTER_CONDITION':
      return updateMonster(state, action.monsterId, (m) => ({ conditions: toggle(m.conditions, action.condition) }))

    case 'DEFEAT_MONSTER': {
      const monster = state.monsters.find((m) => m.id === action.monsterId)
      if (!monster) return state
      const next = {
        ...state,
        xp: state.xp + monster.xp,
        monsters: state.monsters.filter((m) => m.id !== monster.id),
      }
      return withLog(next, `The ${monster.name} was defeated! +${monster.xp} XP`)
    }

    case 'REMOVE_MONSTER':
      return { ...state, monsters: state.monsters.filter((m) => m.id !== action.monsterId) }

    case 'ADJUST_XP':
      return { ...state, xp: Math.max(0, state.xp + action.amount) }

    case 'CANCEL_ENCOUNTER':
      if (state.xp < XP_TO_CANCEL_ENCOUNTER) return state
      return withLog({ ...state, xp: state.xp - XP_TO_CANCEL_ENCOUNTER }, 'Spent 5 XP to cancel an encounter.')

    case 'ADJUST_SURGES':
      return { ...state, surges: Math.max(0, state.surges + action.amount) }

    case 'NEXT_PHASE': {
      const { heroIndex, phase, round } = state.turn
      if (phase < PHASES.length - 1) {
        return { ...state, turn: { ...state.turn, phase: phase + 1 } }
      }
      const nextIndex = (heroIndex + 1) % state.heroes.length
      return {
        ...state,
        turn: { heroIndex: nextIndex, phase: 0, round: nextIndex === 0 ? round + 1 : round },
      }
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

export function loadGame(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage.getItem(SAVE_KEY))
    if (saved && saved.version === SAVE_VERSION) return saved
  } catch {
    // A missing or broken save starts a fresh game.
  }
  return initialState
}

export function saveGame(state, storage = globalThis.localStorage) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(state))
  } catch {
    // Private browsing can block storage; the game still works without saving.
  }
}
