#!/bin/sh
# Updates the real game by itself when main moves on GitHub, so a merged PR goes
# live without anyone logging in to the Pi. Run it from cron every few minutes
# (see the README). Each run it:
#   1. checks GitHub for a newer main, and stops quietly if there isn't one,
#   2. backs up the saved games and card files (scripts/backup-game.sh),
#   3. moves to the new main and rebuilds the app,
#   4. checks the app answers. If it doesn't, it goes back to the version that
#      worked. A version that failed is tried again 30 minutes later (a download
#      hiccup during the build shouldn't hold it back), up to 3 tries in all,
#      then left alone until main moves again.
#
#   BRANCH     which branch to follow (default: main)
#   HOST_PORT  the app's port, for the check (default: from .env, else 8081)
#   LOG_TAG    put in front of each log line (default: auto-update)
#
# How the last update went is written to cards/auto-update.json, and each run touches
# cards/auto-update.checked, so the game can warn the family on the "Which game?" screen
# and the 🛠 Admin page when updates fail or stop running (server/server.js).
set -eu

cd "$(dirname "$0")/.."
BRANCH=${BRANCH:-main}
LOG_TAG=${LOG_TAG:-auto-update}
if [ -z "${HOST_PORT:-}" ] && [ -f .env ]; then
  HOST_PORT=$(sed -n 's/^HOST_PORT=//p' .env | tail -n 1)
fi
HOST_PORT=${HOST_PORT:-8081}
skip_file=.git/auto-update-skip
status_file=cards/auto-update.json
build_log=.git/auto-update-build.log

log() { echo "$(date '+%F %T') $LOG_TAG: $*"; }

# Text as a JSON string body: escapes quotes and backslashes, drops colour codes,
# and joins lines with \n.
json_text() {
  printf '%s' "$1" | tr -d '\r' | sed -e 's/\x1b\[[0-9;]*[A-Za-z]//g' -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/\t/ /g' |
    awk 'BEGIN { ORS = "" } NR > 1 { print "\\n" } { print }'
}

# Writes cards/auto-update.json: ok (true/false), what happened, the version running,
# the version it tried, and for a failed build the lines that say why.
status() {
  ok=$1 line=$2 detail=${3:-}
  tried=${target:-}
  [ -n "$tried" ] && tried="$(git rev-parse --short "$tried") $(git log -1 --format=%s "$tried")"
  printf '{"ok":%s,"at":"%s","line":"%s","running":"%s","tried":"%s","detail":"%s"}\n' \
    "$ok" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$(json_text "$line")" "$(git rev-parse --short HEAD)" \
    "$(json_text "$tried")" "$(json_text "$detail")" >"$status_file.tmp" && mv "$status_file.tmp" "$status_file"
}

# Only one run at a time: a slow build shouldn't overlap the next cron run.
exec 9>.git/auto-update.lock
if ! flock -n 9; then
  exit 0
fi
# The game warns when this hasn't run for a while (cron stopped, Pi off).
touch cards/auto-update.checked

git fetch -q origin "$BRANCH"
current=$(git rev-parse HEAD)
target=$(git rev-parse "origin/$BRANCH")
[ "$current" = "$target" ] && exit 0

# A version that failed its check waits 30 minutes before another try, and after
# 3 failed tries is skipped until main moves on. The file holds: commit tries time.
attempts=0
if [ -f "$skip_file" ]; then
  read -r failed attempts failed_at <"$skip_file" || true
  if [ "$failed" = "$target" ]; then
    attempts=${attempts:-1}
    failed_at=${failed_at:-0}
    if [ "$attempts" -ge 3 ] || [ $(($(date +%s) - failed_at)) -lt 1800 ]; then
      exit 0
    fi
  else
    attempts=0
  fi
fi

# Never throw away changes made by hand on the Pi, and never jump sideways:
# only move forward along main.
if ! git diff --quiet || ! git diff --cached --quiet; then
  log "files changed by hand in $(pwd), not updating. Run 'git status' to see them."
  status false "Files were changed by hand in ~/ashardalon-companion, so it isn't updating. Run 'git status' there to see them." "$(git status --short | head -n 10)"
  exit 1
fi
if ! git merge-base --is-ancestor "$current" "$target"; then
  log "this folder isn't on $BRANCH (or has its own commits), not updating."
  status false "~/ashardalon-companion isn't on $BRANCH (or has its own commits), so it isn't updating." "On $(git rev-parse --abbrev-ref HEAD) at $(git rev-parse --short HEAD)."
  exit 1
fi

log "updating $(git rev-parse --short "$current") -> $(git rev-parse --short "$target")"
git log --oneline "$current..$target" | sed "s/^/$(date '+%F %T') $LOG_TAG:   /"
"$(pwd)/scripts/backup-game.sh"

healthy() {
  tries=0
  while [ $tries -lt 30 ]; do
    if curl -fsS "http://localhost:$HOST_PORT/health" >/dev/null 2>&1; then
      return 0
    fi
    tries=$((tries + 1))
    sleep 2
  done
  return 1
}

# Builds and starts the app (the tests run in the build). The output still goes to
# the log, and is kept to say why on the Admin page if it fails.
build() {
  rc=0
  APP_VERSION=$(git rev-parse --short HEAD) docker compose up -d --build >"$build_log" 2>&1 || rc=$?
  cat "$build_log"
  return $rc
}

# Why the new version failed: the build's error and test lines, or that it didn't answer.
why=""
git merge -q --ff-only "$target"
if build; then
  if healthy; then
    rm -f "$skip_file"
    log "done, now on $(git rev-parse --short HEAD)."
    status true "Updated to $(git rev-parse --short HEAD)."
    exit 0
  fi
  why="It built, but didn't answer on port $HOST_PORT within a minute."
else
  why=$(grep -E 'FAIL|Error|ERROR|failed|[Tt]imed out|×' "$build_log" | grep -v '^ *$' | tail -n 12)
  [ -n "$why" ] || why=$(tail -n 12 "$build_log")
fi

log "the new version didn't start, going back to $(git rev-parse --short "$current")."
attempts=$((attempts + 1))
echo "$target $attempts $(date +%s)" > "$skip_file"
git reset -q --hard "$current"
if build && healthy; then
  if [ "$attempts" -ge 3 ]; then
    log "back on $(git rev-parse --short HEAD). That was try $attempts, so it waits until $BRANCH changes."
    status false "The new version failed, so the game went back to $(git rev-parse --short HEAD). That was try $attempts of 3, so it waits until $BRANCH changes." "$why"
  else
    log "back on $(git rev-parse --short HEAD). Will try again in 30 minutes (try $attempts of 3)."
    status false "The new version failed, so the game went back to $(git rev-parse --short HEAD). It tries again in 30 minutes (try $attempts of 3)." "$why"
  fi
else
  log "the old version didn't start either. Check 'docker compose logs'."
  status false "The new version failed and the old one didn't start either. Check 'docker compose logs'." "$why"
fi
exit 1
