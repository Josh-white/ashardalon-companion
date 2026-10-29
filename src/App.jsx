import { useEffect, useState } from 'react'
import { AdventurePanel } from './components/Adventure.jsx'
import Art from './components/Art.jsx'
import ArtScreen from './components/ArtScreen.jsx'
import { AreaBackdrop, AreaName } from './components/AreaBackdrop.jsx'
import HeroCard from './components/HeroCard.jsx'
import DragonIntro, { useIntro } from './components/Intro.jsx'
import FirstRoll from './components/FirstRoll.jsx'
import GamePicker, { GameBar } from './components/GamePicker.jsx'
import MomentOverlay from './components/MomentOverlay.jsx'
import MonsterList, { VillainList } from './components/MonsterList.jsx'
import ProjectorView from './components/ProjectorView.jsx'
import Recap, { LOST_QUESTION, newGameQuestion } from './components/Recap.jsx'
import Board from './components/Board.jsx'
import SeatPicker from './components/SeatPicker.jsx'
import Setup from './components/Setup.jsx'
import { TreasureStep } from './components/Treasure.jsx'
import { TilesLeft } from './components/Tiles.jsx'
import TurnGuide, { ExtraAttacks } from './components/TurnGuide.jsx'
import UndoButton from './components/UndoButton.jsx'
import { MusicToggle, SoundToggle, TapForSound } from './components/SoundToggle.jsx'
import { BoardSwitch, BoardToast, SoundBoard } from './components/SoundBoard.jsx'
import { Button, HpBar, useConfirm } from './components/ui.jsx'
import { heroArt } from './data/art.js'
import { useSoundEffects } from './audio/sfx.js'
import { useNarrator } from './audio/useNarrator.js'
import { useMusic } from './audio/music.js'
import { useAudioLocked, useMusicSetting, useSoundSetting } from './audio/soundSetting.js'
import { HERO_COLORS } from './data/heroes.js'
import { PHASES } from './data/phases.js'
import { activeVillains, encounterCardsOutdated } from './state/game.js'
import { randomNumbers } from './state/random.js'
import { useCards } from './state/useCards.js'
import { FAMILY_GAME, useDeviceId, useGameChoice, useSeat, useSharedGame } from './state/useSharedGame.js'

const TABLE_SEAT = 'table'
const PROJECTOR_SEAT = 'projector'

function PartyBar({ state, dispatch, undo, undoDepth, seatLabel, onSwitchSeat, sound, boardSwitch }) {
  const [ask, dialog] = useConfirm()
  const newGame = () => ask(newGameQuestion(state), () => dispatch({ type: 'NEW_GAME' }))
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
        {state.tileStack && (
          <div className="flex items-center gap-2">
            <Button className="!px-2 !py-0" onClick={() => dispatch({ type: 'ADJUST_TILES', amount: -1 })}>−</Button>
            <TilesLeft state={state} className="text-lg" />
            <Button className="!px-2 !py-0" onClick={() => dispatch({ type: 'ADJUST_TILES', amount: 1 })}>+</Button>
          </div>
        )}
        <AreaName state={state} className="font-semibold" />
        <div className="ml-auto flex flex-wrap gap-2">
          <UndoButton undo={undo} depth={undoDepth} dispatch={dispatch} className="max-w-56 truncate" />
          <SoundToggle on={sound.on} setOn={sound.setOn} elsewhere={sound.elsewhere} className="text-sm" />
          <MusicToggle on={sound.musicOn} setOn={sound.setMusicOn} soundOn={sound.on} className="text-sm" />
          {boardSwitch && <BoardSwitch state={state} dispatch={dispatch} className="text-sm" />}
          <Button variant="ghost" className="text-sm" onClick={onSwitchSeat}>
            {seatLabel} · switch
          </Button>
          <Button variant="ghost" className="text-sm" onClick={() => dispatch({ type: 'END_GAME', result: 'won' })}>
            We won!
          </Button>
          <Button
            variant="ghost"
            className="text-sm"
            onClick={() => ask(LOST_QUESTION, () => dispatch({ type: 'END_GAME', result: 'lost' }))}
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
      {dialog}
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
      {/* On the virtual board only the active hero's iPad moves figures (or a power's move
          that's waiting on someone), so nobody moves a hero by mistake while watching. */}
      <Board state={state} dispatch={dispatch} readOnly={!myTurn && !state.turn.boardMove} />
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
        showCardArt
      />
      <VillainList state={state} dispatch={dispatch} />
      <MonsterList state={state} dispatch={dispatch} ownerId={hero.id} />
      <PartyStrip heroes={state.heroes} exceptId={hero.id} />
      <GameLog log={state.log} />
      <TreasureStep state={state} dispatch={dispatch} heroId={hero.id} />
    </div>
  )
}

