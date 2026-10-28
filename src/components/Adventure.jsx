import { useState } from 'react'
import { HERO_COLORS } from '../data/heroes.js'
import { DOOR_UNLOCK_ROLL, FEATURE_LABELS, MAX_SURGES, MIN_SURGES, escapeBlockers, goalParts, missingFeatures, playableChambers, revealsReady, usesDoors } from '../state/adventure.js'
import { randomNumbers, rollD20 } from '../state/random.js'
import { useCards } from '../state/useCards.js'
import { tileSpots } from '../state/tiles.js'
import { TileSetup } from './Tiles.jsx'
import { Button, Chip } from './ui.jsx'
import { CampaignBoons } from './Campaign.jsx'
import { VillagerList } from './Villagers.jsx'

const SHUFFLE_NUMBERS = 128

const heading = (adventure) => (adventure.number ? `Adventure ${adventure.number}: ${adventure.title}` : adventure.title)

// The projector's adventure choice in the lobby: a free game or one from the book,
// plus how many healing surges (the book's easier and harder settings).
export function AdventurePicker({ state, dispatch }) {
  const { adventures } = useCards()
  const chosen = state.lobbyAdventure
  const surges = state.lobbySurges ?? 2
  const sorted = [...adventures].sort((a, b) => (a.number ?? 99) - (b.number ?? 99))

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="font-display text-2xl font-bold text-amber-400">Choose the adventure</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <AdventureOption active={!chosen} title="Free play" detail="No adventure: just explore and fight." onClick={() => dispatch({ type: 'CHOOSE_ADVENTURE', adventure: null })} />
        {sorted.map((adventure) => {
          const missing = missingFeatures(adventure)
          return (
            <AdventureOption
              key={adventure.id}
              active={chosen?.id === adventure.id}
              disabled={missing.length > 0}
              title={heading(adventure)}
              detail={missing.length > 0 ? `Coming soon: needs ${missing.map((f) => FEATURE_LABELS[f] ?? f).join(', ')}` : adventure.goal}
              players={adventure.players}
              onClick={() => dispatch({ type: 'CHOOSE_ADVENTURE', adventure })}
            />
          )
        })}
      </div>
      {adventures.length === 0 && <p className="mt-2 text-sm text-zinc-500">No adventures in the card file yet.</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-zinc-400">Healing surges:</span>
        {Array.from({ length: MAX_SURGES - MIN_SURGES + 1 }, (_, i) => MIN_SURGES + i).map((n) => (
          <Button key={n} variant={n === surges ? 'gold' : 'default'} onClick={() => dispatch({ type: 'SET_LOBBY_SURGES', surges: n })}>
            {'❤'.repeat(n)} {n === 1 ? 'harder' : n === 3 ? 'easier' : 'normal'}
          </Button>
        ))}
      </div>

      <TileSetup state={state} dispatch={dispatch} />

      {chosen && <AdventureSetup adventure={chosen} />}
    </section>
  )
}

function AdventureOption({ active, disabled, title, detail, players, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl border-2 p-3 text-left transition ${
        active ? 'border-amber-400 bg-amber-950/40' : 'border-zinc-800 bg-zinc-950'
      } ${disabled ? 'cursor-default opacity-50' : 'active:scale-95'}`}
    >
      <span className="block font-display text-lg font-bold text-zinc-100">{title}</span>
      {players && <span className="block text-xs uppercase tracking-wide text-zinc-500">{players} heroes</span>}
      <span className="mt-1 block text-sm text-zinc-400">{detail}</span>
    </button>
  )
}

const TILE_STACK_STEP = /dungeon tile stack|into the stack|the stack after/i
function tileStackStep(adventure) {
  const special = tileSpots(adventure).map((s) => s.tile)
  return `Shuffle the ordinary dungeon tiles into a stack.${special.length > 0 ? ` Keep the ${special.join(' and the ')} to the side. The app says when ${special.length > 1 ? 'each one turns' : 'it turns'} up.` : ''}`
}

// What to put on the table before entering the dungeon.
function AdventureSetup({ adventure }) {
  return (
    <div className="mt-4 rounded-xl bg-zinc-950/60 p-3">
      {adventure.blurb && <p className="italic text-zinc-300">{adventure.blurb}</p>}
      <p className="mt-2 text-zinc-200">
        <span className="font-semibold text-amber-400">Goal:</span> {adventure.goal}
      </p>
      {adventure.setup.length > 0 && (
        <>
          <h3 className="mt-3 font-semibold text-amber-400">Set up the table</h3>
          <ol className="mt-1 list-decimal space-y-1 pl-6 text-zinc-300">
            {adventure.setup.map((step) =>
              // The app runs the tile stack, so the book's tile-shuffling step changes.
              TILE_STACK_STEP.test(step) ? (
                <li key={step}>{tileStackStep(adventure)}</li>
              ) : (
                <li key={step}>{step}</li>
              ),
            )}
          </ol>
        </>
      )}
      <ChamberDeck adventure={adventure} />
    </div>
  )
}

// An adventure that draws its chamber card at random: which cards the app shuffles.
function ChamberDeck({ adventure }) {
  const { chambers } = useCards()
  const draws = adventure.reveals.some((r) => r.actions.some((a) => a.type === 'chamber' && !a.name))
  if (!draws) return null
  const left = chambers.filter((c) => !playableChambers(chambers).includes(c))
  return (
    <p className="mt-3 text-sm text-zinc-400">
      The app draws the Chamber card when the entrance turns up, so leave the Chamber deck in the box.
      {left.length > 0 && ` Not in the app's deck yet: ${left.map((c) => c.name).join(', ')}.`}
    </p>
  )
}

