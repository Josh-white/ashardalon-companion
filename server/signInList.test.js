import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { startServer } from './server.js'
import { createSignInList, SIGN_IN_LOOK } from './signInList.js'

// Stands in for the Cloudflare API: one Access app, its reusable Allow policy, the organization.
function fakeCloudflare({ reusable = true } = {}) {
  const calls = []
  const policy = {
    id: 'pol-1',
    name: 'Friends',
    decision: 'allow',
    reusable,
    created_at: 'then',
    include: [{ email: { email: 'jj@example.com' } }, { email: { email: 'amy@example.com' } }, { email_domain: { domain: 'school.org' } }],
    exclude: [],
    require: [],
    session_duration: '730h',
  }
  let org = { name: 'hidden-violet', auth_domain: 'hidden-violet.cloudflareaccess.com', created_at: 'then', login_design: { footer_text: 'old' } }
  const ok = (result) => ({ ok: true, status: 200, json: async () => ({ success: true, result }) })
  const fetchImpl = async (url, { method, headers, body }) => {
    const path = url.replace('https://api.cloudflare.com/client/v4/accounts/acct', '')
    calls.push({ method, path, auth: headers.Authorization, body: body && JSON.parse(body) })
    if (method === 'GET' && path === '/access/apps') return ok([{ id: 'app-other', aud: 'nope', policies: [] }, { id: 'app-1', aud: 'aud-1', policies: [{ id: 'pol-1', decision: 'allow', reusable }] }])
    const policyPath = reusable ? '/access/policies/pol-1' : '/access/apps/app-1/policies/pol-1'
    if (path === policyPath && method === 'GET') return ok(policy)
    if (path === policyPath && method === 'PUT') {
      Object.assign(policy, JSON.parse(body))
      return ok(policy)
    }
    if (path === '/access/organizations' && method === 'GET') return ok(org)
    if (path === '/access/organizations' && method === 'PUT') {
      org = { ...org, ...JSON.parse(body) }
      return ok(org)
    }
    return { ok: false, status: 404, json: async () => ({ success: false, errors: [{ message: 'not found' }] }) }
  }
  return { fetchImpl, calls, policy, org: () => org }
}

const listWith = (cf, extra = {}) => createSignInList({ token: 'tok', account: 'acct', aud: 'aud-1', owners: 'jj@example.com', fetchImpl: cf.fetchImpl, ...extra })

