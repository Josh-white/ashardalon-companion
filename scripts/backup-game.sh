#!/bin/sh
# Copies the saved games out of the app's container into a backup folder on the
# Pi, and keeps the newest few copies of each. Run it by hand or nightly from cron
# (see the README). It only reads the games, so it is safe while people are playing.
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
# Backs up one saved game: copies it from $1 into the folder $2 as game-<date>.json,
# skipping a copy when nothing changed, and keeps the newest $KEEP there.
backup_save() {
  src=$1 dest=$2 label=$3
  mkdir -p "$dest"
  # Skip a copy when nothing changed since the last one, so a week without
  # game night doesn't push the older saves out.
  latest=$(ls -1 "$dest"/game-*.json 2>/dev/null | tail -n 1 || true)
  if [ -n "$latest" ] && cmp -s "$src" "$latest"; then
    echo "$(date '+%F %T') $label: no change since $(basename "$latest")."
    return
  fi
  name="game-$(date '+%Y-%m-%d-%H%M%S').json"
  cp "$src" "$dest/$name"
  echo "$(date '+%F %T') $label: saved $name"
  # Keep the newest $KEEP copies. The names sort by date.
  ls -1 "$dest"/game-*.json | head -n "-$KEEP" | while read -r old; do
    rm -f "$old"
    echo "$(date '+%F %T') $label: removed $(basename "$old")"
  done
}

incoming="$BACKUP_DIR/.incoming"
trap 'rm -rf "$incoming"' EXIT
rm -rf "$incoming"
mkdir -p "$incoming"

# The family game stays in game.json, with its backups straight in $BACKUP_DIR.
# docker cp works whether the container is running or stopped.
if docker cp "$CONTAINER:/data/game.json" "$incoming/game.json" 2>/dev/null; then
  backup_save "$incoming/game.json" "$BACKUP_DIR" "Family game"
else
  echo "$(date '+%F %T') No family game in $CONTAINER yet, nothing to back up."
fi

# The players' records and titles, in their own folder of backups.
if docker cp "$CONTAINER:/data/records.json" "$incoming/records.json" 2>/dev/null; then
  backup_save "$incoming/records.json" "$BACKUP_DIR/records" "Players' records"
fi

# The ideas the players sent from the 💡 button.
if docker cp "$CONTAINER:/data/ideas.json" "$incoming/ideas.json" 2>/dev/null; then
  backup_save "$incoming/ideas.json" "$BACKUP_DIR/ideas" "Ideas box"
fi

# Every other game (solo games and the like) is in the games folder. Each gets its
# own folder of backups, $BACKUP_DIR/games/<game>/, next to a copy of the list of games.
if docker cp "$CONTAINER:/data/games" "$incoming/" 2>/dev/null; then
  mkdir -p "$BACKUP_DIR/games"
  [ -f "$incoming/games/games.json" ] && cp "$incoming/games/games.json" "$BACKUP_DIR/games/games.json"
  for save in "$incoming"/games/*.json; do
    [ -f "$save" ] || continue
    game=$(basename "$save" .json)
    case $game in games | *-unreadable-*) continue ;; esac
    backup_save "$save" "$BACKUP_DIR/games/$game" "$game"
  done
fi
