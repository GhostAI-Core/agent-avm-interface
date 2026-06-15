#!/bin/sh
# Idempotent Routr Connect bootstrap — runs on every `docker compose up`.
# Requires Routr APIServer on ROUTR_API (default: agent-avm-sip-routr:51908).
set -eu

apk add --no-cache gettext >/dev/null 2>&1 || true

ROUTR_API="${ROUTR_API:-insecure://agent-avm-sip-routr:51908}"
export ROUTR_API
export ROUTR_CARRIER_SIP_PORT="${ROUTR_CARRIER_SIP_PORT:-5060}"
export ROUTR_CARRIER_NAME="${ROUTR_CARRIER_NAME:-carrier}"
export ROUTR_LIVEKIT_PEER_USERNAME="${ROUTR_LIVEKIT_PEER_USERNAME:-livekit}"
export ROUTR_LIVEKIT_SIP_HOST="${ROUTR_LIVEKIT_SIP_HOST:-sip.livekit.cloud:5060}"
CTL="npx --yes @routr/ctl@2"

echo "[routr-bootstrap] ROUTR_API=$ROUTR_API"

wait_for_api() {
  i=0
  while [ "$i" -lt 90 ]; do
    if $CTL ping --insecure >/dev/null 2>&1; then
      echo "[routr-bootstrap] Routr API is up"
      return 0
    fi
    i=$((i + 1))
    sleep 2
  done
  echo "[routr-bootstrap] ERROR: Routr API not reachable after 180s" >&2
  exit 1
}

apply_resource() {
  file="$1"
  if [ ! -f "$file" ]; then
    return 0
  fi
  echo "[routr-bootstrap] applying $file"
  if $CTL create -f "$file" --insecure 2>/dev/null; then
    return 0
  fi
  $CTL apply -f "$file" --insecure
}

render() {
  tpl="$1"
  out="$2"
  if [ ! -f "$tpl" ]; then
    return 1
  fi
  envsubst <"$tpl" >"$out"
  return 0
}

wait_for_api
mkdir -p /tmp/routr-config

# --- LiveKit peer (always) ---
if [ -n "${ROUTR_LIVEKIT_ALLOWED_CIDRS:-}" ]; then
  render /bootstrap/config/acl-livekit.yaml.tpl /tmp/routr-config/acl-livekit.yaml \
    && apply_resource /tmp/routr-config/acl-livekit.yaml
else
  echo "[routr-bootstrap] skip ACL (set ROUTR_LIVEKIT_ALLOWED_CIDRS to restrict LiveKit SIP sources)"
fi

if [ -n "${ROUTR_LIVEKIT_PEER_PASSWORD:-}" ]; then
  render /bootstrap/config/credentials-livekit.yaml.tpl /tmp/routr-config/credentials-livekit.yaml \
    && apply_resource /tmp/routr-config/credentials-livekit.yaml
  render /bootstrap/config/peer-livekit-auth.yaml.tpl /tmp/routr-config/peer-livekit.yaml \
    && apply_resource /tmp/routr-config/peer-livekit.yaml
else
  render /bootstrap/config/peer-livekit.yaml.tpl /tmp/routr-config/peer-livekit.yaml \
    && apply_resource /tmp/routr-config/peer-livekit.yaml
fi

# --- Carrier trunk (only when host is configured) ---
if [ -n "${ROUTR_CARRIER_SIP_HOST:-}" ]; then
  render /bootstrap/config/credentials-carrier.yaml.tpl /tmp/routr-config/credentials-carrier.yaml \
    && apply_resource /tmp/routr-config/credentials-carrier.yaml
  render /bootstrap/config/trunk-carrier.yaml.tpl /tmp/routr-config/trunk-carrier.yaml \
    && apply_resource /tmp/routr-config/trunk-carrier.yaml
  echo "[routr-bootstrap] carrier trunk applied (${ROUTR_CARRIER_NAME:-carrier} → ${ROUTR_CARRIER_SIP_HOST})"
else
  echo "[routr-bootstrap] skip carrier trunk (set ROUTR_CARRIER_SIP_HOST in .env)"
fi

echo "[routr-bootstrap] done"
$CTL peers list --insecure 2>/dev/null || true
$CTL trunks list --insecure 2>/dev/null || true
