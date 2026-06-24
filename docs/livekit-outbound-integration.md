# Callops and LiveKit Outbound Integration

This guide explains how outbound calling is wired today: the dashboard proxies campaign controls to **evra-callops**, callops dispatches through **LiveKit SIP**, and Supabase remains the dashboard read model.

---

## 1. Big Picture

```text
Agent AVM UI
  app/page.tsx
  Play/Pause/Stop campaign
        |
        v
Next.js API (authenticated)
  POST /api/campaigns/{id}/start|pause|stop
  GET  /api/campaigns/{id}/status
        |
        | X-Webhook-Secret (server-side only)
        v
evra-callops
  owns lifecycle, queue, pacing, retries, LiveKit dispatch, /calls/outcome
        |
        +--> Supabase: campaigns, contacts, call_records, intent_stats
        |
        +--> LiveKit Cloud: agent dispatch + SIP outbound trunk
                 |
                 +--> POST /api/livekit/webhook (signed room fallback events)
```

Two outbound paths exist:

| Path | Use |
|------|-----|
| **Production UI path** | Operator controls campaign lifecycle through callops proxy routes. |
| **Direct LiveKit CLI** | Developer/ops diagnostic path via `npm run dial`; not exposed to the browser. |

There is no `/api/campaigns/:id/dial` route and no `/api/simulate` fallback in the current codebase.

---

## 2. File Map

### Production lifecycle

| File | Role |
|------|------|
| `app/api/campaigns/[id]/[action]/route.ts` | Proxies `start`, `pause`, `stop`, and `status` to callops. Falls back to local status writes when callops env is unset. |
| `app/page.tsx` | Maps UI statuses to lifecycle actions and polls `GET /api/campaigns/:id/status` for running/paused campaigns. |
| `types/index.ts` | `CampaignStatus` includes `stopped`; `CampaignLiveStatus` mirrors callops live counters. |
| `scripts/callops-test.ts` | CLI harness for callops status, lifecycle, one-off test calls, outcome simulation, snapshots, and watch mode. |
| `docs/openapi.json` | evra-callops API contract. |

### Telephony and LiveKit helpers

| File | Role |
|------|------|
| `app/api/trunks/route.ts` | SIP trunk catalog for the campaign wizard; optionally cross-checks callops `/livekit/trunks`. |
| `app/api/livekit/webhook/route.ts` | Signature-validated LiveKit webhook fallback updates to `call_records`. |
| `lib/outbound-call.ts` | Direct LiveKit SDK helpers used by the diagnostic CLI. |
| `lib/livekit.ts` | Server-only exports for LiveKit helpers and webhook receiver. |
| `lib/phone.ts` | `normalizePhone()` for contact imports before dialing. |
| `lib/voice.ts` | Resolves uploaded or generated campaign voice URLs. |
| `utils/supabase/admin.ts` | Service-role client for webhook writes and server-side signing. |

### Dashboard read model

| Route | Reads |
|-------|-------|
| `GET /api/campaigns` | `campaigns` joined to `companies` |
| `GET /api/logs` | `call_records` |
| `GET /api/reports` | `call_logs` joined to `campaigns` |
| `GET /api/intents` | `intent_stats`; `call_records` denominator for campaign-specific views |
| `GET /api/trunks` | `sip_trunks` |

---

## 3. UI Wiring

The campaign controls in `app/page.tsx` use this lifecycle map:

```typescript
const LIFECYCLE: Record<string, string> = {
  running: 'start',
  paused: 'pause',
  stopped: 'stop',
}
```

When an operator clicks Play/Pause/Stop:

1. The browser calls `POST /api/campaigns/{id}/{action}`.
2. The route authenticates the Supabase user.
3. If callops env is set, the route forwards to `CALLOPS_URL` with `X-Webhook-Secret`.
4. If callops env is missing, the route updates `campaigns.status` locally and returns `{ mode: 'local' }`.
5. The UI refreshes campaign data and immediately polls `GET /api/campaigns/{id}/status`.

Live status is only polled for `running` and `paused` campaigns. If callops is unconfigured or returns an error, the UI skips the live stats without blocking the dashboard.

---

## 4. Environment Variables

Copy `.env.local.example` for development or `.env.example` for production. Never commit real secrets.

### Required for production lifecycle

| Variable | Purpose |
|----------|---------|
| `CALLOPS_URL` | Base URL for evra-callops, no trailing slash required. |
| `CALLOPS_WEBHOOK_SECRET` | Same value as callops `WEBHOOK_SECRET`; sent as `X-Webhook-Secret`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser/server anon client key. |

### Required for LiveKit webhook and diagnostic tools

| Variable | Purpose |
|----------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side writes past RLS for LiveKit webhook and diagnostic snapshots. |
| `LIVEKIT_URL` | LiveKit project URL. |
| `LIVEKIT_API_KEY` | LiveKit API key. |
| `LIVEKIT_API_SECRET` | LiveKit API secret; also validates webhook signatures. |
| `LIVEKIT_SIP_OUTBOUND_TRUNK_ID` | Default trunk for direct diagnostic CLI when a campaign trunk is not set. |
| `LIVEKIT_AGENT_NAME` | Direct CLI fallback worker name. |

