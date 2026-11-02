// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { nextButton } from './AllyPanel.jsx'

const screen = (html) => {
  document.body.innerHTML = `<div data-ally-scope="">${html}</div>`
  return document
}
afterEach(() => {
  document.body.innerHTML = ''
})

describe("the computer hero's next tap on the turn screen", () => {
  it("taps the step's gold button before the pinned footer one", () => {
    const { button, label } = nextButton(screen('<button data-primary="">Draw a monster</button><div data-turn-footer=""><button data-primary="">On to the Villain Phase</button></div>'))
    expect(label).toBe('Draw a monster')
    expect(button.tagName).toBe('BUTTON')
  })

  it('never taps the party into falling', () => {
    const { label } = nextButton(screen('<button data-primary="" data-ally-never="">No surges left: the party falls</button><div data-turn-footer=""><button data-primary="">On to the Villain Phase</button></div>'))
    expect(label).toBe('On to the Villain Phase')
  })

  it("leaves a question the board couldn't answer to the players", () => {
    expect(nextButton(screen('<button data-primary="" data-ally-question="">Yes</button><button>No</button>'))).toEqual({ button: null, question: true })
    expect(nextButton(screen('<button data-primary="">Yes, it moved</button>'))).toEqual({ button: null, question: true })
  })

  it("taps the computer hero's own pick first, and nothing outside its turn screen", () => {
    expect(nextButton(screen('<button data-primary="">Roll</button><button data-ally-pick="">Noble Shield</button>')).label).toBe('Noble Shield')
    document.body.innerHTML = '<button data-primary="">Not for the computer</button>'
    expect(nextButton(document)).toEqual({ button: null })
  })
})
