# STS SmartCall SDP — integration notes

_Source: STS SDP spec (SDP.latest.docx, rev 1.5). This summarizes the contract our AVM layer aligns to._

## Lineage

**STS SmartCall SDP** (`http://sdp.smartcalltech.co.za`) is the carrier Service Delivery Platform —
step 1 of the project. It handles subscriptions, billing, SMS, opt-outs, and **AVM** (pre-recorded
voice push). This `agent-avm-interface` is **step 2**: the AI-voice version of the AVM channel
(LiveKit + callops instead of a pre-recorded message). The compliance backbone — opt-outs, DNC, DOI
consent, network identity, and the AVM outcome vocabulary — is **defined by STS**, and **Supabase is
the integration plane** where STS truth and our AI-AVM stack meet.

## Endpoints we consume

| Purpose | Endpoint | Notes |
|---|---|---|
| Trigger an AVM call | `POST /avm/{GUID}/{MSISDN}?tag=&ref=` | Body returns result; see outcomes below |
| **Opt-out list (DNC)** | `GET /avm/optouts/{GUID}` | Daily authoritative list. "Should not receive marketing on any push channel (SMS or AVM)." → feeds `suppression_list` |
| **Subscriber check** | `GET /subscriberinfo/query/{GUID}/{MSISDN}` | Returns `network`, `dnc` (bool), `contentblocked`, `subscriptions` |
| Send SMS | `GET /sendsms/?id={GUID}&msisdn=&message=` | |
| Cancel subscription | `GET /cancel/{GUID}/{MSISDN}` | |

`GUID`, short code, and keywords are **provided by STS** (per-partner config). HE (header enrichment)
exposes the msisdn to STS only.

## AVM call result vocabulary → our internal outcomes

STS AVM callback Post Data: `{ "number", "CallDuration", "CallDate", "Result" }`. The `Result` is
mapped at the edge by `lib/sts/outcomes.ts` (`mapStsResult`). Some results are **consent events**, not
just dispositions — those drive writebacks to the compliance tables.

| STS `Result` | Terminal? | Internal outcome | Reached? | Consent effect → table |
|---|---|---|---|---|
| `DIALED` | no (transient ack) | — (not stored) | — | none |
| `ANSWERED` | yes | `answered` | yes | none |
| `HANGUP` | yes | `hangup` | yes | none |
| `VOICEMAIL` | yes | `voicemail` | no (retryable) | none |
| `DECLINE` | yes | `ni` | yes | none |
| `SUBSCRIBE` | yes | `subscribed` | yes | **product opt-in** → `product_consent` |
| `UNSUBSCRIBE` | yes | `unsubscribed` | yes | **product opt-out** → `product_consent` |
| `OPT OUT` | yes | `opted_out` | yes | **global DNC** → `suppression_list` |

- "Reached" feeds the per-number daily rollover (`dial_number_state`); see `lib/compliance/outcomes.ts`.
- The three consent outcomes are first-class in `call_records.outcome` (migration `20260623100000_sts_consent_outcomes.sql`) so conversions/churn/DNC stay visible in reporting.
- `mapStsResult` throws on an unknown result so STS contract drift surfaces loudly.

## Networks (STS IDs)

`1 Vodacom · 2 MTN · 3 CELLC · 5 Telkom Mobile` (+ intl: `97 Zim, 233 Ghana, 234 Nigeria, 264 MTC,
26096 MTN Zambia, 26095 ZAMTEL`). Reconcile with `lib/networks.ts` (currently ZA Vodacom/MTN/CellC).

## Billing response codes (subscription/DOI)

`00` success · `51` insufficient funds · `07` subscriber locked (→cancel) · `01` invalid subscriber
(→cancel) · `94` **No DOI** — not opted in / terminated (→cancel) · `96` blocked list (→cancel) ·
`99` other. The `94 No DOI` code is STS's double-opt-in enforcement — the carrier-side analogue of our
`require_consent` / `product_consent` model.

## Not yet wired (follow-on work)

1. **STS client** (`/avm/optouts`, `/subscriberinfo`) — needs GUID + endpoint creds.
2. **Opt-out sync** — daily pull of `/avm/optouts/{GUID}` → `suppression_list`.
3. **Outcome ingestion handler** — receive STS AVM callbacks, `mapStsResult`, persist the outcome,
   call `record_dial_outcome`, and apply the consent writeback (`product_consent` / `suppression_list`).
