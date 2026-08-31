# Agent outcome contract

**For:** LiveKit outbound agent workers.
**Owner of this doc:** control-plane (`agent-avm-interface`).
**Current write path:** agent -> `evra-callops` -> Supabase read model.

Agents should report final call outcomes to **CallOps**, not to this Next.js app and not by
writing raw `call_events` rows from the frontend repo's perspective. This app's local
`POST /api/calls/result` route is a CallOps-forwarded reconciliation safety net, not the
primary agent contract.

## 1. Authoritative endpoint

```text
POST $CALLOPS_URL/calls/outcome
Headers:
  Content-Type: application/json
  X-Webhook-Secret: <CALLOPS_WEBHOOK_SECRET>
```

Typical body:

```json
{
  "campaign_id": 42,
  "contact_id": 1007,
  "room_name": "call-27821234567-1007-1",
  "phone": "+27821234567",
  "outcome": "answered",
  "business_disposition": "subscribe",
  "talk_seconds": 37,
  "transferred": false,
  "attempt": 1
}
```

CallOps owns validation, cost calculation, contact status updates, retry scheduling, and writes
to `call_records`/related tables. The dashboard reads those results through `/api/logs`,
`/api/reports`, `/api/leads`, and `/api/calls/:id/*`.

## 2. Outcome vocabulary

The frontend treats CallOps lookup endpoints as the source of truth. Relevant current types in
`types/index.ts`:

| Field | Meaning | Examples |
|---|---|---|
| `outcome` | Telephony/business result used for charts and status chips | `connected`, `no_answer`, `busy`, `failed`, `voicemail`, `transferred`, `opted_out`, `subscribed`, `lead` |
| `business_disposition` | Raw agent-reported disposition | `subscribe`, `opt_out`, `lead`, `callback`, `qualified`, `not_interested`, `single_opt_in` |

When adding or changing values, update CallOps lookups first, then check frontend rendering in
`types/index.ts`, `components/ui/StatusChip.tsx`, `lib/tokens.ts`, and report mapping in
`app/api/reports/route.ts`.

## 3. What agents receive/read

Production dispatch is owned by CallOps and LiveKit. The frontend create/update routes only
materialize campaign fields that CallOps later uses:

| Campaign field | Purpose |
|---|---|
| `voice_recording_url` | Pre-generated main script audio to play during the call. |
| `voice_id` | Inworld voice id for voice-matched confirmation assets when that flow is enabled. |
| `routing_mode` | Call flow mode, usually product-derived (`script` or `lead`). |
| `sts_product` | Product key for STS subscription outcomes. |
| `transfer_key`, `transfer_target` | Optional DTMF transfer behavior. |
| `answer_delay_sec`, `silence_timeout_sec`, `amd_enabled`, `voicemail_action` | In-call behavior knobs surfaced in the shared type model. |

Products are the preferred source for script/consent-flow selection. A campaign stores the
resolved script URL at save time; activating a newer product script version does not change a
saved campaign until it is re-saved.

## 4. Frontend fallback endpoints

| Route | Status |
|---|---|
| `POST /api/calls/result` | Secondary CallOps reconciliation. Secret-authenticated; inserts a `call_records` row only if the primary CallOps write is missing. Do not build new agents against it. |
| `POST /api/livekit/webhook` | Signed LiveKit room/egress fallback. Can update `call_records` by room for connected/no-answer/recording/talk-time hints. |

The LiveKit webhook is a safety net for room lifecycle data. It is not a replacement for
CallOps `/calls/outcome`, which remains the authoritative outcome path.
