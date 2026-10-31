import { describe, expect, it } from 'vitest'
import { normalizeCardFile } from '../data/cards.js'
import { buildChamberDeck, campaignOutcome } from './campaign.js'
import { encounterCount, gameReducer, initialState } from './game.js'

// Made-up cards in the card file's shape, so the tests don't need the real ones.
const cards = normalizeCardFile({
  powers: [
    { id: 'jab', hero: 'fighter', type: 'at-will', name: 'Jab' },
    { id: 'big-hit', hero: 'fighter', type: 'daily', name: 'Big Hit' },
    { id: 'huge-hit', hero: 'fighter', type: 'daily', name: 'Huge Hit' },
  ],
  monsters: [
    { id: 'snake', name: 'Snake', copies: 3, ac: 10, hp: 1, xp: 1, types: ['Reptile'], attacks: [{ id: 'bite', name: 'Bite', bonus: 5, damage: 1 }], tactics: [{ move: 'toward' }] },
    { id: 'orc', name: 'Orc', copies: 3, ac: 10, hp: 1, xp: 1, types: ['Orc'], attacks: [{ id: 'axe', name: 'Axe', bonus: 5, damage: 1 }], tactics: [{ move: 'toward' }] },
  ],
  villains: [
    { id: 'kobold-boss', name: 'Kobold Boss', ac: 10, hp: 1, attacks: [{ id: 'spear', name: 'Spear', bonus: 5, damage: 1 }], tactics: [{ move: 'toward' }] },
    { id: 'orc-boss', name: 'Orc Boss', ac: 10, hp: 1, attacks: [{ id: 'axe', name: 'Axe', bonus: 5, damage: 1 }], tactics: [{ move: 'toward' }] },
    { id: 'dragon', name: 'Dragon', ac: 10, hp: 1, attacks: [{ id: 'claw', name: 'Claw', bonus: 5, damage: 1 }], tactics: [{ move: 'toward' }] },
  ],
  chambers: [
    { id: 'kobold-lair', name: 'Kobold Lair', goal: 'Beat the Kobold Boss.', villain: 'Kobold Boss', monsters: { perPlayer: 0 }, win: { villain: true } },
    { id: 'orc-lair', name: 'Orc Lair', goal: 'Beat the Orc Boss.', villain: 'Orc Boss', monsters: { perPlayer: 0 }, win: { villain: true } },
    { id: 'regiment', name: 'Regiment', goal: 'Beat them all.', monsters: { perPlayer: 1 }, win: { chamberMonsters: true } },
    { id: 'dragon-lair', name: 'Dragon Lair', goal: 'Beat the Dragon.', villain: 'Dragon', monsters: { perPlayer: 0 }, win: { villain: true } },
    { id: 'pit', name: 'Pit', goal: 'Beat them all.', monsters: { perPlayer: 1 }, win: { chamberMonsters: true } },
    { id: 'hall', name: 'Hall', goal: 'Beat them all.', monsters: { perPlayer: 1 }, win: { chamberMonsters: true } },
    { id: 'den', name: 'Den', goal: 'Beat them all.', monsters: { perPlayer: 1 }, win: { chamberMonsters: true } },
  ],
  treasures: [
    { id: 'sword', name: 'Sword', cost: 1000, inPlay: true, attackBonus: 1 },
    { id: 'potion', name: 'Potion', copies: 2, cost: 300 },
    { id: 'blessing', name: 'Blessing', copies: 3 },
  ],
  boons: [
    { id: 'kobolds-clobbered', name: 'Kobolds Clobbered!', use: 'discardMonster', monsterTypes: ['Reptile', 'Animal'] },
    { id: 'short-cut', name: 'Short Cut!', use: 'startTile' },
    { id: 'traders', name: 'Traders!', use: 'shop', shopCards: 5 },
  ],
  treasureTokens: [{ gold: 100, count: 2 }, { gold: 250 }, { treasure: true }],
  adventures: [
    {
      id: 'clans', title: 'Clans', goal: 'Beat the clans.', needs: ['chambers', 'villains', 'campaign'],
      reveals: [{ tile: 'Dire Chamber Entrance', actions: [{ type: 'chamber' }] }],
      win: { chamber: true },
      campaign: { chambers: ['kobold-lair', 'orc-lair'], boonsFor: { 'kobold-lair': 'kobolds-clobbered' } },
    },
    {
      id: 'assault', title: 'Assault', goal: 'Reach the dragon.', needs: ['chambers', 'villains', 'campaign'],
      reveals: [{ tile: 'Dire Chamber Entrance', actions: [{ type: 'chamber' }] }],
      win: { chamber: true },
      campaign: { final: 'dragon-lair', finalWith: 2, hard: 'regiment', boonsAfter: { 1: 'short-cut' }, secondChance: true },
    },
  ],
})
const [clans, assault] = cards.adventures
const random = Array.from({ length: 128 }, (_, i) => ((i * 37) % 100) / 100)

