#!/bin/sh
# Idempotent Routr Connect bootstrap — runs on every `docker compose up`.
# Requires Routr APIServer on ROUTR_API (default: agent-avm-sip-routr:51908).
set -eu

apk add --no-cache gettext >/dev/null 2>&1 || true

ROUTR_API="${ROUTR_API:-insecure://agent-avm-sip-routr:51908}"
export ROUTR_API
# @routr/ctl v2 uses host:port for -e (not insecure://…)
ROUTR_CTL_ENDPOINT="${ROUTR_CTL_ENDPOINT:-agent-avm-sip-routr:51908}"
export ROUTR_CARRIER_SIP_PORT="${ROUTR_CARRIER_SIP_PORT:-5060}"
export ROUTR_CARRIER_NAME="${ROUTR_CARRIER_NAME:-carrier}"
export ROUTR_LIVEKIT_PEER_USERNAME="${ROUTR_LIVEKIT_PEER_USERNAME:-livekit}"
export ROUTR_LIVEKIT_SIP_HOST="${ROUTR_LIVEKIT_SIP_HOST:-sip.livekit.cloud:5060}"
CTL="npx --yes @routr/ctl@2"
CTL_FLAGS="-e ${ROUTR_CTL_ENDPOINT} --insecure"
BOOTSTRAP_NPM=/tmp/routr-npm

ensure_npm_deps() {
  if [ -d "$BOOTSTRAP_NPM/node_modules/@routr/sdk" ] && [ -d "$BOOTSTRAP_NPM/node_modules/js-yaml" ]; then
    return 0
  fi
  echo "[routr-bootstrap] installing @routr/sdk and js-yaml..."
  mkdir -p "$BOOTSTRAP_NPM"
  npm install --prefix "$BOOTSTRAP_NPM" --no-save --omit=dev --no-audit --no-fund \
    @routr/sdk@2 js-yaml >/dev/null 2>&1
}

apply_config() {
  ensure_npm_deps
  NODE_PATH="$BOOTSTRAP_NPM/node_modules" node /bootstrap/bootstrap-apply.cjs "$@"
}

echo "[routr-bootstrap] ROUTR_API=$ROUTR_API"

render() {
  tpl="$1"
  out="$2"
  if [ ! -f "$tpl" ]; then
    return 1
  fi
  envsubst <"$tpl" >"$out"
  return 0
}

mkdir -p /tmp/routr-config
CONFIG_FILES=""

add_config() {
  file="$1"
  if [ -f "$file" ]; then
    CONFIG_FILES="$CONFIG_FILES $file"
  fi
}

# --- LiveKit peer (always) ---
if [ -n "${ROUTR_LIVEKIT_ALLOWED_CIDRS:-}" ]; then
  render /bootstrap/config/acl-livekit.yaml.tpl /tmp/routr-config/acl-livekit.yaml \
    && add_config /tmp/routr-config/acl-livekit.yaml
else
  echo "[routr-bootstrap] skip ACL (set ROUTR_LIVEKIT_ALLOWED_CIDRS to restrict LiveKit SIP sources)"
fi

if [ -n "${ROUTR_LIVEKIT_PEER_PASSWORD:-}" ]; then
  render /bootstrap/config/credentials-livekit.yaml.tpl /tmp/routr-config/credentials-livekit.yaml \
    && add_config /tmp/routr-config/credentials-livekit.yaml
  render /bootstrap/config/peer-livekit-auth.yaml.tpl /tmp/routr-config/peer-livekit.yaml \
    && add_config /tmp/routr-config/peer-livekit.yaml
else
  render /bootstrap/config/peer-livekit.yaml.tpl /tmp/routr-config/peer-livekit.yaml \
    && add_config /tmp/routr-config/peer-livekit.yaml
fi

# --- Carrier trunk (only when host is configured) ---
if [ -n "${ROUTR_CARRIER_SIP_HOST:-}" ]; then
  render /bootstrap/config/credentials-carrier.yaml.tpl /tmp/routr-config/credentials-carrier.yaml \
    && add_config /tmp/routr-config/credentials-carrier.yaml
  render /bootstrap/config/trunk-carrier.yaml.tpl /tmp/routr-config/trunk-carrier.yaml \
    && add_config /tmp/routr-config/trunk-carrier.yaml
  echo "[routr-bootstrap] carrier trunk configured (${ROUTR_CARRIER_NAME:-carrier} → ${ROUTR_CARRIER_SIP_HOST})"
else
  echo "[routr-bootstrap] skip carrier trunk (set ROUTR_CARRIER_SIP_HOST in .env)"
fi

if [ -n "$CONFIG_FILES" ]; then
  # shellcheck disable=SC2086
  apply_config $CONFIG_FILES
else
  echo "[routr-bootstrap] nothing to apply"
fi

echo "[routr-bootstrap] done"
$CTL peers get $CTL_FLAGS 2>/dev/null || true
$CTL trunks get $CTL_FLAGS 2>/dev/null || true
