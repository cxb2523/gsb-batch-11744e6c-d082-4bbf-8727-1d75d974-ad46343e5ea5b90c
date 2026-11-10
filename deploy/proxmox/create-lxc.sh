#!/usr/bin/env bash
# Creates a Debian LXC container on a Proxmox VE host and installs inkdoor in it.
#
#   create-lxc.sh [options]
#     --config FILE            config.toml to copy into the container (else one is created)
#     --lang en-US|pt-BR       language of the screen and of these messages
#     --ip dhcp|CIDR           e.g. 192.168.1.50/24 (default: dhcp)
#     --gateway IP             router address, required with a static --ip
#     --ctid N                 container ID (default: next free ID)
#     --hostname NAME          (default: inkdoor)
#     --bridge NAME            network bridge (default: vmbr0)
#     --storage NAME           storage for the container disk (default: local-lvm)
#     --template-storage NAME  storage for the Debian template (default: local)
#     --disk GB                (default: 4)
#     --memory MB              (default: 512)
#     --ref BRANCH_OR_TAG      inkdoor version to install (default: the latest release)
#
# Run it as root on the Proxmox host (the node's Shell in the web UI, or SSH).
set -euo pipefail

REPO="${INKDOOR_REPO:-https://github.com/frkey/inkdoor.git}"
RAW_URL="${INKDOOR_RAW_URL:-https://raw.githubusercontent.com/frkey/inkdoor}"
REF="${INKDOOR_REF:-}"  # empty: install.sh picks the latest release
LANGUAGE="${INKDOOR_LANG:-}"
CONFIG=""
IP="dhcp"
GATEWAY=""
CTID=""
CT_HOSTNAME="inkdoor"
BRIDGE="vmbr0"
STORAGE="local-lvm"
TEMPLATE_STORAGE="local"
DISK=4
MEMORY=512
BAD_OPTION=""

while [ $# -gt 0 ]; do
  case "$1" in
    --config) CONFIG="${2:-}"; shift 2 || shift ;;
    --lang) LANGUAGE="${2:-}"; shift 2 || shift ;;
    --ip) IP="${2:-}"; shift 2 || shift ;;
    --gateway) GATEWAY="${2:-}"; shift 2 || shift ;;
    --ctid) CTID="${2:-}"; shift 2 || shift ;;
    --hostname) CT_HOSTNAME="${2:-}"; shift 2 || shift ;;
    --bridge) BRIDGE="${2:-}"; shift 2 || shift ;;
    --storage) STORAGE="${2:-}"; shift 2 || shift ;;
    --template-storage) TEMPLATE_STORAGE="${2:-}"; shift 2 || shift ;;
    --disk) DISK="${2:-}"; shift 2 || shift ;;
    --memory) MEMORY="${2:-}"; shift 2 || shift ;;
    --ref) REF="${2:-}"; shift 2 || shift ;;
    -h|--help) sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) BAD_OPTION="$1"; shift ;;
  esac
done

# Without --lang, follow the system locale
if [ -z "$LANGUAGE" ]; then
  case "${LC_ALL:-${LANG:-}}" in pt*) LANGUAGE="pt-BR" ;; esac
fi

case "$LANGUAGE" in
  pt*)
    MSG_BAD_OPTION="Opção desconhecida: %s (veja --help)."
    MSG_BAD_LANG="Idioma desconhecido: %s (use en-US ou pt-BR)."
    MSG_NEED_ROOT="Rode este script como root."
    MSG_NEED_PVE="Rode este script no host do Proxmox VE (não achei o comando pct)."
    MSG_NO_CONFIG="Não achei o arquivo de config: %s"
    MSG_NEED_GATEWAY="Com um IP fixo, informe também o roteador: --gateway 192.168.1.1"
    MSG_CTID_TAKEN="O ID %s já está em uso. Escolha outro com --ctid."
    MSG_TEMPLATE="Procurando o template do Debian..."
    MSG_NO_TEMPLATE="Não achei um template debian-12 ou debian-13 em '%s'."
    MSG_DOWNLOAD_TEMPLATE="Baixando o template %s..."
    MSG_TEMPLATE_FALLBACK="Este Proxmox não aceitou %s; tentando %s."
    MSG_CREATE="Criando o container %s (%s)..."
    MSG_NETWORK="Esperando a rede do container..."
    MSG_NO_NETWORK="O container não conseguiu acessar a internet. Confira a rede (--bridge, --ip, --gateway)."
    MSG_CONFIG="Copiando %s para o container..."
    MSG_FAILED_AFTER_CREATE="
