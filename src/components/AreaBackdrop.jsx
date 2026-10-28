import { useEffect, useRef, useState } from 'react'
import { AREAS, dungeonArea } from '../state/area.js'
import DungeonScene from './DungeonScene.jsx'

// How long a new area's picture shows at full brightness.
export const ENTRANCE_MS = 3500

const WASH_AT = { top: '50% 0%', bottom: '50% 100%', center: '50% 45%' }

// A picture of the area (DungeonScene) and a glowing border in the colours of where the party is
// in the dungeon (state/area.js). It sits behind everything and never takes a tap.
export function AreaBackdrop({ state }) {
  const area = dungeonArea(state)
  const entering = useEntrance(area)
  if (!area) return null
  const look = AREAS[area.key]
  const [light, from] = look.wash
  const background = [
    `radial-gradient(ellipse 130% 75% at ${WASH_AT[from]}, rgb(${light} / 0.3), transparent 70%)`,
    'radial-gradient(ellipse 100% 100% at 50% 50%, transparent 50%, rgb(0 0 0 / 0.7))',
  ].join(', ')
  return (
    <>
      <div key={area.key} aria-hidden className="area-fade pointer-events-none fixed inset-0 -z-10 bg-zinc-950">
        <DungeonScene area={area.key} className="absolute inset-0 h-full w-full opacity-60" />
        <div className="absolute inset-0" style={{ background }} />
      </div>
      <div
        aria-hidden
        className={`area-frame pointer-events-none fixed inset-0 z-[25] ${look.pulse ? 'area-pulse' : ''}`}
        style={{ '--glow': look.glow }}
      />
      {entering && <AreaEntrance key={entering.at} area={entering.area} />}
    </>
  )
}

// "🌋 Fiery depths": the area's name, for the top of the screen.
export function AreaName({ state, className = '' }) {
  const area = dungeonArea(state)
  if (!area) return null
  const look = AREAS[area.key]
  return (
    <span className={`whitespace-nowrap ${className}`} style={{ color: `rgb(${look.glow})` }}>
      {look.emoji} {area.label}
    </span>
  )
}

// The area the party just walked into, for a few seconds, or null. The first area a
// screen sees is where the game already was, so it doesn't count.
function useEntrance(area) {
  const [entering, setEntering] = useState(null)
  const last = useRef(undefined)
  const key = area?.key ?? null
  useEffect(() => {
    const before = last.current
    last.current = key
    if (before === undefined || !key || before === key) return
    setEntering({ area, at: Date.now() })
    const timer = setTimeout(() => setEntering(null), ENTRANCE_MS)
    return () => clearTimeout(timer)
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return entering
}

// A new area's picture at full brightness with its name, then it fades back behind
// the game. Taps go straight through it.
function AreaEntrance({ area }) {
  const look = AREAS[area.key]
  return (
    <div aria-live="polite" className="area-entrance pointer-events-none fixed inset-0 z-[30] flex items-center justify-center">
      <DungeonScene area={area.key} className="absolute inset-0 h-full w-full" />
      <div className="relative rounded-3xl bg-black/60 px-[5vw] py-[3vh] text-center">
        <p className="text-[2.5vmax] uppercase tracking-[0.3em] text-zinc-300">You enter</p>
        <p className="font-display text-[6vmax] font-bold leading-tight" style={{ color: `rgb(${look.glow})`, textShadow: '0 0.1em 0.5em black' }}>
          {look.emoji} {area.label}
        </p>
      </div>
    </div>
  )
}
