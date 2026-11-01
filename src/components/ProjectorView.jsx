import { heroArt, monsterArt } from '../data/art.js'
import { HERO_COLORS } from '../data/heroes.js'
import { PHASES } from '../data/phases.js'
import { EnvironmentBanner } from './Encounters.jsx'
import { ProjectorTreasure } from './Treasure.jsx'
import { heroItems } from '../data/items.js'
import { BoostBadges } from './StatBoosts.jsx'
import { heroAc } from '../data/powerEffects.js'
import { moveSpeed } from '../board/play.js'
import { activeVillains } from '../state/game.js'
import { DifficultySwitch, ProjectorAdventure } from './Adventure.jsx'
import { TilesLeft } from './Tiles.jsx'
import Art from './Art.jsx'
import { AreaName } from './AreaBackdrop.jsx'
import { MusicToggle, SoundToggle } from './SoundToggle.jsx'
import { BoardSwitch } from './SoundBoard.jsx'
import { HpBar } from './ui.jsx'
import Board, { boardBounds } from './Board.jsx'
import { useLayoutEffect, useRef, useState } from 'react'
import AllyPanel from '../ally/AllyPanel.jsx'

// A read-only screen for the projector: big enough to read across the room,
// with no buttons to tap. Everything changes from the players' iPads.
export default function ProjectorView(props) {
  const { state, dispatch, allyHost } = props
  // The big screen plays the computer allies when it's open: their turn screen sits out of sight.
  const ally = allyHost && state.heroes[state.turn.heroIndex]?.ally && <AllyPanel state={state} dispatch={dispatch} drive hidden treasure />
  // On the virtual board the screen is split and each side fits itself (FitToBox).
  if (state.board) {
    return (
      <>
        <ProjectorScreen {...props} />
        {ally}
      </>
    )
  }
  return (
    <FitToScreen>
      <ProjectorScreen {...props} />
    </FitToScreen>
  )
}

