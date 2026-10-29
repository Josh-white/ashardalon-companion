import { useState } from 'react'
import { heroArt } from '../data/art.js'
import { cardStats } from '../data/cards.js'
import { HERO_COLORS, HERO_TEMPLATES, heroTemplates, statsAtLevel, templateFor } from '../data/heroes.js'
import { campaignHero } from '../state/campaign.js'
import { levelSlots, powerSlotsFor } from '../state/game.js'
import { randomNumbers } from '../state/random.js'
import { useCards } from '../state/useCards.js'
import { AdventurePicker, ChosenAdventure } from './Adventure.jsx'
import Art from './Art.jsx'
import { CampaignLobby, HeroCampaign } from './Campaign.jsx'
import Chronicle from './Chronicle.jsx'
import { HeroHall, HoldToPick } from './HeroHall.jsx'
import { Button } from './ui.jsx'

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

// The claim's power slots: a campaign hero who levelled up has the cards each level added.
const claimSlots = (claim) => {
  const template = templateFor(claim.heroKey)
  const slots = levelSlots(template, claim.picks.length - powerSlotsFor(template).length + 1)
  return claim.picks.map((_, i) => slots[i] ?? 'daily')
}

const powersChosen = (claim, cards) =>
  claimSlots(claim).every(
    (type, i) => claim.picks[i] || !cards.some((c) => c.hero === claim.heroKey && c.type === type),
  )

// Starting picks for every hero in the box, for a demo game.
export const demoPicks = (cards) => Object.fromEntries(HERO_TEMPLATES.map((t) => [t.key, startingPicks(t, cards)]))

// A claim can get ready once the player has typed a name and every slot that has
// cards to choose from has one picked.
export function claimReady(claim, cards) {
  return hasName(claim) && powersChosen(claim, cards)
}

function Stats({ template, level = 1 }) {
  const at = statsAtLevel(template, level)
  const stats = [
    ['AC', at.ac],
    ['HP', at.maxHp],
    ['Speed', at.speed],
    ['Surge', `${at.surgeValue} HP`],
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

// `solo`: the solo screen's short version. The name and getting ready are asked once for
// the whole screen, and the powers fold away (the suggested ones are already picked).
function MyHero({ state, claim, cards, deviceId, dispatch, solo = false }) {
  const [showPowers, setShowPowers] = useState(!solo || !powersChosen(claim, cards.powers))
  const template = templateFor(claim.heroKey)
  const color = HERO_COLORS[template.color]
  const slots = claimSlots(claim)
  const level = campaignHero(state, template.key)?.level ?? 1
  const abilities = cards.abilities.filter((a) => a.hero === template.key && a.level <= level)
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

      {!solo && (
        <input
          className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
          placeholder="Your name (needed to get ready)"
          value={claim.player}
          onChange={(e) => dispatch({ type: 'SET_LOBBY_PLAYER', deviceId, player: e.target.value })}
        />
      )}

      {!solo && <Stats template={template} level={level} />}
      {state.campaign && <HeroCampaign state={state} heroKey={template.key} dispatch={dispatch} />}
      {solo && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-300">
          <span className="mr-auto">
            Powers: {claim.picks.map((card) => card?.name ?? '(not chosen)').join(', ')}
          </span>
          <Button variant="ghost" className="!py-1 text-sm" onClick={() => setShowPowers(!showPowers)}>
            {showPowers ? 'Done' : 'Change powers'}
          </Button>
        </div>
      )}
      {!solo && abilities.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-zinc-300">
          {abilities.map((ability) => (
            <li key={ability.name}>
              <span className="font-semibold text-amber-300">{ability.name}:</span> {ability.text}
            </li>
          ))}
        </ul>
      )}

      {showPowers && (
      <>
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
      </>
      )}

      {!solo && (
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
      )}
    </section>
  )
}

// Solo on the virtual board: this screen picks one to five heroes and runs the whole game.
// Each hero is a claim of its own (this screen's id plus ~solo-1 to ~solo-5), so getting
// a hero ready works the same as on a player's iPad.
const SOLO_SLOTS = ['~solo-1', '~solo-2', '~solo-3', '~solo-4', '~solo-5']

