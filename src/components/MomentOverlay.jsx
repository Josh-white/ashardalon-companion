import { useEffect, useState } from 'react'
import { HERO_COLORS } from '../data/heroes.js'

const SHOW_MS = { roll: 2200, crit: 3500, fumble: 3000, defeat: 3000, level: 3500, down: 3500, poison: 3500, spawn: 3000, monster: 4500, 'monster-down': 5000, encounter: 4500, treasure: 4000 }
// A device that reconnects shouldn't replay a moment that is long over.
const STALE_MS = 8000
const ROLL_SPIN_MS = 900

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

// The front view of a real d20: a hexagon outline split into ten triangle faces,
// with the rolled number on the face pointing at you.
const V = { t: [50, 3], ur: [91, 27], lr: [91, 75], b: [50, 99], ll: [9, 75], ul: [9, 27], a: [50, 24], r: [74, 66], l: [26, 66] }
const FACES = [
  ['t', 'ur', 'a', 0.85],
  ['t', 'a', 'ul', 0.7],
  ['ur', 'r', 'a', 0.55],
  ['ul', 'a', 'l', 0.45],
  ['ur', 'lr', 'r', 0.35],
  ['ul', 'l', 'll', 0.3],
  ['lr', 'b', 'r', 0.2],
  ['ll', 'l', 'b', 0.15],
  ['b', 'l', 'r', 0.25],
]
const points = (...keys) => keys.map((k) => V[k].join(',')).join(' ')
const DIE_COLORS = {
  normal: { face: '#b91c1c', edge: '#fbbf24', text: '#fef3c7' },
  crit: { face: '#d97706', edge: '#fef3c7', text: '#ffffff' },
  fumble: { face: '#3f3f46', edge: '#71717a', text: '#a1a1aa' },
}

function Die({ value }) {
  const [shown, setShown] = useState(() => Math.ceil(Math.random() * 20))
  const [spinning, setSpinning] = useState(true)
  useEffect(() => {
    const tick = setInterval(() => setShown(Math.ceil(Math.random() * 20)), 70)
    const stop = setTimeout(() => {
      clearInterval(tick)
      setShown(value)
      setSpinning(false)
    }, ROLL_SPIN_MS)
    return () => {
      clearInterval(tick)
      clearTimeout(stop)
    }
  }, [value])
  const colors = spinning ? DIE_COLORS.normal : value === 20 ? DIE_COLORS.crit : value === 1 ? DIE_COLORS.fumble : DIE_COLORS.normal
  return (
    <div className={`mx-auto h-[2.1em] w-[1.9em] ${spinning ? 'd20-roll' : 'd20-land'} ${!spinning && value === 20 ? 'd20-crit' : ''}`}>
      <svg viewBox="0 0 100 102" className="h-full w-full overflow-visible" role="img" aria-label={`d20 showing ${shown}`}>
        <g stroke={colors.edge} strokeWidth="2" strokeLinejoin="round">
          {FACES.map(([p, q, r]) => (
            <polygon key={p + q + r} points={points(p, q, r)} fill={colors.face} />
          ))}
          {FACES.map(([p, q, r, light]) => (
            <polygon key={`shade-${p}${q}${r}`} points={points(p, q, r)} fill={light > 0.5 ? '#ffffff' : '#000000'} fillOpacity={Math.abs(light - 0.5) * 0.7} stroke="none" />
          ))}
          <polygon points={points('a', 'r', 'l')} fill={colors.face} />
          <polygon points={points('t', 'ur', 'lr', 'b', 'll', 'ul')} fill="none" strokeWidth="3" />
        </g>
        <text
          x="50"
          y="54"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={colors.text}
          fontSize={shown >= 10 ? 27 : 32}
          fontWeight="bold"
          fontFamily="Georgia, 'Times New Roman', serif"
        >
          {shown}
        </text>
        {(shown === 6 || shown === 9) && <line x1="44" y1="65" x2="56" y2="65" stroke={colors.text} strokeWidth="2" />}
      </svg>
    </div>
  )
}

// Shows the latest big moment (a roll, a defeated monster, a hero going down)
// on top of whatever screen this device is showing, then gets out of the way.
export default function MomentOverlay({ moment, heroes, big = false }) {
  const [visible, setVisible] = useState(null)

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

  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-zinc-950/40 p-6">
      <div
        className={`moment-pop rounded-3xl border-4 px-8 py-6 text-center shadow-2xl ${style.panel} ${
          big ? 'min-w-[40vw] text-[3vw]' : 'min-w-72 text-2xl'
        }`}
      >
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
