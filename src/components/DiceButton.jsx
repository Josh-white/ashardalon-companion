import { rollD20 } from '../state/random.js'
import { Button } from './ui.jsx'

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
