import { useEffect, useRef, useState } from 'react'
import { unlockAudio } from '../audio/soundSetting.js'
import { HERO_COLORS } from '../data/heroes.js'
import { HeroPortrait } from './HeroGallery.jsx'
import { PlayerTitle } from './Records.jsx'
import { useConfirm } from './ui.jsx'

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
// picks that hero, then the torch lights with the player's name. The card art stays in
// shadow while they choose powers and blazes up when they tap Ready.
// `onFree(claim)`: frees a hero whose iPad has gone away (closed, or put down for the night),
// so another iPad can pick them.
export function HeroHall({ heroes, lobby, records = null, onFree = null }) {
  const [ask, dialog] = useConfirm()
  const free = (claim, template) =>
    ask(
      {
        title: `Free ${template.name}?`,
        body: `${claim.player || 'The iPad holding ' + template.name} will need to pick a hero again. Any iPad can then pick ${template.name}.`,
        yes: `Free ${template.name}`,
      },
      () => onFree(claim),
    )
  return (
    <section className="grid grid-cols-5 gap-[2vw]">
      {dialog}
      {heroes.map((template) => {
        const claim = lobby.find((c) => c.heroKey === template.key)
        const ready = Boolean(claim?.ready)
        const color = HERO_COLORS[template.color]
        return (
          // A new key when the torch lights, so the arrival animation plays.
          <div key={`${template.key}-${claim ? 'lit' : 'dark'}`} className={`flex flex-col items-center gap-2 ${claim ? 'torch-arrive' : ''}`}>
            <Torch lit={Boolean(claim)} />
            <div
              // A new key on Ready too, so the alcove flares once.
              key={ready ? 'ready' : 'waiting'}
              className={`relative aspect-[3/4] w-full overflow-hidden rounded-t-full rounded-b-xl border-[3px] ${
                ready
                  ? `alcove-ready border-transparent ring-[3px] ${color.ring} shadow-[0_0_4vw_rgb(245_158_11/0.55)]`
                  : claim
                    ? 'border-amber-900/80'
                    : 'border-dashed border-stone-700'
              }`}
            >
              {/* The hero's card art: dark until their torch is lit, half lit while they
                  choose powers (the round token without card art). */}
              <HeroPortrait heroKey={template.key} dim={!claim} className={`h-full w-full transition duration-700 ${claim && !ready ? 'brightness-[0.55] saturate-50' : ''}`} />
              {ready && (
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent pt-[2vw] pb-[0.6vw] text-center font-display text-[1.6vw] font-black tracking-wide text-emerald-300 uppercase">
                  Ready!
                </span>
              )}
            </div>
            <span className={`font-display text-[2vw] font-bold ${claim ? color.text : 'text-stone-500'}`}>{template.name}</span>
            <span className="text-center text-[1.2vw] text-zinc-400">
              {claim ? (
                <>
                  {claim.player || template.className}
                  <PlayerTitle records={records} name={claim.player} className="mx-auto mt-[0.3vw] block w-fit text-[1vw]" />
                  {!ready && <span className="block text-amber-400">Choosing powers…</span>}
                  {onFree && (
                    <button type="button" className="mt-[0.4vw] block w-full text-[0.9vw] text-zinc-500 underline" onClick={() => free(claim, template)}>
                      Free this hero
                    </button>
                  )}
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
