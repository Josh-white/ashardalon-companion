import { useEffect, useState } from 'react'

const EMPTY = { source: 'loading', powers: [], abilities: [], monsters: [], problems: [] }
let request = null

// Loads the power cards from the Pi once per page load and shares them with
// every hero card on the page. Reloading the page picks up edits to cards.json.
export function useCards() {
  const [cards, setCards] = useState(EMPTY)
  useEffect(() => {
    let active = true
    request ??= fetch('/cards.json')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .catch((error) => {
        request = null
        return { source: 'error', powers: [], abilities: [], monsters: [], problems: [`Could not load power cards: ${error.message}`] }
      })
    request.then((data) => active && setCards(data))
    return () => {
      active = false
    }
  }, [])
  return cards
}
