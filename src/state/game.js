import { hasAbility, HERO_TEMPLATES, MAX_LEVEL, STARTING_SURGES, templateFor, XP_TO_CANCEL_ENCOUNTER, XP_TO_LEVEL_UP } from '../data/heroes.js'
import { monsterArt } from '../data/art.js'
import { PHASES } from '../data/phases.js'
import { heroItems, itemTrapBonus } from '../data/items.js'
import { effectsOf } from '../data/powerEffects.js'
import { adjustTiles, buildTileStack, MAX_TILES, MIN_TILES, STARTING_TILES } from './tiles.js'
import { aliveVillagers, checkVictory, countDefeat, DOOR_UNLOCK_ROLL, escapeBlockers, isPlayable, MAX_SURGES, MIN_SURGES, newAdventure, takeToken } from './adventure.js'
import { trackStats } from './stats.js'
import { campaignHero, campaignOutcome, campaignSurges, isCampaign, newCampaign } from './campaign.js'
import { playBoardSound, setBoardOff, setBoardUnlimited } from './soundboard.js'
import { FIRST_ROLL_MAX_MS, newFirstRoll, rollFirst } from './firstRoll.js'
import { finishOpening, openingNarrating, startOpening } from './opening.js'
import { escapeAtPhaseEnd, escapedHero } from '../board/exits.js'
import { dropItem, moveHeroToken, syncHeroTokens, trippedTokens } from '../board/heroTokens.js'
import { moveHero, moveToken, newBoard, placeNewFigures, pruneTokens } from '../board/play.js'
import { boardMove, queueFearMove, queueFoeStep, queueHitMoves, queueMoves, skipBoardMove } from '../board/powerMoves.js'
import { addTreasureToken, flyCarpet, pickUpTreasure, placeItem, removeItem } from '../board/items.js'
import { trapStep } from '../board/traps.js'
import { activeVillains, buildDeck, clamp, heroLabel, lose, markUsed, newId, shuffle, toggle, updateHero, updateMonster, validRoll, withCast, withLog, withMoment } from './gameHelpers.js'
import { discardMonsterCard, drawMonster, filterMonsterDeck, monsterFromCard } from './monsterDeck.js'
import { discardEncounterCard, drawEncounter, oweEncounter } from './encounterDeck.js'
import { dealStartingTreasure, drawTreasure, keepTreasure, oweTreasure, spendItem, treasureWords } from './treasureDeck.js'
import { copyCard, createHero, heroesFromLobby, levelSlots, newPower, pickedElsewhere, POWER_LABELS, updateClaim, withPicks } from './heroSetup.js'
import { buildDeckWithout, buyFromShop, campaignHeroes, campaignLobby, drawTreasureToken, fromCampaign, nextCampaignAdventure, sameHeroes, tagDrawn, useBoon } from './campaignPlay.js'
import { attackFollowUp, dodgeHit, heroAttack, powerDamage, rerollAttack, usePower } from './heroAttacks.js'
import { initialState } from './initialState.js'
import { drawDungeonTile, openBoardDoor, revealDoor, revealTile } from './dungeon.js'
import { addOffer, attackHeroes, damageHeroes, defeatVillain, dropOffer, figuresLeft, healHero, heroWith, hurtVillager, monsterAttack, offers, offerSavingGrace, placeVillain, resolveEncounter, villagerAttack, villagerRoll } from './combat.js'
import { answerCheck, canSpendAttack, checksFor, endHeroPhase, endPhaseCurses, inHeroPhase, levelUp, monsterControl, phaseChecks, removeCurse, spendAttack, startDamage, startTurn, updateEncounterCards, useItem, villagerRollDue } from './heroTurn.js'

// Parts of the rules live in their own files now; these are still exported from here
// so the screens' imports didn't have to change.
export { activeVillains, foes, shuffle } from './gameHelpers.js'
export { villainInPlay } from './monsterDeck.js'
export { ENCOUNTER_LABELS } from './encounterDeck.js'
export { createHero, levelSlots, powerSlotsFor, STARTING_POWER_SLOTS } from './heroSetup.js'
export { SAVE_VERSION, initialState } from './initialState.js'
export { powerNumber, poisonBonus } from './combat.js'
export { attackNumbers } from './heroAttacks.js'
export { villagerRollDue, checksFor, phaseChecks, encounterCardsOutdated, isWrathCheck, phaseTodo, encounterCount, attackGone, powerUsesAttack, canSpendAttack } from './heroTurn.js'
export { turnKey } from './campaignPlay.js'

// Practiced Evasion: an encounter card's or trap's hit becomes a miss. The damage and
// conditions come back off and the miss result lands instead. Against a trap, the
// hero also gets a free roll to disable it (the device sends the d20 as disableRoll).
function evadeHit(state, action) {
  const last = state.turn.lastEventAttack
  const hero = state.heroes.find((h) => h.id === action.heroId)
  const power = hero?.powers.find((p) => p.id === action.powerId)
  const row = last?.results.find((r) => r.heroId === hero?.id && r.hit && !r.evaded)
  if (!row || !power || power.used || effectsOf(power).reaction !== 'evade') return state
  let next = withCast(markUsed(state, hero.id, power.id), power)
  next = updateHero(next, hero.id, (h) => {
    const kept = h.conditions.filter((c) => !row.conditions.includes(c))
    return {
      hp: clamp(h.hp + row.dealt - row.miss, 0, h.maxHp),
      conditions: [...kept, ...row.missConditions.filter((c) => !kept.includes(c))],
    }
  })
  const results = last.results.map((r) => (r === row ? { ...r, evaded: true } : r))
  next = { ...next, turn: { ...next.turn, lastEventAttack: { ...last, results } } }
  next = withLog(next, `${hero.name} used Practiced Evasion: the attack misses!${row.miss > 0 ? ` (${row.miss} miss damage)` : ''}`)
  if (last.kind === 'trap' && validRoll(action.disableRoll)) {
    next = gameReducer(next, { type: 'DISABLE_TRAP', trapId: last.trapId, heroId: hero.id, roll: action.disableRoll, free: true })
  }
  return next
}

