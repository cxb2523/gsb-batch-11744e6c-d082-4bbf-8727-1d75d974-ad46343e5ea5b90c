#!/bin/sh
# KPM uninstall hook. Before an upgrade KPM runs "sh uninstall.sh upgrade": keep everything, since
# the new install.sh replaces the scripts and keeps config.sh. "sh uninstall.sh" removes inkdoor.
# INKDOOR_KINDLE_ROOT only exists for the tests; on the Kindle it is /mnt/us.
[ "$1" = "upgrade" ] && exit 0
ROOT="${INKDOOR_KINDLE_ROOT:-/mnt/us}"
rm -f "$ROOT/documents/inkdoor-start.sh" "$ROOT/documents/inkdoor-test.sh" \
  "$ROOT/documents/inkdoor-kpm.sh"
rm -rf "$ROOT/inkdoor"
