import { useEffect, useState } from 'react'
import { heroArt } from '../data/art.js'
import { HERO_COLORS } from '../data/heroes.js'
import { artUrl, useArt } from '../state/useArt.js'
import Die from './Die3D.jsx'

const SHOW_MS = { roll: 2200, crit: 3500, fumble: 3000, defeat: 3000, level: 3500, down: 3500, poison: 3500, spawn: 3000, monster: 4500, 'monster-down': 5000, encounter: 4500, treasure: 4000 }
// A device that reconnects shouldn't replay a moment that is long over.
const STALE_MS = 8000

const STYLES = {
  roll: { icon: '🎲', title: 'text-zinc-100', panel: 'border-zinc-600 bg-zinc-900/95' },
  crit: { icon: '💥', title: 'text-amber-300', panel: 'border-amber-400 bg-amber-950/95 moment-glow' },
  fumble: { icon: '🙈', title: 'text-sky-300', panel: 'border-sky-700 bg-zinc-900/95' },
  defeat: { icon: '⚔️', title: 'text-emerald-300', panel: 'border-emerald-500 bg-emerald-950/95' },
  level: { icon: '⭐', title: 'text-amber-300', panel: 'border-amber-400 bg-zinc-900/95 moment-glow' },
  down: { icon: '💀', title: 'text-red-300', panel: 'border-red-600 bg-red-950/95 moment-shake' },
  poison: { icon: '🤢', title: 'text-lime-300', panel: 'border-lime-600 bg-zinc-900/95' },
  spawn: { icon: '🐉', title: 'text-red-300', panel: 'border-red-700 bg-zinc-900/95' },
  monster: { icon: '👹', title: 'text-red-300', panel: 'border-red-700 bg-zinc-900/95' },
  'monster-down': { icon: '💀', title: 'text-red-300', panel: 'border-red-600 bg-red-950/95' },
  encounter: { icon: '🃏', title: 'text-sky-300', panel: 'border-sky-600 bg-zinc-900/95' },
  treasure: { icon: '💰', title: 'text-amber-300', panel: 'border-amber-400 bg-amber-950/95 moment-glow' },
}

// Shows the latest big moment (a roll, a defeated monster, a hero going down)
// on top of whatever screen this device is showing, then gets out of the way.
export default function MomentOverlay({ moment, heroes, big = false }) {
  const [visible, setVisible] = useState(null)
  const art = useArt()

  useEffect(() => {
    if (!moment || Date.now() - moment.at > STALE_MS) return
    setVisible(moment)
    const hide = setTimeout(() => setVisible(null), SHOW_MS[moment.kind] ?? 2500)
    return () => clearTimeout(hide)
  }, [moment?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null
  const style = STYLES[visible.kind] ?? STYLES.roll
  const hero = heroes.find((h) => h.id === visible.heroId)
  const rolls = visible.rolls ?? []
  const isRoll = visible.value != null || rolls.length > 0
  // A roll's big reveal waits until the die stops spinning.
  const reveal = isRoll ? 'moment-reveal' : 'moment-pop'
  // The monster's picture when it appears, attacks or falls; the hero's when they level up.
  const picture = artUrl(art, visible.art ?? (hero && visible.kind === 'level' ? heroArt(hero.key) : null))

  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-zinc-950/40 p-6">
      <div
        className={`moment-pop rounded-3xl border-4 px-8 py-6 text-center shadow-2xl ${style.panel} ${
          big ? 'min-w-[40vw] text-[3vw]' : 'min-w-72 text-2xl'
        }`}
      >
        {picture && isRoll && (
          <img src={picture} alt="" className={`mx-auto mb-3 aspect-square rounded-2xl object-cover ${big ? 'w-[10vw]' : 'w-24'}`} />
        )}
        {rolls.length > 0 ? (
          // A monster attack: one die per hero it attacked, with the result under each.
          <div className={`flex justify-center gap-[0.6em] ${rolls.length > 1 ? (big ? 'text-[5vw]' : 'text-5xl') : big ? 'text-[8vw]' : 'text-7xl'}`}>
            {rolls.map((r) => {
              // A monster's attack rolls against heroes; a hero's attack rolls against labeled monsters.
              const target = r.label ? null : heroes.find((h) => h.id === r.heroId)
              return (
                <div key={r.heroId ?? r.monsterId}>
                  <Die value={r.value} />
                  <div className={`${reveal} mt-1 text-[0.3em] font-bold ${target ? HERO_COLORS[target.color].text : 'text-red-300'}`}>
                    {r.label ?? target?.name}
                  </div>
                  <div className={`${reveal} text-[0.25em] ${r.hit ? 'text-red-300' : 'text-emerald-300'}`}>{r.outcome}</div>
                </div>
              )
            })}
          </div>
        ) : isRoll ? (
          <div className={big ? 'text-[8vw]' : 'text-7xl'}>
            <Die value={visible.value} />
          </div>
        ) : picture ? (
          <img src={picture} alt="" className={`mx-auto aspect-square rounded-2xl object-cover shadow-2xl ${big ? 'w-[24vw]' : 'w-56'}`} />
        ) : (
          <div className={big ? 'text-[7vw]' : 'text-6xl'}>{style.icon}</div>
        )}
        <div className={`${reveal} mt-3 font-display font-bold ${style.title} ${big ? 'text-[4vw]' : 'text-4xl'}`}>
          {visible.title}
        </div>
        {visible.detail && <div className={`${reveal} mt-1 text-zinc-300`}>{visible.detail}</div>}
        {hero && isRoll && visible.kind === 'roll' && (
          <div className={`${reveal} mt-1 ${HERO_COLORS[hero.color].text}`}>{hero.name}</div>
        )}
      </div>
    </div>
  )
}
