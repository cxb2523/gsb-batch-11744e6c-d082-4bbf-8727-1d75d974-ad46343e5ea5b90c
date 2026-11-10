#!/bin/sh
# Name: inkdoor - test connection
# Author: inkdoor
# Downloads the image once and reports the result, without changing anything on the Kindle.
. /mnt/us/inkdoor/common.sh
echo "$MSG_ADDRESS: $URL"
echo "$MSG_WIFI"
if ! ensure_wifi; then
  echo "$MSG_WIFI_FAILED"
  log "test: no Wi-Fi"
  exit 1
fi
if download; then
  echo "$MSG_OK"
  log "test: OK"
else
  echo "$MSG_DOWNLOAD_FAILED"
  echo "$MSG_HINT"
  log "test: download failed"
  exit 1
fi
