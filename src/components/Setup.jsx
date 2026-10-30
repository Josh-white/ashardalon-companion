import { useState } from 'react'
import { heroArt } from '../data/art.js'
import { HERO_COLORS, HERO_TEMPLATES, heroTemplates, statsAtLevel, templateFor } from '../data/heroes.js'
import { campaignHero } from '../state/campaign.js'
import { levelSlots, powerSlotsFor } from '../state/game.js'
import { randomNumbers, shuffleNumbers } from '../state/random.js'
import { useCards } from '../state/useCards.js'
import { coachLine } from '../data/coaches.js'
import { heroesPlayed } from '../state/records.js'
import { useRecordsFile } from '../state/useRecords.js'
import { ChosenAdventure, QuestLine } from './Adventure.jsx'
import Art from './Art.jsx'
import { CampaignLobby, HeroCampaign } from './Campaign.jsx'
import Chronicle from './Chronicle.jsx'
import HeroCoach from './HeroCoach.jsx'
import { HeroAbilities, HeroBanner, HeroPortrait, PowerSlots } from './HeroGallery.jsx'
import { HeroHall, HoldToPick } from './HeroHall.jsx'
import { HallOfRecords, PlayerTitle } from './Records.jsx'
import ScreenChoice from './ScreenChoice.jsx'
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

// The name last typed on this iPad, so a player doesn't type it again every game.
const NAME_KEY = 'ashardalon-companion/player-name'
export function rememberedName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}
function rememberName(name) {
  try {
    if (name.trim()) localStorage.setItem(NAME_KEY, name)
  } catch {
    // Storage blocked: the name just isn't remembered.
  }
}

// The lobby's choice of real tiles on the table or the virtual board on the screens. Any
// screen can switch it; on the virtual board the projector shows the dungeon and each
// player moves their hero on their own iPad.
function BoardChoice({ state, dispatch, big = false }) {
  const on = Boolean(state.lobbyBoard)
  const pick = (value) => dispatch({ type: 'SET_LOBBY_BOARD', on: value })
  return (
    <section className={`rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 ${big ? 'text-xl' : ''}`}>
      <p className="mb-2 font-semibold text-zinc-300">Where's the dungeon?</p>
      <div className="flex flex-wrap gap-2">
        <Button variant={on ? 'default' : 'gold'} onClick={() => pick(false)} aria-pressed={!on}>
          🧱 Real tiles on the table
        </Button>
        <Button variant={on ? 'gold' : 'default'} onClick={() => pick(true)} aria-pressed={on}>
          🗺️ Virtual board on the screens
        </Button>
      </div>
      {on && (
        <p className="mt-2 text-sm text-zinc-400">
          No tiles needed. The projector or TV shows the whole dungeon, and each player moves their hero on their own iPad. No projector? Any ready
          player can enter the dungeon.
        </p>
      )}
    </section>
  )
}

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
    <div className="grid grid-cols-4 gap-2 text-center">
      {stats.map(([label, value]) => (
        <div key={label} className="rounded-xl border border-amber-900/50 bg-black/50 py-2">
          <div className="font-display text-2xl font-bold text-amber-50">{value}</div>
          <div className="text-xs tracking-widest text-zinc-400 uppercase">{label}</div>
        </div>
      ))}
    </div>
  )
}

// `solo`: the solo screen's short version. The name and getting ready are asked once for
// the whole screen, and the powers fold away (the suggested ones are already picked).
// Is this hero new to the player? Null while the Pi's records load. A player with no name
// yet counts as new.
export function newToHero(played, name, heroKey) {
  if (!name?.trim()) return true
  if (!played) return null
  return !heroesPlayed(played, name).includes(heroKey)
}

