import { useState } from 'react'
import { HERO_COLORS } from '../data/heroes.js'
import { rollD20 } from '../state/random.js'
import { powerNumber } from '../state/game.js'
import { Button } from './ui.jsx'

// "Snake 2" when one hero has two Snakes, so they can be told apart.
function monsterName(state, monster) {
  const twins = state.monsters.filter((m) => m.ownerId === monster.ownerId && m.name === monster.name)
  return twins.length > 1 ? `${monster.name} ${twins.indexOf(monster) + 1}` : monster.name
}


// The Hero Phase's attack: pick a power and the monster (or monsters) it hits, then the
// app rolls against each monster's AC, takes off the damage and hands out XP.
export default function HeroAttack({ state, hero, dispatch }) {
  const powers = hero.powers.filter((p) => !p.used && powerNumber(p.card?.attack) !== null)
  const [powerId, setPowerId] = useState(null)
  const [chosen, setChosen] = useState([])
  const [results, setResults] = useState(null)
  const power = powers.find((p) => p.id === powerId)
  const unknownAc = state.monsters.find((m) => chosen.includes(m.id) && !m.ac)

  if (state.monsters.length === 0 && !results) {
    return <p className="mt-4 rounded-xl bg-zinc-950/50 p-3 text-zinc-400">No monsters to attack right now.</p>
  }

  const toggle = (id) => setChosen((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))
  const reset = () => {
    setPowerId(null)
    setChosen([])
    setResults(null)
  }

  const roll = () => {
    const bonus = powerNumber(power.card.attack)
    const damage = powerNumber(power.card.damage) ?? 0
    const targets = chosen.map((monsterId) => ({ monsterId, roll: rollD20() }))
    dispatch({ type: 'HERO_ATTACK', heroId: hero.id, powerId: power.id, targets })
    // The server does the same sums; these stay on screen after a defeated monster leaves the list.
    setResults({
      powerName: power.name,
      rows: targets.map(({ monsterId, roll: value }) => {
        const monster = state.monsters.find((m) => m.id === monsterId)
        const total = value + bonus
        const hit = total >= monster.ac
        return { id: monsterId, name: monsterName(state, monster), ac: monster.ac, value, bonus, total, hit, damage }
      }),
    })
  }

  return (
    <div className="mt-5 space-y-3 rounded-2xl border-2 border-amber-600/60 bg-zinc-950/60 p-4">
      <h3 className="font-display text-xl font-bold text-amber-300">⚔️ Attack a monster</h3>

      {results ? (
        <>
          <ul className="space-y-2">
            {results.rows.map((r) => (
              <li key={r.id} className={`rounded-xl p-3 text-lg ${r.hit ? 'bg-emerald-950' : 'bg-zinc-900'}`}>
                {hero.name} rolled {r.value} + {r.bonus} = {r.total} against the {r.name}'s AC {r.ac}.{' '}
                <b className={r.hit ? 'text-emerald-300' : 'text-zinc-300'}>{r.hit ? 'Hit!' : 'Miss!'}</b>
                {r.hit && r.damage > 0 && ` ${r.damage} damage.`}
              </li>
            ))}
          </ul>
          <Button className="w-full" onClick={reset}>
            Attack again
          </Button>
        </>
      ) : (
        <>
          {powers.length === 0 ? (
            <p className="text-zinc-400">None of {hero.name}'s unused powers has an attack number.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {powers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPowerId(p.id)}
                  className={`rounded-xl border-2 px-3 py-2 text-left transition active:scale-95 ${
                    p.id === powerId ? 'border-amber-400 bg-amber-950/60' : 'border-zinc-700 bg-zinc-900'
                  }`}
                >
                  <span className="block font-semibold text-zinc-100">{p.name}</span>
                  <span className="text-sm text-zinc-400">
                    {p.card.attack} · {p.card.damage || '0'} damage{p.type === 'daily' ? ' · daily' : ''}
                  </span>
                </button>
              ))}
            </div>
          )}

          {power && (
            <>
              <p className="text-zinc-300">Which monster? Tap more than one if the power hits several.</p>
              <div className="grid grid-cols-2 gap-2">
                {state.monsters.map((monster) => {
                  const owner = state.heroes.find((h) => h.id === monster.ownerId)
                  const on = chosen.includes(monster.id)
                  return (
                    <button
                      key={monster.id}
                      type="button"
                      onClick={() => toggle(monster.id)}
                      className={`rounded-xl border-2 px-3 py-2 text-left transition active:scale-95 ${
                        on ? 'border-red-400 bg-red-950/70' : 'border-zinc-700 bg-zinc-900'
                      }`}
                    >
                      <span className="block font-bold text-red-300">{monsterName(state, monster)}</span>
                      <span className={`block text-sm ${owner ? HERO_COLORS[owner.color].text : 'text-zinc-400'}`}>
                        {owner ? `${owner.name}'s monster` : 'No owner'}
                      </span>
                      <span className="text-sm text-zinc-400">
                        {monster.ac ? `AC ${monster.ac} · ` : ''}
                        {monster.hp} HP
                      </span>
                    </button>
                  )
                })}
              </div>
              {power.card.text && (
                <details className="text-sm text-zinc-500">
                  <summary>What {power.name} says</summary>
                  <p className="mt-1 whitespace-pre-line">{power.card.text}</p>
                </details>
              )}
              {unknownAc && (
                <p className="text-amber-300">
                  The app doesn't know the {unknownAc.name}'s AC. Roll the die yourself and use its card.
                </p>
              )}
              <Button variant="gold" className="w-full py-4 text-xl" disabled={chosen.length === 0 || Boolean(unknownAc)} onClick={roll}>
                🎲 Roll {power.name} ({power.card.attack})
              </Button>
            </>
          )}
        </>
      )}
    </div>
  )
}
