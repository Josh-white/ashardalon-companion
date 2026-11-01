import { useEffect, useRef, useState } from 'react'
import { AdventurePanel } from './components/Adventure.jsx'
import ArtScreen from './components/ArtScreen.jsx'
import { AreaBackdrop } from './components/AreaBackdrop.jsx'
import HeroCard from './components/HeroCard.jsx'
import LobbyBackdrop from './components/LobbyBackdrop.jsx'
import DragonIntro, { useIntro } from './components/Intro.jsx'
import DungeonDoors, { useDoorsOpening } from './components/DungeonDoors.jsx'
import FirstRoll from './components/FirstRoll.jsx'
import CardReading from './components/CardReading.jsx'
import OpeningStory from './components/OpeningStory.jsx'
import GamePicker, { GameBar } from './components/GamePicker.jsx'
import { IdeaButton } from './components/IdeaBox.jsx'
import MomentOverlay, { useMomentsDone } from './components/MomentOverlay.jsx'
import MonsterList, { VillainList } from './components/MonsterList.jsx'
import ProjectorView from './components/ProjectorView.jsx'
import Recap from './components/Recap.jsx'
import Board from './components/Board.jsx'
import SeatPicker from './components/SeatPicker.jsx'
import SinceLastTurn from './components/SinceLastTurn.jsx'
import HeroCheatCard from './components/HeroCheatCard.jsx'
import Setup from './components/Setup.jsx'
import { TreasureStep } from './components/Treasure.jsx'
import TurnGuide, { ExtraAttacks } from './components/TurnGuide.jsx'
import UndoButton from './components/UndoButton.jsx'
import { TapForSound } from './components/SoundToggle.jsx'
import { BoardToast, SoundBoard } from './components/SoundBoard.jsx'
import { Button } from './components/ui.jsx'
import { useSoundEffects } from './audio/sfx.js'
import { useNarrator } from './audio/useNarrator.js'
import { useMusic } from './audio/music.js'
import { useAudioLocked, useMusicSetting, useSoundSetting } from './audio/soundSetting.js'
import { PHASES } from './data/phases.js'
import { encounterCardsOutdated } from './state/game.js'
import { shuffleNumbers } from './state/random.js'
import { useCards } from './state/useCards.js'
import { useStayAwake, useStayAwakeSetting } from './state/stayAwake.js'
import AllyPanel from './ally/AllyPanel.jsx'
import { allyHostSeat } from './ally/brain.js'
import { AllyToggle, AllyWatch, GameLog, monsterTotal, PartyGlance, PartyStrip, TabBar, usePlayTabs, WaitingBanner } from './components/PartyPanels.jsx'
import { PartyBar, SoloBar } from './components/TopBars.jsx'
import { useMe } from './state/useMe.js'
import { FAMILY_GAME, serverNow, useDeviceId, useGameChoice, useScreenRole, useSeat, useSharedGame } from './state/useSharedGame.js'

const TABLE_SEAT = 'table'
const PROJECTOR_SEAT = 'projector'

