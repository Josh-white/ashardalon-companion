// Exploring the dungeon: drawing tiles from the stack, revealing adventure tiles,
// Closed Doors and chambers. The reducer is in game.js.
import { takeTile } from './tiles.js'
import { DOOR_KINDS, DOOR_UNLOCK_ROLL, playableChambers, revealsReady, showStory } from './adventure.js'
import { drawDoorKind, heroesNextToDoor, removeDoor } from '../board/doors.js'
import { layChamber, layDoorChamber, layExit, layTile } from '../board/play.js'
import { buildDeck, newId, pick, sameName, updateMonster, withLog, withMoment } from './gameHelpers.js'
import { discardMonsterCard, drawMonster } from './monsterDeck.js'
import { damageHeroes, placeVillagers, placeVillain } from './combat.js'

// A dungeon tile drawn from the stack, from the top when exploring or the bottom for a
// card that says so. `key` says what it was for (explore, a monster, an encounter), so
// each thing draws once. A special tile is revealed straight away.
export function drawDungeonTile(state, action) {
  const key = action.key ?? 'explore'
  if (!state.tileStack || state.turn.tiles?.[key] !== undefined) return state
  const { state: drawn, tile } = takeTile(state, action.from === 'bottom' ? 'bottom' : 'top')
  let next = { ...drawn, turn: { ...drawn.turn, tiles: { ...drawn.turn.tiles, [key]: tile ?? 'none' } } }
  if (tile === null) return next
  const left = next.tileStack.stack.length
  next = withLog(next, `Dungeon tile drawn${action.from === 'bottom' ? ' from the bottom' : ''}; ${left} left.`)
  // On the virtual board the tile is laid right away, and its triangle answers the Villain Phase.
  let laid = null
  if (next.board) {
    ;({ state: next, def: laid } = layTile(next, tile, key, action.edge))
    if (laid && (key === 'explore' || key.startsWith('hallway-')) && laid.triangle) {
      next = { ...next, turn: { ...next.turn, triangle: Boolean(next.turn.triangle) || laid.triangle !== 'white' } }
    }
    if (!laid) next = withLog(next, "The new tile couldn't go on the board here. Put its monster down by hand.")
  }
  if (tile) next = revealTile(next, { ...action, tile, door: false })
  // A long hallway: the next tile goes at its far end.
  if (laid?.name === 'Long Hallway' && next.tileStack.stack.length > 0) {
    let n = 1
    while (next.turn.tiles?.[`hallway-${n}`] !== undefined) n++
    next = drawDungeonTile(next, { ...action, key: `hallway-${n}`, from: 'top' })
  }
  return next
}

