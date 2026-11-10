#!/bin/sh
# Name: inkdoor - start display
# Author: inkdoor
# DontUseFBInk
. /mnt/us/inkdoor/common.sh
is_running && exit 0  # already running (loop.sh also guards with the lock)
if command -v setsid >/dev/null 2>&1; then
  setsid nohup /bin/sh "$DIR/loop.sh" >/dev/null 2>&1 < /dev/null &
else
  nohup /bin/sh "$DIR/loop.sh" >/dev/null 2>&1 < /dev/null &
fi
