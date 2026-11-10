#!/usr/bin/env bash
# Installs or updates inkdoor as a systemd service on Debian 12+ or Ubuntu 22.04+.
#
#   install.sh [--lang en-US|pt-BR] [--timezone Area/City] [--ref BRANCH_OR_TAG|latest]
#
# Run it as root on the machine (or container) that will serve the Kindle image. It installs
# the latest release unless --ref names a branch or tag.
# To update, run /opt/inkdoor/deploy/install.sh: it keeps the version (--ref) and repository
# of the current install, and it never overwrites config.toml or the admin password.
#
# Layout:
#   /opt/inkdoor              code and virtualenv
#   /etc/inkdoor              config.toml and admin-password (private to the inkdoor user)
#   /var/lib/inkdoor          rendered image
#   /usr/local/bin/inkdoor    runs inkdoor with that config, e.g. "inkdoor password"
set -euo pipefail

ARGS=("$@")
# Fingerprint of this script, to notice when the download brings a newer installer.
# Only read regular files: under "bash <(curl ...)" $0 is a pipe that bash is still reading.
SELF_HASH=""
[ ! -f "$0" ] || SELF_HASH="$(sha256sum < "$0")"

REPO="${INKDOOR_REPO:-}"
REF="${INKDOOR_REF:-}"
LANGUAGE="${INKDOOR_LANG:-}"
TIMEZONE=""
BAD_OPTION=""

APP_DIR=/opt/inkdoor
# Keys that sign inkdoor releases, in git's allowed-signers format. A release picked by "latest"
# is installed only when its tag is signed by one of them. The installer that checks a release is
# the one already installed, so a new key must ship in a release signed by a key listed here.
RELEASE_SIGNERS='inkdoor-release namespaces="git" ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOp2fGOY09+JvaazC0HEz+2LKFhSS+Z77UQSybUAWRbJ'
CONF_DIR=/etc/inkdoor
CONF="$CONF_DIR/config.toml"
STATE_DIR=/var/lib/inkdoor
UNIT=/etc/systemd/system/inkdoor.service
WRAPPER=/usr/local/bin/inkdoor

while [ $# -gt 0 ]; do
  case "$1" in
    --lang) LANGUAGE="${2:-}"; shift 2 || shift ;;
    --timezone) TIMEZONE="${2:-}"; shift 2 || shift ;;
    --ref) REF="${2:-}"; shift 2 || shift ;;
    -h|--help) sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) BAD_OPTION="$1"; shift ;;
  esac
done

# Without --lang, an update follows the language of the existing config. The config folder
# belongs to the inkdoor user, so it is read as that user; only a known language is taken.
if [ -z "$LANGUAGE" ] && [ -f "$CONF" ] && id inkdoor >/dev/null 2>&1; then
  LANGUAGE_LINE="s/^[[:space:]]*language[[:space:]]*=[[:space:]]*[\"']([^\"']*)[\"'].*/\\1/p"
  CONF_LANGUAGE="$( (cd / && runuser -u inkdoor -- sed -n -E "$LANGUAGE_LINE" "$CONF") 2>/dev/null |
    head -n 1 || true)"
  case "$CONF_LANGUAGE" in en-US|pt-BR) LANGUAGE="$CONF_LANGUAGE" ;; esac
fi

# Otherwise, follow the system locale
if [ -z "$LANGUAGE" ]; then
  case "${LC_ALL:-${LANG:-}}" in pt*) LANGUAGE="pt-BR" ;; esac
fi

# The messages' language is settled: from here on, every command runs in a locale that always
# exists. A shell reached through "pct exec" carries the Proxmox host's locale (en_US.UTF-8, say),
# which a fresh container does not have, and apt, perl and locale warn about it on every call.
export LC_ALL=C.UTF-8 LANG=C.UTF-8