// A special tile turned up: read its text, then do what the adventure says.
export function revealTile(state, action) {
  const reveal = revealsReady(state.adventure, Boolean(action.door)).find((r) => r.tile === action.tile)
  const hero = state.heroes[state.turn.heroIndex]
  if (!reveal || !hero) return state
  let next = { ...state, adventure: { ...state.adventure, revealed: [...state.adventure.revealed, reveal.tile] } }
  next = withLog(next, `${hero.name} revealed the ${reveal.tile}!`)
  // The Closed Doors: a Closed Door on the Entrance's triangle, and the Secret Chamber behind it.
  if (next.board && /chamber entrance/i.test(reveal.tile) && reveal.steps.some((step) => /Closed Door token on the triangle/i.test(step))) {
    const behind = state.adventure.card.reveals.find((r) => r.door && r.after === reveal.tile)
    next = layDoorChamber(next, /horrid/i.test(reveal.tile) ? 'horrid' : 'dire', action.random, behind?.tile)
  }
  for (const step of reveal.actions) {
    if (step.type === 'drawGuardians') {
      // The guardians come off the monster deck and go to the hero who found them.
      if (!next.monsterDeck && Array.isArray(action.cards)) next = { ...next, monsterDeck: buildDeck(action.cards, action.random) }
      for (let i = 0; i < step.count; i++) {
        const before = next.monsters.length
        next = drawMonster(next, hero.id, action.random)
        if (next.monsters.length > before) {
          const guardian = next.monsters[next.monsters.length - 1]
          next = updateMonster(next, guardian.id, () => ({ guardian: true }))
          next = { ...next, adventure: { ...next.adventure, guardians: next.adventure.guardians + 1 } }
        }
      }
    } else if (step.type === 'placeToken') {
      const token = { name: step.name, heldBy: null, ask: step.ask ?? '', drawTreasure: Boolean(step.drawTreasure) }
      next = { ...next, adventure: { ...next.adventure, tokens: [...next.adventure.tokens, token] } }
    } else if (step.type === 'extraEncounters') {
      next = { ...next, adventure: { ...next.adventure, extraEncounters: next.adventure.extraEncounters + step.count } }
    } else if (step.type === 'placeVillain') {
      // The villain rules take it from here, with the villain cards the device sent along.
      next = placeVillain(next, { type: 'PLACE_VILLAIN', name: step.name, cards: action.villains ?? [] })
    } else if (step.type === 'chamber') {
      // On the virtual board the chamber's tiles go on the Entrance's open edges first.
      if (next.board && /chamber entrance/i.test(reveal.tile)) next = layChamber(next, /horrid/i.test(reveal.tile) ? 'horrid' : 'dire', action.random)
      next = openChamber(next, step, action, hero)
    } else if (step.type === 'chamberMonsters') {
      // A chamber with no Chamber card (Sneaky Endeavor's treasure vault): just its monsters.
      if (next.board && /chamber entrance/i.test(reveal.tile)) next = layChamber(next, /horrid/i.test(reveal.tile) ? 'horrid' : 'dire', action.random)
      next = fillChamber(next, { perPlayer: step.count, types: [], redrawXp: [] }, action)
    }
  }
  // A new chamber (Wrath of Ashardalon has two) adds its card's steps.
  const chamber = next.adventure.chamber !== state.adventure.chamber && next.adventure.chamber
  // "Place the Tunnel Exit tile next to any unexplored Chamber edge" (the adventure's words,
  // or a chamber card's, like the Refuse Pit's): the board does it.
  const exitWords = [...reveal.steps, ...(chamber ? chamber.card.setup : [])].join(' ')
  const exit = next.board && exitWords.match(/Place the (Tunnel Exit|Secure Exit) tile (?:next to|adjacent to)/i)?.[1]
  if (exit) next = layExit(next, exit)
  const steps = [...reveal.steps, ...(chamber ? chamberSteps(next, chamber, state) : monsterSteps(next, state))]
  return showStory(next, `The ${reveal.tile}!`, reveal.story, steps)
}

// A hero next to a Closed Door token turned it over (Rulebook p. 15). On the virtual board
// the action names the door (`doorId`): the board knows who stands next to a Trapped Door,
// takes the token away once the door is open, and opens what waits behind it.
export function revealDoor(state, action) {
  const hero = state.heroes.find((h) => h.id === action.heroId) ?? state.heroes[state.turn.heroIndex]
  const door = state.board && action.doorId ? (state.board.doors ?? []).find((d) => d.id === action.doorId && !d.kind) : null
  if (state.board && action.doorId && !door) return state
  // A board door's token comes from those not turned over yet (`pick`, a random number from the device).
  if (door && action.pick !== undefined) {
    const turned = state.board.doorsTurned ?? []
    const kind = drawDoorKind(Number(action.pick), turned)
    return revealDoor({ ...state, board: { ...state.board, doorsTurned: [...turned, kind] } }, { ...action, kind, pick: undefined })
  }
  if (!state.adventure || !DOOR_KINDS.includes(action.kind) || !hero) return state
  if (action.kind === 'unlocked') {
    const next = withMoment(withLog(state, `${hero.name} opened an Unlocked Door.`), { kind: 'roll', heroId: hero.id, title: 'The door swings open!', detail: door ? 'The way is open.' : 'Discard the Closed Door token.' })
    return door ? openBoardDoor(next, door, action) : next
  }
  if (action.kind === 'trapped') {
    // Each hero next to the door takes 1 damage.
    const ids = door ? heroesNextToDoor(state, door) : Array.isArray(action.heroIds) ? action.heroIds : [hero.id]
    const { next } = damageHeroes(state, ids, 1, 'a Trapped Door')
    const names = state.heroes.filter((h) => ids.includes(h.id)).map((h) => h.name)
    const sprung = withMoment(next, { kind: 'fumble', heroId: hero.id, title: 'A Trapped Door!', detail: `${names.join(', ') || 'No one'} took 1 damage. ${door ? 'The door is open.' : 'Discard the Closed Door token.'}` })
    return door ? openBoardDoor(sprung, door, action) : sprung
  }
  const id = door?.id ?? newId('door')
  let next = { ...state, adventure: { ...state.adventure, lockedDoors: [...(state.adventure.lockedDoors ?? []), { id }] } }
  if (door) next = { ...next, board: { ...next.board, doors: next.board.doors.map((d) => (d.id === door.id ? { ...d, kind: 'locked' } : d)) } }
  return withMoment(withLog(next, `${hero.name} found a Locked Door.`), {
    kind: 'roll',
    heroId: hero.id,
    title: 'A Locked Door!',
    detail: door
      ? `It stays shut. A hero next to it can try to unlock it instead of attacking: ${DOOR_UNLOCK_ROLL} or more.`
      : `Put the token back face up. A hero next to it can try to unlock it instead of attacking: ${DOOR_UNLOCK_ROLL} or more.`,
  })
}

