// Brings a saved game from an older version of the app up to date, so an update
// never throws away a game or a campaign in progress.
import { initialState, SAVE_VERSION } from './game.js'

// One step per version: MIGRATIONS[n] turns a version n save into a version n + 1
// save. When a change needs the saved game to look different, bump SAVE_VERSION in
// game.js and add the step here, with a test in saves.test.js. A field that's simply
// new doesn't need a step: fields missing from an old save get their starting value.
export const MIGRATIONS = {}

// The saved game, upgraded to SAVE_VERSION, or null when it can't be used: not a
// game, saved by a newer version of the app, or a step is missing.
export function migrateSave(saved, migrations = MIGRATIONS, version = SAVE_VERSION) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return null
  if (!Number.isInteger(saved.version) || saved.version < 1 || saved.version > version) return null
  let state = saved
  for (let v = saved.version; v < version; v++) {
    if (typeof migrations[v] !== 'function') return null
    state = { ...migrations[v](state), version: v + 1 }
  }
  return { ...initialState, ...state, version }
}