case "$LANGUAGE" in
  pt*)
    MSG_NEED_ROOT="Rode este script como root."
    MSG_NEED_APT="Este instalador funciona só no Debian e no Ubuntu (apt)."
    MSG_NEED_SYSTEMD="O systemd não está rodando; o inkdoor precisa dele para rodar como serviço."
    MSG_BAD_OPTION="Opção desconhecida: %s (veja --help)."
    MSG_BAD_LANG="Idioma desconhecido: %s (use en-US ou pt-BR)."
    MSG_PACKAGES="Instalando pacotes do sistema..."
    MSG_OLD_PYTHON="O inkdoor precisa do Python 3.10 ou mais novo (Debian 12+ ou Ubuntu 22.04+)."
    MSG_DOWNLOAD="Baixando o inkdoor (%s)..."
    MSG_NO_TAGS="Não consegui ler as versões de %s. Confira a rede ou use --ref."
    MSG_NO_RELEASE="Nenhuma versão encontrada em %s, mas esta instalação já está numa versão; nada foi alterado. Para mudar para um branch, use --ref."
    MSG_UNSIGNED="A versão %s não está assinada com a chave de releases do inkdoor; nada foi instalado. Para instalar um branch ou uma tag sem essa conferência, use --ref."
    MSG_NOT_GIT="%s existe mas não é um clone do git; mova a pasta e rode de novo."
    MSG_PIP="Instalando o pacote Python..."
    MSG_CONFIG_NEW="Criei %s. As agendas você adiciona no admin."
    MSG_CONFIG_KEPT="Mantive o %s que já existia."
    MSG_CONFIG_LINK="%s é um link simbólico; deixei como está. O admin não grava em links: edite o arquivo à mão (para ligar o admin, acrescente [admin] enabled = true nele)."
    MSG_NO_TIMEZONE="Não detectei o fuso horário; escolha o seu na página Tela do admin."
    MSG_BAD_TIMEZONE="Fuso horário desconhecido: %s (exemplo: America/Sao_Paulo)."
    MSG_ADMIN_ENABLED="Liguei o admin pela web em %s."
    MSG_SERVICE="Instalando o serviço do systemd..."
    MSG_RUNNING="
O inkdoor está rodando."
    MSG_ADMIN_NEW="  Admin:  %s  (entre com a senha mostrada acima)"
    MSG_ADMIN_URL="  Admin:  %s"
    MSG_ADMIN_LOCAL="          ou http://%s.local:%s em computadores e celulares (o Kindle usa o IP)"
    MSG_PASSWORD_HINT="  Esqueceu a senha do admin? Rode: inkdoor password"
    MSG_ADMIN_OFF="  O admin pela web está desligado ([admin] enabled não está como true em %s)."
    MSG_ADMIN_TURN_ON="  Para ligar: coloque [admin] enabled = true nele e rode systemctl restart inkdoor."
    MSG_ADMIN_FIRST_PASSWORD="  Para ligar: coloque [admin] enabled = true nele, rode inkdoor password (cria a senha) e depois systemctl restart inkdoor."
    MSG_KINDLE_URL="  No Kindle, em inkdoor/config.sh:  URL=\"%s\""
    MSG_FAILED="O serviço não subiu. Veja: journalctl -u inkdoor -n 50"
    ;;
  *)
    MSG_NEED_ROOT="Run this script as root."
    MSG_NEED_APT="This installer supports Debian and Ubuntu (apt) only."
    MSG_NEED_SYSTEMD="systemd is not running; inkdoor needs it to run as a service."
    MSG_BAD_OPTION="Unknown option: %s (see --help)."
    MSG_BAD_LANG="Unknown language: %s (use en-US or pt-BR)."
    MSG_PACKAGES="Installing system packages..."
    MSG_OLD_PYTHON="inkdoor needs Python 3.10 or newer (Debian 12+ or Ubuntu 22.04+)."
    MSG_DOWNLOAD="Downloading inkdoor (%s)..."
    MSG_NO_TAGS="Could not list the versions of %s. Check the network or use --ref."
    MSG_NO_RELEASE="No release found in %s, but this install is already on one; nothing was changed. To switch to a branch, use --ref."
    MSG_UNSIGNED="Release %s is not signed with the inkdoor release key; nothing was installed. To install a branch or tag without this check, use --ref."
    MSG_NOT_GIT="%s exists but is not a git checkout; move it away and run again."
    MSG_PIP="Installing the Python package..."
    MSG_CONFIG_NEW="Created %s. Add your calendars in the admin."
    MSG_CONFIG_KEPT="Kept the existing %s."
    MSG_CONFIG_LINK="%s is a symbolic link; left it as it is. The admin does not save to a link: edit the file by hand (to turn the admin on, add [admin] enabled = true to it)."
    MSG_NO_TIMEZONE="Could not detect the time zone; pick yours on the admin's Screen page."
    MSG_BAD_TIMEZONE="Unknown time zone: %s (example: America/New_York)."
    MSG_ADMIN_ENABLED="Turned on the web admin in %s."
    MSG_SERVICE="Installing the systemd service..."
    MSG_RUNNING="
