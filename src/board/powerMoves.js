// Powers that move figures on the virtual board: Charge, Into the Fray, a swap, a monster
// pulled next to you, Spectral Ram... A power puts its moves in state.turn.boardMove:
//   { heroId, source, attacked: [monster ids], steps: [step, ...] }
// and the board does the first step, then the next. A step says which figure moves (`pick`)
// and where it can go (`to`):
//   pick  self, heroOnTile, otherOnTile (another hero on the tile), heroWithin1/2 (another hero),
//         monsterWithin1/2/3, monsterOnTile, monsterOffHeroTiles, attacked,
//         listed (the figures in move.tokens, each moved once: Cause Fear, Concussive Blast)
//   to    squares (walk `n` squares, or 'speed'), nextToSelf, nextToHeroWithin2, tileWithin (`n` tiles
//         of the hero, or of the figure itself with ref: 'piece'), ownTile, adjacentTile,
//         tileCloser (onto a tile 1 tile closer to the hero), swap; and for a villain's hit
//         (move.from is the villain's token): awayFrom (`n` tiles farther from it), nextToFoe,
//         triangle (the tile the hero's tile's triangle points to); nextToAttacked (next to a
//         monster the power attacked: Crane's Wings, a fan hero's power), nextToMonsterWithin1
//         (next to any monster within 1 tile: Willbreaker), crowdedTile (a tile within `n` tiles with
//         `min` or more monsters: Experienced), nextToNewMonster (Come and Get It), onToken (from a
//         `kind` token the hero stands on or next to, to another one: Secret Paths, Paths of Darkness)
// `hit: true` steps only happen when the attack hit, `miss: true` steps only when it missed,
// `ifShadow: true` only when the hero attacked from the shadows (Shadowphage).
// `each: 'heroOnTile' | 'monsterOnTile'` makes the step once for every such figure (Tune of Ice
// and Wind, One Hundred Leaves). `minApart: n` only moves a figure at least n tiles from the
// hero (Vicious Mockery). pick `otherHero` is any other hero on the board (Psionic Stride).

import { baseId, key } from './grid.js'
import { adjacent, distances, reachable, tilesBetween } from './paths.js'
import { newestMonster } from '../state/fanPowers.js'
import { heroesFor } from './tactics.js'
import { boardGrid, moveSpeed, occupied, placeToken } from './play.js'

const parse = (k) => k.split(',').map(Number)

// Queues a power's moves (nothing happens without a board or with no steps left).
// `from` is a monster's token the moves are measured from (a villain's hit, Bravery), and
// `fromName` its name for the prompt.
export function queueMoves(state, hero, power, steps, { attacked = [], hit = false, shadow = false, tokens, from, fromName, prompt } = {}) {
  if (!state.board || !hero || !Array.isArray(steps)) return state
  let todo = steps.filter((s) => (!s.hit || hit) && (!s.miss || !hit) && (!s.ifShadow || shadow))
  const each = todo.find((s) => s.each)
  if (each && !tokens) {
    const self = state.board.tokens[hero.id]
    const grid = boardGrid(state.board)
    const tile = self && grid.get(key(self))?.area
    const figures = each.each === 'monsterOnTile' ? foeTokens(state) : heroTokens(state)
    tokens = figures.filter((f) => tile && grid.get(key(f.at))?.area === tile).map((f) => f.id)
    const one = { ...each, pick: 'listed' }
    delete one.each
    todo = todo.flatMap((s) => (s === each ? tokens.map(() => one) : [s]))
  }
  if (todo.length === 0) return state
  const move = { heroId: hero.id, source: power?.name ?? '', attacked, steps: todo, ...(tokens ? { tokens } : {}), ...(from ? { from, fromName } : {}), ...(prompt ? { prompt } : {}) }
  return settle({ ...state, turn: { ...state.turn, boardMove: move } })
}

