import { serverNow } from '../state/useSharedGame.js'

// A hero's voice is reading a card out loud (src/audio/narration.js readsCard) on some
// screen: every screen shows who's reading, with a Skip button that stops it everywhere.
// A screen closed mid-card leaves `reading` behind, so an old one is ignored.
export const READING_STALE_MS = 90_000

export default function CardReading({ state, dispatch, big = false }) {
  const reading = state?.reading
  if (!reading || (reading.at && serverNow() - reading.at > READING_STALE_MS)) return null
  const hero = state.heroes?.find((h) => h.id === reading.heroId)
  return (
    <div
      data-card-reading
      className={`pointer-events-none fixed inset-x-0 z-40 flex justify-center ${big ? 'bottom-[3vh]' : 'bottom-24'}`}
    >
      <div
        className={`pointer-events-auto flex items-center gap-3 rounded-full border border-amber-500/70 bg-zinc-900/95 font-semibold text-amber-200 shadow-xl ${
          big ? 'px-[1.5vw] py-[1vh] text-[1.4vw]' : 'px-4 py-2 text-sm'
        }`}
      >
        <span className="animate-pulse">📖</span>
        <span>{hero ? `${hero.name} is reading the card…` : 'Reading the card…'}</span>
        <button
          type="button"
          onClick={() => dispatch({ type: 'SKIP_READING' })}
          className={`rounded-full bg-amber-500/20 font-bold text-amber-100 hover:bg-amber-500/30 ${big ? 'px-[1vw] py-[0.4vh]' : 'px-3 py-1'}`}
        >
          Skip
        </button>
      </div>
    </div>
  )
}
