import { Button } from './ui.jsx'

function rollD20() {
  const values = new Uint32Array(1)
  crypto.getRandomValues(values)
  return (values[0] % 20) + 1
}

export default function DiceButton({ heroId, dispatch, className = '' }) {
  return (
    <Button
      variant="gold"
      className={`px-6 py-4 text-xl ${className}`}
      onClick={() => dispatch({ type: 'ROLL_DIE', heroId, value: rollD20() })}
    >
      🎲 Roll d20
    </Button>
  )
}
