# AVM Platform — System Overview (what it is, and what it will be)

> A single source describing the AVM (Automated Voice Message) calling platform: its players, how
> they connect, the compliance backbone, the call flow, what exists today, and the planned future.
> Written to be mapped — every section is a node, every "feeds / owns / writes" is an edge.

---

## 1. The one-paragraph picture

The platform makes **automated outbound voice calls** that pitch a product, let the person **press 1
to subscribe or press 9 to opt out**, and record the result — while staying **compliant** (consent,
do-not-contact, calling hours, no repeat-dialing). It is built in two generations: an existing carrier
platform (**STS**) that did simple pre-recorded calls, and a new **AI-voice layer** (this project) that
replaces the pre-recorded message with a real-time AI agent. The two generations meet inside a shared
**Supabase** database.

---

## 2. The players (four systems + one shared database)

### 2.1 STS SmartCall SDP — the carrier platform (generation 1)
- The Service Delivery Platform at `sdp.smartcalltech.co.za`.
- **Owns** carrier-side truth: subscriptions, **billing**, SMS, the **opt-out (Do-Not-Contact) list**,
  per-subscriber DNC status, double-opt-in (DOI) enforcement, and the canonical **AVM call-result
  vocabulary**.
- This is the older, simpler generation: pre-recorded AVM voice push.

### 2.2 Agent AVM Interface — the dashboard + control plane (generation 2, THIS project)
- A Next.js + MUI single-page app.
- **Owns** the human-facing surface: campaign creation, contact lists, voice/script generation,
  reporting, call-quality review, settings, and the **compliance preview**.
- It is a **control plane**: it does NOT place calls itself. It tells callops to start/pause/stop and
  then displays live status and results.

### 2.3 callops (evra-callops) — the dialer / orchestrator
- **Owns dialing.** It places the calls, manages pacing, and is therefore the **authoritative place
  for pre-dial compliance enforcement**.
- The app sends it lifecycle commands; callops reports live stats back.

### 2.4 LiveKit — the voice + telephony transport
- **Owns** the SIP call itself and the AI voice agent + call recording (egress to storage).

### 2.5 Supabase — the integration plane (the shared spine)
- Postgres + Auth + Storage.
- **The meeting point**: STS truth (opt-outs, DNC), the app's campaigns/contacts, callops' dial state,
  and call results all live here. "The secret is Supabase" — every other system reads and writes this
  shared database rather than talking point-to-point.

**Relationship summary:** App → commands → callops → dials via → LiveKit. STS → opt-out/DNC truth →
Supabase. callops + App + STS all read/write → Supabase.

---

## 3. The lineage (why there are two generations)

- **Step 1 = STS** (carrier AVM: pre-recorded message, subscription, billing).
- **Step 2 = this Agent AVM Interface** (AI voice agent instead of a recording, richer dashboard).
- The **compliance backbone is inherited from STS** — opt-out list, DNC, DOI consent, network
  identity, and the result vocabulary are all defined by STS. The new platform aligns to that contract
  rather than inventing its own.

---

## 4. The data model (key tables in Supabase)

### 4.1 Core calling
- **companies** → **campaigns** → **contacts** (a campaign dials a list of contacts for a company).
- **call_records** — one row per call: outcome, duration, cost, recording URL.
- **call_logs / intent_stats** — rolled-up reporting.

### 4.2 Compliance (schema live in Supabase, currently empty)
- **suppression_list** — global Do-Not-Contact (DNC). Blocks a phone on every channel/campaign.
- **product_consent** — consent **per product** (not per contact, not per campaign). Opting out of a
  product blocks that contact on every campaign of the same product, but never another product.
- **dial_number_state** — per-phone daily dialing state (cross-campaign): was the number reached today,
  how many attempts, when it's next eligible.
- **compliance_events** — audit trail of gate decisions (blocked / passed).

### 4.3 Storage buckets
- **avm_scripts** (public) — the generated pitch audio, one per campaign.
- **avm_response_scripts** (public, NEW) — per-voice **opt-in** and **opt-out** confirmation clips.
- **voice-recordings** (private) — call recordings.

---

## 5. The compliance gate (the rules before a call is allowed)

A pure decision function checks each contact in order; the first failing check blocks the call:

1. **Region** — campaign market approved AND the number matches it.
2. **Network** — number is on an allowed carrier (Vodacom / MTN / Cell C; STS also knows Telkom + intl).
3. **Dead number** — score driven to the floor by repeated bad outcomes → stop spending.
4. **Consent / DNC** — opted out, on the suppression list, or (if required) not opted in → block.
5. **Calling window** — within the contact's local calling hours (default 08:00–20:00).
6. **Daily rollover (per phone, across all campaigns)** — one live answer per number per day ends the
   day; missed attempts are capped per day and **randomly spaced** (anti carrier-block lever).

