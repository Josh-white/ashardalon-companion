import { useMe } from '../state/useMe.js'

// The #admin page: one place to find the hidden pages, opened from the 🛠 Admin link at
// the bottom of the "Which game?" screen. Every # page in main.jsx must be listed here
// (AdminPage.test.jsx checks), so a new one can't be forgotten.
export const ADMIN_PAGES = [
  { hash: '#ideas', title: '💡 Ideas box', about: 'Ideas the boys sent from the 💡 button. Mark them done or delete them.' },
  { hash: '#friends', title: '👋 Friends', about: 'Who is on the sign-in list, and how much each friend plays.' },
  { hash: '#cards', title: '🃏 Card check', about: "Problems in cards.json and cards the app can't find by name. Look after changing cards." },
  { hash: '#tiles', title: '🧱 Tile check', about: 'Every dungeon tile drawn the way the virtual board draws it, to check against the real tiles.' },
  { hash: '#audition', title: '🔊 Sound audition', about: 'Listen to each made sound and pick the take the game plays.' },
  { hash: '#screens', title: '🖥 All screens', about: 'The big screen, iPads and a phone side by side, for testing turns.' },
  { href: '/?intro', title: '🐉 Replay the intro', about: 'Plays the opening intro again on this screen.' },
]

export default function AdminPage() {
  const me = useMe()
  return (
    <main className="min-h-screen bg-zinc-950 p-4 text-zinc-100">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="mr-auto font-display text-3xl text-amber-400">🛠 Admin</h1>
          <a href="/" className="text-sm text-amber-300 underline">
            Back to the game
          </a>
        </div>
        {me.friend ? (
          <p className="mt-6 text-lg text-zinc-400">These pages are only for the family.</p>
        ) : (
          <>
            <p className="mt-1 text-zinc-400">The hidden pages. Bookmark this one to get back here.</p>
            <ul className="mt-6 space-y-3">
              {ADMIN_PAGES.map((p) => (
                <li key={p.hash ?? p.href}>
                  <a href={p.href ?? `/${p.hash}`} className="block rounded-2xl bg-zinc-900 p-4 ring-1 ring-zinc-800 hover:ring-amber-500">
                    <span className="block text-xl font-semibold text-amber-300">{p.title}</span>
                    <span className="block text-zinc-400">{p.about}</span>
                    {p.hash && <span className="block text-xs text-zinc-600">{p.hash}</span>}
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </main>
  )
}
