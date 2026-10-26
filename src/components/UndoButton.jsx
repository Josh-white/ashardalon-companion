import { Button } from './ui.jsx'

// Steps the shared game back one change, for everyone. The label says what will be undone.
export default function UndoButton({ undo, depth, dispatch, className = '' }) {
  return (
    <Button
      variant="ghost"
      className={`text-sm ${className}`}
      disabled={!undo}
      title={undo ? `Undo: ${undo}` : 'Nothing to undo'}
      onClick={() => dispatch({ type: 'UNDO', depth })}
    >
      ↶ {undo ? `Undo: ${undo}` : 'Undo'}
    </Button>
  )
}
