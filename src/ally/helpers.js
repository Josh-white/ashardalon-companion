// Small helpers the computer hero's files share (src/ally/), so each one means the same
// thing everywhere.

import { key } from '../board/grid.js'

// A d20, for tests and anywhere no roll is handed in (the driver hands in the real dice).
export const d20 = () => Math.floor(Math.random() * 20) + 1

// A square back from its 'x,y' key.
export const parse = (k) => k.split(',').map(Number)

// Which area (tile, or chamber) a square is in.
export const areaAt = (grid, sq) => (sq ? grid.get(key(sq))?.area : undefined)

export const heroById = (state, id) => state.heroes.find((h) => h.id === id)

// How many HP a hero is missing.
export const missingHp = (h) => h.maxHp - h.hp

// Standing, but at half HP or less: the computer heroes' line for "hurt".
export const badlyHurt = (h) => h.hp > 0 && h.hp <= Math.ceil(h.maxHp / 2)
