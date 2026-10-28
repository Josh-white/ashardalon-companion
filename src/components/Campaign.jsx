import { HERO_COLORS, templateFor } from '../data/heroes.js'
import { campaignBoons, campaignHero, campaignOutcome, outcomeLines, shopSize } from '../state/campaign.js'
import { turnKey } from '../state/game.js'
import { randomNumbers } from '../state/random.js'
import { useCards } from '../state/useCards.js'
import { Button } from './ui.jsx'

const SHUFFLE_NUMBERS = 128
const gold = (n) => `${(n ?? 0).toLocaleString()} gold`
const heroName = (key) => templateFor(key)?.name ?? key

// Boons the party can use right now: a free tile before the first turn (Short Cut!,
// Bypassed Guards), or discarding a monster card just drawn (Kobolds Clobbered!...).
export function CampaignBoons({ state, dispatch }) {
  const { boons: boonCards, monsters: monsterCards, villains, chambers, villagers } = useCards()
  const used = state.adventure?.boonsUsed ?? []
  const boons = campaignBoons(state, boonCards).filter((b) => !used.includes(b.id))
  if (!state.campaign || state.status !== 'playing' || boons.length === 0) return null
  const { round, heroIndex, phase, tiles } = state.turn
  const atStart = round === 1 && heroIndex === 0 && phase === 0 && tiles?.explore === undefined
  const drawnNow = state.monsters.filter((m) => m.drawnAt === turnKey(state))
  const offers = boons.flatMap((boon) => {
    if (boon.use === 'startTile' && atStart) return [{ boon, label: `Use ${boon.name}: place the top dungeon tile now` }]
    if (boon.use === 'discardMonster') {
      return drawnNow
        .filter((m) => (m.card?.types ?? []).some((t) => boon.monsterTypes.some((want) => t.toLowerCase() === want.toLowerCase())))
        .map((m) => ({ boon, monster: m, label: `Use ${boon.name}: discard the ${m.name}` }))
    }
    return []
  })
  if (offers.length === 0) return null
  return (
    <div className="rounded-2xl border-2 border-sky-600 bg-sky-950/50 p-4">
      <p className="text-sm font-bold uppercase tracking-widest text-sky-300">Boon · once this adventure</p>
      <div className="mt-2 space-y-2">
        {offers.map(({ boon, monster, label }) => (
          <div key={`${boon.id}-${monster?.id ?? ''}`}>
            <Button
              variant="gold"
              className="w-full py-3 text-lg"
              onClick={() =>
                dispatch({ type: 'USE_BOON', boon, monsterId: monster?.id, cards: monsterCards, villains, chambers, villagerCards: villagers, random: randomNumbers(SHUFFLE_NUMBERS) })
              }
            >
              🎁 {label}
            </Button>
            {boon.text && <p className="mt-1 whitespace-pre-line text-sm text-sky-200">{boon.text}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

// On the recap: what this adventure meant for the campaign, and the way on to the next one.
export function CampaignRecap({ state, dispatch, big }) {
  const { boons, chambers, treasures } = useCards()
  const outcome = campaignOutcome(state)
  if (!outcome) return null
  const lines = outcomeLines(state, outcome, boons, chambers)
  return (
    <div className="mx-auto mt-[1em] max-w-[40em] rounded-[1em] border border-sky-700 bg-sky-950/40 p-[1em] text-center">
      <p className="text-[0.9em] font-bold uppercase tracking-widest text-sky-300">{state.campaign.card.title} · adventure {state.campaign.games + 1}</p>
      {lines.map((line) => (
        <p key={line} className="mt-[0.3em] text-[1.1em] text-zinc-100">
          {line}
        </p>
      ))}
      {!big && !outcome.over && (
        <Button
          variant="gold"
          className="mt-3 px-6 py-3 text-lg"
          onClick={() => dispatch({ type: 'CAMPAIGN_NEXT', treasureCards: treasures, boons, random: randomNumbers(SHUFFLE_NUMBERS) })}
        >
          On to the next adventure →
        </Button>
      )}
      {!big && !outcome.over && <p className="mt-2 text-sm text-zinc-400">Heroes keep their level, treasure and gold. The shop opens before the next adventure.</p>}
    </div>
  )
}

// The projector's lobby during a campaign: how far the party has got, its boons, the shop.
export function CampaignLobby({ state, dispatch }) {
  const { boons: boonCards, chambers } = useCards()
  const campaign = state.campaign
  const rules = campaign.card.campaign
  const boons = campaignBoons(state, boonCards)
  const chamberName = (id) => chambers.find((c) => c.id === id)?.name ?? id
  const end = () => window.confirm('End the campaign? The heroes lose their level, treasure and gold.') && dispatch({ type: 'END_CAMPAIGN' })
  return (
    <section className="rounded-2xl border border-sky-800 bg-zinc-900 p-4">
      <p className="text-sm font-bold uppercase tracking-widest text-sky-300">Campaign · adventure {campaign.games + 1}</p>
      <h2 className="font-display text-2xl font-bold text-amber-400">
        {campaign.card.number ? `Adventure ${campaign.card.number}: ` : ''}
        {campaign.card.title}
      </h2>
      <p className="mt-1 text-zinc-300">{campaign.card.goal}</p>
      <ul className="mt-3 space-y-1 text-zinc-200">
        <li>
          🏰 Chambers beaten: {campaign.beaten.length > 0 ? campaign.beaten.map(chamberName).join(', ') : 'none yet'} · {campaign.deck.length} Chamber{' '}
          {campaign.deck.length === 1 ? 'card' : 'cards'} left
        </li>
        {campaign.hard && <li>⚔️ The Elite Regiment was found: every encounter card is two.</li>}
        {campaign.defeats > 0 && rules.secondChance && <li>💀 One defeat so far: every adventure starts with one fewer healing surge. Another loses the campaign.</li>}
        <li>🎁 Boons: {boons.length > 0 ? boons.map((b) => b.name).join(', ') : 'none yet'}</li>
      </ul>
      <h3 className="mt-4 font-semibold text-amber-400">The heroes</h3>
      <ul className="mt-1 space-y-1 text-zinc-300">
        {campaign.heroes.map((h) => (
          <li key={h.key}>
            <span className={`font-semibold ${HERO_COLORS[templateFor(h.key)?.color]?.text ?? ''}`}>{heroName(h.key)}</span>
            {h.player && ` (${h.player})`} · level {h.level} · {gold(h.gold)}
            {h.items.length > 0 && ` · ${h.items.map((i) => i.name).join(', ')}`}
          </li>
        ))}
      </ul>
      {campaign.shop.length > 0 && (
        <>
          <h3 className="mt-4 font-semibold text-amber-400">The shop ({shopSize(state, boonCards)} cards)</h3>
          <p className="text-sm text-zinc-400">Each hero buys on their own iPad, with their own gold.</p>
          <ul className="mt-1 space-y-1 text-zinc-300">
            {campaign.shop.map((card, i) => (
              <li key={`${card.id}-${i}`}>
                {card.name} · {card.cost > 0 ? gold(card.cost) : 'not for sale'}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-4 text-sm text-zinc-400">
        Set up the table as the adventure says. Each player can swap powers on their iPad before getting ready.{' '}
        <button type="button" className="text-zinc-500 underline" onClick={end}>
          End the campaign
        </button>
      </p>
    </section>
  )
}

// On a hero's iPad in the campaign lobby: their gold and treasure, and the shop.
export function HeroCampaign({ state, heroKey, dispatch }) {
  const hero = campaignHero(state, heroKey)
  if (!hero) return null
  const shop = state.campaign.shop
  return (
    <div className="mt-4 rounded-xl bg-zinc-950/60 p-3">
      <p className="text-lg text-zinc-100">
        Level {hero.level} · 💰 {gold(hero.gold)}
      </p>
      {hero.items.length > 0 && <p className="text-zinc-300">Treasure: {hero.items.map((i) => i.name).join(', ')}</p>}
      {shop.length > 0 && (
        <>
          <h3 className="mt-3 font-display text-xl font-bold text-amber-400">The shop</h3>
          <ul className="mt-1 space-y-2">
            {shop.map((card, i) => (
              <li key={`${card.id}-${i}`} className="rounded-lg bg-zinc-900 p-2">
                <div className="flex items-center gap-2">
                  <span className="mr-auto font-semibold text-zinc-100">{card.name}</span>
                  {card.cost > 0 ? (
                    <Button variant="gold" disabled={hero.gold < card.cost} onClick={() => dispatch({ type: 'CAMPAIGN_BUY', heroKey, cardId: card.id })}>
                      Buy · {gold(card.cost)}
                    </Button>
                  ) : (
                    <span className="text-sm text-zinc-500">not for sale</span>
                  )}
                </div>
                {card.text && <p className="mt-1 whitespace-pre-line text-sm text-zinc-400">{card.text}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
