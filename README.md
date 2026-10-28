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

## Card art

Tap **📷 Add photos of your cards** (on the setup screen, or the "Who's playing" screen during a game). For each hero, monster and villain, take a photo of your card, then drag and pinch until its picture fills the square. The pictures show on the hero cards, monster cards, the projector, and the big screens when a monster appears or falls.

Like the card text, the photos stay on your Pi in `cards/art/`, which git ignores. Each copy of the app has its own; to copy the test copy's photos to the real game: `cp ~/ashardalon-test/cards/art/*.jpg ~/ashardalon-companion/cards/art/`.

## Narrator voice

The projector can read the game out loud in a dungeon-master voice: monsters arriving, encounter cards, new tiles, whose turn it is, natural 20s and 1s, defeats and treasure. It uses [ElevenLabs](https://elevenlabs.io). Put your API key in the `.env` file next to `compose.yaml` on the Pi (never in the repo), then rebuild:

```sh
read -rsp "Paste ElevenLabs key: " K; echo; printf 'ELEVENLABS_API_KEY=%s\n' "$K" >> .env; chmod 600 .env; unset K
docker compose up -d --build
```

Only the Pi talks to ElevenLabs, and every line it has spoken is saved in the `game-data` volume, so repeats are free. It uses a small cast: a storyteller (George) for the story, tiles and turns, a herald (Alice) for natural 20s, treasure and victories, a menacing voice (Callum) for monsters and bad news, and a voice for each villain in the box (Meerak: Harry, Margrath: Bill, Kraash: Adam, Ashardalon: Brian, Bellax: Lily), with its own lines when it arrives and when it falls. The villain lines are recorded in the background when the Pi starts, so they play without a wait. Optional `.env` settings: `ELEVENLABS_VOICE_ID`, `ELEVENLABS_VOICE_HERALD`, `ELEVENLABS_VOICE_DANGER`, `ELEVENLABS_VOICE_VILLAIN` and one per villain (`ELEVENLABS_VOICE_MEERAK`, `_MARGRATH`, `_KRAASH`, `_ASHARDALON`, `_BELLAX`), each a voice id (the free plan only allows ElevenLabs' built-in voices) and `ELEVENLABS_MODEL` (everyday lines, default `eleven_flash_v2_5`, about half a credit per letter) and `ELEVENLABS_VILLAIN_MODEL` (villains, default `eleven_v3`, which acts out stage directions like [menacing] or [laughs] but costs about twice as much). The narrator follows the projector's sound switch and waits for the sound effects to finish before it speaks. Browsers only play sound after a tap, so the projector asks for one if it needs it.

## Run it on the Raspberry Pi

```sh
git clone https://github.com/Josh-white/ashardalon-companion.git
cd ashardalon-companion
docker compose up -d --build
```

Then open `http://piserver.local:8081` (or https://ashardalon.codebasehome.com) on any device on your network. To use another port, put `HOST_PORT=8090` in a `.env` file next to `compose.yaml`.

To update after pulling new changes: `git pull && docker compose up -d --build`. The current game lives in the `game-data` Docker volume, so updates don't wipe it.

## Back up the saved game

`scripts/backup-game.sh` copies the saved game out of the app into `~/ashardalon-backups` and keeps the newest 14 copies. It skips a copy when nothing changed, so a quiet week doesn't push out older saves. To run it every night at 3:15, add it to cron on the Pi:

```sh
mkdir -p ~/ashardalon-backups
(crontab -l 2>/dev/null; echo "15 3 * * * $HOME/ashardalon-companion/scripts/backup-game.sh >> $HOME/ashardalon-backups/backup.log 2>&1") | crontab -
```

To put a backup back:

```sh
scripts/restore-game.sh                                         # lists the backups
scripts/restore-game.sh ~/ashardalon-backups/game-2026-10-27-031500.json
```

The restore saves the current game first (as a `-before-restore` copy), so it can be undone, then restarts the app with the backup. It refuses a backup saved by a different version of the app, which would otherwise open as a new game. For the test copy, put `CONTAINER=ashardalon-test BACKUP_DIR=~/ashardalon-test-backups` in front of either command.

## A test copy

A second copy of the app, with its own saved game, is handy for trying new features without touching the real game. Clone the repo into another folder and give it its own `.env`:

```sh
git clone https://github.com/Josh-white/ashardalon-companion.git ~/ashardalon-test
cd ~/ashardalon-test
cp ../ashardalon-companion/cards/cards.json cards/ 2>/dev/null
printf 'COMPOSE_PROJECT_NAME=ashardalon-test\nCONTAINER_NAME=ashardalon-test\nHOST_PORT=8082\nINSTANCE_LABEL=Test copy\n' > .env
docker compose up -d --build
```

Open `http://piserver.local:8082`. Every screen shows a **Test copy** banner. To try a branch before it's merged: `git fetch && git checkout <branch> && docker compose up -d --build`.

On the setup screen, **Start a demo game** skips setup and drops you into round 2 with all five heroes and a few monsters.

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