// A door on the virtual board is open: its token goes, and a door the adventure was
// waiting for (the Secret Chamber's) reveals what's behind it, with the chamber's tiles
// waiting for their monsters this turn.
export function openBoardDoor(state, door, action) {
  let next = { ...state, board: removeDoor(state.board, door.id) }
  if (!door.reveal) return next
  const waiting = (door.leadsTo ?? []).filter((uid) => next.board.tiles.some((t) => t.uid === uid)).map((uid) => ({ uid, side: null, filled: false, chamber: true }))
  next = { ...next, turn: { ...next.turn, boardTiles: [...(next.turn.boardTiles ?? []), ...waiting] } }
  return revealTile(next, { ...action, tile: door.reveal, door: true })
}

// A chamber's entrance turned up. The chamber card (named by the adventure, or drawn
// from the Chamber deck) puts its villain or objective in the chamber, then each
// player, starting with the active hero, draws monsters for it.
function openChamber(state, step, action, hero) {
  const random = Array.isArray(action.random) ? action.random : []
  const deck = playableChambers(action.chambers)
  // A campaign has its own Chamber deck, and the top card is the one found.
  const top = !step.name && state.campaign ? deck.find((c) => c.id === state.campaign.deck[0]) : null
  const card = step.name ? deck.find((c) => c.id === step.name || sameName(c.name, step.name)) : state.campaign ? top : deck.length > 0 ? pick(deck, random[0]) : null
  if (!card) return withLog(state, step.name ? `The app has no chamber card called "${step.name}".` : 'There are no chamber cards to draw.')
  const from = card.villainFrom.filter((name) => !(step.exclude ?? []).some((x) => sameName(x, name)))
  const villain = card.villain || (from.length > 0 ? pick(from, random[1]) : '')
  let next = { ...state, adventure: { ...state.adventure, chamber: { card, villain, objectivePlaced: false, done: false } } }
  next = withLog(next, step.name ? `The chamber is the ${card.name}.` : `${hero.name} drew the ${card.name} chamber card!`)
  // Finding the Elite Regiment makes this adventure and every later one draw two encounter cards.
  if (state.campaign && card.id === state.campaign.card.campaign.hard) {
    next = withLog({ ...next, adventure: { ...next.adventure, doubleEncounters: true } }, 'The Elite Regiment! From now on, every encounter card is two.')
  }
  if (villain) next = placeVillain(next, { type: 'PLACE_VILLAIN', name: villain, cards: action.villains ?? [] })
  if (card.objective) {
    const { name, hp, ac } = card.objective
    const objective = { id: newId('monster'), name, maxHp: hp, hp, ac, xp: 0, ownerId: null, conditions: [], objective: true, card: { hp, figures: 1, special: '', types: [], attacks: [], tactics: [] } }
    next = { ...next, monsters: [...next.monsters, objective], adventure: { ...next.adventure, chamber: { ...next.adventure.chamber, objectivePlaced: true } } }
  }
  if (card.timeTokens > 0) next = { ...next, adventure: { ...next.adventure, timeTokens: card.timeTokens } }
  // Ceremony Progresses! goes on top of the encounter deck; Ashardalon Arrives! into the top 3.
  if (card.addEncounter) next = { ...next, encounterAdds: [...(next.encounterAdds ?? []), card.encounterTop ? { id: card.addEncounter, top: true } : card.addEncounter] }
  if (card.villagers) next = placeVillagers(next, action.villagerCards, step.villagers || state.heroes.length, random.slice(2))
  next = fillChamber(next, card.monsters, action)
  const placed = next.monsters.filter((m) => m.chamber && !state.monsters.some((old) => old.id === m.id))
  return withMoment(next, {
    kind: 'spawn',
    title: `The ${card.name}!`,
    detail: [villain && `The ${villain}`, card.objective && `the ${card.objective.name}`, ...placed.map((m) => m.name)].filter(Boolean).join(', ') + ' wait in the chamber.',
  })
}