// On the iPads in the lobby: which adventure the projector picked.
export function ChosenAdventure({ state }) {
  const chosen = state.lobbyAdventure
  return (
    <p className="text-center text-zinc-300">
      {chosen ? (
        <>
          Adventure: <span className="font-semibold text-amber-400">{heading(chosen)}</span> · {chosen.goal}
        </>
      ) : (
        'Free play (the projector can pick an adventure).'
      )}
    </p>
  )
}

// Once nothing else stands in the way, the Hero Phase says the way out is open, so the
// escape button isn't left hidden in the folded adventure bar.
export function EscapeNote({ state, hero, dispatch }) {
  const adventure = state.adventure
  if (!adventure || adventure.escaped) return null
  if (!(adventure.card.win.escape || adventure.chamber?.card.win.escape) || escapeBlockers(state).length > 0) return null
  const rule = adventure.card.rules.find((r) => /victory/i.test(r.name))
  return (
    <div className="mt-4 rounded-xl border border-emerald-700 bg-emerald-950/60 p-3 text-lg text-emerald-100">
      <p className="font-semibold">🚪 The way out is open! Get {hero.name} to the exit.</p>
      {rule && <p className="mt-1 text-base text-emerald-200">{rule.text}</p>}
      <Button variant="gold" className="mt-2 w-full" onClick={() => dispatch({ type: 'ADVENTURE_ESCAPED', escaped: true })}>
        We escaped the dungeon!
      </Button>
    </div>
  )
}

// Read-aloud text from the book, shown until someone taps "Got it".
function Story({ story, dispatch, big = false }) {
  return (
    <div className={`rounded-2xl border-2 border-red-800 bg-red-950/70 ${big ? 'p-[1.5vw]' : 'p-4'}`}>
      <p className={`uppercase tracking-widest text-red-300 ${big ? 'text-[1.2vw]' : 'text-xs'}`}>Read aloud</p>
      <h3 className={`font-display font-bold text-amber-300 ${big ? 'text-[3vw]' : 'text-2xl'}`}>{story.title}</h3>
      {story.text && <p className={`mt-1 italic text-zinc-100 ${big ? 'text-[2vw]' : 'text-lg'}`}>{story.text}</p>}
      {story.steps.length > 0 && (
        <ul className={`mt-2 space-y-1 text-zinc-200 ${big ? '' : 'text-base'}`}>
          {story.steps.map((step) => (
            <li key={step}>• {step}</li>
          ))}
        </ul>
      )}
      {dispatch && (
        <Button className="mt-3" onClick={() => dispatch({ type: 'ADVENTURE_STORY_DONE', storyId: story.id })}>
          Got it
        </Button>
      )}
    </div>
  )
}

function Goal({ state, big = false }) {
  const parts = goalParts(state)
  const time = state.adventure?.timeTokens
  if (parts.length === 0 && time == null) return null
  return (
    <ul className={`mt-2 space-y-1 ${big ? '' : 'text-base'}`}>
      {parts.map((part) => (
        <li key={part.key} className={part.done ? 'text-emerald-300' : 'text-zinc-200'}>
          {part.done ? '✓' : '○'} {part.label}
          {part.progress && <span className="text-zinc-400"> · {part.progress}</span>}
        </li>
      ))}
      {time != null && (
        <li className={`font-semibold ${time <= 2 ? 'text-red-300' : 'text-amber-300'}`}>
          ⏳ {'●'.repeat(time)}
          {'○'.repeat(Math.max(0, 5 - time))} {time} Time token{time === 1 ? '' : 's'} left on the Vast Gate
        </li>
      )}
    </ul>
  )
}