// Two iPads claim heroes in the lobby, and the projector starts the adventure.
function lobbyStart(state, keys = ['fighter', 'rogue']) {
  for (const key of keys) {
    if (!state.lobby.some((c) => c.heroKey === key)) state = gameReducer(state, { type: 'CLAIM_HERO', deviceId: `ipad-${key}`, heroKey: key })
    state = gameReducer(state, { type: 'SET_LOBBY_PLAYER', deviceId: `ipad-${key}`, player: state.lobby.find((c) => c.heroKey === key).player || key })
    state = gameReducer(state, { type: 'SET_LOBBY_READY', deviceId: `ipad-${key}`, ready: true })
  }
  return gameReducer(state, { type: 'START_GAME', treasureCards: cards.treasures, chambers: cards.chambers, tokens: cards.treasureTokens, random })
}
const startCampaign = (adventure) => lobbyStart(gameReducer({ ...initialState }, { type: 'CHOOSE_ADVENTURE', adventure }))
const reveal = (state) => gameReducer(state, { type: 'ADVENTURE_REVEAL', tile: 'Dire Chamber Entrance', cards: cards.monsters, villains: cards.villains, chambers: cards.chambers, random })
const beatChamber = (state) => {
  for (const foe of [...state.villains.filter((v) => !v.defeated), ...state.monsters.filter((m) => m.chamber)]) state = gameReducer(state, { type: 'DEFEAT_MONSTER', monsterId: foe.id })
  return state
}
const next = (state) => gameReducer(state, { type: 'CAMPAIGN_NEXT', treasureCards: cards.treasures, boons: cards.boons, random })

describe('campaign cards', () => {
  it('reads campaign rules, boons, treasure tokens and shop prices', () => {
    expect(cards.problems).toEqual([])
    expect(assault.campaign).toMatchObject({ final: 'dragon-lair', finalWith: 2, hard: 'regiment', boonsAfter: { 1: 'short-cut' }, secondChance: true })
    expect(cards.boons.map((b) => b.use)).toEqual(['discardMonster', 'startTile', 'shop'])
    expect(cards.treasureTokens).toHaveLength(4)
    expect(cards.treasures.map((t) => t.cost)).toEqual([1000, 300, 0])
  })

  it('builds the Chamber deck: the final chamber in the last few, the hard one above them', () => {
    for (const r of [random, [], random.map((n) => 0.99 - n)]) {
      const deck = buildChamberDeck(assault.campaign, cards.chambers, r)
      expect([...deck].sort()).toEqual(cards.chambers.map((c) => c.id).sort())
      expect(deck.slice(-3)).toContain('dragon-lair')
      expect(deck.slice(0, -3)).toContain('regiment')
    }
    expect([...buildChamberDeck(clans.campaign, cards.chambers, random)].sort()).toEqual(['kobold-lair', 'orc-lair'])
  })
})