- **Where it runs:** the app keeps this as a **tested reference library + reporting/preview**. The
  **authoritative enforcement runs in callops** (because callops owns dialing). Same logic, two roles.

---

## 6. The outcome & consent vocabulary (how a call result becomes a consent decision)

STS reports each AVM call with a `Result`. Some results are plain dispositions; three are **consent
events** that write back to the compliance tables.

| STS Result | Meaning | Reached? | Consent effect |
|---|---|---|---|
| DIALED | placed, not yet resolved (transient) | — | none (not stored) |
| ANSWERED / HANGUP | a person answered | yes | none |
| VOICEMAIL | machine | no (retry) | none |
| DECLINE | answered, said no | yes | none |
| **SUBSCRIBE** | **pressed 1 — opted in / converted** | yes | **product opt-in** |
| **UNSUBSCRIBE** | left this product | yes | **product opt-out** |
| **OPT OUT** | **pressed 9 — global DNC** | yes | **add to suppression list** |

**Rule:** once a contact subscribes, declines, or opts out, they **cannot be contacted again for the
same product** (the writeback to product_consent / suppression enforces this on the next gate check).

---

## 7. The call flow (end to end)

1. Operator builds a **campaign** in the dashboard: picks a company, uploads contacts, **chooses a
   voice**, and **generates the pitch script** (text → AI voice → `avm_scripts`).
2. When the voice is chosen, that voice's **opt-in and opt-out response clips** are pulled/cached from
   `avm_response_scripts`, ready to play.
3. Operator presses **Start** → app tells **callops** to run the campaign.
4. For each contact, **callops checks the compliance gate**; only allowed numbers are dialed.
5. **LiveKit** places the call; the AI agent plays the pitch.
6. The person **presses 1 (subscribe)** or **9 (opt out)** → the matching cached clip plays.
7. The result is reported in **STS vocabulary**, mapped to an internal outcome, stored in
   `call_records`, the **daily rollover** is updated, and any **consent writeback** fires
   (product_consent / suppression).
8. Dashboard shows live status and, later, reporting + recordings.

---

## 8. The frontend (what the operator sees)

- **Dashboard / Control Room** — KPIs, charts, live polling, campaign play/pause/stop.
- **Campaigns** — create / edit, contact upload, voice + script.
- **Companies** — client roster.
- **Reports** — outcomes, funnel, spend, per-call drill-down.
- **Quality** — call + recording review.
- **Telephony settings** — SIP providers, trunks, dispatch rules (today a localStorage mock; being made
  real). Forms now open in a **right-side Drawer** over a full-width table.
- **Security / Settings / Profile** — audit log, config, passkey auth.

---

## 9. What exists today (built, not yet merged)

- Clean `main` baseline + a roadmap.
- Compliance gate as a **pure, tested library** (first automated tests on the project) + the shared
  schema (live in Supabase).
- **STS outcome vocabulary aligned** at the edge, with consent side-effects mapped; three first-class
  consent outcomes; fixed a bug where "answered" didn't end the daily rollover.
- Telephony forms moved into a **right-anchored Drawer**.
- New **`avm_response_scripts` bucket** + per-voice opt-in/opt-out storage helpers.
- Two written specs (the STS contract; the callops enforcement contract for the dialer owner).

---

## 10. What it will be (the roadmap)

### 10.1 Make compliance real
- Merge the gate + tests to `main`; callops enforces the dial-time gate authoritatively.

### 10.2 Connect to STS (the live carrier truth)
- Build the STS client; **sync the daily opt-out list into the suppression list**; check per-number DNC
  via STS subscriber lookup; ingest STS AVM result callbacks → store + roll over + consent writeback.

### 10.3 Finish the consent-script flow
- Generate + cache each voice's opt-in/opt-out clips; wire the **press-1 / press-9** DTMF capture →
  play the matching clip → record the STS result → enforce "never contact again for the same product."

### 10.4 De-stub telephony
- Replace the mock SIP provider / trunk / dispatch-rule store with real Supabase-backed management.

### 10.5 Harden & observe
- Tests in CI; observability around callops failures, retries, and webhook health.

---

## 11. Open decisions & external dependencies

- **STS credentials** (GUID + endpoint access) needed to go live against the real carrier endpoints.
- **callops enforcement wiring** — the dialer owner implements the authoritative gate against the
  reference logic (handed off; "the rest is up to us").
- **Legal sign-offs before production**: consent attestation (the opt-out backfill assumes existing
  lists are consented), recording-consent standard, and suppression-list retention period.
