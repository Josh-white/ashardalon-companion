import { useState } from 'react'
import { mindOverBodyChoices } from '../state/heroTurn.js'
import { rollD20 } from '../state/random.js'
import { CONDITION_ICONS } from './BoardPieces.jsx'
import { useMomentsDone } from './MomentOverlay.jsx'
import { Button } from './ui.jsx'

// Mind Over Body (a fan Monk): the moment a condition lands, a big card pops up on the monk's
// own iPad (and the table screen) asking for the roll, so it isn't missed down on the hero
// card. It waits for the dice and attack animation to finish first. "Later" hides it until a
// new condition lands; the hero card's button still works. Computer heroes roll by themselves.
export function mindPromptHeroes(state, heroId = null) {
  if (state?.status !== 'playing') return []
  return state.heroes.filter((h) => !h.ally && !h.escaped && (heroId ? h.id === heroId : true) && mindOverBodyChoices(h).length > 0)
}

export default function MindOverBodyPrompt({ state, dispatch, heroId = null }) {
  const [later, setLater] = useState([])
  const done = useMomentsDone(state.moment)
  const offers = mindPromptHeroes(state, heroId)
    .flatMap((hero) => mindOverBodyChoices(hero).map((condition) => ({ hero, condition, key: `${hero.id}:${condition}` })))
    .filter((o) => !later.includes(o.key))
  if (!done || offers.length === 0) return null
  const { hero, condition, key } = offers[0]
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center p-4 pb-6" role="dialog" aria-label="Mind Over Body">
      <div className="moment-glow w-full max-w-md rounded-2xl border-2 border-violet-400 bg-violet-950/95 p-5 text-center shadow-2xl">
        <p className="text-4xl" aria-hidden>🧘 {CONDITION_ICONS[condition] ?? ''}</p>
        <p className="mt-2 text-2xl font-bold text-violet-100">{hero.name} is {condition}!</p>
        <p className="mt-1 text-lg text-violet-200">
          <b>Mind Over Body:</b> roll the die. <b>11 or more</b> and it goes away!
        </p>
        <button
          type="button"
          className="mt-4 w-full rounded-xl border-2 border-violet-300 bg-violet-600 px-4 py-4 text-xl font-bold text-white transition hover:bg-violet-500 active:scale-95"
          onClick={() => dispatch({ type: 'MIND_OVER_BODY', heroId: hero.id, condition, roll: rollD20() })}
        >
          🎲 Roll to shake it off
        </button>
        <Button variant="ghost" className="mt-2 w-full text-violet-300" onClick={() => setLater((l) => [...l, key])}>
          Later (the button stays on {hero.name}'s card)
        </Button>
      </div>
    </div>
  )
}
