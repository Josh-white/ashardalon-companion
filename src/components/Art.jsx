import { artUrl, useArt } from '../state/useArt.js'

// A square picture from your own card, or nothing until one is added on the
// card art screen. Size it with className, e.g. "w-16".
export default function Art({ name, className = '' }) {
  const art = useArt()
  const src = artUrl(art, name)
  if (!src) return null
  return <img src={src} alt="" draggable={false} className={`aspect-square shrink-0 rounded-xl object-cover ${className}`} />
}
