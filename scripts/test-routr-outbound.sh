#!/usr/bin/env bash
# End-to-end Routr outbound test: env checks → bootstrap → Routr verify → dial dry-run → live dial.
#
# Run from repo root on the deploy host (e.g. /opt/docker/production/evra_avm):
#   npm run test:routr -- --campaign-id 9 --phone +27662117829
#
# Options:
#   --campaign-id <id>     Required
#   --phone <e164>         Required unless --skip-dial
#   --skip-bootstrap       Skip docker compose bootstrap
#   --skip-verify          Skip @routr/ctl checks
#   --skip-dial            Stop after dry-run (no call placed)
#   --rebuild-bootstrap    docker compose build agent-avm-sip-routr-bootstrap first
#   --no-wait              Dial without --wait (API accept only)
#   --install-deps         Run npm ci even if node_modules exists
#   --ctl-endpoint <host:port>  Default 127.0.0.1:51908

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CAMPAIGN_ID=""
PHONE=""
SKIP_BOOTSTRAP=0
SKIP_VERIFY=0
SKIP_DIAL=0
REBUILD_BOOTSTRAP=0
WAIT_FOR_ANSWER=1
INSTALL_DEPS=0
ROUTR_CTL_ENDPOINT="${ROUTR_CTL_ENDPOINT:-127.0.0.1:51908}"

usage() {
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --campaign-id) CAMPAIGN_ID="${2:-}"; shift 2 ;;
    --phone) PHONE="${2:-}"; shift 2 ;;
    --skip-bootstrap) SKIP_BOOTSTRAP=1; shift ;;
    --skip-verify) SKIP_VERIFY=1; shift ;;
    --skip-dial) SKIP_DIAL=1; shift ;;
    --rebuild-bootstrap) REBUILD_BOOTSTRAP=1; shift ;;
    --no-wait) WAIT_FOR_ANSWER=0; shift ;;
    --install-deps) INSTALL_DEPS=1; shift ;;
    --ctl-endpoint) ROUTR_CTL_ENDPOINT="${2:-}"; shift 2 ;;
    -h|--help) usage 0 ;;
    *) echo "Unknown option: $1" >&2; usage 1 ;;
  esac
done

if [[ -z "$CAMPAIGN_ID" ]]; then
  echo "error: --campaign-id is required" >&2
  usage 1
fi
if [[ "$SKIP_DIAL" -eq 0 && -z "$PHONE" ]]; then
  echo "error: --phone is required (or pass --skip-dial)" >&2
  usage 1
fi

CTL=(npx --yes @routr/ctl@2)
CTL_FLAGS=(-e "$ROUTR_CTL_ENDPOINT" --insecure)

step() {
  echo ""
  echo "── $1 ──"
}

fail() {
  echo "error: $1" >&2
  exit 1
}

get_env() {
  local key="$1"
  if [[ ! -f .env ]]; then
    return 1
  fi
  local line
  line="$(grep -m1 "^${key}=" .env 2>/dev/null || true)"
  [[ -n "$line" ]] || return 1
  echo "${line#*=}"
}

require_env() {
  local missing=()
  local key val
  for key in "$@"; do
    val="$(get_env "$key" || true)"
    if [[ -z "$val" ]]; then
      missing+=("$key")
    else
      export "$key=$val"
    fi
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "Missing required .env variables:" >&2
    printf '  - %s\n' "${missing[@]}" >&2
    exit 1
  fi
}

require_env \
  LIVEKIT_URL \
  LIVEKIT_API_KEY \
  LIVEKIT_API_SECRET \
  LIVEKIT_SIP_ROUTR_TRUNK_ID \
  NEXT_PUBLIC_SUPABASE_URL \
  SUPABASE_SERVICE_ROLE_KEY \
  ROUTR_LIVEKIT_PEER_USERNAME \
  ROUTR_LIVEKIT_PEER_PASSWORD \
  ROUTR_OUTBOUND_CALLER_ID \
  ROUTR_CARRIER_SIP_HOST \
  ROUTR_CARRIER_SIP_USERNAME \
  ROUTR_CARRIER_SIP_PASSWORD \
  ROUTR_PUBLIC_IP

