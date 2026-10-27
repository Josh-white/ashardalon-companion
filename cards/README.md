# Power cards

The app reads power cards from `cards/cards.json`. That file is ignored by git, so the text from your own copy of the game stays on your server and never goes into the repository. If it's missing, the app uses `cards.example.json`, which only has placeholder cards.

To set up your cards:

```sh
cp cards/cards.example.json cards/cards.json
# edit cards/cards.json
```

Changes show up the next time an iPad reloads the page; no restart needed. Cards a hero already picked in a running game keep the text they had when picked.

## Format

```json
{
  "powers": [
    {
      "id": "paladin-holy-strike",
      "hero": "paladin",
      "type": "at-will",
      "name": "Holy Strike",
      "attack": "+6",
      "damage": "1",
      "text": "What the card says."
    }
  ]
}
```

- `id`: any unique name for the card.
- `hero`: `cleric`, `fighter`, `paladin`, `rogue`, or `wizard`.
- `type`: `at-will`, `utility`, or `daily`.
- `attack`, `damage`, `text`: optional, shown on the hero card.
- `suggested`: optional, `true` for the rulebook's suggested picks. They're filled in on the setup screen, and players can swap them.
- `always`: optional, `true` for a power the hero card always gives (Keyleth's Lay on Hands). It's filled in and can't be swapped.

### Hero abilities (optional)

Abilities printed on a hero card show under the hero's name. Use `"level": 2` for ones only on the 2nd-level side.

```json
{
  "powers": [],
  "heroes": [
    {
      "hero": "paladin",
      "abilities": [
        { "name": "Healing Hands", "text": "What the card says." },
        { "name": "Critical Hit", "level": 2, "text": "What the card says." }
      ]
    }
  ]
}
```

If a card has a mistake, the app lists it on the hero card's power picker so it's easy to fix.

### Monster cards (optional)

Monster cards make a virtual monster deck. A hero taps **Draw a monster** in the Exploration Phase, and the app deals the top card to that hero with its HP, AC and XP filled in. Defeated monsters go to a discard pile, which is shuffled into a new deck when the deck runs out. In the Villain Phase, each of the active hero's monsters gets a **Take its turn** button: the app asks about the board one question at a time, then rolls the attack against the hero's AC and takes off the damage.

```json
{
  "powers": [],
  "monsters": [
    {
      "id": "goblin",
      "name": "Goblin",
      "copies": 3,
      "ac": 13,
      "hp": 1,
      "xp": 1,
      "attacks": [{ "id": "spear", "name": "Spear", "bonus": 6, "damage": 1, "miss": 0, "conditions": ["Dazed"] }],
      "tactics": [
        { "when": "within1", "move": "adjacent", "attack": "spear", "text": "What the card says." },
        { "move": "toward", "text": "Otherwise, ..." }
      ]
    }
  ]
}
```

- `copies`: how many of this card are in the box.
- `figures`: optional, for cards that place several figures (3 for the Legion Devil). HP is per figure, and each figure takes its own turn.
- `special`: optional text shown before the monster's first turn.
- `attacks`: `bonus` is the attack number without the `+`. `miss` is the damage on a miss. `conditions` can be Dazed, Immobilized, Poisoned, Slowed or Weakened.
- `tactics`: in the card's order. The first step whose `when` is true happens; a step without `when` is the card's "Otherwise".
  - `when`: `adjacent`, `sameTile`, `within1`, `within2`, or `aloneByUnexploredEdge` (on a tile with no heroes and an unexplored edge).
  - `move`: `adjacent` (moves next to the hero it attacks) or `toward` (1 tile toward the closest hero).
  - `attack`: the attack's `id`. Add `"targets": "all"` when it attacks every hero the question covers.
  - `explore`: `true` for "draw a tile from the bottom of the stack and place a new monster there".
