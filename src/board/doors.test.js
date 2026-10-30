import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { normalizeCardFile } from '../data/cards.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import { DOOR_MIX, doorsNearHero, drawDoorKind } from './doors.js'
import { key, unexploredEdges } from './grid.js'
import { boardGrid, layTile } from './play.js'
import { normalizeTiles } from './tileDefs.js'

// Made-up layouts, shaped like the box's.
const room = (id, name, kind, extra = {}) => ({ id, name, kind, triangle: 'black', rows: ['....', '.S..', '....', '....'], exits: { N: 'oooo', S: 'oooo', W: 'oooo', E: 'oooo' }, ...extra })
const TILES = normalizeTiles(
  [
    { id: 'start', name: 'Start', kind: 'start', rows: ['...#', '...#', '...#', '...#', '...#', '...#', '...#', '...#'], exits: { N: 'ooox', S: 'ooox', W: 'oooooooo', E: 'xxxxxxxx' }, features: [{ type: 'stairs', at: [[1, 3], [2, 3], [1, 4], [2, 4]] }] },
    { id: 'ancient-battlefield', name: 'Ancient Battlefield', kind: 'start', rows: ['...S', '....', '....', '####'], exits: { N: 'oooo', S: 'xxxx', W: 'ooox', E: 'ooox' } },
    room('tile-09', 'Tile 9', 'regular', { triangle: 'white', exits: { N: 'xoox', S: 'xoox', W: 'xxxx', E: 'xoox' }, rows: ['#..#', '#...', '#S..', '#..#'], features: [{ type: 'door', at: [[3, 1], [3, 2]] }] }),
    room('tile-12', 'Tile 12', 'regular', { triangle: 'white', features: [{ type: 'door', at: [[1, 0], [2, 0]] }] }),
    room('tile-14', 'Tile 14', 'regular', { features: [{ type: 'door', at: [[1, 0], [2, 0]] }] }),
    room('horrid-chamber-entrance', 'Horrid Chamber Entrance', 'chamber', { triangle: 'red', rows: ['....', '....', '.S..', '#..#'], exits: { N: 'oooo', S: 'xoox', W: 'ooox', E: 'ooox' } }),
    ...[1, 2, 3, 4].map((n) => room(`horrid-chamber-${n}`, 'Horrid Chamber', 'chamber', { triangle: 'white' })),
  ],
  [],
)

const { adventures, chambers, monsters, villains } = normalizeCardFile({
  powers: [],
  monsters: [{ id: 'rat', name: 'Rat', copies: 6, ac: 12, hp: 1, xp: 1, types: ['Animal'], attacks: [{ id: 'bite', name: 'Bite', bonus: 5, damage: 1 }], tactics: [{ move: 'toward' }] }],
  villains: [{ id: 'boss', name: 'Big Boss', ac: 12, hp: 4, attacks: [{ id: 'axe', name: 'Axe', bonus: 5, damage: 2 }], tactics: [{ move: 'toward' }] }],
  chambers: [{ id: 'lair', name: 'Lair', goal: 'Destroy the Big Boss!', villain: 'Big Boss', monsters: {}, win: { villain: true } }],
  adventures: [
    {
      id: 'closed-doors', title: 'The Closed Doors', goal: 'Open the secret door.', needs: ['doors'],
      setup: ['Place the Ancient Battlefield Start tile on the table.', "Place the two Door Tiles with white triangles next to the Ancient Battlefield Start tile (as in the book's diagram)."],
      reveals: [
        { tile: 'Horrid Chamber Entrance', steps: ['Place a Closed Door token on the triangle on the tile. This is the Secret Chamber door.', 'Draw and place a Horrid Chamber tile next to each unexplored edge.'], actions: [] },
        { tile: 'Secret Chamber door', door: true, after: 'Horrid Chamber Entrance', story: 'Eyes!', actions: [{ type: 'chamber', name: 'Lair' }] },
      ],
      win: { chamber: true },
    },
    { id: 'secret-tunnel', title: 'Find the Secret Tunnel', goal: 'Win.', needs: ['doors'], setup: ['Place the Start tile on the table.'] },
    { id: 'plain', title: 'Plain', goal: 'Win.', setup: ['Place the Start tile on the table.'] },
  ],
})