describe('Campaign Against the Clans', () => {
  it('plays the clans one by one, keeping heroes, gold and boons, then wins', () => {
    let state = startCampaign(clans)
    expect(state.campaign.deck).toHaveLength(2)
    expect(state.heroes.every((h) => h.items.length === 1)).toBe(true) // the usual starting treasure, first time only
    const first = state.campaign.deck[0]
    state = reveal(state)
    expect(state.adventure.chamber.card.id).toBe(first)

    const fighter = state.heroes[0]
    state = gameReducer(state, { type: 'LEVEL_UP', heroId: fighter.id })
    state = { ...state, heroes: state.heroes.map((h) => (h.id === fighter.id ? { ...h, level: 2, gold: 400 } : h)) }
    state = beatChamber(state)
    expect(state.status).toBe('won')
    expect(campaignOutcome(state)).toMatchObject({ won: true, beaten: [first], over: null })

    state = next(state)
    expect(state.status).toBe('setup')
    expect(state.campaign.beaten).toEqual([first])
    expect(state.campaign.boons).toEqual(first === 'kobold-lair' ? ['kobolds-clobbered'] : [])
    expect(state.campaign.shop).toHaveLength(3)
    expect(state.lobbyAdventure.id).toBe('clans')
    // Each iPad gets its hero back, name and all; the level 2 fighter has a sixth power slot.
    expect(state.lobby.map((c) => [c.deviceId, c.player, c.picks.length])).toEqual([
      ['ipad-fighter', 'fighter', 6],
      ['ipad-rogue', 'rogue', 5],
    ])
    // Only the campaign's heroes, and the adventure can't change.
    expect(gameReducer(state, { type: 'CLAIM_HERO', deviceId: 'ipad-3', heroKey: 'wizard' })).toBe(state)
    expect(gameReducer(state, { type: 'CHOOSE_ADVENTURE', adventure: assault })).toBe(state)

    state = lobbyStart(state)
    expect(state.status).toBe('playing')
    const again = state.heroes[0]
    expect(again).toMatchObject({ key: 'fighter', level: 2, gold: 400, maxHp: 10, ac: 18 })
    expect(again.powers).toHaveLength(6)
    // Kept treasure, plus a new starting card from a deck without the cards the heroes hold.
    expect(again.items).toHaveLength(2)
    const held = state.heroes.flatMap((h) => h.items.map((i) => i.cardId))
    const copies = (id) => cards.treasures.find((t) => t.id === id).copies
    for (const id of new Set(held)) expect(held.filter((x) => x === id).length + state.treasureDeck.draw.filter((x) => x === id).length).toBe(copies(id))

    state = beatChamber(reveal(state))
    expect(state.adventure.chamber.card.id).not.toBe(first)
    expect(campaignOutcome(state)).toMatchObject({ won: true, over: 'won' })
    // The campaign is over, so there's no next adventure, and New game clears it.
    expect(next(state)).toBe(state)
    expect(gameReducer(state, { type: 'NEW_GAME' }).campaign).toBe(null)
  })

  it('is lost with the first defeat', () => {
    let state = startCampaign(clans)
    state = gameReducer(state, { type: 'END_GAME', result: 'lost' })
    expect(campaignOutcome(state)).toMatchObject({ won: false, over: 'lost' })
  })

  it('keeps the campaign through New game until it is over', () => {
    let state = startCampaign(clans)
    const { deck } = state.campaign
    state = gameReducer(state, { type: 'NEW_GAME' })
    expect(state.status).toBe('setup')
    expect(state.campaign.deck).toEqual(deck)
    expect(state.lobby).toHaveLength(2)
    state = gameReducer(state, { type: 'END_CAMPAIGN' })
    expect(state.campaign).toBe(null)
  })

  // Found by the robot playing whole campaigns: the campaign's record of its heroes lost
  // their gold and items when the next adventure started, so a New game partway through
  // that adventure brought them back broke.
  it('keeps the heroes’ gold and items through a New game in a later adventure', () => {
    let state = startCampaign(clans)
    state = { ...state, heroes: state.heroes.map((h, i) => (i === 0 ? { ...h, gold: 400 } : h)) }
    state = next(beatChamber(reveal(state)))
    const before = state.campaign.heroes.map((h) => [h.key, h.gold, h.items.map((i) => i.cardId)])
    expect(before[0][1]).toBe(400)
    state = lobbyStart(state)
    expect(state.campaign.heroes.map((h) => [h.key, h.gold, h.items.map((i) => i.cardId)])).toEqual(before)
    state = gameReducer(state, { type: 'NEW_GAME' })
    expect(state.campaign.heroes.map((h) => [h.key, h.gold, h.items.map((i) => i.cardId)])).toEqual(before)
    state = lobbyStart(state)
    expect(state.heroes[0].gold).toBe(400)
  })

  // Also found by the robot: "Start a demo game" on a screen's "Who stands here?" in the
  // campaign lobby wiped the whole campaign.
  it('won’t start a demo game over a campaign that’s still going', () => {
    let state = startCampaign(clans)
    expect(gameReducer(state, { type: 'START_DEMO' })).toBe(state)
    state = next(beatChamber(reveal(state)))
    expect(gameReducer(state, { type: 'START_DEMO' })).toBe(state)
    state = beatChamber(reveal(lobbyStart(state)))
    expect(campaignOutcome(state).over).toBe('won')
    expect(gameReducer(state, { type: 'START_DEMO' }).campaign).toBe(null)
  })
})