O container %s foi criado, mas a instalação não terminou.
  Tentar de novo:  pct exec %s -- env LC_ALL=C.UTF-8 bash /root/inkdoor-install.sh%s
  Ou apagar:       pct stop %s; pct destroy %s --purge"
    MSG_DONE="
Pronto! Container %s (%s).
  Abra o admin no navegador, com o endereço e a senha mostrados acima.
  Entrar no container:   pct enter %s
  Atualizar o inkdoor:   pct exec %s -- env LC_ALL=C.UTF-8 bash /opt/inkdoor/deploy/install.sh"
    MSG_DHCP_HINT="O IP veio do DHCP: reserve-o no roteador para o Kindle sempre achar o servidor."
    ;;
  *)
    MSG_BAD_OPTION="Unknown option: %s (see --help)."
    MSG_BAD_LANG="Unknown language: %s (use en-US or pt-BR)."
    MSG_NEED_ROOT="Run this script as root."
    MSG_NEED_PVE="Run this script on the Proxmox VE host (the pct command was not found)."
    MSG_NO_CONFIG="Config file not found: %s"
    MSG_NEED_GATEWAY="With a static IP, also give the router address: --gateway 192.168.1.1"
    MSG_CTID_TAKEN="ID %s is already in use. Pick another one with --ctid."
    MSG_TEMPLATE="Looking for the Debian template..."
    MSG_NO_TEMPLATE="No debian-12 or debian-13 template found in '%s'."
    MSG_DOWNLOAD_TEMPLATE="Downloading the %s template..."
    MSG_TEMPLATE_FALLBACK="This Proxmox did not accept %s; trying %s."
    MSG_CREATE="Creating container %s (%s)..."
    MSG_NETWORK="Waiting for the container's network..."
    MSG_NO_NETWORK="The container cannot reach the internet. Check the network (--bridge, --ip, --gateway)."
    MSG_CONFIG="Copying %s into the container..."
    MSG_FAILED_AFTER_CREATE="
Container %s was created, but the installation did not finish.
  Try again:     pct exec %s -- env LC_ALL=C.UTF-8 bash /root/inkdoor-install.sh%s
  Or remove it:  pct stop %s; pct destroy %s --purge"
    MSG_DONE="
Done! Container %s (%s).
  Open the admin in a browser, with the address and password printed above.
  Open a shell in it:   pct enter %s
  Update inkdoor:       pct exec %s -- env LC_ALL=C.UTF-8 bash /opt/inkdoor/deploy/install.sh"
    MSG_DHCP_HINT="The IP came from DHCP: reserve it on your router so the Kindle always finds the server."
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
command -v pct >/dev/null || die "$MSG_NEED_PVE"
[ -z "$CONFIG" ] || [ -f "$CONFIG" ] || die "$MSG_NO_CONFIG" "$CONFIG"
[ "$IP" = "dhcp" ] || [ -n "$GATEWAY" ] || die "$MSG_NEED_GATEWAY"
[ -n "$CTID" ] || CTID="$(pvesh get /cluster/nextid)"
! pct status "$CTID" >/dev/null 2>&1 || die "$MSG_CTID_TAKEN" "$CTID"

CREATED=0
INSTALLER="$(mktemp)"
on_exit() {
  local status=$?
  rm -f "$INSTALLER"
  if [ "$status" -ne 0 ] && [ "$CREATED" -eq 1 ]; then
    # the retry runs under C.UTF-8 too, so it names the language this run chose
    say "$MSG_FAILED_AFTER_CREATE" "$CTID" "$CTID" "${LANGUAGE:+ --lang $LANGUAGE}${REF:+ --ref $REF}" \
      "$CTID" "$CTID" >&2
  fi
}
trap on_exit EXIT