function SoloSetup({ state, dispatch, deviceId, cards, onStart, onLeave }) {
  const lobby = state.lobby ?? []
  const mine = SOLO_SLOTS.map((slot) => lobby.find((c) => c.deviceId === deviceId + slot)).filter(Boolean)
  const others = lobby.filter((c) => !c.deviceId.startsWith(deviceId + '~solo'))
  const freeSlot = SOLO_SLOTS.find((slot) => !lobby.some((c) => c.deviceId === deviceId + slot))
  const [name, setName] = useState(mine[0]?.player ?? '')
  const powersDone = mine.every((c) => powersChosen(c, cards.powers))
  const ready = mine.length > 0 && name.trim() !== '' && powersDone && others.length === 0
  // One player runs every hero, so the name goes on each of them.
  const rename = (player) => {
    setName(player)
    for (const c of mine) dispatch({ type: 'SET_LOBBY_PLAYER', deviceId: c.deviceId, player })
  }
  const pick = (template) => {
    const id = deviceId + freeSlot
    dispatch({ type: 'CLAIM_HERO', deviceId: id, heroKey: template.key, picks: startingPicks(template, cards.powers) })
    if (name) dispatch({ type: 'SET_LOBBY_PLAYER', deviceId: id, player: name })
  }
  const enter = () => {
    for (const c of mine) if (!c.ready) dispatch({ type: 'SET_LOBBY_READY', deviceId: c.deviceId, ready: true })
    onStart()
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
      <header className="text-center">
        <h1 className="font-display text-4xl font-bold text-amber-400 sm:text-5xl">Solo on the virtual board</h1>
        <p className="mt-2 text-lg text-zinc-400">Pick one hero, or up to five to play as a party. No tiles on the table: the dungeon is on this screen.</p>
      </header>
      <ChosenAdventure state={state} />
      <input
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-lg text-zinc-100"
        placeholder="Your name"
        value={name}
        onChange={(e) => rename(e.target.value)}
      />
      {mine.map((claim) => (
        <MyHero key={claim.deviceId} state={state} claim={claim} cards={cards} deviceId={claim.deviceId} dispatch={dispatch} solo />
      ))}
      {freeSlot && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {heroTemplates()
            .filter((t) => !lobby.some((c) => c.heroKey === t.key))
            .map((template) => (
              <button
                key={template.key}
                type="button"
                className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 p-2 text-left transition active:scale-95"
                onClick={() => pick(template)}
              >
                <Art name={heroArt(template.key)} className="w-10" />
                <span>
                  <span className={`block font-display text-xl font-bold ${HERO_COLORS[template.color].text}`}>{template.name}</span>
                  <span className="text-sm text-zinc-400">
                    {template.className} · Speed {template.speed}
                  </span>
                </span>
              </button>
            ))}
        </div>
      )}
      <div className="flex flex-col items-center gap-2">
        <Button variant="gold" className="px-10 py-4 text-xl" disabled={!ready} onClick={enter}>
          Enter the dungeon
        </Button>
        <p className="text-sm text-zinc-500">
          {others.length > 0
            ? 'Another iPad has a hero in the lobby. A solo game needs it to pick "Pick a different hero" first.'
            : mine.length === 0
              ? 'Pick a hero to start.'
              : !name.trim()
                ? 'Type your name to start.'
                : powersDone
                  ? 'Ready when you are.'
                  : 'Tap "Change powers" and choose every power.'}
        </p>
        <button type="button" className="text-sm text-zinc-500 underline" onClick={onLeave}>
          Back to the normal lobby
        </button>
      </div>
    </div>
  )
}

