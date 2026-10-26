# Ashardalon Companion

A tablet-friendly helper for playing **Dungeons & Dragons: Wrath of Ashardalon** at the table. It runs entirely in the browser and saves the current game there, so a refresh or a closed tab picks up where you left off.

## What it does

- **Hero cards:** HP with big +/− buttons, AC, healing surge value, daily and utility powers you can name and tap to mark used, conditions, and level up for 5 XP.
- **Turn guide:** "Your turn!" banner for the active player and a checklist for the Hero, Exploration, and Villain phases.
- **Monsters:** add monsters as they're placed, track HP and conditions, see whose card each one is, and tap *Defeated!* to add its XP to the party pool.
- **Party status:** shared XP and healing surges, a warning when surges run out, and win/lose screens.

Starting hero stats are prefilled on the setup screen and can be adjusted there, so check them against your hero cards.

## Run it on the Raspberry Pi

```sh
git clone https://github.com/Josh-white/ashardalon-companion.git
cd ashardalon-companion
docker compose up -d --build
```

Then open `http://piserver.local:8081` on any device on your network. Change the left side of `8081:80` in `compose.yaml` if that port is taken.

To update after pulling new changes: `git pull && docker compose up -d --build`.

## Develop

```sh
npm install
npm run dev     # http://localhost:5173
npm test
```

## Not built yet

- Tile, encounter, and treasure deck trackers
- Adventure picker
- Narration with ElevenLabs voices. The API key must stay out of this repo; it will be supplied on the Pi as an environment variable.
