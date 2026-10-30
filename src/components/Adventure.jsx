import { useState } from 'react'
import { HERO_COLORS, hasAbility } from '../data/heroes.js'
import { DOOR_UNLOCK_ROLL, FEATURE_LABELS, MAX_SURGES, MIN_SURGES, escapeBlockers, goalParts, missingFeatures, playableChambers, revealsReady, tilesToCome, usesDoors } from '../state/adventure.js'
import { randomNumbers, rollD20, shuffleNumbers } from '../state/random.js'
import { useCards } from '../state/useCards.js'
import { canSpendAttack } from '../state/game.js'
import { doorsNearHero, drawDoorKind } from '../board/doors.js'
import { tileSpots } from '../state/tiles.js'
import { TileSetup, TilesLeft } from './Tiles.jsx'
import { AreaName } from './AreaBackdrop.jsx'
import { STARTING_TILES } from '../state/tiles.js'
import { Button, Chip } from './ui.jsx'
import { CampaignBoons } from './Campaign.jsx'
import { VillagerList } from './Villagers.jsx'

const heading = (adventure) => (adventure.number ? `Adventure ${adventure.number}: ${adventure.title}` : adventure.title)

// The projector's adventure choice in the lobby: a free game or one from the book,
// plus how many healing surges (the book's easier and harder settings).
// `board`: the solo screen, where the app lays the tiles, so there's no table to set up.
// `compact`: a phone, so each adventure is one short line and only the chosen one says
// its goal, instead of one long scroll.
export function AdventurePicker({ state, dispatch, board = false, compact = false }) {
  const { adventures } = useCards()
  const chosen = state.lobbyAdventure
  const surges = state.lobbySurges ?? 2
  const sorted = [...adventures].sort((a, b) => (a.number ?? 99) - (b.number ?? 99))

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="font-display text-2xl font-bold text-amber-400">Choose the adventure</h2>
      <div className={`mt-3 grid sm:grid-cols-2 ${compact ? 'gap-1.5' : 'gap-2'}`}>
        <AdventureOption compact={compact} active={!chosen} title="Free play" detail="No adventure: just explore and fight." onClick={() => dispatch({ type: 'CHOOSE_ADVENTURE', adventure: null })} />
        {sorted.map((adventure) => {
          const missing = missingFeatures(adventure)
          return (
            <AdventureOption
              key={adventure.id}
              compact={compact}
              active={chosen?.id === adventure.id}
              disabled={missing.length > 0}
              title={compact ? adventure.title : heading(adventure)}
              number={adventure.number}
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

      {chosen && <AdventureSetup adventure={chosen} board={board} />}
    </section>
  )
}

// The big screen's lobby: the adventure, healing surges, tiles and where the dungeon is,
// on one line under the torches, with Change to open the full choice. The table's setup
// steps stay in view, since the players set up the table while the heroes get ready.
// `big` sizes it for the projector; otherwise it fits a phone or an iPad (the solo setup).
export function QuestLine({ state, dispatch, boardChoice = null, onBoard = false, big = true }) {
  const [open, setOpen] = useState(false)
  const chosen = state.lobbyAdventure
  const surges = state.lobbySurges ?? 2
  const facts = [
    `${'❤'.repeat(surges)} ${surges === 1 ? 'harder' : surges === 3 ? 'easier' : 'normal'}`,
    onBoard ? '🗺️ virtual board' : `🧱 real tiles · ${state.lobbyTiles ?? STARTING_TILES} in the stack`,
  ]
  if (open) {
    return (
      <div className="space-y-4">
        <AdventurePicker state={state} dispatch={dispatch} board={onBoard} compact={!big} />
        {boardChoice}
        <div className="text-center">
          <Button variant="gold" className="px-10 py-3 text-xl" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </div>
    )
  }
  return (
    <section className="space-y-3">
      <div className={`flex items-center rounded-2xl border-2 border-amber-900/70 bg-gradient-to-r from-amber-950/70 to-black/70 backdrop-blur-sm ${big ? 'gap-[1.2vw] px-[1.6vw] py-[1vw]' : 'gap-3 px-4 py-3'}`}>
        <span aria-hidden="true" className={big ? 'text-[2.6vw]' : 'text-3xl'}>
          📜
        </span>
        <div className="min-w-0">
          <p className={`font-display leading-tight font-bold text-amber-50 ${big ? 'text-[1.9vw]' : 'text-xl sm:text-2xl'}`}>{chosen ? heading(chosen) : 'Free play'}</p>
          <p className={`text-zinc-300 ${big ? 'text-[1.2vw]' : 'text-sm sm:text-base'}`}>
            {chosen ? chosen.goal : 'No adventure: just explore and fight.'} · {facts.join(' · ')}
          </p>
        </div>
        <Button className={`ml-auto shrink-0 !rounded-full border border-amber-700 ${big ? 'px-[1.6vw] text-[1.2vw]' : 'px-4'}`} onClick={() => setOpen(true)}>
          Change
        </Button>
      </div>
      {chosen && !onBoard && <AdventureSetup adventure={chosen} board={false} />}
    </section>
  )
}

function AdventureOption({ active, disabled, title, detail, players, onClick, compact = false, number = null }) {
  if (compact) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={`min-w-0 rounded-lg border-2 px-3 py-2 text-left transition ${active ? 'border-amber-400 bg-amber-950/40' : 'border-zinc-800 bg-zinc-950'} ${
          disabled ? 'cursor-default opacity-40' : 'active:scale-95'
        }`}
      >
        <span className="flex items-baseline gap-2">
          {number && <span className="w-5 shrink-0 text-right font-display font-bold text-amber-500">{number}</span>}
          <span className="min-w-0 flex-1 truncate font-display font-bold text-zinc-100">{title}</span>
          {players && <span className="shrink-0 text-xs text-zinc-500">{players}</span>}
        </span>
        {(active || disabled) && <span className="mt-0.5 block text-sm text-zinc-400">{detail}</span>}
      </button>
    )
  }
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
function AdventureSetup({ adventure, board }) {
  return (
    <div className="mt-4 rounded-xl bg-zinc-950/60 p-3">
      {adventure.blurb && <p className="italic text-zinc-300">{adventure.blurb}</p>}
      <p className="mt-2 text-zinc-200">
        <span className="font-semibold text-amber-400">Goal:</span> {adventure.goal}
      </p>
      {board && <p className="mt-2 text-sm text-zinc-400">The app sets up the board, the tile stack and the cards for this adventure.</p>}
      {!board && adventure.setup.length > 0 && (
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
      {!board && <ChamberDeck adventure={adventure} />}
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
        'Free play (the big screen picks the adventure).'
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

// "Where we are": healing surges, tiles left in the stack, the special tiles still to come
// and the dungeon area.
function WhereWeAre({ state }) {
  const toCome = tilesToCome(state.adventure)
  return (
    <div className="space-y-1 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3">
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className={state.surges === 0 ? 'text-red-400' : 'text-emerald-400'}>{state.surges === 0 ? 'No healing surges left' : `${'❤'.repeat(state.surges)} healing surges`}</span>
        <TilesLeft state={state} />
        <AreaName state={state} className="text-zinc-300" />
      </p>
      {toCome.length > 0 && <p className="text-sm text-zinc-400">Still to turn up: {toCome.map((r) => r.label || r.tile).join(', ')}</p>}
    </div>
  )
}

// The adventure's box on the iPads and the table: a one-line bar that opens to show the
// goal, progress, tokens to pick up, escaping and the rules. Read-aloud text always shows,
// and the bar opens by itself when a token is waiting to be picked up. `full` is the Quest
// tab: always open, with a progress bar, where the party stands, and each rule on its own line.
export function AdventurePanel({ state, dispatch, full = false }) {
  const [open, setOpen] = useState(false)
  const adventure = state.adventure
  if (!adventure) return null
  const { card, chamber } = adventure
  const loose = adventure.tokens.filter((t) => !t.heldBy)
  const parts = goalParts(state)
  const done = parts.filter((p) => p.done).length
  const blockers = escapeBlockers(state)
  const shown = full || open || loose.length > 0
  return (
    <section className="space-y-3">
      {adventure.story && <Story story={adventure.story} dispatch={dispatch} />}
      <CampaignBoons state={state} dispatch={dispatch} />
      {full && <WhereWeAre state={state} />}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900">
        {full ? (
          <div className="px-4 pt-3">
            <p className="font-display text-2xl font-bold text-amber-400">📜 {heading(card)}</p>
            {parts.length > 0 && (
              <div className="mt-2 flex items-center gap-3">
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                  <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(done / parts.length) * 100}%` }} />
                </div>
                <span className="shrink-0 text-sm text-zinc-400">
                  {done} of {parts.length} goals done
                </span>
              </div>
            )}
          </div>
        ) : (
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
        )}
        {shown && (
          <div className={full ? 'px-4 pb-4 pt-2' : 'border-t border-zinc-800 px-4 pb-4 pt-2'}>
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
            {full &&
              adventure.tokens
                .filter((t) => t.heldBy)
                .map((token) => {
                  const holder = state.heroes.find((h) => h.id === token.heldBy)
                  return (
                    <p key={token.name} className="mt-2 text-zinc-300">
                      🎒 <span className={holder ? HERO_COLORS[holder.color].text : ''}>{holder?.name ?? 'A hero'}</span> carries the {token.name}.
                    </p>
                  )
                })}
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
            {full && card.rules.length > 0 && (
              <div className="mt-4 space-y-1">
                <p className="text-sm font-semibold tracking-wide text-zinc-400 uppercase">Adventure rules</p>
                {card.rules.map((rule) => (
                  <details key={rule.name + rule.text} className="rounded-xl bg-zinc-950/60 px-3 py-2 text-zinc-300">
                    <summary className="cursor-pointer font-semibold text-amber-300">{rule.name || rule.text.slice(0, 40) + '…'}</summary>
                    <p className="mt-1 text-sm">{rule.text}</p>
                  </details>
                ))}
              </div>
            )}
            {!full && card.rules.length > 0 && (
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
  const doors = usesDoors(state.adventure) && !state.board?.doors && (
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
              onClick={() => dispatch({ type: 'ADVENTURE_REVEAL', tile: reveal.tile, cards: monsters, villains, chambers, villagerCards, random: shuffleNumbers() })}
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
  // A board that places its own Closed Doors (an older save's doesn't) knows which are next to the hero.
  if (state.board?.doors) return <BoardDoors state={state} hero={hero} dispatch={dispatch} />
  const locked = state.adventure.lockedDoors ?? []
  const reveal = (kind, heroIds) => dispatch({ type: 'DOOR_REVEALED', kind, heroId: hero.id, heroIds })
  const special = revealsReady(state.adventure, true)
  // Heskan's Mage Hand opens any door on his tile, not just one next to him.
  const near = hasAbility(hero, 'mage-hand') ? 'On your tile (Mage Hand)' : 'Next to'
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
        state.board ? (
          // No door tokens on a virtual board: the app turns one over at random.
          <div className="mt-2">
            <p className="text-zinc-300">Standing next to a door spot (the pale slabs)? Open it to see what kind of door it is.</p>
            <Button
              className="mt-1"
              onClick={() => {
                const kind = drawDoorKind(randomNumbers(1)[0])
                if (kind === 'trapped') setTrapped([hero.id])
                else reveal(kind)
              }}
            >
              🚪 Open the door
            </Button>
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
        )
      )}
      {special.length > 0 && <SpecialDoors special={special} dispatch={dispatch} />}
      {locked.length > 0 && (
        <div className="mt-3">
          <p className="text-zinc-300">{near} a Locked Door? Instead of attacking, try to unlock it.</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {locked.map((door, i) => (
              <Button key={door.id} onClick={() => dispatch({ type: 'DOOR_UNLOCK', doorId: door.id, heroId: hero.id, roll: rollD20(), free: !canSpendAttack(state, hero) })}>
                🎲 {canSpendAttack(state, hero) ? 'Unlock' : 'Try anyway: unlock'} {locked.length > 1 ? `door ${i + 1}` : 'the door'} ({DOOR_UNLOCK_ROLL}+)
              </Button>
            ))}
          </div>
        </div>
      )}
    </details>
  )
}

// The virtual board's Closed Doors next to the hero: turn one over (the app picks the token
// at random), or roll to unlock a Locked one instead of attacking. Opening the Secret
// Chamber's door fills the chamber, so the cards go along.
function BoardDoors({ state, hero, dispatch }) {
  const { monsters, villains = [], chambers = [], villagers: villagerCards = [] } = useCards()
  const mageHand = hasAbility(hero, 'mage-hand')
  const near = doorsNearHero(state, hero, mageHand) ?? []
  const shut = near.filter((d) => !d.kind)
  const locked = near.filter((d) => d.kind === 'locked')
  const cards = { cards: monsters, villains, chambers, villagerCards, random: shuffleNumbers() }
  const label = (door, verb) => `${verb} ${door.reveal ? `the ${door.reveal.replace(/ door$/i, '')} door` : near.length > 1 ? `door ${near.indexOf(door) + 1}` : 'the door'}`
  const unplaced = revealsReady(state.adventure, true).some((r) => !state.board.doors.some((d) => d.reveal === r.tile))
  if (near.length === 0 && !unplaced) {
    const count = state.board.doors.length
    if (count === 0) return null
    return (
      <p className="mt-4 rounded-xl bg-zinc-950/50 p-3 text-zinc-400">
        🚪 {count} Closed Door{count > 1 ? 's' : ''} on the board. Stand next to one{mageHand ? ' (or on its tile, with Mage Hand)' : ''} to open it.
      </p>
    )
  }
  const attack = canSpendAttack(state, hero)
  // A door the adventure waits for that the board couldn't put down (no room): the old button.
  const special = revealsReady(state.adventure, true).filter((r) => !state.board.doors.some((d) => d.reveal === r.tile))
  return (
    <div className="mt-4 rounded-xl bg-zinc-950/50 p-3">
      {special.length > 0 && <SpecialDoors special={special} dispatch={dispatch} />}
      {shut.length > 0 && (
        <>
          <p className="text-lg text-zinc-100">🚪 {mageHand ? 'A Closed Door on your tile (Mage Hand).' : 'Next to a Closed Door.'} Open it to see what kind it is.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {shut.map((door) => (
              <Button
                key={door.id}
                variant={door.reveal ? 'gold' : undefined}
                onClick={() => dispatch({ type: 'DOOR_REVEALED', pick: randomNumbers(1)[0], heroId: hero.id, doorId: door.id, ...cards })}
              >
                🚪 {label(door, 'Open')}
              </Button>
            ))}
          </div>
        </>
      )}
      {locked.length > 0 && (
        <div className={shut.length > 0 ? 'mt-3' : ''}>
          <p className="text-zinc-300">
            🔒 Next to a Locked Door. Instead of attacking, try to unlock it.
            {!attack && <span className="text-amber-300"> {hero.name} has no attack left this turn.</span>}
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            {locked.map((door) => (
              <Button key={door.id} variant={attack ? undefined : 'ghost'} onClick={() => dispatch({ type: 'DOOR_UNLOCK', doorId: door.id, heroId: hero.id, roll: rollD20(), free: !attack, ...cards })}>
                🎲 {label(door, attack ? 'Unlock' : 'Try anyway:')} ({DOOR_UNLOCK_ROLL}+)
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
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
          onClick={() => dispatch({ type: 'ADVENTURE_REVEAL', tile: reveal.tile, door: true, cards: monsters, villains, chambers, villagerCards, random: shuffleNumbers() })}
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
