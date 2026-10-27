import { HERO_COLORS } from '../data/heroes.js'
import { FEATURE_LABELS, MAX_SURGES, MIN_SURGES, goalParts, missingFeatures, tilesToCome } from '../state/adventure.js'
import { randomNumbers } from '../state/random.js'
import { useCards } from '../state/useCards.js'
import { Button } from './ui.jsx'

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
            {adventure.setup.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </>
      )}
    </div>
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
  if (parts.length === 0) return null
  return (
    <ul className={`mt-2 space-y-1 ${big ? '' : 'text-base'}`}>
      {parts.map((part) => (
        <li key={part.key} className={part.done ? 'text-emerald-300' : 'text-zinc-200'}>
          {part.done ? '✓' : '○'} {part.label}
          {part.progress && <span className="text-zinc-400"> · {part.progress}</span>}
        </li>
      ))}
    </ul>
  )
}

// The adventure's box on the iPads and the table: goal, progress, tokens to pick up,
// escaping, the rules to remember, and any read-aloud text.
export function AdventurePanel({ state, dispatch }) {
  const adventure = state.adventure
  if (!adventure) return null
  const { card } = adventure
  const loose = adventure.tokens.filter((t) => !t.heldBy)
  return (
    <section className="space-y-3">
      {adventure.story && <Story story={adventure.story} dispatch={dispatch} />}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-xs uppercase tracking-widest text-zinc-500">Adventure</p>
        <h2 className="font-display text-2xl font-bold text-amber-400">{heading(card)}</h2>
        <p className="text-zinc-300">{card.goal}</p>
        <Goal state={state} />
        {loose.map((token) => (
          <div key={token.name} className="mt-3">
            <p className="text-zinc-300">Who ended their Hero Phase next to the {token.name} and picked it up?</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {state.heroes.map((hero) => (
                <Button key={hero.id} className={HERO_COLORS[hero.color].text} onClick={() => dispatch({ type: 'ADVENTURE_TAKE_TOKEN', name: token.name, heroId: hero.id })}>
                  {hero.name}
                </Button>
              ))}
            </div>
          </div>
        ))}
        {card.win.escape && (
          <Button className="mt-3" variant={adventure.escaped ? 'default' : 'gold'} onClick={() => dispatch({ type: 'ADVENTURE_ESCAPED', escaped: !adventure.escaped })}>
            {adventure.escaped ? '✓ Escaped (tap to undo)' : 'We escaped the dungeon!'}
          </Button>
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
    </section>
  )
}

// In the Exploration Phase: a button for each special tile the adventure is waiting for.
export function RevealButtons({ state, dispatch }) {
  const { monsters } = useCards()
  const tiles = tilesToCome(state.adventure)
  if (tiles.length === 0) return null
  return (
    <div className="mt-4 rounded-xl bg-zinc-950/50 p-3">
      <p className="text-zinc-300">Is the new tile a special one?</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {tiles.map((reveal) => (
          <Button
            key={reveal.tile}
            variant="gold"
            onClick={() => dispatch({ type: 'ADVENTURE_REVEAL', tile: reveal.tile, cards: monsters, random: randomNumbers(SHUFFLE_NUMBERS) })}
          >
            It's the {reveal.tile}!
          </Button>
        ))}
      </div>
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
        <Goal state={state} big />
      </div>
    </section>
  )
}
