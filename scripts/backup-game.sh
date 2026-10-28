#!/bin/sh
# Copies the saved game out of the app's container into a backup folder on the
# Pi, and keeps the newest few copies. Run it by hand or nightly from cron (see
# the README). It only reads the game, so it is safe while people are playing.
#
#   CONTAINER   which copy to back up (default: ashardalon-companion, the real game)
#   BACKUP_DIR  where the copies go (default: ~/ashardalon-backups)
#   KEEP        how many copies to keep (default: 14)
set -eu

CONTAINER=${CONTAINER:-ashardalon-companion}
BACKUP_DIR=${BACKUP_DIR:-$HOME/ashardalon-backups}
KEEP=${KEEP:-14}

mkdir -p "$BACKUP_DIR"

# The narrator's recordings: one copy, kept up to date. They never change once
# made, and they're what lets the narrator talk without an ElevenLabs key.
if docker cp "$CONTAINER:/data/narration" "$BACKUP_DIR/" 2>/dev/null; then
  echo "$(date '+%F %T') Narrator recordings: $(ls "$BACKUP_DIR/narration" | wc -l) files."
fi
temp="$BACKUP_DIR/.incoming.json"
trap 'rm -f "$temp"' EXIT

# docker cp works whether the container is running or stopped.
if ! docker cp "$CONTAINER:/data/game.json" "$temp" 2>/dev/null; then
  echo "$(date '+%F %T') No saved game in $CONTAINER yet, nothing to back up."
  exit 0
fi

# Skip a copy when nothing changed since the last one, so a week without
# game night doesn't push the older saves out.
latest=$(ls -1 "$BACKUP_DIR"/game-*.json 2>/dev/null | tail -n 1 || true)
if [ -n "$latest" ] && cmp -s "$temp" "$latest"; then
  echo "$(date '+%F %T') No change since $(basename "$latest")."
  exit 0
fi

name="game-$(date '+%Y-%m-%d-%H%M%S').json"
mv "$temp" "$BACKUP_DIR/$name"
echo "$(date '+%F %T') Saved $name"

# Keep the newest $KEEP copies. The names sort by date.
ls -1 "$BACKUP_DIR"/game-*.json | head -n "-$KEEP" | while read -r old; do
  rm -f "$old"
  echo "$(date '+%F %T') Removed $(basename "$old")"
done
