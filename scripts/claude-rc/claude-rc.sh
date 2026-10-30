#!/bin/sh
# Runs Claude Remote Control in the game's folder, for the claude-rc service that
# install.sh sets up (see the README). systemd starts it on boot and again
# whenever it stops, so closing an SSH window no longer ends Remote Control.
#
#   claude-rc.sh          check the sign-in, then run Remote Control
#   claude-rc.sh update   update Claude Code (the nightly timer runs this)
#
#   CLAUDE_BIN           the claude command (default: claude)
#   CLAUDE_RC_CAPACITY   how many sessions can run at once (default: 4)
#   CLAUDE_RC_LOG        the log (default: ~/ashardalon-backups/claude-rc.log)
set -u

cd "$(dirname "$0")/../.."
CLAUDE=${CLAUDE_BIN:-claude}
LOG=${CLAUDE_RC_LOG:-$HOME/ashardalon-backups/claude-rc.log}
mkdir -p "$(dirname "$LOG")"

log() { echo "$(date '+%F %T') claude-rc: $*" | tee -a "$LOG"; }

if [ "${1:-}" = update ]; then
  before=$("$CLAUDE" --version 2>/dev/null)
  if "$CLAUDE" update >>"$LOG" 2>&1; then
    log "nightly update: $before -> $("$CLAUDE" --version 2>/dev/null)"
  else
    log "nightly update failed, staying on $before"
  fi
  exit 0
fi

# Signed out: say so where status.sh looks, and wait instead of retrying every
# 30 seconds. Signing in again is a job for a person (see the README).
if ! "$CLAUDE" auth status --json 2>/dev/null | grep -q '"loggedIn": *true'; then
  log "SIGNED OUT. SSH in, run 'claude' in $(pwd), type /login, then: sudo systemctl restart claude-rc. Checking again in 15 minutes."
  sleep 900
  exit 1
fi

log "starting Remote Control in $(pwd) ($("$CLAUDE" --version 2>/dev/null))"
start=$(date +%s)
"$CLAUDE" remote-control --capacity "${CLAUDE_RC_CAPACITY:-4}"
code=$?
ran=$(( $(date +%s) - start ))
log "Remote Control stopped (exit $code after ${ran}s)"

# Stopping within two minutes usually means it can't connect, most often an
# expired sign-in that still looks signed in on the Pi. Back off so it isn't
# restarted over and over.
if [ "$ran" -lt 120 ]; then
  log "it stopped right away; the sign-in may have expired (see the README). Trying again in 10 minutes."
  sleep 600
fi
exit "$code"