function ProjectorScreen({ state, dispatch, onSwitchSeat, sound }) {
  const { heroIndex, phase, round } = state.turn
  const activeHero = state.heroes[heroIndex]
  const current = PHASES[phase]
  const color = HERO_COLORS[activeHero.color]
  const latest = state.log[0]
  const side = Boolean(state.board)

  const turn = (
    <section className={`rounded-[2vw] border border-zinc-800 p-[2vw] ${color.bg}`}>
      <div className="flex items-baseline justify-between">
        <p className="flex items-baseline gap-[2vw]">
          <span className="uppercase tracking-widest text-zinc-400">Round {round}</span>
          <AreaName state={state} className="font-semibold" />
        </p>
        <div className="flex items-baseline gap-[3vw]">
          <TilesLeft state={state} />
          <span className="text-amber-400">
            <span className="font-bold">{state.xp}</span> XP
          </span>
          <span className={state.surges === 0 ? 'text-red-400' : 'text-emerald-400'}>
            {state.surges === 0 ? 'No healing surges!' : `${'❤'.repeat(state.surges)} surges`}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-[1.5vw]">
        <Art name={heroArt(activeHero.key)} className="w-[8vw]" />
        <h1 className={`font-display text-[5vw] font-bold leading-tight ${color.text}`}>
          {activeHero.player || activeHero.name}'s turn
        </h1>
      </div>
      <div className="mt-[1vh] grid grid-cols-3 gap-[1vw]">
        {PHASES.map((p, i) => (
          <div
            key={p.key}
            className={`rounded-[1vw] px-[1vw] py-[1vh] text-center ${
              i === phase ? 'bg-amber-500 font-bold text-zinc-950' : 'bg-zinc-900/80 text-zinc-500'
            }`}
          >
            {p.emoji} {p.title}
          </div>
        ))}
      </div>
      {activeHero.ally ? (
        <div className="mt-[1.5vh] rounded-[1vw] border border-sky-800 bg-sky-950/60 p-[1vw] text-sky-100">
          <p className="font-semibold">🤖 The computer is playing {activeHero.name}{state.allyPaused ? ' (paused)' : ''}</p>
          {state.turn.allyHelp ? <p className="text-amber-300">✋ {state.turn.allyHelp} Tap it on an iPad.</p> : latest && <p className="text-zinc-300">{latest.text}</p>}
        </div>
      ) : (
        <ul className="mt-[1.5vh] space-y-[0.5vh] text-zinc-200">
          {current.steps.map((step) => (
            <li key={step}>• {step}</li>
          ))}
        </ul>
      )}
    </section>
  )

  const cards = (state.environment || state.encounter || state.treasure) && (
    <section className="space-y-[1vh]">
      <ProjectorTreasure treasure={state.treasure} />
      {state.encounter && (
        <div className="rounded-[1.2vw] border border-sky-700 bg-sky-950/60 p-[1vw]">
          <span className="font-display text-[2.4vw] font-bold text-sky-200">🃏 {state.encounter.card.name}</span>
          <p className="whitespace-pre-line text-zinc-200">{state.encounter.card.text}</p>
        </div>
      )}
      <EnvironmentBanner environment={state.environment} />
    </section>
  )

  const heroes = (
    <section className="grid gap-[1.5vw]" style={{ gridTemplateColumns: `repeat(${side ? Math.min(2, state.heroes.length) : state.heroes.length}, minmax(0, 1fr))` }}>
      {state.heroes.map((hero, i) => {
        const heroColor = HERO_COLORS[hero.color]
        const down = hero.hp === 0
        return (
          <div
            key={hero.id}
            className={`rounded-[1.5vw] border p-[1.2vw] ${heroColor.bg} ${
              i === heroIndex ? `border-transparent ring-[0.3vw] ${heroColor.ring}` : 'border-zinc-800'
            }`}
          >
            <div className="flex items-center gap-[0.8vw]">
              <Art name={heroArt(hero.key)} className={`w-[5vw] ${down ? 'grayscale' : ''}`} />
              <div className="min-w-0">
                <div className={`font-display text-[2.4vw] font-bold leading-tight ${heroColor.text}`}>{hero.ally ? '🤖 ' : ''}{hero.name}</div>
                <div className="text-zinc-400">{hero.player}</div>
              </div>
            </div>
            <div className={`text-[3vw] font-bold ${down ? 'text-red-400' : 'text-zinc-100'}`}>
              {down ? 'DOWN!' : `${hero.hp} / ${hero.maxHp}`}
            </div>
            <HpBar hp={hero.hp} maxHp={hero.maxHp} />
            <p className="mt-[0.5vh] text-zinc-300">
              AC {heroAc(hero)} · Speed {moveSpeed(hero)}
            </p>
            {/* What's helping (blue) and hurting (orange): items, powers, conditions, curses. */}
            <BoostBadges hero={hero} heroes={state.heroes} className="mt-[0.8vh] gap-[0.3em]" badgeClass="px-[0.5em] py-[0.1em] text-[0.9em] leading-snug" />
            {heroItems(hero).length > 0 && (
              <p className="mt-[0.5vh] text-yellow-300">💰 {heroItems(hero).map((i) => i.name).join(', ')}</p>
            )}
          </div>
        )
      })}
    </section>
  )

  const villains = activeVillains(state).length > 0 && (
      <section className="flex flex-wrap gap-[1.2vw]">
        {activeVillains(state).map((villain) => (
          <div key={villain.id} className="flex min-w-[30vw] gap-[1vw] rounded-[1.2vw] border-2 border-fuchsia-600 bg-fuchsia-950/40 p-[1vw]">
            <Art name={monsterArt(villain)} className="w-[9vw]" />
            <div className="flex-1">
              <div className="text-[1.2vw] font-semibold uppercase tracking-widest text-fuchsia-400">👑 Villain</div>
              <div className="font-display text-[2.6vw] font-bold text-fuchsia-200">{villain.enraged ? `Enraged ${villain.name}` : villain.fullName}</div>
              <div className="text-[2.4vw] font-bold text-zinc-100">
                {villain.hp} / {villain.maxHp} HP <span className="text-[1.6vw] font-normal text-zinc-400">· AC {villain.ac}</span>
              </div>
              <HpBar hp={villain.hp} maxHp={villain.maxHp} />
              {villain.conditions.length > 0 && <p className="mt-[0.5vh] text-amber-400">{villain.conditions.join(', ')}</p>}
            </div>
          </div>
        ))}
      </section>
  )

  const monsters = (
    <section className="flex-1">
      {state.monsters.length === 0 ? (
        <p className="pt-[2vh] text-center font-display text-[2.4vw] text-zinc-600">The dungeon is quiet… for now.</p>
      ) : (
        <div className={`grid gap-[1.2vw] ${side ? 'grid-cols-2' : 'grid-cols-4'}`}>
          {state.monsters.map((monster) => {
            const owner = state.heroes.find((h) => h.id === monster.ownerId)
            return (
              <div key={monster.id} className="rounded-[1.2vw] border border-red-900/70 bg-zinc-900 p-[1vw]">
                <div className="flex items-center gap-[0.8vw]">
                  <Art name={monsterArt(monster)} className="w-[5vw]" />
                  <div className="min-w-0">
                    <div className="font-display text-[2vw] font-bold leading-tight text-red-300">{monster.name}</div>
                    <div className="text-zinc-400">{owner ? `${owner.name}'s card` : ''}</div>
                  </div>
                </div>
                <div className="text-[2.2vw] font-bold text-zinc-100">
                  {monster.hp} / {monster.maxHp} HP
                </div>
                <HpBar hp={monster.hp} maxHp={monster.maxHp} />
                {monster.conditions.length > 0 && <p className="mt-[0.5vh] text-amber-400">{monster.conditions.join(', ')}</p>}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )

  const traps = (state.traps ?? []).length > 0 && (
      <section className="flex flex-wrap gap-[1vw]">
        {state.traps.map((trap) => (
          <span key={trap.id} className="rounded-full border border-orange-700 bg-orange-950/60 px-[1vw] py-[0.5vh] text-orange-200">
            {trap.type === 'trap' ? '⚙️' : '⚠️'} {trap.name}
          </span>
        ))}
      </section>
  )

  const footer = (
    <footer className="flex items-center justify-between text-zinc-500">
      <span>{latest ? latest.text : ''}</span>
      <span className="flex items-center gap-[1vw]">
        <SoundToggle on={sound.on} setOn={sound.setOn} elsewhere={sound.elsewhere} className="!px-[0.6vw] !py-0 text-[1vw] !text-zinc-600 hover:!text-zinc-300" />
        <MusicToggle on={sound.musicOn} setOn={sound.setMusicOn} soundOn={sound.on} className="!px-[0.6vw] !py-0 text-[1vw] !text-zinc-600 hover:!text-zinc-300" />
        <BoardSwitch state={state} dispatch={dispatch} className="!px-[0.6vw] !py-0 text-[1vw] !text-zinc-600 hover:!text-zinc-300" />
        <DifficultySwitch state={state} dispatch={dispatch} place="above" className="text-[1vw] text-zinc-600 [&>button]:!px-[0.6vw] [&>button]:!py-0 hover:text-zinc-300" />
        <button type="button" className="text-[1vw] text-zinc-700 hover:text-zinc-400" onClick={onSwitchSeat}>
          switch view
        </button>
      </span>
    </footer>
  )

  // A long, thin dungeon gets the whole width of the screen (turned on its side if it runs
  // up and down), with everything else in three columns underneath.
  const bounds = side && boardBounds(state.board)
  if (side && Math.max(bounds.w, bounds.h) >= 2 * Math.min(bounds.w, bounds.h)) {
    return (
      <div className="flex h-screen flex-col gap-[1.5vh] p-[1.2vw] text-[1.6vw]">
        <div className="min-h-0 flex-[3]">
          <Board state={state} readOnly fill />
        </div>
        <div className="flex min-h-0 flex-[2] gap-[1.5vw]">
          <FitToBox className="min-w-0 flex-1">
            <div className="flex flex-col gap-[2vh]">
              {turn}
              <ProjectorAdventure state={state} />
              {footer}
            </div>
          </FitToBox>
          <FitToBox className="min-w-0 flex-1">
            <div className="flex flex-col gap-[2vh]">
              {heroes}
              {villains}
            </div>
          </FitToBox>
          <FitToBox className="min-w-0 flex-1">
            <div className="flex flex-col gap-[2vh]">
              {cards}
              {monsters}
              {traps}
            </div>
          </FitToBox>
        </div>
      </div>
    )
  }

  // The party's game on the virtual board: the dungeon fills the left of the screen and
  // everything else shrinks to fit the column beside it.
  if (side) {
    return (
      <div className="flex h-screen gap-[1.5vw] p-[1.5vw] text-[1.6vw]">
        <div className="min-w-0 flex-[3]">
          <Board state={state} readOnly fill />
        </div>
        <FitToBox className="min-w-0 flex-[2]">
          <div className="flex flex-col gap-[2vh]">
            {turn}
            <ProjectorAdventure state={state} />
            {cards}
            {heroes}
            {villains}
            {monsters}
            {traps}
            {footer}
          </div>
        </FitToBox>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col gap-[2vh] p-[2vw] text-[1.6vw]">
      {turn}
      <ProjectorAdventure state={state} />
      {cards}
      {heroes}
      {villains}
      {monsters}
      {traps}
      {footer}
    </div>
  )
}

// Nobody can scroll the projector during a game, so when the screen holds more
// than the window, shrink all of it until it fits.
function FitToScreen({ children }) {
  const outer = useRef(null)
  const inner = useRef(null)
  const [fit, setFit] = useState({ scale: 1, height: null })

  useLayoutEffect(() => {
    const measure = () => {
      const height = window.innerHeight - outer.current.getBoundingClientRect().top
      const scale = Math.min(1, height / inner.current.scrollHeight)
      setFit((prev) => (prev.scale === scale && prev.height === height ? prev : { scale, height }))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(inner.current)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  return (
    <div ref={outer} className="overflow-hidden" style={{ height: fit.height ?? '100vh' }}>
      <div ref={inner} style={{ transform: `scale(${fit.scale})`, transformOrigin: 'top center' }}>
        {children}
      </div>
    </div>
  )
}

// One column of the projector that can't scroll. Its content is laid out as if the column
// were wider (by 1 / `base`), so the big projector text doesn't wrap into a thin strip, then
// shrunk to the column's width, and further until it fits the height.
function FitToBox({ className = '', base = 0.7, children }) {
  const outer = useRef(null)
  const inner = useRef(null)
  const [scale, setScale] = useState(base)

  useLayoutEffect(() => {
    const measure = () => {
      const next = Math.min(base, outer.current.clientHeight / inner.current.scrollHeight)
      setScale((prev) => (prev === next ? prev : next))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(inner.current)
    observer.observe(outer.current)
    return () => observer.disconnect()
  }, [base])

  return (
    <div ref={outer} className={`overflow-hidden ${className}`}>
      <div ref={inner} style={{ width: `${100 / base}%`, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        {children}
      </div>
    </div>
  )
}
