# Ashardalon Companion

A tablet-friendly helper for playing **Dungeons & Dragons: Wrath of Ashardalon** at the table. Every player can open it on their own iPad: a small server on the Pi keeps the one shared game and sends each change to every device right away. The game is saved on the Pi, so a refresh, a sleeping iPad, or a restart picks up where you left off.

## What it does

- **One iPad per player:** after setup, each iPad picks "I'm Keyleth" (it remembers) and shows that hero's card, their monster cards, the party's HP, and the turn guide when it's their turn. The **table view** shows everything on one screen.
- **Projector view:** a read-only big screen for a desktop on a projector or TV: a huge "Sam's turn" banner with the phase steps, every hero's HP, and the monsters as cards. Pick it on the "Who's playing" screen and press F11.
- **Dice and big moments:** every player's iPad has a **Roll d20** button. Each roll flashes on every screen, including the projector, with special screens for a natural 20 or a 1, a defeated monster, a hero going down, and a level-up.
- **Undo:** the top bar shows what the last change was (for example "Undo: Tarak −1 HP") and steps the game back for everyone, up to 30 changes. It can also undo an accidental *New game*. Dice rolls can't be undone, so there's no rerolling.
- **Home-screen app:** on an iPad, open the site in Safari, then Share → Add to Home Screen. It opens full screen with its own icon.

- **Hero cards:** HP with big +/− buttons, AC, healing surge value, daily and utility powers you can name and tap to mark used, conditions, and level up for 5 XP.
- **Turn guide:** "Your turn!" banner for the active player and a checklist for the Hero, Exploration, and Villain phases.
- **Monsters:** add monsters as they're placed, track HP and conditions, see whose card each one is, and tap *Defeated!* to add its XP to the party pool.
- **Party status:** shared XP and healing surges, a warning when surges run out, and win/lose screens.

Starting hero stats are prefilled on the setup screen and can be adjusted there, so check them against your hero cards.

## Power cards

Each hero has two at-will, one utility, and one daily power slot. Tap **Choose powers** to pick each one from a dropdown, tap a used daily or utility power to flip it, and tap **Read** to see the card text. The cards come from `cards/cards.json`, a file that stays on your server and is ignored by git. See [cards/README.md](cards/README.md) for the format.

## Run it on the Raspberry Pi

```sh
git clone https://github.com/Josh-white/ashardalon-companion.git
cd ashardalon-companion
docker compose up -d --build
```

Then open `http://piserver.local:8081` (or https://ashardalon.codebasehome.com) on any device on your network. Change the left side of `8081:3000` in `compose.yaml` if that port is taken.

To update after pulling new changes: `git pull && docker compose up -d --build`. The current game lives in the `game-data` Docker volume, so updates don't wipe it.

## Develop

```sh
npm install
npm run dev:server   # the shared game, on port 3000
npm run dev          # the app, http://localhost:5173
npm test
```

## Not built yet

- Tile, encounter, and treasure deck trackers
- Adventure picker
- Narration with ElevenLabs voices. The API key must stay out of this repo; it will be supplied on the Pi as an environment variable.