describe('Assault on Firestorm Peak', () => {
  it('gives a second chance with one fewer healing surge, then loses', () => {
    let state = startCampaign(assault)
    expect(state.surges).toBe(2)
    state = reveal(state)
    const lost = state.adventure.chamber.card.id
    state = gameReducer(state, { type: 'END_GAME', result: 'lost' })
    expect(campaignOutcome(state)).toMatchObject({ won: false, over: null, defeats: 1 })
    state = lobbyStart(next(state))
    expect(state.surges).toBe(1)
    expect(state.campaign.deck).not.toContain(lost) // on to the next quest
    state = gameReducer(state, { type: 'END_GAME', result: 'lost' })
    expect(campaignOutcome(state)).toMatchObject({ over: 'lost' })
  })

  it('earns a boon for the first chamber, and the Elite Regiment doubles encounters from then on', () => {
    let state = startCampaign(assault)
    state = { ...state, campaign: { ...state.campaign, deck: ['regiment', ...state.campaign.deck.filter((id) => id !== 'regiment')] } }
    state = reveal(state)
    expect(state.adventure.doubleEncounters).toBe(true)
    expect(encounterCount(state, state.heroes[0])).toBe(2)
    state = beatChamber(state)
    expect(campaignOutcome(state).boons).toEqual(['short-cut'])
    state = lobbyStart(next(state))
    expect(state.adventure.doubleEncounters).toBe(true)

    // Short Cut!: before the first turn, the top tile goes down with no monster.
    const tiles = state.tileStack.stack.length
    const boon = cards.boons.find((b) => b.id === 'short-cut')
    state = gameReducer(state, { type: 'USE_BOON', boon })
    expect(state.tileStack.stack.length).toBe(tiles - 1)
    expect(state.monsters).toHaveLength(0)
    expect(gameReducer(state, { type: 'USE_BOON', boon })).toBe(state) // once per adventure
  })
})

