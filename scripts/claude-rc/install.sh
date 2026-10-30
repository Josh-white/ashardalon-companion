#!/bin/sh
# Sets up Claude Remote Control to run on the Pi all the time (see the README):
#   claude-rc.service        starts on boot, restarts if it stops, runs as you
#                            (not root), with no way to use sudo, at low priority
#                            and with a memory cap so the game always comes first
#   claude-rc-update.timer   updates Claude Code at 4:30 each night and restarts
#                            Remote Control, so updates never land mid-session
#
#   sudo ~/ashardalon-companion/scripts/claude-rc/install.sh            install or update
#   sudo ~/ashardalon-companion/scripts/claude-rc/install.sh uninstall  remove it
set -eu

if [ "$(id -u)" != 0 ] || [ -z "${SUDO_USER:-}" ] || [ "$SUDO_USER" = root ]; then
  echo "Run this with sudo from your own account: sudo $0" >&2
  exit 1
fi
RUN_AS=$SUDO_USER
UNITS=/etc/systemd/system

if [ "${1:-}" = uninstall ]; then
  systemctl disable --now claude-rc-update.timer claude-rc.service 2>/dev/null || true
  rm -f "$UNITS/claude-rc.service" "$UNITS/claude-rc-update.service" "$UNITS/claude-rc-update.timer"
  systemctl daemon-reload
  echo "Removed. Run 'claude remote-control' by hand again if you want it."
  exit 0
fi

DIR=$(cd "$(dirname "$0")/../.." && pwd)
SCRIPT=$DIR/scripts/claude-rc/claude-rc.sh
HOME_DIR=$(getent passwd "$RUN_AS" | cut -d: -f6)
# The same PATH you get when you log in, so claude, node, npm, git and docker are found.
USER_PATH=$(sudo -u "$RUN_AS" -i sh -c 'echo "$PATH"')
CLAUDE=$(sudo -u "$RUN_AS" -i sh -c 'command -v claude' || true)
if [ -z "$CLAUDE" ]; then
  echo "Can't find claude for $RUN_AS. Install Claude Code and sign in first." >&2
  exit 1
fi

# Memory: slow it down past a quarter of the Pi's memory, stop it past half.
mem_mb=$(awk '/MemTotal/ { print int($2 / 1024) }' /proc/meminfo)
high_mb=$((mem_mb / 4))
max_mb=$((mem_mb / 2))

if pgrep -u "$RUN_AS" -f 'claude remote-control' >/dev/null && ! systemctl is-active -q claude-rc; then
  echo "Note: a 'claude remote-control' you started by hand is running. Stop it (Ctrl+C in its window)"
  echo "so there aren't two. The service starts its own."
fi

cat > "$UNITS/claude-rc.service" <<UNIT
[Unit]
Description=Claude Remote Control for $DIR
Wants=network-online.target
After=network-online.target docker.service
StartLimitIntervalSec=0

[Service]
User=$RUN_AS
WorkingDirectory=$DIR
Environment=HOME=$HOME_DIR
Environment=PATH=$USER_PATH
Environment=CLAUDE_BIN=$CLAUDE
Environment=DISABLE_AUTOUPDATER=1
ExecStart=$SCRIPT
Restart=always
RestartSec=30
NoNewPrivileges=yes
Nice=10
CPUWeight=50
MemoryHigh=${high_mb}M
MemoryMax=${max_mb}M
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
UNIT

cat > "$UNITS/claude-rc-update.service" <<UNIT
[Unit]
Description=Update Claude Code and restart Remote Control

[Service]
Type=oneshot
User=$RUN_AS
WorkingDirectory=$DIR
Environment=HOME=$HOME_DIR
Environment=PATH=$USER_PATH
Environment=CLAUDE_BIN=$CLAUDE
ExecStart=$SCRIPT update
ExecStartPost=+/bin/systemctl restart claude-rc.service
UNIT

cat > "$UNITS/claude-rc-update.timer" <<UNIT
[Unit]
Description=Update Claude Code at 4:30 each night

[Timer]
OnCalendar=*-*-* 04:30:00

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable claude-rc.service claude-rc-update.timer
systemctl restart claude-rc.service
systemctl start claude-rc-update.timer
echo "Remote Control now runs as a service for $RUN_AS in $DIR (memory cap ${max_mb} MB)."
echo "Check on it any time: $DIR/scripts/claude-rc/status.sh"
