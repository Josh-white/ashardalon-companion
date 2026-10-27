import { heroArt, monsterArt } from '../data/art.js'
import { HERO_COLORS } from '../data/heroes.js'
import { PHASES } from '../data/phases.js'
import { EnvironmentBanner } from './Encounters.jsx'
import { ProjectorTreasure } from './Treasure.jsx'
import { heroItems } from '../data/items.js'
import { heroAc } from '../data/powerEffects.js'
import { activeVillains } from '../state/game.js'
import { ProjectorAdventure } from './Adventure.jsx'
import { TilesLeft } from './Tiles.jsx'
import Art from './Art.jsx'
import { SoundToggle } from './SoundToggle.jsx'
import { HpBar } from './ui.jsx'

// A read-only screen for the projector: big enough to read across the room,
// with no buttons to tap. Everything changes from the players' iPads.
export default function ProjectorView({ state, onSwitchSeat, sound }) {
  const { heroIndex, phase, round } = state.turn
  const activeHero = state.heroes[heroIndex]
  const current = PHASES[phase]
  const color = HERO_COLORS[activeHero.color]
  const latest = state.log[0]

  return (
    <div className="flex min-h-screen flex-col gap-[2vh] p-[2vw] text-[1.6vw]">
      <section className={`rounded-[2vw] border border-zinc-800 p-[2vw] ${color.bg}`}>
        <div className="flex items-baseline justify-between">
          <p className="uppercase tracking-widest text-zinc-400">Round {round}</p>
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
          <Art name={heroArt(activeHero.key)} className="w-[8vw] rounded-[1vw]" />
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
        <ul className="mt-[1.5vh] space-y-[0.5vh] text-zinc-200">
          {current.steps.map((step) => (
            <li key={step}>• {step}</li>
          ))}
        </ul>
      </section>

      <ProjectorAdventure state={state} />

      {(state.environment || state.encounter || state.treasure) && (
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
      )}

      <section className="grid gap-[1.5vw]" style={{ gridTemplateColumns: `repeat(${state.heroes.length}, minmax(0, 1fr))` }}>
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
                <Art name={heroArt(hero.key)} className={`w-[5vw] rounded-[0.8vw] ${down ? 'grayscale' : ''}`} />
                <div className="min-w-0">
                  <div className={`font-display text-[2.4vw] font-bold leading-tight ${heroColor.text}`}>{hero.name}</div>
                  <div className="text-zinc-400">{hero.player}</div>
                </div>
              </div>
              <div className={`text-[3vw] font-bold ${down ? 'text-red-400' : 'text-zinc-100'}`}>
                {down ? 'DOWN!' : `${hero.hp} / ${hero.maxHp}`}
              </div>
              <HpBar hp={hero.hp} maxHp={hero.maxHp} />
              {hero.conditions.length > 0 && <p className="mt-[0.5vh] text-amber-400">{hero.conditions.join(', ')}</p>}
              {(hero.curses ?? []).length > 0 && (
                <p className="mt-[0.5vh] text-purple-300">🕯️ {hero.curses.map((c) => c.name).join(', ')}</p>
              )}
              {heroAc(hero) !== hero.ac && <p className={heroAc(hero) > hero.ac ? 'text-sky-300' : 'text-red-300'}>AC {heroAc(hero)}</p>}
              {heroItems(hero).length > 0 && (
                <p className="mt-[0.5vh] text-yellow-300">💰 {heroItems(hero).map((i) => i.name).join(', ')}</p>
              )}
            </div>
          )
        })}
      </section>

      {activeVillains(state).length > 0 && (
        <section className="flex flex-wrap gap-[1.2vw]">
          {activeVillains(state).map((villain) => (
            <div key={villain.id} className="flex min-w-[30vw] gap-[1vw] rounded-[1.2vw] border-2 border-fuchsia-600 bg-fuchsia-950/40 p-[1vw]">
              <Art name={monsterArt(villain)} className="w-[9vw] rounded-[1vw]" />
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
      )}

      <section className="flex-1">
        {state.monsters.length === 0 ? (
          <p className="pt-[2vh] text-center font-display text-[2.4vw] text-zinc-600">The dungeon is quiet… for now.</p>
        ) : (
          <div className="grid grid-cols-4 gap-[1.2vw]">
            {state.monsters.map((monster) => {
              const owner = state.heroes.find((h) => h.id === monster.ownerId)
              return (
                <div key={monster.id} className="rounded-[1.2vw] border border-red-900/70 bg-zinc-900 p-[1vw]">
                  <div className="flex items-center gap-[0.8vw]">
                    <Art name={monsterArt(monster)} className="w-[5vw] rounded-[0.8vw]" />
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

      {(state.traps ?? []).length > 0 && (
        <section className="flex flex-wrap gap-[1vw]">
          {state.traps.map((trap) => (
            <span key={trap.id} className="rounded-full border border-orange-700 bg-orange-950/60 px-[1vw] py-[0.5vh] text-orange-200">
              {trap.type === 'trap' ? '⚙️' : '⚠️'} {trap.name}
            </span>
          ))}
        </section>
      )}

      <footer className="flex items-center justify-between text-zinc-500">
        <span>{latest ? latest.text : ''}</span>
        <span className="flex items-center gap-[1vw]">
          <SoundToggle on={sound.on} setOn={sound.setOn} className="!px-[0.6vw] !py-0 text-[1vw] !text-zinc-600 hover:!text-zinc-300" />
          <button type="button" className="text-[1vw] text-zinc-700 hover:text-zinc-400" onClick={onSwitchSeat}>
            switch view
          </button>
        </span>
      </footer>
    </div>
  )
}
