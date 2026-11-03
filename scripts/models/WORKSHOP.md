# Answering the 🧙 Model Workshop

The boys ask for their own 3D figures from the 🧙 button on the game bar (or the
`#workshop` page). Everything lives on the Pi in `cards/workshop/` of the game's folder
(`~/ashardalon-companion/cards/workshop` for the real game,
`~/ashardalon-test/cards/workshop` for the test copy), never in git.

## 1. Read what they asked for

`cards/workshop/requests.json`: each request has an `id` (like
`2026-11-03-colton-lava-knight-1a2b`), the `idea` in their words, who it's `from`, and
what they picked: `kind` (hero / monster / pet), `colors`, `size`, `holds`, `attack`.
`answers` holds their reply to each round of pictures: `{ round, love: true }` or
`{ round, change: "…" }`.

## 2. Build it

Use `make-monsters.py` (same chibi style, one material + palette texture, KayKit clip
names; see its header). Render a few preview pictures (front, side, an attack pose):
three.js + Playwright like the #models page, or Blender's own render.

## 3. Send the pictures back

Copy into `cards/workshop/<id>/` (folder access or Remote Control, no rebuild needed):

- the pictures (`front.png`, `side.png`, … letters, digits, `-` and `_`, `.png` or `.jpg`),
- `reply.json`, with every round so far, oldest first:

```json
{ "rounds": [
    { "note": "Here's your lava knight! I gave him a huge flaming axe.", "pictures": ["front.png", "side.png", "attack.png"], "at": "2026-11-03T02:00:00Z" }
  ] }
```

Use new file names for each round (`front-2.png`), so the earlier ones still show.
Their 🧙 button changes to "📸 Pictures!" within a minute, and they tap ❤️ Love it or
✏️ Change it. A change adds a round: build again, add the next round to `reply.json`.

## 4. Put it in the game

Once they love it, wire the figure in like any other (src/models, figureModels.js,
heroModels.js and their tests), open a PR, and when JJ merges it set
`"inGame": true` in `reply.json` so the workshop says 🎉 In the game.
