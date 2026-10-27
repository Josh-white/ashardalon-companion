import { useEffect, useRef, useState } from 'react'
import { ART_SIZE, CARD_ART_HEIGHT, cardArt, heroArt, heroCardArt } from '../data/art.js'
import { HERO_COLORS, HERO_TEMPLATES } from '../data/heroes.js'
import { artUrl, saveArt, useArt } from '../state/useArt.js'
import { useCards } from '../state/useCards.js'
import { Button } from './ui.jsx'

const MAX_ZOOM = 5
const clamp = (n, min, max) => Math.min(max, Math.max(min, n))

// Drag and pinch the photo until the picture fills the square, then save it.
function Cropper({ file, title, onSave, onCancel }) {
  const frameRef = useRef(null)
  const pointers = useRef(new Map())
  const [image, setImage] = useState(null)
  const [frame, setFrame] = useState(320)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => setImage(img)
    img.onerror = () => setError("That file isn't a picture this iPad can open.")
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => {
    const measure = () => frameRef.current && setFrame(frameRef.current.clientWidth)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // Where the photo sits in the square, kept so it always covers the square.
  const layout = (z, o) => {
    if (!image) return null
    const scale = (frame / Math.min(image.naturalWidth, image.naturalHeight)) * z
    const width = image.naturalWidth * scale
    const height = image.naturalHeight * scale
    const x = clamp(o.x, -(width - frame) / 2, (width - frame) / 2)
    const y = clamp(o.y, -(height - frame) / 2, (height - frame) / 2)
    return { width, height, x, y, left: (frame - width) / 2 + x, top: (frame - height) / 2 + y }
  }
  const placed = layout(zoom, offset)

  const onPointerDown = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
  }
  const onPointerMove = (event) => {
    const last = pointers.current.get(event.pointerId)
    if (!last || !placed) return
    const now = { x: event.clientX, y: event.clientY }
    if (pointers.current.size === 2) {
      // Pinch: zoom by how much the two fingers spread apart.
      const other = [...pointers.current.entries()].find(([id]) => id !== event.pointerId)[1]
      const before = Math.hypot(last.x - other.x, last.y - other.y)
      const after = Math.hypot(now.x - other.x, now.y - other.y)
      if (before > 0) setZoom((z) => clamp((z * after) / before, 1, MAX_ZOOM))
    } else {
      const next = layout(zoom, { x: placed.x + now.x - last.x, y: placed.y + now.y - last.y })
      setOffset({ x: next.x, y: next.y })
    }
    pointers.current.set(event.pointerId, now)
  }
  const onPointerUp = (event) => pointers.current.delete(event.pointerId)

  const save = () => {
    const canvas = document.createElement('canvas')
    canvas.width = ART_SIZE
    canvas.height = ART_SIZE
    const ratio = ART_SIZE / frame
    canvas.getContext('2d').drawImage(image, placed.left * ratio, placed.top * ratio, placed.width * ratio, placed.height * ratio)
    setSaving(true)
    canvas.toBlob(
      (blob) =>
        onSave(blob).catch((e) => {
          setSaving(false)
          setError(`Couldn't save it: ${e.message}`)
        }),
      // A PNG token keeps its see-through corners.
      file.type === 'image/png' ? 'image/png' : 'image/jpeg',
      0.85,
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-zinc-950/95 p-4">
      <h2 className="font-display text-3xl font-bold text-amber-400">{title}</h2>
      <p className="text-center text-zinc-400">Drag the photo and pinch to zoom until the picture fills the circle.</p>
      <div
        ref={frameRef}
        className="relative aspect-square w-[min(85vw,60vh,28rem)] touch-none overflow-hidden rounded-2xl border-4 border-amber-500 bg-zinc-900"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {placed && (
          <img
            src={image.src}
            alt=""
            draggable={false}
            className="pointer-events-none absolute max-w-none select-none"
            style={{ left: placed.left, top: placed.top, width: placed.width, height: placed.height }}
          />
        )}
        {/* Screens show the picture in a circle. */}
        <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_999px_rgba(0,0,0,0.45)]" />
        {!image && !error && <p className="absolute inset-0 flex items-center justify-center text-zinc-500">Opening the photo…</p>}
      </div>
      <label className="flex w-[min(85vw,28rem)] items-center gap-3 text-zinc-400">
        Zoom
        <input type="range" min="1" max={MAX_ZOOM} step="0.01" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1 accent-amber-500" />
      </label>
      {error && <p className="text-red-400">{error}</p>}
      <div className="flex gap-3">
        <Button variant="gold" className="px-8 py-3 text-lg" disabled={!placed || saving} onClick={save}>
          {saving ? 'Saving…' : 'Save picture'}
        </Button>
        <Button className="py-3" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

// A tall picture isn't cropped: it's scaled down to CARD_ART_HEIGHT and saved as a JPEG.
function saveTall(name, file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, CARD_ART_HEIGHT / img.naturalHeight)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.naturalWidth * scale)
      canvas.height = Math.round(img.naturalHeight * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      canvas.toBlob((blob) => saveArt(name, blob).then(resolve, reject), 'image/jpeg', 0.85)
    }
    img.onerror = () => reject(new Error("that file isn't a picture this iPad can open"))
    img.src = url
  })
}

