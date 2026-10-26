import { useEffect, useState } from 'react'
import { HERO_COLORS } from '../data/heroes.js'

const SHOW_MS = { roll: 2200, crit: 3500, fumble: 3000, defeat: 3000, level: 3500, down: 3500 }
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
  return (
    <div
      className={`mx-auto flex h-[1.6em] w-[1.6em] items-center justify-center rounded-[0.3em] border-4 border-amber-500 bg-zinc-950 font-bold text-amber-300 ${
        spinning ? 'moment-spin' : 'moment-land'
      }`}
    >
      {shown}
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
  const isRoll = visible.value != null
  // A roll's big reveal waits until the die stops spinning.
  const reveal = isRoll ? 'moment-reveal' : 'moment-pop'

  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-zinc-950/40 p-6">
      <div
        className={`moment-pop rounded-3xl border-4 px-8 py-6 text-center shadow-2xl ${style.panel} ${
          big ? 'min-w-[40vw] text-[3vw]' : 'min-w-72 text-2xl'
        }`}
      >
        {isRoll ? (
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
