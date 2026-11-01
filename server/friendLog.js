// How much each friend plays, for the #friends page: when they first and last came, how
// many visits (a visit is any time after 30 minutes away), the games they started and
// finished, and how many taps they made. Kept in friends.json next to the saved games,
// so the nightly backup picks it up. Nothing leaves the Pi.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export const VISIT_GAP_MS = 30 * 60 * 1000
const SAVE_DELAY_MS = 2000

export function createFriendLog(file, now = () => Date.now()) {
  let friends = {}
  try {
    if (existsSync(file)) friends = JSON.parse(readFileSync(file, 'utf8')).friends ?? {}
  } catch (error) {
    console.error('Could not read the friends log:', error.message)
  }
  let timer = null
  const save = () => {
    timer = null
    try {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(`${file}.tmp`, JSON.stringify({ friends }, null, 1))
      renameSync(`${file}.tmp`, file)
    } catch (error) {
      console.error('Could not save the friends log:', error.message)
    }
  }
  // Many taps in a row are saved once.
  const later = () => {
    timer ??= setTimeout(save, SAVE_DELAY_MS)
    timer.unref?.()
  }
  const touch = (email) => {
    const t = now()
    const old = friends[email]
    const visit = !old || t - old.lastSeen > VISIT_GAP_MS
    friends[email] = old
      ? { ...old, lastSeen: t, visits: old.visits + (visit ? 1 : 0) }
      : { firstSeen: t, lastSeen: t, visits: 1, gamesStarted: 0, gamesFinished: 0, wins: 0, taps: 0 }
    if (visit) save()
    else later()
    return friends[email]
  }
  const add = (email, changes) => {
    const entry = touch(email)
    friends[email] = { ...entry, ...Object.fromEntries(Object.entries(changes).map(([k, n]) => [k, (entry[k] ?? 0) + n])) }
    later()
  }
  return {
    // A friend's screen asked for something.
    seen: (email) => email && touch(email),
    tapped: (email) => email && add(email, { taps: 1 }),
    started: (email) => email && add(email, { gamesStarted: 1 }),
    // A game they played in was won or lost.
    finished: (email, won) => email && add(email, { gamesFinished: 1, wins: won ? 1 : 0 }),
    // Everyone, most recently seen first.
    list: () => Object.entries(friends).map(([email, f]) => ({ email, ...f })).sort((a, b) => b.lastSeen - a.lastSeen),
    flush: () => {
      if (timer) {
        clearTimeout(timer)
        save()
      }
    },
  }
}
