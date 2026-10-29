import { useEffect, useState } from 'react'
import { openingPlaying } from '../state/opening.js'
import { serverNow } from '../state/useSharedGame.js'

// While the narrator reads the adventure's story at the start of a game, every screen
// shows it, and the roll for first turn and the starting treasure wait (state/opening.js).
// Any screen can skip it.
export default function OpeningStory({ state, dispatch, big = false }) {
  const [, tick] = useState(0)
  const playing = openingPlaying(state, serverNow())
  const opening = state.opening
  // With nobody narrating, the story's time runs out by itself; this screen then says so,
  // so whatever waited for it comes out.
  useEffect(() => {
    if (!opening || opening.done || opening.narrating) return
    const left = opening.until - serverNow()
    const timer = setTimeout(() => {
      tick((n) => n + 1)
      dispatch({ type: 'OPENING_DONE' })
    }, Math.max(0, left) + 50)
    return () => clearTimeout(timer)
  }, [opening, dispatch])
  if (!playing) return null

  const adventure = state.adventure
  const story = adventure?.story
  return (
    <div className="intro fixed inset-0 z-[36] flex flex-col items-center justify-center gap-[3vh] overflow-y-auto p-6 text-center">
      <p className={`font-display tracking-[0.35em] text-orange-300 uppercase ${big ? 'text-[1.4vw]' : 'text-sm'}`}>The adventure begins</p>
      <h2 className={`lobby-title font-display font-black text-amber-400 ${big ? 'text-[4.5vw]' : 'text-4xl sm:text-5xl'}`}>
        {adventure?.card?.title ?? 'Into the dungeon'}
      </h2>
      {story?.text && (
        <p className={`max-w-4xl font-display text-amber-50/90 italic ${big ? 'text-[1.9vw] leading-relaxed' : 'text-lg sm:text-xl'}`}>{story.text}</p>
      )}
      <p className={`font-display font-bold text-amber-300 ${big ? 'text-[2.4vw]' : 'text-2xl'}`}>Heroes, enter the dungeon!</p>
      <button type="button" className={`text-amber-200/70 underline ${big ? 'text-[1.1vw]' : 'text-sm'}`} onClick={() => dispatch({ type: 'OPENING_DONE' })}>
        Skip the story
      </button>
    </div>
  )
}
