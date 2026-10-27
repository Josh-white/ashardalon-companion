import { useNarrator } from '../audio/useNarrator.js'

// The projector's narrator voice, with a small switch in the corner. Shows
// nothing when the Pi has no ElevenLabs key.
export default function Narrator({ state }) {
  const narrator = useNarrator(state)
  if (!narrator.available) return null
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
  return (
    <button
      type="button"
      className="fixed bottom-[2vh] right-[8vw] z-30 text-[1vw] text-zinc-700 hover:text-zinc-400"
      onClick={narrator.toggle}
    >
      {narrator.on ? '🗣️ narrator on' : '🔇 narrator off'}
    </button>
  )
}
