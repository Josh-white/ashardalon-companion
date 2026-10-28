Recorded sounds go here, and git ignores them, so they stay on your Pi.

Name each file after the sound it replaces, like `dice.mp3` or `wahwah.mp3` (the names are the keys of `SOUNDS` in `src/audio/sfx.js`). It plays in place of the made-up sound on the next page load, at about the same volume as the others. Take the file away and the made-up sound comes back.

Only use recordings you're allowed to: CC0 ones (from freesound.org or kenney.nl) are free for anything. Keep a note of where each came from in `CREDITS.csv` here.

Some files have their own names: `monster-bear.mp3` plays for the cave bear, `spell-fire.mp3` for fire spells, and so on (`RECORDING_NAMES` in `src/audio/sfx.js`). `loop-explore.mp3`, `loop-battle.mp3` and `loop-boss.mp3` are background music tracks (any length; they stream) that play in place of the made-up music for that mood. Spare tracks can wait in `alternates/` here and be copied over one to swap it in.

To make sounds with ElevenLabs instead, see `src/audio/soundPrompts.js` and run `server/generate-sounds.js` (it explains itself at the top). Its takes go in `takes/` here; pick the favourites on the `#audition` page, which copies them up into this folder.