// Cause Fear: once the allies' extra attacks are done (and no other move is waiting), each
// monster figure still on the cleric's tile goes onto a tile within 2 tiles of the cleric.
export function queueFearMove(state) {
  const fear = state.turn.causeFear
  if (!fear || !state.board || state.turn.boardMove) return state
  if ((state.turn.bonusAttacks ?? []).some((b) => b.source === fear.source)) return state
  const hero = state.heroes.find((h) => h.id === fear.heroId)
  const self = hero && state.board.tokens[hero.id]
  const cleared = { ...state, turn: { ...state.turn, causeFear: null } }
  if (!self) return cleared
  const grid = boardGrid(state.board)
  const tile = grid.get(key(self))?.area
  const tokens = foeTokens(state).filter((f) => grid.get(key(f.at))?.area === tile).map((f) => f.id)
  const steps = tokens.map(() => ({ pick: 'listed', to: 'tileWithin', n: 2 }))
  return queueMoves(cleared, hero, { name: fear.source }, steps, { tokens })
}

// Encounter cards that move figures on the virtual board, queued when the card is resolved
// with the active hero as the one the moves are measured from:
//   Concussive Blast  each hero on the active hero's tile goes to an adjacent tile
//   Quick Advance     a monster not on any hero's tile moves 1 tile closer to the active hero
export function queueEncounterMoves(state, hero, card) {
  const self = state.board && hero && state.board.tokens[hero.id]
  if (!self) return state
  if (card.id === 'concussive-blast') {
    const grid = boardGrid(state.board)
    const tile = grid.get(key(self))?.area
    const tokens = heroTokens(state).filter((h) => grid.get(key(h.at))?.area === tile).map((h) => h.id)
    return queueMoves(state, hero, card, tokens.map(() => ({ pick: 'listed', to: 'adjacentTile' })), { tokens })
  }
  if (card.id === 'quick-advance') return queueMoves(state, hero, card, [{ pick: 'monsterOffHeroTiles', to: 'tileCloser' }])
  return state
}

