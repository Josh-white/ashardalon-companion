import { heroArt } from '../data/art.js'
import { HERO_COLORS } from '../data/heroes.js'
import Art from './Art.jsx'
import { Button } from './ui.jsx'

export default function SeatPicker({ heroes, onPick, tableSeat, projectorSeat, onArt }) {
  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      <h1 className="text-center font-display text-4xl font-bold text-amber-400">Who's playing on this iPad?</h1>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {heroes.map((hero) => {
          const color = HERO_COLORS[hero.color]
          return (
            <button
              key={hero.id}
              type="button"
              onClick={() => onPick(hero.key)}
              className={`flex items-center gap-4 rounded-2xl border border-zinc-800 p-6 text-left transition active:scale-95 ${color.bg}`}
            >
              <Art name={heroArt(hero.key)} className="w-20" />
              <span>
                <span className={`block font-display text-3xl font-bold ${color.text}`}>I'm {hero.name}</span>
                <span className="text-zinc-400">
                  {hero.className}
                  {hero.player && ` · ${hero.player}`}
                </span>
              </span>
            </button>
          )
        })}
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button onClick={() => onPick(tableSeat)}>Table view (everyone's heroes and monsters)</Button>
        <Button onClick={() => onPick(projectorSeat)}>Projector view (big screen, no buttons)</Button>
      </div>
      <p className="mt-6 text-center text-sm">
        <button type="button" className="text-zinc-500 underline" onClick={onArt}>
          📷 Add photos of your cards
        </button>
      </p>
    </div>
  )
}