// Every action, then a check for an adventure's victory, then the recap's counts.
export const gameReducer = (state, action) => {
  const placed = pruneTokens(placeNewFigures(state, checkVictory(tagDrawn(reduceWithOpening(state, action)))))
  const sprung = springHeroTokens(placed)
  return trackStats(state, sprung === placed ? placed : pruneTokens(checkVictory(sprung)), action)
}

// The tokens heroes put on the virtual board (board/heroTokens.js): the board keeps up with
// each hero's count, and a monster that ends up on a Blade Barrier or Caltrop token takes
// 1 damage, and the token goes.
function springHeroTokens(state) {
  if (!state.board) return state
  let next = syncHeroTokens(state)
  for (const { item, foeId } of trippedTokens(next)) {
    next = dropItem(next, item.id)
    next = powerDamage(next, { source: item.kind === 'blade' ? 'bladeBarrier' : 'caltrops', heroId: item.owner, monsterIds: [foeId] })
  }
  return syncHeroTokens(next)
}

// A game that just started begins with its story (state/opening.js).
function reduceWithOpening(state, action) {
  const next = reduce(state, action)
  const started = ['START_GAME', 'START_DEMO', 'TRY_AGAIN'].includes(action.type) && next !== state && next.status === 'playing'
  return started ? startOpening(next, Date.now()) : next
}

// Try again after a loss: the same adventure, heroes, players and power cards, back at
// level 1 with fresh decks and a new dungeon, on the virtual board if the lost game was.
// A campaign has its own way on (CAMPAIGN_NEXT, or New game once it's lost).
function tryAgain(state, action) {
  if (state.status !== 'lost' || state.campaign) return state
  const heroes = state.heroes.flatMap((hero) => {
    const template = templateFor(hero.key)
    return template ? [{ ...withPicks(createHero(template), hero.powers.map((p) => p.card)), player: hero.player ?? '' }] : []
  })
  const setup = {
    ...initialState,
    lobbyAdventure: state.adventure?.card ?? null,
    lobbySurges: state.retry?.surges ?? STARTING_SURGES,
    lobbyTiles: state.retry?.tiles ?? STARTING_TILES,
  }
  const { boardTiles, boardRandom, ...rest } = action
  const board = state.board && Array.isArray(boardTiles) ? { boardTiles, boardRandom } : {}
  const next = reduce(setup, { ...rest, ...board, type: 'START_GAME', heroes })
  return next.status === 'playing' ? withLog(next, 'The heroes try again!') : state
}

