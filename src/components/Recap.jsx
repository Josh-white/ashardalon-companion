import { HERO_COLORS } from '../data/heroes.js'
import { recap } from '../state/stats.js'
import { campaignOutcome } from '../state/campaign.js'
import { CampaignRecap } from './Campaign.jsx'
import { Button } from './ui.jsx'

// The end-of-game recap, win or lose: what the party did, and an award for every
// hero. The projector shows it big with no buttons; the iPads can go back or start over.
// Sizes are in em, so the projector only has to set a bigger font.
const BIG_COLUMNS = ['', 'mx-auto max-w-[30em]', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4', 'grid-cols-5']

export default function Recap({ state, dispatch, big }) {
  const won = state.status === 'won'
  const { heroes, mvpIds, party } = recap(state)
  const title = state.adventure?.card.title
  const totals = [
    `${party.rounds} ${party.rounds === 1 ? 'round' : 'rounds'}`,
    `${party.kills} ${party.kills === 1 ? 'monster' : 'monsters'} defeated`,
    party.nat20s > 0 && `${party.nat20s} natural ${party.nat20s === 1 ? '20' : '20s'}`,
    party.treasure > 0 && `${party.treasure} ${party.treasure === 1 ? 'treasure' : 'treasures'} found`,
  ].filter(Boolean)

  return (
    <div className={`fixed inset-0 z-[35] overflow-y-auto bg-zinc-950 ${big ? 'p-[1.5vw] text-[1.2vw]' : 'p-4 text-base'}`}>
      <div className="mx-auto max-w-[60em] text-center">
        <div className="moment-pop text-[4em] leading-none">{won ? '🏆' : '💀'}</div>
        <h2 className={`moment-pop mt-[0.2em] font-display text-[2.6em] font-bold leading-tight ${won ? 'text-amber-400' : 'text-red-400'}`}>
          {won ? 'Victory!' : 'The party has fallen'}
        </h2>
        {title && <p className="text-[1.1em] uppercase tracking-widest text-zinc-500">{title}</p>}
        {won && state.adventure?.card.story.victory && (
          <p className="mx-auto mt-[0.5em] max-w-[40em] italic text-zinc-300">{state.adventure.card.story.victory}</p>
        )}
        <p className="mt-[0.5em] text-[1.1em] text-zinc-300">{totals.join(' · ')}</p>
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
                {hero.player || hero.name}
              </h3>
              {hero.player && <p className="text-[0.9em] text-zinc-400">{hero.name}</p>}
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
        <div className="mt-6 flex justify-center gap-3 pb-6">
          <Button onClick={() => dispatch({ type: 'RESUME' })}>Back to the game</Button>
          {/* Mid-campaign, the way on is the campaign's own button above. */}
          {(!state.campaign || campaignOutcome(state)?.over) && <Button
            variant="gold"
            onClick={() => window.confirm('Start a new game? This clears the recap for everyone.') && dispatch({ type: 'NEW_GAME' })}
          >
            New game
          </Button>}
        </div>
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
