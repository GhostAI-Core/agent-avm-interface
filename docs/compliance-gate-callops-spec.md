# Pre-dial compliance gate — callops integration notes

_Status: proposal / reference for Cale. Last updated 2026-06-23._

## Why this is landing in your lap

The app went control-plane-only: the dashboard tells callops to start/pause/stop a campaign, and
**callops owns the actual dialing**. We originally built the pre-dial compliance gate inside the app's
own dial route — but that route no longer exists on `main`, so the gate has nowhere to run on our side
before a real call goes out.

Since callops is the thing that decides "dial this number now," the authoritative pre-dial gate really
has to live where you are. This doc is **what we've already built and tested on the app side** so you
don't have to reinvent it — the logic is a pure function with 19 passing tests, and the schema + the two
SQL helpers it needs are in a migration ready to apply. Have a look and tell me what fits callops and
what doesn't — none of this is set in stone.

## What the app already provides (on `main` after this merge)

| Piece | Where | What it is |
|-------|-------|-----------|
| Gate logic | `lib/compliance/gate.ts` → `gateContacts()` | Pure function: given contacts + campaign + suppression set + per-number state + `now`, returns an allow/block decision per contact. **No I/O** — you feed it data, it returns verdicts. |
| Reference tests | `lib/compliance/gate.test.ts` | 19 `node:test` cases covering every block reason. `npm test`. Use them as the behavioural contract. |
| Outcome classification | `lib/compliance/outcomes.ts` | `isReachedOutcome()` / `isRetryableOutcome()` — maps a call outcome to "reached a human" vs "retryable miss". Drives the rollover. |
| Network allow-list | `lib/networks.ts` → `isAllowedNetwork()` | ZA prefix → Vodacom/MTN/Cell C check. |
| Schema + SQL helpers | `supabase/migrations/20260618120000_compliance_gate.sql` | Tables `suppression_list`, `product_consent`, `dial_number_state`, `compliance_events` + the functions `claim_dial()` / `record_dial_outcome()`. **Not yet applied to Supabase** — flagging so we apply it together. |

`gate.ts` is plain TS with no app imports beyond `lib/networks.ts`, so if callops is TS it can import it
directly; if not, the test file is the spec to port against.

## The gate sequence (order matters — first failing check wins)

For each contact, `decide()` runs these in order and returns the first block reason, else allows:

1. **Region** — `campaign.region` must be approved **and** the number's region must match it → else `region_not_approved`
2. **Network** — number prefix must be on the allow-list → else `network_not_allowed`
3. **Dead number** — global contact `score` at floor (repeated bad outcomes) → `dead`
4. **Consent / DNC** — `opted_out` → `no_consent`; on `suppression_list` → `suppressed`; if `campaign.require_consent` and not `opted_in` → `no_consent`
5. **Calling window** — contact-local time must be within campaign window (default 08:00–20:00); invalid tz fails closed → `outside_window`
6. **Daily rollover (per NUMBER, cross-campaign)** — if there's a `dial_number_state` row for the number dated today:
   - already `reached` today → `already_reached` (one live answer per number per day, across all campaigns)
   - `attempts >= campaign.max_attempts_per_day` → `retry_cap`
   - `now < next_eligible_at` → `spacing` (randomized gap, see below)

## Data callops needs to load per dial batch

- **Contacts**: `phone`, `consent_status` (per-product, see below), `timezone`, `score`
- **Campaign config**: `region`, `require_consent`, `time_window_start/end`, `max_attempts_per_day`, `retry_cooldown_seconds`, `retry_jitter_seconds`
- **`suppressed`**: set of phones from `suppression_list`
- **`numberState`**: `dial_number_state` rows keyed by phone

### Consent is PER-PRODUCT, not per-contact or per-campaign

One campaign = one product; the product key is `campaigns.agent` (e.g. `seeker` / `grace`). Consent lives
in `product_consent (contact_id, product, consent_status)`. Opting out of a product on **any** campaign
blocks that contact on **every** campaign of the same product — but never affects another product. Load
consent by `(contact, campaign.agent)`. (The migration backfills existing pairs as `opted_in` — that line
encodes a legal attestation, see "Sign-offs" below.)

## Write-side: the two SQL functions to call

These keep the per-number rollover correct and double-dial-safe. Both are in the migration.

- **At dial time** — `SELECT claim_dial(phone, hold_seconds)` provisionally holds the number
  (`next_eligible_at = now + hold`) so two workers can't dial it simultaneously. Resets stale (not-today) rows.
- **When the outcome lands** — `SELECT record_dial_outcome(phone, p_reached, retry_cooldown_seconds, retry_jitter_seconds)`
  - `p_reached = isReachedOutcome(outcome)`
  - on reached: ends the day for that number (`reached = true`, attempts reset semantics handled in-fn)
  - on miss: bumps attempts and pushes `next_eligible_at = now + cooldown + random(0..jitter)`

The **randomized spacing** (cooldown + jitter, default 60min + 0–45min) is deliberate — it's both the
"never call back-to-back" rule and our main lever against carrier spam-blocking. Worth keeping.

## What stays the app's job (so we don't both do it)

- **Preview / reporting** — the dashboard runs `gateContacts()` read-only to show "who would be blocked and why" before a run, and reads `compliance_events` for audit. The app does **not** enforce at dial time.
- **Config** — the app owns campaign settings (`require_consent`, window, `disclosure_text`, attempt caps) and contact import.
- **Opt-out capture** — when an agent/worker reports an opt-out, that upserts `product_consent` for the campaign's product (not a global contact flag, not `suppression_list`).

## Open questions for you (Cale)

1. Does callops want to **import `gate.ts` directly**, or should we expose the decision as an app endpoint callops calls per batch? (Direct import keeps it in-process and avoids a network hop; happy either way.)
2. Are `claim_dial` / `record_dial_outcome` the right shape for how callops tracks attempts, or do you already have per-number state we should reconcile with instead of adding `dial_number_state`?
3. Where should `compliance_events` (gate_block / gate_pass audit rows) get written — callops at decision time, or the app? Whoever dials probably should.
4. Timing to apply `20260618120000_compliance_gate.sql` to Supabase — it adds columns to `contacts`/`campaigns`/`call_records` and the backfill. Want to do it together so nothing in flight breaks.

## Sign-offs still open before any of this is "compliant" for go-live (not code)

Consent attestation (the backfill asserts existing lists are consented — counsel must stand behind that),
recording-consent standard (RICA one-party?), suppression retention period. These are legal, not yours or
mine to decide — noting them so they don't fall through.