inkdoor is running."
    MSG_ADMIN_NEW="  Admin:  %s  (log in with the password above)"
    MSG_ADMIN_URL="  Admin:  %s"
    MSG_ADMIN_LOCAL="          or http://%s.local:%s on computers and phones (the Kindle uses the IP)"
    MSG_PASSWORD_HINT="  Forgot the admin password? Run: inkdoor password"
    MSG_ADMIN_OFF="  The web admin is off ([admin] enabled is not true in %s)."
    MSG_ADMIN_TURN_ON="  To turn it on: set [admin] enabled = true there and run systemctl restart inkdoor."
    MSG_ADMIN_FIRST_PASSWORD="  To turn it on: set [admin] enabled = true there, run inkdoor password (it makes the password), then systemctl restart inkdoor."
    MSG_KINDLE_URL="  On the Kindle, in inkdoor/config.sh:  URL=\"%s\""
    MSG_FAILED="The service did not start. See: journalctl -u inkdoor -n 50"
    ;;
esac

# say FORMAT [ARGS...]: print a message; the formats above are trusted
say() {
  local format="$1"
  shift
  # shellcheck disable=SC2059
  printf -- "$format\n" "$@"
}

die() {
  say "$@" >&2
  exit 1
}

[ -z "$BAD_OPTION" ] || die "$MSG_BAD_OPTION" "$BAD_OPTION"
case "$LANGUAGE" in ''|en-US|pt-BR) ;; *) die "$MSG_BAD_LANG" "$LANGUAGE" ;; esac
[ "$(id -u)" -eq 0 ] || die "$MSG_NEED_ROOT"
command -v apt-get >/dev/null || die "$MSG_NEED_APT"
[ -d /run/systemd/system ] || die "$MSG_NEED_SYSTEMD"

say "$MSG_PACKAGES"
export DEBIAN_FRONTEND=noninteractive DEBCONF_NOWARNINGS=yes
apt-get update -qq
# avahi-daemon announces this machine as <hostname>.local, so computers and phones can open the
# admin by name (the Kindle cannot resolve .local names and keeps using the IP address)
apt-get install -y -qq --no-install-recommends python3 python3-venv git ca-certificates tzdata \
  avahi-daemon openssh-client >/dev/null
python3 -c 'import sys; sys.exit(sys.version_info < (3, 10))' || die "$MSG_OLD_PYTHON"

