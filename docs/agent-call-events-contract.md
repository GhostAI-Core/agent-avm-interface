# Agent ↔ CallOps contract — call outcome pipeline & in-call behavior

**For:** the LiveKit outbound agent worker (Seeker/Grace path).
**Owner of this doc:** control-plane (agent-avm-interface). **Date:** 2026-08-03.

CallOps is now the production owner of dispatch and outcome ingestion. New LiveKit agents should
post final call outcomes and telemetry to CallOps (for example `POST $CALLOPS_URL/calls/outcome`);
CallOps writes `call_records`, intent/telemetry data, product consent, and contact state. The
dashboard reads that data through Next.js API routes.

The older raw Supabase `call_events` insert path below is retained as legacy context only. Do not
build new agent integrations against direct Supabase writes from this app.

---

## 1. What the agent reads (per-call config)

Use CallOps dispatch metadata as the production source of per-call config:

- **Dispatch metadata** (attached at dial time). JSON includes:
  ```json
  {
    "campaignId": 42, "contactId": 1007, "phone": "+27821234567",
    "campaignName": "...", "firstName": "...", "lastName": "...",
    "voiceRecordingUrl": "https://…", "disclosureText": "…",
    "behavior": { "answerDelaySec": 2, "amdEnabled": true, "voicemailAction": "hangup", "silenceTimeoutSec": 4 },
    "transferKey": "...", "transferTarget": "..."
  }
  ```
Older workers sometimes read the Supabase `campaigns` row by `campaignId` parsed from the room name
(`avm_<campaignId>_<contactId>_<rand>`). Treat that as a legacy fallback; CallOps should provide the
runtime configuration needed by the worker.

## 2. In-call behavior the agent must enforce (touch points 3–6)

| # | Behavior | Rule |
|---|---|---|
| 3 | **Answer delay** | After the callee answers, wait `answerDelaySec` (2s) before the first TTS. |
| 4 + 5 | **Voicemail / AMD** | If `amdEnabled`, run answering-machine detection on the first audio (beep/greeting). If it's a machine and `voicemailAction == "hangup"`, **terminate the call immediately** (don't burn spend). |
| 6 | **Silence drop** | If no caller speech for `silenceTimeoutSec` (4s) at any point, **drop the call** so it can't hang for hours. |

When the agent terminates, **it hangs up itself** (it's in the room) and records the reason via a
`call_events` row (below). The control plane does not need to issue the hangup.

## 3. Legacy raw event path — `call_events`

Production agents should prefer CallOps HTTP ingestion. If you are maintaining an older worker that
still inserts into Supabase directly, the historical shape was:

Insert one row per event. Only `room` and `event_type` are required; put everything else in `payload`.
`campaign_id` / `contact_id` come from the room name; `processed` is set by the trigger — leave it `false`.

```sql
INSERT INTO call_events (room, campaign_id, contact_id, phone, event_type, payload) VALUES (…);
```

| `event_type` | When | `payload` keys used by the trigger | Resulting `call_records` change |
|---|---|---|---|
| `answered` | callee picks up | — | `outcome` 'pending' → 'connected' |
| `voicemail_detected` | AMD says machine (then hang up) | — | `outcome` → 'voicemail' |
| `dropped_no_response` | silence timeout → dropped | `{ "seconds": 4 }` (optional) | `outcome` → 'dropped_no_response' |
| `outcome` | final disposition | `{ "outcome": "...", "talk_seconds": 37, "cost": 0.42, "transferred": true }` | sets those fields |
| `recording` | recording stored | `{ "url": "s3://…" }` | sets `recording_url` |
| `intent` | an intent step reached | `{ "name": "qualified", "step": 2 }` | bumps the intent waterfall |

`outcome` must be one of: `connected, qualified, voicemail, no_speech, hangup, ni, dnq, callback,
no_answer, busy, failed, dropped_no_response`.

Unknown `event_type`s are accepted and kept **raw** (not mapped) — safe to dump extra telemetry
(transcripts, partials, debug) for later use without breaking anything.

## 4. Notes

- The app no longer has an authenticated `/api/campaigns/{id}/dial` route. CallOps owns room creation,
  contact claim/retry state, and primary outcome writes.
- `room` is unique in `call_records` — always send the exact room name you joined.
- `POST /api/calls/result` on this app is a secret-protected reconciliation fallback for CallOps. It
  checks whether the `call_records.room` row already exists and only inserts a missing record. It is
  not the primary agent API.