// Each player, starting with the active hero, draws monsters for a chamber.
function fillChamber(state, rule, action) {
  const random = Array.isArray(action.random) ? action.random : []
  // Filling the chamber isn't the hero's tile draw or an encounter's monster, so those buttons stay as they were.
  const { monsterDrawn } = state.turn
  const { encounter } = state
  let next = !state.monsterDeck && Array.isArray(action.cards) ? { ...state, monsterDeck: buildDeck(action.cards, random) } : state
  const start = state.turn.heroIndex
  const order = state.heroes.map((_, i) => state.heroes[(start + i) % state.heroes.length])
  for (let round = 0; round < rule.perPlayer; round++) {
    for (const player of order) next = drawChamberMonster(next, player, rule, random)
  }
  return { ...next, turn: { ...next.turn, monsterDrawn }, encounter }
}

// Does a drawn monster belong in this chamber? Elite Regiment wants no 1 XP monsters,
// the clan lairs want their kind. A misfit is discarded once and another drawn.
const fitsChamber = (monster, rule) =>
  (rule.types.length === 0 || (monster.card?.types ?? []).some((t) => rule.types.some((want) => sameName(t, want)))) && !rule.redrawXp.includes(monster.xp)

function drawChamberMonster(state, hero, rule, random) {
  const draw = (current) => {
    const after = drawMonster(current, hero.id, random)
    return { state: after, monster: after.monsters.length > current.monsters.length ? after.monsters[after.monsters.length - 1] : null }
  }
  let { state: next, monster } = draw(state)
  if (monster && !fitsChamber(monster, rule)) {
    next = discardMonsterCard({ ...next, monsters: next.monsters.filter((m) => m.id !== monster.id) }, monster)
    next = withLog(next, `The ${monster.name} doesn't belong in this chamber, so it's discarded and ${hero.name} draws again.`)
    ;({ state: next, monster } = draw(next))
  }
  return monster ? updateMonster(next, monster.id, () => ({ chamber: true })) : next
}

// What the players do on the board for the chamber card, added to the reveal's read-aloud box.
function chamberSteps(state, chamber, before) {
  const villagers = (state.villagers ?? []).filter((v) => !(before.villagers ?? []).some((old) => old.id === v.id))
  return [
    `Chamber card: ${chamber.card.name}. ${chamber.card.goal}`,
    villagers.length > 0 && `Place these villager tokens on Chamber tiles, one per tile before doubling up: ${villagers.map((v) => v.name).join(', ')}.`,
    chamber.villain && `Place the ${chamber.villain} on a Chamber tile${chamber.card.setup.some((line) => /Chamber Entrance tile/i.test(line)) ? ' (the card says where)' : ''}.`,
    chamber.card.objective && `Place the ${chamber.card.objective.name} marker on any Chamber tile (${chamber.card.objective.hp} HP, AC ${chamber.card.objective.ac})${chamber.card.timeTokens ? ` with ${chamber.card.timeTokens} Time tokens on it` : ''}.`,
    chamber.card.addEncounter && (chamber.card.encounterTop ? 'The app puts its adventure encounter card on top of the encounter deck.' : 'The app shuffles its adventure encounter card into the top 3 encounter cards.'),
    ...monsterSteps(state, before),
  ].filter(Boolean)
}

// "Place these monsters on Chamber tiles": the chamber's new monsters and who they belong to.
function monsterSteps(state, before) {
  const placed = state.monsters.filter((m) => m.chamber && !before.monsters.some((old) => old.id === m.id))
  const owners = placed.map((m) => `${m.name} (${state.heroes.find((h) => h.id === m.ownerId)?.name ?? 'no one'})`)
  return placed.length > 0 ? [`Place these monsters on Chamber tiles, empty tiles first: ${owners.join(', ')}.`] : []
}
