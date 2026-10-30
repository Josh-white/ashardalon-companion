import { useState } from 'react'
import { tileAcBonus, tileGuards } from '../data/items.js'
import { acParts, attackParts, heroBadges, speedParts } from '../data/statParts.js'

// Blue is something helping, orange something hurting (told apart by lightness too).
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '+0')
const KIND_LABELS = { card: 'Hero card', item: 'Item', power: 'Power', curse: 'Curse', condition: 'Condition', off: 'Not counting' }

function PartRow({ part }) {
  const off = part.kind === 'off'
  const tone = off || part.kind === 'card' ? 'bg-zinc-950/70' : part.value < 0 || part.kind === 'curse' || part.kind === 'condition' ? 'bg-orange-950/60' : 'bg-sky-950/60'
  const valueTone = off ? 'text-zinc-500' : part.kind === 'card' ? 'text-zinc-200' : part.value < 0 ? 'text-orange-300' : 'text-sky-300'
  return (
    <li className={`flex items-center gap-3 rounded-lg px-3 py-2 ${tone} ${off ? 'border border-dashed border-zinc-600' : ''}`}>
      <span className="w-20 shrink-0 text-xs text-zinc-400">{KIND_LABELS[part.kind]}</span>
      <span className="min-w-0 flex-1">
        <span className={off ? 'text-zinc-400 line-through' : 'text-zinc-100'}>{part.label}</span>
        {part.note && <span className="block text-sm text-zinc-400">{part.note}</span>}
      </span>
      <span className={`shrink-0 text-lg font-bold ${valueTone}`}>{part.kind === 'card' ? part.value : signed(part.value)}</span>
    </li>
  )
}

// What a tapped number is made of, with its total.
function Breakdown({ tile, onClose }) {
  const spare = tile.parts.filter((p) => p.kind === 'off' && p.note?.startsWith('Only your best'))
  return (
    <div className="mt-3 space-y-2 rounded-xl border-2 border-amber-500/70 bg-zinc-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-display text-lg font-bold text-amber-300">{tile.title}</h4>
        <button type="button" className="min-h-10 rounded-lg px-3 text-zinc-300 hover:bg-zinc-800" onClick={onClose}>
          Close
        </button>
      </div>
      {tile.parts.length === 0 && <p className="text-zinc-400">{tile.empty}</p>}
      <ul className="space-y-1.5">
        {tile.parts.map((part, i) => (
          <PartRow key={i} part={part} />
        ))}
      </ul>
      {tile.totalLabel && (
        <p className="flex items-center justify-between border-t border-zinc-700 px-3 pt-2 text-lg font-semibold">
          {tile.totalLabel} <span className="text-2xl font-bold text-amber-300">{tile.shown}</span>
        </p>
      )}
      {tile.extra?.length > 0 && (
        <>
          <p className="pt-1 text-xs tracking-wide text-zinc-400 uppercase">{tile.extraTitle}</p>
          <ul className="space-y-1.5">
            {tile.extra.map((part, i) => (
              <PartRow key={i} part={part} />
            ))}
          </ul>
        </>
      )}
      {tile.notes?.map((note) => (
        <p key={note} className="text-sm text-zinc-300">
          {note}
        </p>
      ))}
      {spare.length > 0 && (
        <p className="rounded-lg bg-orange-950/60 p-2 text-sm text-orange-200">
          {spare.map((p) => p.label).join(' and ')} {spare.length > 1 ? "aren't" : "isn't"} helping right now. You can give {spare.length > 1 ? 'them' : 'it'} to
          another hero from the items list.
        </p>
      )}
    </div>
  )
}

