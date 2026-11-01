// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ScreenChoice from './ScreenChoice.jsx'

afterEach(cleanup)

describe('"Who stands here?"', () => {
  const handlers = () => ({ onHero: vi.fn(), onBigScreen: vi.fn(), onSolo: vi.fn(), onDemo: vi.fn(), onArt: vi.fn() })

  it("gives a friend only the two ways that work on their own device", () => {
    const h = handlers()
    render(<ScreenChoice {...h} friend />)
    expect(screen.queryByText('The big screen')).toBeNull()
    expect(screen.queryByText('Start a demo game')).toBeNull()
    expect(screen.queryByText(/Add photos/)).toBeNull()
    fireEvent.click(screen.getByText('Play on this device'))
    expect(h.onSolo).toHaveBeenCalled()
    fireEvent.click(screen.getByText('Play together'))
    expect(h.onHero).toHaveBeenCalled()
  })

  it('keeps every choice for the family', () => {
    render(<ScreenChoice {...handlers()} />)
    for (const text of ["I'm a hero", 'The big screen', 'Play solo', 'Start a demo game']) expect(screen.getByText(text)).toBeTruthy()
  })
})
