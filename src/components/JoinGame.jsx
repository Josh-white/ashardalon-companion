import { useState } from 'react'
import { heroArt } from '../data/art.js'
import { HERO_COLORS, HERO_TEMPLATES } from '../data/heroes.js'
import { powerSlotsFor } from '../state/game.js'
import { useCards } from '../state/useCards.js'
import Art from './Art.jsx'
import { HeroAbilities, PowerSlots } from './HeroGallery.jsx'
import { rememberedName, rememberName, startingPicks } from './Setup.jsx'
import { Button } from './ui.jsx'

// The heroes nobody is playing yet, who can still join this game.
export const freeHeroes = (state) => HERO_TEMPLATES.filter((t) => !state.heroes.some((h) => h.key === t.key))

// Whether a new hero can join now: the game is going, and the roll for first turn is over.
export const canJoin = (state) => state.status === 'playing' && !(state.firstRoll && !state.firstRoll.winner) && freeHeroes(state).length > 0

// Joining a game that's already going (Easton wants in): pick a free hero, type a name, keep
// or change the suggested powers. The Pi puts the hero next to whoever's turn it is.
// `onJoined(heroKey)` makes this iPad that hero's screen; a computer ally leaves it here.
export default function JoinGame({ state, dispatch, deviceId, onJoined, onCancel }) {
  const { powers } = useCards()
  const [heroKey, setHeroKey] = useState(null)
  const [player, setPlayer] = useState(rememberedName)
  const [picks, setPicks] = useState([])
  const template = HERO_TEMPLATES.find((t) => t.key === heroKey)
  const active = state.heroes[state.turn.heroIndex]

  if (!template) {
    return (
      <section className="space-y-3">
        <h2 className="text-center font-display text-3xl font-bold text-amber-400">Join this game</h2>
        <p className="text-center text-zinc-300">
          Pick a hero. They join next to {active?.name ?? 'the party'} and take their turn right after.
          {state.campaign && ' In a campaign, a new hero starts at level 1 and stays for the next adventures.'}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {freeHeroes(state).map((t) => {
            const color = HERO_COLORS[t.color]
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setHeroKey(t.key)
                  setPicks(startingPicks(t, powers))
                }}
                className={`flex items-center gap-4 rounded-2xl border border-zinc-800 p-4 text-left transition active:scale-95 ${color.bg}`}
              >
                <Art name={heroArt(t.key)} className="w-16" />
                <span>
                  <span className={`block font-display text-2xl font-bold ${color.text}`}>{t.name}</span>
                  <span className="text-zinc-400">{t.className}</span>
                </span>
              </button>
            )
          })}
        </div>
        <div className="text-center">
          <Button onClick={onCancel}>← Back</Button>
        </div>
      </section>
    )
  }

  const color = HERO_COLORS[template.color]
  const slots = powerSlotsFor(template)
  const mine = powers.filter((c) => c.hero === template.key)
  // Every slot that has cards to choose from needs one.
  const chosen = slots.every((type, i) => picks[i] || !mine.some((c) => c.type === type))
  const join = (ally) => {
    dispatch({ type: 'JOIN_GAME', heroKey: template.key, player: ally ? '' : player.trim(), picks, ally, deviceId })
    if (!ally) {
      rememberName(player)
      onJoined(template.key)
    } else onCancel()
  }

  return (
    <section className={`space-y-4 rounded-2xl border border-zinc-800 p-4 ring-2 ${color.ring} ${color.bg}`}>
      <div className="flex items-start gap-3">
        <Art name={heroArt(template.key)} className="w-20" />
        <div className="mr-auto">
          <h2 className={`font-display text-3xl font-bold ${color.text}`}>{template.name} joins the game</h2>
          <p className="text-zinc-400">{template.className}</p>
        </div>
        <button type="button" className="py-2 text-sm text-zinc-400 underline" onClick={() => setHeroKey(null)}>
          Pick a different hero
        </button>
      </div>
      <HeroAbilities template={template} level={1} className="text-sm" />
      <label className="block">
        <span className="text-xs tracking-widest text-zinc-400 uppercase">Your name</span>
        <input
          className="mt-1 w-full rounded-xl border border-amber-900/70 bg-black/60 px-3 py-2 text-xl text-zinc-100"
          placeholder="Type your name to join"
          value={player}
          onChange={(e) => setPlayer(e.target.value)}
        />
      </label>
      <div>
        <h3 className="mb-2 font-display text-2xl font-bold text-amber-400">Your powers</h3>
        <PowerSlots template={template} slots={slots} picks={picks} powers={powers} onPick={(slot, card) => setPicks((p) => p.map((c, i) => (i === slot ? card : c)))} />
      </div>
      <Button variant="gold" className="w-full py-3 text-xl" disabled={!player.trim() || !chosen} onClick={() => join(false)}>
        {!player.trim() ? 'Type your name to join' : chosen ? `🔥 Join as ${template.name}` : 'Pick every power to join'}
      </Button>
      {state.board && (
        <Button className="w-full" disabled={!chosen} onClick={() => join(true)}>
          🤖 Let the computer play {template.name} instead
        </Button>
      )}
    </section>
  )
}
