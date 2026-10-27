import { CONDITIONS, HERO_COLORS, XP_TO_LEVEL_UP } from '../data/heroes.js'
import { heroAc } from '../state/game.js'
import { useCards } from '../state/useCards.js'
import PowerList from './PowerList.jsx'
import { Button, Chip, HpBar } from './ui.jsx'

// natural20: this hero rolled a natural 20 on an attack this turn, the one time it can level up.
export default function HeroCard({ hero, isActive, xp, surges, dispatch, powersInTurnGuide = false, natural20 = false }) {
  const color = HERO_COLORS[hero.color]
  const down = hero.hp === 0
  const abilities = (useCards().abilities ?? []).filter((a) => a.hero === hero.key && a.level <= hero.level)

  return (
    <div
      className={`rounded-2xl border border-zinc-800 p-4 transition ${color.bg} ${
        isActive ? `ring-4 ${color.ring}` : ''
      } ${down ? 'opacity-80' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className={`font-display text-2xl font-bold ${color.text}`}>
            {hero.name}
            {hero.level === 2 && <span className="ml-2 text-base text-amber-400">★ Lv 2</span>}
          </h3>
          <p className="text-sm text-zinc-400">
            {hero.className}
            {hero.player && ` · ${hero.player}`}
          </p>
        </div>
        <div className="text-right text-sm text-zinc-400">
          <div>AC {heroAc(hero)}{heroAc(hero) !== hero.ac && <span className="text-red-400"> (cursed)</span>}</div>
          <div>Speed {hero.speed}</div>
        </div>
      </div>

      {abilities.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-zinc-300">
          {abilities.map((ability) => (
            <li key={ability.name}>
              <span className="font-semibold text-amber-300">{ability.name}:</span> {ability.text}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-center gap-3">
        <Button className="h-14 w-14 !px-0 text-3xl" onClick={() => dispatch({ type: 'ADJUST_HP', heroId: hero.id, amount: -1 })}>
          −
        </Button>
        <div className="flex-1 text-center">
          <div className="text-4xl font-bold text-zinc-100">
            {hero.hp}
            <span className="text-xl text-zinc-500"> / {hero.maxHp}</span>
          </div>
          <HpBar hp={hero.hp} maxHp={hero.maxHp} />
        </div>
        <Button className="h-14 w-14 !px-0 text-3xl" onClick={() => dispatch({ type: 'ADJUST_HP', heroId: hero.id, amount: 1 })}>
          +
        </Button>
      </div>

      {down && (
        <div className="mt-3 rounded-xl bg-red-950/70 p-3 text-center">
          <p className="font-bold text-red-300">{hero.name} is down!</p>
          <Button variant={surges > 0 ? 'gold' : 'danger'} className="mt-2" onClick={() => dispatch({ type: 'USE_SURGE', heroId: hero.id })}>
            {surges > 0 ? `Use a healing surge (heal to ${hero.surgeValue})` : 'No surges left: the party falls'}
          </Button>
        </div>
      )}

      {(hero.curses ?? []).length > 0 && (
        <ul className="mt-3 space-y-1">
          {hero.curses.map((curse) => (
            <li key={curse.id} className="flex items-start justify-between gap-2 rounded-lg bg-purple-950/60 p-2 text-sm text-purple-200">
              <details>
                <summary className="font-semibold">🕯️ Cursed: {curse.name}</summary>
                <p className="mt-1 whitespace-pre-line text-purple-300">{curse.text}</p>
              </details>
              <Button variant="ghost" className="shrink-0 text-xs" onClick={() => dispatch({ type: 'REMOVE_CURSE', heroId: hero.id, curseId: curse.id })}>
                Discard
              </Button>
            </li>
          ))}
        </ul>
      )}

      <PowerList hero={hero} dispatch={dispatch} tilesHidden={powersInTurnGuide} />

      <div className="mt-3 flex flex-wrap gap-2">
        {CONDITIONS.map((condition) => (
          <Chip
            key={condition}
            active={hero.conditions.includes(condition)}
            onClick={() => dispatch({ type: 'TOGGLE_HERO_CONDITION', heroId: hero.id, condition })}
          >
            {condition}
          </Chip>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {hero.level === 1 && (
          <Button
            variant="ghost"
            className="text-sm"
            disabled={!natural20 || xp < XP_TO_LEVEL_UP}
            title="Roll a natural 20 on an attack and spend 5 XP, then flip your hero card"
            onClick={() => dispatch({ type: 'LEVEL_UP', heroId: hero.id })}
          >
            Level up (5 XP)
          </Button>
        )}
      </div>
    </div>
  )
}
