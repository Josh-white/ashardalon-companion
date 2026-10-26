import {
  HERO_TEMPLATES,
  LEVEL_UP_HP_BONUS,
  STARTING_SURGES,
  XP_TO_CANCEL_ENCOUNTER,
  XP_TO_LEVEL_UP,
} from '../data/heroes.js'
import { PHASES } from '../data/phases.js'

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

// Each hero starts with two at-will powers, one utility, and one daily.
export const STARTING_POWER_SLOTS = ['at-will', 'at-will', 'utility', 'daily']

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
    powers: STARTING_POWER_SLOTS.map((type) => newPower(type)),
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

    case 'START_DEMO': {
      // A game already in progress, for trying features without setting one up:
      // every hero, a few monsters, some XP, and a hero with a condition.
      const heroes = HERO_TEMPLATES.map((t) => ({ ...createHero(t), player: '' }))
      heroes[1] = { ...heroes[1], hp: heroes[1].maxHp - 3 }
      heroes[3] = { ...heroes[3], conditions: ['Poisoned'] }
      const monster = (name, hp, xp, owner) => ({
        id: newId('monster'), name, maxHp: hp, hp, xp, ownerId: heroes[owner].id, conditions: [],
      })
      const demo = {
        ...initialState,
        status: 'playing',
        heroes,
        monsters: [monster('Kobold Dragonshield', 2, 1, 0), monster('Orc Smasher', 2, 2, 2), monster('Grell', 2, 2, 4)],
        xp: 3,
        turn: { ...initialState.turn, round: 2 },
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
      // The card is copied into the game, so later edits to the card file don't change a game in progress.
      const card = action.card
        ? {
            id: String(action.card.id),
            name: String(action.card.name),
            text: String(action.card.text ?? ''),
            attack: action.card.attack ? String(action.card.attack) : '',
            damage: action.card.damage ? String(action.card.damage) : '',
          }
        : null
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
      if (!hero || hero.level >= 2 || state.xp < XP_TO_LEVEL_UP) return state
      const leveled = updateHero({ ...state, xp: state.xp - XP_TO_LEVEL_UP }, hero.id, (h) => ({
        level: 2,
        maxHp: h.maxHp + LEVEL_UP_HP_BONUS,
        hp: h.hp + LEVEL_UP_HP_BONUS,
      }))
      return withMoment(withLog(leveled, `${hero.name} reached level 2!`), {
        kind: 'level',
        heroId: hero.id,
        title: `${hero.name} reached level 2!`,
        detail: 'Flip your hero card!',
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
      return withMoment(withLog(next, `The ${monster.name} was defeated! +${monster.xp} XP`), {
        kind: 'defeat',
        title: `${monster.name} defeated!`,
        detail: `+${monster.xp} XP for the party`,
      })
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
