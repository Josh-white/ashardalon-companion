import { useState } from 'react'
import { heroLabel } from '../state/gameHelpers.js'
import { HERO_COLORS } from '../data/heroes.js'
import { defeatHighlights, recap } from '../state/stats.js'
import { campaignOutcome } from '../state/campaign.js'
import { randomNumbers, shuffleNumbers } from '../state/random.js'
import { useCards } from '../state/useCards.js'
import { findPlayer, recordKey } from '../state/records.js'
import { useRecords } from '../state/useRecords.js'
import { CampaignRecap } from './Campaign.jsx'
import { HallOfRecords } from './Records.jsx'
import { Button, useConfirm } from './ui.jsx'

// The end-of-game recap, win or lose: what the party did, and an award for every
// hero. The projector shows it big with no buttons; the iPads choose what's next: Try again
// after a loss, a new game, or finishing this one.
// Sizes are in em, so the projector only has to set a bigger font.
const BIG_COLUMNS = ['', 'mx-auto max-w-[30em]', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4', 'grid-cols-5']

// "New game" only resets the game this screen is in: other games on the Pi carry on, and
// Undo brings this one back.
export function newGameQuestion(state) {
  return {
    title: state.board ? 'Start a new solo game?' : 'Start a new game?',
    body: [
      state.board ? 'This solo game ends and you go back to the lobby.' : 'This game ends on every screen playing it, and everyone goes back to the lobby.',
      'Other games on the Pi are not touched. Changed your mind? Tap Undo.',
    ],
    yes: 'New game',
  }
}

export function tryAgainQuestion(state) {
  const title = state.adventure?.card.title
  return {
    title: 'Try again?',
    body: [
      `${title ? `${title} again` : 'The same game again'}, with the same heroes and power cards. Everyone starts back at level 1, with fresh decks and a new dungeon.`,
      'Changed your mind? Tap Undo.',
    ],
    yes: 'Try again',
  }
}

export const finishQuestion = (name) => ({
  title: `Finish "${name}"?`,
  body: ['It goes on the Finished list on the "Which game?" screen, where you can bring it back. Every screen in it goes back to the family game.'],
  yes: 'Finish and archive',
})

// After a loss, Try again is the big button. A campaign has its own way on.
export const canTryAgain = (state) => state.status === 'lost' && !state.campaign

export const LOST_QUESTION = { title: 'Did the party lose?', body: 'This shows the end-of-game recap.', yes: 'We lost', danger: true }

// `onFinish` ({ name, finish }) finishes and archives this game. Only a named game has
// one: the family game always stays.
// `contained` puts it over its parent (the play area under the top bars) instead of the
// whole window.
export default function Recap({ state, dispatch, big, onFinish, contained = false }) {
  const [ask, dialog] = useConfirm()
  const cards = useCards()
  const [hall, setHall] = useState(false)
  // The Pi adds this game to the records as it ends, so they're loaded again for each ending.
  const thisGame = recordKey(state)
  const records = useRecords(`${thisGame}:${state.status}:${hall}`)
  const won = state.status === 'won'
  const { heroes, mvpIds, party } = recap(state)
  const title = state.adventure?.card.title
  const totals = [
    `${party.rounds} ${party.rounds === 1 ? 'round' : 'rounds'}`,
    `${party.kills} ${party.kills === 1 ? 'monster' : 'monsters'} defeated`,
    party.nat20s > 0 && `${party.nat20s} natural ${party.nat20s === 1 ? '20' : '20s'}`,
    party.treasure > 0 && `${party.treasure} ${party.treasure === 1 ? 'treasure' : 'treasures'} found`,
  ].filter(Boolean)
  const highlights = won ? [] : defeatHighlights(state)
  const tryAgain = () =>
    ask(tryAgainQuestion(state), () =>
      dispatch({
        type: 'TRY_AGAIN',
        treasureCards: cards.treasures,
        chambers: cards.chambers,
        tokens: cards.treasureTokens,
        random: shuffleNumbers(),
        tileRandom: randomNumbers(8),
        // Only used when the lost game was on the virtual board.
        boardTiles: cards.tiles,
        boardRandom: randomNumbers(64),
      }),
    )
  // Mid-campaign, the way on is the campaign's own button above.
  const canNewGame = !state.campaign || campaignOutcome(state)?.over

  const place = contained ? 'absolute' : 'fixed'
  if (hall) {
    return (
      <div className={`${place} inset-0 z-[45] overflow-y-auto bg-zinc-950`}>
        <HallOfRecords onClose={() => setHall(false)} />
      </div>
    )
  }

  return (
    <div className={`${place} inset-0 z-[45] overflow-y-auto bg-zinc-950 ${won ? '' : 'recap-defeat'} ${big ? 'p-[1.5vw] text-[1.2vw]' : 'p-4 text-base'}`}>
      <div className="mx-auto max-w-[60em] text-center">
        <div className={`text-[4em] leading-none ${won ? 'moment-pop' : 'defeat-skull'}`}>{won ? '🏆' : '💀'}</div>
        <h2 className={`moment-pop mt-[0.2em] font-display text-[2.6em] font-bold leading-tight ${won ? 'text-amber-400' : 'text-red-400'}`}>
          {won ? 'Victory!' : 'The party has fallen'}
        </h2>
        {title && <p className="text-[1.1em] uppercase tracking-widest text-zinc-500">{title}</p>}
        {state.adventure?.card.practice && <p className="text-[0.95em] text-sky-300">🔄 Practice game: it isn't added to anyone's records. Pick new heroes with New game.</p>}
        {won && state.adventure?.card.story.victory && (
          <p className="mx-auto mt-[0.5em] max-w-[40em] italic text-zinc-300">{state.adventure.card.story.victory}</p>
        )}
        {!won && state.ending && <p className="mx-auto mt-[0.5em] max-w-[40em] italic text-zinc-300">{state.ending}</p>}
        {won ? (
          <p className="mt-[0.5em] text-[1.1em] text-zinc-300">{totals.join(' · ')}</p>
        ) : (
          <ul className="mx-auto mt-[0.8em] flex max-w-[50em] flex-wrap justify-center gap-[0.5em]">
            {highlights.map((line, i) => (
              <li
                key={line.label}
                className="moment-pop rounded-[0.8em] border border-red-900/60 bg-zinc-900/80 px-[0.8em] py-[0.4em] text-left"
                style={{ animationDelay: `${0.3 + i * 0.2}s` }}
              >
                <span className="block text-[0.8em] uppercase tracking-widest text-zinc-500">
                  {line.emoji} {line.label}
                </span>
                <span className="block text-[1.2em] font-bold text-zinc-100">{line.value}</span>
              </li>
            ))}
          </ul>
        )}
        {big && canTryAgain(state) && <p className="mt-[0.8em] text-[1.1em] text-amber-300">Try again, or start something new, from any iPad.</p>}
        <CampaignRecap state={state} dispatch={dispatch} big={big} />
      </div>

      <div className={`mx-auto mt-[1.5em] grid gap-[1em] ${big ? BIG_COLUMNS[heroes.length] : 'max-w-[70em] sm:grid-cols-2 lg:grid-cols-3'}`}>
        {heroes.map(({ hero, stats, awards }, i) => {
          const color = HERO_COLORS[hero.color]
          const mvp = mvpIds.includes(hero.id)
          return (
            <section
              key={hero.id}
              className={`moment-pop rounded-[1.2em] border p-[1em] text-left ${color.bg} ${mvp ? 'moment-glow border-amber-400' : 'border-zinc-800'}`}
              style={{ animationDelay: `${0.4 + i * 0.25}s` }}
            >
              <h3 className={`font-display text-[1.6em] font-bold leading-tight ${color.text}`}>
                {mvp && '👑 '}
                {heroLabel(hero)}
              </h3>
              {hero.player && <p className="text-[0.9em] text-zinc-400">{hero.name}</p>}
              <PlayerTitles record={findPlayer(records, hero.player)} thisGame={thisGame} />
              <ul className="mt-[0.6em] space-y-[0.4em]">
                {awards.slice(0, 3).map((award) => (
                  <li key={award.key} className="flex items-center gap-[0.5em] rounded-[0.8em] bg-zinc-950/60 px-[0.6em] py-[0.3em]">
                    <span className="text-[1.6em]">{award.emoji}</span>
                    <span>
                      <span className={`block font-bold ${award.key === 'mvp' ? 'text-amber-300' : 'text-zinc-100'}`}>{award.title}</span>
                      <span className="block text-[0.85em] text-zinc-400">{award.says}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <dl className={`mt-[0.8em] grid ${big && heroes.length > 3 ? 'grid-cols-1' : 'grid-cols-2'} gap-x-[0.8em] gap-y-[0.1em] text-[0.9em] text-zinc-400`}>
                <Stat label="Monsters" value={stats.kills} />
                <Stat label="Damage dealt" value={stats.damageDealt} />
                <Stat label="Natural 20s" value={stats.nat20s} />
                <Stat label="Damage taken" value={stats.damageTaken} />
                <Stat label="Treasure" value={stats.treasure} />
                <Stat label="Knocked down" value={stats.downs} />
              </dl>
            </section>
          )
        })}
      </div>

      {!big && (
        <div className="mx-auto mt-6 max-w-[40em] pb-6 text-center">
          {canTryAgain(state) && (
            <>
              <Button variant="gold" className="px-8 py-4 font-display text-2xl" onClick={tryAgain}>
                ⚔️ Try again
              </Button>
              <p className="mt-2 text-sm text-zinc-400">Same adventure, heroes and powers. Back to level 1, with fresh decks and a new dungeon.</p>
            </>
          )}
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            {canNewGame && (
              <Button
                variant={canTryAgain(state) ? 'default' : 'gold'}
                onClick={() => ask(newGameQuestion(state), () => dispatch({ type: 'NEW_GAME' }))}
              >
                New game
              </Button>
            )}
            {onFinish && <Button onClick={() => ask(finishQuestion(onFinish.name), onFinish.finish)}>Finish and archive</Button>}
            <Button variant="ghost" onClick={() => setHall(true)}>
              🏆 Hall of Records
            </Button>
            <Button variant="ghost" onClick={() => dispatch({ type: 'RESUME' })}>
              Back to the game
            </Button>
          </div>
        </div>
      )}
      {dialog}
    </div>
  )
}

// The player's best title, and any title this game just earned them, called out big.
function PlayerTitles({ record, thisGame }) {
  if (!record) return null
  const fresh = record.titles.filter((t) => t.newIn === thisGame)
  const freshTrophies = Object.values(record.trophies ?? {}).filter((t) => t.newIn === thisGame)
  const best = record.titles[0]
  return (
    <div className="mt-[0.4em] space-y-[0.3em]">
      {best && !fresh.includes(best) && (
        <p className="text-[0.9em] text-amber-200">
          {best.emoji} {best.title}
        </p>
      )}
      {fresh.map((t) => (
        <p key={t.key} className="moment-glow rounded-[0.8em] border border-amber-400 bg-amber-950/70 px-[0.6em] py-[0.3em]">
          <span className="block text-[0.75em] font-bold uppercase tracking-widest text-amber-400">New title!</span>
          <span className="block font-bold text-amber-100">
            {t.emoji} {t.title}
          </span>
          <span className="block text-[0.85em] text-zinc-400">{t.how}</span>
        </p>
      ))}
      {freshTrophies.length > 0 && (
        <p className="rounded-[0.8em] border border-red-800/70 bg-red-950/50 px-[0.6em] py-[0.3em]">
          <span className="block text-[0.75em] font-bold uppercase tracking-widest text-red-300">New in the trophy book!</span>
          <span className="block font-bold text-zinc-100">📖 {freshTrophies.map((t) => t.name).join(', ')}</span>
        </p>
      )}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="flex justify-between gap-[0.5em]">
      <dt>{label}</dt>
      <dd className="font-bold text-zinc-200">{value}</dd>
    </div>
  )
}
