import { useState } from 'react'
import { CONDITIONS, HERO_COLORS } from '../data/heroes.js'
import { heroItems, tileGuards } from '../data/items.js'
import { foes } from '../state/game.js'
import { randomNumbers, rollD20 } from '../state/random.js'
import { useCards } from '../state/useCards.js'
import { HeroChoice, MonsterChoice } from './Pickers.jsx'
import { Button } from './ui.jsx'

// Enough random numbers to shuffle the whole treasure deck.
const SHUFFLE_NUMBERS = 128

const RANGE_WORDS = { adjacent: 'next to you', within1: 'within 1 tile' }

// What an item does all the time, in short words of our own: "+1 attack vs monsters next to you".
export function itemBonuses(card) {
  if (!card?.inPlay) return []
  const against = (range) => (range ? ` vs monsters ${RANGE_WORDS[range]}` : '')
  return [
    card.attackBonus > 0 && `+${card.attackBonus} attack${against(card.attackRange)}`,
    card.stillBonus > 0 && `+${card.attackBonus + card.stillBonus} instead if you don't move`,
    card.damageBonus > 0 && `+${card.damageBonus} damage${against(card.damageRange)}`,
    card.critFrom > 0 && `+1 damage on a natural ${card.critFrom === 20 ? 20 : `${card.critFrom}+`}`,
    card.acBonus > 0 && `+${card.acBonus} AC`,
    card.tileAcBonus > 0 && `+${card.tileAcBonus} AC for you and every hero on your tile`,
    card.speedBonus > 0 && `+${card.speedBonus} speed`,
    card.trapBonus > 0 && `+${card.trapBonus} to disable traps`,
  ].filter(Boolean)
}

const AFTER_WORDS = { flip: 'Flips over after you use it.', discard: 'Discarded after you use it.' }

function TreasureCardFace({ card }) {
  const bonuses = itemBonuses(card)
  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-widest text-amber-400">Treasure</p>
      <h3 className="font-display text-3xl font-bold text-zinc-100">{card.name}</h3>
      {card.flavor && <p className="mt-1 italic text-zinc-400">{card.flavor}</p>}
      {card.text && <p className="mt-3 whitespace-pre-line text-lg text-zinc-100">{card.text}</p>}
      {bonuses.length > 0 && <p className="mt-2 text-amber-200">✨ The app adds: {bonuses.join(', ')}.</p>}
    </div>
  )
}

// The treasure card just drawn. The hero who found it keeps it, or hands it to someone.
function TreasureCard({ state, dispatch }) {
  const { treasure } = state
  const [ownerId, setOwnerId] = useState(treasure.heroId)
  const finder = state.heroes.find((h) => h.id === treasure.heroId)
  const owner = state.heroes.find((h) => h.id === ownerId) ?? finder
  return (
    <div className="space-y-4 rounded-2xl border-2 border-amber-500 bg-amber-950/40 p-4">
      <TreasureCardFace card={treasure.card} />
      <p className="text-lg text-zinc-200">
        {finder?.name} found it. Who keeps it?
      </p>
      <HeroChoice heroes={state.heroes} chosen={[owner.id]} onToggle={setOwnerId} />
      <Button variant="gold" className="w-full py-3 text-lg" onClick={() => dispatch({ type: 'KEEP_TREASURE', heroId: owner.id })}>
        {treasure.card.inPlay ? `Put it in play for ${owner.name}` : `${owner.name} keeps it`}
      </Button>
    </div>
  )
}

// After the first monster of a turn is defeated: draw the treasure card, then hand it out.
// It sits at the bottom of the screen until it's done, so nobody has to scroll to find it.
// `heroId` shows it on one hero's iPad only when it's their turn or their treasure.
export function TreasureStep({ state, dispatch, heroId = null }) {
  const { treasures } = useCards()
  const owed = state.turn.treasureOwed
  const active = state.heroes[state.turn.heroIndex]?.id
  const finderId = state.treasure?.heroId ?? owed ?? state.turn.tokenOwed
  if (!finderId || (heroId && heroId !== active && heroId !== finderId)) return null
  const finder = state.heroes.find((h) => h.id === finderId)
  let body
  if (!state.treasure && !owed) {
    body = <TokenDraw state={state} dispatch={dispatch} finder={finder} />
  } else if (state.treasure) {
    body = <TreasureCard key={state.treasure.id} state={state} dispatch={dispatch} />
  } else if (!state.treasureDeck && treasures.length === 0) {
    body = <div className="rounded-xl bg-amber-950/60 p-3 text-lg text-amber-100">💰 {finder?.name} draws a treasure card from the deck.</div>
  } else {
    body = (
      <Button
        variant="gold"
        className="w-full px-5 py-4 text-xl font-bold"
        onClick={() => dispatch({ type: 'DRAW_TREASURE', cards: treasures, random: randomNumbers(SHUFFLE_NUMBERS) })}
      >
        💰 Draw a treasure card for {finder?.name}
      </Button>
    )
  }
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 max-h-[85vh] overflow-y-auto border-t-4 border-amber-500 bg-zinc-950/95 p-4 shadow-2xl">
      <div className="mx-auto max-w-3xl">{body}</div>
    </div>
  )
}

