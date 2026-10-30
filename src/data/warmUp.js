// The app's own short practice adventure, for trying a hero you haven't played. It isn't
// from the adventure book, so it lives here rather than in cards.json, and every card file
// gets it. `practice`: the game doesn't count toward anyone's records or titles.
export const WARM_UP_ID = 'hero-swap-warm-up'

export const WARM_UP = {
  id: WARM_UP_ID,
  title: 'Hero Swap Warm-up',
  practice: true,
  blurb: 'A quick practice game to try out a new hero.',
  goal: 'Defeat 3 monsters with a hero you want to try. Practice only: it never counts toward records or titles.',
  players: '1-5',
  setup: ['Each player picks a hero they want to try out.', 'Set up the Start tile and the dungeon stack as usual.'],
  rules: [
    { name: 'Practice game', text: 'Nothing here counts toward records or titles, and no campaign moves on. Try every power and see what your hero can do!' },
  ],
  story: {
    start:
      'The old training halls under the mountain are crawling with monsters again. Before the real quest begins, every hero tries something new. Learn your powers, watch your friends, and send three monsters running!',
    victory: 'Three monsters down! You know your new hero now. When the real adventure calls, you will be ready.',
    defeat: 'The training halls win this time. Shake it off, pick your powers again, and give it another go!',
  },
  win: { figures: 3 },
  needs: [],
}

export const isPractice = (state) => Boolean(state?.adventure?.card?.practice)
