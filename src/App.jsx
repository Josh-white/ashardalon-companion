import { useEffect, useState } from 'react'
import { AdventurePanel } from './components/Adventure.jsx'
import Art from './components/Art.jsx'
import ArtScreen from './components/ArtScreen.jsx'
import { AreaBackdrop, AreaName } from './components/AreaBackdrop.jsx'
import HeroCard from './components/HeroCard.jsx'
import LobbyBackdrop from './components/LobbyBackdrop.jsx'
import DragonIntro, { useIntro } from './components/Intro.jsx'
import DungeonDoors, { useDoorsOpening } from './components/DungeonDoors.jsx'
import FirstRoll from './components/FirstRoll.jsx'
import OpeningStory from './components/OpeningStory.jsx'
import GamePicker, { GameBar } from './components/GamePicker.jsx'
import MomentOverlay from './components/MomentOverlay.jsx'
import MonsterList, { VillainList } from './components/MonsterList.jsx'
import ProjectorView from './components/ProjectorView.jsx'
import Recap, { LOST_QUESTION, newGameQuestion } from './components/Recap.jsx'
import Board from './components/Board.jsx'
import SeatPicker from './components/SeatPicker.jsx'
import SinceLastTurn from './components/SinceLastTurn.jsx'
import HeroCheatCard from './components/HeroCheatCard.jsx'
import { BoostBadges } from './components/StatBoosts.jsx'
import { acParts, attackParts, speedParts } from './data/statParts.js'
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
import { heroAc } from './data/powerEffects.js'
import { moveSpeed } from './board/play.js'
import { PHASES } from './data/phases.js'
import { activeVillains, encounterCardsOutdated } from './state/game.js'
import { shuffleNumbers } from './state/random.js'
import { useCards } from './state/useCards.js'
import { FAMILY_GAME, useDeviceId, useGameChoice, useScreenRole, useSeat, useSharedGame } from './state/useSharedGame.js'

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

