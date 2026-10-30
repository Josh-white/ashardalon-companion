import { TITLES } from '../data/titles.js'
import { templateFor } from '../data/heroes.js'
import { findPlayer } from '../state/records.js'
import { useRecords } from '../state/useRecords.js'
import { Button } from './ui.jsx'

// A player's best title (the first one they've earned in data/titles.js), as a small
// badge beside their name. Nothing for a player who hasn't finished a game yet.
export function PlayerTitle({ records, name, className = '' }) {
  const title = findPlayer(records, name)?.titles[0]
  if (!title) return null
  return (
    <span className={`inline-block rounded-full border border-amber-700/60 bg-amber-950/60 px-[0.6em] py-[0.1em] text-amber-200 ${className}`}>
      {title.emoji} {title.title}
    </span>
  )
}

const heroName = (key) => templateFor(key)?.name ?? key

// The Hall of Records: every player's titles (earned ones lit, the rest showing how to
// earn them) and their totals across every game they've finished.
export function HallOfRecords({ onClose }) {
  const records = useRecords()
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
      <div className="flex items-center gap-3">
        <h1 className="mr-auto font-display text-4xl font-bold text-amber-400">🏆 Hall of Records</h1>
        <Button variant="ghost" onClick={onClose}>
          Back
        </Button>
      </div>
      {!records && <p className="text-zinc-400">Looking for records…</p>}
      {records?.length === 0 && (
        <p className="text-zinc-400">No records yet. Finish a game (win or lose) and every player with a name gets their first title.</p>
      )}
      {records?.map((record) => (
        <PlayerRecord key={record.name} record={record} />
      ))}
    </div>
  )
}

function PlayerRecord({ record }) {
  const earned = new Set(record.titles.map((t) => t.key))
  const best = record.titles[0]
  const numbers = [
    ['Games', record.games],
    ['Wins', record.wins],
    ['Monsters defeated', record.kills],
    ['Damage dealt', record.damageDealt],
    ['Biggest hit', record.biggestHit],
    ['Natural 20s', record.nat20s],
    ['Treasure found', record.treasure],
    ['MVP', record.mvps],
    ['Knocked down', record.downs],
    ['Natural 1s', record.nat1s],
  ]
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="font-display text-3xl font-bold text-zinc-100">
        {record.name}
        {best && (
          <span className="ml-3 align-middle text-xl text-amber-300">
            {best.emoji} {best.title}
          </span>
        )}
      </h2>
      {record.heroes.length > 0 && <p className="text-sm text-zinc-400">Played {record.heroes.map(heroName).join(', ')}</p>}
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-5">
        {numbers.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs uppercase tracking-widest text-zinc-500">{label}</dt>
            <dd className="text-2xl font-bold text-zinc-100">{value}</dd>
          </div>
        ))}
      </dl>
      <h3 className="mt-4 text-xs uppercase tracking-widest text-zinc-500">
        Titles · {earned.size} of {TITLES.length}
      </h3>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {TITLES.map((t) => (
          <li
            key={t.key}
            className={`flex items-center gap-2 rounded-xl px-3 py-2 ${earned.has(t.key) ? 'border border-amber-700/60 bg-amber-950/40' : 'border border-dashed border-zinc-800 opacity-60'}`}
          >
            <span className={`text-2xl ${earned.has(t.key) ? '' : 'grayscale'}`}>{earned.has(t.key) ? t.emoji : '🔒'}</span>
            <span>
              <span className={`block font-bold ${earned.has(t.key) ? 'text-amber-200' : 'text-zinc-400'}`}>{t.title}</span>
              <span className="block text-sm text-zinc-400">{t.how}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