### Optional

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_POLL_INTERVAL_MS` | Dashboard refresh interval; default `15000`. |
| `LIVEKIT_RECORD_*` | Optional S3-compatible egress settings for direct LiveKit diagnostics. |
| `INWORLD_API_KEY` | Inworld TTS proxy for campaign script generation. |
| `AVM_SCRIPT_AUDIO_STORAGE_*` | Supabase S3-compatible storage for generated campaign scripts. |

---

## 5. Campaign and Trunk Data

| Table | Important fields |
|-------|------------------|
| `campaigns` | `status`, `time_window_start`, `time_window_end`, `max_concurrent`, `max_retries`, `retry_cooldown_seconds`, `auto_paused`, `sip_trunk_id`, `agent_name`, `voice_path`, `voice_recording_url` |
| `contacts` | `status`, `retry_count`, `last_attempted_at` |
| `sip_trunks` | `id`, `name`, `from_number`, `livekit_trunk_id` |
| `call_records` | `campaign_id`, `contact_id`, `phone`, `room`, `outcome`, `talk_seconds`, `cost`, `transferred`, `recording_url` |
| `intent_stats` | Daily intent waterfall counts |

The campaign wizard stores `campaigns.sip_trunk_id` as the integer `sip_trunks.id`. callops resolves that row to the LiveKit trunk id (`ST_...`). `GET /api/trunks` returns only live-backed trunks when callops can cross-check `/livekit/trunks`; otherwise it returns the full Supabase catalog.

Campaign create sets `agent_name` to `outbound-recorder`, the deployed LiveKit worker name used by callops.

---

## 6. Agent Outcome Contract

LiveKit agents should report outcomes to callops, not this app:

```text
POST $CALLOPS_URL/calls/outcome
Headers:
  Content-Type: application/json
  X-Webhook-Secret: <CALLOPS_WEBHOOK_SECRET>
```

Typical body:

```json
{
  "campaign_id": 9,
  "contact_id": 112,
  "room_name": "avm_9_112_c4996514",
  "outcome": "answered",
  "phone": "+27662117829",
  "talk_seconds": 142,
  "transferred": false,
  "attempt": 1
}
```

The local `POST /api/calls/result` route is deprecated and intentionally performs no writes. It returns `{ "ok": true, "deprecated": true }` for transitional agents.

Outcome values used by callops include `answered`, `no_answer`, `busy`, `failed`, `transferred`, and `voicemail`. Legacy dashboard rows may also contain IVR-specific values such as `qualified`, `no_speech`, `hangup`, `ni`, `dnq`, and `callback`.

---

## 7. LiveKit Webhook

Configure LiveKit project webhooks to:

```text
https://<your-public-host>/api/livekit/webhook
```

The route validates the LiveKit signature and updates `call_records` by room:

| Event | Fallback update |
|-------|-----------------|
| `participant_joined` | SIP callee identity starts with `caller_` -> pending row becomes `connected` |
| `egress_ended` | first file result location -> `recording_url` |
| `room_finished` | fill `talk_seconds` for connected rows; still-pending rows become `no_answer` |

If `SUPABASE_SERVICE_ROLE_KEY` is missing, the route acknowledges the webhook with `{ ok: true, persisted: false }` so LiveKit does not retry indefinitely.

---

## 8. Testing Checklist

### Callops lifecycle

```bash
npm run callops -- status <campaignId>
npm run callops -- start <campaignId>
npm run callops -- pause <campaignId>
npm run callops -- stop <campaignId>
npm run callops -- watch <campaignId>
```

### One-off real call through callops

```bash
npm run callops -- test-call <+E164> --trunk <ST_xxxxx>
```

This places a real outbound call.

### Simulate an agent outcome through callops

```bash
npm run callops -- outcome <campaignId> <contactId> answered --talk 90
```

### Direct LiveKit diagnostic path

```bash
npm run dial -- --campaign-id <id> --contact-id <id>
npm run dial -- --campaign-id <id> --batch 5
```

Use this only when diagnosing LiveKit SDK/trunk/agent behavior from this repo. It is not the dashboard production path.

### Verify Supabase

```sql
SELECT id, campaign_id, contact_id, phone, outcome, room, called_at
FROM call_records
ORDER BY called_at DESC
LIMIT 10;
```

---

## 9. Common Failures

| Symptom | Likely cause | Check |
|---------|--------------|-------|
| Play/Pause/Stop changes only local status | `CALLOPS_URL` or `CALLOPS_WEBHOOK_SECRET` missing | Route returns `{ mode: 'local' }`; set callops env for production |
| Live stats do not show on campaign cards | callops unconfigured/unreachable or campaign not `running`/`paused` | `npm run callops -- status <campaignId>` |
| Campaign wizard shows no trunks | Empty `sip_trunks` table or callops cross-check filters all rows | `GET /api/trunks`; verify `sip_trunks.livekit_trunk_id` exists in LiveKit |
| Agent never joins a call | callops worker name/trunk config mismatch | Campaign create sets `agent_name = outbound-recorder`; verify callops worker registration |
| Webhook updates missing | LiveKit webhook not configured, invalid LiveKit secrets, or service-role key missing | Server logs and `/api/livekit/webhook` responses |
| TTS save/generate fails | Inworld or script storage env incomplete | `INWORLD_API_KEY` and `AVM_SCRIPT_AUDIO_STORAGE_*` |

---

## 10. Related Links

- [API reference and callops alignment](./app-api-reference.md)
- [LiveKit outbound calls](https://docs.livekit.io/telephony/making-calls/outbound-calls/)
- [Agent dispatch API](https://docs.livekit.io/reference/agents/agent-dispatch-service-api/)
- [Outbound calling script recipe](https://docs.livekit.io/reference/recipes/make_call/)
