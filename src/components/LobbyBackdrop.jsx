import { artUrl, useArt } from '../state/useArt.js'

const EMBERS = Array.from({ length: 10 }, (_, i) => ({
  left: `${(i * 41 + 7) % 97}%`,
  delay: `${(i * 2.3) % 9}s`,
  size: 2 + ((i * 3) % 4),
}))

// Behind every lobby screen: the intro's warm glow, Ashardalon faint in the dark, and a
// few embers drifting up, so the mood carries on after the dragon wakes. The page that
// shows it needs `isolate`, since this sits behind everything at z -1.
export default function LobbyBackdrop() {
  const art = useArt()
  const dragon = artUrl(art, 'villain-ashardalon')
  return (
    <div aria-hidden="true" className="lobby-backdrop pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {dragon && <img src={dragon} alt="" className="lobby-dragon absolute" />}
      {EMBERS.map((e, i) => (
        <span key={i} className="intro-ember" style={{ left: e.left, animationDelay: e.delay, animationDuration: '9s', width: e.size, height: e.size }} />
      ))}
    </div>
  )
}
