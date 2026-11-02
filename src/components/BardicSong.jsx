import { BARDIC_SONGS, bardicSongsLeft } from '../state/heroAttacks.js'
import { singers, songRollLabel } from '../state/bardicSong.js'
import { rollD20 } from '../state/random.js'
import { Button } from './ui.jsx'

// A hero's roll just failed (a Locked Door, a trap, the Cage, Mind Over Body) and a bard
// still has a Bardic Song: a button per bard to make the roll again (state/bardicSong.js).
// `only` limits it to one bard (the bard's own hero card).
export default function SongRollOffer({ state, dispatch, only = null, className = '' }) {
  if (!state.songRoll) return null
  const roller = state.heroes.find((h) => h.id === state.songRoll.heroId)
  const bards = singers(state).filter((b) => !only || b.id === only)
  if (bards.length === 0) return null
  return (
    <div className={`space-y-2 ${className}`}>
      {bards.map((bard) => (
        <Button key={bard.id} className="w-full border-sky-700 text-sky-100" onClick={() => dispatch({ type: 'BARDIC_SONG', bardId: bard.id, roll: rollD20() })}>
          🎶 {bard.name}'s Bardic Song: {roller?.name ?? 'the hero'} rolls again to {songRollLabel(state)} ({bardicSongsLeft(bard)} of {BARDIC_SONGS} left)
        </Button>
      ))}
    </div>
  )
}