# The installer: from this checkout when the script runs from deploy/proxmox/ of a clone,
# otherwise downloaded. Never pick up some other install.sh lying next to a downloaded script.
DEPLOY_DIR="$(dirname "${BASH_SOURCE[0]}")/.."
if [ -f "$DEPLOY_DIR/proxmox/create-lxc.sh" ] &&
   [ -f "$DEPLOY_DIR/inkdoor.service" ] && [ -f "$DEPLOY_DIR/install.sh" ]; then
  cp "$DEPLOY_DIR/install.sh" "$INSTALLER"
else
  # master's installer when no --ref: it fetches the latest release and finishes with that
  # release's own installer
  curl -fsSL "$RAW_URL/${REF:-master}/deploy/install.sh" -o "$INSTALLER"
fi

# newest_template VERSION: newest debian-VERSION-standard template, available or downloaded
newest_template() {
  {
    pveam available --section system 2>/dev/null | awk '{ print $2 }'
    pveam list "$TEMPLATE_STORAGE" 2>/dev/null | awk '{ print $1 }' | sed 's|^.*vztmpl/||'
  } | grep -E "^debian-$1-standard_.*_amd64\.tar\.(zst|gz|xz)\$" | sort -V | tail -n 1 || true
}

say "$MSG_TEMPLATE"
pveam update >/dev/null 2>&1 || true
# Newest Debian first; Proxmox releases older than Debian 13 refuse its template
TEMPLATES=()
for version in 13 12; do
  template="$(newest_template "$version")"
  [ -z "$template" ] || TEMPLATES+=("$template")
done
[ "${#TEMPLATES[@]}" -gt 0 ] || die "$MSG_NO_TEMPLATE" "$TEMPLATE_STORAGE"

NET="name=eth0,bridge=$BRIDGE,ip=$IP"
[ -z "$GATEWAY" ] || NET="$NET,gw=$GATEWAY"

say "$MSG_CREATE" "$CTID" "$CT_HOSTNAME"
for i in "${!TEMPLATES[@]}"; do
  TEMPLATE="${TEMPLATES[$i]}"
  if ! pveam list "$TEMPLATE_STORAGE" | grep -q "vztmpl/$TEMPLATE"; then
    say "$MSG_DOWNLOAD_TEMPLATE" "$TEMPLATE"
    pveam download "$TEMPLATE_STORAGE" "$TEMPLATE" >/dev/null
  fi
  if pct create "$CTID" "$TEMPLATE_STORAGE:vztmpl/$TEMPLATE" \
      --hostname "$CT_HOSTNAME" \
      --description "inkdoor: https://github.com/frkey/inkdoor" \
      --tags inkdoor \
      --cores 1 --memory "$MEMORY" --swap 256 \
      --rootfs "$STORAGE:$DISK" \
      --net0 "$NET" \
      --unprivileged 1 --features nesting=1 \
      --timezone host \
      --onboot 1 >/dev/null; then
    break
  fi
  NEXT="${TEMPLATES[$((i + 1))]:-}"
  [ -n "$NEXT" ] || exit 1
  say "$MSG_TEMPLATE_FALLBACK" "$TEMPLATE" "$NEXT"
done
CREATED=1
pct start "$CTID"
# Copied before the network check, so the retry command printed on failure works
pct push "$CTID" "$INSTALLER" /root/inkdoor-install.sh --perms 755
if [ -n "$CONFIG" ]; then
  say "$MSG_CONFIG" "$CONFIG"
  pct exec "$CTID" -- mkdir -p /etc/inkdoor
  pct push "$CTID" "$CONFIG" /etc/inkdoor/config.toml --perms 600
fi

say "$MSG_NETWORK"
for _ in $(seq 60); do
  if pct exec "$CTID" -- getent hosts deb.debian.org >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
pct exec "$CTID" -- getent hosts deb.debian.org >/dev/null 2>&1 || die "$MSG_NO_NETWORK"

ARGS=()
[ -z "$LANGUAGE" ] || ARGS+=(--lang "$LANGUAGE")
# pct exec passes on this host's locale, which the new container does not have: use one it has
pct exec "$CTID" -- env LC_ALL=C.UTF-8 LANG=C.UTF-8 INKDOOR_REPO="$REPO" INKDOOR_REF="$REF" \
  bash /root/inkdoor-install.sh "${ARGS[@]}"

say "$MSG_DONE" "$CTID" "$CT_HOSTNAME" "$CTID" "$CTID"
[ "$IP" != "dhcp" ] || say "$MSG_DHCP_HINT"
