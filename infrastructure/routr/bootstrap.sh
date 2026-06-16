#!/bin/sh
# Idempotent Routr Connect bootstrap — runs on every deploy.
set -eu

ROUTR_API="${ROUTR_API:-insecure://agent-avm-sip-routr:51908}"
export ROUTR_API
ROUTR_CTL_ENDPOINT="${ROUTR_CTL_ENDPOINT:-agent-avm-sip-routr:51908}"
export ROUTR_CARRIER_SIP_PORT="${ROUTR_CARRIER_SIP_PORT:-5060}"
export ROUTR_CARRIER_NAME="${ROUTR_CARRIER_NAME:-carrier}"
export ROUTR_LIVEKIT_PEER_USERNAME="${ROUTR_LIVEKIT_PEER_USERNAME:-livekit}"
export ROUTR_LIVEKIT_SIP_HOST="${ROUTR_LIVEKIT_SIP_HOST:-sip.livekit.cloud:5060}"
# .env may set ROUTR_LIVEKIT_PEER_USERNAME= (empty) — treat as livekit
case "${ROUTR_LIVEKIT_PEER_USERNAME}" in
  ""|" ") export ROUTR_LIVEKIT_PEER_USERNAME=livekit ;;
esac

CTL="npx --yes @routr/ctl@2"
CTL_FLAGS="-e ${ROUTR_CTL_ENDPOINT} --insecure"

echo "[routr-bootstrap] ROUTR_API=$ROUTR_API"

if [ -n "${ROUTR_LIVEKIT_ALLOWED_CIDRS:-}" ]; then
  echo "[routr-bootstrap] LiveKit ACL enabled (${ROUTR_LIVEKIT_ALLOWED_CIDRS})"
else
  echo "[routr-bootstrap] skip ACL (set ROUTR_LIVEKIT_ALLOWED_CIDRS to restrict LiveKit SIP sources)"
fi

if [ -n "${ROUTR_CARRIER_SIP_HOST:-}" ]; then
  echo "[routr-bootstrap] carrier trunk configured (${ROUTR_CARRIER_NAME:-carrier} → ${ROUTR_CARRIER_SIP_HOST}, sendRegister=${ROUTR_CARRIER_SEND_REGISTER:-false})"
else
  echo "[routr-bootstrap] skip carrier trunk (set ROUTR_CARRIER_SIP_HOST in .env)"
fi

cd /app
if npx tsx infrastructure/routr/bootstrap-run.ts; then
  :
else
  echo "[routr-bootstrap] tsx failed — falling back to bootstrap-apply.cjs" >&2
  node infrastructure/routr/bootstrap-apply.cjs
fi

echo "[routr-bootstrap] done"
$CTL peers get $CTL_FLAGS 2>/dev/null || true
$CTL trunks get $CTL_FLAGS 2>/dev/null || true
