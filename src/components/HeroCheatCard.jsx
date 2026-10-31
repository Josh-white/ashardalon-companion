import { useState } from 'react'
import { heroArt, heroCardArt } from '../data/art.js'
import { coachFor, coachPowerHint } from '../data/coaches.js'
import { HERO_COLORS, heroAbilities, templateFor } from '../data/heroes.js'
import { artUrl, useArt } from '../state/useArt.js'
import { useCards } from '../state/useCards.js'
import Art from './Art.jsx'

// What each kind of power card means, for a player new to the hero.
const KINDS = [
  ['at-will', '🔁 Every turn', 'At-Will powers never run out. Use one as your attack any turn.'],
  ['daily', '💥 Once per adventure', 'Daily powers are your big moves. Use one and it flips over.'],
  ['utility', '🛠️ Helpers', "Utility powers help you or a friend. They don't use up your attack. Once each, then they flip over."],
]

// One power on the cheat card: its name, the numbers, and the coach's plain words for it,
// or the card's own text (from cards.json on the Pi) when the coach doesn't mention it.
function CheatPower({ heroKey, power }) {
  const card = power.card ?? {}
  const hint = coachPowerHint(heroKey, power.name)
  const numbers = [card.attack && `Attack ${card.attack}`, card.damage && `Damage ${card.damage}`].filter(Boolean).join(' · ')
  return (
    <li className={`rounded-xl border px-3 py-2 ${power.used ? 'border-zinc-800 text-zinc-500' : 'border-amber-800/60 bg-zinc-950/60'}`}>
      <p className="font-semibold text-amber-100">
        {power.name}
        {power.used && <span className="ml-2 text-xs font-normal text-zinc-500">used</span>}
      </p>
      {numbers && <p className="text-xs text-amber-500/90">{numbers}</p>}
      {hint ? <p className="mt-0.5 text-zinc-200">{hint}</p> : card.text && <p className="mt-0.5 text-sm whitespace-pre-line text-zinc-300">{card.text}</p>}
    </li>
  )
}

// "How my hero works": one screen with the hero's card ability, the powers they took into
// this game in plain words, and one tip, for a player trying a new hero. Opens over the
// game from a slim button and closes with "Got it", so it costs one line of iPad space.
export default function HeroCheatCard({ hero }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-xl border border-amber-900/60 bg-zinc-950/70 px-3 py-2 text-left text-amber-200 transition active:scale-[0.98]"
        onClick={() => setOpen(true)}
      >
        <span aria-hidden>📘</span>
        <span className="mr-auto font-semibold">How {hero.name} works</span>
        <span className="text-zinc-500">›</span>
      </button>
      {open && <CheatSheet hero={hero} onClose={() => setOpen(false)} />}
    </>
  )
}

// The card itself, over the game.
function CheatSheet({ hero, onClose }) {
  const cards = useCards()
  const art = useArt()
  const template = templateFor(hero.key) ?? hero
  const color = HERO_COLORS[hero.color] ?? HERO_COLORS.amber
  const abilities = heroAbilities(template, cards.abilities ?? [], hero.level ?? 1)
  const tip = coachFor(hero.key)?.tip
  const cardArt = artUrl(art, heroCardArt(hero.key))
  const powers = (hero.powers ?? []).filter((p) => p.card)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`How ${hero.name} works`}
      className="fixed inset-0 z-[34] flex items-start justify-center overflow-y-auto bg-black/80 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      onClick={onClose}
    >
      <section
        className="relative isolate w-full max-w-lg overflow-hidden rounded-2xl border border-amber-700/70 bg-gradient-to-b from-amber-950/90 to-zinc-950 p-4 shadow-[0_0_40px_rgb(245_158_11/0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        {cardArt && (
          <img
            src={cardArt}
            alt=""
            className="pointer-events-none absolute top-0 right-0 -z-10 h-56 w-2/3 object-cover object-top opacity-25 [mask-image:linear-gradient(180deg,#000_40%,transparent)]"
          />
        )}
        <div className="flex items-center gap-3">
          <Art name={heroArt(hero.key)} className="w-14 shrink-0" />
          <div className="mr-auto min-w-0">
            <p className="text-xs font-bold tracking-widest text-amber-400 uppercase">How your hero works</p>
            <h2 className={`font-display text-3xl leading-tight font-bold ${color.text}`}>{hero.name}</h2>
            <p className="text-sm text-zinc-400">{hero.className}</p>
          </div>
          <button type="button" className="h-11 w-11 shrink-0 rounded-full text-2xl text-zinc-400 hover:bg-zinc-800" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <p className="mt-3 flex gap-4 text-sm text-zinc-300">
          <span>🛡️ AC {hero.ac}</span>
          <span>❤️ HP {hero.maxHp}</span>
          <span>👣 Speed {hero.speed}</span>
        </p>

        {abilities.length > 0 && (
          <div className="mt-3 space-y-1">
            <h3 className="font-display text-lg font-bold text-amber-300">✨ Your special ability</h3>
            {abilities.map((a) => (
              <p key={a.name} className="text-zinc-100">
                <span className="font-semibold text-amber-200">{a.name}:</span> {a.hint}
              </p>
            ))}
          </div>
        )}

        {KINDS.map(([type, title, meaning]) => {
          const list = powers.filter((p) => p.type === type)
          if (list.length === 0) return null
          return (
            <div key={type} className="mt-4">
              <h3 className="font-display text-lg font-bold text-amber-300">{title}</h3>
              <p className="mb-1.5 text-sm text-zinc-400">{meaning}</p>
              <ul className="space-y-1.5">
                {list.map((p) => (
                  <CheatPower key={p.id} heroKey={hero.key} power={p} />
                ))}
              </ul>
            </div>
          )
        })}

        {tip && (
          <p className="mt-4 rounded-xl border border-amber-600/60 bg-amber-900/30 p-3 text-amber-50">
            <span className="font-bold text-amber-300">💡 Tip:</span> {tip}
          </p>
        )}

        <button
          type="button"
          className="mt-4 w-full rounded-full border-2 border-amber-600 bg-amber-950/60 px-4 py-3 font-display text-xl font-bold text-amber-200 transition active:scale-[0.98]"
          onClick={onClose}
        >
          Got it!
        </button>
      </section>
    </div>
  )
}
