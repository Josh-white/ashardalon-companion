import { useState } from 'react'
import { cardStats } from '../data/cards.js'
import { powerNumber } from '../state/game.js'
import { useCards } from '../state/useCards.js'

export function PowerTile({ power, onToggle }) {
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

// Powers are chosen in the lobby before the heroes enter the dungeon. The one pick made
// during a game is the extra daily from leveling up, so only an empty slot gets a picker.
function PowerPicker({ hero, power, options, dispatch }) {
  return (
    <label className="block rounded-lg border border-amber-500 bg-zinc-950/60 px-3 py-2 text-xs uppercase tracking-wide text-amber-400">
      New {power.type} power
      <select
        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm normal-case tracking-normal text-zinc-100"
        value=""
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
    </label>
  )
}

// tilesHidden: the turn guide's attack box is already showing this hero's attack
// powers, so only the others (utilities, used dailies) and empty slots show here.
export default function PowerList({ hero, dispatch, tilesHidden = false }) {
  const cards = useCards()
  // A card picked in another slot isn't offered again.
  const optionsFor = (power) =>
    cards.powers.filter(
      (c) => c.hero === hero.key && c.type === power.type && !hero.powers.some((p) => p.card?.id === c.id),
    )
  const needsPick = (power) => !power.card && optionsFor(power).length > 0
  const inAttackBox = (power) => !power.used && powerNumber(power.card?.attack) !== null
  const shown = hero.powers.filter((power) => !tilesHidden || needsPick(power) || !inAttackBox(power))
  if (shown.length === 0) return null

  return (
    <div className="mt-4 grid grid-cols-2 gap-2">
      {shown.map((power) =>
        needsPick(power) ? (
          <PowerPicker key={power.id} hero={hero} power={power} options={optionsFor(power)} dispatch={dispatch} />
        ) : (
          <PowerTile
            key={power.id}
            power={power}
            onToggle={() => dispatch({ type: 'TOGGLE_POWER', heroId: hero.id, powerId: power.id })}
          />
        ),
      )}
    </div>
  )
}
