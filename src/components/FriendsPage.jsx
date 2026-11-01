import { useEffect, useState } from 'react'

// The #friends page: is anyone actually playing? Each friend who signed in through
// Cloudflare (server/access.js), with their visits, games and taps (server/friendLog.js).
const when = (time) => (time ? new Date(time).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—')

const STATUS = { setup: 'choosing heroes', playing: 'playing', won: 'won', lost: 'lost' }

export default function FriendsPage() {
  const [friends, setFriends] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    fetch('/friends.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => setFriends(data.friends ?? []))
      .catch(() => setError('Could not load the friends list.'))
  }, [])
  const total = (key) => friends?.reduce((n, f) => n + (f[key] ?? 0), 0) ?? 0
  return (
    <main className="min-h-screen bg-zinc-950 p-4 text-zinc-100">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="mr-auto font-display text-3xl text-amber-400">Friends playing</h1>
          <a href="/" className="text-sm text-amber-300 underline">
            Back to the game
          </a>
        </div>
        <SignInList />
        <h2 className="mt-8 font-display text-2xl text-amber-300">How they play</h2>
        {error && <p className="mt-3 text-red-300">{error}</p>}
        {friends === null ? (
          !error && <p className="mt-6 text-zinc-400">Loading…</p>
        ) : friends.length === 0 ? (
          <p className="mt-6 text-lg text-zinc-400">No friends have signed in yet.</p>
        ) : (
          <>
            <p className="mt-3 text-zinc-400">
              {friends.length} {friends.length === 1 ? 'friend has' : 'friends have'} come by · {total('gamesStarted')} games started · {total('gamesFinished')} finished ({total('wins')} won)
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-zinc-400">
                  <tr>
                    <th className="py-2 pr-3">Friend</th>
                    <th className="py-2 pr-3">Last seen</th>
                    <th className="py-2 pr-3">First seen</th>
                    <th className="py-2 pr-3 text-right">Visits</th>
                    <th className="py-2 pr-3 text-right">Games started</th>
                    <th className="py-2 pr-3 text-right">Finished (won)</th>
                    <th className="py-2 text-right">Taps</th>
                  </tr>
                </thead>
                <tbody>
                  {friends.map((f) => (
                    <tr key={f.email} className="border-t border-zinc-800 align-top">
                      <td className="py-2 pr-3">
                        <span className="text-zinc-100">{f.email}</span>
                        {f.games?.length > 0 && (
                          <ul className="mt-1 text-xs text-zinc-500">
                            {f.games.map((g) => (
                              <li key={g.id}>
                                {g.name} · {STATUS[g.status] ?? g.status}
                                {!g.mine && ' · invited'}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="py-2 pr-3">{when(f.lastSeen)}</td>
                      <td className="py-2 pr-3">{when(f.firstSeen)}</td>
                      <td className="py-2 pr-3 text-right">{f.visits}</td>
                      <td className="py-2 pr-3 text-right">{f.gamesStarted}</td>
                      <td className="py-2 pr-3 text-right">
                        {f.gamesFinished} ({f.wins})
                      </td>
                      <td className="py-2 text-right">{f.taps}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  )
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Who may sign in at the friends' address: the emails on the Cloudflare Access list
// (server/signInList.js), with a way to add and remove them and to dress up the sign-in page.
export function SignInList() {
  const [list, setList] = useState(null)
  const [problem, setProblem] = useState(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [dressed, setDressed] = useState(false)
  const load = () =>
    fetch('/sign-in-list.json', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        setList(data)
        setProblem(data.problem ?? null)
      })
      .catch(() => setProblem("Couldn't reach the Pi."))
  useEffect(() => {
    load()
  }, [])
  const send = async (method, path, body) => {
    setBusy(true)
    setProblem(null)
    try {
      const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.problem ?? `HTTP ${res.status}`)
      return data
    } catch (e) {
      setProblem(e.message)
      return null
    } finally {
      setBusy(false)
    }
  }
  const change = async (method, address) => {
    const data = await send(method, '/sign-in-list', { email: address })
    if (data) setList(data)
    return data
  }
  const add = async (event) => {
    event.preventDefault()
    if (await change('POST', email.trim())) setEmail('')
  }
  const remove = (address) => window.confirm(`Take ${address} off the sign-in list? They won't be able to sign in any more.`) && change('DELETE', address)
  const dress = async () => {
    if (await send('POST', '/sign-in-page')) setDressed(true)
  }

  return (
    <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="font-display text-2xl text-amber-300">Who can sign in</h2>
      {list === null ? (
        <p className="mt-2 text-zinc-400">{problem ?? 'Asking Cloudflare…'}</p>
      ) : !list.ready ? (
        <p className="mt-2 text-zinc-400">
          To add friends from here, put a Cloudflare API token on the Pi ({list.missing?.join(', ')} in the game's .env; see the README). Until then, add them in the
          Cloudflare Zero Trust dashboard.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-zinc-400">Friends on this list can sign in at the friends' address with a code sent to their email. Invite them to a game from "Which game?".</p>
          {list.emails.length === 0 ? (
            <p className="mt-3 text-zinc-400">Nobody is on the list yet.</p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2">
              {list.emails.map((e) => {
                const family = list.owners?.includes(e)
                return (
                  <li key={e} className="flex items-center gap-1 rounded-full bg-zinc-800 py-1 pl-3 pr-1 text-zinc-200">
                    {e}
                    {family ? (
                      <span className="px-2 text-xs text-amber-400">family</span>
                    ) : (
                      <button type="button" aria-label={`Take ${e} off the list`} disabled={busy} className="rounded-full px-2 text-zinc-400 hover:text-red-400" onClick={() => remove(e)}>
                        ×
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          <form className="mt-3 flex flex-wrap gap-2" onSubmit={add}>
            <input
              type="email"
              aria-label="Friend's email"
              placeholder="friend@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
            />
            <button type="submit" disabled={busy || !EMAIL.test(email.trim())} className="rounded-xl bg-amber-500 px-4 py-2 font-semibold text-zinc-950 disabled:opacity-40">
              Add friend
            </button>
          </form>
          <p className="mt-4 text-sm text-zinc-400">
            <button type="button" disabled={busy} className="text-amber-300 underline" onClick={dress}>
              Give the sign-in page the game's look
            </button>{' '}
            {dressed ? '✓ Done. Friends see the dragon and the game\'s colors when they sign in.' : '(dark colors, the dragon icon, and a line on what to do)'}
          </p>
        </>
      )}
      {problem && list !== null && <p className="mt-2 text-red-300">{problem}</p>}
    </section>
  )
}
