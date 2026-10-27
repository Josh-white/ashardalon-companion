import { MAX_TILES, MIN_TILES, STARTING_TILES } from '../state/tiles.js'
import { randomNumbers } from '../state/random.js'
import { useCards } from '../state/useCards.js'
import { Button } from './ui.jsx'

const SHUFFLE_NUMBERS = 128

// What a draw sends along, so a special tile can be revealed on the spot.
export function useTileDraw() {
  const { monsters, villains = [], chambers = [], villagers: villagerCards = [] } = useCards()
  return { cards: monsters, villains, chambers, villagerCards, random: randomNumbers(SHUFFLE_NUMBERS) }
}

// What to do with the tile that was just drawn.
export function DrawnTile({ tile, from = 'top', className = '' }) {
  if (tile === undefined) return null
  if (tile === 'none') {
    return <p className={`text-amber-300 ${className}`}>The dungeon tile stack is empty, so there's no tile to place.</p>
  }
  if (tile) {
    return (
      <p className={`text-xl font-bold text-amber-300 ${className}`}>
        ✨ It's the {tile}! Take the {tile} tile from the side and put it there.
      </p>
    )
  }
  return <p className={`text-emerald-300 ${className}`}>✓ Take the {from} tile of the stack and put it there.</p>
}

// A card that draws a tile from the stack (a Duergar, Occupied Lair). `drawKey` makes it draw once.
export function DrawTileButton({ state, dispatch, drawKey, from = 'top', className = '' }) {
  const payload = useTileDraw()
  if (!state.tileStack) {
    return <p className={`text-xl text-zinc-100 ${className}`}>Draw a dungeon tile from the <b>{from}</b> of the stack.</p>
  }
  const tile = state.turn.tiles?.[drawKey]
  if (tile !== undefined) return <DrawnTile tile={tile} from={from} className={className} />
  return (
    <Button
      variant="gold"
      className={`w-full py-3 text-lg ${className}`}
      onClick={() => dispatch({ type: 'DRAW_TILE', key: drawKey, from, ...payload })}
    >
      🗺️ Draw a tile from the {from} ({state.tileStack.stack.length} left)
    </Button>
  )
}

// "12 tiles left", for the header and the projector.
export function TilesLeft({ state, className = '' }) {
  if (!state.tileStack) return null
  const left = state.tileStack.stack.length
  return (
    <span className={`${left === 0 ? 'text-red-400' : left <= 5 ? 'text-amber-300' : 'text-zinc-300'} ${className}`}>
      🗺️ {left === 0 ? 'No tiles left' : `${left} ${left === 1 ? 'tile' : 'tiles'} left`}
    </span>
  )
}

// The projector's lobby: how many ordinary tiles go in the stack.
export function TileSetup({ state, dispatch }) {
  const tiles = state.lobbyTiles ?? STARTING_TILES
  const set = (n) => dispatch({ type: 'SET_LOBBY_TILES', tiles: n })
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-zinc-400">Dungeon tiles in the stack:</span>
        <Button className="!px-3" disabled={tiles <= MIN_TILES} onClick={() => set(tiles - 1)}>−</Button>
        <span className="w-10 text-center text-2xl font-bold text-amber-400">{tiles}</span>
        <Button className="!px-3" disabled={tiles >= MAX_TILES} onClick={() => set(tiles + 1)}>+</Button>
      </div>
      <p className="mt-1 text-sm text-zinc-400">Count the ordinary dungeon tiles in your stack. The app keeps track as you draw them.</p>
    </div>
  )
}
