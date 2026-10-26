import { useState } from 'react'
import { cardStats } from '../data/cards.js'
import { useCards } from '../state/useCards.js'
import { Button } from './ui.jsx'

function PowerTile({ power, onToggle }) {
  const [open, setOpen] = useState(false)
  const card = power.card
  const usable = power.type !== 'at-will'
  return (
    <div
      role={usable ? 'button' : undefined}
      onClick={usable ? onToggle : undefined}
      className={`select-none rounded-lg border px-3 py-2 text-left text-sm transition ${usable ? 'cursor-pointer' : ''} ${
        power.used ? 'border-zinc-800 bg-zinc-900 text-zinc-600' : 'border-amber-600/60 bg-zinc-950/60 text-zinc-100'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs uppercase tracking-wide text-amber-500/80">
          {power.type}
          {power.used && ' · used'}
        </span>
        {card?.text && (
          <button
            type="button"
            className="-my-1 rounded px-2 text-xs text-zinc-400 hover:bg-zinc-800"
            onClick={(e) => {
              e.stopPropagation()
              setOpen((o) => !o)
            }}
          >
            {open ? 'Hide' : 'Read'}
          </button>
        )}
      </div>
      <div className={`font-semibold ${power.used ? 'line-through' : ''}`}>{power.name}</div>
      {(card?.attack || card?.damage) && (
        <div className="text-xs text-zinc-400">
          {card.attack && `Attack ${card.attack}`}
          {card.attack && card.damage && ' · '}
          {card.damage && `Damage ${card.damage}`}
        </div>
      )}
      {open && <p className="mt-2 whitespace-pre-line text-zinc-300">{card.text}</p>}
    </div>
  )
}

function PowerPicker({ hero, power, options, dispatch }) {
  if (options.length === 0) {
    return (
      <input
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-zinc-100"
        value={power.name}
        onChange={(e) => dispatch({ type: 'RENAME_POWER', heroId: hero.id, powerId: power.id, name: e.target.value })}
      />
    )
  }
  return (
    <select
      className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-zinc-100"
      value={power.card?.id ?? ''}
      onChange={(e) =>
        dispatch({
          type: 'SET_POWER_CARD',
          heroId: hero.id,
          powerId: power.id,
          card: options.find((c) => c.id === e.target.value) ?? null,
        })
      }
    >
      <option value="">Pick {power.type === 'at-will' ? 'an' : 'a'} {power.type} power…</option>
      {options.map((card) => (
        <option key={card.id} value={card.id}>
          {card.name}
          {cardStats(card) && ` (${cardStats(card)})`}
        </option>
      ))}
    </select>
  )
}

export default function PowerList({ hero, dispatch }) {
  const [choosing, setChoosing] = useState(false)
  const cards = useCards()
  const optionsFor = (type) => cards.powers.filter((c) => c.hero === hero.key && c.type === type)

  if (choosing) {
    return (
      <div className="mt-4 space-y-2 rounded-xl bg-zinc-950/60 p-3">
        {hero.powers.map((power) => (
          <label key={power.id} className="block text-xs uppercase tracking-wide text-amber-500/80">
            {power.type}
            <PowerPicker hero={hero} power={power} options={optionsFor(power.type)} dispatch={dispatch} />
          </label>
        ))}
        {cards.source === 'example' && (
          <p className="text-xs text-zinc-500">These are placeholder cards. Add your own in cards/cards.json on the Pi.</p>
        )}
        {cards.problems.length > 0 && (
          <ul className="list-disc pl-5 text-xs text-amber-400">
            {cards.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="gold" className="text-sm" onClick={() => setChoosing(false)}>
            Done
          </Button>
          <Button
            variant="ghost"
            className="text-sm"
            onClick={() => dispatch({ type: 'ADD_POWER', heroId: hero.id, powerType: 'daily', name: 'Daily power' })}
          >
            + Daily power
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-4">
      <div className="grid grid-cols-2 gap-2">
        {hero.powers.map((power) => (
          <PowerTile
            key={power.id}
            power={power}
            onToggle={() => dispatch({ type: 'TOGGLE_POWER', heroId: hero.id, powerId: power.id })}
          />
        ))}
      </div>
      <Button variant="ghost" className="mt-2 text-sm" onClick={() => setChoosing(true)}>
        Choose powers
      </Button>
    </div>
  )
}
