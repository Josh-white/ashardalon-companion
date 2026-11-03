// The 🛠️ Hero Builder's parts. Each slot holds one part; each part is built from simple
// shapes (src/forge/figure.js kit) hung on the skeleton's joints, and has its own shape
// sliders (1 is its normal shape). Adding a part is adding an entry to its slot's file in
// src/forge/parts/: saved recipes only name the part's id, so old figures keep working.
//
// A part is { id, name, emoji, shape: [slider…], frame?(s, f), build(k, s, f) }:
//   s      the part's slider values, by key
//   f      the skeleton's measurements (figure.js BASE_FRAME), which `frame` may change
//   k      the shape kit: k.box / ball / cone / tube / ring / flat / limb / group (opts.opacity
//          makes a shape see-through)
// Joints: hips, body (waist up), head (neck up), arm.L/R (shoulder down), hand.L/R,
// leg.L/R (hip down to the ground), tail, grip.L/R (a held thing points along +Y),
// back (between the shoulder blades), hat (top of the head), fx (the floor under the
// figure). Front is +Z, the figure's left is +X.

// Each slot's parts live in their own file in src/forge/parts/; this file puts them together.

import { BODIES } from './parts/bodies.js'
import { HEADS } from './parts/heads.js'
import { HATS } from './parts/hats.js'
import { ARMS } from './parts/arms.js'
import { LEGS } from './parts/legs.js'
import { WEAPONS } from './parts/weapons.js'
import { OFF_HAND } from './parts/offHand.js'
import { BACKS } from './parts/backs.js'
import { TAILS } from './parts/tails.js'
import { FACES } from './parts/faces.js'
import { EFFECTS } from './parts/magic.js'

// ── Slots ─────────────────────────────────────────────────────────────────────────────

export const SLOTS = [
  { key: 'body', label: 'Body', emoji: '👕' },
  { key: 'legs', label: 'Legs', emoji: '👖' },
  { key: 'arms', label: 'Arms', emoji: '💪' },
  { key: 'head', label: 'Head', emoji: '🙂' },
  { key: 'hat', label: 'Hat & hair', emoji: '🎩', optional: true, nudge: true },
  { key: 'face', label: 'Face', emoji: '🧔', optional: true, nudge: true },
  { key: 'hand', label: 'Weapon', emoji: '⚔️', optional: true },
  { key: 'offhand', label: 'Other hand', emoji: '🛡️', optional: true },
  { key: 'back', label: 'Back', emoji: '🦇', optional: true, nudge: true },
  { key: 'tail', label: 'Tail', emoji: '🦎', optional: true, nudge: true },
  { key: 'fx', label: 'Magic', emoji: '✨', optional: true },
]

export const PARTS = {
  body: BODIES,
  legs: LEGS,
  arms: ARMS,
  head: HEADS,
  hat: HATS,
  face: FACES,
  hand: WEAPONS,
  offhand: OFF_HAND,
  back: BACKS,
  tail: TAILS,
  fx: EFFECTS,
}

// A part's slider values: saved ones kept in range, the rest at their normal setting.
export function shapeOf(part, saved = {}) {
  return Object.fromEntries(
    (part.shape ?? []).map(({ key, value, min, max }) => {
      const v = saved?.[key]
      return [key, typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : value]
    }),
  )
}

export function findPart(slot, id) {
  return PARTS[slot]?.find((p) => p.id === id) ?? null
}