// A game in play on any screen but the big one: the tabs at the bottom (Turn, Monsters, Party,
// Quest, Log, the same everywhere) and, on the virtual board, the board always in view above
// them (beside them on a wide or unfolded screen). `hero` is this iPad's hero; without one
// it's the table screen, which plays every hero.
function PlayView({ state, dispatch, hero = null, soundBoard = null, allyHost = false }) {
  const active = state.heroes[state.turn.heroIndex]
  // The computer plays this turn (src/ally/). The screen that plays it shows its turn; the
  // others show what it's doing, and its turn too when someone has to help or paused it.
  const allyTurn = Boolean(active?.ally)
  const helping = allyTurn && Boolean(state.allyPaused || state.turn.allyHelp)
  const myTurn = hero ? hero.id === active?.id && !allyTurn : true
  const [tab, setTab, badges, resetKey] = usePlayTabs(state, hero?.id ?? null, myTurn)
  // The turn column jumps back to the top when the Turn tab does (a new phase, your turn
  // starting or ending), and only then, so it never jumps while someone is reading.
  const scrollRef = useRef(null)
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [resetKey])
  const [bigBoard, setBigBoard] = useState(false)
  const heroCard = (h, showCardArt = false) => (
    <HeroCard
      key={h.id}
      state={state}
      hero={h}
      isActive={h.id === active?.id}
      xp={state.xp}
      surges={state.surges}
      dispatch={dispatch}
      // During the Hero Phase the attack box lists the attack powers, so the hero card doesn't repeat them.
      powersInTurnGuide={h.id === active?.id && PHASES[state.turn.phase].key === 'hero'}
      natural20={state.turn.natural20 === h.id}
      showCardArt={showCardArt}
      // Beside the virtual board the column is phone-narrow, even on an unfolded phone or an iPad.
      compact={Boolean(state.board)}
    />
  )
  const monsters = monsterTotal(state)
  const tabs = [
    ['turn', '⚔️', hero && myTurn ? 'My turn' : 'Turn', badges.turn],
    ['monsters', '👹', monsters ? `Monsters (${monsters})` : 'Monsters', badges.monsters],
    ...(state.heroes.length > 1 ? [['party', '🛡️', 'Party']] : []),
    ...(state.adventure ? [['adventure', '📜', 'Quest']] : []),
    ['log', '📖', 'Log'],
  ]
  const shown = tabs.some(([id]) => id === tab) ? tab : 'turn'
  const body = {
    turn: hero ? (
      <>
        {myTurn && <SinceLastTurn state={state} hero={hero} />}
        {allyTurn && (allyHost || helping) ? (
          <AllyPanel state={state} dispatch={dispatch} drive={allyHost} treasure />
        ) : myTurn ? (
          <TurnGuide state={state} dispatch={dispatch} />
        ) : (
          <>
            <WaitingBanner state={state} />
            {allyTurn && <AllyWatch state={state} dispatch={dispatch} />}
          </>
        )}
        {/* Cause Fear gives other heroes an attack during someone else's turn. */}
        {!myTurn && <ExtraAttacks state={state} dispatch={dispatch} onlyHeroId={hero.id} />}
        <AllyToggle state={state} dispatch={dispatch} hero={hero} />
        {heroCard(hero, true)}
        <HeroCheatCard hero={hero} />
      </>
    ) : (
      <>
        {allyTurn ? <AllyPanel state={state} dispatch={dispatch} drive={allyHost} /> : <TurnGuide state={state} dispatch={dispatch} />}
        <AllyToggle state={state} dispatch={dispatch} hero={active} />
        {active && heroCard(active)}
        {active && <HeroCheatCard key={`cheat-${active.id}`} hero={active} />}
      </>
    ),
    monsters: (
      <>
        <VillainList state={state} dispatch={dispatch} canPlace={!hero} glance={Boolean(state.board)} />
        <MonsterList state={state} dispatch={dispatch} ownerId={hero?.id} glance={Boolean(state.board)} />
      </>
    ),
    party: hero ? (
      <PartyStrip state={state} meId={hero.id} activeId={active?.id} />
    ) : state.board ? (
      <PartyGlance state={state} dispatch={dispatch} activeId={active?.id} heroCard={heroCard} />
    ) : (
      <div className="grid gap-3 md:grid-cols-2">{state.heroes.map((h) => heroCard(h))}</div>
    ),
    adventure: <AdventurePanel state={state} dispatch={dispatch} full />,
    log: state.log.length ? <GameLog log={state.log} /> : <p className="text-zinc-400">Nothing has happened yet.</p>,
  }[shown]
  const tabBar = <TabBar tabs={tabs} tab={shown} setTab={setTab} className="shrink-0" />
  const treasure = <TreasureStep state={state} dispatch={dispatch} heroId={hero?.id ?? null} />

  if (!state.board) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className={`mx-auto space-y-6 p-4 pb-20 ${hero ? 'max-w-3xl' : 'max-w-6xl'}`}>{body}</div>
        </div>
        {tabBar}
        {treasure}
      </div>
    )
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <div className={`relative shrink-0 p-1.5 md:h-auto md:min-w-0 md:flex-1 ${bigBoard ? 'h-[68%]' : 'h-[42%]'}`}>
        {soundBoard}
        {/* Only the active hero's iPad moves figures (or a power's move that's waiting on
            someone), so nobody moves a hero by mistake while watching. */}
        <Board
          state={state}
          dispatch={dispatch}
          fill
          calm
          readOnly={Boolean(hero) && !myTurn && !state.turn.boardMove && !helping}
          extraButtons={
            <Button className="min-h-10 min-w-10 !px-2 !py-1 text-sm md:hidden" onClick={() => setBigBoard(!bigBoard)} aria-label={bigBoard ? 'Smaller board' : 'Bigger board'}>
              {bigBoard ? '⤒' : '⤓'}
            </Button>
          }
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col border-zinc-800 md:w-[26rem] md:flex-none md:border-l lg:w-[32rem]">
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2 pb-4">{body}</div>
        {tabBar}
      </div>
      {treasure}
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

