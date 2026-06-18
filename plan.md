# plan.md — Pre-Dial Compliance Gate

**Status:** DRAFT — awaiting approval (do not implement until approved per the Spec-First rule)
**Branch:** `feat/compliance-pre-dial-gate`
**Author:** GarthGhostai
**Date:** 2026-06-18

> ⚠️ **Not legal advice.** This spec encodes controls into the *control plane*. It does **not**
> establish that any given call is lawful — that depends on consent, jurisdiction, and the
> identity of the legal "caller," which require human/counsel sign-off (see Open Questions).

---

## 1. Problem

The outbound dial path (`app/api/campaigns/[id]/dial/route.ts`) currently selects every
`status='pending'` contact and dials it **immediately, unconditionally**:

- No check that we have consent / that the number isn't suppressed (no such data exists).
- `campaigns.time_window_start` / `time_window_end` exist in the schema but are **never read** —
  a campaign can dial at 03:00.
- `contacts.retry_count` and `campaigns.retry_cooldown_seconds` exist but are **never enforced** —
  no daily frequency cap.
- An "opt-out" heard on a call has nowhere to land — `contacts.status` has no `opted_out` state and
  `/api/calls/result` has no field for it.

This spec adds a single **pre-dial gate**: a chokepoint that every contact must pass before
`placeOutboundCall()` is invoked, plus the **opt-out write-back loop** that keeps the suppression
data current.

## 2. Scope

**In scope (our side — the control plane):**
1. Data model: consent state, suppression list, per-contact timezone, call-frequency tracking.
2. A `gateContacts()` function enforcing: consent/DNC → calling window → frequency cap.
3. Wiring the gate into the dial route so non-cleared contacts are skipped (not failed).
4. Opt-out write-back: `/api/calls/result` accepts an opt-out signal and suppresses the contact.
5. Recording-disclosure flag + a retention/purge note (data-model only; purge job is a follow-up).
6. An immutable `compliance_events` audit table.

**Out of scope (push elsewhere — documented here so the boundary is explicit):**
- STIR/SHAKEN / caller-ID attestation → **carrier / LiveKit trunk config**, not buildable here.
- The spoken disclosure + live "say STOP" recognition → **external LiveKit agent worker**. We only
  supply the disclosure text as campaign data and consume the opt-out it sends back.
- Multi-tenant RLS hardening (`USING (true)` → company-scoped) → **related but separate spec**
  (`feat/tenant-rls`); tracked in Open Questions, not implemented here.
- Per-market legal rule sets (TCPA vs POPIA/CPA) → the gate is jurisdiction-*aware* via a
  `region` field, but the actual rule values are config, signed off by counsel.

## 3. Jurisdiction baseline

`lib/phone.ts` defaults to South Africa (`+27`). Baseline target = **South Africa**:
- **POPIA** — lawful basis to process the number + (for recordings) data-subject awareness.
- **Consumer Protection Act (CPA) §11** — right to opt out of direct marketing; honor opt-outs.
- **ICASA** — telecoms conduct.

US numbers (TCPA: prior express written consent, 8am–9pm local, DNC registry) are **explicitly
out of baseline** — the gate must *refuse* to dial a non-`+27` number unless the campaign's
`region` is configured and approved for that market.

## 4. Data model changes

New migration: `supabase/migrations/20260618120000_compliance_gate.sql`

