// Pieces of a game screen beside the turn: the party at a glance, the log, the ally
// switches, and the tab bar with its hook (usePlayTabs). Used by PlayView in App.jsx.
import { useEffect, useState } from 'react'
import { heroLabel } from '../state/gameHelpers.js'
import Art from './Art.jsx'
import { BoostBadges } from './StatBoosts.jsx'
import { acParts, attackParts, speedParts } from '../data/statParts.js'
import { Button, HpBar, LevelBadge } from './ui.jsx'
import { heroArt } from '../data/art.js'
import { HERO_COLORS } from '../data/heroes.js'
import { heroAc } from '../data/powerEffects.js'
import { moveSpeed } from '../board/play.js'
import { PHASES } from '../data/phases.js'
import { activeVillains } from '../state/game.js'
import { AllyPause } from '../ally/AllyPanel.jsx'

export function GameLog({ log }) {
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

export function WaitingBanner({ state }) {
  const hero = state.heroes[state.turn.heroIndex]
  const phase = PHASES[state.turn.phase]
  const color = HERO_COLORS[hero.color]
  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
      <p className="text-sm uppercase tracking-widest text-zinc-500">Round {state.turn.round}</p>
      <h2 className="font-display text-3xl font-bold text-zinc-200">
        It's <span className={color.text}>{heroLabel(hero)}</span>'s turn
      </h2>
      <p className="mt-1 text-lg text-zinc-400">
        {phase.emoji} {phase.title}
      </p>
    </section>
  )
}

// On the iPads that aren't playing the ally: what the computer is up to, and its pause switch.
export function AllyWatch({ state, dispatch }) {
  const hero = state.heroes[state.turn.heroIndex]
  return (
    <section className="rounded-2xl border border-sky-800 bg-sky-950/60 p-3">
      <p className="font-semibold text-sky-200">🤖 The computer is playing {hero.name}.</p>
      {state.log[0] && <p className="mt-1 text-zinc-300">{state.log[0].text}</p>}
      <AllyPause state={state} dispatch={dispatch} className="mt-2 w-full" />
    </section>
  )
}

// Hands a hero to the computer (a player who's had enough for tonight), or takes them back.
// Only on the virtual board, where the computer can see where everything is.
export function AllyToggle({ state, dispatch, hero }) {
  if (!state.board || !hero || state.status !== 'playing') return null
  return (
    <Button variant="ghost" className="w-full border border-zinc-800 text-sm" onClick={() => dispatch({ type: 'SET_ALLY', heroId: hero.id, ally: !hero.ally })}>
      {hero.ally ? `🙋 I'll play ${hero.name} again` : `😴 Let the computer play ${hero.name}`}
    </Button>
  )
}

// Every hero in the party at a glance, yours marked, whoever's turn it is ringed.
export function PartyStrip({ heroes, meId, activeId }) {
  return (
    <section>
      <h2 className="mb-2 font-display text-xl font-bold text-zinc-300">Your party</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {heroes.map((hero) => (
          <div key={hero.id} className={`rounded-xl p-3 ${HERO_COLORS[hero.color].bg} ${hero.id === activeId ? 'ring-2 ring-amber-400' : ''}`}>
            <div className="flex items-center gap-2">
              <Art name={heroArt(hero.key)} className="w-10 shrink-0" />
              <span className="min-w-0">
                <span className={`block font-display text-lg leading-tight font-bold ${HERO_COLORS[hero.color].text}`}>{hero.ally ? '🤖 ' : ''}{hero.name}<LevelBadge level={hero.level} /></span>
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
export function PartyGlance({ state, dispatch, activeId, heroCard }) {
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
                      {hero.ally ? '🤖 ' : ''}{hero.name}
                      <LevelBadge level={hero.level} className="text-xs" />
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
export function TabBar({ tabs, tab, setTab, className = '' }) {
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

export const monsterTotal = (state) => state.monsters.length + activeVillains(state).length

// Whether a big moment is about this hero: a monster's attack on them, their treasure, their
// encounter. On the table screen (no hero) every moment counts.
const momentFor = (moment, heroId) => Boolean(moment) && (!heroId || moment.heroId === heroId || (moment.rolls ?? []).some((r) => r.heroId === heroId))

// Which tab is open, and the red dots on the others. The Turn tab comes back by itself: on the
// table screen whenever the hero or the phase changes, on a hero's iPad at each phase of their
// own turn and when it ends, and whenever something happens to that hero (a monster's attack,
// treasure, a free attack from Cause Fear) so it isn't missed on another tab. A new monster
// (on a hero's iPad, one of theirs) puts a dot on Monsters until it's opened.
export function usePlayTabs(state, heroId, myTurn) {
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
  return [tab, setTab, badges, resetKey]
}
