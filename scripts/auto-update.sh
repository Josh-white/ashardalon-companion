#!/bin/sh
# Updates the real game by itself when main moves on GitHub, so a merged PR goes
# live without anyone logging in to the Pi. Run it from cron every few minutes
# (see the README). Each run it:
#   1. checks GitHub for a newer main, and stops quietly if there isn't one,
#   2. backs up the saved games and card files (scripts/backup-game.sh),
#   3. moves to the new main and rebuilds the app,
#   4. checks the app answers. If it doesn't, it goes back to the version that
#      worked and leaves the broken one alone until main moves again.
#
#   BRANCH     which branch to follow (default: main)
#   HOST_PORT  the app's port, for the check (default: from .env, else 8081)
#   LOG_TAG    put in front of each log line (default: auto-update)
set -eu

cd "$(dirname "$0")/.."
BRANCH=${BRANCH:-main}
LOG_TAG=${LOG_TAG:-auto-update}
if [ -z "${HOST_PORT:-}" ] && [ -f .env ]; then
  HOST_PORT=$(sed -n 's/^HOST_PORT=//p' .env | tail -n 1)
fi
HOST_PORT=${HOST_PORT:-8081}
skip_file=.git/auto-update-skip

log() { echo "$(date '+%F %T') $LOG_TAG: $*"; }

# Only one run at a time: a slow build shouldn't overlap the next cron run.
exec 9>.git/auto-update.lock
if ! flock -n 9; then
  exit 0
fi

git fetch -q origin "$BRANCH"
current=$(git rev-parse HEAD)
target=$(git rev-parse "origin/$BRANCH")
[ "$current" = "$target" ] && exit 0

# A version that failed its check is skipped until main moves on.
if [ -f "$skip_file" ] && [ "$(cat "$skip_file")" = "$target" ]; then
  exit 0
fi

# Never throw away changes made by hand on the Pi, and never jump sideways:
# only move forward along main.
if ! git diff --quiet || ! git diff --cached --quiet; then
  log "files changed by hand in $(pwd), not updating. Run 'git status' to see them."
  exit 1
fi
if ! git merge-base --is-ancestor "$current" "$target"; then
  log "this folder isn't on $BRANCH (or has its own commits), not updating."
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

git merge -q --ff-only "$target"
if docker compose up -d --build && healthy; then
  rm -f "$skip_file"
  log "done, now on $(git rev-parse --short HEAD)."
  exit 0
fi

log "the new version didn't start, going back to $(git rev-parse --short "$current")."
echo "$target" > "$skip_file"
git reset -q --hard "$current"
if docker compose up -d --build && healthy; then
  log "back on $(git rev-parse --short HEAD). Will try again when $BRANCH changes."
else
  log "the old version didn't start either. Check 'docker compose logs'."
fi
exit 1
