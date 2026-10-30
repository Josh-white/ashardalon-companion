#!/bin/sh
# Says whether Remote Control is running on the Pi and signed in, with the end of
# its log. No sudo needed: ~/ashardalon-companion/scripts/claude-rc/status.sh
LOG=${CLAUDE_RC_LOG:-$HOME/ashardalon-backups/claude-rc.log}
CLAUDE=$(systemctl show -p Environment claude-rc 2>/dev/null | tr ' ' '\n' | sed -n 's/^CLAUDE_BIN=//p')
CLAUDE=${CLAUDE:-claude}

echo "Service:  $(systemctl is-active claude-rc 2>/dev/null) (started $(systemctl show -p ActiveEnterTimestamp --value claude-rc 2>/dev/null))"
echo "Restarts: $(systemctl show -p NRestarts --value claude-rc 2>/dev/null)"
if "$CLAUDE" auth status --json 2>/dev/null | grep -q '"loggedIn": *true'; then
  echo "Sign-in:  signed in"
else
  echo "Sign-in:  SIGNED OUT (run 'claude', type /login, then: sudo systemctl restart claude-rc)"
fi
echo "Version:  $("$CLAUDE" --version 2>/dev/null)"
echo "Memory:   $(systemctl show -p MemoryCurrent --value claude-rc 2>/dev/null | awk '{ if ($1 ~ /^[0-9]+$/) printf "%d MB", $1/1048576; else print "?" }')"
echo "Next update: $(systemctl show -p NextElapseUSecRealtime --value claude-rc-update.timer 2>/dev/null)"
echo
echo "Last log lines ($LOG):"
tail -n 8 "$LOG" 2>/dev/null || echo "  (no log yet)"
