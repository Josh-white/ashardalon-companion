import { useNarrator } from '../audio/useNarrator.js'

// The projector's narrator voice. It follows the sound switch; the only thing it
// ever shows is a tap button if the browser still blocks it.
export default function Narrator({ state, on }) {
  const narrator = useNarrator(state, on)
  if (narrator.blocked) {
    return (
      <button
        type="button"
        className="fixed bottom-[2vh] right-[2vw] z-50 rounded-full border-2 border-amber-400 bg-amber-950/90 px-[1.5vw] py-[1vh] text-[1.6vw] font-bold text-amber-200 shadow-xl"
        onClick={narrator.unlock}
      >
        🔊 Tap to hear the narrator
      </button>
    )
  }
  return null
}
