import { useState } from 'react'
import { heroArt, heroCardArt } from '../data/art.js'
import { cardStats } from '../data/cards.js'
import { HERO_COLORS } from '../data/heroes.js'
import { artUrl, useArt } from '../state/useArt.js'
import Art from './Art.jsx'

// The hero's tall card art, or their round token on a warm glow when the Pi has no card
// art for them. Fills its box; the box sets the shape.
export function HeroPortrait({ heroKey, dim = false, className = '' }) {
  const src = artUrl(useArt(), heroCardArt(heroKey))
  return (
    <span className={`relative block overflow-hidden bg-[radial-gradient(ellipse_at_50%_35%,rgb(120_53_15/0.55),rgb(12_8_6)_70%)] ${className}`}>
      {src ? (
        <img src={src} alt="" draggable={false} className={`h-full w-full object-cover object-top ${dim ? 'brightness-[0.35] grayscale' : ''}`} />
      ) : (
        <span className="flex h-full items-center justify-center">
          <Art name={heroArt(heroKey)} className={`w-2/3 max-w-40 ${dim ? 'brightness-[0.35] grayscale' : ''}`} />
        </span>
      )}
    </span>
  )
}

// One hero in "Choose your hero": a tall arched alcove with the card art on an iPad or a
// wide screen, a wide banner with the art fading in from the right on a phone, so all
// five fit without scrolling. `small`: the party list under your own hero, with just the
// name and who has them.
export function HeroBanner({ template, status, taken = false, faded = false, small = false }) {
  const color = HERO_COLORS[template.color]
  const src = artUrl(useArt(), heroCardArt(template.key))
  const dim = taken ? 'brightness-[0.35] grayscale' : ''
  return (
    <span
      className={`relative block ${small ? 'h-14' : 'h-24'} overflow-hidden rounded-xl border-2 text-left sm:aspect-[406/620] sm:h-auto sm:rounded-t-[999px] sm:rounded-b-xl ${
        taken ? 'border-zinc-800' : 'border-amber-900/70'
      } ${faded ? 'opacity-50' : ''} bg-[radial-gradient(ellipse_at_70%_40%,rgb(120_53_15/0.5),rgb(12_8_6)_70%)]`}
    >
      {src ? (
        <img
          src={src}
          alt=""
          draggable={false}
          className={`absolute top-0 right-0 h-full w-3/5 object-cover object-[50%_15%] [mask-image:linear-gradient(90deg,transparent,#000_45%)] sm:w-full sm:object-top sm:[mask-image:none] ${dim}`}
        />
      ) : (
        <span className="absolute inset-y-0 right-3 flex items-center sm:inset-x-0 sm:top-[12%] sm:bottom-auto sm:justify-center">
          <Art name={heroArt(template.key)} className={`w-20 sm:w-3/4 ${dim}`} />
        </span>
      )}
      <span className="absolute inset-0 flex flex-col justify-center px-4 sm:justify-end sm:bg-gradient-to-b sm:from-transparent sm:from-45% sm:to-black/95 sm:px-3 sm:pb-3">
        <span className={`block font-display font-bold ${small ? 'text-xl sm:text-lg' : 'text-2xl sm:text-[clamp(1.2rem,2.6vw,1.9rem)]'} ${taken ? 'text-zinc-500' : color.text}`}>{template.name}</span>
        {!small && <span className="block text-sm text-zinc-300">{template.className}</span>}
        {(!small || taken) && <span className="mt-0.5 block text-sm">{status}</span>}
      </span>
    </span>
  )
}

const article = (type) => (type === 'at-will' ? 'an' : 'a')

function PowerCard({ card, label, picked = false, onClick }) {
  const body = (
    <>
      <span className="flex items-baseline justify-between gap-2">
        <span className="font-display text-lg font-bold text-amber-50">{card.name}</span>
        {label && <span className="shrink-0 text-xs tracking-wide text-amber-500/90 uppercase">{label}</span>}
      </span>
      {cardStats(card) && <span className="block text-sm font-semibold text-zinc-200">{cardStats(card)}</span>}
      {card.text && <span className="mt-1 block text-sm text-zinc-400">{card.text}</span>}
    </>
  )
  const look = `block w-full rounded-xl border p-3 text-left ${picked ? 'border-amber-500 bg-amber-950/50' : 'border-amber-900/60 bg-zinc-950/70'}`
  return onClick ? (
    <button type="button" className={`${look} transition active:scale-[0.98]`} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={look}>{body}</div>
  )
}

// The hero's powers as cards. The rulebook's suggested ones are already picked, so a
// player who's happy just reads them; tapping one shows the other cards for that slot.
// A card the hero always has can't be swapped.
export function PowerSlots({ template, slots, picks, powers, onPick }) {
  const [open, setOpen] = useState(null)
  const pickedIds = picks.map((card) => card?.id)
  return (
    <div className="space-y-3">
      {slots.map((type, i) => {
        const picked = picks[i]
        const options = powers.filter((c) => c.hero === template.key && c.type === type && (c.id === picked?.id || !pickedIds.includes(c.id)))
        const fixed = options.find((c) => c.id === picked?.id)?.always
        const choices = options.filter((c) => !c.always || c.id === picked?.id)
        if (options.length === 0) {
          return (
            <p key={i} className="rounded-xl border border-dashed border-zinc-700 p-3 text-sm text-zinc-500">
              No {type} cards in the card file yet. You can name it during the game.
            </p>
          )
        }
        if (open === i) {
          return (
            <div key={i} className="space-y-2 rounded-2xl border border-amber-700/70 bg-black/40 p-2">
              <p className="px-1 text-sm text-amber-200">
                Pick {article(type)} {type} power:
              </p>
              {choices.map((card) => (
                <PowerCard
                  key={card.id}
                  card={card}
                  picked={card.id === picked?.id}
                  label={card.id === picked?.id ? 'picked' : card.suggested ? 'suggested' : null}
                  onClick={() => {
                    if (card.id !== picked?.id) onPick(i, card)
                    setOpen(null)
                  }}
                />
              ))}
            </div>
          )
        }
        if (!picked) {
          return (
            <button
              key={i}
              type="button"
              onClick={() => setOpen(i)}
              className="block w-full animate-pulse rounded-xl border-2 border-dashed border-amber-600 p-4 text-left font-display text-lg text-amber-300"
            >
              Tap to pick {article(type)} {type} power
            </button>
          )
        }
        return (
          <PowerCard
            key={i}
            card={picked}
            label={fixed ? `${type} · always yours` : type}
            onClick={fixed || choices.length < 2 ? null : () => setOpen(i)}
          />
        )
      })}
      {slots.length > 0 && <p className="text-center text-sm text-zinc-500">Tap a power to swap it for another card.</p>}
    </div>
  )
}