// A campaign: defeating a monster earns a Treasure token. The app draws from its own stack
// when the card file lists the tokens; otherwise the player draws a real one and says what it is.
const TOKEN_GOLD = [50, 100, 150, 200, 250, 500]

function TokenDraw({ state, dispatch, finder }) {
  const virtual = state.tokenStack?.length > 0
  if (virtual) {
    return (
      <Button variant="gold" className="w-full px-5 py-4 text-xl font-bold" onClick={() => dispatch({ type: 'DRAW_TREASURE_TOKEN' })}>
        💰 Draw a Treasure token for {finder?.name}
        {state.environment?.cardId === 'dragon-s-tribute' && <span className="block text-base font-normal">Dragon's Tribute: the app draws two and keeps the lower one.</span>}
      </Button>
    )
  }
  return (
    <div className="rounded-xl bg-amber-950/60 p-3">
      <p className="text-lg text-amber-100">💰 {finder?.name} draws a Treasure token from the stack. What does it say?</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {TOKEN_GOLD.map((gold) => (
          <Button key={gold} onClick={() => dispatch({ type: 'DRAW_TREASURE_TOKEN', token: { gold } })}>
            {gold} gold
          </Button>
        ))}
        <Button variant="gold" className="col-span-2" onClick={() => dispatch({ type: 'DRAW_TREASURE_TOKEN', token: { treasure: true } })}>
          Treasure!
        </Button>
        <Button variant="ghost" onClick={() => dispatch({ type: 'DRAW_TREASURE_TOKEN', token: { gold: 0 } })}>
          None left
        </Button>
      </div>
    </div>
  )
}

// True while a treasure card or token is waiting to be drawn or handed out, so the turn can't pass.
export function treasurePending(state, treasures) {
  return Boolean(state.treasure) || Boolean(state.turn.tokenOwed) || Boolean(state.turn.treasureOwed && (state.treasureDeck || treasures.length > 0))
}

// Using an item: asks who or what it's for when it needs to know, then the app does it.
function ItemPanel({ state, hero, item, dispatch, onClose }) {
  const { monsters: monsterCards } = useCards()
  const { card } = item
  const [chosen, setChosen] = useState(card.use === 'heal' ? [hero.id] : [])
  const [condition, setCondition] = useState(null)
  const [targetId, setTargetId] = useState(null)
  const picked = state.heroes.find((h) => h.id === chosen[0])
  const pickOne = (id) => {
    setChosen([id])
    setCondition(null)
  }
  const send = (extra = {}) => {
    dispatch({ type: 'USE_ITEM', heroId: hero.id, itemId: item.id, heroIds: chosen, condition, targetId, ...extra })
    onClose()
  }
  const usedPowers = hero.powers.filter((p) => p.used)
  const usedItems = card.use === 'refreshAny' ? heroItems(hero).filter((i) => i.used && i.id !== item.id) : []
  const withConditions = state.heroes.filter((h) => h.conditions.length > 0)

  let body = null
  let ready = true
  if (card.use === 'heal') {
    body = (
      <>
        <p className="text-zinc-200">Who gets {card.heal} HP? {hero.name}, or a hero next to {hero.name}.</p>
        <HeroChoice heroes={state.heroes} chosen={chosen} onToggle={pickOne} />
      </>
    )
  } else if (card.use === 'endCondition') {
    ready = Boolean(condition)
    body = (
      <>
        <p className="text-zinc-200">Whose condition ends? {hero.name}, or a hero next to {hero.name}.</p>
        {withConditions.length === 0 ? (
          <p className="text-zinc-400">Nobody has a condition right now.</p>
        ) : (
          <HeroChoice heroes={withConditions} chosen={chosen} onToggle={pickOne} />
        )}
        {picked && (
          <div className="flex flex-wrap gap-2">
            {picked.conditions.filter((c) => CONDITIONS.includes(c)).map((c) => (
              <Button key={c} variant={condition === c ? 'gold' : 'default'} onClick={() => setCondition(c)}>
                End {c}
              </Button>
            ))}
          </div>
        )}
      </>
    )
  } else if (card.use === 'refreshPower' || card.use === 'refreshAny') {
    ready = Boolean(targetId)
    const options = [...usedPowers, ...usedItems]
    body =
      options.length === 0 ? (
        <p className="text-zinc-400">{hero.name} has nothing used to flip back up.</p>
      ) : (
        <>
          <p className="text-zinc-200">Which one flips back up?</p>
          <div className="grid grid-cols-2 gap-2">
            {options.map((o) => (
              <Button key={o.id} variant={targetId === o.id ? 'gold' : 'default'} onClick={() => setTargetId(o.id)}>
                {o.name}
              </Button>
            ))}
          </div>
        </>
      )
  } else if (card.use === 'levelUp') {
    ready = hero.level === 1
    body = (
      <p className="text-zinc-200">
        {hero.level === 1 ? `${hero.name} reaches level 2! No XP or natural 20 needed.` : `${hero.name} is already level 2.`}
      </p>
    )
  } else if (card.use === 'polymorph') {
    ready = Boolean(targetId)
    body = (
      <>
        <p className="text-zinc-200">Which monster within 2 tiles turns into something else? The app draws its new monster card.</p>
        <MonsterChoice state={state} chosen={targetId ? [targetId] : []} onToggle={setTargetId} />
      </>
    )
  } else if (card.use === 'caltrops') {
    body = <p className="text-zinc-200">Put {card.tokens} Caltrop tokens on squares of {hero.name}'s tile. When a monster is put on one, tap it on {hero.name}'s card.</p>
  } else if (card.use === 'reduceDamage') {
    body = <p className="text-zinc-200">Use it right after {hero.name} takes damage: 1 of it comes back.</p>
  } else if (card.use === 'reroll') {
    body = (
      <p className="text-zinc-200">
        Roll that die again. A missed attack offers the charm right in the attack box. For any other roll, tap Undo first, then use the charm and roll again.
      </p>
    )
  } else {
    body = <p className="text-zinc-200">{card.note || 'Do what the card says.'}</p>
  }

  return (
    <div className="col-span-2 space-y-3 rounded-xl border-2 border-amber-500 bg-zinc-950/80 p-3">
      <p className="font-display text-lg font-bold text-amber-300">Use the {item.name}</p>
      {body}
      {card.after && <p className="text-sm text-zinc-400">{AFTER_WORDS[card.after]}</p>}
      <div className="flex gap-2">
        <Button
          variant="gold"
          className="flex-1"
          disabled={!ready}
          onClick={() => send(card.use === 'polymorph' ? { monsterId: targetId, cards: monsterCards, random: randomNumbers(SHUFFLE_NUMBERS) } : {})}
        >
          Use it
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function ItemTile({ item, selected, onTap }) {
  const [open, setOpen] = useState(false)
  const { card } = item
  const bonuses = itemBonuses(card)
  const usable = !item.used && card.use && card.use !== 'monsterControl'
  return (
    <div
      role="button"
      onClick={onTap}
      className={`cursor-pointer select-none rounded-lg border px-3 py-2 text-left text-sm transition ${
        item.used ? 'border-zinc-800 bg-zinc-900 text-zinc-600' : 'border-yellow-600/60 bg-zinc-950/60 text-zinc-100'
      } ${selected ? 'ring-2 ring-amber-400' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs uppercase tracking-wide text-yellow-500/80">
          {card.inPlay ? 'Item · in play' : 'Item'}
          {item.used && ' · used'}
        </span>
        {card.text && (
          <button
            type="button"
            className="-my-1 rounded px-2 text-xs text-zinc-400 hover:bg-zinc-800"
            onClick={(e) => {
              e.stopPropagation()
              setOpen((o) => !o)
            }}
          >
            {open ? 'Hide' : 'Read'}
          </button>
        )}
      </div>
      <div className={`font-semibold ${item.used ? 'line-through' : ''}`}>💰 {item.name}</div>
      {bonuses.length > 0 && <div className="text-xs text-amber-300">{bonuses.join(' · ')}</div>}
      {card.attack && <div className="text-xs text-zinc-400">Attack +{card.attack.bonus} · Damage {card.attack.damage} (in the attack box)</div>}
      {card.use === 'monsterControl' && !item.used && <div className="mt-1 text-xs text-amber-400">Use it on a monster's turn</div>}
      {usable && <div className="mt-1 text-xs text-amber-400">Tap to use</div>}
      {open && <p className="mt-2 whitespace-pre-line text-zinc-300">{card.text}</p>}
    </div>
  )
}

// The treasure items in front of a hero. Tapping one uses it, or opens its card's choices.
export function ItemList({ state, hero, dispatch }) {
  const [openId, setOpenId] = useState(null)
  const items = heroItems(hero)
  if (items.length === 0) return null
  const open = items.find((i) => i.id === openId)
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {items.map((item) => (
        <ItemTile key={item.id} item={item} selected={item.id === openId} onTap={() => setOpenId(item.id === openId ? null : item.id)} />
      ))}
      {open && state && (
        <div className="col-span-2 space-y-2">
          {!open.used && open.card.use && open.card.use !== 'monsterControl' && (
            <ItemPanel key={open.id} state={state} hero={hero} item={open} dispatch={dispatch} onClose={() => setOpenId(null)} />
          )}
          <div className="flex flex-wrap gap-2">
            {(open.used || open.card.after === 'flip') && (
              <Button variant="ghost" className="text-sm" onClick={() => dispatch({ type: 'TOGGLE_ITEM', heroId: hero.id, itemId: open.id })}>
                {open.used ? 'Flip it back up' : 'Flip it over'}
              </Button>
            )}
            <Button
              variant="ghost"
              className="text-sm"
              onClick={() => {
                dispatch({ type: 'DISCARD_ITEM', heroId: hero.id, itemId: open.id })
                setOpenId(null)
              }}
            >
              Discard it
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// Blessed Shield: heroes on its owner's tile get its AC bonus. Asked for each hero an
// attack goes after, unless that hero owns the shield (their own AC already counts it).
export function TileGuardQuestion({ state, targets, guarded, onToggle }) {
  const rows = state.heroes
    .filter((h) => targets.includes(h.id))
    .map((hero) => ({ hero, guards: tileGuards(state.heroes, hero) }))
    .filter((r) => r.guards.length > 0)
  if (rows.length === 0) return null
  return (
    <div className="space-y-2 rounded-xl bg-sky-950/50 p-3">
      {rows.map(({ hero, guards }) => (
        <label key={hero.id} className="flex items-center gap-3 text-lg text-zinc-100">
          <input type="checkbox" className="h-6 w-6" checked={guarded.includes(hero.id)} onChange={() => onToggle(hero.id)} />
          <span>
            Is <span className={HERO_COLORS[hero.color].text}>{hero.name}</span> on {guards.map((g) => g.hero.name).join(' or ')}'s tile?
            <span className="text-sky-300"> Blessed Shield: +{Math.max(...guards.map((g) => g.bonus))} AC</span>
          </span>
        </label>
      ))}
    </div>
  )
}

// Scroll of Monster Control: on the active hero's monster's turn, it attacks another monster instead.
export function MonsterControl({ state, hero, monster, item, dispatch, onDone }) {
  const [targetId, setTargetId] = useState(null)
  const others = foes(state).filter((m) => m.id !== monster.id && m.ac)
  const attack = item.card.monsterAttack ?? { bonus: 9, damage: 1 }
  return (
    <div className="space-y-3 rounded-xl border border-amber-600 bg-amber-950/40 p-3">
      <p className="text-lg text-amber-100">
        📜 {hero.name}'s {item.name}: put the {monster.name} in any square within 1 tile. If it lands next to another monster, it attacks that one (+{attack.bonus}, {attack.damage} damage).
      </p>
      {others.length === 0 ? (
        <p className="text-zinc-400">There's no other monster for it to attack.</p>
      ) : (
        <MonsterChoice state={state} monsters={others} chosen={targetId ? [targetId] : []} onToggle={setTargetId} />
      )}
      <Button
        variant="gold"
        className="w-full"
        disabled={!targetId}
        onClick={() => {
          dispatch({ type: 'MONSTER_CONTROL', heroId: hero.id, itemId: item.id, monsterId: monster.id, targetId, roll: rollD20() })
          onDone()
        }}
      >
        🎲 Roll the {monster.name}'s attack on it
      </Button>
      <Button
        className="w-full"
        onClick={() => {
          dispatch({ type: 'DISCARD_ITEM', heroId: hero.id, itemId: item.id })
          onDone()
        }}
      >
        It isn't next to another monster: just discard the scroll
      </Button>
    </div>
  )
}

// The treasure card on the projector, while a hero decides who keeps it.
export function ProjectorTreasure({ treasure }) {
  if (!treasure) return null
  return (
    <div className="rounded-[1.2vw] border border-amber-600 bg-amber-950/50 p-[1vw]">
      <span className="font-display text-[2.4vw] font-bold text-amber-200">💰 {treasure.card.name}</span>
      {treasure.card.flavor && <p className="italic text-zinc-400">{treasure.card.flavor}</p>}
      <p className="whitespace-pre-line text-zinc-200">{treasure.card.text}</p>
    </div>
  )
}
