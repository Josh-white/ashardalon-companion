// 🎮 My models: every figure a player has, from the 🧙 Model Workshop (a loved model with its
// 3D file) and the 🛠️ Hero Builder (a saved figure), grouped by the name on it. A player picks
// one to be their hero on the 3D board; the Pi keeps it to one per player (server/forge.js and
// server/workshop.js turn the other off).
import { lovedRound, playerKey } from './workshop.js'
import { findPart } from '../forge/parts.js'

// [{ key, name, models: [{ source, id, title, picture, emojis, on, at }] }], players A to Z,
// newest models first.
export function myModels(requests = [], figures = []) {
  const players = new Map()
  const add = (from, model) => {
    const key = playerKey(from)
    if (!key) return
    if (!players.has(key)) players.set(key, { key, name: from.trim(), models: [] })
    players.get(key).models.push(model)
  }
  for (const r of requests) {
    const round = lovedRound(r)
    if (r.hidden || !round?.model) continue
    add(r.from, {
      source: 'workshop',
      id: r.id,
      title: r.idea,
      picture: round.pictures?.[0] ? `/workshop/${r.id}/${round.pictures[0]}` : null,
      emojis: [],
      on: Boolean(r.useInGame),
      at: r.sentAt ?? '',
    })
  }
  for (const f of figures) {
    const parts = f.recipe?.parts ?? {}
    add(f.recipe?.from, {
      source: 'builder',
      id: f.id,
      title: f.recipe?.name || 'My hero',
      picture: null,
      emojis: ['head', 'hat', 'hand', 'offhand', 'back'].map((slot) => findPart(slot, parts[slot]?.id)?.emoji).filter(Boolean),
      on: Boolean(f.useInGame),
      at: f.savedAt ?? '',
    })
  }
  return [...players.values()]
    .map((p) => ({ ...p, models: p.models.sort((a, b) => b.at.localeCompare(a.at)) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Where to send a pick: the workshop and the builder each keep their own list.
export const modelPath = (model) => (model.source === 'workshop' ? `/workshop/${model.id}` : `/forge/${model.id}`)
