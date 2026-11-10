#!/bin/sh
# KPM install hook. KPM extracts the package and runs "sh install.sh" (or "sh install.sh upgrade")
# from the package folder. It puts the inkdoor scripts where a manual install puts them.
# INKDOOR_KINDLE_ROOT only exists for the tests; on the Kindle it is /mnt/us.
set -e
ROOT="${INKDOOR_KINDLE_ROOT:-/mnt/us}"
DEST="$ROOT/inkdoor"
DOCS="$ROOT/documents"
mkdir -p "$DEST" "$DOCS"
cp payload/inkdoor/common.sh payload/inkdoor/loop.sh "$DEST/"
if [ -f "$DEST/config.sh" ]; then
  # Keep the settings already there; only point URL at the server this package came from.
  # The server checked the address: no quotes, "|", "&", "$" or backslashes.
  url_line=$(grep '^URL=' payload/inkdoor/config.sh)
  tr -d '\r' < "$DEST/config.sh" | sed "s|^URL=.*|$url_line|" > "$DEST/config.sh.tmp"
  mv "$DEST/config.sh.tmp" "$DEST/config.sh"
else
  cp payload/inkdoor/config.sh "$DEST/config.sh"
fi
cp payload/documents/inkdoor-start.sh payload/documents/inkdoor-test.sh \
  payload/documents/inkdoor-kpm.sh "$DOCS/"
