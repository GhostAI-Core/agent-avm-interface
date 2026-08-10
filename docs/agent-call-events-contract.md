# Agent outcome contract — callops-first in-call behavior

**For:** the LiveKit outbound agent worker (Seeker/Grace path).
**Owner of this doc:** control-plane (agent-avm-interface). **Last aligned:** 2026-08-10.

The agent does the in-call work, but the **current result path is callops**, not a direct Supabase
`call_events` insert. Agents should report final outcomes to `POST $CALLOPS_URL/calls/outcome` with
`X-Webhook-Secret`; callops reconciles campaign/contact state and writes the dashboard read model
(`call_records`, `call_logs`, `intent_stats`). The local `POST /api/calls/result` route is a
deprecated no-op retained only so old agents stop cleanly.

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

When the agent terminates, **it hangs up itself** (it's in the room) and reports the final disposition
to callops. The control plane does not need to issue the hangup.

## 3. What the agent writes — callops `/calls/outcome`

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
  "room_name": "avm_42_1007_abcd1234",
  "phone": "+27821234567",
  "outcome": "answered",
  "talk_seconds": 37,
  "transferred": false,
  "attempt": 1
}
```

Outcome values used by callops include `answered`, `no_answer`, `busy`, `failed`, `transferred`, and
`voicemail`. Legacy dashboard rows may still contain IVR-specific values such as `qualified`,
`no_speech`, `hangup`, `ni`, `dnq`, and `callback`.

## 4. Legacy `call_events` table

The historical app-side pipeline accepted raw rows in Supabase `call_events` and used the
`process_call_event()` trigger to fan out into `call_records` / `intent_stats`. That path is not the
current contract for production agents. Do not build new workers against direct Supabase writes unless
callops explicitly reintroduces that path.

## 5. Notes

- `room` is unique in `call_records` — always send the exact room name you joined.
- LiveKit webhooks still hit `POST /api/livekit/webhook` as a signed fallback for room lifecycle,
  recording URL, talk-time, and no-answer updates.
- Use `npm run callops -- outcome <campaignId> <contactId> <outcome>` from this repo to simulate the
  callops outcome path without placing a real call.