function linkedGame() {
  try {
    const id = new URLSearchParams(window.location.search).get('game')
    return id && /^[a-z0-9-]{1,60}$/.test(id) ? id : null
  } catch {
    return null
  }
}

export default function App() {
  // Which game this screen is in (null until it picks one), and whether the "Which game?" list is open.
  const [chosenGame, setGame] = useGameChoice()
  const [picking, setPicking] = useState(false)
  // A link to a game (?game=, sent by the friend who made it) opens that game. If this
  // screen may not play in it, the Pi says so and "Which game?" shows instead.
  useEffect(() => {
    const linked = linkedGame()
    if (!linked) return
    setGame(linked)
    try {
      window.history.replaceState(null, '', window.location.pathname + window.location.hash)
    } catch {
      // Old browser: the link stays in the address bar, which is harmless.
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const gameId = chosenGame ?? FAMILY_GAME
  const [seat, setSeat] = useSeat(gameId)
  const [screenRole, setScreenRole] = useScreenRole(gameId)
  const { state, connected, dispatch, undo, undoDepth, instance, screens, game, gamesVersion, changeGames, startGame } = useSharedGame(seat, gameId, setGame)
  const deviceId = useDeviceId()
  // A friend playing from outside the house (server/access.js) can't change the family's card photos.
  const me = useMe()
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
  const [soundOn, setSoundOn] = useSoundSetting(seat, projectorOpen, { friend: me.friend, tableOpen: screens.includes(TABLE_SEAT) })
  const [musicOn, setMusicOn] = useMusicSetting(seat)
  // Every screen can play the sound; until someone flips its switch, only the projector
  // does (or the table, in a game without one).
  const sound = { on: soundOn, setOn: setSoundOn, musicOn, setMusicOn, elsewhere: !soundOn && projectorOpen && seat !== PROJECTOR_SEAT }
  useSoundEffects(soundOn)
  const [showIntro, finishIntro] = useIntro()
  // The big screen plays music in the lobby too, once the intro is over.
  useMusic(state, soundOn && musicOn, { lobby: !showIntro && seat === PROJECTOR_SEAT })
  // The screen reading the opening story, or cheering the roll for first turn, tells the
  // others when it starts and ends, so they wait for it.
  const narrator = useNarrator(soundOn, {
    onHold: (hold, event) =>
      dispatch({ type: hold === 'opening' ? (event === 'start' ? 'OPENING_NARRATING' : 'OPENING_QUIET') : event === 'start' ? 'FIRST_ROLL_NARRATING' : 'FIRST_ROLL_QUIET' }),
    // A hero reading a card here shows on every screen, with Skip.
    onReading: (line) => dispatch({ type: 'CARD_READING', on: Boolean(line), heroId: line?.heroId ?? null, at: serverNow() }),
  })
  const soundLocked = useAudioLocked(soundOn) || narrator.blocked
  const doorsAt = useDoorsOpening()
  // Phones, iPads and the projector stay awake while a game is open, like during a video.
  const [stayAwake] = useStayAwakeSetting()
  useStayAwake(stayAwake && Boolean(chosenGame))
  // The end screen waits for the last roll and its attack animation to finish (an Arc
  // Lightning that wins the game rolls several dice), so it never shows up under them.
  const momentsDone = useMomentsDone(state?.moment)
  const over = state?.status === 'won' || state?.status === 'lost'
  const ended = over && momentsDone
  // Meanwhile the game underneath can't be tapped: it's over.
  const endHold = over && !momentsDone && <div data-end-hold className="fixed inset-0 z-[39]" aria-hidden="true" />

  if (showIntro) return <DragonIntro projector={seat === PROJECTOR_SEAT} say={narrator.say} quiet={narrator.quiet} onDone={finishIntro} />

  // The 💡 button sits on the game bar of every screen but the big one, which nobody taps.
  const myName = (state?.heroes.find((h) => h.key === seat)?.player || state?.lobby?.find((c) => c.deviceId === deviceId)?.player || '').trim()
  const ideaButton = seat === PROJECTOR_SEAT ? null : <IdeaButton state={state} me={myName} className="my-1 rounded-full bg-amber-500/15 px-3 !py-0.5 font-semibold" />
  const gameBar = <GameBar name={game?.name} onSwitch={() => setPicking(true)} idea={ideaButton} />
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
      <main className="isolate min-h-screen bg-zinc-950 text-zinc-100">
        <LobbyBackdrop />
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
            dispatch({ type: 'START_DEMO', picks, monsterCards, treasureCards, random: shuffleNumbers() })
          }
          watchOnly={seat === PROJECTOR_SEAT}
          onProjector={() => setSeat(PROJECTOR_SEAT)}
          onLeaveProjector={() => setSeat(null)}
          onArt={me.friend ? null : () => setArtOpen(true)}
          onSolo={() => setSeat(TABLE_SEAT)}
          // An iPad that played a hero before is a hero screen; it isn't asked again.
          role={screenRole ?? (seat && seat !== TABLE_SEAT && seat !== PROJECTOR_SEAT ? 'hero' : null)}
          setRole={setScreenRole}
          projectorOpen={projectorOpen}
          voice={narrator}
          friend={me.friend}
        />
      </main>
    )
  }

  const myHero = state.heroes.find((h) => h.key === seat)
  // The one open screen that plays the computer allies' turns.
  const allyHost = Boolean(seat) && allyHostSeat(screens) === seat
  if (seat === PROJECTOR_SEAT) {
    return (
      <main className="isolate min-h-screen bg-zinc-950 text-zinc-100">
        <AreaBackdrop state={state} />
        {banners}
        <ProjectorView state={state} dispatch={dispatch} onSwitchSeat={() => setSeat(null)} sound={sound} allyHost={allyHost} />
        <BoardToast state={state} big />
        <OpeningStory state={state} dispatch={dispatch} big />
        <FirstRoll state={state} dispatch={dispatch} big />
        <MomentOverlay moment={state.moment} heroes={state.heroes} big />
        <CardReading state={state} dispatch={dispatch} big />
        <TapForSound locked={soundLocked} big />
        <DungeonDoors at={doorsAt} />
        {endHold}
        {ended && <Recap state={state} big />}
      </main>
    )
  }
  if (seat !== TABLE_SEAT && !myHero) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        {banners}
        <SeatPicker heroes={state.heroes} onPick={setSeat} tableSeat={TABLE_SEAT} projectorSeat={PROJECTOR_SEAT} onArt={me.friend ? null : () => setArtOpen(true)} state={state} dispatch={dispatch} deviceId={deviceId} />
      </main>
    )
  }

  const overlays = (
    <>
      <OpeningStory state={state} dispatch={dispatch} />
      <FirstRoll state={state} dispatch={dispatch} heroId={myHero?.id ?? null} screens={screens} />
      <MomentOverlay moment={state.moment} heroes={state.heroes} />
      <CardReading state={state} dispatch={dispatch} />
      <TapForSound locked={soundLocked} ipad={Boolean(myHero)} />
      <DungeonDoors at={doorsAt} />
      {/* On the real board it sits above the tabs; on the virtual board, in the board's corner. */}
      {!state.board && <SoundBoard state={state} dispatch={dispatch} who={myHero ? myHero.id : 'table'} testCopy={Boolean(instance)} className="fixed bottom-20 left-4" />}
      {!myHero && <BoardToast state={state} />}
      {endHold}
    </>
  )
  // The whole game fits the screen and nothing scrolls but the tab that's open. A hero's iPad
  // and a solo game get the one-line top bar; the table screen on the real board, often a
  // laptop, keeps the full one.
  const who = myHero ? myHero.id : 'table'
  return (
    <main className="isolate flex h-dvh flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <AreaBackdrop state={state} />
      {banners}
      {myHero || state.board ? (
        <SoloBar
          state={state}
          dispatch={dispatch}
          undo={undo}
          undoDepth={undoDepth}
          onSwitchSeat={() => setSeat(null)}
          sound={sound}
          seatLabel={myHero ? myHero.name : 'Table'}
          boardSwitch={!myHero}
        />
      ) : (
        <PartyBar undo={undo} undoDepth={undoDepth} state={state} dispatch={dispatch} seatLabel="Table" onSwitchSeat={() => setSeat(null)} sound={sound} boardSwitch />
      )}
      {/* The end-of-game recap covers the play area only, so it starts right under the top
          bars (Undo and the menu stay reachable) instead of hiding the game bar behind it. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <PlayView
          state={state}
          dispatch={dispatch}
          allyHost={allyHost}
          hero={myHero ?? null}
          soundBoard={<SoundBoard state={state} dispatch={dispatch} who={who} testCopy={Boolean(instance)} className="absolute bottom-3 left-3" />}
        />
        {ended && (
          <Recap
            state={state}
            dispatch={dispatch}
            contained
            onFinish={game && game.id !== FAMILY_GAME ? { name: game.name, finish: () => changeGames({ type: 'finish-game', id: game.id }) } : null}
          />
        )}
      </div>
      {overlays}
    </main>
  )
}