describe("the Cloudflare sign-in list", () => {
  it('is off until the token, account and app are set', () => {
    const list = createSignInList({ token: '', account: 'acct', aud: '', fetchImpl: () => Promise.reject(new Error('no')) })
    expect(list.ready).toBe(false)
    expect(list.missing).toEqual(['CF_API_TOKEN', 'CF_ACCESS_AUD'])
  })

  it("reads the emails on the game's Allow policy", async () => {
    const cf = fakeCloudflare()
    expect(await listWith(cf).emails()).toEqual(['jj@example.com', 'amy@example.com'])
    expect(cf.calls[0].auth).toBe('Bearer tok')
  })

  it('adds and removes a friend, keeping the other rules as they were', async () => {
    const cf = fakeCloudflare()
    const list = listWith(cf)
    expect(await list.add(' Bob@Example.com ')).toEqual(['jj@example.com', 'amy@example.com', 'bob@example.com'])
    // Adding someone already there changes nothing.
    expect(await list.add('bob@example.com')).toEqual(['jj@example.com', 'amy@example.com', 'bob@example.com'])
    expect(await list.remove('amy@example.com')).toEqual(['jj@example.com', 'bob@example.com'])
    expect(cf.policy.include).toContainEqual({ email_domain: { domain: 'school.org' } })
    const put = cf.calls.find((c) => c.method === 'PUT')
    expect(put.body).not.toHaveProperty('id')
    expect(put.body).not.toHaveProperty('created_at')
    expect(put.body).toMatchObject({ name: 'Friends', decision: 'allow', session_duration: '730h' })
  })

  it("won't take a family email off, or add something that isn't an email", async () => {
    const list = listWith(fakeCloudflare())
    await expect(list.remove('jj@example.com')).rejects.toThrow(/family/)
    await expect(list.add('not an email')).rejects.toThrow(/email/)
  })

  it('works with an older policy kept under its app', async () => {
    const cf = fakeCloudflare({ reusable: false })
    expect(await listWith(cf).add('bob@example.com')).toContain('bob@example.com')
    expect(cf.calls.some((c) => c.method === 'PUT' && c.path === '/access/apps/app-1/policies/pol-1')).toBe(true)
  })

  it("says so when it can't find the game's app", async () => {
    await expect(listWith(fakeCloudflare(), { aud: 'missing' }).emails()).rejects.toThrow(/Access application/)
  })

  it("gives the sign-in page the game's look, keeping the rest of the organization", async () => {
    const cf = fakeCloudflare()
    await listWith(cf).dressSignInPage()
    expect(cf.org().login_design).toMatchObject(SIGN_IN_LOOK)
    expect(cf.org().auth_domain).toBe('hidden-violet.cloudflareaccess.com')
    expect(cf.calls.find((c) => c.method === 'PUT').body).not.toHaveProperty('created_at')
  })

  it('leaves blank organization settings out, and falls back to just the look if Cloudflare still refuses', async () => {
    const cf = fakeCloudflare()
    cf.org().user_seat_expiration_inactive_time = ''
    cf.org().warp_auth_session_duration = null
    cf.org().session_duration = '24h'
    let refusals = 1
    const fetchImpl = async (url, options) => {
      if (options.method === 'PUT' && url.endsWith('/organizations') && refusals-- > 0) {
        cf.calls.push({ method: 'PUT', path: '/access/organizations', body: JSON.parse(options.body) })
        return { ok: false, status: 400, json: async () => ({ success: false, errors: [{ message: 'access.api.error.invalid_org_config' }] }) }
      }
      return cf.fetchImpl(url, options)
    }
    const look = await listWith(cf, { fetchImpl }).dressSignInPage()
    expect(look).toMatchObject(SIGN_IN_LOOK)
    const [first, second] = cf.calls.filter((c) => c.method === 'PUT')
    expect(first.body).toMatchObject({ name: 'hidden-violet', session_duration: '24h' })
    expect(first.body).not.toHaveProperty('user_seat_expiration_inactive_time')
    expect(first.body).not.toHaveProperty('warp_auth_session_duration')
    expect(Object.keys(second.body).sort()).toEqual(['auth_domain', 'login_design', 'name'])
  })
})

describe('the sign-in list on the Pi', () => {
  let dir
  let server
  afterEach(async () => {
    await server?.close()
    rmSync(dir, { recursive: true, force: true })
  })
  const fakeAccess = {
    async who(req) {
      const email = req.headers['x-test-email']
      return email ? { family: false, email } : { family: true, email: null }
    },
  }
  const start = async (signInList) => {
    dir = mkdtempSync(join(tmpdir(), 'ashardalon-signin-'))
    server = await startServer({ port: 0, saveFile: join(dir, 'game.json'), staticDir: dir, access: fakeAccess, signInList, warmNarrator: false })
    return `http://localhost:${server.port}`
  }

  it('lets the family add a friend, and keeps friends out of it', async () => {
    const url = await start(listWith(fakeCloudflare()))
    expect(await (await fetch(`${url}/sign-in-list.json`)).json()).toMatchObject({ ready: true, emails: ['jj@example.com', 'amy@example.com'], owners: ['jj@example.com'] })
    const added = await fetch(`${url}/sign-in-list`, { method: 'POST', body: JSON.stringify({ email: 'bob@example.com' }) })
    expect((await added.json()).emails).toContain('bob@example.com')
    for (const path of ['/sign-in-list.json', '/sign-in-page']) {
      const res = await fetch(`${url}${path}`, { method: path.endsWith('.json') ? 'GET' : 'POST', headers: { 'x-test-email': 'amy@example.com' } })
      expect(res.status).toBe(403)
    }
    const refused = await fetch(`${url}/sign-in-list`, { method: 'DELETE', body: JSON.stringify({ email: 'jj@example.com' }) })
    expect(refused.status).toBe(502)
    expect((await refused.json()).problem).toMatch(/family/)
  })

  it('says what is missing when there is no token', async () => {
    const url = await start(createSignInList({ token: '', account: '', aud: 'aud-1' }))
    expect(await (await fetch(`${url}/sign-in-list.json`)).json()).toMatchObject({ ready: false, missing: ['CF_API_TOKEN', 'CF_ACCOUNT_ID'] })
  })
})