export default function Setup({ state, dispatch, deviceId, onClaim, onDemo, watchOnly, onProjector, onLeaveProjector, onArt, onSolo }) {
  const cards = useCards()
  const [solo, setSolo] = useState(false)
  const lobby = state.lobby ?? []
  const canSolo = !watchOnly && cards.tiles.some((t) => t.id === 'start')
  if (solo && canSolo) {
    const leave = () => {
      for (const slot of SOLO_SLOTS) dispatch({ type: 'RELEASE_HERO', deviceId: deviceId + slot })
      setSolo(false)
    }
    const start = () => {
      dispatch({ type: 'START_GAME', treasureCards: cards.treasures, chambers: cards.chambers, tokens: cards.treasureTokens, random: randomNumbers(128), tileRandom: randomNumbers(8), boardTiles: cards.tiles, boardRandom: randomNumbers(64) })
      onSolo()
    }
    return <SoloSetup state={state} dispatch={dispatch} deviceId={deviceId} cards={cards} onStart={start} onLeave={leave} />
  }
  const mine = lobby.find((c) => c.deviceId === deviceId)
  // A campaign goes on with the same heroes, every one of them.
  const heroChoices = state.campaign ? heroTemplates().filter((t) => campaignHero(state, t.key)) : heroTemplates()
  const ready = lobby.length > 0 && lobby.every((c) => c.ready) && (!state.campaign || heroChoices.every((t) => lobby.some((c) => c.heroKey === t.key)))

  const claim = (template) => {
    dispatch({ type: 'CLAIM_HERO', deviceId, heroKey: template.key, picks: startingPicks(template, cards.powers) })
    onClaim(template.key)
  }

  return (
    <div className={`mx-auto space-y-6 p-4 sm:p-8 ${watchOnly ? 'max-w-6xl' : 'max-w-4xl'}`}>
      <header className="text-center">
        <h1 className="font-display text-4xl font-bold text-amber-400 sm:text-5xl">{watchOnly ? 'The Heroes Assemble' : 'Wrath of Ashardalon'}</h1>
        <p className="mt-2 text-lg text-zinc-400">
          {watchOnly ? 'Pick your hero on your iPad to light their torch.' : mine ? 'Get your hero ready.' : 'Pick your hero on this iPad.'}
        </p>
      </header>

      {watchOnly && <Chronicle campaign={state.campaign} />}
      {watchOnly && <HeroHall heroes={heroChoices} lobby={lobby} />}

      {watchOnly ? (
        state.campaign ? <CampaignLobby state={state} dispatch={dispatch} /> : <AdventurePicker state={state} dispatch={dispatch} />
      ) : (
        <ChosenAdventure state={state} />
      )}

      {mine && !watchOnly && <MyHero state={state} claim={mine} cards={cards} deviceId={deviceId} dispatch={dispatch} />}

      {!watchOnly && (
      <div className="grid gap-3 sm:grid-cols-2">
        {heroChoices.map((template) => {
          const owner = lobby.find((c) => c.heroKey === template.key)
          if (owner && owner === mine) return null
          const color = HERO_COLORS[template.color]
          const taken = Boolean(owner)
          const canPick = !taken && !mine
          const body = (
            <>
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
            </>
          )
          const look = `rounded-2xl border border-zinc-800 p-4 text-left transition ${taken ? color.bg : 'bg-zinc-900'} ${!taken && mine ? 'opacity-50' : ''}`
          return canPick ? (
            <HoldToPick key={template.key} label={`Hold to pick ${template.name}`} onPick={() => claim(template)} className={`${look} active:scale-95`}>
              {body}
            </HoldToPick>
          ) : (
            <div key={template.key} className={look}>
              {body}
            </div>
          )
        })}
      </div>
      )}

      <div className="flex flex-col items-center gap-2">
        {/* Only the projector starts the game, once every hero is ready. */}
        {watchOnly && (
          <Button variant="gold" className="px-10 py-4 text-xl" disabled={!ready}
            onClick={() =>
              dispatch({ type: 'START_GAME', treasureCards: cards.treasures, chambers: cards.chambers, tokens: cards.treasureTokens, random: randomNumbers(128), tileRandom: randomNumbers(8) })
            }
          >
            Enter the dungeon
          </Button>
        )}
        <p className="text-sm text-zinc-500">
          {lobby.length === 0
            ? 'Each player picks a hero on their own iPad.'
            : ready
              ? `Everyone's ready! Turn order: ${lobby.map((c) => templateFor(c.heroKey).name).join(', ')}.`
              : state.campaign
                ? `Waiting for ${heroChoices.map((t) => t.name).join(', ')} to be ready.`
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

      {canSolo && !mine && (
        <p className="text-center text-sm text-zinc-500">
          Playing alone?{' '}
          <button type="button" className="font-semibold text-amber-400 underline" onClick={() => setSolo(true)}>
            Play solo on a virtual board
          </button>{' '}
          with one to five heroes, no tiles needed.
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