// The adventure's box on the iPads and the table: a one-line bar that opens to show the
// goal, progress, tokens to pick up, escaping and the rules. Read-aloud text always shows,
// and the bar opens by itself when a token is waiting to be picked up.
export function AdventurePanel({ state, dispatch }) {
  const [open, setOpen] = useState(false)
  const adventure = state.adventure
  if (!adventure) return null
  const { card, chamber } = adventure
  const loose = adventure.tokens.filter((t) => !t.heldBy)
  const parts = goalParts(state)
  const done = parts.filter((p) => p.done).length
  const blockers = escapeBlockers(state)
  const shown = open || loose.length > 0
  return (
    <section className="space-y-3">
      {adventure.story && <Story story={adventure.story} dispatch={dispatch} />}
      <CampaignBoons state={state} dispatch={dispatch} />
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900">
        <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" onClick={() => setOpen(!shown)}>
          <span className="min-w-0">
            <span className="block truncate font-display text-lg font-bold text-amber-400">📜 {heading(card)}</span>
            {parts.length > 0 && (
              <span className="text-sm text-zinc-400">
                {done} of {parts.length} goals done{loose.length > 0 ? ' · a token is waiting' : ''}
              </span>
            )}
          </span>
          <span className="shrink-0 text-zinc-400">{shown ? 'Hide ▲' : 'Show ▼'}</span>
        </button>
        {shown && (
          <div className="border-t border-zinc-800 px-4 pb-4 pt-2">
            <p className="text-zinc-300">{card.goal}</p>
            <Goal state={state} />
            <VillagerList state={state} dispatch={dispatch} />
            {loose.map((token) => (
              <div key={token.name} className="mt-3">
                <p className="text-zinc-300">{token.ask || `Who ended their Hero Phase next to the ${token.name} and picked it up?`}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {state.heroes.map((hero) => (
                    <Button key={hero.id} className={HERO_COLORS[hero.color].text} onClick={() => dispatch({ type: 'ADVENTURE_TAKE_TOKEN', name: token.name, heroId: hero.id })}>
                      {hero.name}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
            {chamber && (
              <details className="mt-3 text-sm text-zinc-400">
                <summary className="cursor-pointer text-zinc-300">Chamber card: {chamber.card.name}</summary>
                <p className="mt-2 text-zinc-300">{chamber.card.goal}</p>
                <ul className="mt-1 space-y-1">
                  {chamber.card.setup.map((line) => (
                    <li key={line}>• {line}</li>
                  ))}
                </ul>
              </details>
            )}
            {chamber?.card.win.manual && (
              <Button className="mt-3" variant={chamber.done ? 'default' : 'gold'} onClick={() => dispatch({ type: 'ADVENTURE_CHAMBER_DONE', done: !chamber.done })}>
                {chamber.done ? `✓ ${chamber.card.win.manual} (tap to undo)` : `${chamber.card.win.manual}!`}
              </Button>
            )}
            {(card.win.escape || chamber?.card.win.escape) && (
              <div className="mt-3">
                <Button
                  variant={adventure.escaped ? 'default' : 'gold'}
                  disabled={!adventure.escaped && blockers.length > 0}
                  onClick={() => dispatch({ type: 'ADVENTURE_ESCAPED', escaped: !adventure.escaped })}
                >
                  {adventure.escaped ? '✓ Escaped (tap to undo)' : 'We escaped the dungeon!'}
                </Button>
                {!adventure.escaped && blockers.length > 0 && (
                  <p className="mt-1 text-sm text-zinc-400">Do this first: {blockers.map((b) => b.label).join(', ')}.</p>
                )}
              </div>
            )}
            {card.rules.length > 0 && (
              <details className="mt-3 text-sm text-zinc-400">
                <summary className="cursor-pointer text-zinc-300">Adventure rules</summary>
                <ul className="mt-2 space-y-2">
                  {card.rules.map((rule) => (
                    <li key={rule.name + rule.text}>
                      {rule.name && <span className="font-semibold text-amber-300">{rule.name}: </span>}
                      {rule.text}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

// In the Exploration Phase: a button for each special tile the adventure is waiting for.
export function RevealButtons({ state, dispatch }) {
  const { monsters, villains = [], chambers = [], villagers: villagerCards = [] } = useCards()
  // With the tile stack, the app reveals special tiles itself when they're drawn.
  const tiles = state.tileStack ? [] : revealsReady(state.adventure)
  const doors = usesDoors(state.adventure) && (
    <p className="mt-4 text-sm text-zinc-400">🚪 New tile with an open door symbol? Put the top Closed Door token on it, face down.</p>
  )
  if (tiles.length === 0) return doors || null
  return (
    <>
      {doors}
      <div className="mt-4 rounded-xl bg-zinc-950/50 p-3">
        <p className="text-zinc-300">Is the new tile a special one?</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {tiles.map((reveal) => (
            <Button
              key={reveal.tile}
              variant="gold"
              onClick={() => dispatch({ type: 'ADVENTURE_REVEAL', tile: reveal.tile, cards: monsters, villains, chambers, villagerCards, random: randomNumbers(SHUFFLE_NUMBERS) })}
            >
              It's the {reveal.tile}!
            </Button>
          ))}
        </div>
      </div>
    </>
  )
}

// Hero Phase, in an adventure with doors: turning over a Closed Door token next to the
// hero, and rolling to unlock a Locked Door instead of attacking.
export function Doors({ state, hero, dispatch }) {
  const [trapped, setTrapped] = useState(null) // heroes next to a Trapped Door, while picking them
  if (!usesDoors(state.adventure)) return null
  const locked = state.adventure.lockedDoors ?? []
  const reveal = (kind, heroIds) => dispatch({ type: 'DOOR_REVEALED', kind, heroId: hero.id, heroIds })
  const special = revealsReady(state.adventure, true)
  // Heskan's Mage Hand opens any door on his tile, not just one next to him.
  const near = hero.key === 'wizard' ? 'On your tile (Mage Hand)' : 'Next to'
  return (
    <details className="mt-4 rounded-xl bg-zinc-950/50 p-3" open={special.length > 0 || undefined}>
      <summary className="cursor-pointer text-lg text-zinc-100">
        🚪 {near} a Closed Door?{locked.length > 0 && <span className="text-amber-300"> · {locked.length} locked</span>}
      </summary>
      {trapped ? (
        <div className="mt-2">
          <p className="text-zinc-300">Trapped! Who is next to the door? Each takes 1 damage.</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {state.heroes.map((h) => (
              <Chip key={h.id} active={trapped.includes(h.id)} onClick={() => setTrapped(trapped.includes(h.id) ? trapped.filter((id) => id !== h.id) : [...trapped, h.id])}>
                {h.name}
              </Chip>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <Button variant="gold" onClick={() => { reveal('trapped', trapped); setTrapped(null) }}>Spring the trap</Button>
            <Button variant="ghost" onClick={() => setTrapped(null)}>Back</Button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-2 text-zinc-300">Turn the token over. What kind of door is it?</p>
          <div className="mt-1 grid grid-cols-3 gap-2">
            <Button onClick={() => reveal('unlocked')}>Unlocked</Button>
            <Button onClick={() => setTrapped([hero.id])}>Trapped</Button>
            <Button onClick={() => reveal('locked')}>Locked</Button>
          </div>
        </>
      )}
      {special.length > 0 && <SpecialDoors special={special} dispatch={dispatch} />}
      {locked.length > 0 && (
        <div className="mt-3">
          <p className="text-zinc-300">{near} a Locked Door? Instead of attacking, try to unlock it.</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {locked.map((door, i) => (
              <Button key={door.id} onClick={() => dispatch({ type: 'DOOR_UNLOCK', doorId: door.id, heroId: hero.id, roll: rollD20() })}>
                🎲 Unlock {locked.length > 1 ? `door ${i + 1}` : 'the door'} ({DOOR_UNLOCK_ROLL}+)
              </Button>
            ))}
          </div>
        </div>
      )}
    </details>
  )
}

// A door the adventure is waiting for, such as the Secret Chamber's: tapped once it's open.
function SpecialDoors({ special, dispatch }) {
  const { monsters, villains = [], chambers = [], villagers: villagerCards = [] } = useCards()
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {special.map((reveal) => (
        <Button
          key={reveal.tile}
          variant="gold"
          onClick={() => dispatch({ type: 'ADVENTURE_REVEAL', tile: reveal.tile, door: true, cards: monsters, villains, chambers, villagerCards, random: randomNumbers(SHUFFLE_NUMBERS) })}
        >
          We opened the {reveal.tile}!
        </Button>
      ))}
    </div>
  )
}

// The projector's adventure strip: the read-aloud text big, and the goal's progress.
export function ProjectorAdventure({ state }) {
  const adventure = state.adventure
  if (!adventure) return null
  return (
    <section className="space-y-[1vh]">
      {adventure.story && <Story story={adventure.story} big />}
      <div className="rounded-[1.2vw] border border-zinc-800 bg-zinc-900 p-[1vw]">
        <span className="font-display text-[2.2vw] font-bold text-amber-400">{heading(adventure.card)}</span>
        {adventure.chamber && <span className="ml-[1vw] text-[1.4vw] text-zinc-400">Chamber: {adventure.chamber.card.name}</span>}
        <Goal state={state} big />
        <VillagerList state={state} big />
      </div>
    </section>
  )
}
