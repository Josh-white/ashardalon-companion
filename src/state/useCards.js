import { useEffect, useState } from 'react'
import { setHeroTemplates } from '../data/heroes.js'

const EMPTY = { source: 'loading', powers: [], heroes: [], abilities: [], monsters: [], villains: [], encounters: [], adventures: [], chambers: [], treasures: [], villagers: [], boons: [], treasureTokens: [], tiles: [], problems: [] }
let request = null

// How long to wait before asking the Pi again after a failed load (it may be restarting
// after an update), and how many times to try.
export const RETRY_MS = 3000
const TRIES = 10

function loadCards() {
  request ??= fetch('/cards.json')
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
    // The heroes to pick from, homebrew ones too (every screen looks them up by key).
    .then((data) => (setHeroTemplates(data.heroes), data))
    .catch((error) => {
      request = null
      return { source: 'error', powers: [], abilities: [], monsters: [], villains: [], encounters: [], adventures: [], chambers: [], treasures: [], villagers: [], boons: [], treasureTokens: [], tiles: [], problems: [`Could not load power cards: ${error.message}`] }
    })
  return request
}

// Loads the power cards from the Pi once per page load and shares them with
// every hero card on the page. Reloading the page picks up edits to cards.json.
// A failed load (the Pi restarting mid-update) is tried again a few seconds later.
export function useCards() {
  const [cards, setCards] = useState(EMPTY)
  useEffect(() => {
    let active = true
    let timer = null
    let tries = 0
    const load = () =>
      loadCards().then((data) => {
        if (!active) return
        setCards(data)
        tries += 1
        if (data.source === 'error' && tries < TRIES) timer = setTimeout(load, RETRY_MS)
      })
    load()
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [])
  return cards
}
