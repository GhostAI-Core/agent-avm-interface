# Agent ↔ App contract — call_events pipeline & in-call behavior

**For:** the LiveKit outbound agent worker (Seeker/Grace path).
**Owner of this doc:** control-plane (agent-avm-interface). **Date:** 2026-06-18.

The agent does the in-call work and **dumps raw events into Supabase `call_events`**. A DB trigger
(`process_call_event`) maps each row into `call_records` / `intent_stats`, which the dashboards read.
The agent does **not** need to call any HTTP endpoint for results — just insert rows.

---

## 1. What the agent reads (per-call config)

Two equivalent sources — use whichever is easier:

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
- **Supabase `campaigns` row** (by `campaignId` parsed from the room name `avm_<campaignId>_<contactId>_<rand>`):
  columns `answer_delay_sec`, `amd_enabled`, `voicemail_action`, `silence_timeout_sec`.

## 2. In-call behavior the agent must enforce (touch points 3–6)

| # | Behavior | Rule |
|---|---|---|
| 3 | **Answer delay** | After the callee answers, wait `answerDelaySec` (2s) before the first TTS. |
| 4 + 5 | **Voicemail / AMD** | If `amdEnabled`, run answering-machine detection on the first audio (beep/greeting). If it's a machine and `voicemailAction == "hangup"`, **terminate the call immediately** (don't burn spend). |
| 6 | **Silence drop** | If no caller speech for `silenceTimeoutSec` (4s) at any point, **drop the call** so it can't hang for hours. |

When the agent terminates, **it hangs up itself** (it's in the room) and records the reason via a
`call_events` row (below). The control plane does not need to issue the hangup.

## 3. What the agent writes — `call_events`

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

- The dial route pre-creates a `pending` `call_records` row keyed by `room`; the trigger upserts, so
  the agent dumping before/after that is fine in either order.
- `room` is unique in `call_records` — always send the exact room name you joined.
- The legacy HTTP path (`POST /api/calls/result` with `x-agent-secret`) still works if you prefer it,
  but the `call_events` dump is the primary path going forward.