function reduce(state, action) {
  switch (action.type) {
    case 'NEW_GAME': {
      // A campaign goes on until it's over (or someone ends it), so its heroes come back to the lobby.
      const outcome = campaignOutcome(state)
      if (!state.campaign || outcome?.over) return initialState
      return campaignLobby({ ...initialState, campaign: state.campaign, lobbySurges: state.lobbySurges, lobbyTiles: state.lobbyTiles, lobbyBoard: state.lobbyBoard })
    }

    case 'CAMPAIGN_NEXT':
      return nextCampaignAdventure(state, action)

    case 'ROLL_FIRST': {
      if (state.status !== 'playing') return state
      const out = rollFirst(state.firstRoll, action.heroId, action.value, Date.now())
      if (!out) return state
      const hero = state.heroes.find((h) => h.id === action.heroId)
      const value = Math.min(20, Math.max(1, Math.round(Number(action.value)) || 1))
      let next = withLog({ ...state, firstRoll: out.firstRoll }, `${heroLabel(hero)} rolled ${value} for first turn.`)
      // A natural 20 is cheered on the roll screen itself (firstRoll.last), not with a big
      // moment of its own that would land on top of the winner and the starting treasure.
      if (out.result?.winner) {
        const index = state.heroes.findIndex((h) => h.id === out.result.winner)
        next = withLog({ ...next, turn: { ...next.turn, heroIndex: index } }, `${state.heroes[index].name} goes first!`)
      }
      if (out.result?.tie) {
        const names = out.result.tie.map((id) => state.heroes.find((h) => h.id === id)?.name).join(' and ')
        next = withLog(next, `A tie! ${names} roll again.`)
      }
      return next
    }

    case 'SKIP_FIRST_ROLL': {
      if (!state.firstRoll || state.firstRoll.winner) return state
      const next = withLog({ ...state, firstRoll: null }, 'The heroes skipped the roll for first turn.')
      return state.firstRoll.after ? withMoment(next, state.firstRoll.after) : next
    }

    // The screen playing the narration started the opening story, or it's over (or skipped).
    case 'OPENING_NARRATING':
      return openingNarrating(state)

    case 'OPENING_DONE':
      return finishOpening(state)

    // The screen playing the narration is cheering the roll for first turn, or has finished.
    case 'FIRST_ROLL_NARRATING':
    case 'FIRST_ROLL_QUIET':
      if (!state.firstRoll) return state
      return { ...state, firstRoll: { ...state.firstRoll, narrating: action.type === 'FIRST_ROLL_NARRATING' } }

    // The "X goes first!" screen has finished: show what waited for it (the starting
    // treasure). Every screen sends this when its roll screen closes; only the first counts.
    case 'FIRST_ROLL_DONE':
      if (!state.firstRoll?.winner || !state.firstRoll.after) return state
      // Not while the narrator is still cheering the roll (up to a limit).
      if (state.firstRoll.narrating && Date.now() - state.firstRoll.decidedAt < FIRST_ROLL_MAX_MS) return state
      return withMoment({ ...state, firstRoll: { ...state.firstRoll, after: null } }, state.firstRoll.after)

    case 'CAMPAIGN_BUY':
      return buyFromShop(state, action)

    case 'END_CAMPAIGN':
      if (state.status !== 'setup' || !state.campaign) return state
      return { ...state, campaign: null, lobbyAdventure: null, lobby: [] }

    case 'DRAW_TREASURE_TOKEN':
      return drawTreasureToken(state, action)

    case 'USE_BOON':
      return useBoon(state, action)

    case 'START_GAME': {
      // Without a hero list, the heroes come from the lobby.
      // Everyone in the lobby has to be ready first.
      if (!action.heroes && !(state.lobby ?? []).every((c) => c.ready)) return state
      const heroes = action.heroes ?? heroesFromLobby(state.lobby ?? [], state.campaign)
      if (state.status !== 'setup' || heroes.length === 0) return state
      const card = state.campaign?.card ?? state.lobbyAdventure
      // A campaign's adventure needs every hero of the campaign, and only them.
      if (state.campaign && !sameHeroes(heroes, state.campaign.heroes)) return state
      const campaign = state.campaign ?? (isCampaign(card) ? newCampaign(card, action.chambers, action.random) : null)
      const surges = campaignSurges(campaign, clamp(Number(state.lobbySurges) || STARTING_SURGES, MIN_SURGES, MAX_SURGES))
      const lobbyTiles = clamp(Number(state.lobbyTiles) || STARTING_TILES, MIN_TILES, MAX_TILES)
      // On the virtual board the stack can't hold more regular tiles than there are layouts for.
      const regular = Array.isArray(action.boardTiles) ? action.boardTiles.filter((t) => t.kind === 'regular').length : 0
      const tiles = action.boardTiles && regular > 0 ? Math.min(lobbyTiles, regular) : lobbyTiles
      const objective = card?.startObjective
      const objectiveId = objective ? newId('monster') : null
      let started = {
        ...initialState,
        status: 'playing',
        heroes: state.campaign ? heroes.map((h) => fromCampaign(h, campaignHero(state, h.key))) : heroes,
        surges,
        adventure: card ? { ...newAdventure(card), doubleEncounters: Boolean(campaign?.hard) } : null,
        tileStack: buildTileStack(tiles, card, action.tileRandom),
        campaign: campaign && { ...campaign, heroes: campaignHeroes(campaign, heroes, state.lobby ?? []) },
        tokenStack: campaign ? shuffle(Array.isArray(action.tokens) ? action.tokens : [], action.random) : null,
        firstRoll: newFirstRoll(heroes),
        // A game on the virtual board (solo or the party's) starts with the adventure's start tile and the heroes on it.
        board: action.boardTiles ? newBoard(action.boardTiles, heroes, action.boardRandom, card, objectiveId) : null,
        retry: { surges: clamp(Number(state.lobbySurges) || STARTING_SURGES, MIN_SURGES, MAX_SURGES), tiles: lobbyTiles },
      }
      // The Vast Gate Opens: the gate is on the Start tile, and its Flares! card is in the top 3 encounters.
      if (objective) {
        const { name, hp, ac } = objective
        started = { ...started, monsters: [{ id: objectiveId, name, maxHp: hp, hp, ac, xp: 0, ownerId: null, conditions: [], objective: true, card: { hp, figures: 1, special: '', types: [], attacks: [], tactics: [] } }] }
      }
      if (card?.startEncounters?.length > 0) started = { ...started, encounterAdds: [...card.startEncounters] }
      const names = heroes.map((h) => h.name).join(', ')
      const begun = withLog(started, card ? `${card.title} begins with ${names}.` : `The adventure begins with ${names}.`)
      // Later campaign adventures: the heroes still have their treasure, so those cards stay out
      // of the deck. Everyone still draws a starting card, as every adventure begins.
      if (state.campaign) {
        const held = started.heroes.flatMap((h) => (h.items ?? []).map((i) => i.cardId))
        const deck = buildDeckWithout(action.treasureCards, held, action.random)
        return deck ? dealStartingTreasure(begun, action.treasureCards, action.random, deck) : begun
      }
      return dealStartingTreasure(begun, action.treasureCards, action.random)
    }

    case 'BOARD_MOVE':
      return queueFearMove(boardMove(state, action))

    case 'SKIP_BOARD_MOVE':
      return queueFearMove(skipBoardMove(state))

    case 'SKIP_BONUS_ATTACK': {
      // An ally passes on a Cause Fear or Acrobatic Onslaught attack.
      const bonusAttacks = state.turn.bonusAttacks ?? []
      const skipped = bonusAttacks.find((b) => b.heroId === action.heroId)
      if (!skipped) return state
      const next = { ...state, turn: { ...state.turn, bonusAttacks: bonusAttacks.filter((b) => b !== skipped) } }
      return queueFearMove(withLog(next, `${state.heroes.find((h) => h.id === action.heroId)?.name ?? 'A hero'} skipped the extra attack.`))
    }

    case 'START_BOARD_MOVE': {
      // A power's "first move..." done on the board before its attack roll.
      const hero = state.heroes.find((h) => h.id === action.heroId)
      const power = hero?.powers.find((p) => p.id === action.powerId && !p.used)
      return queueMoves(state, hero, power, effectsOf(power).board?.before)
    }

    case 'MOVE_HERO':
      return moveHero(state, action)
    case 'MOVE_TOKEN':
      return moveToken(state, action)
    case 'ADD_TREASURE_TOKEN':
      return addTreasureToken(state)
    case 'PLACE_ITEM':
      return placeItem(state, action)
    case 'REMOVE_ITEM':
      return removeItem(state, action)
    case 'PICK_UP_TREASURE':
      return pickUpTreasure(state, action)
    case 'FLY_CARPET':
      return flyCarpet(state, action)
    case 'MOVE_HERO_ITEM':
      return moveHeroToken(state, action)

    case 'CHOOSE_ADVENTURE': {
      // Only before the game, and only an adventure the app can run.
      if (state.status !== 'setup' || state.campaign) return state
      const card = action.adventure ?? null
      if (card && !isPlayable(card)) return state
      return { ...state, lobbyAdventure: card }
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

    case 'ADVENTURE_REVEAL':
      return revealTile(state, action)

    case 'DRAW_TILE':
      return drawDungeonTile(state, action)

    case 'ADVENTURE_STORY_DONE':
      if (!state.adventure?.story || state.adventure.story.id !== action.storyId) return state
      return { ...state, adventure: { ...state.adventure, story: null } }

    case 'ADVENTURE_TAKE_TOKEN': {
      const hero = state.heroes.find((h) => h.id === action.heroId)
      const token = state.adventure?.tokens.find((t) => t.name === action.name && !t.heldBy)
      if (!hero || !token) return state
      const next = withLog(takeToken(state, action.name, hero.id), `${hero.name} picked up the ${action.name}!`)
      // Sneaky Endeavor's stolen item: a treasure card says what it is.
      if (!token.drawTreasure || next.turn.treasureOwed || next.treasure) return next
      return withMoment({ ...next, turn: { ...next.turn, treasureOwed: hero.id } }, { kind: 'treasure', heroId: hero.id, title: `${hero.name} found the ${action.name}!`, detail: 'Draw a treasure card to see what it is.' })
    }

    case 'ADVENTURE_CHAMBER_DONE': {
      // A chamber goal the app can't check (Treasure Hoard): the players say when it's done.
      const chamber = state.adventure?.chamber
      if (!chamber?.card.win.manual) return state
      return { ...state, adventure: { ...state.adventure, chamber: { ...chamber, done: Boolean(action.done) } } }
    }

    case 'DOOR_REVEALED':
      return revealDoor(state, action)

    case 'VILLAGER_ROLL':
      return villagerRoll(state, action)

    case 'VILLAGER_ATTACK':
      return villagerAttack(state, action)

    case 'ADJUST_VILLAGER_HP': {
      const villager = aliveVillagers(state).find((v) => v.id === action.villagerId)
      if (!villager) return state
      return hurtVillager(state, villager, clamp(villager.hp + action.amount, 0, villager.maxHp))
    }

    case 'DOOR_UNLOCK': {
      // Instead of attacking, a hero next to a Locked Door rolls to unlock it.
      const door = (state.adventure?.lockedDoors ?? []).find((d) => d.id === action.doorId)
      const hero = state.heroes.find((h) => h.id === action.heroId)
      if (!door || !hero || !validRoll(action.roll)) return state
      // It takes the place of the hero's attack this Hero Phase ("Unlock anyway" sends `free`).
      if (!action.free && inHeroPhase(state, hero) && !canSpendAttack(state, hero)) return state
      const unlocked = action.roll >= DOOR_UNLOCK_ROLL
      let next = withLog(action.free || !inHeroPhase(state, hero) ? state : spendAttack(state, hero, 'a Locked Door'), `${hero.name} rolled ${action.roll} to unlock the door (needed ${DOOR_UNLOCK_ROLL}).${unlocked ? ' Unlocked!' : ''}`)
      if (unlocked) next = { ...next, adventure: { ...next.adventure, lockedDoors: next.adventure.lockedDoors.filter((d) => d.id !== door.id) } }
      const onBoard = unlocked && (next.board?.doors ?? []).find((d) => d.id === door.id)
      if (onBoard) {
        next = withMoment(next, { kind: 'defeat', heroId: hero.id, value: action.roll, title: 'The door is unlocked!', detail: 'The way is open.' })
        return openBoardDoor(next, onBoard, action)
      }
      return withMoment(next, {
        kind: unlocked ? 'defeat' : 'roll',
        heroId: hero.id,
        value: action.roll,
        title: unlocked ? 'The door is unlocked!' : 'Still locked',
        detail: unlocked ? 'Discard the Closed Door token.' : `${hero.name} needed ${DOOR_UNLOCK_ROLL} or more.`,
      })
    }

    case 'ADVENTURE_ESCAPED':
      if (!state.adventure) return state
      // Escaping only counts once every other goal is done.
      if (action.escaped && escapeBlockers(state).length > 0) return state
      return withLog({ ...state, adventure: { ...state.adventure, escaped: Boolean(action.escaped) } }, action.escaped ? 'The heroes escaped the dungeon!' : 'Not escaped after all.')

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
      const claim = { deviceId: action.deviceId, heroKey: template.key, player: saved?.player ?? previous?.player ?? String(action.player ?? '').slice(0, 40), picks, ready: false }
      return { ...state, lobby: [...lobby.filter((c) => c.deviceId !== action.deviceId), claim] }
    }

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

    case 'START_DEMO': {
      // A game already in progress, for trying features without setting one up:
      // every hero, a few monsters, some XP, and a hero with a condition.
      // `picks` gives each hero's starting cards by hero key (the rulebook's suggestions).
      const heroes = HERO_TEMPLATES.map((t) => ({ ...withPicks(createHero(t), action.picks?.[t.key]), player: '' }))
      heroes[1] = { ...heroes[1], hp: heroes[1].maxHp - 3 }
      heroes[3] = { ...heroes[3], conditions: ['Poisoned'] }
      const monster = (name, hp, xp, owner) => ({
        id: newId('monster'), name, maxHp: hp, hp, xp, ownerId: heroes[owner].id, conditions: [],
      })
      let demo = {
        ...initialState,
        status: 'playing',
        heroes,
        monsters: [monster('Kobold Dragonshield', 2, 1, 0), monster('Orc Smasher', 2, 2, 2), monster('Grell', 2, 2, 4)],
        xp: 3,
        turn: { ...initialState.turn, round: 2 },
        tileStack: buildTileStack(STARTING_TILES - 4, null),
        // The roll for first turn too, so it can be tried out (or skipped).
        firstRoll: newFirstRoll(heroes),
      }
      // With monster cards, the demo's monsters come off the virtual deck instead.
      if (action.monsterCards?.length > 0) {
        demo = { ...demo, monsters: [], monsterDeck: buildDeck(action.monsterCards, action.random) }
        for (const owner of [0, 2, 4]) demo = drawMonster(demo, heroes[owner].id, action.random)
        demo = { ...demo, log: [], moment: null }
      }
      return dealStartingTreasure(withLog(demo, 'A demo game begins. Nothing here is your real game.'), action.treasureCards, action.random)
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
        return lose(state, `${hero.name} fell with no healing surges left.`)
      }
      // Keyleth's Healing Hands: her own surge heals 1 more. Anyone else's is offered,
      // since only the players know who is on Keyleth's tile.
      const own = hasAbility(hero, 'healing-hands') ? 1 : 0
      let healed = updateHero({ ...state, surges: state.surges - 1 }, hero.id, (h) => ({
        hp: Math.min(h.maxHp, h.surgeValue + own),
      }))
      if (!own && heroWith(state, 'healing-hands')) healed = addOffer(healed, 'healingHands', hero.id)
      healed = offerSavingGrace(healed, hero)
      const logged = withLog(healed, `${hero.name} used a healing surge${own ? ', +1 HP from Healing Hands' : ''}.`)
      if (state.turn.startDamageDue !== hero.id) return logged
      const { startDamageDue: _, ...turn } = logged.turn
      return startDamage({ ...logged, turn }, logged.heroes.find((h) => h.id === hero.id))
    }

    case 'SAVING_GRACE': {
      const hero = state.heroes.find((h) => h.id === action.heroId)
      if (!hero || !offers(state).savingGrace?.includes(hero.id) || !hero.conditions.includes(action.condition)) return state
      const next = updateHero(state, hero.id, (h) => ({ conditions: h.conditions.filter((c) => c !== action.condition) }))
      return withLog(dropOffer(next, 'savingGrace', hero.id), `Saving Grace: ${hero.name} is no longer ${action.condition}.`)
    }

    case 'HEALING_HANDS': {
      const hero = state.heroes.find((h) => h.id === action.heroId)
      if (!hero || !offers(state).healingHands?.includes(hero.id)) return state
      return healHero(dropOffer(state, 'healingHands', hero.id), hero.id, 1, 'Healing Hands')
    }

    case 'BRUTAL_RECOVERY': {
      const tarak = heroWith(state, 'brutal-recovery')
      const assault = tarak?.powers.find((p) => p.used && effectsOf(p).reaction === 'furious')
      if (!offers(state).brutalRecovery || !assault) return state
      const next = updateHero(dropOffer(state, 'brutalRecovery'), tarak.id, (h) => ({
        powers: h.powers.map((p) => (p.id === assault.id ? { ...p, used: false } : p)),
      }))
      return withLog(next, `Brutal Recovery: ${tarak.name} flipped Furious Assault back over.`)
    }

    case 'TOGGLE_POWER':
      return updateHero(state, action.heroId, (hero) => ({
        powers: hero.powers.map((p) =>
          p.id === action.powerId && p.type !== 'at-will' ? { ...p, used: !p.used } : p,
        ),
      }))

    case 'SET_POWER_CARD': {
      const hero = state.heroes.find((h) => h.id === action.heroId)
      const slot = hero?.powers.findIndex((p) => p.id === action.powerId)
      if (hero && pickedElsewhere(hero.powers.map((p) => p.card), slot, action.card)) return state
      const card = copyCard(action.card)
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
      if (!hero || hero.level >= MAX_LEVEL || state.xp < XP_TO_LEVEL_UP || state.turn.natural20 !== hero.id) return state
      return levelUp({ ...state, xp: state.xp - XP_TO_LEVEL_UP }, hero)
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

    case 'DRAW_MONSTER': {
      // The deck is built from the card file the first time anyone draws.
      // A card's "draw a monster for that tile" (a Duergar, a villager) draws once per `drawKey`.
      if (action.drawKey && state.turn.monsterDraws?.[action.drawKey] !== undefined) return state
      const withDeck = state.monsterDeck ? state : { ...state, monsterDeck: buildDeck(action.cards, action.random) }
      const drawn = drawMonster(withDeck, action.heroId, action.random)
      if (!action.drawKey || drawn.monsterDeck === withDeck.monsterDeck) return drawn
      const added = drawn.monsters.length > state.monsters.length ? drawn.monsters[drawn.monsters.length - 1].name : 'none'
      return { ...drawn, turn: { ...drawn.turn, monsterDraws: { ...drawn.turn.monsterDraws, [action.drawKey]: added } } }
    }

    case 'MONSTER_ATTACK':
      return monsterAttack(state, action)

    case 'FOE_STEP':
      // The Kobold Dragonlord's step to any square within 1 tile, tapped on the virtual board.
      return queueFoeStep(state, action.tokenId, action.n)

    case 'HIT_MOVES':
      // A villain's hit that moves the hero: the virtual board asks where they go.
      return queueHitMoves(state, action.tokenId)

    case 'PLACE_VILLAIN':
      return placeVillain(state, action)

    case 'REMOVE_VILLAIN':
      // Put on the board by mistake: it goes away without counting as defeated.
      return { ...state, villains: (state.villains ?? []).filter((v) => v.id !== action.villainId) }

    case 'HERO_ATTACK':
      return heroAttack(state, action)

    case 'REROLL_ATTACK':
      return rerollAttack(state, action)

    case 'ATTACK_FOLLOW_UP':
      return attackFollowUp(state, action)

    case 'POWER_DAMAGE':
      return powerDamage(state, action)

    case 'USE_POWER':
      return usePower(state, action)

    case 'DODGE_HIT':
      return dodgeHit(state, action)

    case 'EVADE_HIT':
      return evadeHit(state, action)

    case 'ATTACH_MONSTER_CARDS': {
      // Monsters added before the deck existed get their card, so they can take guided
      // turns and be attacked against their AC. Matched by name.
      const cards = Array.isArray(action.cards) ? action.cards : []
      let changed = false
      const monsters = state.monsters.map((monster) => {
        const card = !monster.card && cards.find((c) => c.name.toLowerCase() === monster.name.toLowerCase())
        if (!card) return monster
        changed = true
        const { id, hp, maxHp, ownerId, conditions } = monster
        return { ...monsterFromCard(card, ownerId), id, hp: Math.min(hp, card.hp * (card.figures ?? 1)), maxHp: Math.max(maxHp, card.hp), conditions }
      })
      return changed ? { ...state, monsters } : state
    }

    case 'MARK_ACTED': {
      // A monster, villain or trap finished its turn this Villain Phase. Kept in the game so
      // every screen sees it, and the turn can't pass until they all have.
      const acted = state.turn.acted ?? []
      if (!action.id || acted.includes(action.id)) return state
      return { ...state, turn: { ...state.turn, acted: [...acted, action.id] } }
    }

    case 'SET_EXPLORED': {
      // The Exploration Phase's question: is the hero on an unexplored edge? With no
      // new tile the phase is over, and the Villain Phase knows to draw an encounter.
      if (PHASES[state.turn.phase]?.key !== 'exploration') return state
      let explored = Boolean(action.explored)
      // With the tile stack, saying yes draws the tile. An empty stack means no new tile.
      if (explored && state.tileStack) {
        if (state.tileStack.stack.length === 0) {
          explored = false
          state = { ...state, turn: { ...state.turn, noTiles: true } }
        } else {
          const drawn = drawDungeonTile(state, { ...action, key: 'explore', from: 'top' })
          return { ...drawn, turn: { ...drawn.turn, explored: true } }
        }
      }
      // A card's end-of-Exploration question (Wrath of the Enemy) holds the phase open.
      if (!explored && phaseChecks(state, 'exploration').length > 0) return { ...state, turn: { ...state.turn, explored } }
      // Skipping ahead ends the Exploration Phase, so its curse rolls happen now.
      const ended = explored ? state : endPhaseCurses(state, state.heroes[state.turn.heroIndex], 'exploration', action.rolls)
      return { ...ended, turn: { ...ended.turn, explored, phase: explored ? ended.turn.phase : ended.turn.phase + 1 } }
    }

    case 'ADJUST_MONSTER_HP':
      return updateMonster(state, action.monsterId, (m) => ({ hp: clamp(m.hp + action.amount, 0, m.maxHp) }))

    case 'TOGGLE_MONSTER_CONDITION':
      return updateMonster(state, action.monsterId, (m) => ({ conditions: toggle(m.conditions, action.condition) }))

    case 'DEFEAT_MONSTER': {
      const villain = activeVillains(state).find((v) => v.id === action.monsterId)
      if (villain) {
        // The Rage Drake still flips to its enraged side the first time.
        const { state: next, defeated } = defeatVillain(state, villain)
        return defeated ? withMoment(next, { kind: 'defeat', art: monsterArt(villain), title: `${villain.name} defeated!`, detail: '' }) : next
      }
      const monster = state.monsters.find((m) => m.id === action.monsterId)
      if (!monster) return state
      if (monster.objective) {
        // The Altar isn't a monster: no XP and no treasure, but it counts for the chamber's goal.
        const next = { ...state, monsters: state.monsters.filter((m) => m.id !== monster.id) }
        return withMoment(withLog(next, `The ${monster.name} was destroyed!`), { kind: 'defeat', title: `The ${monster.name} is destroyed!`, detail: '' })
      }
      // One treasure card per turn, for the first monster defeated.
      const treasure = !state.turn.treasureDrawn
      const counted = countDefeat(state, monster, figuresLeft(monster, monster.hp), true)
      const winner = action.heroId ?? state.heroes[state.turn.heroIndex]?.id ?? null
      const next = {
        ...counted,
        xp: state.xp + monster.xp,
        monsters: state.monsters.filter((m) => m.id !== monster.id),
        turn: treasure ? oweTreasure(state, winner) : state.turn,
      }
      return withMoment(withLog(next, `The ${monster.name} was defeated! +${monster.xp} XP`), {
        kind: 'defeat',
        art: monsterArt(monster),
        title: `${monster.name} defeated!`,
        detail: `+${monster.xp} XP for the party${treasure ? `. ${treasureWords(state)}` : ''}`,
      })
    }

    case 'REMOVE_MONSTER': {
      const monster = state.monsters.find((m) => m.id === action.monsterId)
      if (!monster) return state
      return discardMonsterCard({ ...state, monsters: state.monsters.filter((m) => m.id !== monster.id) }, monster)
    }

    case 'ADJUST_XP':
      return { ...state, xp: Math.max(0, state.xp + action.amount) }

    case 'CANCEL_ENCOUNTER': {
      // Perseverance takes 1 XP off the cost for each hero on Quinn's tile.
      const p = action.perseverance
      const hero = p && state.heroes.find((h) => h.id === p.heroId)
      const power = hero?.powers.find((x) => x.id === p.powerId)
      const helps = power && !power.used && effectsOf(power).reaction === 'perseverance'
      const cost = helps ? Math.max(0, XP_TO_CANCEL_ENCOUNTER - clamp(Number(p.heroesOnTile) || 0, 1, state.heroes.length)) : XP_TO_CANCEL_ENCOUNTER
      if (state.xp < cost || (p && !helps) || state.encounter?.attacked || state.encounter?.card.noCancel) return state
      let next = helps ? markUsed(state, hero.id, power.id) : state
      next = { ...next, xp: next.xp - cost }
      const how = helps ? ' with Perseverance' : ''
      if (!state.encounter) return withLog(next, `Spent ${cost} XP to cancel an encounter${how}.`)
      next = discardEncounterCard({ ...next, encounter: null }, state.encounter.cardId)
      return withLog(next, `Spent ${cost} XP to cancel ${state.encounter.card.name}${how}.`)
    }

    case 'DRAW_ENCOUNTER':
      return drawEncounter(state, action)

    case 'ENCOUNTER_ATTACK': {
      const encounter = state.encounter
      if (!encounter?.card.attack || encounter.attacked) return state
      const next = attackHeroes(state, {
        who: encounter.card.name,
        attack: encounter.card.attack,
        targets: action.targets,
        tileGuarded: action.tileGuarded,
        moment: { title: `${encounter.card.name}!` },
        source: { kind: 'encounter' },
      })
      return next === state ? state : { ...next, encounter: { ...encounter, attacked: true } }
    }

    case 'RESOLVE_ENCOUNTER':
      return resolveEncounter(state, action)

    case 'FILTER_ENCOUNTER_MONSTERS': {
      // Spotted! stacks the monster deck before its monster is drawn, so that draw comes
      // off the stacked deck. After this the card can't be cancelled.
      const encounter = state.encounter
      if (!encounter?.card.filterMonsters || encounter.filtered) return state
      const next = filterMonsterDeck(state, encounter.card.filterMonsters, action.random, action.monsterCards)
      return { ...next, encounter: { ...encounter, filtered: true, attacked: true } }
    }

    case 'REDRAW_ENCOUNTER': {
      // A trap or hazard on a tile that already has a marker: discard it and draw a new one.
      const encounter = state.encounter
      if (!encounter || encounter.attacked) return state
      const next = discardEncounterCard({ ...state, encounter: null }, encounter.cardId)
      return withLog(
        oweEncounter(next, `${encounter.card.name} was discarded because the tile already had a marker, so draw a new card.`),
        `That tile already has a marker, so ${encounter.card.name} was discarded.`,
      )
    }

    case 'TRAP_ATTACK': {
      const trap = (state.traps ?? []).find((t) => t.id === action.trapId)
      if (!trap?.card.trap?.attack) return state
      return attackHeroes(state, {
        who: `The ${trap.name}`,
        attack: trap.card.trap.attack,
        targets: action.targets,
        tileGuarded: action.tileGuarded,
        moment: { title: `${trap.name}!`, trap: true },
        source: { kind: 'trap', trapId: trap.id },
      })
    }

    case 'TRAP_STEP':
      return trapStep(state, action, withLog)

    case 'TRAP_DAMAGE': {
      const trap = (state.traps ?? []).find((t) => t.id === action.trapId)
      const damage = trap?.card.trap?.damage ?? 0
      const heroIds = Array.isArray(action.heroIds) ? action.heroIds : []
      if (!damage || heroIds.length === 0) return state
      const { next, downed } = damageHeroes(state, heroIds, damage, `the ${trap.name}`)
      return withMoment(next, {
        kind: downed.length > 0 ? 'monster-down' : 'monster',
        trap: true,
        title: `${trap.name}!`,
        detail: downed.length > 0 ? `${downed.join(' and ')} ${downed.length > 1 ? 'are' : 'is'} down!` : `${damage} damage`,
      })
    }

    case 'DISABLE_TRAP': {
      // Instead of attacking, a hero on the trap's tile rolls to disable it (Kobold Trappers makes it harder).
      const trap = (state.traps ?? []).find((t) => t.id === action.trapId && t.type === 'trap')
      const hero = state.heroes.find((h) => h.id === action.heroId)
      // Practiced Evasion's roll is free; otherwise this is the active hero's attack.
      if (!trap || !hero || !validRoll(action.roll) || (!action.free && !canSpendAttack(state, hero))) return state
      const penalty = state.environment?.card?.trapPenalty ?? 0
      const tools = itemTrapBonus(hero)
      const total = action.roll - penalty + tools
      const target = trap.card.trap?.disable ?? 10
      const disabled = total >= target
      const sum = penalty || tools ? `${action.roll}${tools ? ` + ${tools}` : ''}${penalty ? ` − ${penalty}` : ''} = ${total}` : `${action.roll}`
      let next = withLog(action.free ? state : spendAttack(state, hero, `the ${trap.name}`), `${hero.name} rolled ${sum} to disable the ${trap.name} (needed ${target}).${disabled ? ' Disabled!' : ''}`)
      if (disabled) next = discardEncounterCard({ ...next, traps: next.traps.filter((t) => t.id !== trap.id) }, trap.cardId)
      return withMoment(next, {
        kind: disabled ? 'defeat' : 'roll',
        heroId: hero.id,
        value: action.roll,
        title: disabled ? `${trap.name} disabled!` : `The ${trap.name} is still there`,
        detail: `${hero.name} needed ${target}${penalty ? ` after the −${penalty}` : ''}.`,
      })
    }

    case 'REMOVE_TRAP': {
      const trap = (state.traps ?? []).find((t) => t.id === action.trapId)
      if (!trap) return state
      return withLog(discardEncounterCard({ ...state, traps: state.traps.filter((t) => t.id !== trap.id) }, trap.cardId), `The ${trap.name} marker was removed.`)
    }

    case 'CURSE_ROLL': {
      // A curse a hero can try to end with a roll instead of attacking (opening the Cage).
      // The active hero rolls for their own curse, or for a hero on their tile, and it
      // takes the place of their attack this turn.
      const hero = state.heroes.find((h) => h.id === action.heroId)
      const curse = hero?.curses?.find((c) => c.id === action.curseId)
      const removeRoll = curse?.card?.removeRoll
      if (!removeRoll || removeRoll.phase !== 'action' || !validRoll(action.roll)) return state
      const helper = state.heroes[state.turn.heroIndex]
      if (!canSpendAttack(state, helper)) return state
      const broken = action.roll >= removeRoll.target
      const who = helper.id === hero.id ? hero.name : `${helper.name}, helping ${hero.name},`
      const tried = spendAttack(state, helper, `the ${curse.name}`)
      const next = broken
        ? removeCurse(tried, hero.id, curse.id, `${who} rolled ${action.roll}. ${hero.name} is free of the ${curse.name}!`)
        : withLog(tried, `${who} rolled ${action.roll} against the ${curse.name} (needed ${removeRoll.target}).`)
      return withMoment(next, {
        kind: broken ? 'defeat' : 'roll',
        heroId: helper.id,
        value: action.roll,
        title: broken ? `${hero.name} is free of the ${curse.name}!` : `${hero.name} is still stuck in the ${curse.name}`,
        detail: `${helper.name} needed ${removeRoll.target}.`,
      })
    }

    case 'REMOVE_CURSE': {
      const hero = state.heroes.find((h) => h.id === action.heroId)
      const curse = hero?.curses?.find((c) => c.id === action.curseId)
      return curse ? removeCurse(state, hero.id, curse.id, `${hero.name}'s ${curse.name} curse is over.`) : state
    }

    case 'SET_MONSTER_OWNER': {
      // Warp in Time and High Alert pass monster cards between heroes.
      const owner = state.heroes.find((h) => h.id === action.ownerId)
      const monster = state.monsters.find((m) => m.id === action.monsterId)
      if (!owner || !monster) return state
      return withLog(updateMonster(state, monster.id, () => ({ ownerId: owner.id })), `The ${monster.name} now belongs to ${owner.name}.`)
    }

    case 'DRAW_TREASURE':
      return drawTreasure(state, action)

    case 'KEEP_TREASURE':
      return keepTreasure(state, action)

    case 'USE_ITEM':
      return useItem(state, action)

    case 'MONSTER_CONTROL':
      return monsterControl(state, action)

    case 'TOGGLE_ITEM':
      // A flipped item flipped back by hand, or the other way.
      return updateHero(state, action.heroId, (hero) => ({
        items: heroItems(hero).map((i) => (i.id === action.itemId ? { ...i, used: !i.used } : i)),
      }))

    case 'DISCARD_ITEM': {
      const hero = state.heroes.find((h) => h.id === action.heroId)
      const item = heroItems(hero).find((i) => i.id === action.itemId)
      return item ? withLog(spendItem(state, hero.id, item.id, 'discard'), `${hero.name} discarded the ${item.name}.`) : state
    }

    case 'GIVE_ITEM': {
      // A hero hands an item to another hero (JJ's table: a spare item goes to someone it helps).
      const hero = state.heroes.find((h) => h.id === action.heroId)
      const to = state.heroes.find((h) => h.id === action.toHeroId)
      const item = heroItems(hero).find((i) => i.id === action.itemId)
      if (!item || !to || to.id === hero.id) return state
      const next = updateHero(updateHero(state, hero.id, (h) => ({ items: h.items.filter((i) => i.id !== item.id) })), to.id, (h) => ({
        items: [...heroItems(h), item],
      }))
      return withLog(next, `${hero.name} gave the ${item.name} to ${to.name}.`)
    }

    case 'UPDATE_ENCOUNTER_CARDS':
      return updateEncounterCards(state, action.cards)

    case 'ANSWER_CHECK':
      return answerCheck(state, action)

    case 'SET_TRIANGLE':
      // The Villain Phase's question: does the new tile have a black triangle?
      return { ...state, turn: { ...state.turn, triangle: Boolean(action.triangle) } }

    case 'ADJUST_SURGES':
      return { ...state, surges: Math.max(0, state.surges + action.amount) }

    case 'ADJUST_TILES':
      return adjustTiles(state, action.amount)

    case 'NEXT_PHASE': {
      const { heroIndex, phase, round } = state.turn
      // The phase's questions (Walls of Magma, Dragon Fear...) have to be answered first.
      if (phaseChecks(state, checksFor(PHASES[phase].key)).length > 0) return state
      // A hero who started the turn at 0 HP spends a healing surge before anything else.
      if (state.turn.startDamageDue && state.status === 'playing') return state
      // With villagers in play, the Hero Phase ends with the roll for one of them.
      if (villagerRollDue(state)) return state
      if (phase < PHASES.length - 1) {
        const ended = endPhaseCurses(state, state.heroes[heroIndex], PHASES[phase].key, action.rolls)
        const next = { ...ended, turn: { ...ended.turn, phase: phase + 1 } }
        if (PHASES[phase].key !== 'hero') return next
        const out = endHeroPhase(next, next.heroes[heroIndex], action.roll)
        // Ending the Hero Phase on the exit's stairs gets the hero out (virtual board).
        return escapeAtPhaseEnd(out, out.heroes[heroIndex])
      }
      // An encounter or treasure card has to be finished before the turn moves on.
      if (state.encounter || state.treasure) return state
      // A hero who escaped (The Vast Gate Opens) has no more turns.
      let nextIndex = (heroIndex + 1) % state.heroes.length
      for (let i = 0; i < state.heroes.length && escapedHero(state.heroes[nextIndex]); i++) nextIndex = (nextIndex + 1) % state.heroes.length
      // Read-aloud text belongs to the turn it came up in; it doesn't stay on the projector.
      const told = state.adventure?.story ? { ...state, adventure: { ...state.adventure, story: null } } : state
      return startTurn({
        ...endPhaseCurses(told, state.heroes[heroIndex], 'villain', action.rolls),
        turn: { heroIndex: nextIndex, phase: 0, round: nextIndex <= heroIndex ? round + 1 : round },
      })
    }

    case 'PREVIOUS_PHASE': {
      const { heroIndex, phase, round } = state.turn
      // An open encounter card is only shown in the Villain Phase; stepping back would leave
      // it holding up a phase that can't show it, with no way on but Undo.
      if (state.encounter) return state
      if (phase > 0) return { ...state, turn: { ...state.turn, phase: phase - 1 } }
      if (heroIndex === 0 && round === 1) return state
      const prevIndex = (heroIndex - 1 + state.heroes.length) % state.heroes.length
      return {
        ...state,
        turn: { heroIndex: prevIndex, phase: PHASES.length - 1, round: prevIndex === state.heroes.length - 1 ? round - 1 : round },
      }
    }

    case 'END_GAME':
      return withLog({ ...state, status: action.result, ending: null }, action.result === 'won' ? 'Victory!' : 'The party was defeated.')

    case 'RESUME':
      return { ...state, status: 'playing', ending: null }

    case 'TRY_AGAIN':
      return tryAgain(state, action)

    case 'PLAY_BOARD_SOUND':
      return playBoardSound(state, action)

    case 'SET_SOUNDBOARD_OFF':
      return setBoardOff(state, action.off)

    case 'SET_SOUNDBOARD_UNLIMITED':
      return setBoardUnlimited(state, action.unlimited)

    default:
      return state
  }
}