step "1. Environment"
echo "campaign_id:          $CAMPAIGN_ID"
echo "phone:                ${PHONE:-(skip dial)}"
echo "routr_trunk:          $LIVEKIT_SIP_ROUTR_TRUNK_ID"
echo "outbound_caller_id:   $ROUTR_OUTBOUND_CALLER_ID"
echo "livekit_peer_user:    $ROUTR_LIVEKIT_PEER_USERNAME"
echo "routr_ctl_endpoint:   $ROUTR_CTL_ENDPOINT"

step "2. Node dependencies"
if [[ "$INSTALL_DEPS" -eq 1 || ! -d node_modules/@supabase/supabase-js ]]; then
  echo "Running npm ci..."
  npm ci
else
  echo "node_modules present (use --install-deps to force npm ci)"
fi
if [[ ! -x node_modules/.bin/tsx ]]; then
  fail "tsx not found — run: npm ci"
fi

if [[ "$SKIP_BOOTSTRAP" -eq 0 ]]; then
  step "3. Routr bootstrap"
  if [[ "$REBUILD_BOOTSTRAP" -eq 1 ]]; then
    echo "Rebuilding agent-avm-sip-routr-bootstrap image..."
    docker compose build agent-avm-sip-routr-bootstrap
  fi
  docker compose run --rm agent-avm-sip-routr-bootstrap
else
  step "3. Routr bootstrap (skipped)"
fi

if [[ "$SKIP_VERIFY" -eq 0 ]]; then
  step "4. Routr verify (@routr/ctl)"

  echo "Peers:"
  if ! "${CTL[@]}" peers get "${CTL_FLAGS[@]}" -x; then
    fail "peers get failed — is Routr up? try: docker compose ps agent-avm-sip-routr"
  fi

  PEER_REF="$("${CTL[@]}" peers get "${CTL_FLAGS[@]}" -x 2>/dev/null | awk 'NR==2 {print $1}')"
  if [[ -n "$PEER_REF" && "$PEER_REF" != Ref ]]; then
    echo ""
    echo "LiveKit peer describe ($PEER_REF):"
    "${CTL[@]}" peers describe "$PEER_REF" "${CTL_FLAGS[@]}" || true
  fi

  echo ""
  echo "Numbers (must include tel:${ROUTR_OUTBOUND_CALLER_ID}):"
  NUMBERS_OUT="$("${CTL[@]}" numbers get "${CTL_FLAGS[@]}" -x 2>&1)" || fail "numbers get failed"
  echo "$NUMBERS_OUT"
  if ! echo "$NUMBERS_OUT" | grep -qF "tel:${ROUTR_OUTBOUND_CALLER_ID}"; then
    fail "no Routr Number for tel:${ROUTR_OUTBOUND_CALLER_ID} — check bootstrap logs and ROUTR_OUTBOUND_CALLER_ID"
  fi

  echo ""
  echo "Trunks:"
  "${CTL[@]}" trunks get "${CTL_FLAGS[@]}" -x
else
  step "4. Routr verify (skipped)"
fi

step "5. Dial dry-run (trunk resolution)"
npm run dial:route -- --campaign-id "$CAMPAIGN_ID" --route routr

if [[ "$SKIP_DIAL" -eq 1 ]]; then
  step "6. Live dial (skipped)"
  echo "Done (dry-run only)."
  exit 0
fi

step "6. Live dial"
DIAL_ARGS=(--campaign-id "$CAMPAIGN_ID" --phone "$PHONE" --route routr)
if [[ "$WAIT_FOR_ANSWER" -eq 1 ]]; then
  DIAL_ARGS+=(--wait)
fi
npm run dial -- "${DIAL_ARGS[@]}"

echo ""
echo "Done. If the call failed, check:"
echo "  docker compose logs -f agent-avm-sip-routr"
echo "  LiveKit Cloud → Telephony → Calls (SIP status / PCAP)"
