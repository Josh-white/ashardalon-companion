# Ashardalon Companion

A tablet-friendly helper for playing **Dungeons & Dragons: Wrath of Ashardalon** at the table. Every player can open it on their own iPad: a small server on the Pi keeps the shared games and sends each change to every device in that game right away. Several games can run at once (the family game plus, say, a solo game on each boy's iPad): the "Switch game" link along the top opens the list of games, where you can start, rename or finish one. Each iPad remembers which game it's in. The game is saved on the Pi, so a refresh, a sleeping iPad, or a restart picks up where you left off.

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

Open the app at `/#cards` to check `cards.json`: it lists cards the app couldn't read, and power and encounter cards the app looks for by name or id but can't find (a spelling difference quietly turns off that card's automation). The Pi also prints these to its log when it starts.

## Card art

Tap **📷 Add photos of your cards** (on the setup screen, or the "Who's playing" screen during a game). For each hero, monster and villain, take a photo of your card, then drag and pinch until its picture fills the square. The pictures show on the hero cards, monster cards, the projector, and the big screens when a monster appears or falls.

Like the card text, the photos stay on your Pi in `cards/art/`, which git ignores. Each copy of the app has its own; to copy the test copy's photos to the real game: `cp ~/ashardalon-test/cards/art/*.jpg ~/ashardalon-companion/cards/art/`.

## Narrator voice

The projector can read the game out loud in a dungeon-master voice: monsters arriving, encounter cards, new tiles, whose turn it is, natural 20s and 1s, defeats and treasure. It uses [ElevenLabs](https://elevenlabs.io). Put your API key in the `.env` file next to `compose.yaml` on the Pi (never in the repo), then rebuild:

```sh
read -rsp "Paste ElevenLabs key: " K; echo; printf 'ELEVENLABS_API_KEY=%s\n' "$K" >> .env; chmod 600 .env; unset K
docker compose up -d --build
```

Only the Pi talks to ElevenLabs, and every line it has spoken is saved in the `game-data` volume, so repeats are free. It uses a small cast of voices JJ picked from the ElevenLabs library: a storyteller for the story, tiles, turns and encounters, a herald for natural 20s, treasure and victories, a menacing voice for monsters and bad news, and a voice for each villain in the box (Meerak, Margrath, Kraash, Ashardalon, Bellax), with its own lines when it arrives and when it falls. Every line is recorded with `eleven_v3`, which acts out stage directions like [menacing] or [laughs], at stability 0.3 and style 0.5, and each voice has its own acting cues ([dramatic, mysterious] for stories, [excited, triumphant] for the herald, [urgent, tense] for bad news). The villain lines are recorded in the background when the Pi starts, so they play without a wait. Optional `.env` settings: `ELEVENLABS_VOICE_ID`, `ELEVENLABS_VOICE_HERALD`, `ELEVENLABS_VOICE_DANGER`, `ELEVENLABS_VOICE_VILLAIN` and one per villain (`ELEVENLABS_VOICE_MEERAK`, `_MARGRATH`, `_KRAASH`, `_ASHARDALON`, `_BELLAX`), each a voice id; `ELEVENLABS_MODEL` (everyday lines) and `ELEVENLABS_VILLAIN_MODEL` (villains), both `eleven_v3` by default (`eleven_flash_v2_5` costs half as much but can't act); `ELEVENLABS_STABILITY` (default 0.3; lower is more expressive) and `ELEVENLABS_STYLE` (default 0.5). Changing a voice or a setting means those lines get recorded again. The narrator follows the projector's sound switch and waits for the sound effects to finish before it speaks. Browsers only play sound after a tap, so the projector asks for one if it needs it.

### Record every line once

The narrator saves every line it speaks, so you can record the whole script once and then play it back with no ElevenLabs key at all. On the Pi:

```sh
docker compose exec ashardalon node server/record-narration.js --dry-run   # what's left and roughly how many credits
docker compose exec ashardalon node server/record-narration.js             # record it
```

It records every encounter card, adventure story, monster, villain, treasure, tile and hero line from your cards, skips anything already recorded, and stops cleanly if the credits run out (run it again later for the rest). Once it's done you can take `ELEVENLABS_API_KEY` out of `.env`: recorded lines keep playing, and anything never recorded just stays quiet. Lines use the hero's name ("Keyleth, it's your turn") rather than the player's, so they can all be recorded ahead of time. The backup script also copies the recordings to `~/ashardalon-backups/narration`; to put them back, `docker cp -a ~/ashardalon-backups/narration ashardalon-companion:/data/`.

### Make the sound effects and ambient loops

The same key can make the game's recorded sounds with ElevenLabs' sound effects: 25 one-shots (tiles, traps, natural 20s, treasure, each monster, each kind of spell). The prompts are in `src/audio/soundPrompts.js`. On the Pi:

```sh
docker compose exec ashardalon node server/generate-sounds.js --dry-run   # what's left and how many credits
docker compose exec ashardalon node server/generate-sounds.js             # make the takes
```

Each sound gets two or three takes in `cards/sounds/takes/`. Open the app at `/#audition` to listen and tap **Use this** on your favourite, which copies it to `cards/sounds/` where the game plays it (anything it replaces is kept in `takes/replaced/`). ### Background music tracks

Put a music track for each mood in `cards/sounds/` as `loop-explore.mp3`, `loop-battle.mp3` and `loop-boss.mp3` (JJ uses free tracks from Tabletop Audio: Dungeon I, Light the Beacons and Red Dragon Dawn). Each one streams in place of the made-up music for its mood, starting somewhere in the track and fading over 1.5 seconds when the mood changes. Music dips from 30% to 10% while the narrator talks, and the 🎵 switch turns it on or off on each screen. A mood with no track gets the made-up music.

More tracks can go in for particular moments; the game tries the most specific one first and falls back to the plain mood: `loop-explore-halls.mp3`, `loop-explore-tunnels.mp3`, `loop-explore-depths.mp3` and `loop-explore-chamber.mp3` (chambers and the Vault) by dungeon area, `loop-boss-ashardalon.mp3` when Ashardalon is out, `loop-victory.mp3` after a win (no music without it) and `loop-lament.mp3` after a loss. After adding or swapping a track, run `scripts/measure-music.sh` on the Pi: it writes each track's loudness to `cards/sounds/music-levels.json`, and the game brings every track into the same band (-26 to -20 LUFS) so none overpowers the others. The files themselves stay exactly as downloaded. A track that hasn't been measured plays at half volume.

## Run it on the Raspberry Pi

```sh
git clone https://github.com/Josh-white/ashardalon-companion.git
cd ashardalon-companion
docker compose up -d --build
```

Then open `http://piserver.local:8081` (or https://ashardalon.codebasehome.com) on any device on your network. To use another port, put `HOST_PORT=8090` in a `.env` file next to `compose.yaml`.

To update after pulling new changes: `git pull && docker compose up -d --build`. The current game lives in the `game-data` Docker volume, so updates don't wipe it.

### Update by itself after a merge

`scripts/auto-update.sh` checks GitHub for a newer `main`. When there is one, it backs up the saved games and cards, pulls, rebuilds, and checks the app answers on its port. If the new version doesn't start, it goes back to the one that worked and skips the broken version until `main` changes again. It won't touch a folder with changes made by hand. To run it every 5 minutes:

```sh
(crontab -l 2>/dev/null; echo "*/5 * * * * $HOME/ashardalon-companion/scripts/auto-update.sh >> $HOME/ashardalon-backups/auto-update.log 2>&1") | crontab -
```

Card files (`cards/cards.json`, art and sounds) aren't in git, so changes to those still go on the Pi by hand.

The tests run inside the Docker build, so a version that fails them never starts: the build stops and the Pi stays on the version that worked.

### Keep Claude Remote Control running

`scripts/claude-rc/install.sh` turns `claude remote-control` into a service, so it keeps running after you close your SSH window and starts again when the Pi boots or if it stops. Sign in to Claude Code on the Pi first (run `claude` once in this folder), stop any `claude remote-control` you started by hand, then:

```sh
sudo ~/ashardalon-companion/scripts/claude-rc/install.sh
```

What it sets up:

- **Runs as you, never root**, and can't use `sudo` at all (`NoNewPrivileges`). It can still use Docker, which is how it deploys, so keep your Claude account secure (strong password, two-step sign-in).
- **The game comes first**: low CPU priority, slowed down past a quarter of the Pi's memory and stopped past half, and at most 4 sessions at once.
- **Updates once a night, at 4:30.** Claude Code's own self-updating is off for the service; a timer runs `claude update` and restarts Remote Control, so an update never lands in the middle of a session. To skip updates: `sudo systemctl disable --now claude-rc-update.timer`.
- **A lapsed sign-in shows up in the log** instead of restarting every 30 seconds: it waits 15 minutes (signed out) or 10 (stopped right after starting) between tries.

To see how it's doing, no `sudo` needed:

```sh
~/ashardalon-companion/scripts/claude-rc/status.sh
```

If it says **SIGNED OUT** (or Remote Control keeps stopping right after it starts), sign in again: run `claude` in `~/ashardalon-companion`, type `/login`, open the link on your phone, paste the code back, then `sudo systemctl restart claude-rc`. The log is `~/ashardalon-backups/claude-rc.log` (`journalctl -u claude-rc` has everything Remote Control printed). To stop it for now: `sudo systemctl stop claude-rc`; to remove it: `sudo ~/ashardalon-companion/scripts/claude-rc/install.sh uninstall`.

## Back up the saved game

`scripts/backup-game.sh` copies the saved games out of the app into `~/ashardalon-backups` and keeps the newest 14 copies of each. The family game's copies go straight in that folder; every other game (a solo game, say) gets its own folder, `~/ashardalon-backups/games/<game>/`. It skips a copy when nothing changed, so a quiet week doesn't push out older saves. It also backs up your card files, which live only on the Pi: a dated copy of `cards/cards.json` in `~/ashardalon-backups/cards` whenever it changes (newest 14 kept), plus one up-to-date copy of `cards/art` and `cards/sounds`. To run it every night at 3:15, add it to cron on the Pi:

```sh
mkdir -p ~/ashardalon-backups
(crontab -l 2>/dev/null; echo "15 3 * * * $HOME/ashardalon-companion/scripts/backup-game.sh >> $HOME/ashardalon-backups/backup.log 2>&1") | crontab -
```

To put a backup back:

```sh
scripts/restore-game.sh                                         # lists the backups
scripts/restore-game.sh ~/ashardalon-backups/game-2026-10-27-031500.json
```

For a game other than the family game, put `GAME=<game>` in front, using the name of its backup folder: `GAME=coltons-solo scripts/restore-game.sh`. The restore saves the current game first (as a `-before-restore` copy), so it can be undone, then restarts the app with the backup. A backup from an older version of the app is upgraded when it loads; one from a newer version is refused until the app is updated. For the test copy, put `CONTAINER=ashardalon-test BACKUP_DIR=~/ashardalon-test-backups` in front of either command.

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
npm run lint         # ESLint: unused names, typos, hooks used the wrong way
npm run robot        # the robot plays whole solo games by itself (see below)
```

### The robot

`npm run robot` (`src/robot/robot.test.jsx`) plays a dozen whole solo games on the virtual board by itself: random adventure, one to three random heroes, then a few hundred random taps on the real screens, each one going through the real game rules. It doesn't try to win; it looks for a screen that crashes or a tap the rules can't take. It plays with made-up cards and tiles (`src/robot/robotCards.js`), so it runs anywhere. It isn't part of `npm test`, so the Pi's build doesn't take longer.

Two of the games (seeds 6 and 14) play to win instead: a made-up clan campaign in easy mode (`easyCards` in `robotCards.js`: one-hit monsters and villains, the Chamber Entrance in the first few tiles), carried on through the recap, the campaign lobby on the big screen and the next adventure until the campaign is won. They check that the heroes keep their level, gold and items from one adventure to the next. To play Adventures 6 and 13 the same way with the full cards: `ROBOT_CARDS=cards/cards.json ROBOT_ADVENTURES=adventure-6,adventure-13 ROBOT_WIN=1 npm run robot` (`ROBOT_WIN_TAPS=20000` for a whole Assault on Firestorm Peak, `ROBOT_GAMELOG=log.txt` for each game's log).

Every game has a seed, so a failure can be played again exactly; the failure names it and lists the robot's last taps. `ROBOT_SEED=7 ROBOT_GAMES=1 npm run robot` plays game 7 again, `ROBOT_GAMES=40 ROBOT_TAPS=600 npm run robot` digs deeper, and `ROBOT_CARDS=cards/cards.json npm run robot` plays with your own card file.

### Checks on GitHub

Every pull request runs `.github/workflows/ci.yml`: ESLint, the tests, the robot and the build, then the Docker image is built on an arm64 machine like the Pi and checked to answer `/health`. Merging to `main` puts it on the real game within 5 minutes, so wait for the green check before merging.

## Not built yet

- Tile, encounter, and treasure deck trackers
- Adventure picker
