# Agent ↔ CallOps contract — outcome reporting & in-call behavior

**For:** the LiveKit outbound agent worker (`outbound-recorder`).
**Owner of this doc:** control-plane (agent-avm-interface). **Last aligned:** CallOps-backed outcome flow.

The agent does the in-call work and reports the final result to **evra-callops**. Do not insert raw
Supabase `call_events` rows and do not call the dashboard's local reconciliation endpoint directly.
CallOps is the primary writer for `call_records`, reports, leads, consent/frequency state, recordings,
and telemetry read by this app.

---

## 1. What the agent reads (per-call config)

Use the dispatch metadata attached by CallOps/LiveKit. Typical metadata includes:

```json
{
  "campaignId": 42,
  "contactId": 1007,
  "phone": "+27821234567",
  "campaignName": "September upgrade",
  "firstName": "Asha",
  "lastName": "Naidoo",
  "voiceRecordingUrl": "https://...",
  "voiceId": "inworld-voice-id",
  "transferKey": "1",
  "transferTarget": "+27110000000"
}
```

Campaign/product fields are resolved by CallOps before dispatch. If a campaign was created with
`product_id` or `product_version_id`, CallOps may derive script URL, voice, routing mode, STS product,
and agent behavior from that product/version.

## 2. In-call behavior the agent must enforce

| # | Behavior | Rule |
|---|---|---|
| 3 | **Answer delay** | After the callee answers, wait `answerDelaySec` (2s) before the first TTS. |
| 4 + 5 | **Voicemail / AMD** | If `amdEnabled`, run answering-machine detection on the first audio (beep/greeting). If it's a machine and `voicemailAction == "hangup"`, **terminate the call immediately** (don't burn spend). |
| 6 | **Silence drop** | If no caller speech for `silenceTimeoutSec` (4s) at any point, **drop the call** so it can't hang for hours. |

When the agent terminates, it hangs up itself (it's in the room) and reports the final disposition to
CallOps using the outcome contract below. The dashboard does not issue the hangup.

## 3. What the agent writes — CallOps `/calls/outcome`

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
  "room_name": "avm_42_1007_f3d9",
  "outcome": "answered",
  "phone": "+27821234567",
  "talk_seconds": 37,
  "transferred": false,
  "business_disposition": null,
  "attempt": 1,
  "ended_at": "2026-09-28T16:00:00.000Z"
}
```

Outcome values handled by the dashboard/reporting layer include CallOps values such as `answered`,
`subscribed`, `opted_out`, `lead`, `no_answer`, `busy`, `failed`, `transferred`, and `voicemail`.
Legacy report rows may still contain older IVR labels (`qualified`, `no_speech`, `hangup`, `ni`,
`dnq`, `callback`), but new agents should use the CallOps contract.

## 4. Dashboard reconciliation endpoint

`POST /api/calls/result` exists only as a secondary check when CallOps forwards an outcome payload
back to this dashboard:

- Auth: `X-Webhook-Secret: $CALLOPS_WEBHOOK_SECRET`.
- Key: `room_name` is checked against local `call_records.room`.
- Behavior: insert only if CallOps' primary write is missing; never update an existing row.
- Response: `{ ok: true, action: "inserted" | "exists" | "skipped" }`.

Agents should not call this route. If `room_name` or `campaign_id` is missing, reconciliation returns
400 because it cannot safely identify the call record.
