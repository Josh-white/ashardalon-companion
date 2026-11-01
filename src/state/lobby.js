// The lobby before a game: claiming heroes, names, power picks, Ready, and the game's
// settings (adventure, difficulty, surges, tiles, virtual board). Split out of game.js.
import { difficultyOf } from '../data/difficulty.js'
import { STARTING_SURGES, templateFor } from '../data/heroes.js'
import { MAX_TILES, MIN_TILES, STARTING_TILES } from './tiles.js'
import { isPlayable, MAX_SURGES, MIN_SURGES } from './adventure.js'
import { campaignHero } from './campaign.js'
import { clamp } from './gameHelpers.js'
import { copyCard, levelSlots, pickedElsewhere, updateClaim } from './heroSetup.js'

// The actions lobbyReducer handles; gameReducer hands these over (game.js).
export const LOBBY_ACTIONS = new Set(['CHOOSE_ADVENTURE', 'CLAIM_HERO', 'RELEASE_HERO', 'SET_LOBBY_ALLY', 'SET_LOBBY_BOARD', 'SET_LOBBY_DIFFICULTY', 'SET_LOBBY_PICK', 'SET_LOBBY_PLAYER', 'SET_LOBBY_READY', 'SET_LOBBY_SURGES', 'SET_LOBBY_TILES'])

export function lobbyReducer(state, action) {
  switch (action.type) {
    case 'CHOOSE_ADVENTURE': {
      // Only before the game, and only an adventure the app can run.
      if (state.status !== 'setup' || state.campaign) return state
      const card = action.adventure ?? null
      if (card && !isPlayable(card)) return state
      return { ...state, lobbyAdventure: card }
    }

    case 'SET_LOBBY_DIFFICULTY': {
      if (state.status !== 'setup') return state
      const picked = difficultyOf(action.difficulty)
      return { ...state, lobbyDifficulty: picked.key, lobbySurges: picked.surges }
    }

    case 'SET_LOBBY_SURGES':
      if (state.status !== 'setup') return state
      return { ...state, lobbySurges: clamp(Number(action.surges) || STARTING_SURGES, MIN_SURGES, MAX_SURGES) }

    case 'SET_LOBBY_TILES':
      if (state.status !== 'setup') return state
      return { ...state, lobbyTiles: clamp(Number(action.tiles) || STARTING_TILES, MIN_TILES, MAX_TILES) }

    case 'SET_LOBBY_BOARD':
      if (state.status !== 'setup') return state
      return { ...state, lobbyBoard: Boolean(action.on) }

    case 'CLAIM_HERO': {
      const template = templateFor(action.heroKey)
      const lobby = state.lobby ?? []
      if (state.status !== 'setup' || !template || !action.deviceId) return state
      // One hero per iPad, and nobody can take a hero another iPad already has.
      if (lobby.some((c) => c.heroKey === template.key && c.deviceId !== action.deviceId)) return state
      // A campaign's heroes come back with their level, name and powers.
      const saved = campaignHero(state, template.key)
      if (state.campaign && !saved) return state
      const previous = lobby.find((c) => c.deviceId === action.deviceId)
      const slots = levelSlots(template, saved?.level)
      const picks = slots.map((_, i) => copyCard((saved ? saved.picks : action.picks)?.[i]))
      // A computer ally (src/ally/) is ready straight away, with the suggested powers.
      const ally = action.ally === true
      const player = ally ? '' : saved?.player ?? previous?.player ?? String(action.player ?? '').slice(0, 40)
      const claim = { deviceId: action.deviceId, heroKey: template.key, player, picks, ready: ally, ...(ally ? { ally: true } : {}) }
      return { ...state, lobby: [...lobby.filter((c) => c.deviceId !== action.deviceId), claim] }
    }

    // The solo screen hands one of its heroes to the computer (src/ally/), or takes it back.
    case 'SET_LOBBY_ALLY':
      if (state.status !== 'setup') return state
      return updateClaim(state, action.deviceId, () => ({ ally: Boolean(action.ally) }))

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

    default:
      return state
  }
}