// A villain's hit that moves the hero ("Move the Hero 1 tile away from the duergar", "to any
// square adjacent to the Otyugh", "in the direction of the tile's triangle"): once the attack
// is done, each hero it still hits gets a board move. `tokenId` is the villain's token.
export function hitMoveStep(effect) {
  const text = String(effect ?? '')
  let m
  if ((m = text.match(/move the hero (\d+) tiles? away/i))) return { pick: 'listed', to: 'awayFrom', n: Number(m[1]) }
  if (/move the hero to any square adjacent/i.test(text)) return { pick: 'listed', to: 'nextToFoe' }
  if (/move the hero 1 tile in the direction of the tile's triangle/i.test(text)) return { pick: 'listed', to: 'triangle' }
  return null
}
export function queueHitMoves(state, tokenId) {
  const last = state.turn.lastMonsterAttack
  const foe = state.board && last && findFoeName(state, last.monsterId)
  const attack = foe && foe.card?.attacks?.find((a) => a.id === last.attackId && (last.tableRoll == null || !a.roll || (last.tableRoll >= a.roll[0] && last.tableRoll <= a.roll[1])))
  const s = hitMoveStep(attack?.effect)
  if (!s || !state.board.tokens[tokenId] || state.turn.boardMove) return state
  const tokens = last.results.filter((r) => r.hit && !r.dodged && !r.villager && state.board.tokens[r.heroId]).map((r) => r.heroId)
  const hero = state.heroes.find((h) => h.id === tokens[0])
  if (!hero) return state
  return queueMoves(state, hero, { name: `${foe.name}'s ${attack.name}` }, tokens.map(() => s), { tokens, from: tokenId, fromName: foe.name })
}
// A monster that moves "to any square within 1 tile" (the Kobold Dragonlord after its
// attack): the players tap where, on the virtual board.
export function queueFoeStep(state, tokenId, n = 1) {
  const foe = state.board?.tokens[tokenId] && findFoeName(state, baseId(tokenId))
  const hero = state.heroes[state.turn.heroIndex]
  if (!foe || !hero || !state.board.tokens[hero.id] || state.turn.boardMove) return state
  return queueMoves(state, hero, { name: foe.name }, [{ pick: 'listed', to: 'tileWithin', n, ref: 'piece' }], { tokens: [tokenId], from: tokenId, fromName: foe.name })
}
// Scroll of Monster Control: the players put the monster (one figure, `tokenId`) in any square
// within 1 tile of where it stands; if it ends next to another monster it attacks that one
// (see hypnotized(), which works for any move that sets turn.powerMoved).
export function queueMonsterControl(state, hero, tokenId, item) {
  const foe = state.board?.tokens[tokenId] && findFoeName(state, baseId(tokenId))
  if (!foe || !hero || !state.board.tokens[hero.id] || state.turn.boardMove) return state
  const prompt = `Tap the ${foe.name}, then a lit square within 1 tile of where it stands. If it lands next to another monster, it attacks that one.`
  return queueMoves(state, hero, item, [{ pick: 'listed', to: 'tileWithin', n: 1, ref: 'piece' }], { tokens: [tokenId], prompt })
}
// Wand of Fear: each monster within 1 tile of the hero is offered once; the players move the
// ones on the tile they chose to a square within 2 tiles of the hero and skip the rest.
export function queueWandOfFear(state, hero, item) {
  const self = state.board && state.board.tokens[hero.id]
  if (!self) return state
  const grid = boardGrid(state.board)
  const tokens = foeTokens(state).filter((f) => tilesBetween(grid, self, f.at) <= 1).map((f) => f.id)
  const prompt = `Tap a monster on the tile you chose (within 1 tile of ${hero.name}), then a lit square within 2 tiles of ${hero.name}. Skip the monsters on other tiles.`
  return queueMoves(state, hero, item, tokens.map(() => ({ pick: 'listed', to: 'tileWithin', n: 2 })), { tokens, prompt })
}

const findFoeName = (state, id) => [...state.monsters, ...(state.villains ?? [])].find((f) => f.id === id)

const step = (state) => state.turn.boardMove?.steps?.[0] ?? null

// Tokens of figures: heroes still standing, and every monster or villain figure.
function heroTokens(state) {
  return state.heroes.filter((h) => h.hp > 0 && state.board.tokens[h.id]).map((h) => ({ id: h.id, at: state.board.tokens[h.id] }))
}
function foeTokens(state) {
  const foes = new Set([...state.monsters, ...(state.villains ?? []).filter((v) => !v.defeated)].map((f) => f.id))
  return Object.entries(state.board.tokens).filter(([id]) => foes.has(baseId(id))).map(([id, at]) => ({ id, at }))
}

// Which figures the current step can move (token ids).
export function moveChoices(state) {
  const s = step(state)
  const list = choicesFor(state)
  if (!s?.minApart || list.length === 0) return list
  const grid = boardGrid(state.board)
  const self = state.board.tokens[state.turn.boardMove.heroId]
  return list.filter((id) => tilesBetween(grid, state.board.tokens[id], self) >= s.minApart)
}
function choicesFor(state) {
  const move = state.turn.boardMove
  const s = step(state)
  const self = move && state.board?.tokens[move.heroId]
  if (!s || !self) return []
  // A step measured from a monster that isn't on the board (Bravery used from its card) has nothing to do.
  if (['awayFrom', 'nextToFoe'].includes(s.to) && !state.board.tokens[move.from]) return []
  const grid = boardGrid(state.board)
  const tileOf = (at) => grid.get(key(at))?.area
  const near = (list, when) => heroesFor(when, grid, self, list).map((f) => f.id)
  const others = heroTokens(state).filter((h) => h.id !== move.heroId)
  switch (s.pick) {
    case 'self':
      return [move.heroId]
    case 'heroOnTile':
      return heroTokens(state).filter((h) => tileOf(h.at) === tileOf(self)).map((h) => h.id)
    case 'otherOnTile':
      return others.filter((h) => tileOf(h.at) === tileOf(self)).map((h) => h.id)
    case 'heroWithin1':
    case 'heroWithin2':
      return near(others, s.pick === 'heroWithin1' ? 'within1' : 'within2')
    case 'monsterWithin1':
    case 'monsterWithin2':
    case 'monsterWithin3':
      return near(foeTokens(state), s.pick.replace('monsterW', 'w'))
    case 'monsterOnTile':
      return foeTokens(state).filter((f) => tileOf(f.at) === tileOf(self)).map((f) => f.id)
    case 'monsterOffHeroTiles': {
      const heroTiles = new Set(heroTokens(state).map((h) => tileOf(h.at)))
      return foeTokens(state).filter((f) => !heroTiles.has(tileOf(f.at))).map((f) => f.id)
    }
    case 'otherHero':
      return others.map((h) => h.id)
    case 'attacked':
      return foeTokens(state).filter((f) => (move.attacked ?? []).includes(baseId(f.id))).map((f) => f.id)
    case 'listed':
      return [...heroTokens(state), ...foeTokens(state)].filter((f) => (move.tokens ?? []).includes(f.id)).map((f) => f.id)
    default:
      return []
  }
}

// The squares (as "x,y") the chosen figure can go to, or for a swap the heroes it can swap with.
export function moveTargets(state, id) {
  const move = state.turn.boardMove
  const s = step(state)
  const at = state.board?.tokens[id]
  const self = move && state.board?.tokens[move.heroId]
  if (!s || !at || !self || !moveChoices(state).includes(id)) return []
  if (s.to === 'swap') return [key(at)]
  const grid = boardGrid(state.board)
  const { taken, stops } = occupied(state, id)
  const free = (k) => grid.get(k)?.floor && !taken.has(k)
  const all = [...grid.keys()].filter(free)
  const nextTo = (sq) => [...distances(grid, sq, { limit: 1 }).keys()].filter((k) => k !== key(sq) && free(k))
  const hero = state.heroes.find((h) => h.id === move.heroId)
  switch (s.to) {
    case 'squares': {
      // 'speed' is the moving hero's own speed (Nature's Gifts moves another hero).
      const n = s.n === 'speed' ? moveSpeed(state.heroes.find((h) => h.id === id) ?? hero) : s.n ?? 1
      // Heroes can't walk through monsters; a moved monster can't walk through heroes.
      const isHero = state.heroes.some((h) => h.id === id)
      const blocked = isHero ? stops : new Set(heroTokens(state).map((h) => key(h.at)))
      return reachable(grid, at, n, { stops: blocked, taken })
    }
    case 'nextToSelf':
      return nextTo(self)
    case 'nextToHeroWithin2': {
      const others = heroTokens(state).filter((h) => h.id !== move.heroId)
      const near = heroesFor('within2', grid, self, others)
      return [...new Set(near.flatMap((h) => nextTo(h.at)))]
    }
    case 'tileWithin': {
      const ref = s.ref === 'piece' ? at : self
      return all.filter((k) => tilesBetween(grid, ref, parse(k)) <= (s.n ?? 1))
    }
    case 'ownTile': {
      const tile = grid.get(key(self))?.area
      return all.filter((k) => grid.get(k).area === tile)
    }
    case 'adjacentTile':
      return all.filter((k) => tilesBetween(grid, at, parse(k)) === 1)
    case 'awayFrom': {
      const foeAt = state.board.tokens[move.from]
      if (!foeAt) return []
      const n = s.n ?? 1
      const apart = tilesBetween(grid, at, foeAt)
      const out = all.filter((k) => tilesBetween(grid, at, parse(k)) === n)
      const farthest = Math.max(apart, ...out.map((k) => tilesBetween(grid, parse(k), foeAt)))
      // n tiles farther away when the dungeon allows it, else as far as it goes.
      const best = Math.min(apart + n, farthest)
      return best > apart ? out.filter((k) => tilesBetween(grid, parse(k), foeAt) === best) : []
    }
    case 'nextToFoe': {
      const foeAt = state.board.tokens[move.from]
      return foeAt ? nextTo(foeAt) : []
    }
    case 'nextToMonsterWithin1': {
      const near = heroesFor('within1', grid, self, foeTokens(state))
      return [...new Set(near.flatMap((f) => nextTo(f.at)))]
    }
    case 'nextToAttacked': {
      const foes = foeTokens(state).filter((f) => (move.attacked ?? []).includes(baseId(f.id)))
      return [...new Set(foes.flatMap((f) => nextTo(f.at)))]
    }
    case 'triangle': {
      const tile = grid.get(key(at))?.tile
      const placed = state.board.tiles.find((t) => t.uid === tile)
      if (!placed || !state.board.defs[placed.tileId]?.triangle) return []
      // The triangle is on the south edge of the tile's layout, turned with the tile.
      const side = ['S', 'W', 'N', 'E'][((placed.turn / 90) % 4 + 4) % 4]
      const own = [...grid.values()].filter((sq) => sq.tile === tile)
      const xs = own.map((sq) => sq.x)
      const ys = own.map((sq) => sq.y)
      const past = { S: ([, y]) => y > Math.max(...ys), N: ([, y]) => y < Math.min(...ys), E: ([x]) => x > Math.max(...xs), W: ([x]) => x < Math.min(...xs) }[side]
      return all.filter((k) => past(parse(k)) && tilesBetween(grid, at, parse(k)) === 1)
    }
    case 'crowdedTile': {
      // Experienced: a tile within n tiles with at least `min` monster figures on it.
      const count = new Map()
      for (const f of foeTokens(state)) count.set(grid.get(key(f.at))?.area, (count.get(grid.get(key(f.at))?.area) ?? 0) + 1)
      return all.filter((k) => (count.get(grid.get(k).area) ?? 0) >= (s.min ?? 3) && tilesBetween(grid, self, parse(k)) <= (s.n ?? 2))
    }
    case 'nextToNewMonster': {
      // Come and Get It: next to the monster drawn last this turn.
      const newest = newestMonster(state)
      const foes = foeTokens(state).filter((f) => baseId(f.id) === newest?.id)
      return [...new Set(foes.flatMap((f) => nextTo(f.at)))]
    }
    case 'onToken': {
      // Secret Paths, Paths of Darkness: from one of these tokens to (next to) another one.
      const tokens = (state.board.items ?? []).filter((i) => i.kind === s.kind && i.at && (!s.own || i.owner === move.heroId))
      const here = tokens.filter((t) => key(t.at) === key(at) || adjacent(grid, at, t.at))
      if (here.length === 0) return []
      const there = tokens.filter((t) => !here.includes(t))
      return [...new Set(there.flatMap((t) => (free(key(t.at)) ? [key(t.at)] : nextTo(t.at))))]
    }
    case 'tileCloser': {
      const apart = tilesBetween(grid, at, self)
      return all.filter((k) => tilesBetween(grid, at, parse(k)) === 1 && tilesBetween(grid, parse(k), self) === apart - 1)
    }
    default:
      return []
  }
}

const nextStep = (state) => {
  const move = state.turn.boardMove
  const steps = (move?.steps ?? []).slice(1)
  return settle({ ...state, turn: { ...state.turn, boardMove: steps.length > 0 ? { ...move, steps } : null } })
}

// Steps with nothing to move (the monster Distracting Jab hit was defeated) are passed over.
function settle(state) {
  let next = state
  while (next.turn.boardMove && moveChoices(next).length === 0) {
    const move = next.turn.boardMove
    const steps = move.steps.slice(1)
    next = { ...next, turn: { ...next.turn, boardMove: steps.length > 0 ? { ...move, steps } : null } }
  }
  return next
}

// The player tapped where the figure goes (or, for a swap, the hero to swap with).
export function boardMove(state, action) {
  const s = step(state)
  const id = typeof action.id === 'string' ? action.id : action.heroId
  if (!s || !id) return state
  if (s.to === 'swap') {
    const me = state.turn.boardMove.heroId
    if (!moveChoices(state).includes(id)) return state
    const [a, b] = [state.board.tokens[me], state.board.tokens[id]]
    return nextStep(placeToken(placeToken(state, me, b), id, a))
  }
  const to = Array.isArray(action.to) ? action.to : null
  if (!to || !moveTargets(state, id).includes(key(to))) return state
  const placed = placeToken(state, id, to)
  // The last figure a power moved (Hypnotism attacks a monster next to it).
  const moved = { ...placed, turn: { ...placed.turn, powerMoved: { source: placed.turn.boardMove.source, id } } }
  const move = moved.turn.boardMove
  // A listed figure is moved once, so it isn't offered again for the next step.
  const tokens = move.tokens?.filter((t) => t !== id)
  return nextStep(tokens ? { ...moved, turn: { ...moved.turn, boardMove: { ...move, tokens } } } : moved)
}

// Hypnotism: the monster the power moved, and the monsters (ids) it ended up next to.
export function hypnotized(state, powerName) {
  const moved = state.board && state.turn.powerMoved?.source === powerName ? state.turn.powerMoved.id : null
  const at = moved && state.board.tokens[moved]
  if (!at) return null
  const grid = boardGrid(state.board)
  const next = foeTokens(state).filter((f) => baseId(f.id) !== baseId(moved) && distances(grid, at, { limit: 1 }).has(key(f.at)))
  return { id: baseId(moved), nextTo: [...new Set(next.map((f) => baseId(f.id)))] }
}

export const skipBoardMove = (state) => (state.turn.boardMove ? nextStep(state) : state)

// What the board asks for this step, in plain words.
const PICKS = {
  self: (me) => `${me}`,
  heroOnTile: (me) => `a hero on ${me}'s tile`,
  otherOnTile: (me) => `another hero on ${me}'s tile`,
  heroWithin1: () => 'a hero within 1 tile',
  heroWithin2: () => 'a hero within 2 tiles',
  monsterWithin1: () => 'a monster within 1 tile',
  monsterWithin2: () => 'a monster within 2 tiles',
  monsterWithin3: () => 'a monster within 3 tiles',
  monsterOnTile: (me) => `a monster on ${me}'s tile`,
  monsterOffHeroTiles: () => 'a monster not on any hero’s tile',
  attacked: () => 'the monster',
  otherHero: () => 'another hero',
  listed: () => 'a monster',
}
// Where the figure goes, for the prompt of a listed figure.
const WHERE = {
  tileWithin: (s, me) => `within ${s.n ?? 1} tiles of ${me}`,
  adjacentTile: () => 'on a tile next to its own',
  awayFrom: (s, me, move) => `${s.n ?? 1} tile${(s.n ?? 1) > 1 ? 's' : ''} farther from the ${move.fromName}`,
  nextToFoe: (s, me, move) => `next to the ${move.fromName}`,
  nextToAttacked: () => 'next to the monster it attacked',
  triangle: () => "on the tile the triangle points to",
}
export function movePrompt(state) {
  const move = state.turn.boardMove
  const s = step(state)
  if (!s) return ''
  if (move.prompt) return move.prompt
  const me = state.heroes.find((h) => h.id === move.heroId)?.name ?? 'the hero'
  const who = PICKS[s.pick]?.(me) ?? 'a figure'
  if (s.to === 'swap') return `Tap ${who} to swap places with ${me}.`
  if (s.pick === 'listed') {
    const what = state.heroes.some((h) => (move.tokens ?? []).includes(h.id)) ? 'a hero' : 'a monster'
    const where = (WHERE[s.to] ?? WHERE.tileWithin)(s, me, move)
    if (move.tokens?.includes(move.from)) return `Tap the ${move.fromName}, then a lit square within ${s.n ?? 1} tile${(s.n ?? 1) > 1 ? 's' : ''} of where it stands.`
    if (move.from) return `Tap ${what} the ${move.fromName} hit, then a lit square ${where}.`
    return `Tap ${what} that was on ${me}'s tile, then a lit square ${where}.`
  }
  if (s.to === 'tileCloser') return `Tap ${who}, then a lit square: it moves 1 tile closer to ${me}.`
  return `Tap ${who}, then a lit square.`
}
