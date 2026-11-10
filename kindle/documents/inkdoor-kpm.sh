#!/bin/sh
# Name: inkdoor - connect KPM
# Author: inkdoor
# Adds this inkdoor server to KPM and installs inkdoor through it, so later updates are
# ";kpm update" and ";kpm upgrade" in the search bar. The search bar itself cannot do this step:
# the Kindle drops any search command whose arguments contain "." or ":", so a web address never
# reaches ";kpm add-repo". Running it again is safe and follows a new server address.
# KPM's install hook replaces this file while it runs, and sh reads a script as it goes: run from
# a copy in /tmp instead
COPY="${TMPDIR:-/tmp}/inkdoor-kpm.sh"
if [ "$0" != "$COPY" ] && cp "$0" "$COPY" 2>/dev/null; then
  exec /bin/sh "$COPY"
fi
. /mnt/us/inkdoor/common.sh
KPM=/var/local/kmc/bin/kpm
SU=/var/local/kmc/bin/su

kpm() {
  # KPM needs root, as the search bar's ";kpm" runs it; -y: a scriptlet cannot answer prompts
  if [ "$(id -u)" -eq 0 ] || [ ! -x "$SU" ]; then
    "$KPM" -y "$@"
  else
    "$SU" -c "$KPM -y $*"
  fi
}

if [ ! -x "$KPM" ]; then
  echo "$MSG_KPM_MISSING"
  exit 1
fi
# only what an address needs: the line below passes REPO to a root shell through su -c
case "$URL" in
  *[!]A-Za-z0-9.:/_[-]*) REPO="" ;;
  http://*/kindle.png) REPO="${URL%/kindle.png}/kpm.json" ;;
  *) REPO="" ;;
esac
if [ -z "$REPO" ]; then
  echo "$MSG_KPM_BAD_URL"
  exit 1
fi
echo "$MSG_ADDRESS: $REPO"
echo "$MSG_WIFI"
if ! ensure_wifi; then
  echo "$MSG_WIFI_FAILED"
  log "kpm: no Wi-Fi"
  exit 1
fi
# replace a repository added before (perhaps at another address), read its packages (add-repo
# alone does not), then install, which also reinstalls an inkdoor that KPM already has
kpm remove-repo inkdoor >/dev/null 2>&1 || true
kpm add-repo "$REPO" 2>&1
kpm update 2>&1
if kpm install inkdoor 2>&1; then
  echo "$MSG_KPM_OK"
  log "kpm: connected ($REPO)"
else
  echo "$MSG_KPM_FAILED"
  echo "$MSG_KPM_HINT"
  log "kpm: install failed ($REPO)"
  exit 1
fi
