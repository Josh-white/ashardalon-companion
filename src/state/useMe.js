import { useEffect, useState } from 'react'

// Who this screen is, from the Pi's /me.json: { friend: true, email } for a friend signed
// in through Cloudflare (server/access.js), { friend: false } for the family. Family until
// the Pi answers, so nothing at home changes while it loads.
let known = null
export function useMe() {
  const [me, setMe] = useState(known ?? { friend: false, email: null })
  useEffect(() => {
    if (known) return
    let active = true
    fetch('/me.json', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => {
        known = { friend: Boolean(data.friend), email: typeof data.email === 'string' ? data.email : null }
        if (active) setMe(known)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])
  return me
}