```sql
-- contacts: consent + suppression + locale + frequency
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS consent_status TEXT NOT NULL DEFAULT 'unknown'
  CHECK (consent_status IN ('opted_in','opted_out','unknown'));
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS consent_source TEXT;          -- 'import' | 'in_call' | 'manual'
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Africa/Johannesburg';
-- NOTE (R2): frequency is NOT on contacts. It lives on dial_number_state, keyed by PHONE, so the
-- daily cap/spacing rolls over across campaigns (a number can't be dialed twice in a day via two lists).

-- campaigns: region + retry/pacing policy + disclosure
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT 'ZA';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS max_attempts_per_day INT NOT NULL DEFAULT 3; -- retryable (no-answer/vm/busy) tries/number/day
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS retry_jitter_seconds INT NOT NULL DEFAULT 2700; -- random extra gap on top of retry_cooldown_seconds
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS disclosure_text TEXT;        -- "This is an automated call from X…"
-- require_consent defaults FALSE (R2): client supplies the list + warrants consent (responsible party);
-- operator relies on that warranty. Flip TRUE per-campaign to hard-require opt-in.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS require_consent BOOLEAN NOT NULL DEFAULT false;

-- per-NUMBER daily rollover ledger (cross-campaign). reached=true → no more calls today on ANY
-- campaign; attempts = retryable tries today; next_eligible_at = randomized spaced re-dial time.
CREATE TABLE IF NOT EXISTS dial_number_state (
  phone TEXT PRIMARY KEY, state_date DATE NOT NULL, reached BOOLEAN NOT NULL DEFAULT false,
  attempts INT NOT NULL DEFAULT 0, next_eligible_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- claim_dial(phone, hold)        — provisional hold at dial time (anti double-dial)
-- record_dial_outcome(phone, reached, cooldown, jitter) — write-back: ends day or bumps+spaces

-- recording disclosure on the call record
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS recording_consent BOOLEAN;
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS recording_disclosed BOOLEAN NOT NULL DEFAULT false;

-- account-wide suppression list (numbers we must never dial, regardless of campaign)
CREATE TABLE IF NOT EXISTS suppression_list (
  id          BIGSERIAL PRIMARY KEY,
  phone       TEXT NOT NULL,                 -- store normalized (+E.164)
  reason      TEXT NOT NULL,                 -- 'opt_out' | 'dnc_registry' | 'complaint' | 'manual'
  company_id  INT REFERENCES companies(id),  -- null = global suppression
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (phone, company_id)
);
CREATE INDEX IF NOT EXISTS idx_suppression_phone ON suppression_list (phone);

-- immutable audit of every gate decision + consent change
CREATE TABLE IF NOT EXISTS compliance_events (
  id          BIGSERIAL PRIMARY KEY,
  contact_id  INT REFERENCES contacts(id),
  campaign_id INT REFERENCES campaigns(id),
  event_type  TEXT NOT NULL,                 -- 'gate_pass' | 'gate_block' | 'opt_out' | 'opt_in'
  reason      TEXT,                          -- 'suppressed'|'outside_window'|'already_reached'|'retry_cap'|'spacing'|'region_not_approved'|'no_consent'
  phone_masked TEXT,                         -- store masked, never raw, per lib/security.ts
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Notes:
- `contacts.status` is left as-is; suppression is expressed via `consent_status='opted_out'` **and**
  a `suppression_list` row, so a re-import can't silently resurrect an opted-out number.
- `dial_number_state` is reset lazily inside `claim_dial` / `record_dial_outcome` when `state_date`
  isn't today (no cron); the gate treats a stale row as a fresh number.

## 5. The gate — `lib/compliance/gate.ts` (new)

```ts
type GateDecision = { contact: Contact; allow: boolean; reason?: string }

