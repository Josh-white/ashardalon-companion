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

If a card has a mistake, the app lists it on the hero card's power picker so it's easy to fix.
