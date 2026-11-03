// What the Pi sends a screen after each tap: only the parts of the game that changed, not the
// whole game again. A big game is ~135 KB (every card left in the encounter and treasure
// decks, 200 lines of log), and each tap used to send all of it to every screen; most taps
// change the turn, a hero and a few lines of log.
//
// The game rules never change a part of the game in place (they make a new one), so a part
// that's the same object as before is unchanged. The log only grows at the front (newest
// first, the oldest falling off the end), so just its new lines are sent.

// { changes: { key: value }, removed: [key], logAdd: [line], logLen } from game `prev` to `next`.
export function makePatch(prev, next) {
  const changes = {}
  const removed = []
  let logAdd = null
  let logLen = null
  for (const key of Object.keys(next)) {
    if (next[key] === prev[key]) continue
    if (key === 'log') {
      const added = newLines(prev.log, next.log)
      if (added) {
        logAdd = added
        logLen = next.log.length
        continue
      }
    }
    changes[key] = next[key]
  }
  for (const key of Object.keys(prev)) if (!(key in next)) removed.push(key)
  return { changes, ...(removed.length ? { removed } : {}), ...(logAdd ? { logAdd, logLen } : {}) }
}

// The lines at the front of `next` that `prev` didn't have, when the rest of `next` is the
// start of `prev`; otherwise null (the whole log is sent).
function newLines(prev, next) {
  if (!Array.isArray(prev) || !Array.isArray(next)) return null
  const added = prev.length === 0 ? next.length : next.indexOf(prev[0])
  if (added < 0) return null
  for (let i = added; i < next.length; i++) if (next[i] !== prev[i - added]) return null
  return next.slice(0, added)
}

// The game `prev` with `patch` (from makePatch) applied. Every part that didn't change stays
// the very same object, so the screens' drawings of it don't have to be redone.
export function applyPatch(prev, patch) {
  const next = { ...prev, ...patch.changes }
  for (const key of patch.removed ?? []) delete next[key]
  if (patch.logAdd) next.log = [...patch.logAdd, ...(prev.log ?? [])].slice(0, patch.logLen)
  return next
}