// The solo game's top bar: one short line on a phone (undo, XP, surges, tiles) and a ☰ menu
// with everything else, so the board and the turn get the screen.
function SoloBar({ state, dispatch, undo, undoDepth, onSwitchSeat, sound }) {
  const [open, setOpen] = useState(false)
  const [ask, dialog] = useConfirm()
  const newGame = () => ask(newGameQuestion(state), () => dispatch({ type: 'NEW_GAME' }))
  const stepper = (label, type, value) => (
    <div className="flex items-center gap-2">
      <span className="w-28 text-zinc-400">{label}</span>
      <Button className="!px-3 !py-1" onClick={() => dispatch({ type, amount: -1 })}>−</Button>
      <span className="w-14 text-center text-lg font-bold text-amber-400">{value}</span>
      <Button className="!px-3 !py-1" onClick={() => dispatch({ type, amount: 1 })}>+</Button>
    </div>
  )
  return (
    <header className="relative z-50 shrink-0 border-b border-zinc-800 bg-zinc-950/95">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <UndoButton undo={undo} depth={undoDepth} dispatch={dispatch} className="min-w-0 flex-1 truncate !px-2 text-left" />
        <span className="whitespace-nowrap text-sm text-zinc-300">
          <b className="text-amber-400">{state.xp}</b> XP
        </span>
        <span className={`whitespace-nowrap text-sm ${state.surges === 0 ? 'text-red-400' : 'text-emerald-400'}`} title="Healing surges">
          {state.surges === 0 ? '0 ❤' : '❤'.repeat(state.surges)}
        </span>
        {state.tileStack && <TilesLeft state={state} className="whitespace-nowrap text-sm" />}
        <Button variant={open ? 'gold' : 'default'} className="!px-3 !py-1" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}>
          ☰
        </Button>
      </div>
      {state.surges === 0 && (
        <p className="bg-red-950 px-3 py-0.5 text-center text-xs font-semibold text-red-300">No healing surges left! A hero starting a turn at 0 HP loses the game.</p>
      )}
      {open && (
        <div className="absolute inset-x-0 top-full max-h-[80dvh] space-y-3 overflow-y-auto border-b border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
          <AreaName state={state} className="font-semibold" />
          {stepper('XP', 'ADJUST_XP', state.xp)}
          {stepper('Healing surges', 'ADJUST_SURGES', state.surges)}
          {state.tileStack && stepper('Tiles left', 'ADJUST_TILES', state.tileStack.stack.length)}
          <div className="flex flex-wrap gap-2">
            <SoundToggle on={sound.on} setOn={sound.setOn} elsewhere={sound.elsewhere} className="text-sm" />
            <MusicToggle on={sound.musicOn} setOn={sound.setMusicOn} soundOn={sound.on} className="text-sm" />
            <BoardSwitch state={state} dispatch={dispatch} className="text-sm" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="text-sm" onClick={() => dispatch({ type: 'END_GAME', result: 'won' })}>We won!</Button>
            <Button
              className="text-sm"
              onClick={() => ask(LOST_QUESTION, () => dispatch({ type: 'END_GAME', result: 'lost' }))}
            >
              We lost
            </Button>
            <Button className="text-sm" onClick={newGame}>New game</Button>
            <Button variant="ghost" className="text-sm" onClick={onSwitchSeat}>Table · switch</Button>
          </div>
          <Button variant="gold" className="w-full" onClick={() => setOpen(false)}>Back to the game</Button>
        </div>
      )}
      {dialog}
    </header>
  )
}

