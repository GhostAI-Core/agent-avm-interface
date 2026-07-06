# Anatomy of a Dispatch — tracing one AI voice call end-to-end

> The full lifecycle of a single outbound call across the five system players. Reconciled with the
> actual dashboard code 2026-07-06 (the one place the explainer video over-idealized is flagged ⚠️ below).
> Players: **Dashboard** (Next.js) · **callops** (FastAPI orchestrator) · **LiveKit agent** · **STS**
> carrier · **Supabase** (the integration plane). See `avm-system-overview.md`, `sts-sdp-integration.md`.

## The spine

CallOps is the operational API and writes the shared Supabase tables behind it. The dashboard talks to
CallOps through Next.js route proxies, while agents and LiveKit events correlate attempts by room name
on `call_records` / `call_sessions` so retries, recordings, and outcome reconciliation stay linked.

## Sequence

```mermaid
sequenceDiagram
    actor Op as Operator
    participant UI as Dashboard (Next.js)
    participant DB as Supabase
    participant CO as callops (FastAPI)
    participant LK as LiveKit agent
    participant PSTN as Carrier / callee

    Op->>UI: pick company/product, upload contacts CSV, generate pitch
    UI->>DB: TTS (Inworld) → avm_scripts bucket
    UI->>CO: create/update campaign + contacts through CallOps bearer proxy
    UI->>CO: POST /campaigns/{id}/start (X-Webhook-Secret)
    Note over UI,CO: ⚠️ real trigger is this HTTP call —<br/>not a pure DB-mutation trigger (video over-idealized)
    CO->>DB: set running; queue eligible pending/retry contacts (pgmq)
    CO->>CO: prefetch script to disk cache
    loop per contact
        CO->>DB: dispatch guards — status/DNC/network/time/rate/concurrency/retry
        Note over CO,DB: gate runs INSIDE callops (authoritative); blocked → never dialed
        CO->>LK: dispatch {phone, room=call-{contactId}-{attempt}}
        LK->>PSTN: SIP dial (30s to participant / 60s to active)
        LK->>LK: Silero VAD — human vs machine (AMD)
        alt human
            LK->>PSTN: stream 16kHz PCM pitch; monitor DTMF
            PSTN-->>LK: press 1 = subscribe / press 9 = opt-out
            LK->>LK: 4s transfer window for late keypress, then delete room
        else machine
            LK->>LK: terminate or voicemail script
        end
        LK->>CO: POST webhook {outcome, talk_seconds, SIP attrs}
        CO->>DB: normalize outcome (answered→connected); insert call_records
        CO->>DB: opt-out → suppression_list; retryable → retry+cooldown back to queue
    end
    UI->>CO: poll /api/logs, /api/reports, /api/intents (~15s) → live charts
```

## Where our work plugs in

- **Compliance gate** (`lib/compliance/gate.ts`) is legacy/reference coverage in this repo; production
  enforcement is CallOps-side. The dashboard sets operator-facing inputs such as `campaigns.network_provider`.
- **STS** (`lib/sts/*`, `app/api/sts/*`) feeds the gate's inputs: opt-out sync → `suppression_list`,
  and the AVM consent callback writes `product_consent` / `suppression_list` for the legacy carrier path
  (the AI-call path's opt-out writeback is callops' job — same tables, dedup-safe).
- **Outcome vocabulary** (`lib/sts/outcomes.ts`) mirrors callops' normalization and the STS result set.

## ⚠️ Correction vs the explainer video

The narration claims the dashboard never calls the orchestrator over HTTP and that the DB mutation is
the sole trigger. In the shipped code, `app/api/campaigns/[id]/[action]/route.ts` POSTs to
`${CALLOPS_URL}/campaigns/{id}/{action}` with `X-Webhook-Secret` (`mode:'callops'`); the DB-only path is
the fallback when callops is unconfigured (`mode:'local'`). Treat the "pure DB spine" as historical
context, not current behavior.
