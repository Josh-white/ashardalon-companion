import { BARDIC_SONGS, bardicSongsLeft } from '../state/heroAttacks.js'
import { singers, songRollLabel, songTokens } from '../state/bardicSong.js'
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

// The bard's Bardic Song tokens on the top bars, next to the healing surges: one 🎶 per song,
// spent ones faded. Nothing shows in a game without a bard.
export function SongTokens({ state, className = '', names = false }) {
  const bards = songTokens(state)
  if (bards.length === 0) return null
  return (
    <span className={`inline-flex items-center gap-2 whitespace-nowrap ${className}`}>
      {bards.map((bard) => (
        <span key={bard.id} title={`${bard.name}'s Bardic Song: ${bard.left} of ${bard.total} left`} aria-label={`${bard.name}'s Bardic Song: ${bard.left} of ${bard.total} left`}>
          {names && <span className="mr-1 text-sky-300">{bard.name}</span>}
          {Array.from({ length: bard.total }, (_, i) => (
            <span key={i} className={i < bard.left ? '' : 'opacity-25 grayscale'}>🎶</span>
          ))}
        </span>
      ))}
    </span>
  )
}
