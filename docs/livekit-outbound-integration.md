# LiveKit outbound integration — guide for Garth

This document explains how outbound calling works in Agent AVM: which files do what, how data reaches the UI, and what you need to configure to go live.

---

## 1. Big picture

Outbound calls use **LiveKit** as the telephony gateway. The app does **not** call Twilio/Telnyx directly — those providers sit **behind** a LiveKit SIP outbound trunk.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AGENT AVM UI                                    │
│  app/page.tsx  →  Play on campaign  →  POST /api/campaigns/:id/dial       │
│  Polls every 15s: /api/logs, /api/reports, /api/intents                    │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         NEXT.JS API (authenticated)                          │
│  dial/route.ts  →  lib/outbound-call.ts  →  LiveKit Server SDK              │
│    1. AgentDispatchClient.createDispatch(room, agentName, metadata)         │
│    2. SipClient.createSipParticipant(trunkId, phone, room)                  │
│  Writes: call_records (pending), contacts (in_progress → dialed/failed)     │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
           ┌────────────────┐              ┌────────────────┐
           │  LiveKit Cloud │              │    Supabase    │
           │  Agent worker  │              │  call_records  │
           │  SIP → PSTN    │              │  contacts      │
           └────────┬───────┘              │  intent_stats  │
                    │                       └────────▲───────┘
                    │  webhooks + agent POST          │
                    └─────────────────────────────────┘
                         /api/livekit/webhook
                         /api/calls/result
```

**Two ways to place calls today**

| Method | When to use |
|--------|-------------|
| **UI — Play button** | Operator starts a campaign; dials up to 25 pending contacts per click |
| **CLI — `npm run dial`** | Dev/testing: dial 1 contact, or batch 3 pending contacts in parallel |

If LiveKit env vars are missing, the UI **falls back** to `/api/simulate` (fake data) so the dashboard still moves.

---

## 2. File map — what does what

### Core telephony (server)

| File | Role |
|------|------|
| `lib/outbound-call.ts` | **Main dial logic.** `placeOutboundCall()`, `resolveTrunkId()`, LiveKit SDK clients. Safe to import from CLI scripts. |
| `lib/livekit.ts` | Re-exports `outbound-call` + `webhookReceiver()` for Next.js API routes (`server-only`). |
| `lib/phone.ts` | `normalizePhone()` — strips bad quotes/whitespace from contact imports before dialing. |
| `lib/voice.ts` | `resolveVoiceUrl()` — signs `campaigns.voice_path` from Supabase Storage for the agent to play. |
| `utils/supabase/admin.ts` | Service-role Supabase client (webhook + agent result only; never in browser). |

### API routes

| Route | Role |
|-------|------|
| `POST /api/campaigns/:id/dial` | **Production dial entry point.** Loads pending contacts, resolves trunk, places calls, inserts `call_records`. |
| `POST /api/livekit/webhook` | LiveKit → app. Updates `connected`, `recording_url`, `talk_seconds`, `no_answer` on `call_records` by `room`. |
| `POST /api/calls/result` | **Agent → app.** Rich outcome, cost, intents. Header `x-agent-secret: AGENT_RESULT_SECRET`. |
| `GET /api/logs` | UI reads **`call_records`** (per-call detail for dashboard + campaign detail). |
| `GET /api/reports` | UI reads **`call_logs`** (aggregate counters / charts). |
| `GET /api/intents` | UI reads **`intent_stats`** (intent waterfall). |
| `POST /api/simulate` | Demo fallback when LiveKit is not configured. |

### Frontend (UI)

| File | Role |
|------|------|
| `app/page.tsx` | **Main dashboard.** `updateStatus()` calls `/dial` when campaign → `running`. Polls APIs every `NEXT_PUBLIC_POLL_INTERVAL_MS` (default 15s). |
| `components/InsightDashboard.tsx` | Configurable KPI widgets; fed by `call_records` + `call_logs` via props from `page.tsx`. |
| `components/CampaignDetail.tsx` | Per-campaign call table from `/api/logs?campaignId=`. |
| `components/CampaignModal.tsx` | Creates campaigns + uploads contacts / voice recording. |
| `lib/dashboardInsights.tsx` | Widget definitions (dialed, connected, funnel, etc.). |

### CLI / testing

| File | Role |
|------|------|
| `scripts/dial-outbound.ts` | Manual dial script (same LiveKit path as API). |
| `scripts/preload-env.ts` | Loads `.env` before imports (required for CLI). |

### Database

| Location | Role |
|----------|------|
| `supabase/migrations/` | Schema history. Key migrations: `20260611100000_campaign_gateway.sql`, `20260612120000_call_records_room.sql`, `20260612140000_livekit_dialer_schema.sql`. |
| `schema.sql` | Idempotent full schema reference. |

---

## 3. How the UI is already plugged in

You do **not** need new UI code for basic live calling. The wiring exists in `app/page.tsx`:

```typescript
// When user clicks Play (campaign → running):
const res = await fetch(`/api/campaigns/${id}/dial`, { method: 'POST', ... })
const j = await res.json()
if (j?.mode === 'unconfigured') {
  // No LiveKit trunk → fake data for demo
  await fetch('/api/simulate', { method: 'POST', body: JSON.stringify({ campaignId: id }) })
}
```

**What the UI reads (no LiveKit-specific code)**

| UI surface | Data source | API |
|------------|-------------|-----|
| Dashboard KPIs, charts, recent calls | `call_records` | `GET /api/logs` |
| Campaign report table | `call_logs` | `GET /api/reports` |
| Intent waterfall | `intent_stats` | `GET /api/intents` |
| Campaign list / Play-Pause | `campaigns` | `GET/PUT /api/campaigns` |

Polling in `app/page.tsx` refreshes logs/reports every 15 seconds while logged in, so new `call_records` rows appear without a manual reload.

### UI extension points (if you want to go further)

| Goal | Suggested change |
|------|------------------|
| Show live vs simulated | Check `j.mode` from `/dial` (`live` \| `unconfigured`) and show a badge on the campaign card. |
| Dial progress toast | After `/dial`, show `j.dispatched / j.attempted` from the JSON response. |
| Disable simulate fallback | Remove the `/api/simulate` branch in `updateStatus` when LiveKit is always configured in prod. |
| “Dial next batch” button | New button → `POST /api/campaigns/:id/dial` without toggling status (same endpoint). |
| Realtime instead of poll | Replace the `setInterval` block in `page.tsx` with Supabase Realtime on `call_records` (optional). |

---

## 4. Environment variables

Copy `.env.example` → `.env` (local) or server `.env`. **Never commit real secrets.**

### Required for real outbound calls

| Variable | Purpose |
|----------|---------|
| `LIVEKIT_URL` | LiveKit project URL (`wss://…` is fine; server SDK normalizes to `https://`). |
| `LIVEKIT_API_KEY` | LiveKit API key. |
| `LIVEKIT_API_SECRET` | LiveKit API secret. |
| `LIVEKIT_SIP_OUTBOUND_TRUNK_ID` | Outbound trunk id (`ST_…`). From `lk sip outbound list`. **Legacy path** (`routing_mode = legacy`). |
| `LIVEKIT_SIP_ROUTR_TRUNK_ID` | LiveKit trunk id pointing at **Routr** (`ST_…`). **Routr path** (`routing_mode = routr`). |
| `LIVEKIT_AGENT_NAME` | Must match the agent worker’s registered name. |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser + server anon client. |
| `SUPABASE_SERVICE_ROLE_KEY` | Webhook + agent result writes (server only). |

