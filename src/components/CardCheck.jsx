import { missingCards } from '../data/cardCheck.js'
import { useCards } from '../state/useCards.js'

// The #cards page: anything in cards.json the app couldn't use, and the cards the app
// looks for by name or id but can't find, so a spelling difference doesn't quietly
// turn off a card's automation.
export default function CardCheck() {
  const cards = useCards()
  const missing = missingCards(cards)
  const loading = cards.source === 'loading'
  return (
    <main className="min-h-screen bg-zinc-950 p-4 text-zinc-100">
      <h1 className="font-display text-3xl text-amber-400">Card check</h1>
      <p className="mt-1 max-w-2xl text-zinc-400">
        {cards.source === 'custom'
          ? 'Checking cards.json on the Pi.'
          : cards.source === 'example'
            ? 'No cards.json on the Pi yet, so the game uses the example cards.'
            : loading
              ? 'Loading the cards…'
              : 'Could not load the cards.'}
      </p>
      {!loading && (
        <>
          <Section title="Cards the app couldn't read" items={cards.problems} />
          <Section title="Cards the app looks for but can't find" items={missing} />
          {cards.problems.length === 0 && missing.length === 0 && (
            <p className="mt-6 text-lg text-emerald-300">✓ Everything checks out.</p>
          )}
        </>
      )}
    </main>
  )
}

function Section({ title, items }) {
  if (items.length === 0) return null
  return (
    <section className="mt-6">
      <h2 className="text-xl font-semibold text-red-300">
        {title} ({items.length})
      </h2>
      <ul className="mt-2 list-disc pl-6 text-zinc-200">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  )
}