const start = (adventure, count = 2) => {
  const heroes = HERO_TEMPLATES.slice(0, count).map((t) => createHero(t))
  const lobby = { ...initialState, lobbyAdventure: adventure }
  return { ...gameReducer(lobby, { type: 'START_GAME', heroes, tileRandom: [], boardTiles: TILES }), firstRoll: null }
}
const put = (state, id, at) => ({ ...state, board: { ...state.board, tokens: { ...state.board.tokens, [id]: at } } })
// A free floor square next to one of the door's squares.
const besideDoor = (state, door) => {
  const grid = boardGrid(state.board)
  const [x, y] = door.squares[0]
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const sq = grid.get(key([x + dx, y + dy]))
    if (sq?.floor && !sq.door) return [sq.x, sq.y]
  }
  return null
}

describe('Closed Doors on the virtual board', () => {
  it('The Closed Doors: a face-down door on each door symbol of the two tiles next to the start', () => {
    const state = start(adventures[0])
    expect(state.board.doors).toHaveLength(2)
    expect(state.board.doorTokens).toBe(6)
    expect(state.board.doors.every((d) => d.kind === null && d.squares.length === 2)).toBe(true)
  })

  it("shuts the door's squares: no one walks onto them and no edge opens past them", () => {
    const state = start(adventures[0])
    const grid = boardGrid(state.board)
    for (const door of state.board.doors) for (const sq of door.squares) expect(grid.get(key(sq))).toMatchObject({ floor: false, door: door.id })
    const doorSquares = new Set(state.board.doors.flatMap((d) => d.squares.map(key)))
    for (const edge of unexploredEdges(grid)) for (const sq of edge.squares) expect(doorSquares.has(key(sq))).toBe(false)
  })

  it('puts a door on a drawn tile with a door symbol, only in a door adventure', () => {
    const drawn = (adventure) => {
      let state = start(adventure, 1)
      state = { ...state, board: { ...state.board, pile: ['tile-14', ...state.board.pile.filter((id) => id !== 'tile-14')] } }
      return layTile(state, '', 'explore').state
    }
    const doors = drawn(adventures[1])
    expect(doors.board.doors).toHaveLength(1)
    expect(doors.board.doorTokens).toBe(7)
    expect(drawn(adventures[2]).board.doors ?? []).toHaveLength(0)
  })

  it('a hero next to a door can open it; an Unlocked Door goes away', () => {
    let state = start(adventures[0])
    const hero = state.heroes[0]
    const door = state.board.doors[0]
    expect(doorsNearHero(state, hero)).toEqual([])
    state = put(state, hero.id, besideDoor(state, door))
    expect(doorsNearHero(state, hero).map((d) => d.id)).toEqual([door.id])
    state = gameReducer(state, { type: 'DOOR_REVEALED', kind: 'unlocked', heroId: hero.id, doorId: door.id })
    expect(state.board.doors.map((d) => d.id)).not.toContain(door.id)
    expect(boardGrid(state.board).get(key(door.squares[0])).floor).toBe(true)
  })

  it('a Trapped Door hurts the heroes next to it, then opens', () => {
    let state = start(adventures[0])
    const [a, b] = state.heroes
    const door = state.board.doors[0]
    state = put(state, a.id, besideDoor(state, door))
    state = gameReducer(state, { type: 'DOOR_REVEALED', kind: 'trapped', heroId: a.id, doorId: door.id })
    expect(state.heroes.map((h) => h.hp)).toEqual([a.hp - 1, b.hp])
    expect(state.board.doors.map((d) => d.id)).not.toContain(door.id)
  })

  it('a Locked Door stays shut until a hero rolls 10 or more, which uses their attack', () => {
    let state = start(adventures[0])
    const hero = state.heroes[state.turn.heroIndex]
    const door = state.board.doors[0]
    state = put(state, hero.id, besideDoor(state, door))
    state = gameReducer(state, { type: 'DOOR_REVEALED', kind: 'locked', heroId: hero.id, doorId: door.id })
    expect(state.board.doors.find((d) => d.id === door.id).kind).toBe('locked')
    expect(state.adventure.lockedDoors.map((d) => d.id)).toEqual([door.id])
    // Turning it over again does nothing: it's face up now.
    expect(gameReducer(state, { type: 'DOOR_REVEALED', kind: 'unlocked', heroId: hero.id, doorId: door.id }).board.doors).toHaveLength(2)
    const missed = gameReducer(state, { type: 'DOOR_UNLOCK', doorId: door.id, heroId: hero.id, roll: 9 })
    expect(missed.board.doors).toHaveLength(2)
    expect(missed.turn.attackSpent).toMatchObject({ heroId: hero.id })
    // One try per Hero Phase, unless the players say otherwise.
    expect(gameReducer(missed, { type: 'DOOR_UNLOCK', doorId: door.id, heroId: hero.id, roll: 15 })).toBe(missed)
    const opened = gameReducer(missed, { type: 'DOOR_UNLOCK', doorId: door.id, heroId: hero.id, roll: 15, free: true })
    expect(opened.board.doors.map((d) => d.id)).toEqual([state.board.doors[1].id])
    expect(opened.adventure.lockedDoors).toEqual([])
  })

  it('The Closed Doors: the Secret Chamber waits behind the Entrance door and fills when it opens', () => {
    let state = start(adventures[0], 2)
    const hero = state.heroes[state.turn.heroIndex]
    // Stand on the Ancient Battlefield's north edge and find the Entrance there.
    state = put(state, hero.id, [1, 0])
    state = layTile(state, 'Horrid Chamber Entrance', 'explore').state
    state = gameReducer(state, { type: 'ADVENTURE_REVEAL', tile: 'Horrid Chamber Entrance', cards: monsters, villains, chambers, random: [] })
    const chamberTiles = state.board.tiles.filter((t) => /^horrid-chamber-\d/.test(t.tileId))
    expect(chamberTiles.length).toBeGreaterThan(0)
    const secret = state.board.doors.find((d) => d.reveal)
    expect(secret).toMatchObject({ reveal: 'Secret Chamber door', leadsTo: chamberTiles.map((t) => t.uid) })
    // The door sits on the Entrance's triangle, right where the hero came in.
    expect(doorsNearHero(state, hero).map((d) => d.id)).toContain(secret.id)
    expect(state.monsters.filter((m) => m.chamber)).toHaveLength(0)

    state = gameReducer(state, { type: 'DOOR_REVEALED', kind: 'unlocked', heroId: hero.id, doorId: secret.id, cards: monsters, villains, chambers, random: [] })
    expect(state.adventure.revealed).toContain('Secret Chamber door')
    expect(state.adventure.chamber.card.id).toBe('lair')
    const boss = state.villains.find((v) => v.name === 'Big Boss')
    const grid = boardGrid(state.board)
    const behind = new Set(chamberTiles.map((t) => t.uid))
    expect(behind.has(grid.get(key(state.board.tokens[boss.id])).tile)).toBe(true)
    for (const m of state.monsters.filter((m) => m.chamber)) expect(behind.has(grid.get(key(state.board.tokens[m.id])).tile)).toBe(true)
  })

  it("draws door tokens from the box's mix: 4 unlocked, 2 trapped, 2 locked, without putting them back", () => {
    expect(DOOR_MIX).toEqual({ unlocked: 4, trapped: 2, locked: 2 })
    expect([0, 0.49, 0.5, 0.74, 0.75, 0.99].map((r) => drawDoorKind(r))).toEqual(['unlocked', 'unlocked', 'trapped', 'trapped', 'locked', 'locked'])
    // Both Locked tokens are gone, so the rest are unlocked or trapped.
    expect(drawDoorKind(0.99, ['locked', 'locked'])).toBe('trapped')
    expect(drawDoorKind(0.5, ['unlocked', 'unlocked', 'unlocked', 'unlocked', 'trapped', 'trapped'])).toBe('locked')
  })

  it('opening a board door picks its kind from the tokens left and remembers it', () => {
    let state = start(adventures[0])
    const hero = state.heroes[state.turn.heroIndex]
    const door = state.board.doors[0]
    state = put(state, hero.id, besideDoor(state, door))
    state = gameReducer(state, { type: 'DOOR_REVEALED', pick: 0.9, heroId: hero.id, doorId: door.id })
    expect(state.board.doorsTurned).toEqual(['locked'])
    expect(state.board.doors.find((d) => d.id === door.id).kind).toBe('locked')
  })
})
