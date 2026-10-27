import { heroArt } from '../data/art.js'
import { cardStats } from '../data/cards.js'
import { HERO_COLORS, HERO_TEMPLATES } from '../data/heroes.js'
import { powerSlotsFor } from '../state/game.js'
import { randomNumbers } from '../state/random.js'
import { useCards } from '../state/useCards.js'
import { AdventurePicker, ChosenAdventure } from './Adventure.jsx'
import Art from './Art.jsx'
import { Button } from './ui.jsx'

const templateFor = (key) => HERO_TEMPLATES.find((t) => t.key === key)

// Fills a new claim's slots with the cards the hero always has, then the
// rulebook's suggested picks. Players can swap any suggested card.
export function startingPicks(template, cards) {
  const slots = powerSlotsFor(template)
  const picks = slots.map(() => null)
  const mine = cards.filter((c) => c.hero === template.key)
  for (const card of [...mine.filter((c) => c.always), ...mine.filter((c) => c.suggested && !c.always)]) {
    const slot = slots.findIndex((type, i) => type === card.type && !picks[i])
    if (slot >= 0) picks[slot] = card
  }
  return picks
}

const hasName = (claim) => Boolean(claim.player?.trim())

const powersChosen = (claim, cards) =>
  powerSlotsFor(templateFor(claim.heroKey)).every(
    (type, i) => claim.picks[i] || !cards.some((c) => c.hero === claim.heroKey && c.type === type),
  )

// Starting picks for every hero, for a demo game.
export const demoPicks = (cards) => Object.fromEntries(HERO_TEMPLATES.map((t) => [t.key, startingPicks(t, cards)]))

// A claim can get ready once the player has typed a name and every slot that has
// cards to choose from has one picked.
export function claimReady(claim, cards) {
  return hasName(claim) && powersChosen(claim, cards)
}

function Stats({ template }) {
  const stats = [
    ['AC', template.ac],
    ['HP', template.maxHp],
    ['Speed', template.speed],
    ['Surge', `${template.surgeValue} HP`],
  ]
  return (
    <div className="mt-3 grid grid-cols-4 gap-2 text-center">
      {stats.map(([label, value]) => (
        <div key={label} className="rounded-lg bg-zinc-950/60 py-2">
          <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
          <div className="text-xl font-bold text-zinc-100">{value}</div>
        </div>
      ))}
    </div>
  )
}

