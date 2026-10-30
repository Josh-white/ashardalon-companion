#!/bin/sh
# Measures how loud each music track on the Pi is (integrated LUFS, with ffmpeg) and
# writes the numbers to music-levels.json next to them. The game reads that file to
# even the tracks out so none overpowers the others; the tracks themselves are left
# exactly as downloaded. Run it after adding or swapping a loop-*.mp3. Each ten-minute
# track takes a few seconds.
#
#   SOUNDS_DIR  the sounds folder (default: the cards/sounds folder next to this script)
set -eu

SOUNDS_DIR=${SOUNDS_DIR:-$(cd "$(dirname "$0")/.." && pwd)/cards/sounds}
OUT="$SOUNDS_DIR/music-levels.json"
TMP="$OUT.tmp"

printf '{' > "$TMP"
sep=''
for file in "$SOUNDS_DIR"/loop-*.mp3; do
  [ -e "$file" ] || continue
  name=$(basename "$file" .mp3)
  lufs=$(ffmpeg -nostats -hide_banner -i "$file" -af ebur128 -f null - 2>&1 |
    awk '/Integrated loudness/ { getline; print $2 }' | tail -n 1)
  case "$lufs" in
    -[0-9]*) ;;
    *) echo "$name: could not measure, skipped" >&2; continue ;;
  esac
  echo "$name: $lufs LUFS"
  printf '%s\n  "%s": %s' "$sep" "$name" "$lufs" >> "$TMP"
  sep=','
done
printf '\n}\n' >> "$TMP"
mv "$TMP" "$OUT"
echo "Wrote $OUT"
