// Changing the party in the middle of a game: how hard it is (Story to Hard), handing a hero
// to the computer (src/ally/) and back, a new hero joining, and the allies' pause and help.
// Split out of game.js.
import { difficultyOf } from '../data/difficulty.js'
import { templateFor } from '../data/heroes.js'
import { placeNear } from '../board/play.js'
import { playerName, updateHero, withLog, withMoment } from './gameHelpers.js'
import { copyCard, createHero, levelSlots, withPicks } from './heroSetup.js'
import { gameHeroLimit } from './adventure.js'
import { heroRecord } from './campaignPlay.js'

// The actions partyReducer handles; gameReducer hands these over (game.js).
export const PARTY_ACTIONS = new Set(['ALLY_HELP', 'ALLY_PAUSE', 'JOIN_GAME', 'SET_ALLY', 'SET_DIFFICULTY'])

export function partyReducer(state, action) {
  switch (action.type) {
    // Switching how hard it is in the middle of a game (Story, Easy, Normal, Hard). The healing
    // surges go up or down by the difference in extra surges; the lobby keeps the choice for
    // Try again and the next campaign adventure.
    case 'SET_DIFFICULTY': {
      if (state.status !== 'playing') return state
      const from = difficultyOf(state.difficulty)
      const to = difficultyOf(action.difficulty)
      if (from.key === to.key) return state
      const surges = Math.max(0, state.surges + to.extraSurges - from.extraSurges)
      const change = surges - state.surges
      const words = change > 0 ? ` +${change} healing surge${change === 1 ? '' : 's'}.` : change < 0 ? ` ${change} healing surge${change === -1 ? '' : 's'}.` : ''
      return withLog(
        {
          ...state,
          difficulty: to.key,
          surges,
          lobbyDifficulty: to.key,
          retry: state.retry ? { ...state.retry, difficulty: to.key } : state.retry,
        },
        `${to.icon} Switched to ${to.label}: ${to.detail}.${words}`,
      )
    }

    // A hero handed to the computer, or taken back (src/ally/). Only on the virtual board,
    // where the computer can see where everything is.
    case 'SET_ALLY': {
      const hero = state.heroes.find((h) => h.id === action.heroId)
      const ally = Boolean(action.ally)
      if (state.status !== 'playing' || !state.board || !hero || Boolean(hero.ally) === ally) return state
      const next = updateHero(state, hero.id, () => ({ ally }))
      const text = ally ? `🤖 The computer is playing ${hero.name} now.` : playerName(hero) ? `${playerName(hero)} is playing ${hero.name} again.` : `You are playing ${hero.name} again.`
      return withLog({ ...next, allyPaused: ally ? false : next.allyPaused, turn: { ...next.turn, allyHelp: null } }, text)
    }

    // A hero joins a game already going (Easton wants in): on a free square next to whoever's
    // turn it is, and in the turn order right after them. In a campaign the hero joins at
    // level 1 with no gold or items, and stays for the later adventures.
    case 'JOIN_GAME': {
      const template = templateFor(action.heroKey)
      if (state.status !== 'playing' || !template || state.heroes.some((h) => h.key === template.key)) return state
      // Not while the party is still rolling for first turn: that roll is only for the heroes in it.
      if (state.firstRoll && !state.firstRoll.winner) return state
      // Not past the number of heroes the adventure is for.
      if (state.heroes.length >= gameHeroLimit(state)) return state
      const ally = action.ally === true && Boolean(state.board)
      const player = ally ? '' : String(action.player ?? '').slice(0, 40)
      if (!ally && !player.trim()) return state
      const slots = levelSlots(template, 1)
      const picks = slots.map((_, i) => copyCard(action.picks?.[i]))
      const hero = { ...withPicks(createHero(template), picks), player, ...(ally ? { ally: true } : {}) }
      const at = state.turn.heroIndex + 1
      let next = { ...state, heroes: [...state.heroes.slice(0, at), hero, ...state.heroes.slice(at)] }
      const active = state.heroes[state.turn.heroIndex]
      const near = state.board && (state.board.tokens[active?.id] ?? Object.values(state.board.tokens)[0])
      if (near) next = placeNear(next, { id: hero.id }, near)
      if (state.campaign) next = { ...next, campaign: { ...state.campaign, heroes: [...state.campaign.heroes, heroRecord(hero, action.deviceId ?? null)] } }
      const who = ally ? `🤖 The computer brings ${hero.name}` : `${player} brings ${hero.name}`
      const where = state.board ? '' : ` Put ${hero.name}'s figure next to ${active?.name ?? 'the party'}.`
      const text = `${who} into the dungeon! ${hero.name} goes after ${active?.name ?? 'the hero whose turn it is'}.${where}`
      return withMoment(withLog(next, text), { kind: 'join', heroId: hero.id, title: `${hero.name} joins the party!`, detail: `${hero.name} goes after ${active?.name ?? 'this hero'}.` })
    }

    // Holding the computer allies still (a player wants to play the ally's turn by hand).
    case 'ALLY_PAUSE':
      if (Boolean(state.allyPaused) === Boolean(action.paused)) return state
      return { ...state, allyPaused: Boolean(action.paused), turn: { ...state.turn, allyHelp: null } }

    // The ally couldn't work out what to do: every screen offers to tap for it.
    case 'ALLY_HELP': {
      const reason = typeof action.reason === 'string' ? action.reason.slice(0, 200) : null
      if ((state.turn.allyHelp ?? null) === reason) return state
      return { ...state, turn: { ...state.turn, allyHelp: reason } }
    }

    default:
      return state
  }
}
