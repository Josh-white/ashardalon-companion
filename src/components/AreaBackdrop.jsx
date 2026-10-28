import { AREAS, dungeonArea } from '../state/area.js'
import DungeonScene from './DungeonScene.jsx'

const WASH_AT = { top: '50% 0%', bottom: '50% 100%', center: '50% 45%' }

// A picture of the area (DungeonScene) and a glowing border in the colours of where the party is
// in the dungeon (state/area.js). It sits behind everything and never takes a tap.
export function AreaBackdrop({ state }) {
  const area = dungeonArea(state)
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
