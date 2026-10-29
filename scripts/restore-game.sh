#!/bin/sh
# Puts a backed-up game back into the app. With no file it lists the backups.
#
#   scripts/restore-game.sh                                    list backups
#   scripts/restore-game.sh ~/ashardalon-backups/game-....json  restore that one
#
# That's the family game. For another game, name it the way the backup folder does:
#   GAME=coltons-solo scripts/restore-game.sh                  list its backups
#   GAME=coltons-solo scripts/restore-game.sh <file>           restore one of them
#
# The game as it is right now is backed up first, so a restore can be undone
# by restoring that copy. Every iPad reloads into the restored game.
set -eu

CONTAINER=${CONTAINER:-ashardalon-companion}
BACKUP_DIR=${BACKUP_DIR:-$HOME/ashardalon-backups}
GAME=${GAME:-family}

# The family game lives in game.json; every other game in the games folder.
if [ "$GAME" = family ]; then
  SAVE=/data/game.json
else
  case $GAME in *[!a-z0-9-]* | '') echo "Not a game name: $GAME" >&2; exit 1 ;; esac
  SAVE=/data/games/$GAME.json
  BACKUP_DIR=$BACKUP_DIR/games/$GAME
fi

if [ $# -eq 0 ]; then
  echo "Backups of $GAME in $BACKUP_DIR (newest last):"
  ls -1 "$BACKUP_DIR"/game-*.json 2>/dev/null || echo "  (none yet)"
  echo
  echo "To restore one: $0 <file>"
  exit 0
fi

file=$1
if [ ! -f "$file" ]; then
  echo "No such file: $file" >&2
  exit 1
fi
if ! python3 -c 'import json, sys; json.load(open(sys.argv[1]))' "$file" 2>/dev/null; then
  echo "$file isn't a readable saved game, so nothing was changed." >&2
  exit 1
fi

# The app upgrades a save from an older version of itself, but can't read one from
# a newer version, so refuse that rather than lose the current game.
version() { python3 -c 'import json, sys; print(json.load(open(sys.argv[1])).get("version") or 0)' "$1"; }
running="$BACKUP_DIR/.running.json"
trap 'rm -f "$running"' EXIT
if docker cp "$CONTAINER:$SAVE" "$running" 2>/dev/null && [ "$(version "$file")" -gt "$(version "$running")" ] && [ "${FORCE:-}" != 1 ]; then
  echo "$(basename "$file") was saved by a newer version of the app (save version $(version "$file"), the app is on $(version "$running"))." >&2
  echo "Update the app first. Nothing was changed. Run with FORCE=1 to restore it anyway." >&2
  exit 1
fi

# Keep the current game, even if it hasn't changed since the last backup.
mkdir -p "$BACKUP_DIR"
current="$BACKUP_DIR/game-$(date '+%Y-%m-%d-%H%M%S')-before-restore.json"
if docker cp "$CONTAINER:$SAVE" "$current" 2>/dev/null; then
  echo "Current game saved as $current"
fi

# Stop the app first so it can't save over the restored game.
docker stop "$CONTAINER" >/dev/null
docker cp "$file" "$CONTAINER:$SAVE"
docker start "$CONTAINER" >/dev/null
echo "Restored $(basename "$file"). Reload the iPads if they don't update on their own."