# valid_timezone NAME: a zone from the system's tz database, e.g. America/Sao_Paulo
valid_timezone() {
  case "$1" in ''|/*|*..*|*[!A-Za-z0-9/_+-]*) return 1 ;; esac
  [ -f "/usr/share/zoneinfo/$1" ]
}
[ -z "$TIMEZONE" ] || valid_timezone "$TIMEZONE" || die "$MSG_BAD_TIMEZONE" "$TIMEZONE"

# Without --ref or INKDOOR_REPO, keep what the current install came from. Older installers kept
# --ref in inkdoor.ref, set to "master" when none was given: such an install now follows the
# releases, like a new one.
if [ -d "$APP_DIR/.git" ]; then
  [ -n "$REPO" ] || REPO="$(git -C "$APP_DIR" remote get-url origin 2>/dev/null || true)"
  if [ -z "$REF" ]; then
    REF="$(git -C "$APP_DIR" config --get inkdoor.version || true)"
    if [ -z "$REF" ]; then
      REF="$(git -C "$APP_DIR" config --get inkdoor.ref || true)"
      [ "$REF" != "master" ] || REF=""
    fi
  fi
fi
REPO="${REPO:-https://github.com/frkey/inkdoor.git}"
REF="${REF:-latest}"

# "latest" is the newest release tag (vX.Y.Z) newer than v1.0.0, whose installer does not know
# "latest"; until there is one, it is master, as before. The re-run below gets "latest" too, so
# the version stays symbolic and every update picks the newest release.
TARGET="$REF"
if [ "$REF" = "latest" ]; then
  TAGS="$(git ls-remote --tags --refs "$REPO" 'v*')" || die "$MSG_NO_TAGS" "$REPO"
  TARGET="$({ printf '%s\n' "$TAGS" |
    sed -n 's|^[0-9a-f]*[[:space:]]*refs/tags/\(v[0-9]*\.[0-9]*\.[0-9]*\)$|\1|p'
    echo v1.0.0; } | sort -V -u | tail -n 1)"
  if [ "$TARGET" = "v1.0.0" ]; then
    # No release yet: master, as before. An install already on a release never falls back to
    # master, which is not signed: its releases disappearing is a reason to stop, not to follow.
    CURRENT="$(git -C "$APP_DIR" describe --tags --exact-match HEAD 2>/dev/null || true)"
    case "$CURRENT" in
      v1.0.0) ;;
      v[0-9]*.[0-9]*.[0-9]*) die "$MSG_NO_RELEASE" "$REPO" ;;
    esac
    TARGET="master"
  fi
fi

# verify_release TAG: the tag is signed by one of RELEASE_SIGNERS and names itself TAG (so an
# older signed release cannot come back under a newer name)
verify_release() {
  local signers status=0
  [ "$(git -C "$APP_DIR" cat-file tag "refs/tags/$1" 2>/dev/null | sed -n 's/^tag //p')" = "$1" ] ||
    return 1
  signers="$(mktemp)"
  printf '%s\n' "$RELEASE_SIGNERS" > "$signers"
  git -C "$APP_DIR" -c gpg.ssh.allowedSignersFile="$signers" verify-tag "refs/tags/$1" \
    >/dev/null 2>&1 || status=1
  rm -f "$signers"
  return "$status"
}

# A release picked by "latest" is fetched as a tag and verified before anything from it is
# checked out or run; master (no release yet) and a --ref are taken as they are
SIGNED=""
[ "$REF" != "latest" ] || [ "$TARGET" = "master" ] || SIGNED="$TARGET"
CHECKOUT="FETCH_HEAD"
[ -z "$SIGNED" ] || CHECKOUT="refs/tags/$SIGNED"
FRESH=0
say "$MSG_DOWNLOAD" "$TARGET"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" remote set-url origin "$REPO"
  if [ -n "$SIGNED" ]; then
    git -C "$APP_DIR" fetch --quiet --depth 1 --no-tags origin "+refs/tags/$SIGNED:refs/tags/$SIGNED"
  else
    git -C "$APP_DIR" fetch --quiet --depth 1 origin "$TARGET"
  fi
elif [ -e "$APP_DIR" ]; then
  die "$MSG_NOT_GIT" "$APP_DIR"
else
  git clone --quiet --depth 1 --no-checkout --branch "$TARGET" "$REPO" "$APP_DIR"
  FRESH=1
  [ -n "$SIGNED" ] || CHECKOUT="HEAD"
fi
if [ -n "$SIGNED" ] && ! verify_release "$SIGNED"; then
  [ "$FRESH" -eq 0 ] || rm -rf "$APP_DIR"
  die "$MSG_UNSIGNED" "$SIGNED"
fi
git -C "$APP_DIR" -c advice.detachedHead=false checkout --quiet --force "$CHECKOUT"
git -C "$APP_DIR" config inkdoor.version "$REF"
git -C "$APP_DIR" config --unset inkdoor.ref || true

# Finish with the installer that was just downloaded, so an update also updates these steps
if [ -z "${INKDOOR_REEXEC:-}" ] && [ "$SELF_HASH" != "$(sha256sum < "$APP_DIR/deploy/install.sh")" ]; then
  # the language too: the locale it was found in is gone (LC_ALL=C.UTF-8 above)
  INKDOOR_REEXEC=1 INKDOOR_REPO="$REPO" INKDOOR_REF="$REF" INKDOOR_LANG="$LANGUAGE" \
    exec bash "$APP_DIR/deploy/install.sh" "${ARGS[@]}"
fi

say "$MSG_PIP"
[ -x "$APP_DIR/.venv/bin/python" ] || python3 -m venv "$APP_DIR/.venv"
# The dependencies come pinned and hash-checked from deploy/requirements.txt, setuptools (the
# build backend) included; inkdoor itself is then built with them, so nothing unpinned is fetched
"$APP_DIR/.venv/bin/pip" install --quiet --disable-pip-version-check --require-hashes \
  -r "$APP_DIR/deploy/requirements.txt"
"$APP_DIR/.venv/bin/pip" install --quiet --disable-pip-version-check --no-deps \
  --no-build-isolation --upgrade "$APP_DIR"

id inkdoor >/dev/null 2>&1 ||
  useradd --system --user-group --home-dir "$STATE_DIR" --no-create-home --shell /usr/sbin/nologin inkdoor
install -d -m 755 -o inkdoor -g inkdoor "$STATE_DIR"
# The web admin saves the config, so the folder belongs to the inkdoor user (also fixes an
# existing folder)
install -d -m 700 -o inkdoor -g inkdoor "$CONF_DIR"

# Every run: each file in the folder (config.toml, its backup, admin-password) becomes
# inkdoor:inkdoor 600, like the folder's 700 above; older installs used root:inkdoor 750/640.
# The folder is flat, and only its own entries are touched: inkdoor owns it, so anything deeper
# could be a symlink swapped in while find runs. Symlinks are skipped (-type f, chown -h). A hard
# link to another user's file cannot be planted (fs.protected_hardlinks; the service's sandbox
# also mounts the folder separately, so links across it fail with EXDEV).
find "$CONF_DIR" -mindepth 1 -maxdepth 1 -type f \( ! -user inkdoor -o ! -group inkdoor \) \
  -exec chown -h inkdoor:inkdoor {} +

# as_inkdoor CMD...: runs a command as the inkdoor user, with a private umask. Everything written
# in /etc/inkdoor goes through it, so a link planted there cannot redirect a write made by root.
as_inkdoor() {
  (cd / && umask 077 && runuser -u inkdoor -- "$@")
}

# chmod as the owner too, for the same reason
as_inkdoor find "$CONF_DIR" -mindepth 1 -maxdepth 1 -type f -exec chmod 600 {} +

# admin_setting: "on", "off" or "none" (no [admin] table) in config.toml. Prints nothing when
# the file does not parse; it is left alone, since the admin shows the problem and can restore
# the backup.
admin_setting() {
  as_inkdoor "$APP_DIR/.venv/bin/python" - "$CONF" <<'EOF'
import sys
from inkdoor.config import read_toml
try:
    data, _ = read_toml(sys.argv[1])
except Exception:
    sys.exit()
admin = data.get("admin")
print("none" if admin is None else "on" if admin.get("enabled") is True else "off")
EOF
}

# "on", "off" or "" (unknown: the file could not be read or does not parse)
ADMIN=""
if [ -L "$CONF" ]; then
  say "$MSG_CONFIG_LINK" "$CONF"
  # Links are never written, only read: no [admin] table means the admin is off
  ADMIN="$(admin_setting)"
  [ "$ADMIN" != "none" ] || ADMIN="off"
else
  if [ -f "$CONF" ]; then
    say "$MSG_CONFIG_KEPT" "$CONF"
  else
    # --timezone was checked at the start; without it, use the machine's zone unless it is UTC,
    # the usual server default rather than where the door is
    if [ -z "$TIMEZONE" ]; then  # e.g. /usr/share/zoneinfo/America/Sao_Paulo
      TIMEZONE="$(readlink /etc/localtime 2>/dev/null | sed -n 's|^.*/zoneinfo/\(posix/\)\{0,1\}||p')"
      case "$TIMEZONE" in UTC|Etc/UTC|Etc/Universal) TIMEZONE="" ;; esac
      valid_timezone "$TIMEZONE" || TIMEZONE=""
    fi
    # Only what this installer knows: calendars are added in the admin (until then the door
    # shows the setup screen), and config.example.toml explains every option for hand edits.
    # Both values are validated above, so they are safe to write as they are.
    {
      printf '# inkdoor settings. The web admin edits this file; every option is explained in\n'
      printf '# %s/config.example.toml.\n\n[display]\n' "$APP_DIR"
      printf 'language = "%s"\n' "${LANGUAGE:-en-US}"
      [ -z "$TIMEZONE" ] || printf 'timezone = "%s"\n' "$TIMEZONE"
    } | as_inkdoor tee "$CONF" >/dev/null
    [ -n "$TIMEZONE" ] || say "$MSG_NO_TIMEZONE"
    say "$MSG_CONFIG_NEW" "$CONF"
  fi

  # A server is what the admin is for: turn it on in new configs and, once, in older installs.
  # An existing [admin] table is kept as it is, including enabled = false.
  ADMIN="$(admin_setting)"
  if [ "$ADMIN" = "none" ]; then
    printf '\n[admin]\nenabled = true\n' | as_inkdoor tee -a "$CONF" >/dev/null
    ADMIN="on"
    say "$MSG_ADMIN_ENABLED" "$CONF"
  fi
