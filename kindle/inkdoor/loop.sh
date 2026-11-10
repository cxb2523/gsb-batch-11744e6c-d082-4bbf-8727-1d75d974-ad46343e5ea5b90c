#!/bin/sh
# Main loop: stops the Kindle UI and keeps the screen updated.
# To get the normal Kindle back, restart it (hold the power button).
. /mnt/us/inkdoor/common.sh
take_lock || exit 0
log "display started ($URL every ${INTERVAL}s)"

lipc-set-prop com.lab126.powerd preventScreenSaver 1
sleep 2
stop lab126_gui >/dev/null 2>&1 || /etc/init.d/framework stop >/dev/null 2>&1
sleep 3
eips -c

count=0
failures=0
while true; do
  pause=$INTERVAL
  if ensure_wifi && download; then
    if [ $((count % FULL_REFRESH_EVERY)) -eq 0 ]; then
      eips -f -g "$IMG"
    else
      eips -g "$IMG"
    fi
    count=$((count + 1))
    failures=0
    pause="$(next_wait)"    # sooner when the server renders again soon (a meeting starts or ends)
  else
    failures=$((failures + 1))
    log "download failed ($failures in a row)"
    # after 3 failures, show a small notice in the corner
    [ $failures -ge 3 ] && eips 1 1 "$MSG_NO_CONNECTION"
  fi
  sleep "$pause"
done
