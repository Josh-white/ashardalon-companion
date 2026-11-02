import { useState } from 'react'
import { cardStats } from '../data/cards.js'
import { effectsOf, pendingDodge, wolfBlocked } from '../data/powerEffects.js'
import { attackGone, powerNumber, powerUsesAttack } from '../state/game.js'
import { usesLeft } from '../state/heroAttacks.js'
import { rollD20 } from '../state/random.js'
import { useCards } from '../state/useCards.js'
import { HeroChoice, InReach, MonsterChoice } from './Pickers.jsx'
import { fanUseBlocked, foesInReach, nearestOtherFoe, newestMonster, resolveUse, trapsOnTile } from '../state/fanPowers.js'
import { heroesInReach } from '../board/encounters.js'
import { Button } from './ui.jsx'

// compact: two short lines (name, then type · attack · damage) for the narrow column beside the board.
export function PowerTile({ power, onToggle, selected = false, compact = false }) {
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
        {compact ? (
          <span className={`min-w-0 font-semibold ${power.used ? 'line-through' : ''}`}>{power.name}</span>
        ) : (
          <span className="min-w-0 truncate text-xs uppercase tracking-wide whitespace-nowrap text-amber-500/80">
            {power.type}
            {power.used && ' · used'}
          </span>
        )}
        {card?.text && (
          <button
            type="button"
            className="-my-2 -mr-2 h-9 w-9 shrink-0 rounded-lg text-base text-zinc-400 hover:bg-zinc-800"
            aria-label={open ? 'Hide the card text' : 'Read the card'}
            aria-expanded={open}
            onClick={(e) => {
              e.stopPropagation()
              setOpen((o) => !o)
            }}
          >
            {open ? '▴' : 'ⓘ'}
          </button>
        )}
      </div>
      {compact ? (
        <div className="text-xs text-zinc-400">
          <span className="text-amber-500/80">{power.type[0].toUpperCase() + power.type.slice(1)}</span>
          {power.used && ' · used'}
          {card?.attack && ` · ${card.attack}`}
          {card?.damage && ` · ${card.damage} dmg`}
        </div>
      ) : (
        <div className={`font-semibold ${power.used ? 'line-through' : ''}`}>{power.name}</div>
      )}
      {!compact && (card?.attack || card?.damage) && (
        <div className="text-xs text-zinc-400">
          {card.attack && `Attack ${card.attack}`}
          {card.attack && card.damage && ' · '}
          {card.damage && `Damage ${card.damage}`}
        </div>
      )}
      {!power.used && effectsOf(power).use && (
        <div className="mt-1 text-xs text-amber-400">Tap to use{effectsOf(power).uses > 1 ? ` (${usesLeft(power)} of ${effectsOf(power).uses} left)` : ''}</div>
      )}
      {open && <p className="mt-2 whitespace-pre-line text-zinc-300">{card.text}</p>}
    </div>
  )
}