// Pure-ish: takes the candidate contacts + campaign + current time + suppression set,
// returns a decision per contact. No DB writes here — the route logs + persists.
export function gateContacts(args: {
  contacts: GateContact[]
  campaign: GateCampaign
  suppressed: Set<string>            // normalized phones from suppression_list
  numberState: Map<string, NumberState>  // per-phone daily rollover (dial_number_state)
  now: Date
}): GateDecision[]
```

Decision order (first failure wins, recorded as `reason`):
1. **Region guard** — baseline allow-list is **ZA only** (DECIDED 2026-06-18: SA for now, field kept extensible). If `normalizePhone(phone)` country code ∉ campaign `region`'s allowed set → block (`reason='region_not_approved'`). Adding a market later = adding to the allow-list constant + counsel sign-off, no code change.
2. **Consent / DNC** — if `campaign.require_consent` and `consent_status <> 'opted_in'` → block (`'no_consent'`). If phone ∈ `suppressed` → block (`'suppressed'`).
3. **Calling window** — compute local time from `contact.timezone`; if outside `[time_window_start, time_window_end)` → block (`'outside_window'`). **Null window ⇒ apply the default `08:00–20:00` local** (DECIDED 2026-06-18). The default lives in one constant `DEFAULT_WINDOW = { start: '08:00', end: '20:00' }` in `gate.ts`, applied only when the campaign window is null.
4. **Per-number daily rollover** (R2 — keyed on PHONE via `numberState`, so it's cross-campaign).
   Only counts if `state_date === today` (contact-local); a stale row means the number is fresh:
   - `reached` (got a live answer today, any campaign) → block `'already_reached'` — **one contact per number per day**.
   - `attempts >= campaign.max_attempts_per_day` (default 3) → block `'retry_cap'`.
   - `now < next_eligible_at` → block `'spacing'`. `next_eligible_at` is stamped on the write side as
     `lastOutcome + retry_cooldown_seconds + random(retry_jitter_seconds)` so retries are randomly
     spaced, never back-to-back. Reached vs retryable is decided by `lib/compliance/outcomes.ts`.

Gate is **pure and unit-testable** — no network, no Supabase. The route owns I/O.

## 6. Dial-route wiring (`app/api/campaigns/[id]/dial/route.ts`)

Between the contact fetch (line ~34–40) and the `in_progress` update (line ~54–57):

1. Load the suppression set: `SELECT phone FROM suppression_list WHERE company_id IS NULL OR company_id = campaign.company_id`.
2. `const decisions = gateContacts({ contacts, campaign, suppressed, now })`.
3. `const allowed = decisions.filter(d => d.allow).map(d => d.contact)`.
4. Blocked contacts: **do not** mark `failed` (that triggers retry). Leave `status='pending'`, write a
   `compliance_events` `gate_block` row each, and skip. (Outside-window blocks are transient — they
   should be re-tried on the next run inside the window.)
5. Only `allowed` proceed to `placeOutboundCall()`. On success, call `claim_dial(phone, cooldown)` to
   provisionally hold the number (anti double-dial) and write a `gate_pass` event. The real attempt
   count + randomized `next_eligible_at` are written when the outcome lands (§7).
6. Pass `campaign.disclosure_text` into the agent `metadata` (so the worker can read it aloud) and set
   `call_records.recording_disclosed` accordingly when egress is on.

Response shape gains `{ blocked: number, blockedReasons: Record<string,number> }` so the UI can show
"12 dialed, 8 skipped (5 outside window, 3 opted out)".

## 7. Outcome write-back (`/api/calls/result` + `/api/livekit/webhook`)

**Rollover (R2).** Both outcome sources call `rollNumberState(admin, room, reached)`
(`lib/compliance/rollover.ts`), which runs `record_dial_outcome`:
- `/api/calls/result` (agent): `reached = isReachedOutcome(outcome)`.
- `/api/livekit/webhook`: `participant_joined` → reached=true; `room_finished` no-answer fallback →
  reached=false (only when the row was still `pending`, so we count the attempt once).
A reached call ends the day for the number; a retryable one bumps `attempts` and stamps the randomized
`next_eligible_at`. This works no matter which source reports first.

**Opt-out.** The agent also sends `body.optOut?: boolean`. When true, using `parseRoomName(room)`:
1. `UPDATE contacts SET consent_status='opted_out', consent_source='in_call', consent_at=now WHERE id=…`
2. `UPSERT suppression_list (phone, reason='opt_out') ON CONFLICT (phone,company_id) DO NOTHING`
3. `INSERT compliance_events (event_type='opt_out', …)`

This closes the loop: the worker *hears* it, our DB *enforces* it on every future run.

## 8. Edge cases

- **Re-import of an opted-out number** → suppression_list match still blocks it (consent flag alone could be overwritten by import; the list is the backstop).
- **Number in two campaigns** → global suppression (`company_id IS NULL`) covers all; company-scoped covers one tenant.
- **DST / unknown timezone** → use IANA tz via `Intl.DateTimeFormat`; invalid tz ⇒ fail closed (block).
- **Window spanning midnight** (e.g. 20:00–22:00 is fine; 22:00–06:00 wraps) → gate handles wrap.
- **Concurrent dial runs** → `claim_dial` stamps `next_eligible_at` at dial time so a parallel run sees
  the number as spaced-out and skips it; the outcome write-back then sets the real value.
- **Same number in two campaigns same day** → one `dial_number_state` row (keyed by phone); whichever
  campaign reaches them first flips `reached` and blocks the other. This is the core R2 guarantee.
- **No suppression / no state rows yet** → empty set/map, gate still runs consent + window; fresh number allowed.

## 9. Test plan (Tester-Implementer loop — write these failing first)

`lib/compliance/gate.test.ts` — pure unit tests (15, all green via `npm test`):
- opted_out / suppressed phone → blocked
- consent unknown + require_consent → blocked; + require_consent=false → allowed
- inside window allowed; outside blocked; wrap-midnight window correct
- null window → default 08:00–20:00 (allowed inside, blocked before 08:00)
- invalid timezone → fail-closed
- rollover: reached today → `already_reached`; stale (yesterday) → fresh/allowed
- rollover: attempts ≥ max → `retry_cap`; under → allowed
- rollover: now < next_eligible_at → `spacing`; past → allowed
- non-+27 phone with region='ZA' → `region_not_approved`; region='US' → blocked

Route-level (integration, mocked Supabase): blocked contacts stay `pending`, emit `gate_block`;
allowed ones dial and bump counters. Opt-out POST suppresses + audits.

## 10. Rollout

1. Migration applied (additive). `require_consent=true` and new contacts default `consent_status='unknown'`,
   but the migration's backfill (step 3) marks **existing** contacts `opted_in` so current campaigns keep
   running — see §10.3.
2. Ship gate + route behind the additive schema; simulator path unaffected (it never calls the route).
3. **Backfill (DECIDED 2026-06-18): mark existing contacts `opted_in`** via a one-time statement at the
   tail of the migration, so current campaigns keep dialing. **This asserts the existing lists already
   have a lawful basis for consent — operator/counsel attests this before the migration is applied.**
   ```sql
   -- one-time backfill: existing lists are attested as already-consented
   UPDATE contacts SET consent_status='opted_in', consent_source='import', consent_at=NOW()
     WHERE consent_status='unknown';
   ```
   New imports after this still default to `unknown` and must be cleared.

## 11. Open questions

**Resolved 2026-06-18:**
- ~~Jurisdiction~~ → **ZA only for now**, `region` field kept extensible (§5.1).
- ~~Null calling-window policy~~ → **default 08:00–20:00 local** (§5.3).
- ~~Existing-list handling~~ → **backfill `opted_in`**, operator/counsel attests lawful basis (§10.3).

**Still need human / counsel sign-off before go-live (not blockers for building the gate):**
1. **Legal basis attestation** — formal confirmation the existing lists' consent is sound (POPIA). The
   §10.3 backfill *encodes* the attestation; someone has to *make* it before prod.
2. **Recording**: is one-party (RICA) enough, or disclose + require awareness every call? Drives whether
   `recording_disclosed` must be `true` before egress starts.
3. **Suppression retention** — how long do opted-out numbers stay suppressed? (Indefinite recommended.)
4. **Multi-tenant RLS** — confirm the separate `feat/tenant-rls` spec is the right home; the gate's
   `company_id` suppression scoping assumes it lands eventually.

---

### Summary of changes this spec proposes
- 1 migration (additive): consent/timezone/frequency on `contacts`, region/disclosure/cap on
  `campaigns`, recording flags on `call_records`, new `suppression_list` + `compliance_events` tables.
- 1 new pure module `lib/compliance/gate.ts` + tests.
- ~30 lines wired into the dial route (gate + skip-not-fail + audit).
- ~15 lines into `/api/calls/result` for the opt-out write-back.
- No change to the external agent worker beyond the `disclosure_text` / `optOut` data contract.
