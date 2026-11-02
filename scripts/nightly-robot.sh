#!/bin/sh
# Plays the robot games (npm run robot) with this Pi's own cards, so a problem in the real
# cards.json (a fan hero's power the app can't run, a card the robot gets stuck on) shows
# up the next morning instead of at the table. GitHub's checks only ever play made-up
# cards. Runs in a throwaway Node container, so nothing is installed on the Pi and the
# game being played isn't touched. Run it by hand or nightly from cron (see the README).
#
# The result goes to cards/robot-check.json, which the 🛠 Admin page shows, and a line
# per run to the log.
#
#   CARDS        the card file to play with (default: cards/cards.json next to this script)
#   ROBOT_GAMES  robot games tapping the screens at random (default: 16)
#   ALLY_GAMES   games the computer plays every hero, half of them adventures (default: 8)
set -u

ROOT=$(cd "$(dirname "$0")/.." && pwd)
CARDS=${CARDS:-$ROOT/cards/cards.json}
ROBOT_GAMES=${ROBOT_GAMES:-16}
ALLY_GAMES=${ALLY_GAMES:-8}
log() { echo "$(date '+%F %T') nightly-robot: $*"; }

if [ ! -f "$CARDS" ]; then
  log "no card file at $CARDS, nothing to check."
  exit 1
fi
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT
COMMIT=$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)
log "playing $ROBOT_GAMES robot games and $ALLY_GAMES computer-hero games with $CARDS at $COMMIT."

# The code without the card pictures, sounds or git history, copied into the container.
docker run --rm \
  -v "$ROOT":/src:ro -v "$CARDS":/cards.json:ro -v "$OUT":/out \
  -e ROBOT_CARDS=/cards.json -e ROBOT_GAMES="$ROBOT_GAMES" -e ALLY_GAMES="$ALLY_GAMES" \
  node:22-alpine sh -c '
    mkdir -p /app &&
    tar -C /src --exclude=./.git --exclude=./node_modules --exclude=./dist --exclude=./cards/art --exclude=./cards/sounds -cf - . | tar -C /app -xf - &&
    cd /app && npm ci --silent --no-audit --no-fund >/out/install.log 2>&1 &&
    npx vitest run src/robot --reporter=default --reporter=json --outputFile.json=/out/result.json >/out/robot.log 2>&1
    node scripts/robot-summary.mjs /out/result.json /out/robot.log > /out/summary.json
  '

if [ ! -s "$OUT/summary.json" ]; then
  log "the robot didn't finish (see the container's output above)."
  tail -n 20 "$OUT/install.log" "$OUT/robot.log" 2>/dev/null
  exit 1
fi
# Stamp it with when, which code and which cards, then put it where the Admin page reads it.
sed "s|^{|{\"at\":\"$(date -u '+%Y-%m-%dT%H:%M:%SZ')\",\"commit\":\"$COMMIT\",\"cards\":\"$(basename "$CARDS")\",|" "$OUT/summary.json" > "$ROOT/cards/robot-check.json"
log "$(sed -n 's/.*"line":"\([^"]*\)".*/\1/p' "$OUT/summary.json")"