// Using a power from its tile: asks who it's for when the power needs to know, then the
// app does the healing, tokens or condition. Powers without a `use` just flip over.
function UsePanel({ state, hero, power, dispatch, onClose }) {
  const base = effectsOf(power).use
  // Nature's Gifts: pick one of the card's options first.
  const [option, setOption] = useState(Array.isArray(base.choose) ? null : 0)
  const use = resolveUse(base, option) ?? {}
  const [chosen, setChosen] = useState([])
  const [condition, setCondition] = useState(null)
  const [monsterId, setMonsterId] = useState(null)
  const [trapIds, setTrapIds] = useState([])
  const others = state.heroes.filter((h) => h.id !== hero.id)
  const pool = use.pick === 'any' ? state.heroes : others
  const choices = use.endCondition ? pool.filter((h) => h.conditions.length > 0) : pool
  const picked = state.heroes.find((h) => h.id === chosen[0])
  const pickOne = (id) => {
    if (use.count) {
      setChosen((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id].slice(-use.count)))
      return
    }
    setChosen([id])
    setCondition(null)
  }
  const toggle = (id) => setChosen((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))
  // One for the Team: there has to be another hero's encounter card to take.
  const encounter = state.encounter
  const takeable = Boolean(encounter && !encounter.attacked && encounter.heroId !== hero.id)
  const blocked = option === null ? null : fanUseBlocked(state, hero, use)
  const hurtable = use.hurt ? foesInReach(state, hero, use.hurtReach) : []
  const traps = use.moveTraps || use.removeTrap ? trapsOnTile(state, hero) : []
  const charmed = use.charm ? newestMonster(state) : null
  const ready =
    option !== null &&
    !blocked &&
    (use.endCondition ? Boolean(condition) : !use.pick || use.optional || chosen.length > 0) &&
    (!use.takeEncounter || takeable) &&
    (!use.hurt || Boolean(monsterId)) &&
    (!use.moveTraps || trapIds.length > 0)
  const apply = () => {
    const extra = {}
    if (option !== null && Array.isArray(base.choose)) extra.option = option
    if (use.hurt) extra.monsterIds = [monsterId]
    if (use.moveTraps || use.removeTrap) extra.trapIds = trapIds.length ? trapIds : traps.slice(0, 1).map((t) => t.id)
    if (charmed) {
      const target = nearestOtherFoe(state, charmed.id)
      Object.assign(extra, { monsterIds: [charmed.id], targetId: target?.id ?? null, roll: rollD20() })
    }
    dispatch({ type: 'USE_POWER', heroId: hero.id, powerId: power.id, heroIds: chosen, condition, ...extra })
    onClose()
  }
  const summary = [
    use.healSelf && `${hero.name} gets ${use.healSelf} HP.`,
    use.tokens?.mirrorImage && `${hero.name} gets 3 mirror images: +2 AC each until monsters miss.`,
    use.invisible && `Monsters won't count ${hero.name} as the closest hero until ${hero.name}'s next turn.`,
    use.note,
    use.takeEncounter &&
      (takeable
        ? `${hero.name} takes ${encounter.card.name} from ${state.heroes.find((h) => h.id === encounter.heroId)?.name ?? 'the hero who drew it'}.`
        : 'Use it when another hero draws an encounter card, before it is done.'),
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
      {Array.isArray(base.choose) && (
        <div className="grid gap-2">
          {base.choose.map((o, i) => (
            <Button key={o.label ?? i} variant={option === i ? 'gold' : 'default'} onClick={() => { setOption(i); setChosen([]); setCondition(null) }}>
              {o.label ?? `Option ${i + 1}`}
            </Button>
          ))}
        </div>
      )}
      {blocked && <p className="rounded-lg bg-red-950/70 p-2 text-red-200">{blocked}</p>}
      {charmed && !blocked && (
        <p className="text-zinc-200">
          The new monster is the {charmed.name}.{' '}
          {(charmed.card?.types ?? []).some((t) => (use.charm.types ?? []).map((x) => x.toLowerCase()).includes(t.toLowerCase()))
            ? `It's a creature or beast: it attacks the ${nearestOtherFoe(state, charmed.id)?.name ?? 'nearest monster'} and skips this Villain Phase.`
            : "It isn't a creature or beast, so it's discarded."}
        </p>
      )}
      {use.hurt && !blocked && (
        <>
          <p className="text-zinc-200">Which monster takes {use.hurt} damage?</p>
          {hurtable.length === 0 ? (
            <p className="text-zinc-400">No monster is next to {hero.name}.</p>
          ) : (
            <MonsterChoice state={state} monsters={[...state.monsters, ...(state.villains ?? [])].filter((m) => hurtable.includes(m.id))} chosen={monsterId ? [monsterId] : []} onToggle={(id) => setMonsterId(id)} />
          )}
        </>
      )}
      {traps.length > 0 && !blocked && (
        <>
          <p className="text-zinc-200">{use.moveTraps ? `Which traps? (up to ${use.moveTraps})` : 'Which trap?'}</p>
          <div className="flex flex-wrap gap-2">
            {traps.map((t) => (
              <Button
                key={t.id}
                variant={trapIds.includes(t.id) ? 'gold' : 'default'}
                onClick={() => setTrapIds((list) => (list.includes(t.id) ? list.filter((x) => x !== t.id) : use.moveTraps ? [...list, t.id].slice(-use.moveTraps) : [t.id]))}
              >
                {t.name}
              </Button>
            ))}
          </div>
        </>
      )}
      {use.causeFear && (
        <>
          <p className="text-zinc-200">Tap each ally on that tile who is next to a monster. Each gets an at-will attack at +2.</p>
          <HeroChoice heroes={others} chosen={chosen} onToggle={toggle} />
        </>
      )}
      {use.pick && (
        <>
          <p className="text-zinc-200">{use.prompt ?? (use.count ? `Which heroes? (up to ${use.count})` : 'Which hero?')}{use.endCondition && ' Only heroes with a condition are shown.'}</p>
          {choices.length === 0 ? (
            <p className="text-zinc-400">Nobody has a condition to end.</p>
          ) : (
            <InReach items={choices} near={heroesInReach(state, hero.id, use.reach)}>
              {(shown) => <HeroChoice heroes={shown} chosen={chosen} onToggle={pickOne} />}
            </InReach>
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
export default function PowerList({ state, hero, dispatch, tilesHidden = false, compact = false }) {
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
            compact={compact}
            selected={power.id === using?.id}
            onToggle={() => {
              // Tumbling Escape or Practiced Evasion right after a hit undoes that hit.
              const dodge = state && pendingDodge(state, hero, power)
              if (dodge) return dispatch({ ...dodge, disableRoll: rollD20() })
              // Wolf Form: only the wolf's powers while Aldred is the wolf, and those only then.
              if (state && !power.used && wolfBlocked(hero, power)) return
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