fi

say "$MSG_SERVICE"
cat > "$WRAPPER" <<'EOF'
#!/bin/sh
# Runs inkdoor with the service's config and output folder (installed by deploy/install.sh)
set -- --config /etc/inkdoor/config.toml --output /var/lib/inkdoor "$@"
if [ "$(id -u)" -eq 0 ]; then
  exec runuser -u inkdoor -- /opt/inkdoor/.venv/bin/inkdoor "$@"
fi
exec /opt/inkdoor/.venv/bin/inkdoor "$@"
EOF
chmod 755 "$WRAPPER"
install -m 644 "$APP_DIR/deploy/inkdoor.service" "$UNIT"
systemctl daemon-reload
systemctl enable --quiet inkdoor

# Its messages in the same language as this script's (English without --lang)
CLI_LANG=(--lang "${LANGUAGE:-en-US}")

# The first password is made by inkdoor itself, as the inkdoor user, and printed once. Not while
# the admin is off: "inkdoor password" makes one whenever it is turned on.
NEW_PASSWORD=""
if [ "$ADMIN" != "off" ] && [ ! -e "$CONF_DIR/admin-password" ]; then
  "$WRAPPER" password "${CLI_LANG[@]}"
  NEW_PASSWORD=1
fi

systemctl restart inkdoor
sleep 3
systemctl is-active --quiet inkdoor || die "$MSG_FAILED"

