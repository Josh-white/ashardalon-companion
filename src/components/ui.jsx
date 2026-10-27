export function Button({ variant = 'default', className = '', ...props }) {
  const variants = {
    default: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700',
    gold: 'bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold',
    danger: 'bg-red-700 hover:bg-red-600 text-white',
    ghost: 'hover:bg-zinc-800 text-zinc-300',
  }
  return (
    <button
      type="button"
      className={`rounded-xl px-4 py-2 transition active:scale-95 disabled:opacity-40 disabled:active:scale-100 ${variants[variant]} ${className}`}
      {...props}
    />
  )
}

export function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-sm transition ${
        active ? 'bg-amber-500 text-zinc-950 font-semibold' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
      }`}
    >
      {children}
    </button>
  )
}

export function HpBar({ hp, maxHp }) {
  const percent = maxHp === 0 ? 0 : (hp / maxHp) * 100
  const color = percent > 50 ? 'bg-emerald-500' : percent > 25 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-800">
      <div className={`h-full ${color} transition-all`} style={{ width: `${percent}%` }} />
    </div>
  )
}
