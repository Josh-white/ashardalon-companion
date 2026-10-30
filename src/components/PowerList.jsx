import { useState } from 'react'
import { cardStats } from '../data/cards.js'
import { effectsOf, pendingDodge } from '../data/powerEffects.js'
import { attackGone, powerNumber, powerUsesAttack } from '../state/game.js'
import { rollD20 } from '../state/random.js'
import { useCards } from '../state/useCards.js'
import { HeroChoice } from './Pickers.jsx'
import { Button } from './ui.jsx'

export function PowerTile({ power, onToggle, selected = false }) {
  const [open, setOpen] = useState(false)
  const card = power.card
  const usable = power.type !== 'at-will'
  return (
    <div
      role={usable ? 'button' : undefined}
      onClick={usable ? onToggle : undefined}
      className={`select-none rounded-lg border px-3 py-2 text-left text-sm transition ${usable ? 'cursor-pointer' : ''} ${
        power.used ? 'border-zinc-800 bg-zinc-900 text-zinc-600' : 'border-amber-600/60 bg-zinc-950/60 text-zinc-100'
      } ${selected ? 'ring-2 ring-amber-400' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs uppercase tracking-wide text-amber-500/80">
          {power.type}
          {power.used && ' · used'}
        </span>
        {card?.text && (
          <button
            type="button"
            className="-my-2 -mr-2 min-h-9 rounded-lg px-3 py-2 text-xs text-zinc-400 hover:bg-zinc-800"
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
      {!power.used && effectsOf(power).use && <div className="mt-1 text-xs text-amber-400">Tap to use</div>}
      {open && <p className="mt-2 whitespace-pre-line text-zinc-300">{card.text}</p>}
    </div>
  )
}

// Using a power from its tile: asks who it's for when the power needs to know, then the
// app does the healing, tokens or condition. Powers without a `use` just flip over.
function UsePanel({ state, hero, power, dispatch, onClose }) {
  const use = effectsOf(power).use
  const [chosen, setChosen] = useState([])
  const [condition, setCondition] = useState(null)
  const others = state.heroes.filter((h) => h.id !== hero.id)
  const choices = use.endCondition ? others.filter((h) => h.conditions.length > 0) : use.pick === 'any' ? state.heroes : others
  const picked = state.heroes.find((h) => h.id === chosen[0])
  const pickOne = (id) => {
    setChosen([id])
    setCondition(null)
  }
  const toggle = (id) => setChosen((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))
  const ready = use.endCondition ? Boolean(condition) : !use.pick || use.optional || chosen.length > 0

  const apply = () => {
    dispatch({ type: 'USE_POWER', heroId: hero.id, powerId: power.id, heroIds: chosen, condition })
    onClose()
  }
  const summary = [
    use.healSelf && `${hero.name} gets ${use.healSelf} HP.`,
    use.tokens?.mirrorImage && `${hero.name} gets 3 mirror images: +2 AC each until monsters miss.`,
    use.invisible && `Monsters won't count ${hero.name} as the closest hero until ${hero.name}'s next turn.`,
    use.note,
  ].filter(Boolean)
  // A Daily or At-Will power is the hero's attack this turn.
  const usesAttack = powerUsesAttack(state, hero, power)
  const gone = usesAttack && attackGone(state, hero)

  return (
    <div className="col-span-2 space-y-3 rounded-xl border-2 border-amber-500 bg-zinc-950/80 p-3">
      <p className="font-display text-lg font-bold text-amber-300">Use {power.name}</p>
      {summary.map((line) => (
        <p key={line} className="text-zinc-200">
          {line}
        </p>
      ))}
      {usesAttack && (
        <p className={gone ? 'rounded-lg bg-red-950/70 p-2 text-red-200' : 'text-zinc-400'}>
          {gone ? `⚠️ ${gone} Use it anyway only if a card says you can.` : `⚔️ This is ${hero.name}'s attack this turn.`}
        </p>
      )}
      {use.causeFear && (
        <>
          <p className="text-zinc-200">Tap each ally on that tile who is next to a monster. Each gets an at-will attack at +2.</p>
          <HeroChoice heroes={others} chosen={chosen} onToggle={toggle} />
        </>
      )}
      {use.pick && (
        <>
          <p className="text-zinc-200">{use.prompt ?? 'Which hero?'}{use.endCondition && ' Only heroes with a condition are shown.'}</p>
          {choices.length === 0 ? (
            <p className="text-zinc-400">Nobody has a condition to end.</p>
          ) : (
            <HeroChoice heroes={choices} chosen={chosen} onToggle={pickOne} />
          )}
        </>
      )}
      {use.endCondition && picked && (
        <div className="flex flex-wrap gap-2">
          {picked.conditions.map((c) => (
            <Button key={c} variant={condition === c ? 'gold' : 'default'} onClick={() => setCondition(c)}>
              End {c}
            </Button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Button variant="gold" className="flex-1" disabled={!ready} onClick={apply}>
          {use.optional && chosen.length === 0 ? `Use it (nobody else on my tile)` : `Use ${power.name}`}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
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
export default function PowerList({ state, hero, dispatch, tilesHidden = false }) {
  const cards = useCards()
  const [usingId, setUsingId] = useState(null)
  const using = hero.powers.find((p) => p.id === usingId && !p.used)
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
            selected={power.id === using?.id}
            onToggle={() => {
              // Tumbling Escape or Practiced Evasion right after a hit undoes that hit.
              const dodge = state && pendingDodge(state, hero, power)
              if (dodge) return dispatch({ ...dodge, disableRoll: rollD20() })
              // A power the app can do opens its panel; the rest just flip over (or back).
              if (state && !power.used && effectsOf(power).use) return setUsingId(power.id === usingId ? null : power.id)
              dispatch({ type: 'TOGGLE_POWER', heroId: hero.id, powerId: power.id })
            }}
          />
        ),
      )}
      {using && state && (
        <UsePanel key={using.id} state={state} hero={hero} power={using} dispatch={dispatch} onClose={() => setUsingId(null)} />
      )}
    </div>
  )
}