// tall: the big hero card art, shown as it is instead of in a circle.
function ArtTile({ name, title, subtitle, titleClass = 'text-zinc-100', onPhoto, tall = false }) {
  const art = useArt()
  const src = artUrl(art, name)
  const [removing, setRemoving] = useState(false)
  const remove = () => {
    if (!window.confirm(`Take the picture off ${title}?`)) return
    setRemoving(true)
    saveArt(name, null)
      .catch((e) => window.alert(`Couldn't remove it: ${e.message}`))
      .finally(() => setRemoving(false))
  }
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
      {src ? (
        <img src={src} alt="" className={`w-full object-cover ${tall ? 'aspect-[2/5] rounded-xl object-top' : 'aspect-square rounded-full'}`} />
      ) : (
        <div className={`flex w-full items-center justify-center border-2 border-dashed border-zinc-700 text-5xl text-zinc-700 ${tall ? 'aspect-[2/5] rounded-xl' : 'aspect-square rounded-full'}`}>
          📷
        </div>
      )}
      <div>
        <p className={`font-display text-lg font-bold leading-tight ${titleClass}`}>{title}</p>
        {subtitle && <p className="text-sm text-zinc-500">{subtitle}</p>}
      </div>
      <label className="cursor-pointer rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-center transition hover:bg-zinc-700 active:scale-95">
        {src ? 'New photo' : 'Add photo'}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file && tall) saveTall(name, file).catch((err) => window.alert(`Couldn't save it: ${err.message}`))
            else if (file) onPhoto({ file, name, title })
          }}
        />
      </label>
      {src && (
        <Button variant="ghost" className="text-sm" disabled={removing} onClick={remove}>
          Remove
        </Button>
      )}
    </div>
  )
}

const GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5'

// Photos of your own hero, monster and villain cards, shown on the iPads and
// the projector. They're saved on the Pi, so every screen gets them.
export default function ArtScreen({ onDone }) {
  const cards = useCards()
  const [cropping, setCropping] = useState(null)

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-4 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-bold text-amber-400">Card art</h1>
          <p className="mt-1 text-zinc-400">
            Take a photo of each card (or pick a token picture) and fit it in the circle. Every iPad and the projector show it. The photos stay on the Pi.
          </p>
        </div>
        <Button variant="gold" className="px-6 py-3 text-lg" onClick={onDone}>
          Done
        </Button>
      </header>

      <section>
        <h2 className="mb-3 font-display text-2xl font-bold text-zinc-200">Heroes</h2>
        <div className={GRID}>
          {HERO_TEMPLATES.map((t) => (
            <ArtTile key={t.key} name={heroArt(t.key)} title={t.name} subtitle={t.className} titleClass={HERO_COLORS[t.color].text} onPhoto={setCropping} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl font-bold text-zinc-200">Hero card art</h2>
        <p className="mb-3 text-zinc-400">The big picture from each hero card. It shows faded behind that hero's card on the player's own iPad.</p>
        <div className={GRID}>
          {HERO_TEMPLATES.map((t) => (
            <ArtTile key={t.key} tall name={heroCardArt(t.key)} title={t.name} subtitle={t.className} titleClass={HERO_COLORS[t.color].text} />
          ))}
        </div>
      </section>

      {cards.monsters.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-2xl font-bold text-red-300">Monsters</h2>
          <div className={GRID}>
            {cards.monsters.map((card) => (
              <ArtTile key={card.id} name={cardArt('monster', card)} title={card.name} titleClass="text-red-300" onPhoto={setCropping} />
            ))}
          </div>
        </section>
      )}

      {cards.villains.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-2xl font-bold text-fuchsia-300">Villains</h2>
          <div className={GRID}>
            {cards.villains.map((card) => (
              <ArtTile key={card.id} name={cardArt('villain', card)} title={card.fullName ?? card.name} titleClass="text-fuchsia-200" onPhoto={setCropping} />
            ))}
          </div>
        </section>
      )}

      {cropping && (
        <Cropper
          key={cropping.name}
          file={cropping.file}
          title={cropping.title}
          onCancel={() => setCropping(null)}
          onSave={(blob) => saveArt(cropping.name, blob).then(() => setCropping(null))}
        />
      )}
    </div>
  )
}
