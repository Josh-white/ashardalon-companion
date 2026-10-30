// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { HeroHall } from './HeroHall.jsx'

afterEach(cleanup)

describe('Heroes Assemble on the big screen', () => {
  const heroes = HERO_TEMPLATES
  const claim = { deviceId: 'ipad-a', heroKey: heroes[0].key, player: 'Colton', picks: [], ready: true }

  it('frees a hero left behind by a closed iPad, after asking', () => {
    const onFree = vi.fn()
    render(<HeroHall heroes={heroes} lobby={[claim]} onFree={onFree} />)
    expect(screen.getAllByRole('button', { name: 'Free this hero' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Free this hero' }))
    expect(onFree).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: `Free ${heroes[0].name}` }))
    expect(onFree).toHaveBeenCalledWith(claim)
  })

  it('has no free button without a way to free', () => {
    render(<HeroHall heroes={heroes} lobby={[claim]} />)
    expect(screen.queryByRole('button', { name: 'Free this hero' })).toBeNull()
  })
})
