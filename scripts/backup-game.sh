#!/bin/sh
# Copies the saved game out of the app's container into a backup folder on the
# Pi, and keeps the newest few copies. Run it by hand or nightly from cron (see
# the README). It only reads the game, so it is safe while people are playing.
#
#   CONTAINER   which copy to back up (default: ashardalon-companion, the real game)
#   BACKUP_DIR  where the copies go (default: ~/ashardalon-backups)
#   KEEP        how many copies to keep (default: 14)
#   CARDS_DIR   the card files to back up too (default: the cards folder next to this script)
set -eu

CONTAINER=${CONTAINER:-ashardalon-companion}
BACKUP_DIR=${BACKUP_DIR:-$HOME/ashardalon-backups}
KEEP=${KEEP:-14}
CARDS_DIR=${CARDS_DIR:-$(cd "$(dirname "$0")/.." && pwd)/cards}

mkdir -p "$BACKUP_DIR"

# The card text, pictures and sounds live only on the Pi (never in git), so they
# get backed up too. cards.json gets a dated copy whenever it changes; the pictures
# and sounds get one copy, kept up to date.
if [ -f "$CARDS_DIR/cards.json" ]; then
  mkdir -p "$BACKUP_DIR/cards"
  latest_cards=$(ls -1 "$BACKUP_DIR"/cards/cards-*.json 2>/dev/null | tail -n 1 || true)
  if [ -z "$latest_cards" ] || ! cmp -s "$CARDS_DIR/cards.json" "$latest_cards"; then
    cards_name="cards-$(date '+%Y-%m-%d-%H%M%S').json"
    cp "$CARDS_DIR/cards.json" "$BACKUP_DIR/cards/$cards_name"
    echo "$(date '+%F %T') Saved cards as $cards_name"
  fi
  ls -1 "$BACKUP_DIR"/cards/cards-*.json | head -n "-$KEEP" | while read -r old; do
    rm -f "$old"
  done
  for folder in art sounds; do
    if [ -d "$CARDS_DIR/$folder" ]; then
      cp -R "$CARDS_DIR/$folder" "$BACKUP_DIR/cards/"
    fi
  done
fi

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
