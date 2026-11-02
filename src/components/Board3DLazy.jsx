import { Component, lazy, Suspense } from 'react'

// The 3D board, loaded only on a screen that turns it on (three.js is its own download),
// with the flat board standing in while it loads and taking over if it ever crashes.

const Board3D = lazy(() => import('./Board3D.jsx'))

class Fallback extends Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error) {
    console.warn('3D board failed, showing the flat board', error)
    this.props.onFail?.()
  }
  render() {
    return this.state.failed ? this.props.flat : this.props.children
  }
}

export default function Board3DLazy({ flat, onFail, ...props }) {
  return (
    <Fallback flat={flat} onFail={onFail}>
      <Suspense fallback={flat}>
        <Board3D {...props} onFail={onFail} />
      </Suspense>
    </Fallback>
  )
}
