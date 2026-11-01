// A floating green "+N" over a hero's token on the virtual board whenever the hero gains
// HP (a power, a potion, a healing surge, the + button...), like the red "-N" an attack
// shows. The reducer notes who healed and by how much, once, so every screen shows the
// same thing; HealFx.jsx draws it.
import { newId } from '../state/gameHelpers.js'

// What the board shows for this action, or null: [{ heroId, amount }].
export function healsFor(before, after) {
  if (!after?.board || before?.status !== 'playing' || after.status !== 'playing') return []
  return after.heroes.flatMap((h) => {
    const was = before.heroes.find((b) => b.id === h.id)
    const amount = was ? h.hp - was.hp : 0
    return amount > 0 && after.board.tokens?.[h.id] ? [{ heroId: h.id, amount }] : []
  })
}

// The reducer's last step: a heal on the virtual board gets its floating number. A heal
// that comes with a new moment (a roll, a level up) waits for that moment's screen.
export function withHealFx(before, after) {
  if (after === before) return after
  const heals = healsFor(before, after)
  if (heals.length === 0) return after
  const fresh = after.moment && after.moment.id !== before.moment?.id
  return { ...after, healFx: { id: newId('heal'), at: Date.now(), heals, ...(fresh ? { momentId: after.moment.id } : {}) } }
}