// Every hero in the party at a glance, yours marked, whoever's turn it is ringed.
function PartyStrip({ heroes, meId, activeId }) {
  return (
    <section>
      <h2 className="mb-2 font-display text-xl font-bold text-zinc-300">Your party</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {heroes.map((hero) => (
          <div key={hero.id} className={`rounded-xl p-3 ${HERO_COLORS[hero.color].bg} ${hero.id === activeId ? 'ring-2 ring-amber-400' : ''}`}>
            <div className="flex items-center gap-2">
              <Art name={heroArt(hero.key)} className="w-10 shrink-0" />
              <span className="min-w-0">
                <span className={`block font-display text-lg leading-tight font-bold ${HERO_COLORS[hero.color].text}`}>{hero.name}</span>
                {(hero.id === meId || hero.id === activeId) && (
                  <span className="block text-sm text-zinc-300">
                    {hero.id === meId && 'You'}
                    {hero.id === meId && hero.id === activeId && ' · '}
                    {hero.id === activeId && <span className="text-amber-300">Turn now</span>}
                  </span>
                )}
              </span>
            </div>
            {/* HP big on its own line, so it reads at a glance on a phone. */}
            <div className="mt-2 flex items-center gap-3">
              <span className={`shrink-0 text-2xl font-bold whitespace-nowrap ${hero.hp === 0 ? 'text-red-400' : 'text-zinc-100'}`}>
                {hero.hp}
                <span className="text-base font-normal text-zinc-400"> / {hero.maxHp} HP</span>
              </span>
              <div className="min-w-0 flex-1">
                <HpBar hp={hero.hp} maxHp={hero.maxHp} />
              </div>
            </div>
            <p className="mt-1 text-sm text-zinc-300">
              AC {heroAc(hero)} · Speed {moveSpeed(hero)}
            </p>
            <BoostBadges hero={hero} heroes={heroes} className="mt-1.5" />
            {(hero.items ?? []).length > 0 && (
              <p className="mt-1 text-sm text-yellow-300">💰 {hero.items.map((i) => (i.used ? `${i.name} (used)` : i.name)).join(', ')}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

// The Party tab beside the virtual board: every hero on one short row (HP you can change,
// AC, speed, attack, conditions), so the whole party fits at a glance. Tap a row for that
// hero's full card.
function PartyGlance({ state, dispatch, activeId, heroCard }) {
  const [openId, setOpenId] = useState(null)
  const stat = (label, value, change) => (
    <span className="whitespace-nowrap">
      <span className="text-zinc-400">{label}</span>{' '}
      <b className={change < 0 ? 'text-orange-300' : change > 0 ? 'text-sky-300' : 'text-zinc-100'}>
        {value}
        {change < 0 ? '▼' : change > 0 ? '▲' : ''}
      </b>
    </span>
  )
  return (
    <div className="space-y-2">
      {state.heroes.map((hero) => {
        const color = HERO_COLORS[hero.color]
        const ac = acParts(hero, state.heroes).total
        const speed = speedParts(hero).total
        const attack = attackParts(hero).total
        const open = openId === hero.id
        return (
          <div key={hero.id}>
            <div className={`rounded-xl p-2 ${color.bg} ${hero.id === activeId ? 'ring-2 ring-amber-400' : ''} ${hero.hp === 0 ? 'opacity-80' : ''}`}>
              <div className="flex items-center gap-2">
                <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open} onClick={() => setOpenId(open ? null : hero.id)}>
                  <Art name={heroArt(hero.key)} className={`w-10 shrink-0 ${hero.hp === 0 ? 'grayscale' : ''}`} />
                  <span className="min-w-0">
                    <span className={`block truncate font-display text-lg leading-tight font-bold ${color.text}`}>
                      {hero.name}
                      {hero.id === activeId && <span className="ml-1.5 font-sans text-xs font-normal text-amber-300">turn now</span>}
                    </span>
                    <span className="flex gap-2 text-sm">
                      {stat('AC', ac, ac - hero.ac)}
                      {stat('Spd', speed, speed - (hero.speed ?? 6))}
                      {stat('Atk', attack >= 0 ? `+${attack}` : `−${-attack}`, attack)}
                    </span>
                  </span>
                  <span className="ml-auto shrink-0 text-zinc-500">{open ? '▴' : '▾'}</span>
                </button>
                <Button className="h-10 w-10 shrink-0 !px-0 text-xl" aria-label={`${hero.name} loses 1 HP`} onClick={() => dispatch({ type: 'ADJUST_HP', heroId: hero.id, amount: -1 })}>
                  −
                </Button>
                <span className={`w-12 shrink-0 text-center text-xl font-bold whitespace-nowrap ${hero.hp === 0 ? 'text-red-400' : 'text-zinc-100'}`}>
                  {hero.hp}
                  <span className="text-sm font-normal text-zinc-500">/{hero.maxHp}</span>
                </span>
                <Button className="h-10 w-10 shrink-0 !px-0 text-xl" aria-label={`${hero.name} gains 1 HP`} onClick={() => dispatch({ type: 'ADJUST_HP', heroId: hero.id, amount: 1 })}>
                  +
                </Button>
              </div>
              <div className="mt-1.5">
                <HpBar hp={hero.hp} maxHp={hero.maxHp} />
              </div>
              {hero.conditions.length > 0 && <p className="mt-1 text-sm text-amber-400">{hero.conditions.join(', ')}</p>}
              <BoostBadges hero={hero} heroes={state.heroes} className="mt-1" badgeClass="px-2 py-0.5 text-xs" />
            </div>
            {open && <div className="mt-2">{heroCard(hero)}</div>}
          </div>
        )
      })}
    </div>
  )
}

// The row of tabs at the bottom of the screen: [id, emoji, label, badge] for each; a badge is a red dot.
function TabBar({ tabs, tab, setTab, className = '' }) {
  return (
    <nav className={`flex border-t border-zinc-800 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] ${className}`}>
      {tabs.map(([id, emoji, label, badge]) => (
        <button
          key={id}
          type="button"
          onClick={() => setTab(id)}
          className={`relative flex min-w-0 flex-1 flex-col items-center py-1.5 text-xs whitespace-nowrap sm:text-sm ${tab === id ? 'bg-zinc-800 font-bold text-amber-400' : 'text-zinc-400'}`}
        >
          <span className="text-lg leading-none sm:text-2xl">{emoji}</span>
          {label}
          {badge && <span aria-label="new" className="absolute top-1 right-[calc(50%-1.4rem)] h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-zinc-950" />}
        </button>
      ))}
    </nav>
  )
}

const monsterTotal = (state) => state.monsters.length + activeVillains(state).length

// Whether a big moment is about this hero: a monster's attack on them, their treasure, their
// encounter. On the table screen (no hero) every moment counts.
const momentFor = (moment, heroId) => Boolean(moment) && (!heroId || moment.heroId === heroId || (moment.rolls ?? []).some((r) => r.heroId === heroId))

// Which tab is open, and the red dots on the others. The Turn tab comes back by itself: on the
// table screen whenever the hero or the phase changes, on a hero's iPad at each phase of their
// own turn and when it ends, and whenever something happens to that hero (a monster's attack,
// treasure, a free attack from Cause Fear) so it isn't missed on another tab. A new monster
// (on a hero's iPad, one of theirs) puts a dot on Monsters until it's opened.
function usePlayTabs(state, heroId, myTurn) {
  const [tab, setTab] = useState('turn')
  const resetKey = heroId ? (myTurn ? `${state.turn.round}-${state.turn.phase}` : 'waiting') : `${state.turn.heroIndex}-${state.turn.phase}`
  useEffect(() => setTab('turn'), [resetKey])
  const momentId = momentFor(state.moment, heroId) ? state.moment.id : null
  useEffect(() => {
    if (momentId) setTab('turn')
  }, [momentId])
  const extraAttacks = (state.turn.bonusAttacks ?? []).filter((b) => !heroId || b.heroId === heroId).length
  useEffect(() => {
    if (extraAttacks > 0) setTab('turn')
  }, [extraAttacks])
  // A hero's iPad gets the dot for its own new monsters; the table, for any.
  const monsters = heroId ? state.monsters.filter((m) => m.ownerId === heroId).length : monsterTotal(state)
  const [seenMonsters, setSeenMonsters] = useState(monsters)
  useEffect(() => {
    if (tab === 'monsters' || monsters < seenMonsters) setSeenMonsters(monsters)
  }, [tab, monsters, seenMonsters])
  const badges = { turn: Boolean(heroId) && myTurn && tab !== 'turn', monsters: monsters > seenMonsters && tab !== 'monsters' }
  return [tab, setTab, badges]
}

// A game in play on any screen but the big one: the tabs at the bottom (Turn, Monsters, Party,
// Quest, Log, the same everywhere) and, on the virtual board, the board always in view above
// them (beside them on a wide or unfolded screen). `hero` is this iPad's hero; without one
// it's the table screen, which plays every hero.
function PlayView({ state, dispatch, hero = null, soundBoard = null }) {
  const active = state.heroes[state.turn.heroIndex]
  const myTurn = hero ? hero.id === active?.id : true
  const [tab, setTab, badges] = usePlayTabs(state, hero?.id ?? null, myTurn)
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
        {myTurn ? <TurnGuide state={state} dispatch={dispatch} /> : <WaitingBanner state={state} />}
        {/* Cause Fear gives other heroes an attack during someone else's turn. */}
        {!myTurn && <ExtraAttacks state={state} dispatch={dispatch} onlyHeroId={hero.id} />}
        {heroCard(hero, true)}
        <HeroCheatCard hero={hero} />
      </>
    ) : (
      <>
        <TurnGuide state={state} dispatch={dispatch} />
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
      <PartyStrip heroes={state.heroes} meId={hero.id} activeId={active?.id} />
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
        <div className="min-h-0 flex-1 overflow-y-auto">
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
          readOnly={Boolean(hero) && !myTurn && !state.turn.boardMove}
          extraButtons={
            <Button className="min-h-10 min-w-10 !px-2 !py-1 text-sm md:hidden" onClick={() => setBigBoard(!bigBoard)} aria-label={bigBoard ? 'Smaller board' : 'Bigger board'}>
              {bigBoard ? '⤒' : '⤓'}
            </Button>
          }
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col border-zinc-800 md:w-[26rem] md:flex-none md:border-l lg:w-[32rem]">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2 pb-4">{body}</div>
        {tabBar}
      </div>
      {treasure}
    </div>
  )
}

// The top bar on a hero's iPad and in a solo game: one short line on a phone (undo, XP, surges, tiles) and a ☰ menu
// with everything else, so the board and the turn get the screen.
function SoloBar({ state, dispatch, undo, undoDepth, onSwitchSeat, sound, seatLabel = 'Table', boardSwitch = true }) {
  const [open, setOpen] = useState(false)
  const [ask, dialog] = useConfirm()
  const newGame = () => ask(newGameQuestion(state), () => dispatch({ type: 'NEW_GAME' }))
  const stepper = (label, type, value) => (
    <div className="flex items-center gap-2">
      <span className="w-28 text-zinc-400">{label}</span>
      <Button className="min-h-10 min-w-10 !px-3 !py-1" onClick={() => dispatch({ type, amount: -1 })}>−</Button>
      <span className="w-14 text-center text-lg font-bold text-amber-400">{value}</span>
      <Button className="min-h-10 min-w-10 !px-3 !py-1" onClick={() => dispatch({ type, amount: 1 })}>+</Button>
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
        <Button variant={open ? 'gold' : 'default'} className="min-h-10 min-w-10 !px-3 !py-1" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}>
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
            {boardSwitch && <BoardSwitch state={state} dispatch={dispatch} className="text-sm" />}
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
            <Button variant="ghost" className="text-sm" onClick={onSwitchSeat}>{seatLabel} · switch</Button>
          </div>
          <Button variant="gold" className="w-full" onClick={() => setOpen(false)}>Back to the game</Button>
        </div>
      )}
      {dialog}
    </header>
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
  const [screenRole, setScreenRole] = useScreenRole(gameId)
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
  const [showIntro, finishIntro] = useIntro()
  // The big screen plays music in the lobby too, once the intro is over.
  useMusic(state, soundOn && musicOn, { lobby: !showIntro && seat === PROJECTOR_SEAT })
  // The screen reading the opening story, or cheering the roll for first turn, tells the
  // others when it starts and ends, so they wait for it.
  const narrator = useNarrator(soundOn, {
    onHold: (hold, event) =>
      dispatch({ type: hold === 'opening' ? (event === 'start' ? 'OPENING_NARRATING' : 'OPENING_QUIET') : event === 'start' ? 'FIRST_ROLL_NARRATING' : 'FIRST_ROLL_QUIET' }),
  })
  const soundLocked = useAudioLocked(soundOn) || narrator.blocked
  const doorsAt = useDoorsOpening()

  if (showIntro) return <DragonIntro projector={seat === PROJECTOR_SEAT} say={narrator.say} quiet={narrator.quiet} onDone={finishIntro} />

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
          onArt={() => setArtOpen(true)}
          onSolo={() => setSeat(TABLE_SEAT)}
          // An iPad that played a hero before is a hero screen; it isn't asked again.
          role={screenRole ?? (seat && seat !== TABLE_SEAT && seat !== PROJECTOR_SEAT ? 'hero' : null)}
          setRole={setScreenRole}
          projectorOpen={projectorOpen}
          voice={narrator}
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
        <OpeningStory state={state} dispatch={dispatch} big />
        <FirstRoll state={state} dispatch={dispatch} big />
        <MomentOverlay moment={state.moment} heroes={state.heroes} big />
        <TapForSound locked={soundLocked} big />
        <DungeonDoors at={doorsAt} />
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
      <OpeningStory state={state} dispatch={dispatch} />
      <FirstRoll state={state} dispatch={dispatch} heroId={myHero?.id ?? null} />
      <MomentOverlay moment={state.moment} heroes={state.heroes} />
      <TapForSound locked={soundLocked} ipad={Boolean(myHero)} />
      <DungeonDoors at={doorsAt} />
      {/* On the real board it sits above the tabs; on the virtual board, in the board's corner. */}
      {!state.board && <SoundBoard state={state} dispatch={dispatch} who={myHero ? myHero.id : 'table'} testCopy={Boolean(instance)} className="fixed bottom-20 left-4" />}
      {!myHero && <BoardToast state={state} />}
      {(state.status === 'won' || state.status === 'lost') && (
        <Recap
          state={state}
          dispatch={dispatch}
          onFinish={game && game.id !== FAMILY_GAME ? { name: game.name, finish: () => changeGames({ type: 'finish-game', id: game.id }) } : null}
        />
      )}
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
      <PlayView
        state={state}
        dispatch={dispatch}
        hero={myHero ?? null}
        soundBoard={<SoundBoard state={state} dispatch={dispatch} who={who} testCopy={Boolean(instance)} className="absolute bottom-3 left-3" />}
      />
      {overlays}
    </main>
  )
}