### Optional

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_POLL_INTERVAL_MS` | Dashboard refresh interval (default `15000`). |
| `LIVEKIT_RECORD_*` | S3 egress for call recordings. |
| `AGENT_RESULT_SECRET` | Shared secret for `POST /api/calls/result`. |

### Trunk resolution order

**`campaigns.routing_mode`** (default `legacy`):

| Mode | Trunk used |
|------|------------|
| `legacy` | See legacy order below |
| `routr` | `LIVEKIT_SIP_ROUTR_TRUNK_ID` only (LiveKit → Routr → carrier) |

**Legacy order** (`routing_mode = legacy` or unset):

1. `campaigns.sip_trunk_id` if it is already `ST_…`
2. Else numeric `sip_trunk_id` → lookup `sip_trunks.livekit_trunk_id`
3. Else `LIVEKIT_SIP_OUTBOUND_TRUNK_ID` env default

Set a test campaign to Routr:

```sql
UPDATE campaigns SET routing_mode = 'routr' WHERE id = <id>;
```

Rollback (no deploy):

```sql
UPDATE campaigns SET routing_mode = 'legacy' WHERE id = <id>;
```

Staging setup and M1 checklist: [infrastructure/routr-m1-staging.md](../infrastructure/routr-m1-staging.md).

Agent name resolution (dial script + API): `campaigns.agent_name` → `LIVEKIT_AGENT_NAME` → `campaigns.agent`.

---

## 5. Supabase tables (what Garth should know)

| Table | Used for |
|-------|----------|
| `campaigns` | Campaign config; optional `agent_name`, `sip_trunk_id`, `routing_mode` (`legacy` \| `routr`), `voice_path`. |
| `contacts` | Dial queue. Status: `pending` → `in_progress` → `dialed` / `failed` / `retry`. |
| `sip_trunks` | Catalog mapping internal id → `livekit_trunk_id` + `from_number`. |
| `call_records` | **Primary UI feed** for per-call rows (`phone`, `outcome`, `talk_seconds`, `room`, `recording_url`). |
| `call_logs` | Aggregate report rows for charts (legacy/simulate path still writes here). |
| `intent_stats` | Daily intent waterfall counts. |

Room naming convention: `avm_{campaignId}_{contactId}_{random8}` — used to correlate webhook/agent events with `call_records.room`.

---

## 6. LiveKit agent integration

When a call is placed, dispatch metadata is JSON on the agent job:

```json
{
  "campaignId": "9",
  "contactId": 112,
  "phone": "+27662117829",
  "campaignName": "Demp",
  "firstName": "...",
  "voiceRecordingUrl": "https://...signed...",
  "transferKey": "...",
  "transferTarget": "..."
}
```

### Agent should POST results when the call ends

```
POST https://<your-host>/api/calls/result
Headers:
  Content-Type: application/json
  x-agent-secret: <AGENT_RESULT_SECRET>

