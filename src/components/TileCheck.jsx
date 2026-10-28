import { useCards } from '../state/useCards.js'
import TileDrawing from './TileDrawing.jsx'

// The #tiles page: every dungeon tile layout in cards.json, drawn the way the virtual
// board will draw it, to check against the real tiles. The real tile wins.
export default function TileCheck() {
  const cards = useCards()
  const tileProblems = cards.problems.filter((p) => /tile/i.test(p))
  return (
    <main className="min-h-screen bg-zinc-950 p-4 text-zinc-100">
      <h1 className="font-display text-3xl text-amber-400">Tile check</h1>
      <p className="mt-1 max-w-2xl text-zinc-400">
        Each tile is drawn with its triangle at the bottom. Grey is floor, black is rock, the dark circle is the scorch mark
        where a new monster goes. If a drawing doesn't match your tile, the tile is right: tell Claude which one.
      </p>
      {tileProblems.length > 0 && (
        <ul className="mt-3 list-disc pl-6 text-red-300">
          {tileProblems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {cards.source !== 'loading' && cards.tiles.length === 0 && (
        <p className="mt-6 text-zinc-300">No tiles yet. Add a "tiles" list to cards.json on the Pi.</p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {cards.tiles.map((tile) => (
          <figure key={tile.id} className="rounded-xl bg-zinc-900 p-3">
            <TileDrawing tile={tile} className="mx-auto w-full max-w-48" />
            <figcaption className="mt-2 text-center">
              <span className="block font-semibold">{tile.name}</span>
              <span className="block text-sm text-zinc-400">
                {tile.kind}
                {tile.triangle ? ` · ${tile.triangle} triangle` : ''}
              </span>
              {tile.source && <span className="block text-xs text-zinc-500">{tile.source}</span>}
            </figcaption>
          </figure>
        ))}
      </div>
    </main>
  )
}
