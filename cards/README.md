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

### What powers do

The app knows what each of the 50 powers in the box does besides its attack roll (healing, Cleric's Shield, Inspiring Advice, Mirror Image and so on) and does it for you. It finds a power by its `name`, so keep the names as they are on the cards. The list is in `src/data/powerEffects.js`, in short words of our own. A power the app doesn't know still works; it just flips over when used.

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

Monster cards make a virtual monster deck. A hero taps **Draw a monster** in the Exploration Phase, and the app deals the top card to that hero with its HP, AC and XP filled in. Defeated monsters go to the XP pile. Monsters removed by mistake go to a discard pile, which is shuffled into a new deck when the deck runs out. In the Villain Phase, each of the active hero's monsters gets a **Take its turn** button: the app asks about the board one question at a time, then rolls the attack against the hero's AC and takes off the damage.

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
- `types`: optional kinds of monster, such as `["Orc"]` or `["Reptile", "Sentry"]`, for encounter cards that look for one kind.

### Encounter cards (optional)

Encounter cards make a virtual encounter deck. In the Villain Phase the app knows when one is needed (no new tile, or a tile with a black triangle) and shows **Draw an encounter card**. The card is read out on the iPad and the projector, and can still be cancelled for 5 XP. The app rolls the card's attack, applies damage it can work out, then puts the card where it goes: on the hero (curse), in play (environment), on the board (trap or hazard) or in the discards (event).

```json
{
  "powers": [],
  "encounters": [
    { "id": "falling-rocks", "name": "Falling Rocks", "type": "event", "text": "What the card says.",
      "attack": { "bonus": 8, "damage": 2, "miss": 1, "conditions": ["Dazed"], "targets": "activeTile" } },
    { "id": "gloom", "name": "Gloom", "type": "curse", "text": "What the card says.",
      "curse": { "acPenalty": 2, "removeRoll": { "phase": "hero", "target": 10 } } },
    { "id": "spikes", "name": "Spikes", "type": "trap", "text": "What the card says.",
      "trap": { "damage": 1, "disable": 10 } }
  ]
}
```

- `type`: `event`, `curse`, `environment`, `hazard` or `trap`. `copies` and `flavor` are optional.
- `attack`: `targets` is `active` (the active hero), `activeTile` (heroes on the active hero's tile), `within1` (heroes within 1 tile of the active hero), or `all`. `missConditions` are conditions a miss still gives.
- Events: `drawAnother`, `drawMonster` (shows the Draw a monster button), `damageEach` and `damagePoisoned` (damage with no roll), `damageIfMonsterOnTile` (asks whether a monster is on the active hero's tile: yes deals this damage to that hero, no goes on to the card's monster draw; Frenzied Leap), `healMonster`, `refreshDaily`, `passMonsters`, and `filterMonsters` (a monster `types` value: look at the top 5 monster cards and keep only that kind).
- Curses (`curse`): `acPenalty`, `attackPenalty`, `startDamage` (at the start of the hero's turn), `extraEncounter` (more encounter draws), `removeOnDefeat`, and `removeRoll` with a `target` and a `phase`: `hero`, `exploration` or `villain` (the app rolls at the end of that phase) or `action` (a button the hero taps instead of attacking, with an optional `label`).
- Environments: `trapPenalty` lowers rolls to disable traps.
- Adventure cards: `adventure: true` keeps a card out of the deck until something adds it (a villain's `addEncounter`). `noCancel: true` hides the cancel button. `villain` (a villain's id) discards the card when that villain isn't in play, and its attack can target `villainWithin1`. `returnToTop: 3` shuffles it back among the top 3 cards instead of discarding it (Ashardalon Breathes!).
- More adventure card fields: `objective` (an objective's name, such as the Vast Gate) discards the card when that objective isn't in play. `timeToken: true` takes a Time token off it, and the last one loses the game (Ceremony Progresses!). `afterDrawTop: true` puts the card back on top of the deck after the next card is drawn. `placeVillain` puts a villain on the board (Ashardalon Arrives!). `drawMonsterType` draws monster cards until one of that type turns up and discards the rest (The Vast Gate Flares!).
- `checks` (any type): questions the app asks before a phase can end, about the active hero. `phase` is `hero` (end of the Hero Phase) or `exploration` (shown at the start of the Villain Phase). `ask` is the question, with `{hero}` for the hero's name, and `yes` / `no` say what happens: `{ "damage": 1 }`, `{ "condition": "Poisoned" }` or `{ "remove": true }` (ends the curse). A check with a `note` instead of `ask` is a reminder to tap through. Example: `{ "phase": "hero", "ask": "Is {hero} next to a wall?", "yes": { "damage": 1 } }`.
- Curses: `removeAtTurnStart` ends the curse at the start of the hero's next turn.
- Traps (`trap`): an `attack` with `"targets": "trapTile"`, or `damage` with no roll, plus the `disable` roll. Traps take a turn in their owner's Villain Phase, and a hero can try to disable one in the Hero Phase.

### Treasure cards (optional)

Treasure cards make a virtual treasure deck. The first monster defeated in a turn shows **Draw a treasure card** for the hero who defeated it. The card is read out on the iPad and the projector, and the finder keeps it or hands it to another hero. Items then sit on the hero card: ones in play add their bonuses by themselves, and the rest have a **Tap to use** button. Used items flip over or go to the discards, which are shuffled into a new deck when the deck runs out.

```json
{
  "powers": [],
  "treasures": [
    { "id": "sword", "name": "Sword", "copies": 1, "text": "What the card says.",
      "inPlay": true, "attackBonus": 1, "attackRange": "adjacent" },
    { "id": "potion", "name": "Potion", "text": "What the card says.", "use": "heal", "heal": 2, "after": "discard" },
    { "id": "ring", "name": "Ring", "text": "What the card says.", "attack": { "bonus": 8, "damage": 1 }, "after": "flip" }
  ]
}
```

- `copies` and `flavor` are optional. `inPlay`: `true` for "Play this item immediately"; its bonuses last while the hero has it.
- Bonuses: `attackBonus` (with `attackRange`: `adjacent` or `within1`, asked on each attack), `stillBonus` (more attack if the hero didn't move), `damageBonus` (with `damageRange`), `critFrom` (+1 damage on a natural roll this high or more), `acBonus`, `tileAcBonus` (the owner and heroes on their tile; asked when a hero is attacked), `speedBonus`, `trapBonus` (to disable traps).
- `attack`: the item makes its own attack roll from the attack box. `note` is a reminder shown with it.
- `use`: what tapping it does: `heal` (with `heal`), `endCondition`, `refreshPower`, `refreshAny` (a power or an item), `reduceDamage` (1 HP back after a hit), `levelUp`, `polymorph` (swap a monster for a new monster card), `reroll` (offered on a missed attack), `caltrops` (with `tokens`), `monsterControl` (on a monster's turn, with a `monsterAttack`), or `note`.
- `after`: `flip` or `discard` once used. Leave it out for items that can be used again.

## Adventures (optional)

Adventures from the adventure book go in an `adventures` list. The projector picks one before the game, and the app shows its setup, reads its story text, and calls the victory when the goal is done.

```json
{
  "adventures": [
    {
      "id": "rogues-bag",
      "number": 3,
      "title": "The Lost Bag",
      "players": "2-5",
      "blurb": "One line about the adventure.",
      "goal": "What the heroes have to do.",
      "setup": ["Each setup step, in order."],
      "rules": [{ "name": "Vault", "text": "A special rule to remember." }],
      "story": { "start": "Read when the game starts.", "victory": "Read when the heroes win." },
      "reveals": [
        {
          "tile": "Vault",
          "story": "Read when the tile turns up.",
          "steps": ["What to put on the board."],
          "actions": [
            { "type": "placeToken", "name": "Bag" },
            { "type": "drawGuardians", "count": 2 },
            { "type": "extraEncounters", "count": 1 }
          ]
        }
      ],
      "win": { "guardians": true, "tokens": ["Bag"] },
      "needs": []
    }
  ]
}
```

- `reveals`: special tiles. The app counts the dungeon tile stack and reveals each one when it's drawn, then shows its story and steps and does its `actions`. `drawn` is `[first, last]`, the draws it can turn up on, counting the first tile drawn as 1: `[7, 7]` for "after the 6th tile". Without it, `[9, 12]`, the book's usual "after the 8th tile":
  - `drawGuardians`: draws `count` monster cards for the hero who found the tile; they're the guardians.
  - `placeToken`: a token to pick up, such as a lost bag.
  - `extraEncounters`: `count` more encounter cards every Villain Phase from now on.
  - `placeVillain`: puts the villain `name` in play.
  - `chamber`: opens the chamber. With `name`, that Chamber card (Elite Regiment); without, the app draws one from the chamber cards it can run. `exclude` lists villains the Unknown Overlord can't be; `villagers` sets how many villager tokens go in (instead of one per player).
  - `chamberMonsters`: each player draws `count` monsters for a chamber that has no Chamber card.
  - `placeToken` can also have `ask` (the question for picking it up) and `drawTreasure: true` (its finder draws a treasure card).
  - A reveal with `"door": true` happens when a door opens instead of when a tile turns up: its button is in the Hero Phase's door box. `after` names a reveal that has to happen first (the Secret Chamber door comes after its entrance tile).
- `startObjective`: something to destroy that's on the board from the start, such as `{ "name": "Vast Gate", "hp": 5, "ac": 12 }`. `startEncounters`: adventure encounter card ids shuffled into the top 3 encounter cards at the start. `checks`: end-of-phase questions like an encounter card's, with `whileObjective` to ask only while that objective stands and `{ "drawMonster": true }` as an effect. `story.defeat`: read out when a Time token loss ends the game.
- `win`: every part listed has to be done. `chamber` (the chamber card's goal; add `chamberMonsters` to need its monsters too), `reveals` (tiles that have to turn up, as names or `{ tile, label }`), `figures` (defeat that many monster figures; each figure of a group card counts), `guardians` (defeat the guardians), `tokens` (a hero picked each one up), `villains` (defeat each one by name), `escape` (the players tap "We escaped").
- `onceOnly`: monster names that can come out only once; later copies are discarded with no replacement.
- `needs`: bigger features the adventure needs, such as `villains` or `chambers`. The picker shows it as coming soon until the app has them.

### Chamber cards (optional)

The 14 Chamber cards. When an adventure's chamber entrance turns up, the app puts the card's villain or Altar on the board, then each hero, starting with the active one, draws monsters for the chamber. The card's goal becomes the adventure's goal.

```json
{
  "chambers": [
    {
      "id": "stables",
      "name": "Stables",
      "setup": ["Each paragraph of the card, in order."],
      "goal": "The card's goal.",
      "villain": "Rage Drake",
      "monsters": { "perPlayer": 1, "types": ["Animal", "Reptile"], "redrawXp": [] },
      "win": { "villain": true },
      "needs": []
    }
  ]
}
```

- `villain`: the villain the card places, by name. `villainFrom` instead: a list to pick one from at random (Unknown Overlord).
- `monsters`: `perPlayer` monsters for each hero (Endless Horde: 2). A monster that isn't one of `types`, or is worth one of the `redrawXp` values, is discarded once and another drawn.
- `objective`: something to destroy that isn't a monster, such as `{ "name": "Altar", "hp": 5, "ac": 12 }`. Heroes attack it like a monster; it gives no XP or treasure.
- `timeTokens`: Time tokens on the objective (Gate Ceremony). `villagers: true`: villager tokens go in, one per player (Prison Guard). `addEncounter`: an adventure encounter card id added to the encounter deck, on top with `encounterTop: true` or into the top 3.
- `win`: `villagers` (keep at least one villager alive; losing the last one loses the game), `chamberMonsters` (defeat the monsters the chamber placed), `villain`, `objective`, `escape`, or `manual` (a goal the players tap when it's done).
- `needs`: features the card needs; until the app has them it stays out of the drawn Chamber deck.

### Doors

Adventures that need `doors` get a door box in the Hero Phase: turn over the Closed Door token and tap Unlocked, Trapped (1 damage to each hero next to it) or Locked (roll 10 or more to unlock instead of attacking).

### Villain cards (optional)

Villains are the bosses an adventure brings out. When one is on the board it shows on every screen, heroes can attack it like a monster, and it takes its turn at the start of every Villain Phase, before anything else, with the same one-question-at-a-time guide as monsters. A defeated villain stays in the game's villain list marked defeated, so an adventure can check it. Until an adventure places its villain by itself, the table view has a **Put a villain on the board** button.

```json
{
  "powers": [],
  "villains": [
    {
      "id": "kobold-dragonlord",
      "name": "Kobold Dragonlord",
      "fullName": "Meerak, Kobold Dragonlord",
      "level": 5,
      "ac": 17,
      "hp": 6,
      "attacks": [{ "id": "short-sword", "name": "Short Sword", "bonus": 8, "damage": 2 }],
      "tactics": [
        { "when": "adjacent", "attack": "short-sword", "then": "within1", "text": "What the card says." },
        { "move": "toward", "toward": "mostHp", "text": "Otherwise, ..." }
      ]
    }
  ]
}
```

- `addEncounter`: an adventure encounter card's id that goes into the top 3 encounter cards when the villain appears (Ashardalon's breath).
- `name` is what an adventure uses to place it; `fullName` is shown on screen. `flavor`, `special` (rules shown on its card) and `onPlace` (what to do when it appears) are optional text.
- `attacks` work like monster attacks, plus `effect`: what else a hit does that the players do on the board, such as "Move the Hero 1 tile away". Attacks that share a `group` and have a `roll` range (`[1, 4]`) are a table: a tactic that uses the group rolls a die to pick the row (the Gauth's eye ray).
- `tactics` work like monster tactics, with more:
  - `when` can also be `adjacentMany` (next to 2 or more heroes), `tileWithMany` (within 1 tile of a tile with 2 or more heroes) and `within3`.
  - `target`: who it attacks when several heroes fit: `closest` (the default), `adjacent`, `mostHp` (the app picks from the heroes tapped) or `farthest`.
  - `then`: where it goes after attacking: `within1` (any square within 1 tile), `adjacent` (next to the hero it attacked) or `away` (the closest square not next to a hero).
  - With `"move": "toward"`, `toward` can be `mostHp`, and `tiles` how far (default 1).
- `enraged`: the other side of the card (the Rage Drake), with its own `ac`, `hp`, `attacks`, `tactics` and optional `name`. The first time the villain drops to 0 HP it flips to this side instead of being defeated.

### Villager cards (optional)

The 5 Villager cards (Free the Captives). A chamber with `villagers` puts them in. At the end of every Hero Phase the active player rolls, and the villager whose `roll` range it lands in acts, one question at a time. Monsters can attack villagers (they count as heroes and come first); a villager at 0 HP is gone.

```json
{
  "villagers": [
    { "id": "donnel", "name": "Donnel", "roll": [13, 16], "ac": 15, "hp": 2,
      "attack": { "name": "Wild punch", "bonus": 2, "damage": 1 },
      "tactics": [
        { "ask": "Is Donnel within 1 tile of a monster?", "say": "Move him next to the closest monster.", "attack": true },
        { "say": "Move Donnel 1 tile toward the closest hero." }
      ] }
  ]
}
```

- `tactics`: steps in order. `ask` is a yes/no question (a step without it is the "otherwise"), `say` what to do, `attack: true` lets the villager punch a monster, `draw: true` shows a Draw a monster button.