describe('treasure tokens, boons and the shop', () => {
  it('gives a Treasure token for a defeated monster: gold, or a treasure card', () => {
    let state = startCampaign(clans)
    state = { ...state, tokenStack: [{ gold: 250, treasure: false }, { gold: 0, treasure: true }, { gold: 100, treasure: false }] }
    state = gameReducer(state, { type: 'ADD_MONSTER', name: 'Rat', hp: 1, xp: 1, ownerId: state.heroes[0].id })
    state = gameReducer(state, { type: 'DEFEAT_MONSTER', monsterId: state.monsters[0].id })
    expect(state.turn.tokenOwed).toBe(state.heroes[0].id)
    expect(state.turn.treasureOwed).toBeFalsy()
    state = gameReducer(state, { type: 'DRAW_TREASURE_TOKEN' })
    expect(state.heroes[0].gold).toBe(250)
    expect(state.turn.tokenOwed).toBe(null)

    state = { ...state, turn: { ...state.turn, tokenOwed: state.heroes[0].id } }
    state = gameReducer(state, { type: 'DRAW_TREASURE_TOKEN' })
    expect(state.turn.treasureOwed).toBe(state.heroes[0].id) // now draw a treasure card

    // Dragon's Tribute: two tokens, keep the lower.
    state = { ...state, tokenStack: [{ gold: 250, treasure: false }, { gold: 100, treasure: false }], environment: { cardId: 'dragon-s-tribute' }, turn: { ...state.turn, tokenOwed: state.heroes[1].id } }
    state = gameReducer(state, { type: 'DRAW_TREASURE_TOKEN' })
    expect(state.heroes[1].gold).toBe(100)
    expect(state.tokenStack).toEqual([])

    // The real stack: the player says what the token was.
    state = { ...state, environment: null, turn: { ...state.turn, tokenOwed: state.heroes[1].id } }
    state = gameReducer(state, { type: 'DRAW_TREASURE_TOKEN', token: { gold: 200 } })
    expect(state.heroes[1].gold).toBe(300)
  })

  it('discards a monster just drawn with a boon, once per adventure', () => {
    let state = startCampaign(clans)
    state = { ...state, campaign: { ...state.campaign, boons: ['kobolds-clobbered'] } }
    const boon = cards.boons[0]
    // An Orc isn't a Reptile.
    state = gameReducer(state, { type: 'DRAW_MONSTER', heroId: state.heroes[1].id, cards: [cards.monsters[1]], random })
    expect(gameReducer(state, { type: 'USE_BOON', boon, monsterId: state.monsters[0].id })).toBe(state)
    state = { ...state, monsters: [], monsterDeck: null }
    state = gameReducer(state, { type: 'DRAW_MONSTER', heroId: state.heroes[0].id, cards: [cards.monsters[0]], random })
    const snake = state.monsters[0]
    // Only a monster drawn this turn.
    expect(gameReducer({ ...state, turn: { ...state.turn, heroIndex: 1 } }, { type: 'USE_BOON', boon, monsterId: snake.id }).monsters).toHaveLength(1)
    state = gameReducer(state, { type: 'USE_BOON', boon, monsterId: snake.id })
    expect(state.monsters).toHaveLength(0)
    expect(state.monsterDeck.discard).toContain('snake')
    expect(state.adventure.boonsUsed).toEqual(['kobolds-clobbered'])
  })

  it('sells shop cards for a hero’s own gold', () => {
    let state = startCampaign(clans)
    state = { ...state, heroes: state.heroes.map((h, i) => ({ ...h, gold: i === 0 ? 1000 : 100 })) }
    state = next(beatChamber(reveal(state)))
    const card = state.campaign.shop.find((c) => c.cost > 0)
    const poor = gameReducer(state, { type: 'CAMPAIGN_BUY', heroKey: 'rogue', cardId: card.id })
    expect(poor).toBe(state)
    state = gameReducer(state, { type: 'CAMPAIGN_BUY', heroKey: 'fighter', cardId: card.id })
    const fighter = state.campaign.heroes.find((h) => h.key === 'fighter')
    expect(fighter.gold).toBe(1000 - card.cost)
    expect(fighter.items.at(-1).cardId).toBe(card.id)
    expect(state.campaign.shop).toHaveLength(2)
  })
})
