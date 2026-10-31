// Each player's records across every game they've finished, and the titles they've earned
// (data/titles.js). The Pi keeps one entry per finished game, by player name; the records
// are added up from those entries whenever they're asked for, so Undo after a game ended
// (or a new title added later) never leaves a total wrong.
import { TITLES } from '../data/titles.js'
import { recap } from './stats.js'

const ENDED = new Set(['won', 'lost'])

// "Colton " and "colton" are the same player. A solo game's heroes all go by "Solo",
// which isn't anyone in particular, and the demo game's heroes have no player.
export const playerKey = (name) => (typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').toLowerCase() : '')
const counted = (name) => playerKey(name) !== '' && playerKey(name) !== 'solo'

// Which game an entry is: the first hero's id, which is new every time a game starts
// (Try again and the next campaign adventure included).
export const recordKey = (state) => state.heroes?.[0]?.id ?? null

// What a finished game adds to each player's records, or null when the game hasn't ended,
// nobody in it has a name, or it was only practice (the Hero Swap Warm-up). A player running more than one hero gets them added together.
export function gameRecord(state) {
  if (!ENDED.has(state.status) || !recordKey(state) || state.adventure?.card?.practice) return null
  const { heroes, mvpIds } = recap(state)
  const villains = (state.villains ?? []).filter((v) => v.defeated).map((v) => v.name)
  const players = new Map()
  for (const { hero, stats } of heroes) {
    if (!counted(hero.player)) continue
    const key = playerKey(hero.player)
    const player = players.get(key) ?? { name: hero.player.trim(), heroes: [], mvp: false, stats: {} }
    for (const [stat, value] of Object.entries(stats)) {
      player.stats[stat] = stat === 'biggestHit' ? Math.max(player.stats[stat] ?? 0, value) : (player.stats[stat] ?? 0) + value
    }
    if (!player.heroes.includes(hero.key)) player.heroes.push(hero.key)
    player.mvp ||= mvpIds.includes(hero.id)
    players.set(key, player)
  }
  if (players.size === 0) return null
  return {
    key: recordKey(state),
    outcome: state.status,
    adventure: state.adventure?.card?.title ?? null,
    villains,
    players: [...players.values()],
  }
}

const emptyRecord = (name) => ({
  name,
  games: 0,
  wins: 0,
  losses: 0,
  kills: 0,
  damageDealt: 0,
  biggestHit: 0,
  nat20s: 0,
  nat1s: 0,
  damageTaken: 0,
  downs: 0,
  treasure: 0,
  mvps: 0,
  flawlessWins: 0,
  heroes: [],
  villains: [],
})

function addGame(record, game, player) {
  const s = player.stats
  const won = game.outcome === 'won'
  return {
    ...record,
    name: player.name,
    games: record.games + 1,
    wins: record.wins + (won ? 1 : 0),
    losses: record.losses + (won ? 0 : 1),
    kills: record.kills + (s.kills ?? 0),
    damageDealt: record.damageDealt + (s.damageDealt ?? 0),
    biggestHit: Math.max(record.biggestHit, s.biggestHit ?? 0),
    nat20s: record.nat20s + (s.nat20s ?? 0),
    nat1s: record.nat1s + (s.nat1s ?? 0),
    damageTaken: record.damageTaken + (s.damageTaken ?? 0),
    downs: record.downs + (s.downs ?? 0),
    treasure: record.treasure + (s.treasure ?? 0),
    mvps: record.mvps + (player.mvp ? 1 : 0),
    flawlessWins: record.flawlessWins + (won && !s.downs ? 1 : 0),
    heroes: [...new Set([...record.heroes, ...player.heroes])],
    // Only a won game's villains count as beaten.
    villains: won ? [...new Set([...record.villains, ...game.villains])] : record.villains,
  }
}

// Every player's records from the finished games (oldest first), most games first. Each
// earned title says which game earned it (`newIn`), so the recap can call out a new one.
export function playerRecords(games) {
  const players = new Map()
  for (const game of games) {
    for (const player of game.players ?? []) {
      const key = playerKey(player.name)
      const before = players.get(key) ?? { record: emptyRecord(player.name), newIn: {} }
      const record = addGame(before.record, game, player)
      const newIn = { ...before.newIn }
      for (const t of TITLES) if (!newIn[t.key] && t.earned(record)) newIn[t.key] = game.key
      players.set(key, { record, newIn })
    }
  }
  return [...players.values()]
    .map(({ record, newIn }) => ({
      ...record,
      titles: TITLES.filter((t) => newIn[t.key]).map(({ key, emoji, title, how }) => ({ key, emoji, title, how, newIn: newIn[key] })),
    }))
    .sort((a, b) => b.games - a.games || b.wins - a.wins || a.name.localeCompare(b.name))
}

// A player's records by name, or null for someone who hasn't finished a game yet.
export const findPlayer = (records, name) => (counted(name) ? records?.find((r) => playerKey(r.name) === playerKey(name)) ?? null : null)

// The Pi's file of finished games: { games: { [key]: entry with endedAt } }. `syncRecord`
// returns the changed file after an action, or null when nothing changed: a game that
// ended is written in (again, if Undo took it back and it ended differently), and one
// Undo took back to playing is taken out.
export function syncRecord(file, state, now = Date.now()) {
  const played = syncPlayed(file, state, now)
  const next = syncGame(played ?? file, state, now)
  return next ?? played
}

function syncGame(file, state, now) {
  const key = recordKey(state)
  if (!key) return null
  const games = file.games ?? {}
  const entry = gameRecord(state)
  if (!entry) {
    if (state.status !== 'playing' || !games[key]) return null
    const { [key]: _, ...rest } = games
    return { ...file, games: rest }
  }
  const old = games[key]
  if (old && JSON.stringify({ ...old, endedAt: undefined }) === JSON.stringify({ ...entry, endedAt: undefined })) return null
  return { ...file, games: { ...games, [key]: { ...entry, endedAt: old?.endedAt ?? now } } }
}

export const recordGames = (file) => Object.values(file?.games ?? {}).sort((a, b) => a.endedAt - b.endedAt)

// Which heroes each player has taken into the dungeon, so the hero coach knows who's new
// to a hero: { played: { [player key]: { [hero key]: when first played } } }. Counted from
// the moment a game is under way, finished or not, and never taken back.
function syncPlayed(file, state, now) {
  if (state.status !== 'playing') return null
  const played = file.played ?? {}
  let changed = false
  const next = { ...played }
  for (const hero of state.heroes ?? []) {
    if (!counted(hero.player) || !hero.key) continue
    const key = playerKey(hero.player)
    if (next[key]?.[hero.key]) continue
    next[key] = { ...next[key], [hero.key]: now }
    changed = true
  }
  return changed ? { ...file, played: next } : null
}

// The heroes a player has played, by hero key, from /records.json's `played`.
export const heroesPlayed = (played, name) => (counted(name) ? Object.keys(played?.[playerKey(name)] ?? {}) : [])
