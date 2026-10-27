import { useEffect, useState } from 'react'
import { AdventurePanel } from './components/Adventure.jsx'
import Art from './components/Art.jsx'
import ArtScreen from './components/ArtScreen.jsx'
import HeroCard from './components/HeroCard.jsx'
import MomentOverlay from './components/MomentOverlay.jsx'
import Narrator from './components/Narrator.jsx'
import MonsterList, { VillainList } from './components/MonsterList.jsx'
import ProjectorView from './components/ProjectorView.jsx'
import Recap from './components/Recap.jsx'
import SeatPicker from './components/SeatPicker.jsx'
import Setup from './components/Setup.jsx'
import { TreasureStep } from './components/Treasure.jsx'
import { TilesLeft } from './components/Tiles.jsx'
import TurnGuide, { ExtraAttacks } from './components/TurnGuide.jsx'
import UndoButton from './components/UndoButton.jsx'
import { SoundToggle, TapForSound } from './components/SoundToggle.jsx'
import { Button, HpBar } from './components/ui.jsx'
import { heroArt } from './data/art.js'
import { useSoundEffects } from './audio/sfx.js'
import { useAudioLocked, useSoundSetting } from './audio/soundSetting.js'
import { HERO_COLORS } from './data/heroes.js'
import { PHASES } from './data/phases.js'
import { encounterCardsOutdated } from './state/game.js'
import { randomNumbers } from './state/random.js'
import { useCards } from './state/useCards.js'
import { useDeviceId, useSeat, useSharedGame } from './state/useSharedGame.js'

const TABLE_SEAT = 'table'
const PROJECTOR_SEAT = 'projector'

