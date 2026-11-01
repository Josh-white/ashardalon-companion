// Who is asking. Friends play from outside the house through a Cloudflare Tunnel at
// FRIENDS_HOST (play.codebasehome.com). Cloudflare Access signs them in with a code
// sent to their email, and only emails on JJ's list get through. Every request it lets
// in carries a signed note (the Cf-Access-Jwt-Assertion header) naming that email;
// the Pi checks the signature against the team's public keys before believing it.
//
// Anything that doesn't come in at FRIENDS_HOST is the family (iPads at home or on
// Tailscale), exactly as before. A request at FRIENDS_HOST without a good note is
// turned away, so switching off Access by mistake never lets a stranger in as family.
//
//   FRIENDS_HOST       play.codebasehome.com (not set: everyone is family)
//   CF_ACCESS_TEAM     the Zero Trust team name, e.g. codebasehome
//   CF_ACCESS_AUD      the Access application's Audience (AUD) tag
//   OWNER_EMAILS       emails treated as family even through the friends' address
import { createPublicKey, verify } from 'node:crypto'

export const FAMILY = Object.freeze({ family: true, email: null })

// Keys are fetched again at most this often when a note names a key we don't have.
const REFETCH_MS = 60 * 1000
// And at least this often, since Cloudflare rotates them.
const KEYS_MAX_AGE_MS = 6 * 60 * 60 * 1000

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const cleanEmail = (email) => {
  const e = typeof email === 'string' ? email.trim().toLowerCase().slice(0, 120) : ''
  return EMAIL.test(e) ? e : null
}

// "codebasehome" or "codebasehome.cloudflareaccess.com" -> the team's sign-in address.
export const teamDomain = (team) => {
  const t = String(team ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  if (!t) return null
  return t.includes('.') ? t : `${t}.cloudflareaccess.com`
}

const fromBase64Url = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

export function createAccess({
  host = process.env.FRIENDS_HOST,
  team = process.env.CF_ACCESS_TEAM,
  aud = process.env.CF_ACCESS_AUD,
  owners = process.env.OWNER_EMAILS,
  fetchKeys = (domain) => fetch(`https://${domain}/cdn-cgi/access/certs`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`certs ${r.status}`)))),
  now = () => Date.now(),
} = {}) {
  const friendsHost = String(host ?? '').trim().toLowerCase() || null
  const domain = teamDomain(team)
  const audience = String(aud ?? '').trim() || null
  const ownerList = new Set(String(owners ?? '').split(/[\s,]+/).map(cleanEmail).filter(Boolean))
  if (friendsHost && (!domain || !audience)) console.error('Friends: FRIENDS_HOST is set but CF_ACCESS_TEAM or CF_ACCESS_AUD is missing, so nobody can sign in there.')

  let keys = new Map()
  let fetchedAt = 0
  let fetching = null
  const loadKeys = () => {
    fetching ??= Promise.resolve()
      .then(() => fetchKeys(domain))
      .then((body) => {
        const next = new Map()
        for (const jwk of body?.keys ?? []) {
          try {
            if (jwk.kid) next.set(jwk.kid, createPublicKey({ key: jwk, format: 'jwk' }))
          } catch {
            // A key we can't read is skipped.
          }
        }
        keys = next
        fetchedAt = now()
      })
      .catch((error) => console.error('Friends: could not fetch the Cloudflare Access keys:', error.message))
      .finally(() => {
        fetching = null
      })
    return fetching
  }

  // The email in a signed note, or null when the note isn't good.
  async function emailFrom(token) {
    if (!domain || !audience || typeof token !== 'string') return null
    const parts = token.split('.')
    if (parts.length !== 3) return null
    let header, payload
    try {
      header = JSON.parse(fromBase64Url(parts[0]).toString('utf8'))
      payload = JSON.parse(fromBase64Url(parts[1]).toString('utf8'))
    } catch {
      return null
    }
    if (header?.alg !== 'RS256' || typeof header.kid !== 'string') return null
    const stale = now() - fetchedAt > KEYS_MAX_AGE_MS
    if (stale || (!keys.has(header.kid) && now() - fetchedAt > REFETCH_MS)) await loadKeys()
    const key = keys.get(header.kid)
    if (!key) return null
    const signed = verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, fromBase64Url(parts[2]))
    if (!signed) return null
    const seconds = now() / 1000
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
    if (!auds.includes(audience)) return null
    if (payload.iss !== `https://${domain}`) return null
    if (typeof payload.exp !== 'number' || payload.exp < seconds) return null
    if (typeof payload.nbf === 'number' && payload.nbf > seconds + 60) return null
    return cleanEmail(payload.email)
  }

  return {
    friendsHost,
    // FAMILY, { family: false, email } for a signed-in friend, or null when the
    // request came in at the friends' address without a good note.
    async who(req) {
      if (!friendsHost) return FAMILY
      const reqHost = String(req.headers.host ?? '').split(':')[0].trim().toLowerCase()
      if (reqHost !== friendsHost) return FAMILY
      const email = await emailFrom(req.headers['cf-access-jwt-assertion'])
      if (!email) return null
      if (ownerList.has(email)) return { family: true, email }
      return { family: false, email }
    },
  }
}
