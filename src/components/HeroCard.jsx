import { useState } from 'react'
import { heroArt, heroCardArt } from '../data/art.js'
import { CONDITIONS, HERO_COLORS, MAX_LEVEL, XP_TO_LEVEL_UP, hasAbility } from '../data/heroes.js'
import { itemSpeed } from '../data/items.js'
import { heroAc } from '../data/powerEffects.js'
import { artUrl, useArt } from '../state/useArt.js'
import { useCards } from '../state/useCards.js'
import Art from './Art.jsx'
import { MonsterChoice } from './Pickers.jsx'
import PowerList from './PowerList.jsx'
import { ItemList } from './Treasure.jsx'
import { Button, Chip, HpBar } from './ui.jsx'

// Blade Barrier and Flaming Sphere tokens deal 1 damage to the monsters you tap.
function TokenDamage({ state, hero, source, label, prompt, many, disabled, dispatch }) {
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState([])
  const tap = (id) => setChosen((list) => (many ? (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]) : [id]))
  const close = () => {
    setOpen(false)
    setChosen([])
  }
  if (!open) {
    return (
      <Button className="w-full text-left" disabled={disabled || state.monsters.length === 0} onClick={() => setOpen(true)}>
        {label}
      </Button>
    )
  }
  return (
    <div className="space-y-2 rounded-xl border border-red-700 bg-zinc-950/80 p-3">
      <p className="text-zinc-200">{prompt}</p>
      <MonsterChoice state={state} chosen={chosen} onToggle={tap} />
      <div className="flex gap-2">
        <Button
          variant="danger"
          className="flex-1"
          disabled={chosen.length === 0}
          onClick={() => {
            dispatch({ type: 'POWER_DAMAGE', source, heroId: hero.id, monsterIds: chosen })
            close()
          }}
        >
          1 damage{chosen.length > 1 ? ' each' : ''}
        </Button>
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

// What the hero's powers have left on them: shields, mirror images, tokens on the board.
function PowerMarkers({ state, hero, dispatch }) {
  const tokens = hero.tokens ?? {}
  const caster = state.heroes.find((h) => h.id === hero.shieldedBy)
  const lines = [
    caster && `🛡️ +2 AC from ${caster.name}'s Cleric's Shield`,
    tokens.mirrorImage > 0 && `🪞 ${tokens.mirrorImage} mirror image${tokens.mirrorImage > 1 ? 's' : ''}: +${2 * tokens.mirrorImage} AC. A miss pops one.`,
    tokens.invisible && "👻 Invisible: monsters don't count you as the closest hero until your next turn.",
    tokens.refuge && '✨ In the Astral Refuge: off the board until your next turn.',
  ].filter(Boolean)
  if (lines.length === 0 && !(tokens.bladeBarrier > 0) && !(tokens.flamingSphere > 0) && !(tokens.caltrops > 0)) return null
  return (
    <div className="mt-3 space-y-2">
      {lines.map((line) => (
        <p key={line} className="rounded-lg bg-zinc-950/60 px-3 py-2 text-sm text-sky-200">
          {line}
        </p>
      ))}
      {tokens.bladeBarrier > 0 && (
        <TokenDamage
          state={state}
          hero={hero}
          dispatch={dispatch}
          source="bladeBarrier"
          label={`🗡️ Blade Barrier (${tokens.bladeBarrier} left): a monster was put on one`}
          prompt="Which monster landed on a Blade Barrier token? Take that token off the board."
        />
      )}
      {tokens.caltrops > 0 && (
        <TokenDamage
          state={state}
          hero={hero}
          dispatch={dispatch}
          source="caltrops"
          label={`📌 Caltrops (${tokens.caltrops} left): a monster was put on one`}
          prompt="Which monster was put on a Caltrop token? Take that token off the board."
        />
      )}
      {tokens.flamingSphere > 0 && (
        <TokenDamage
          state={state}
          hero={hero}
          dispatch={dispatch}
          source="flamingSphere"
          many
          disabled={state.turn.sphereBurned}
          label={
            state.turn.sphereBurned
              ? `🔥 Flaming Sphere (${tokens.flamingSphere} left): already burned this turn`
              : `🔥 Flaming Sphere (${tokens.flamingSphere} left): burn its tile`
          }
          prompt="Tap every monster on the Flaming Sphere's tile. Take 1 sphere token off. Do this at the end of your Hero Phase."
        />
      )}
    </div>
  )
}

// Hero card abilities the app can't settle alone, because only the players know who is on
// whose tile: Quinn's Saving Grace, Keyleth's Healing Hands and Tarak's Brutal Recovery.
function AbilityOffers({ state, hero, dispatch }) {
  const offers = state.turn.abilityOffers ?? {}
  const quinn = state.heroes.find((h) => hasAbility(h, 'saving-grace'))
  const keyleth = state.heroes.find((h) => hasAbility(h, 'healing-hands'))
  const grace = offers.savingGrace?.includes(hero.id) && hero.conditions.length > 0
  const hands = offers.healingHands?.includes(hero.id) && hero.hp < hero.maxHp
  const brutal = offers.brutalRecovery && hasAbility(hero, 'brutal-recovery')
  if (!grace && !hands && !brutal) return null
  const onTile = (other) => (other.id === hero.id ? '' : ` (if ${hero.name} is on ${other.name}'s tile)`)
  return (
    <div className="mt-3 space-y-2">
      {grace && (
        <div className="space-y-2 rounded-xl border border-sky-700 bg-zinc-950/70 p-3">
          <p className="text-sm text-sky-200">
            ✨ {quinn.name}'s Saving Grace: {hero.name} got healed, so {hero.name} can also end one condition{onTile(quinn)}.
          </p>
          <div className="flex flex-wrap gap-2">
            {hero.conditions.map((condition) => (
              <Button key={condition} onClick={() => dispatch({ type: 'SAVING_GRACE', heroId: hero.id, condition })}>
                End {condition}
              </Button>
            ))}
          </div>
        </div>
      )}
      {hands && (
        <Button className="w-full text-left" onClick={() => dispatch({ type: 'HEALING_HANDS', heroId: hero.id })}>
          🙌 {keyleth.name}'s Healing Hands: +1 HP for that healing surge{onTile(keyleth)}
        </Button>
      )}
      {brutal && (
        <Button className="w-full text-left" onClick={() => dispatch({ type: 'BRUTAL_RECOVERY' })}>
          💪 Brutal Recovery: that natural 20 flips Furious Assault back over (if the hero who rolled it is on {hero.name}'s tile)
        </Button>
      )}
    </div>
  )
}

// natural20: this hero rolled a natural 20 on an attack this turn, the one time it can level up.
// state: the whole game, for powers that pick another hero or a monster. Optional.
// showCardArt: put the big art from the hero card behind it (the player's own iPad).
export default function HeroCard({ state, hero, isActive, xp, surges, dispatch, powersInTurnGuide = false, natural20 = false, showCardArt = false }) {
  const color = HERO_COLORS[hero.color]
  const down = hero.hp === 0
  const abilities = (useCards().abilities ?? []).filter((a) => a.hero === hero.key && a.level <= hero.level)
  const cardArt = artUrl(useArt(), showCardArt ? heroCardArt(hero.key) : null)

  return (
    <div
      className={`relative isolate overflow-hidden rounded-2xl border border-zinc-800 p-4 transition ${color.bg} ${
        isActive ? `ring-4 ${color.ring}` : ''
      } ${down ? 'opacity-80' : ''}`}
    >
      {cardArt && (
        // Faded into the card so the numbers and buttons stay easy to read.
        <img
          src={cardArt}
          alt=""
          className={`card-art pointer-events-none absolute inset-y-0 right-0 -z-10 h-full w-3/4 object-cover object-top opacity-30 ${down ? 'grayscale' : ''}`}
        />
      )}
      <div className="flex items-start gap-3">
        <Art name={heroArt(hero.key)} className={`w-20 ${down ? 'grayscale' : ''}`} />
        <div className="mr-auto">
          <h3 className={`font-display text-2xl font-bold ${color.text}`}>
            {hero.name}
            {hero.level >= 2 && <span className="ml-2 text-base text-amber-400">★ Lv {hero.level}</span>}
          </h3>
          <p className="text-sm text-zinc-400">
            {hero.className}
            {hero.player && ` · ${hero.player}`}
          </p>
        </div>
        <div className="text-right text-sm text-zinc-400">
          <div>AC {heroAc(hero)}{(hero.curses ?? []).some((c) => c.card?.acPenalty) && <span className="text-red-400"> (cursed)</span>}</div>
          <div>Speed {hero.speed + itemSpeed(hero)}</div>
          {hero.gold != null && <div className="text-amber-300">💰 {hero.gold.toLocaleString()} gold</div>}
        </div>
      </div>

      {abilities.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-zinc-300">
          {abilities.map((ability) => (
            <li key={ability.name}>
              <span className="font-semibold text-amber-300">{ability.name}:</span> {ability.text}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-center gap-3">
        <Button className="h-14 w-14 !px-0 text-3xl" onClick={() => dispatch({ type: 'ADJUST_HP', heroId: hero.id, amount: -1 })}>
          −
        </Button>
        <div className="flex-1 text-center">
          <div className="text-4xl font-bold text-zinc-100">
            {hero.hp}
            <span className="text-xl text-zinc-500"> / {hero.maxHp}</span>
          </div>
          <HpBar hp={hero.hp} maxHp={hero.maxHp} />
        </div>
        <Button className="h-14 w-14 !px-0 text-3xl" onClick={() => dispatch({ type: 'ADJUST_HP', heroId: hero.id, amount: 1 })}>
          +
        </Button>
      </div>

      {down && (
        <div className="mt-3 rounded-xl bg-red-950/70 p-3 text-center">
          <p className="font-bold text-red-300">{hero.name} is down!</p>
          <Button variant={surges > 0 ? 'gold' : 'danger'} className="mt-2" onClick={() => dispatch({ type: 'USE_SURGE', heroId: hero.id })}>
            {surges > 0 ? `Use a healing surge (heal to ${hero.surgeValue})` : 'No surges left: the party falls'}
          </Button>
        </div>
      )}

      {(hero.curses ?? []).length > 0 && (
        <ul className="mt-3 space-y-1">
          {hero.curses.map((curse) => (
            <li key={curse.id} className="flex items-start justify-between gap-2 rounded-lg bg-purple-950/60 p-2 text-sm text-purple-200">
              <details>
                <summary className="font-semibold">🕯️ Cursed: {curse.name}</summary>
                <p className="mt-1 whitespace-pre-line text-purple-300">{curse.text}</p>
              </details>
              <Button variant="ghost" className="shrink-0 text-xs" onClick={() => dispatch({ type: 'REMOVE_CURSE', heroId: hero.id, curseId: curse.id })}>
                Discard
              </Button>
            </li>
          ))}
        </ul>
      )}

      {state && <PowerMarkers state={state} hero={hero} dispatch={dispatch} />}
      {state && dispatch && <AbilityOffers state={state} hero={hero} dispatch={dispatch} />}

      <PowerList state={state} hero={hero} dispatch={dispatch} tilesHidden={powersInTurnGuide} />
      <ItemList state={state} hero={hero} dispatch={dispatch} />

      <div className="mt-3 flex flex-wrap gap-2">
        {CONDITIONS.map((condition) => (
          <Chip
            key={condition}
            active={hero.conditions.includes(condition)}
            onClick={() => dispatch({ type: 'TOGGLE_HERO_CONDITION', heroId: hero.id, condition })}
          >
            {condition}
          </Chip>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {hero.level < MAX_LEVEL && (
          <Button
            variant="ghost"
            className="text-sm"
            disabled={!natural20 || xp < XP_TO_LEVEL_UP}
            title="Roll a natural 20 on an attack and spend 5 XP, then flip your hero card"
            onClick={() => dispatch({ type: 'LEVEL_UP', heroId: hero.id })}
          >
            Level up (5 XP)
          </Button>
        )}
      </div>
    </div>
  )
}