function MyHero({ claim, cards, deviceId, dispatch }) {
  const template = templateFor(claim.heroKey)
  const color = HERO_COLORS[template.color]
  const slots = powerSlotsFor(template)
  const abilities = cards.abilities.filter((a) => a.hero === template.key && a.level === 1)
  const pickedIds = claim.picks.map((card) => card?.id)

  return (
    <section className={`rounded-2xl border border-zinc-800 p-4 ring-2 ${color.ring} ${color.bg}`}>
      <div className="flex items-start gap-3">
        <Art name={heroArt(template.key)} className="w-20" />
        <div className="mr-auto">
          <h2 className={`font-display text-3xl font-bold ${color.text}`}>{template.name}</h2>
          <p className="text-zinc-400">{template.className}</p>
        </div>
        <Button variant="ghost" className="text-sm" onClick={() => dispatch({ type: 'RELEASE_HERO', deviceId })}>
          Pick a different hero
        </Button>
      </div>

      <input
        className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
        placeholder="Your name (needed to get ready)"
        value={claim.player}
        onChange={(e) => dispatch({ type: 'SET_LOBBY_PLAYER', deviceId, player: e.target.value })}
      />

      <Stats template={template} />
      {abilities.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-zinc-300">
          {abilities.map((ability) => (
            <li key={ability.name}>
              <span className="font-semibold text-amber-300">{ability.name}:</span> {ability.text}
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-5 font-display text-xl font-bold text-zinc-200">Choose your powers</h3>
      <div className="mt-2 space-y-3">
        {slots.map((type, i) => {
          const picked = claim.picks[i]
          const options = cards.powers.filter(
            (c) => c.hero === template.key && c.type === type && (c.id === picked?.id || !pickedIds.includes(c.id)),
          )
          const fixed = options.find((c) => c.id === picked?.id)?.always
          return (
            <label key={i} className="block">
              <span className="text-xs uppercase tracking-wide text-amber-500/80">
                {type}
                {fixed && ' · always yours'}
              </span>
              {options.length === 0 ? (
                <p className="text-sm text-zinc-500">No {type} cards in the card file yet. You can name it during the game.</p>
              ) : (
                <select
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-zinc-100 disabled:opacity-70"
                  value={picked?.id ?? ''}
                  disabled={fixed}
                  onChange={(e) =>
                    dispatch({
                      type: 'SET_LOBBY_PICK',
                      deviceId,
                      slot: i,
                      card: options.find((c) => c.id === e.target.value) ?? null,
                    })
                  }
                >
                  <option value="">Pick {type === 'at-will' ? 'an' : 'a'} {type} power…</option>
                  {options
                    .filter((c) => !c.always || c.id === picked?.id)
                    .map((card) => (
                      <option key={card.id} value={card.id}>
                        {card.name}
                        {cardStats(card) && ` · ${cardStats(card)}`}
                        {card.suggested ? ' · suggested' : ''}
                      </option>
                    ))}
                </select>
              )}
              {cardStats(picked) && <p className="mt-1 text-sm font-semibold text-zinc-200">{cardStats(picked)}</p>}
              {picked?.text && <p className="mt-1 text-sm text-zinc-400">{picked.text}</p>}
            </label>
          )
        })}
      </div>

      <Button
        variant={claim.ready ? 'default' : 'gold'}
        className="mt-5 w-full py-3 text-lg"
        disabled={!claimReady(claim, cards.powers)}
        onClick={() => dispatch({ type: 'SET_LOBBY_READY', deviceId, ready: !claim.ready })}
      >
        {claim.ready
          ? '✓ Ready! (tap to change something)'
          : !hasName(claim)
            ? 'Type your name to get ready'
            : powersChosen(claim, cards.powers)
              ? "I'm ready"
              : 'Choose every power to get ready'}
      </Button>
    </section>
  )
}

export default function Setup({ state, dispatch, deviceId, onClaim, onDemo, watchOnly, onProjector, onLeaveProjector, onArt }) {
  const cards = useCards()
  const lobby = state.lobby ?? []
  const mine = lobby.find((c) => c.deviceId === deviceId)
  const ready = lobby.length > 0 && lobby.every((c) => c.ready)

  const claim = (template) => {
    dispatch({ type: 'CLAIM_HERO', deviceId, heroKey: template.key, picks: startingPicks(template, cards.powers) })
    onClaim(template.key)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
      <header className="text-center">
        <h1 className="font-display text-4xl font-bold text-amber-400 sm:text-5xl">Wrath of Ashardalon</h1>
        <p className="mt-2 text-lg text-zinc-400">
          {watchOnly ? 'Waiting for the heroes to get ready…' : mine ? 'Get your hero ready.' : 'Pick your hero on this iPad.'}
        </p>
      </header>

      {watchOnly ? <AdventurePicker state={state} dispatch={dispatch} /> : <ChosenAdventure state={state} />}

      {mine && !watchOnly && <MyHero claim={mine} cards={cards} deviceId={deviceId} dispatch={dispatch} />}

      <div className="grid gap-3 sm:grid-cols-2">
        {HERO_TEMPLATES.map((template) => {
          const owner = lobby.find((c) => c.heroKey === template.key)
          if (owner && owner === mine) return null
          const color = HERO_COLORS[template.color]
          const taken = Boolean(owner)
          const canPick = !watchOnly && !taken && !mine
          return (
            <button
              key={template.key}
              type="button"
              disabled={!canPick}
              onClick={() => claim(template)}
              className={`rounded-2xl border border-zinc-800 p-4 text-left transition ${
                taken ? color.bg : 'bg-zinc-900'
              } ${canPick ? 'active:scale-95' : 'cursor-default'} ${!taken && mine ? 'opacity-50' : ''}`}
            >
              <span className="flex items-center gap-3">
                <Art name={heroArt(template.key)} className="w-14" />
                <span>
                  <span className={`block font-display text-2xl font-bold ${color.text}`}>{template.name}</span>
                  <span className="text-zinc-400">{template.className}</span>
                </span>
              </span>
              <span className="mt-1 block text-sm">
                {taken ? (
                  <span className={owner.ready ? 'text-emerald-400' : 'text-amber-400'}>
                    {owner.player || 'Another iPad'} · {owner.ready ? 'ready' : 'choosing powers'}
                  </span>
                ) : (
                  <span className="text-zinc-500">
                    AC {template.ac} · HP {template.maxHp} · Speed {template.speed}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-col items-center gap-2">
        {/* Only the projector starts the game, once every hero is ready. */}
        {watchOnly && (
          <Button variant="gold" className="px-10 py-4 text-xl" disabled={!ready}
            onClick={() => dispatch({ type: 'START_GAME', treasureCards: cards.treasures, random: randomNumbers(128) })}
          >
            Enter the dungeon
          </Button>
        )}
        <p className="text-sm text-zinc-500">
          {lobby.length === 0
            ? 'Each player picks a hero on their own iPad.'
            : ready
              ? `Everyone's ready! Turn order: ${lobby.map((c) => templateFor(c.heroKey).name).join(', ')}.`
              : 'Waiting for every hero to be ready.'}
          {!watchOnly && lobby.length > 0 && ' The projector starts the game.'}
        </p>
      </div>

      {watchOnly ? (
        <p className="text-center text-sm">
          <button type="button" className="text-zinc-600 underline" onClick={onLeaveProjector}>
            Use this screen for a hero instead
          </button>
        </p>
      ) : (
        !mine && (
          <p className="text-center text-sm">
            <button type="button" className="font-semibold text-amber-400 underline" onClick={onProjector}>
              Use this screen as the projector
            </button>
          </p>
        )
      )}

      {!watchOnly && (
        <p className="text-center text-sm text-zinc-500">
          Just trying things out?{' '}
          <button type="button" className="font-semibold text-amber-400 underline" onClick={() => onDemo(demoPicks(cards.powers), cards.monsters, cards.treasures)}>
            Start a demo game
          </button>{' '}
          with all five heroes and a few monsters.
        </p>
      )}

      <p className="text-center text-sm">
        <button type="button" className="text-zinc-500 underline" onClick={onArt}>
          📷 Add photos of your cards
        </button>
      </p>
    </div>
  )
}
