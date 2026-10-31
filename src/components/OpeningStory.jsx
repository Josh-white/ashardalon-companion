import { useEffect, useState } from 'react'
import { briefing, openingPlaying } from '../state/opening.js'
import { useCards } from '../state/useCards.js'
import { serverNow } from '../state/useSharedGame.js'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

// Where a campaign stands as its next adventure begins: the chapter, and the chambers
// still to beat (named when there are only a few, like the three clan lairs).
function CampaignLine({ campaign, big }) {
  const { chambers } = useCards()
  if (!campaign) return null
  const chapter = ROMAN[campaign.games] ?? String(campaign.games + 1)
  const left = campaign.deck ?? []
  const names = left.map((id) => chambers.find((c) => c.id === id)?.name ?? id).sort()
  return (
    <p className={`font-display text-orange-200 ${big ? 'text-[1.4vw]' : 'text-base'}`}>
      Campaign chapter {chapter}
      {left.length > 0 && (left.length <= 4 ? ` · Still standing: ${names.join(', ')}` : ` · ${left.length} chambers to go`)}
    </p>
  )
}

// While the narrator reads the adventure's story at the start of a game, every screen
// shows it with a briefing: the goal, how to win tonight and the special rules. The roll
// for first turn and the starting treasure wait (state/opening.js). Any screen can skip it.
export default function OpeningStory({ state, dispatch, big = false }) {
  const [, tick] = useState(0)
  const playing = openingPlaying(state, serverNow())
  const opening = state.opening
  // Once nobody is narrating, the time runs out by itself; this screen then says so, so
  // whatever waited for it comes out.
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
  const brief = briefing(adventure?.card)
  const hasBrief = Boolean(brief && (brief.goal || brief.rules.length > 0))
  return (
    <div className={`intro fixed inset-0 z-[36] flex flex-col items-center overflow-y-auto p-6 text-center ${hasBrief ? 'justify-start gap-[2vh] sm:justify-center' : 'justify-center gap-[3vh]'}`}>
      <p className={`font-display tracking-[0.35em] text-orange-300 uppercase ${big ? 'text-[1.4vw]' : 'text-sm'}`}>The adventure begins</p>
      <h2 className={`lobby-title font-display font-black text-amber-400 ${big ? 'text-[4.5vw]' : 'text-4xl sm:text-5xl'}`}>
        {adventure?.card?.title ?? 'Into the dungeon'}
      </h2>
      <CampaignLine campaign={state.campaign} big={big} />
      {story?.text && (
        <p className={`max-w-4xl font-display text-amber-50/90 italic ${big ? 'text-[1.7vw] leading-relaxed' : 'text-lg sm:text-xl'}`}>{story.text}</p>
      )}
      {hasBrief && (
        <section className={`w-full max-w-5xl rounded-xl border border-amber-500/40 bg-black/50 text-left ${big ? 'p-[1.4vw]' : 'p-4'}`}>
          {brief.goal && (
            <p className={`font-display font-bold text-amber-200 ${big ? 'text-[2vw]' : 'text-xl'}`}>
              <span className="text-orange-400">🎯 Your quest:</span> {brief.goal}
            </p>
          )}
          {brief.win && (
            <p className={`mt-2 text-amber-50 ${big ? 'text-[1.4vw]' : 'text-base'}`}>
              <span className="font-bold text-orange-300">🏆 To win tonight:</span> {brief.win}
            </p>
          )}
          {brief.rules.length > 0 && (
            <>
              <p className={`mt-3 font-bold tracking-widest text-orange-300 uppercase ${big ? 'text-[1vw]' : 'text-xs'}`}>⚠️ Special rules</p>
              <ul className={`mt-1 grid gap-2 ${brief.rules.length > 1 ? 'sm:grid-cols-2' : ''} ${brief.rules.length > 2 ? 'lg:grid-cols-3' : ''}`}>
                {brief.rules.map((rule) => (
                  <li key={rule.name} className={`rounded-lg bg-zinc-900/80 text-zinc-200 ${big ? 'p-[0.8vw] text-[1.05vw] leading-snug' : 'p-2 text-sm'}`}>
                    <span className="font-bold text-amber-300">{rule.name}.</span> {rule.text}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
      <p className={`font-display font-bold text-amber-300 ${big ? 'text-[2.4vw]' : 'text-2xl'}`}>Heroes, enter the dungeon!</p>
      <button type="button" className={`text-amber-200/70 underline ${big ? 'text-[1.1vw]' : 'text-sm'}`} onClick={() => dispatch({ type: 'OPENING_DONE' })}>
        {hasBrief ? "We're ready, let's go!" : 'Skip the story'}
      </button>
    </div>
  )
}
