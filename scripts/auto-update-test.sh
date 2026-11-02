#!/bin/sh
# Keeps the test copy (port 8082) on every feature that's waiting to be merged,
# so a new pull request can be tried on the Pi without anyone logging in. The
# real game still follows main with scripts/auto-update.sh. Run it from cron
# every few minutes inside the test copy's folder (see the README). Each run it:
#   1. asks GitHub for the open pull requests and stops quietly when neither
#      main nor any of them changed since the last run,
#   2. backs up the test copy's saved games and cards,
#   3. builds a local branch "auto-test" = main + every open pull request,
#      oldest first. A pull request that clashes with the ones before it is left
#      out (and named in the log) rather than holding the others back,
#   4. rebuilds the app (the tests run in the Docker build) and checks it answers.
#      If it doesn't, it goes back to the version that worked and waits until
#      main or a pull request changes.
#
# Which pull requests go on:
#   - only ones from branches in this repo itself, never from someone's fork, so
#     a stranger's pull request never runs on the Pi,
#   - not drafts, not ones with the label "skip-test-copy", and not ones whose
#     GitHub checks failed (they'd fail the build here too).
#
# Threads and people shouldn't deploy to the test copy by hand any more: two builds at
# once clash over the container. To hold the test copy on what it has (say, to try
# one branch by hand):
#   touch .git/auto-test-hold      and to let it carry on:  rm .git/auto-test-hold
#
# The game picker's version line shows what's on: "Version 1a2b3c4 + PRs 227, 228".
#
#   REPO       the GitHub repo (default: Josh-white/ashardalon-companion)
#   HOST_PORT  the app's port, for the check (default: from .env, else 8082)
#   BACKUP_DIR where the backups go (default: ~/ashardalon-test-backups)
#   LOG_TAG    put in front of each log line (default: auto-test)
set -eu

cd "$(dirname "$0")/.."
REPO=${REPO:-Josh-white/ashardalon-companion}
LOG_TAG=${LOG_TAG:-auto-test}
if [ -z "${HOST_PORT:-}" ] && [ -f .env ]; then
  HOST_PORT=$(sed -n 's/^HOST_PORT=//p' .env | tail -n 1)
fi
HOST_PORT=${HOST_PORT:-8082}
BACKUP_DIR=${BACKUP_DIR:-$HOME/ashardalon-test-backups}
CONTAINER=$(sed -n 's/^CONTAINER_NAME=//p' .env 2>/dev/null | tail -n 1)
CONTAINER=${CONTAINER:-ashardalon-test}
state_file=.git/auto-test-state
hold_file=.git/auto-test-hold
branch=auto-test

log() { echo "$(date '+%F %T') $LOG_TAG: $*"; }

# This is for the test copy only: never let it loose on the real game.
if [ "$CONTAINER" = "ashardalon-companion" ] || [ "$HOST_PORT" = "8081" ]; then
  log "this looks like the real game's folder, not the test copy. Not running."
  exit 1
fi

exec 9>.git/auto-test.lock
if ! flock -n 9; then
  exit 0
fi
[ -f "$hold_file" ] && exit 0

# A run that stopped halfway through a merge leaves it behind; that's ours to undo.
if [ -f .git/MERGE_HEAD ]; then
  git merge --abort 2>/dev/null || git reset -q --hard HEAD
fi
if ! git diff --quiet || ! git diff --cached --quiet; then
  log "files changed by hand in $(pwd), not updating. Run 'git status' to see them."
  exit 1
fi