// AC, Speed and Attack bonus as big tiles, each saying whether something is boosting or
// lowering it. Tap one to see where the number comes from.
export function StatTiles({ state, hero }) {
  const [open, setOpen] = useState(null)
  const heroes = state?.heroes ?? []
  const ac = acParts(hero, heroes)
  const speed = speedParts(hero)
  const attack = attackParts(hero)
  const guards = tileGuards(heroes, hero)
  const tileBonus = tileAcBonus(heroes, hero)
  const stuck = (hero.conditions ?? []).includes('Immobilized')

  const tiles = [
    {
      key: 'ac',
      label: 'AC',
      shown: ac.total,
      change: ac.total - hero.ac,
      parts: ac.parts,
      title: `Why is ${hero.name}'s AC ${ac.total}?`,
      totalLabel: 'Total AC',
      notes: tileBonus > 0 ? [`+${tileBonus} more while on ${guards.map((g) => g.hero.name).join(' or ')}'s tile (Blessed Shield).`] : [],
    },
    {
      key: 'speed',
      label: 'Speed',
      shown: speed.total,
      change: speed.total - (hero.speed ?? 6),
      sub: stuck ? "can't move" : null,
      parts: speed.parts,
      title: `Why is ${hero.name}'s speed ${speed.total}?`,
      totalLabel: 'Squares per move',
    },
    {
      key: 'attack',
      label: 'Attack bonus',
      shown: signed(attack.total),
      change: attack.total,
      sub: attack.total === 0 && attack.damage > 0 ? `+${attack.damage} damage` : null,
      parts: attack.parts,
      title: `What changes ${hero.name}'s attacks?`,
      empty: 'Nothing right now. Your power card gives the attack number.',
      totalLabel: attack.parts.length > 0 && 'Added to your power',
      extra: attack.damageParts,
      extraTitle: 'Extra damage on a hit',
      notes: ['These are for a monster next to you. The attack box shows the full sum before you roll.'],
    },
  ]
  const openTile = tiles.find((t) => t.key === open)

  return (
    <div className="mt-3">
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((tile) => {
          const hurt = tile.change < 0 || (tile.key === 'speed' && stuck)
          const boost = !hurt && (tile.change > 0 || (tile.key === 'attack' && attack.damage > 0))
          const sub = tile.sub ?? (hurt ? `${signed(tile.change)} lower` : tile.change > 0 ? `${signed(tile.change)} boosted` : 'normal')
          return (
            <button
              key={tile.key}
              type="button"
              aria-expanded={open === tile.key}
              onClick={() => setOpen(open === tile.key ? null : tile.key)}
              className={`flex min-h-20 flex-col items-center justify-center rounded-xl border-2 bg-zinc-950/70 px-1 py-2 transition active:scale-95 ${
                open === tile.key ? 'border-amber-400' : hurt ? 'border-orange-500/80' : boost ? 'border-sky-500/70' : 'border-zinc-700'
              }`}
            >
              <span className="text-xs tracking-wide text-zinc-400 uppercase">{tile.label}</span>
              <span className="text-3xl leading-tight font-bold text-zinc-100">{tile.shown}</span>
              <span className={`text-xs font-semibold ${hurt ? 'text-orange-300' : boost ? 'text-sky-300' : 'text-zinc-500'}`}>{sub}</span>
            </button>
          )
        })}
      </div>
      {openTile ? (
        <Breakdown tile={openTile} onClose={() => setOpen(null)} />
      ) : (
        <p className="mt-1 text-center text-xs text-zinc-500">Tap a number to see what's changing it.</p>
      )}
    </div>
  )
}

// Small blue (helping) and orange (hurting) badges: the projector and the Party tab.
export function BoostBadges({ hero, heroes, className = '', badgeClass = 'px-2 py-0.5 text-sm' }) {
  const badges = heroBadges(hero, heroes)
  if (badges.length === 0) return null
  return (
    <ul className={`flex flex-wrap gap-1.5 ${className}`}>
      {badges.map((b) => (
        <li
          key={b.text}
          className={`rounded-full border ${badgeClass} ${b.good ? 'border-sky-700 bg-sky-950/70 text-sky-200' : 'border-orange-700 bg-orange-950/70 text-orange-200'}`}
        >
          {b.text}
        </li>
      ))}
    </ul>
  )
}
