import { monsterArt } from '../data/art.js'
import { activeVillains } from '../state/game.js'
import Art from './Art.jsx'
import { CONDITION_ICONS } from './BoardPieces.jsx'
import { Button, HpBar } from './ui.jsx'

// Which monster or villain a board token belongs to. Monsters with several figures
// (the Imps) have tokens named `<id>#2`, `<id>#3`.
export function peekTarget(state, tokenId) {
  const id = String(tokenId).split('#')[0]
  const monster = state.monsters.find((m) => m.id === id)
  if (monster) return { monster, villain: false }
  const villain = activeVillains(state).find((v) => v.id === id)
  return villain ? { monster: villain, villain: true } : null
}

// A small card over the board when a monster token is tapped: what it is, whose it is,
// its AC and HP, and what it does on its turn. It only shows things; nothing to press but ✕.
export default function MonsterPeek({ state, tokenId, fill, onClose }) {
  const found = peekTarget(state, tokenId)
  if (!found) return null
  const { monster, villain } = found
  const owner = state.heroes.find((h) => h.id === monster.ownerId)
  const card = monster.card ?? {}
  const figures = card.figures > 1 && !villain
  const tactics = (Array.isArray(card.tactics) ? card.tactics : []).map((t) => t.text).filter(Boolean)
  const whose = villain ? 'Villain' : monster.objective ? 'In the chamber' : owner ? `${owner.name}'s monster` : 'No owner'
  const name = villain && monster.enraged ? `Enraged ${monster.name}` : monster.name
  return (
    <div
      data-peek={monster.id}
      className={`rounded-xl border-2 bg-zinc-900 p-3 ${villain ? 'border-fuchsia-700' : 'border-red-700'} ${fill ? 'absolute inset-x-2 bottom-2 z-[45] max-h-[60%] overflow-y-auto shadow-2xl shadow-black' : 'mb-2'}`}
    >
      <div className="flex items-start gap-3">
        <Art name={monsterArt(monster)} className="w-16 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className={`font-display text-xl leading-tight font-bold ${villain ? 'text-fuchsia-200' : 'text-red-300'}`}>
            {villain && '👑 '}
            {name}
          </p>
          <p className="text-sm text-zinc-400">
            {whose}
            {monster.ac ? ` · AC ${monster.ac}` : ''}
            {!villain && !monster.objective && monster.xp ? ` · ${monster.xp} XP` : ''}
          </p>
        </div>
        <Button className="!px-3 !py-1 text-sm" onClick={onClose} aria-label="Close">
          ✕
        </Button>
      </div>
      <div className="mt-2">
        <p className="text-lg font-bold text-zinc-100">
          {monster.hp}
          <span className="text-sm font-normal text-zinc-400"> / {monster.maxHp} HP left</span>
        </p>
        <HpBar hp={monster.hp} maxHp={monster.maxHp} />
        {figures && <p className="mt-1 text-sm text-amber-400">{card.figures} figures with {card.hp} HP each.</p>}
      </div>
      {monster.conditions?.length > 0 && (
        <p className="mt-1 text-sm text-amber-300">{monster.conditions.map((c) => `${CONDITION_ICONS[c] ?? ''} ${c}`.trim()).join(' · ')}</p>
      )}
      {card.special && <p className="mt-2 text-sm text-zinc-300">{card.special}</p>}
      {tactics.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-zinc-300">
          {tactics.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
