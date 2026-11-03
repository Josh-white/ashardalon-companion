// How each kind of power looks in the attack box, so a player can tell at a glance
// whether a power is an At-Will (never runs out), a Daily (once per adventure) or a Utility.
// The order here is the order the attack box lists them in.
export const POWER_KINDS = {
  'at-will': { label: 'At-Will', icon: '🔁', badge: 'bg-sky-700 text-sky-50', border: 'border-sky-700/70', picked: 'border-sky-300 bg-sky-950/70' },
  daily: { label: 'Daily', icon: '💥', badge: 'bg-rose-700 text-rose-50', border: 'border-rose-700/70', picked: 'border-rose-300 bg-rose-950/70' },
  utility: { label: 'Utility', icon: '🛠️', badge: 'bg-emerald-700 text-emerald-50', border: 'border-emerald-700/70', picked: 'border-emerald-300 bg-emerald-950/70' },
  item: { label: 'Item', icon: '💰', badge: 'bg-yellow-600 text-yellow-50', border: 'border-yellow-700/70', picked: 'border-yellow-300 bg-yellow-950/70' },
}

const ORDER = Object.keys(POWER_KINDS)

export const powerKind = (type) => POWER_KINDS[type] ?? POWER_KINDS['at-will']

// At-Wills first, then Dailies, then Utilities; the hero's own order within each kind.
export function byKind(powers) {
  const rank = (p) => {
    const i = ORDER.indexOf(p.type)
    return i === -1 ? ORDER.length : i
  }
  return powers.map((p, i) => [p, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([p]) => p)
}