function PartyBar({ state, dispatch, undo, undoDepth, seatLabel, onSwitchSeat, sound }) {
  const newGame = () => {
    if (window.confirm('Start a new game? This clears the current one for everyone.')) dispatch({ type: 'NEW_GAME' })
  }
  return (
    <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <h1 className="font-display text-xl font-bold text-amber-400">Wrath of Ashardalon</h1>
        <div className="flex items-center gap-2">
          <span className="text-zinc-400">XP</span>
          <Button className="!px-2 !py-0" onClick={() => dispatch({ type: 'ADJUST_XP', amount: -1 })}>−</Button>
          <span className="w-8 text-center text-2xl font-bold text-amber-400">{state.xp}</span>
          <Button className="!px-2 !py-0" onClick={() => dispatch({ type: 'ADJUST_XP', amount: 1 })}>+</Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-zinc-400">Healing surges</span>
          <Button className="!px-2 !py-0" onClick={() => dispatch({ type: 'ADJUST_SURGES', amount: -1 })}>−</Button>
          <span className={`text-2xl ${state.surges === 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {state.surges === 0 ? '0' : '❤'.repeat(state.surges)}
          </span>
          <Button className="!px-2 !py-0" onClick={() => dispatch({ type: 'ADJUST_SURGES', amount: 1 })}>+</Button>
        </div>
        <TilesLeft state={state} className="text-lg" />
        <div className="ml-auto flex flex-wrap gap-2">
          <UndoButton undo={undo} depth={undoDepth} dispatch={dispatch} className="max-w-56 truncate" />
          <SoundToggle on={sound.on} setOn={sound.setOn} className="text-sm" />
          <Button variant="ghost" className="text-sm" onClick={onSwitchSeat}>
            {seatLabel} · switch
          </Button>
          <Button variant="ghost" className="text-sm" onClick={() => dispatch({ type: 'END_GAME', result: 'won' })}>
            We won!
          </Button>
          <Button
            variant="ghost"
            className="text-sm"
            onClick={() => window.confirm('Did the party lose? This shows the end-of-game recap.') && dispatch({ type: 'END_GAME', result: 'lost' })}
          >
            We lost
          </Button>
          <Button variant="ghost" className="text-sm" onClick={newGame}>
            New game
          </Button>
        </div>
      </div>
      {state.surges === 0 && (
        <p className="bg-red-950 px-4 py-1 text-center text-sm font-semibold text-red-300">
          No healing surges left! If a hero starts a turn at 0 HP, the party loses.
        </p>
      )}
    </header>
  )
}

function GameLog({ log }) {
  if (log.length === 0) return null
  return (
    <section>
      <h2 className="mb-2 font-display text-xl font-bold text-zinc-300">Story so far</h2>
      <ul className="space-y-1 text-sm text-zinc-400">
        {log.slice(0, 8).map((entry) => (
          <li key={entry.id}>
            <span className="text-zinc-600">Round {entry.round}:</span> {entry.text}
          </li>
        ))}
      </ul>
    </section>
  )
}

function WaitingBanner({ state }) {
  const hero = state.heroes[state.turn.heroIndex]
  const phase = PHASES[state.turn.phase]
  const color = HERO_COLORS[hero.color]
  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
      <p className="text-sm uppercase tracking-widest text-zinc-500">Round {state.turn.round}</p>
      <h2 className="font-display text-3xl font-bold text-zinc-200">
        It's <span className={color.text}>{hero.player || hero.name}</span>'s turn
      </h2>
      <p className="mt-1 text-lg text-zinc-400">
        {phase.emoji} {phase.title}
      </p>
    </section>
  )
}

function PartyStrip({ heroes, exceptId }) {
  const others = heroes.filter((h) => h.id !== exceptId)
  if (others.length === 0) return null
  return (
    <section>
      <h2 className="mb-2 font-display text-xl font-bold text-zinc-300">Your party</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {others.map((hero) => (
          <div key={hero.id} className={`rounded-xl p-3 ${HERO_COLORS[hero.color].bg}`}>
            <div className="flex items-center justify-between gap-2">
              <Art name={heroArt(hero.key)} className="w-10" />
              <span className={`mr-auto font-display text-lg font-bold ${HERO_COLORS[hero.color].text}`}>{hero.name}</span>
              <span className="text-zinc-300">
                {hero.hp} / {hero.maxHp} HP
              </span>
            </div>
            <HpBar hp={hero.hp} maxHp={hero.maxHp} />
            {hero.conditions.length > 0 && <p className="mt-1 text-sm text-amber-400">{hero.conditions.join(', ')}</p>}
            {(hero.items ?? []).length > 0 && (
              <p className="mt-1 text-sm text-yellow-300">💰 {hero.items.map((i) => (i.used ? `${i.name} (used)` : i.name)).join(', ')}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function HeroView({ state, dispatch, hero }) {
  const heroIndex = state.heroes.indexOf(hero)
  const myTurn = heroIndex === state.turn.heroIndex
  // During your Hero Phase the attack box lists your attack powers, so the hero card doesn't repeat them.
  const powersInTurnGuide = myTurn && PHASES[state.turn.phase].key === 'hero'
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      {myTurn ? <TurnGuide state={state} dispatch={dispatch} /> : <WaitingBanner state={state} />}
      <AdventurePanel state={state} dispatch={dispatch} />
      {/* Cause Fear gives other heroes an attack during someone else's turn. */}
      {!myTurn && <ExtraAttacks state={state} dispatch={dispatch} onlyHeroId={hero.id} />}
      <HeroCard
        state={state}
        hero={hero}
        isActive={myTurn}
        xp={state.xp}
        surges={state.surges}
        dispatch={dispatch}
        powersInTurnGuide={powersInTurnGuide}
        natural20={state.turn.natural20 === hero.id}
      />
      <VillainList state={state} dispatch={dispatch} />
      <MonsterList state={state} dispatch={dispatch} ownerId={hero.id} />
      <PartyStrip heroes={state.heroes} exceptId={hero.id} />
      <GameLog log={state.log} />
      <TreasureStep state={state} dispatch={dispatch} heroId={hero.id} />
    </div>
  )
}

function TableView({ state, dispatch }) {
  return (
    <div className="mx-auto max-w-6xl space-y-8 p-4">
      <TurnGuide state={state} dispatch={dispatch} />
      <AdventurePanel state={state} dispatch={dispatch} />
      <section>
        <h2 className="mb-3 font-display text-2xl font-bold text-zinc-100">Heroes</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {state.heroes.map((hero, i) => (
            <HeroCard
              key={hero.id}
              state={state}
              hero={hero}
              isActive={i === state.turn.heroIndex}
              xp={state.xp}
              surges={state.surges}
              dispatch={dispatch}
              powersInTurnGuide={i === state.turn.heroIndex && PHASES[state.turn.phase].key === 'hero'}
              natural20={state.turn.natural20 === hero.id}
            />
          ))}
        </div>
      </section>
      <VillainList state={state} dispatch={dispatch} canPlace />
      <MonsterList state={state} dispatch={dispatch} />
      <GameLog log={state.log} />
      <TreasureStep state={state} dispatch={dispatch} />
    </div>
  )
}

function Connecting() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
      <p className="font-display text-2xl">Opening the dungeon doors…</p>
    </main>
  )
}

export default function App() {
  const { state, connected, dispatch, undo, undoDepth, instance } = useSharedGame()
  const [seat, setSeat] = useSeat()
  const deviceId = useDeviceId()
  const cards = useCards()
  const [artOpen, setArtOpen] = useState(false)

  // A game from before the monster deck has monsters without their card; give them one.
  const needsCards = state?.monsters.some((m) => !m.card && cards.monsters.some((c) => c.name.toLowerCase() === m.name.toLowerCase()))
  useEffect(() => {
    if (needsCards) dispatch({ type: 'ATTACH_MONSTER_CARDS', cards: cards.monsters })
  }, [needsCards]) // eslint-disable-line react-hooks/exhaustive-deps

  // A game saved before the card file changed keeps old copies of its encounter cards.
  const encountersOutdated = encounterCardsOutdated(state, cards.encounters)
  useEffect(() => {
    if (encountersOutdated) dispatch({ type: 'UPDATE_ENCOUNTER_CARDS', cards: cards.encounters })
  }, [encountersOutdated]) // eslint-disable-line react-hooks/exhaustive-deps

  const [soundOn, setSoundOn] = useSoundSetting(seat)
  const sound = { on: soundOn, setOn: setSoundOn }
  const soundLocked = useAudioLocked(soundOn)
  useSoundEffects(state?.moment, soundOn)

  if (!state) return <Connecting />

  const banners = (
    <>
      {instance && (
        <p className="bg-fuchsia-700 px-4 py-1 text-center text-sm font-bold uppercase tracking-widest text-white">
          {instance} · not your real game
        </p>
      )}
      {!connected && (
        <p className="sticky top-0 z-30 bg-amber-600 px-4 py-1 text-center text-sm font-semibold text-zinc-950">
          Reconnecting to the game… changes won't be saved until it's back.
        </p>
      )}
      {seat === PROJECTOR_SEAT && <Narrator state={state} on={soundOn} />}
    </>
  )

  if (artOpen) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        {banners}
        <ArtScreen onDone={() => setArtOpen(false)} />
      </main>
    )
  }

  if (state.status === 'setup') {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        {banners}
        {undo === 'New game' && (
          <div className="pt-4 text-center">
            <UndoButton undo={undo} depth={undoDepth} dispatch={dispatch} className="border border-zinc-700" />
          </div>
        )}
        <Setup
          state={state}
          dispatch={dispatch}
          deviceId={deviceId}
          onClaim={setSeat}
          onDemo={(picks, monsterCards, treasureCards) =>
            dispatch({ type: 'START_DEMO', picks, monsterCards, treasureCards, random: randomNumbers(128) })
          }
          watchOnly={seat === PROJECTOR_SEAT}
          onProjector={() => setSeat(PROJECTOR_SEAT)}
          onLeaveProjector={() => setSeat(null)}
          onArt={() => setArtOpen(true)}
        />
      </main>
    )
  }

  const myHero = state.heroes.find((h) => h.key === seat)
  if (seat === PROJECTOR_SEAT) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        {banners}
        <ProjectorView state={state} onSwitchSeat={() => setSeat(null)} sound={sound} />
        <MomentOverlay moment={state.moment} heroes={state.heroes} big />
        <TapForSound locked={soundLocked} big />
        {(state.status === 'won' || state.status === 'lost') && <Recap state={state} big />}
      </main>
    )
  }
  if (seat !== TABLE_SEAT && !myHero) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        {banners}
        <SeatPicker heroes={state.heroes} onPick={setSeat} tableSeat={TABLE_SEAT} projectorSeat={PROJECTOR_SEAT} onArt={() => setArtOpen(true)} />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      {banners}
      <PartyBar
        undo={undo}
        undoDepth={undoDepth}
        state={state}
        dispatch={dispatch}
        seatLabel={myHero ? myHero.name : 'Table'}
        onSwitchSeat={() => setSeat(null)}
        sound={sound}
      />
      {myHero ? <HeroView state={state} dispatch={dispatch} hero={myHero} /> : <TableView state={state} dispatch={dispatch} />}
      <MomentOverlay moment={state.moment} heroes={state.heroes} />
      <TapForSound locked={soundLocked} />
      {(state.status === 'won' || state.status === 'lost') && <Recap state={state} dispatch={dispatch} />}
    </main>
  )
}