# "inkdoor url" says why on its own when this machine has no address on the local network
ADMIN_URL="$("$WRAPPER" url "${CLI_LANG[@]}")" || ADMIN_URL="http://<ip>:<port>"

# The .local name, only when avahi is really announcing it and the name and port look right
systemctl enable --now --quiet avahi-daemon >/dev/null 2>&1 || true
LOCAL_NAME=""
LOCAL_PORT="${ADMIN_URL##*:}"
if systemctl is-active --quiet avahi-daemon; then
  LOCAL_NAME="$(hostname -s 2>/dev/null || true)"
  case "$LOCAL_NAME" in ''|-*|*[!A-Za-z0-9-]*) LOCAL_NAME="" ;; esac
  case "$LOCAL_PORT" in ''|*[!0-9]*) LOCAL_NAME="" ;; esac
fi
say "$MSG_RUNNING"
case "$ADMIN" in
  off)
    say "$MSG_ADMIN_OFF" "$CONF"
    if [ -e "$CONF_DIR/admin-password" ]; then
      say "$MSG_ADMIN_TURN_ON"
    else
      say "$MSG_ADMIN_FIRST_PASSWORD"
    fi ;;
  on)
    if [ -n "$NEW_PASSWORD" ]; then
      say "$MSG_ADMIN_NEW" "$ADMIN_URL"
    else
      say "$MSG_ADMIN_URL" "$ADMIN_URL"
    fi
    [ -z "$LOCAL_NAME" ] || say "$MSG_ADMIN_LOCAL" "$LOCAL_NAME" "$LOCAL_PORT"
    [ -n "$NEW_PASSWORD" ] || say "$MSG_PASSWORD_HINT" ;;
  *) ;;  # the config could not be read: the admin's state is unknown, so say nothing about it
esac
say "$MSG_KINDLE_URL" "$ADMIN_URL/kindle.png"
