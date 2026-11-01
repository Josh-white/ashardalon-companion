import { useEffect, useSyncExternalStore } from 'react'

// The monsters picked in this screen's attack box (HeroAttack), so the board on the same
// screen can light them up and bring them into view. It stays on this screen only: nothing
// is sent to the Pi or the other screens.
let aimed = []
const listeners = new Set()

export function setAimed(ids) {
  aimed = ids
  for (const l of listeners) l()
}

const subscribe = (l) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useAimed() {
  return useSyncExternalStore(subscribe, () => aimed, () => aimed)
}

// For the attack box: share its picks while it's open, and clear them when it closes.
export function useShareAim(ids) {
  useEffect(() => {
    setAimed(ids)
  }, [ids])
  useEffect(() => () => setAimed([]), [])
}
