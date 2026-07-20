#!/usr/bin/env bash
# Register a WhatsApp Cloud API phone number (moves it out of "Pending").
#
#   Phone Number ID : App Dashboard -> WhatsApp -> API Setup -> "From" -> Phone number ID
#   Access token    : same page (temporary, 24h) or your system-user token
#
# Usage: ./scripts/wa-register.sh          (prompts for everything)
set -euo pipefail

GRAPH_VERSION="${WHATSAPP_GRAPH_VERSION:-v21.0}"

read -rp "Phone Number ID: " WA_PNID
read -rsp "Access token: " WA_TOKEN; echo
read -rp "6-digit PIN [199102]: " WA_PIN
WA_PIN="${WA_PIN:-199102}"

if [[ ! "$WA_PNID" =~ ^[0-9]+$ ]]; then
  echo "Phone Number ID must be digits only - you may have pasted the phone number instead." >&2
  exit 1
fi
if [[ ! "$WA_PIN" =~ ^[0-9]{6}$ ]]; then
  echo "PIN must be exactly 6 digits." >&2
  exit 1
fi

echo
echo "--- Checking token and number ---"
check=$(curl -s "https://graph.facebook.com/${GRAPH_VERSION}/${WA_PNID}?fields=display_phone_number,verified_name,code_verification_status,quality_rating,platform_type" \
  -H "Authorization: Bearer ${WA_TOKEN}")
echo "$check"

if grep -q '"error"' <<<"$check"; then
  echo
  echo "Token or Phone Number ID is wrong - fix that before registering." >&2
  exit 1
fi

echo
echo "--- Registering ---"
curl -s -X POST "https://graph.facebook.com/${GRAPH_VERSION}/${WA_PNID}/register" \
  -H "Authorization: Bearer ${WA_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"messaging_product\":\"whatsapp\",\"pin\":\"${WA_PIN}\"}"
echo

echo
echo "Expected: {\"success\":true}"
echo "Then reload WhatsApp Manager -> Phone numbers; status should leave Pending."
