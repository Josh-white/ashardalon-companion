import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { cleanEmail, createAccess, teamDomain } from './access.js'

const TEAM = 'codebasehome'
const AUD = 'aud-tag-123'
const HOST = 'play.codebasehome.com'
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'key-1', alg: 'RS256' }
const NOW = 1_800_000_000_000

const b64 = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url')
function token(claims = {}, { kid = 'key-1', key = privateKey } = {}) {
  const head = b64({ alg: 'RS256', kid, typ: 'JWT' })
  const body = b64({ aud: [AUD], iss: `https://${TEAM}.cloudflareaccess.com`, email: 'Friend@Example.com', exp: NOW / 1000 + 600, iat: NOW / 1000, ...claims })
  return `${head}.${body}.${sign('RSA-SHA256', Buffer.from(`${head}.${body}`), key).toString('base64url')}`
}

const make = (options = {}) => {
  let fetches = 0
  const access = createAccess({
    host: HOST,
    team: TEAM,
    aud: AUD,
    owners: 'jj@example.com',
    now: () => NOW,
    fetchKeys: async (domain) => {
      fetches++
      expect(domain).toBe('codebasehome.cloudflareaccess.com')
      return { keys: [jwk] }
    },
    ...options,
  })
  return { access, fetches: () => fetches }
}
const req = (host, jwt) => ({ headers: { host, ...(jwt ? { 'cf-access-jwt-assertion': jwt } : {}) } })

describe('who is asking', () => {
  it('treats everything as family when no friends address is set', async () => {
    const access = createAccess({ host: '' })
    expect(await access.who(req(HOST, token()))).toMatchObject({ family: true })
  })

  it('treats the home address as family, with or without a note', async () => {
    const { access } = make()
    expect(await access.who(req('ashardalon.codebasehome.com'))).toMatchObject({ family: true })
    expect(await access.who(req('192.168.86.49:8081', 'junk'))).toMatchObject({ family: true })
  })

  it('reads the email from a good note at the friends address', async () => {
    const { access, fetches } = make()
    expect(await access.who(req(HOST, token()))).toEqual({ family: false, email: 'friend@example.com' })
    expect(await access.who(req(`${HOST}:443`, token()))).toEqual({ family: false, email: 'friend@example.com' })
    expect(fetches()).toBe(1) // the keys are kept
  })

  it('lets JJ in as family through the friends address', async () => {
    const { access } = make()
    expect(await access.who(req(HOST, token({ email: 'JJ@example.com' })))).toEqual({ family: true, email: 'jj@example.com' })
  })

  it('turns away a missing, forged, expired or wrong-app note at the friends address', async () => {
    const { access } = make()
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
    expect(await access.who(req(HOST))).toBeNull()
    expect(await access.who(req(HOST, 'not.a.token'))).toBeNull()
    expect(await access.who(req(HOST, token({}, { key: other })))).toBeNull()
    expect(await access.who(req(HOST, token({ exp: NOW / 1000 - 1 })))).toBeNull()
    expect(await access.who(req(HOST, token({ aud: ['someone-else'] })))).toBeNull()
    expect(await access.who(req(HOST, token({ iss: 'https://evil.cloudflareaccess.com' })))).toBeNull()
    expect(await access.who(req(HOST, token({ email: 'not an email' })))).toBeNull()
    expect(await access.who(req(HOST, token({}, { kid: 'unknown' })))).toBeNull()
    // A note whose body was changed after signing.
    const [h, , s] = token().split('.')
    expect(await access.who(req(HOST, `${h}.${b64({ aud: [AUD], iss: `https://${TEAM}.cloudflareaccess.com`, email: 'jj@example.com', exp: NOW / 1000 + 600 })}.${s}`))).toBeNull()
  })

  it('lets nobody in at the friends address when the team or tag is missing', async () => {
    const { access } = make({ aud: '' })
    expect(await access.who(req(HOST, token()))).toBeNull()
  })

  it('tidies emails and team names', () => {
    expect(cleanEmail(' A@B.co ')).toBe('a@b.co')
    expect(cleanEmail('nope')).toBeNull()
    expect(teamDomain('codebasehome')).toBe('codebasehome.cloudflareaccess.com')
    expect(teamDomain('https://codebasehome.cloudflareaccess.com/')).toBe('codebasehome.cloudflareaccess.com')
  })
})
