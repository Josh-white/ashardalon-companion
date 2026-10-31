// A new game's state, before anyone picks a hero. Every saved game has this shape
// (state/saves.js upgrades older ones).
import { STARTING_SURGES } from '../data/heroes.js'
import { STARTING_TILES } from './tiles.js'

export const SAVE_VERSION = 1

export const initialState = {
  version: SAVE_VERSION,
  status: 'setup', // setup | playing | won | lost
  heroes: [],
  surges: STARTING_SURGES,
  difficulty: 'normal', // easy | normal | hard (src/data/difficulty.js)
  secondChances: [], // Easy: heroes who used their one reroll this adventure
  xp: 0,
  monsters: [],
  turn: { heroIndex: 0, phase: 0, round: 1 },
  log: [],
  moment: null, // the latest big moment, shown on every screen for a few seconds
  // Before the game starts, each iPad claims one hero and picks its powers here.
  lobby: [], // { deviceId, heroKey, player, picks: [card | null] per power slot, ready }
  // The virtual monster deck, built from the monster cards on the first draw.
  monsterDeck: null, // { cards: { [cardId]: card }, draw: [cardId], discard: [cardId] }
  // The virtual encounter deck, built the same way on the first encounter draw.
  encounterDeck: null,
  encounter: null, // the encounter card being read out: { id, cardId, heroId, card, attacked }
  environment: null, // the Environment card in play: { cardId, name, card }
  traps: [], // trap and hazard markers on the board: { id, cardId, name, type, ownerId, card }
  // Villains an adventure put on the board. A defeated villain stays here with
  // defeated: true, so an adventure can tell it was beaten.
  villains: [],
  adventure: null, // the adventure being played (state/adventure.js), or null for a free game
  // Chosen on the projector before the game: the adventure card and how many healing surges.
  lobbyAdventure: null,
  lobbySurges: STARTING_SURGES,
  // Easy / Normal / Hard (src/data/difficulty.js); the game keeps it as `difficulty`.
  lobbyDifficulty: 'normal',
  // The virtual treasure deck, built on the first treasure draw.
  treasureDeck: null,
  treasure: null, // the treasure card just drawn, waiting for a hero to take it: { id, cardId, heroId, card }
  // Villagers a chamber put on the board (Free the Captives). A villager killed by a
  // monster stays here with removed: true, so its roll range activates no one.
  villagers: [],
  // Adventure encounter cards waiting to go into the encounter deck at the next draw:
  // an id goes into the top 3 cards, { id, top: true } on top.
  encounterAdds: [],
  // Cards that go back on top of the deck right after the next draw (Ceremony Progresses!).
  encounterAfter: [],
  // The dungeon tile stack (state/tiles.js): { stack: ['' | special tile name], drawn }, top first.
  tileStack: null,
  lobbyTiles: STARTING_TILES,
  // Chosen in the lobby: the party plays on the virtual board instead of real tiles.
  lobbyBoard: false,
  soundboard: null, // the players' sound board (state/soundboard.js): { off, last, turn, used }
  stats: {}, // each hero's bragging rights for the end-of-game recap (state/stats.js), by hero id
  // A campaign (state/campaign.js) lasts across games: New game keeps it until it's over.
  campaign: null,
  // Treasure tokens left in a campaign adventure's stack: { gold, treasure }.
  tokenStack: null,
  // The roll for first turn at the start of a game (state/firstRoll.js), or null.
  firstRoll: null,
  // The adventure's story at the start of a game (state/opening.js), or null.
  opening: null,
  // The virtual board for a solo game (board/play.js), or null when the real tiles are on the table.
  board: null,
  // How a lost game ended, in words for the recap ("Quinn fell with no healing surges left."),
  // or null when the players said they lost.
  ending: null,
  // The settings the game started with, so Try again can start it the same way: { surges, tiles }.
  retry: null,
}