Body:
{
  "room": "avm_9_112_c4996514",
  "outcome": "qualified",
  "talkSeconds": 142,
  "transferred": false,
  "cost": 1.25,
  "intents": [
    { "name": "Greeting", "step": 1 },
    { "name": "QuesAge", "step": 5 }
  ]
}
```

Valid `outcome` values match `call_records`: `pending`, `connected`, `qualified`, `voicemail`, `no_speech`, `hangup`, `ni`, `dnq`, `callback`, `no_answer`, `busy`, `failed`.

### LiveKit webhook (configure in LiveKit Cloud)

Point project webhooks to:

```
https://<your-public-host>/api/livekit/webhook
```

Handles `participant_joined`, `egress_ended`, `room_finished` as a safety net when the agent does not report.

---

## 7. Testing checklist

### 1. CLI — single contact

```bash
npm run dial -- --campaign-id 9 --contact-id 112
```

### 2. CLI — batch (3 parallel pending contacts)

```bash
npm run dial -- --campaign-id 9
npm run dial -- --campaign-id 9 --batch 5   # custom size
```

### 3. UI

1. Log in to the dashboard.
2. Create or open a campaign with **pending** contacts.
3. Click **Play** (status → `running`).
4. Within ~15s, new rows should appear under call logs / dashboard widgets.

### 4. Verify Supabase

```sql
SELECT id, campaign_id, phone, outcome, room, called_at
FROM call_records
ORDER BY called_at DESC
LIMIT 10;
```

### 5. Common failures

| Symptom | Likely cause |
|---------|----------------|
| UI still shows simulate/demo data | LiveKit env empty → `/dial` returns `{ mode: 'unconfigured' }`. |
| `LiveKit is not fully configured` (CLI) | Missing trunk env or `sip_trunks` row for campaign. |
| Dispatch ok, no agent in room | `LIVEKIT_AGENT_NAME` ≠ worker registration name. |
| Call places but UI stale | Wait for poll interval or hard-refresh; check `/api/logs` in Network tab. |
| Webhook updates missing | `SUPABASE_SERVICE_ROLE_KEY` not set on server; webhook URL not public. |

---

## 8. Operational notes

- **Batch size (API):** `POST /api/campaigns/:id/dial` caps at **25** contacts per request (`BATCH_LIMIT` in `dial/route.ts`). Pacing/worker queue is still TBD for production scale.
- **Batch size (CLI):** Default **3** parallel dials when only `--campaign-id` is passed.
- **Security:** `SUPABASE_SERVICE_ROLE_KEY` and `AGENT_RESULT_SECRET` are server-only. Do not prefix with `NEXT_PUBLIC_`.
- **Recordings:** Optional; configure `LIVEKIT_RECORD_*` or rely on agent-started egress; `recording_url` is set via `egress_ended` webhook.

---

## 9. Quick reference — who writes `call_records`?

| Writer | When |
|--------|------|
| `POST /api/campaigns/:id/dial` | Row inserted `outcome: pending` when call is placed. |
| `scripts/dial-outbound.ts` | Same as above (testing). |
| `POST /api/livekit/webhook` | `connected`, `no_answer`, `talk_seconds`, `recording_url`. |
| `POST /api/calls/result` | Final `outcome`, `cost`, `transferred`, intent bumps. |

The UI only **reads** `call_records` via `/api/logs` — no direct Supabase writes from React components.

---

## 10. Related links

- [LiveKit outbound calls](https://docs.livekit.io/telephony/making-calls/outbound-calls/)
- [Agent dispatch API](https://docs.livekit.io/reference/agents/agent-dispatch-service-api/)
- [Outbound calling script recipe](https://docs.livekit.io/reference/recipes/make_call/)

Questions / gaps: note in the repo or ping whoever owns the agent worker (`LIVEKIT_AGENT_NAME` + `/api/calls/result` contract).
