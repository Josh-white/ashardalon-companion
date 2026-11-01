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
