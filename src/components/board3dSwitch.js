import { useSyncExternalStore } from 'react'

// Whether this screen shows the virtual board in 3D (🧊), saved in this browser like 🔥.
// Shared by every board on the screen, so the switch on the board and the screen around it
// agree. A device that turns out too slow (or can't draw 3D at all) switches itself back.

const KEY = 'ashardalon-board3d'
const listeners = new Set()

function read() {
  try {
    return localStorage.getItem(KEY) === 'on'
  } catch {
    return false
  }
}
let on = read()
// Why this screen last went back to the flat board by itself ('slow' or 'no-3d'), shown once.
let note = null

export function setBoard3D(next, why = null) {
  on = next
  note = why
  try {
    localStorage.setItem(KEY, next ? 'on' : 'off')
  } catch {
    // Private mode: the switch lasts until the page reloads.
  }
  for (const l of listeners) l()
}

const subscribe = (l) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useBoard3D() {
  const value = useSyncExternalStore(subscribe, () => on, () => on)
  return [value, () => setBoard3D(!value)]
}

export function useBoard3DNote() {
  const value = useSyncExternalStore(subscribe, () => note, () => note)
  return [
    value,
    () => {
      note = null
      for (const l of listeners) l()
    },
  ]
}

// Tests start each case from the saved setting.
export function reloadBoard3D() {
  on = read()
  note = null
  for (const l of listeners) l()
}
