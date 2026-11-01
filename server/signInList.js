// Who may sign in at the friends' address, kept in Cloudflare Access (server/access.js
// checks each sign-in). With a Cloudflare API token on the Pi, the #friends page can add
// and remove friends' emails here instead of in the Zero Trust dashboard, and dress up the
// sign-in page.
//
//   CF_API_TOKEN    an API token with Access: Apps and Policies (Edit) and, for the sign-in
//                   page, Access: Organizations, Identity Providers, and Groups (Edit)
//   CF_ACCOUNT_ID   the Cloudflare account it belongs to
//   CF_ACCESS_AUD   the game's Access application (shared with server/access.js)
//
// Not set: the list says so, and the dashboard is the way, as before.
import { cleanEmail } from './access.js'

const API = 'https://api.cloudflare.com/client/v4'

// What the sign-in page looks like: the game's colors, its dragon, and a line on what to do.
export const SIGN_IN_LOOK = {
  background_color: '#0c0a09',
  text_color: '#fbbf24',
  // The repo is public, so the page can load the app's icon from GitHub without signing in.
  logo_path: 'https://raw.githubusercontent.com/Josh-white/ashardalon-companion/main/public/apple-touch-icon.png',
  header_text: 'Wrath of Ashardalon: type your email and we will send you a code',
  footer_text: "Not on the list? Ask JJ to add your email. The code email can land in spam.",
}

// Fields Cloudflare fills in itself; everything else in a policy is sent back as it was.
const POLICY_READ_ONLY = ['id', 'uid', 'created_at', 'updated_at', 'app_count', 'reusable', 'app_id']
// The organization's own settings, sent back unchanged when the sign-in page's look changes.
const ORG_SETTINGS = ['name', 'auth_domain', 'session_duration', 'auto_redirect_to_identity', 'allow_authenticate_via_warp', 'warp_auth_session_duration', 'user_seat_expiration_inactive_time', 'is_ui_read_only', 'ui_read_only_toggle_reason']
const pick = (object, keys) => Object.fromEntries(keys.filter((key) => key in object).map((key) => [key, object[key]]))
// Leaves out settings that are blank (empty text, nothing, or an empty list).
const filled = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== '' && value != null && !(Array.isArray(value) && value.length === 0)))

const without = (object, keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)))

// The emails a policy lets in one by one ({ email: { email } } rules). Other rules (a whole
// domain, a group) are kept as they are and not shown.
export const policyEmails = (policy) => (policy?.include ?? []).map((rule) => cleanEmail(rule?.email?.email)).filter(Boolean)

export function createSignInList({
  token = process.env.CF_API_TOKEN,
  account = process.env.CF_ACCOUNT_ID,
  aud = process.env.CF_ACCESS_AUD,
  owners = process.env.OWNER_EMAILS,
  fetchImpl = (...args) => fetch(...args),
} = {}) {
  const apiToken = String(token ?? '').trim()
  const accountId = String(account ?? '').trim()
  const audience = String(aud ?? '').trim()
  const ownerList = new Set(String(owners ?? '').split(/[\s,]+/).map(cleanEmail).filter(Boolean))
  const ready = Boolean(apiToken && accountId && audience)
  const missing = [!apiToken && 'CF_API_TOKEN', !accountId && 'CF_ACCOUNT_ID', !audience && 'CF_ACCESS_AUD'].filter(Boolean)

  async function call(method, path, body) {
    const res = await fetchImpl(`${API}/accounts/${accountId}${path}`, {
      method,
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    let data = null
    try {
      data = await res.json()
    } catch {
      // Not JSON: handled below.
    }
    if (!res.ok || !data?.success) {
      const why = data?.errors?.map((e) => e.message).filter(Boolean).join('; ') || `HTTP ${res.status}`
      throw new Error(`Cloudflare said: ${why}`)
    }
    return data.result
  }

  // The game's Access application, and its Allow policy (the one with the emails).
  async function findPolicy() {
    const apps = await call('GET', '/access/apps')
    const app = (apps ?? []).find((a) => a.aud === audience)
    if (!app) throw new Error("Couldn't find the game's Access application (no app with that AUD tag).")
    const policies = app.policies?.length ? app.policies : await call('GET', `/access/apps/${app.id}/policies`)
    const allow = (policies ?? []).filter((p) => p.decision === 'allow')
    // With several, the one that already lists emails.
    const policy = allow.find((p) => policyEmails(p).length > 0) ?? allow[0]
    if (!policy) throw new Error('The Access application has no Allow policy to add emails to.')
    // A reusable policy (what the dashboard makes now) lives on its own; an older one,
    // under its app. The app's list can leave fields out, so read the policy itself.
    const shared = `/access/policies/${policy.id}`
    const own = `/access/apps/${app.id}/policies/${policy.id}`
    if (policy.reusable !== false) {
      try {
        const found = await call('GET', shared)
        if (found?.reusable !== false) return { path: shared, policy: found }
      } catch {
        // Not a reusable policy: it lives under its app.
      }
    }
    return { path: own, policy: await call('GET', own) }
  }

  async function change(update) {
    const { path, policy } = await findPolicy()
    const include = update(policy.include ?? [])
    const saved = await call('PUT', path, { ...without(policy, POLICY_READ_ONLY), include })
    return policyEmails(saved ?? { include })
  }

  return {
    ready,
    missing,
    owners: [...ownerList],
    async emails() {
      return policyEmails((await findPolicy()).policy)
    },
    async add(email) {
      const clean = cleanEmail(email)
      if (!clean) throw new Error("That doesn't look like an email address.")
      return change((include) => (policyEmails({ include }).includes(clean) ? include : [...include, { email: { email: clean } }]))
    },
    async remove(email) {
      const clean = cleanEmail(email)
      if (!clean) throw new Error("That doesn't look like an email address.")
      // Taking the family's own email off would lock them out of the friends' address.
      if (ownerList.has(clean)) throw new Error("That's a family email (OWNER_EMAILS), so it stays on the list.")
      return change((include) => include.filter((rule) => cleanEmail(rule?.email?.email) !== clean))
    },
    // Puts the game's look on the Cloudflare sign-in page (the team's login page).
    async dressSignInPage(look = SIGN_IN_LOOK) {
      const org = await call('GET', '/access/organizations')
      const login_design = { ...filled(org.login_design ?? {}), ...look }
      // Sending the organization back as it came is refused (invalid_org_config) when some
      // of its settings are blank, so send only the ones that are set. If Cloudflare still
      // refuses, send just the name, the sign-in address and the look.
      try {
        const saved = await call('PUT', '/access/organizations', { ...filled(pick(org, ORG_SETTINGS)), login_design })
        return saved?.login_design ?? look
      } catch (error) {
        if (!/invalid_org_config/.test(error.message)) throw error
        const saved = await call('PUT', '/access/organizations', { name: org.name, auth_domain: org.auth_domain, login_design })
        return saved?.login_design ?? look
      }
    },
  }
}