function MyHero({ state, claim, cards, deviceId, dispatch, solo = false, records = null, played = null, voice = null }) {
  const [showPowers, setShowPowers] = useState(!solo || !powersChosen(claim, cards.powers))
  const template = templateFor(claim.heroKey)
  const color = HERO_COLORS[template.color]
  const slots = claimSlots(claim)
  const level = campaignHero(state, template.key)?.level ?? 1
  const abilities = cards.abilities.filter((a) => a.hero === template.key && a.level <= level)

  const pick = (slot, card) => dispatch({ type: 'SET_LOBBY_PICK', deviceId, slot, card })
  const powerSlots = <PowerSlots template={template} slots={slots} picks={claim.picks} powers={cards.powers} onPick={pick} />
  const changeHero = (
    <button type="button" className="-my-2 py-2 text-sm text-zinc-400 underline" onClick={() => dispatch({ type: 'RELEASE_HERO', deviceId })}>
      Pick a different hero
    </button>
  )

  if (solo) {
    return (
      <section className={`rounded-2xl border border-zinc-800 p-4 ring-2 ${color.ring} ${color.bg}`}>
        <div className="flex items-start gap-3">
          <Art name={heroArt(template.key)} className="w-20" />
          <div className="mr-auto">
            <h2 className={`font-display text-3xl font-bold ${color.text}`}>{template.name}</h2>
            <p className="text-zinc-400">{template.className}</p>
          </div>
          {changeHero}
        </div>
        <HeroAbilities template={template} level={level} className="mt-2 text-sm" />
        {state.campaign && <HeroCampaign state={state} heroKey={template.key} dispatch={dispatch} />}
        <div className="mt-3">
          <HeroCoach key={template.key} heroKey={template.key} isNew={false} voice={voice} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-300">
          <span className="mr-auto">Powers: {claim.picks.map((card) => card?.name ?? '(not chosen)').join(', ')}</span>
          {!showPowers && (
            <Button className="min-h-11 text-base" onClick={() => setShowPowers(true)}>
              ✏️ Change powers
            </Button>
          )}
        </div>
        {/* Done comes after the last power, and stays in reach at the bottom of a phone while scrolling the list. */}
        {showPowers && (
          <div className="mt-3">
            {powerSlots}
            <Button variant="gold" className="sticky bottom-3 mt-3 w-full py-3 text-lg shadow-xl" onClick={() => setShowPowers(false)}>
              ✓ Done choosing powers
            </Button>
          </div>
        )}
      </section>
    )
  }

  // "Ready your hero": the hero's card art beside their name, stats and abilities, then
  // their powers as cards and one big Ready button.
  return (
    <section className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <HeroPortrait
          heroKey={template.key}
          className={`mx-auto aspect-[406/560] w-48 rounded-t-[999px] rounded-b-2xl border-2 shadow-[0_0_40px_rgb(245_158_11/0.3)] ring-2 sm:w-full ${color.ring} border-transparent`}
        />
        <div className="min-w-0 space-y-3">
          <div className="flex items-baseline gap-3">
            <h2 className={`mr-auto font-display text-4xl font-bold ${color.text}`}>{template.name}</h2>
            {changeHero}
          </div>
          <p className="-mt-2 text-lg text-zinc-300">{template.className}</p>
          <label className="block">
            <span className="text-xs tracking-widest text-zinc-400 uppercase">Your name</span>
            <input
              className="mt-1 w-full rounded-xl border border-amber-900/70 bg-black/60 px-3 py-2 text-xl text-zinc-100"
              placeholder="Type your name to get ready"
              value={claim.player}
              onChange={(e) => {
                rememberName(e.target.value)
                dispatch({ type: 'SET_LOBBY_PLAYER', deviceId, player: e.target.value })
              }}
            />
            <PlayerTitle records={records} name={claim.player} className="mt-2 text-sm" />
          </label>
          <Stats template={template} level={level} />
          {state.campaign && <HeroCampaign state={state} heroKey={template.key} dispatch={dispatch} />}
          {abilities.length > 0 && (
            <ul className="space-y-1 text-sm text-zinc-300">
              {abilities.map((ability) => (
                <li key={ability.name}>
                  <span className="font-semibold text-amber-300">{ability.name}:</span> {ability.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <HeroCoach key={template.key} heroKey={template.key} isNew={newToHero(played, claim.player, template.key)} voice={voice} />

      <div>
        <h3 className="mb-2 font-display text-2xl font-bold text-amber-400">Your powers</h3>
        {powerSlots}
      </div>

      <button
        type="button"
        disabled={!claimReady(claim, cards.powers)}
        onClick={() => dispatch({ type: 'SET_LOBBY_READY', deviceId, ready: !claim.ready })}
        className={`w-full rounded-full px-6 py-4 font-display text-2xl font-black transition active:scale-[0.98] disabled:opacity-40 ${
          claim.ready
            ? 'border-2 border-emerald-500 bg-emerald-950/70 text-emerald-200'
            : 'bg-gradient-to-b from-amber-400 to-orange-600 text-orange-950 shadow-[0_0_30px_rgb(245_158_11/0.5)]'
        }`}
      >
        {claim.ready
          ? '✓ Ready! (tap to change something)'
          : !hasName(claim)
            ? 'Type your name to get ready'
            : powersChosen(claim, cards.powers)
              ? "🔥 I'm ready"
              : 'Pick every power to get ready'}
      </button>
    </section>
  )
}

// Solo on the virtual board: this screen picks one to five heroes and runs the whole game.
// Each hero is a claim of its own (this screen's id plus ~solo-1 to ~solo-5), so getting
// a hero ready works the same as on a player's iPad.
const SOLO_SLOTS = ['~solo-1', '~solo-2', '~solo-3', '~solo-4', '~solo-5']

function SoloSetup({ state, dispatch, deviceId, cards, onStart, onLeave, voice }) {
  const lobby = state.lobby ?? []
  const mine = SOLO_SLOTS.map((slot) => lobby.find((c) => c.deviceId === deviceId + slot)).filter(Boolean)
  const others = lobby.filter((c) => !c.deviceId.startsWith(deviceId + '~solo'))
  const freeSlot = SOLO_SLOTS.find((slot) => !lobby.some((c) => c.deviceId === deviceId + slot))
  const powersDone = mine.every((c) => powersChosen(c, cards.powers))
  // A campaign goes on with the same heroes, every one of them.
  const heroChoices = state.campaign ? heroTemplates().filter((t) => campaignHero(state, t.key)) : heroTemplates()
  const campaignShort = state.campaign && !heroChoices.every((t) => mine.some((c) => c.heroKey === t.key))
  const ready = mine.length > 0 && powersDone && others.length === 0 && !campaignShort
  // One player runs every hero, so nobody is asked for a name: the screens call each turn by
  // the hero's name instead.
  const pick = (template) => {
    dispatch({ type: 'CLAIM_HERO', deviceId: deviceId + freeSlot, heroKey: template.key, picks: startingPicks(template, cards.powers) })
  }
  const enter = () => {
    for (const c of mine) {
      if (!c.player.trim()) dispatch({ type: 'SET_LOBBY_PLAYER', deviceId: c.deviceId, player: 'Solo' })
      if (!c.ready) dispatch({ type: 'SET_LOBBY_READY', deviceId: c.deviceId, ready: true })
    }
    onStart()
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
      <header className="text-center">
        <h1 className="font-display text-4xl font-bold text-amber-400 sm:text-5xl">Solo on the virtual board</h1>
        <p className="mt-2 text-lg text-zinc-400">Pick an adventure and one hero, or up to five to play as a party. No tiles on the table: the dungeon is on this screen.</p>
      </header>
      {state.campaign ? <CampaignLobby state={state} dispatch={dispatch} /> : <QuestLine state={state} dispatch={dispatch} onBoard big={false} />}
      {mine.map((claim) => (
        <MyHero key={claim.deviceId} state={state} claim={claim} cards={cards} deviceId={claim.deviceId} dispatch={dispatch} solo voice={voice} />
      ))}
      {freeSlot && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {heroChoices
            .filter((t) => !lobby.some((c) => c.heroKey === t.key))
            .map((template) => (
              <button
                key={template.key}
                type="button"
                className="flex items-start gap-2 rounded-xl border border-zinc-800 bg-zinc-900 p-2 text-left transition active:scale-95"
                onClick={() => pick(template)}
              >
                <Art name={heroArt(template.key)} className="w-10" />
                <span>
                  <span className={`block font-display text-xl font-bold ${HERO_COLORS[template.color].text}`}>{template.name}</span>
                  <span className="text-sm text-zinc-400">
                    {template.className} · Speed {template.speed}
                  </span>
                  <HeroAbilities template={template} level={campaignHero(state, template.key)?.level ?? 1} className="mt-1 text-sm" />
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
              : campaignShort
                ? 'The campaign goes on with all of its heroes: pick each one.'
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

// `role` is what this screen said it is on "Who stands here?" (null until it says), and
// `projectorOpen` whether a big screen is in the game right now.
export default function Setup({ state, dispatch, deviceId, onClaim, onDemo, watchOnly, onProjector, onLeaveProjector, onArt, onSolo, role, setRole, projectorOpen, voice = null }) {
  const cards = useCards()
  const [hall, setHall] = useState(false)
  // Loaded again after the Hall of Records closes.
  const recordsFile = useRecordsFile(hall)
  const records = recordsFile?.players ?? null
  const played = recordsFile?.played ?? null
  const lobby = state.lobby ?? []
  if (hall) return <HallOfRecords onClose={() => setHall(false)} />
  const canBoard = cards.tiles.some((t) => t.id === 'start')
  const canSolo = !watchOnly && canBoard
  const mine = lobby.find((c) => c.deviceId === deviceId)
  const demo = () => onDemo(demoPicks(cards.powers), cards.monsters, cards.treasures)
  if (role === 'solo' && canSolo) {
    const leave = () => {
      for (const slot of SOLO_SLOTS) dispatch({ type: 'RELEASE_HERO', deviceId: deviceId + slot })
      setRole(null)
    }
    const start = () => {
      dispatch({ type: 'START_GAME', treasureCards: cards.treasures, chambers: cards.chambers, tokens: cards.treasureTokens, random: shuffleNumbers(), tileRandom: randomNumbers(8), boardTiles: cards.tiles, boardRandom: randomNumbers(64) })
      onSolo()
    }
    return <SoloSetup state={state} dispatch={dispatch} deviceId={deviceId} cards={cards} onStart={start} onLeave={leave} voice={voice} />
  }
  // A screen that hasn't said what it is yet (and isn't already holding a hero) asks first.
  if (!watchOnly && !mine && (!role || role === 'big' || (role === 'solo' && !canSolo))) {
    return (
      <ScreenChoice
        onHero={() => setRole('hero')}
        onBigScreen={() => {
          setRole('big')
          onProjector()
        }}
        onSolo={canSolo ? () => setRole('solo') : null}
        onDemo={demo}
        onArt={onArt}
      />
    )
  }
  // A campaign goes on with the same heroes, every one of them.
  const heroChoices = state.campaign ? heroTemplates().filter((t) => campaignHero(state, t.key)) : heroTemplates()
  const ready = lobby.length > 0 && lobby.every((c) => c.ready) && (!state.campaign || heroChoices.every((t) => lobby.some((c) => c.heroKey === t.key)))

  const onBoard = canBoard && Boolean(state.lobbyBoard)
  const enter = () =>
    dispatch({
      type: 'START_GAME',
      treasureCards: cards.treasures,
      chambers: cards.chambers,
      tokens: cards.treasureTokens,
      random: shuffleNumbers(),
      tileRandom: randomNumbers(8),
      ...(onBoard ? { boardTiles: cards.tiles, boardRandom: randomNumbers(64) } : {}),
    })

  const claim = (template) => {
    const player = rememberedName()
    dispatch({ type: 'CLAIM_HERO', deviceId, heroKey: template.key, picks: startingPicks(template, cards.powers), player })
    onClaim(template.key)
    // A player new to this hero hears their coach straight away.
    const line = coachLine(template.key)
    if (line && voice?.available && newToHero(played, player, template.key)) voice.say([line], { force: true })
  }

  return (
    <div className={`mx-auto space-y-6 p-4 sm:p-8 ${watchOnly ? 'max-w-6xl' : 'max-w-4xl'}`}>
      <header className="text-center">
        <h1 className="lobby-title font-display text-5xl font-black text-amber-400 sm:text-6xl">
          {watchOnly ? 'The Heroes Assemble' : mine ? 'Ready your hero' : 'Choose your hero'}
        </h1>
        <p className="mt-3 font-display text-xl text-amber-100/90 italic">
          {watchOnly ? 'Pick your hero on your iPad to light their torch.' : mine ? 'Check your powers, then tell the party you are ready.' : 'Hold a hero to light their torch.'}
        </p>
      </header>

      {watchOnly && <Chronicle campaign={state.campaign} />}
      {watchOnly && <HeroHall heroes={heroChoices} lobby={lobby} records={records} onFree={(c) => dispatch({ type: 'RELEASE_HERO', deviceId: c.deviceId })} levelOf={(key) => campaignHero(state, key)?.level ?? 1} />}

      {/* Where the dungeon is: one choice for the whole table, so the big screen makes it.
          Without one in the game, any iPad can. */}
      {watchOnly && !state.campaign ? (
        <QuestLine state={state} dispatch={dispatch} onBoard={onBoard} boardChoice={canBoard ? <BoardChoice state={state} dispatch={dispatch} big /> : null} />
      ) : (
        <>
          {watchOnly ? <CampaignLobby state={state} dispatch={dispatch} /> : <ChosenAdventure state={state} />}
          {canBoard && (watchOnly || !projectorOpen) && <BoardChoice state={state} dispatch={dispatch} big={watchOnly} />}
        </>
      )}

      {mine && !watchOnly && <MyHero state={state} claim={mine} cards={cards} deviceId={deviceId} dispatch={dispatch} records={records} played={played} voice={voice} />}

      {!watchOnly && (
        <div className={`flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-4 ${mine ? 'pt-4' : ''}`}>
          {heroChoices.map((template) => {
            const owner = lobby.find((c) => c.heroKey === template.key)
            if (owner && owner === mine) return null
            const taken = Boolean(owner)
            const status = taken ? (
              <span className={owner.ready ? 'text-emerald-400' : 'text-amber-400'}>
                {owner.player || 'Another iPad'} · {owner.ready ? 'ready' : 'choosing powers'}
                <PlayerTitle records={records} name={owner.player} className="mt-1 text-xs" />
              </span>
            ) : (
              <span className="text-zinc-400">
                AC {template.ac} · HP {template.maxHp} · Speed {template.speed}
              </span>
            )
            // Before picking, each hero shows what their card ability does.
            const banner = (
              <>
                <HeroBanner template={template} status={status} taken={taken} faded={!taken && Boolean(mine)} small={Boolean(mine)} />
                {!mine && <HeroAbilities template={template} level={campaignHero(state, template.key)?.level ?? 1} dim={taken} className="mt-2 px-1 text-sm" />}
              </>
            )
            const size = mine ? 'sm:w-[18%]' : 'sm:w-[30%] lg:w-[18%]'
            return !taken && !mine ? (
              <HoldToPick key={template.key} label={`Hold to pick ${template.name}`} onPick={() => claim(template)} className={`block w-full text-center transition active:scale-95 ${size}`}>
                {banner}
              </HoldToPick>
            ) : (
              <div key={template.key} className={`w-full ${size}`}>
                {banner}
              </div>
            )
          })}
        </div>
      )}

      <div className="flex flex-col items-center gap-2">
        {/* The projector starts the game once every hero is ready. On the virtual board a
            projector is optional, so a ready player's iPad can start it too. */}
        {(watchOnly || (onBoard && mine)) && (
          <Button variant="gold" className="px-10 py-4 text-xl" disabled={!ready} onClick={enter}>
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
          {!watchOnly && lobby.length > 0 && !onBoard && ' The big screen starts the game.'}
        </p>
      </div>

      <p className="text-center text-sm">
        {watchOnly ? (
          <button
            type="button"
            className="text-zinc-500 underline"
            onClick={() => {
              setRole(null)
              onLeaveProjector()
            }}
          >
            Use this screen for something else
          </button>
        ) : (
          !mine && (
            <button type="button" className="text-zinc-500 underline" onClick={() => setRole(null)}>
              Not a hero screen? Choose again
            </button>
          )
        )}
      </p>
      <p className="text-center">
        <Button variant="ghost" onClick={() => setHall(true)}>
          🏆 Hall of Records
        </Button>
      </p>
      {watchOnly && (
        <p className="text-center text-sm">
          <button type="button" className="text-zinc-600 underline" onClick={onArt}>
            📷 Add photos of your cards
          </button>
        </p>
      )}
    </div>
  )
}
