import { useEffect, useRef, useState } from 'react'
import { unlockAudio } from '../audio/soundSetting.js'
import { HERO_COLORS } from '../data/heroes.js'
import { HeroPortrait } from './HeroGallery.jsx'
import { PlayerTitle } from './Records.jsx'

// How long a player holds their hero to light the torch.
export const HOLD_MS = 800

function Torch({ lit }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 44 70" className="h-[9vh] w-auto">
      <path d="M18 34h8l-2 36h-4z" fill={lit ? '#57534e' : '#44403c'} />
      {lit ? (
        <path
          className="torch-flame"
          d="M22 2c6 9 12 14 12 22a12 12 0 0 1-24 0c0-6 4-9 6-13 1 5 3 7 6 7-2-6-2-10 0-16z"
          fill="#f59e0b"
        />
      ) : (
        <path d="M16 30h12" stroke="#57534e" strokeWidth="3" />
      )}
    </svg>
  )
}

// "Heroes Assemble", on the projector: an alcove for each hero, dark until an iPad
// picks that hero, then lit with the player's name and whether they're ready.
export function HeroHall({ heroes, lobby, records = null }) {
  return (
    <section className="grid grid-cols-5 gap-[2vw]">
      {heroes.map((template) => {
        const claim = lobby.find((c) => c.heroKey === template.key)
        const color = HERO_COLORS[template.color]
        return (
          // A new key when the torch lights, so the arrival animation plays.
          <div key={`${template.key}-${claim ? 'lit' : 'dark'}`} className={`flex flex-col items-center gap-2 ${claim ? 'torch-arrive' : ''}`}>
            <Torch lit={Boolean(claim)} />
            <div
              className={`aspect-[3/4] w-full overflow-hidden rounded-t-full rounded-b-xl border-[3px] ${
                claim ? `border-transparent ring-[3px] ${color.ring} shadow-[0_0_3vw_rgb(245_158_11/0.35)]` : 'border-dashed border-stone-700'
              }`}
            >
              {/* The hero's card art, dark until their torch is lit (the round token without card art). */}
              <HeroPortrait heroKey={template.key} dim={!claim} className="h-full w-full" />
            </div>
            <span className={`font-display text-[2vw] font-bold ${claim ? color.text : 'text-stone-500'}`}>{template.name}</span>
            <span className="text-center text-[1.2vw] text-zinc-400">
              {claim ? (
                <>
                  {claim.player || template.className}
                  <PlayerTitle records={records} name={claim.player} className="mx-auto mt-[0.3vw] block w-fit text-[1vw]" />
                  <span className={`block ${claim.ready ? 'text-emerald-400' : 'text-amber-400'}`}>{claim.ready ? 'Ready!' : 'Choosing powers'}</span>
                </>
              ) : (
                'Waiting…'
              )}
            </span>
          </div>
        )
      })}
    </section>
  )
}

// A hero button the player holds for a moment to light their torch, so a stray tap
// doesn't grab the wrong hero. The ring fills while they hold. The tap also lets the
// browser play sound on this iPad.
export function HoldToPick({ onPick, disabled, className = '', children, label }) {
  const [holding, setHolding] = useState(false)
  const [hint, setHint] = useState(false)
  const timer = useRef(null)
  const from = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const start = (e) => {
    if (disabled) return
    from.current = { x: e.clientX, y: e.clientY }
    unlockAudio()
    setHint(false)
    setHolding(true)
    timer.current = setTimeout(() => {
      timer.current = null
      setHolding(false)
      onPick()
    }, HOLD_MS)
  }
  // Letting go too soon shows the "keep holding" hint; a swipe (the finger moves, or the
  // browser takes the touch to scroll) just lets go quietly.
  const stop = (hint = true) => {
    if (!timer.current) return
    clearTimeout(timer.current)
    timer.current = null
    setHolding(false)
    setHint(hint)
  }
  const move = (e) => {
    if (timer.current && from.current && Math.hypot(e.clientX - from.current.x, e.clientY - from.current.y) > 10) stop(false)
  }

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      onPointerDown={start}
      onPointerUp={() => stop()}
      onPointerMove={move}
      onPointerLeave={() => stop(false)}
      onPointerCancel={() => stop(false)}
      onContextMenu={(e) => e.preventDefault()}
      // The page still scrolls up and down when a swipe starts on a hero.
      // A keyboard has no hold; Enter picks straight away.
      onKeyDown={(e) => !disabled && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick())}
      style={{ touchAction: 'pan-y', WebkitTouchCallout: 'none', '--hold-ms': `${HOLD_MS}ms` }}
      className={`relative select-none ${className}`}
    >
      {children}
      {!disabled && (
        <span className="mt-2 flex items-center gap-2 text-sm text-amber-300">
          <svg aria-hidden="true" viewBox="0 0 36 36" className="h-6 w-6 -rotate-90">
            <circle cx="18" cy="18" r="15" fill="none" stroke="#3f3f46" strokeWidth="4" />
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="#fbbf24"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray="94.3"
              strokeDashoffset={holding ? 0 : 94.3}
              className={holding ? 'hold-ring-filling' : 'hold-ring'}
            />
          </svg>
          {holding ? 'Lighting your torch…' : hint ? 'Keep holding to light your torch!' : 'Hold to light your torch'}
        </span>
      )}
    </button>
  )
}