# The open pull requests, as "number sha" lines, oldest first.
pulls_json=$(curl -fsS --max-time 20 -H 'Accept: application/vnd.github+json' \
  "https://api.github.com/repos/$REPO/pulls?state=open&per_page=100&sort=created&direction=asc") || {
  log "couldn't reach GitHub for the pull requests, trying again next run."
  exit 0
}
pulls=$(printf '%s' "$pulls_json" | python3 -c '
import json, sys
repo = sys.argv[1].lower()
for p in json.load(sys.stdin):
    head = p.get("head") or {}
    if ((head.get("repo") or {}).get("full_name") or "").lower() != repo:
        continue
    if p.get("draft"):
        continue
    if any(l.get("name") == "skip-test-copy" for l in p.get("labels") or []):
        continue
    print(p["number"], head["sha"])
' "$REPO")

git fetch -q origin main
main=$(git rev-parse origin/main)
wanted="$main $(printf '%s' "$pulls" | tr '\n' ' ')"
wanted=$(echo "$wanted" | sed 's/ *$//')

# Nothing new since the last run (whether that run worked or not).
if [ -f "$state_file" ] && [ "$(sed -n 1p "$state_file")" = "$wanted" ]; then
  exit 0
fi

previous=$(git rev-parse HEAD)
log "updating: main $(git rev-parse --short "$main")$( [ -n "$pulls" ] && printf '%s' "$pulls" | awk '{printf ", PR %s", $1}')"
# Test games are throwaway, so a backup that doesn't work doesn't stop the update.
CONTAINER=$CONTAINER BACKUP_DIR=$BACKUP_DIR KEEP=${KEEP:-5} "$(pwd)/scripts/backup-game.sh" ||
  log "the backup didn't work, carrying on (test games are throwaway)."

merge() { git -c user.name='Test copy' -c user.email='test-copy@localhost' merge -q --no-ff --no-edit "$@"; }

git checkout -q -B "$branch" "$main"
on=""
left_out=""
echo "$pulls" | while read -r number sha; do
  [ -n "$number" ] || continue
  # A pull request whose GitHub checks already failed would only stop the build.
  if curl -fsS --max-time 20 -H 'Accept: application/vnd.github+json' \
    "https://api.github.com/repos/$REPO/commits/$sha/check-runs?per_page=100" 2>/dev/null |
    python3 -c 'import json, sys; sys.exit(0 if any(r.get("conclusion") == "failure" for r in json.load(sys.stdin).get("check_runs", [])) else 1)' 2>/dev/null; then
    log "  PR $number: its GitHub checks failed, left out until a fix is pushed."
    echo "out $number" >>.git/auto-test-run
    continue
  fi
  if ! git fetch -q origin "+refs/pull/$number/head:refs/remotes/origin/pr/$number"; then
    log "  PR $number: couldn't download it, left out."
    echo "out $number" >>.git/auto-test-run
    continue
  fi
  if merge -m "Test copy: PR $number" "origin/pr/$number" >/dev/null 2>&1; then
    echo "on $number" >>.git/auto-test-run
  else
    git merge --abort 2>/dev/null || git reset -q --hard HEAD
    log "  PR $number: clashes with main or an older pull request, left out. Rebase it on main to get it on."
    echo "out $number" >>.git/auto-test-run
  fi
done
if [ -f .git/auto-test-run ]; then
  on=$(sed -n 's/^on //p' .git/auto-test-run | tr '\n' ' ' | sed 's/ *$//')
  left_out=$(sed -n 's/^out //p' .git/auto-test-run | tr '\n' ' ' | sed 's/ *$//')
  rm -f .git/auto-test-run
fi

version=$(git rev-parse --short "$main")
if [ -n "$on" ]; then
  version="$version + PR$( [ "$(echo "$on" | wc -w)" -gt 1 ] && echo s) $(echo "$on" | sed 's/ /, /g')"
fi

# Rebuild and start. When something else (a deploy by hand) left a container with the
# test copy's name in the way, it's removed and the start tried once more. The saved
# games live in the volume, so removing the container loses nothing.
deploy() {
  out=.git/auto-test-compose.log
  if APP_VERSION=$1 docker compose up -d --build >"$out" 2>&1; then
    cat "$out"
    return 0
  fi
  cat "$out"
  if grep -q 'is already in use' "$out"; then
    log "another container is using the name $CONTAINER, removing it and trying again."
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
    APP_VERSION=$1 docker compose up -d --build
    return
  fi
  return 1
}

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

printf '%s\n' "$wanted" >"$state_file"
if deploy "$version" && healthy; then
  printf '%s\n' "$version" >.git/auto-test-version
  log "done, now on $version.$( [ -n "$left_out" ] && echo " Left out: PR $(echo "$left_out" | sed 's/ /, PR /g').")"
  exit 0
fi

# Usually one pull request's tests fail in the build. Go back to what worked; the
# next try comes when main or a pull request changes (a fix gets pushed).
log "$version didn't build or start (a failing test stops the build), going back to $(git rev-parse --short "$previous")."
git reset -q --hard "$previous"
old_version=$(cat .git/auto-test-version 2>/dev/null || git rev-parse --short HEAD)
if deploy "$old_version" && healthy; then
  log "back on the version that worked. Will try again when main or a pull request changes."
else
  log "the old version didn't start either. Check 'docker compose logs'."
fi
exit 1