// A solo game on the virtual board, built for a phone: the board always on screen and the
// rest in tabs under it (beside it on a wide or unfolded screen). The Turn tab comes back by
// itself whenever the phase or the hero changes.
function SoloView({ state, dispatch, soundBoard }) {
  const active = state.heroes[state.turn.heroIndex]
  const [tab, setTab] = useState('turn')
  const [bigBoard, setBigBoard] = useState(false)
  useEffect(() => setTab('turn'), [state.turn.heroIndex, state.turn.phase])
  const heroCard = (hero) => (
    <HeroCard
      key={hero.id}
      state={state}
      hero={hero}
      isActive={hero.id === active?.id}
      xp={state.xp}
      surges={state.surges}
      dispatch={dispatch}
      powersInTurnGuide={hero.id === active?.id && PHASES[state.turn.phase].key === 'hero'}
      natural20={state.turn.natural20 === hero.id}
    />
  )
  const monsterCount = state.monsters.length + activeVillains(state).length
  const tabs = [
    ['turn', '⚔️', 'Turn'],
    ...(state.heroes.length > 1 ? [['party', '🛡️', 'Party']] : []),
    ['monsters', '👹', monsterCount ? `Monsters (${monsterCount})` : 'Monsters'],
    ...(state.adventure ? [['adventure', '📜', 'Quest']] : []),
    ['log', '📖', 'Log'],
  ]
  const body = {
    turn: (
      <>
        <TurnGuide state={state} dispatch={dispatch} />
        {active && heroCard(active)}
      </>
    ),
    party: <div className="grid gap-3">{state.heroes.map(heroCard)}</div>,
    monsters: (
      <>
        <VillainList state={state} dispatch={dispatch} canPlace />
        <MonsterList state={state} dispatch={dispatch} />
        {monsterCount === 0 && <p className="text-zinc-400">No monsters on the board.</p>}
      </>
    ),
    adventure: <AdventurePanel state={state} dispatch={dispatch} />,
    log: state.log.length ? <GameLog log={state.log} /> : <p className="text-zinc-400">Nothing has happened yet.</p>,
  }[tab] ?? null
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <div className={`relative shrink-0 p-1.5 md:h-auto md:min-w-0 md:flex-1 ${bigBoard ? 'h-[68%]' : 'h-[42%]'}`}>
        {soundBoard}
        <Board
          state={state}
          dispatch={dispatch}
          fill
          extraButtons={
            <Button className="!px-2 !py-1 text-sm md:hidden" onClick={() => setBigBoard(!bigBoard)} aria-label={bigBoard ? 'Smaller board' : 'Bigger board'}>
              {bigBoard ? '⤒' : '⤓'}
            </Button>
          }
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col border-zinc-800 md:w-[26rem] md:flex-none md:border-l lg:w-[32rem]">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2">{body}</div>
        <nav className="flex shrink-0 border-t border-zinc-800 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)]">
          {tabs.map(([id, emoji, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex flex-1 flex-col items-center py-1.5 text-xs ${tab === id ? 'bg-zinc-800 font-bold text-amber-400' : 'text-zinc-400'}`}
            >
              <span className="text-lg leading-none">{emoji}</span>
              {label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}

function TableView({ state, dispatch }) {
  return (
    <div className="mx-auto max-w-6xl space-y-8 p-4">
      <TurnGuide state={state} dispatch={dispatch} />
      {/* On the virtual board only the active hero's iPad moves figures (or a power's move
          that's waiting on someone), so nobody moves a hero by mistake while watching. */}
      <Board state={state} dispatch={dispatch} readOnly={!myTurn && !state.turn.boardMove} />
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
  // Which game this screen is in (null until it picks one), and whether the "Which game?" list is open.
  const [chosenGame, setGame] = useGameChoice()
  const [picking, setPicking] = useState(false)
  const gameId = chosenGame ?? FAMILY_GAME
  const [seat, setSeat] = useSeat(gameId)
  const { state, connected, dispatch, undo, undoDepth, instance, screens, game, gamesVersion, changeGames, startGame } = useSharedGame(seat, gameId, setGame)
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

  const projectorOpen = screens.includes(PROJECTOR_SEAT)
  const [soundOn, setSoundOn] = useSoundSetting(seat, projectorOpen)
  const [musicOn, setMusicOn] = useMusicSetting(seat)
  // Every screen can play the sound; until someone flips its switch, only the projector
  // does (or the table, in a game without one).
  const sound = { on: soundOn, setOn: setSoundOn, musicOn, setMusicOn, elsewhere: !soundOn && projectorOpen && seat !== PROJECTOR_SEAT }
  useSoundEffects(soundOn)
  useMusic(state, soundOn && musicOn)
  const narrator = useNarrator(soundOn)
  const soundLocked = useAudioLocked(soundOn) || narrator.blocked
  const [showIntro, finishIntro] = useIntro()

  if (showIntro) return <DragonIntro projector={seat === PROJECTOR_SEAT} say={narrator.say} onDone={finishIntro} />

  const gameBar = <GameBar name={game?.name} onSwitch={() => setPicking(true)} />
  if (!chosenGame || picking) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        {instance && (
          <p className="bg-fuchsia-700 px-4 py-1 text-center text-sm font-bold uppercase tracking-widest text-white">
            {instance} · not your real game
          </p>
        )}
        <GamePicker
          current={chosenGame}
          onPick={(id) => {
            setGame(id)
            setPicking(false)
          }}
          onClose={chosenGame ? () => setPicking(false) : null}
          startGame={startGame}
          changeGames={changeGames}
          gamesVersion={gamesVersion}
        />
      </main>
    )
  }
  if (!state) return <Connecting />

  const banners = (
    <>
      {gameBar}
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
          onSolo={() => setSeat(TABLE_SEAT)}
        />
      </main>
    )
  }

  const myHero = state.heroes.find((h) => h.key === seat)
  if (seat === PROJECTOR_SEAT) {
    return (
      <main className="isolate min-h-screen bg-zinc-950 text-zinc-100">
        <AreaBackdrop state={state} />
        {banners}
        <ProjectorView state={state} dispatch={dispatch} onSwitchSeat={() => setSeat(null)} sound={sound} />
        <BoardToast state={state} big />
        <FirstRoll state={state} dispatch={dispatch} big />
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

  const overlays = (
    <>
      <FirstRoll state={state} dispatch={dispatch} heroId={myHero?.id ?? null} />
      <MomentOverlay moment={state.moment} heroes={state.heroes} />
      <TapForSound locked={soundLocked} ipad={Boolean(myHero)} />
      {(myHero || !state.board) && <SoundBoard state={state} dispatch={dispatch} who={myHero ? myHero.id : 'table'} testCopy={Boolean(instance)} />}
      {!myHero && <BoardToast state={state} />}
      {(state.status === 'won' || state.status === 'lost') && <Recap state={state} dispatch={dispatch} />}
    </>
  )
  // Solo on the virtual board: the whole game fits the screen, nothing scrolls but the tabs.
  if (!myHero && state.board) {
    return (
      <main className="isolate flex h-dvh flex-col overflow-hidden bg-zinc-950 text-zinc-100">
        <AreaBackdrop state={state} />
        {banners}
        <SoloBar state={state} dispatch={dispatch} undo={undo} undoDepth={undoDepth} onSwitchSeat={() => setSeat(null)} sound={sound} />
        <SoloView
          state={state}
          dispatch={dispatch}
          soundBoard={<SoundBoard state={state} dispatch={dispatch} who="table" testCopy={Boolean(instance)} className="absolute bottom-3 left-3" />}
        />
        <TreasureStep state={state} dispatch={dispatch} />
        {overlays}
      </main>
    )
  }

  return (
    <main className="isolate min-h-screen bg-zinc-950 text-zinc-100">
      <AreaBackdrop state={state} />
      {banners}
      <PartyBar
        undo={undo}
        undoDepth={undoDepth}
        state={state}
        dispatch={dispatch}
        seatLabel={myHero ? myHero.name : 'Table'}
        onSwitchSeat={() => setSeat(null)}
        sound={sound}
        boardSwitch={!myHero}
      />
      {myHero ? <HeroView state={state} dispatch={dispatch} hero={myHero} /> : <TableView state={state} dispatch={dispatch} />}
      {overlays}
    </main>
  )
}
