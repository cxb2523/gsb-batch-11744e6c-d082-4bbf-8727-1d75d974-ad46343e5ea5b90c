#!/bin/sh
# Shared settings and helpers for the inkdoor scripts on the Kindle.
DIR=/mnt/us/inkdoor
# Strip Windows line endings so config.sh can be edited on any computer
tr -d "\r" < "$DIR/config.sh" > /tmp/inkdoor-config.sh
. /tmp/inkdoor-config.sh
LOG="$DIR/log.txt"
LOCKDIR=/tmp/inkdoor.lock      # holds the PID of the running loop
IMG=/tmp/inkdoor.png
HEADERS=/tmp/inkdoor.headers   # the last download's response headers

# Guard against bad values in config.sh
case "$INTERVAL" in ''|*[!0-9]*) INTERVAL=300 ;; esac
case "$FULL_REFRESH_EVERY" in ''|*[!0-9]*|0) FULL_REFRESH_EVERY=6 ;; esac
[ "$INTERVAL" -ge 30 ] || INTERVAL=30

# Messages. The Kindle's built-in screen font has no accents, so keep them ASCII.
case "$LANGUAGE" in
  pt*)
    MSG_NO_CONNECTION="sem conexao com o PC"
    MSG_ADDRESS="Endereco"
    MSG_WIFI="Conectando ao Wi-Fi..."
    MSG_WIFI_FAILED="FALHOU: o Wi-Fi nao conectou"
    MSG_OK="OK! Imagem baixada. Pode usar 'inkdoor - start display'."
    MSG_DOWNLOAD_FAILED="FALHOU: nao consegui baixar a imagem."
    MSG_HINT="Confira o IP em inkdoor/config.sh e se o 'inkdoor serve' esta rodando no PC."
    MSG_KPM_MISSING="O KPM nao esta instalado neste Kindle."
    MSG_KPM_BAD_URL="A URL em inkdoor/config.sh precisa ser http://.../kindle.png"
    MSG_KPM_OK="OK! Para atualizar depois: ;kpm update e ;kpm upgrade na busca."
    MSG_KPM_FAILED="FALHOU: o KPM nao conseguiu instalar o inkdoor."
    MSG_KPM_HINT="Confira a URL em inkdoor/config.sh e se o admin do servidor esta ligado."
    ;;
  *)
    MSG_NO_CONNECTION="cannot reach the computer"
    MSG_ADDRESS="Address"
    MSG_WIFI="Connecting to Wi-Fi..."
    MSG_WIFI_FAILED="FAILED: Wi-Fi did not connect"
    MSG_OK="OK! Image downloaded. You can now use 'inkdoor - start display'."
    MSG_DOWNLOAD_FAILED="FAILED: could not download the image."
    MSG_HINT="Check the IP in inkdoor/config.sh and that 'inkdoor serve' is running on the computer."
    MSG_KPM_MISSING="KPM is not installed on this Kindle."
    MSG_KPM_BAD_URL="URL in inkdoor/config.sh must be http://.../kindle.png"
    MSG_KPM_OK="OK! To update later: ;kpm update, then ;kpm upgrade in the search bar."
    MSG_KPM_FAILED="FAILED: KPM could not install inkdoor."
    MSG_KPM_HINT="Check URL in inkdoor/config.sh and that the server's admin is on."
    ;;
esac

log() {
  # keep the log small: it lives on the Kindle's user storage
  if [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 102400 ]; then
    tail -n 200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
  fi
  echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"
}

# Takes the single-instance lock. mkdir is atomic, so two quick taps cannot start two loops.
# A lock left by a loop that died (without a reboot) is taken over.
take_lock() {
  if mkdir "$LOCKDIR" 2>/dev/null; then
    echo $$ > "$LOCKDIR/pid"
    return 0
  fi
  if kill -0 "$(cat "$LOCKDIR/pid" 2>/dev/null)" 2>/dev/null; then
    return 1
  fi
  echo $$ > "$LOCKDIR/pid"
  return 0
}

is_running() {
  [ -d "$LOCKDIR" ] && kill -0 "$(cat "$LOCKDIR/pid" 2>/dev/null)" 2>/dev/null
}

download() {
  rm -f "$IMG.tmp" "$HEADERS"
  if command -v curl >/dev/null 2>&1; then
    curl -s -f -m 30 -D "$HEADERS" -o "$IMG.tmp" "$URL"
  else
    # -S prints the response headers (on stderr) instead of the progress
    wget -S -T 30 -O "$IMG.tmp" "$URL" 2> "$HEADERS"
  fi
  # only replace the screen with a real PNG
  if [ -s "$IMG.tmp" ] && head -c 4 "$IMG.tmp" | grep -q PNG; then
    mv "$IMG.tmp" "$IMG"
    return 0
  fi
  return 1
}

# Seconds to wait before the next download: what the server asked for (X-Inkdoor-Next: it renders
# again when a meeting starts or ends), at least 30 and at most INTERVAL. An older server sends
# nothing, and the wait is INTERVAL.
next_wait() {
  n="$(sed -n 's/^[[:space:]]*[Xx]-[Ii]nkdoor-[Nn]ext:[[:space:]]*\([0-9][0-9]*\).*/\1/p' \
    "$HEADERS" 2>/dev/null | tail -n 1)"
  case "$n" in
    ''|??????*) echo "$INTERVAL"; return ;;    # nothing, or too long to be a real wait
  esac
  [ "$n" -ge 30 ] || n=30
  [ "$n" -le "$INTERVAL" ] || n=$INTERVAL
  echo "$n"
}

ensure_wifi() {
  lipc-set-prop com.lab126.wifid enable 1 >/dev/null 2>&1
  i=0
  while [ $i -lt 30 ]; do
    [ "$(lipc-get-prop com.lab126.wifid cmState 2>/dev/null)" = "CONNECTED" ] && return 0
    sleep 2
    i=$((i + 1))
  done
  return 1
}
