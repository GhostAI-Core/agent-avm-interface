# Agent AVM Interface — Roadmap

_Baseline: `main` @ `b3ef202` (2026-06-23). This doc is the single source of truth for "where are we and what's next."_

---

## 1. What `main` actually is today

A **thin control-plane dashboard** for outbound AI calling. The app does **not** own the call
lifecycle — [`evra-callops`](#callops) does. This UI proxies start/pause/stop commands to callops,
shows live stats, and reports on results. Stack: Next.js + MUI 9, Supabase (Postgres + Auth +
Storage), LiveKit for the actual SIP calls + recording.

### Feature surface (what a user sees)

| View | State | Notes |
|------|-------|-------|
| **Dashboard / Control Room** | ✅ Real | KPI strip, charts, filters, live 15s polling, campaign play/pause/stop/archive |
| **Campaigns** | ✅ Real | Create, upload contacts, voice prompt, lifecycle via callops |
| **Companies** | ✅ Real | Client roster (1Life, Miway, Old Mutual, Metropolitan seeded) |
| **Reports** | ✅ Real | Outcome donut, funnel, spend, per-call drill-down (`CampaignDetail`) |
| **Quality** | ✅ Real | Per-call quality + recording review (`CallQuality`) |
| **Security** | ✅ Real | Audit log viewer |
| **Telephony / SIP settings** | ⚠️ **Mocked** | `lib/telephony-mock.ts` — localStorage CRUD, fake test-dial. **This is the big stub.** |
| **Settings / Profile** | ✅ Real | System config, WebAuthn passkeys |

### What's genuinely end-to-end
Campaign lifecycle → callops, LiveKit outbound dial + SIP, call recording → S3, live dashboard
polling, Inworld TTS voice generation (`/api/tts/generate` + save to `avm_scripts` bucket),
security audit logging, passkey auth.

### What's faked
- **Telephony settings view** — SIP providers, trunks, dispatch rules are all localStorage mocks.
  Methods are pre-named for their future endpoints ("Phase 2 = drop-in replace").
- **Demo seed data** — 6 campaigns, ~360 contacts, ~60 call_records each, 14 days of intent_stats.

### Known gaps
- **Zero automated tests** on `main`. (The only test suite in the whole repo lives on an unmerged branch — see §2.)
- **No pre-dial compliance gate** on `main` (consent / DNC / per-number rollover) — also only on a branch.

---

## 2. The 5 surviving branches — keep / merge / kill

The callops integration that landed on `main` (PR #35) **superseded most of this work.** Verified
each branch's files against `main`:

| Branch | Age | Verdict | Why |
|--------|-----|---------|-----|
| **`feat/campaign-edit-scripts`** | 06-18 | 🟢 **MERGE — highest value** | Only branch with real net-new code: pre-dial **compliance gate** (`lib/compliance/gate.ts`, *the only tests in the repo*), contact **scoring**, **M:N campaign_contacts**, campaign-create **wizard**, saved-script (S3) dropdown. ~2,210 net new lines. Superset of the compliance branch below. |
| **`feat/compliance-pre-dial-gate`** | 06-18 | 🔴 **KILL — redundant** | Verified strict subset of `campaign-edit-scripts` (shares the exact commit `c658aaa`, no extra commits). Nothing here is missing from the merge candidate. |
| **`feat/telephony-management-ui`** | 06-17 | 🟡 **MINE FOR PARTS** | TTS landed differently on `main` (`/api/tts/generate` vs this branch's `/api/voice/generate`). Salvage: "Telephony-sourced campaign selectables" + `scripts/run-wipe.mjs` / `wipe-demo-data.sql` (useful for clearing demo data). Drop the rest. |
| **`feat/align-callops-control-plane`** | 06-15 | 🟡 **MINE FOR PARTS** | 50 commits behind; its job (remove in-app LiveKit dialer, go control-plane-only) is mostly already done on `main`. Salvage only: `app/api/sip-trunks/[id]` CRUD routes — useful for de-stubbing Telephony (§3). |
| **`feat/quality-and-drilldown`** | 06-10 | 🔴 **KILL — superseded** | 70 commits behind, oldest. `CallQuality.tsx` and `CampaignDetail` drill-down both **already on `main`**. Absorbed. |

> **Recovery note:** all uncommitted callops WIP (admin / analytics / dialer-rules routes,
> `AdminDataView`, `SessionAnalytics`, `DataTable`) is preserved in `stash@{0}` and the
> `backup/pre-reset-2026-06-23` branch. Not lost — just parked.

---

## 3. Proposed roadmap (in priority order)

> **Locked decision (2026-06-23): pre-dial compliance enforcement belongs in callops, not this app.**
> `main` is control-plane-only — callops owns dialing, so callops is the authoritative pre-dial gate.
> The app's gate code comes onto `main` as a **tested reference implementation + reporting/preview**, the
> deleted in-app dial route **stays deleted**, and the dial-time gate becomes a **spec for Cale**.

### Phase A — bring the gate + tests to main (clean, no conflicts)
1. **Schema migration → main.** `20260618120000_compliance_gate.sql` (suppression_list, compliance_events,
   product_consent, dial_number_state + `claim_dial`/`record_dial_outcome` fns). Shared infra both layers use.
2. **`lib/compliance/*` + tests → main.** Pure gate logic as the reference impl; `npm test` (`tsx --test`,
   `node:test`) brings the **first green test suite onto `main`**.
3. **Write the callops compliance-gate spec** (`docs/compliance-gate-callops-spec.md`) — the contract Cale
   enforces at dial time, with `gate.ts` + the two SQL functions as the reference.

### Phase B — bring the campaign features (conflict-heavy merge)
4. **Merge the rest of `feat/campaign-edit-scripts`:** campaign-create wizard, contact scoring, M:N
   `campaign_contacts`, saved-script (S3) dropdown. Resolve the 7 conflicts; **keep `main`'s deletion of
   `app/api/campaigns/[id]/dial/route.ts`** (do not resurrect in-app dialing).
5. **Delete the dead branches:** `feat/compliance-pre-dial-gate` (strict subset), `feat/quality-and-drilldown`
   (absorbed) — local + origin.

### Phase C — close the headline gap (telephony de-stub)
6. **De-stub the Telephony settings view.** Replace `lib/telephony-mock.ts` with real Supabase-backed
   trunk/provider CRUD. Reuse the `sip-trunks/[id]` routes salvaged from `align-callops-control-plane`.
7. **Wire dispatch/dialer rules** for real (the admin/analytics/dialer-rules work in `stash@{0}` was
   heading here — decide whether to revive it or rebuild cleanly).

### Phase D — harden & observe
8. **Tests in CI.** Wire `npm test` into CI now that a suite exists; extend to the callops proxy route.
9. **Observability around callops** — failures, retries, webhook health. (No visibility today.)
10. **Close issues #14 (Tailwind/MUI cleanup) and #15 (a11y/keyboard/responsive QA)** from `CLAUDE.md`.

### Later — product depth
11. Recover the parked **admin / analytics / session-analytics** views from `stash@{0}` once the
    data model behind them is settled.

---

## 4. <a name="callops"></a>Callops integration reference

- App proxies lifecycle to callops: `POST /campaigns/{id}/{start|pause|stop}`, `GET /campaigns/{id}/status`,
  `GET /livekit/trunks`. All requests carry `X-Webhook-Secret`.
- If `CALLOPS_URL` / `CALLOPS_WEBHOOK_SECRET` are unset, routes fall back to a direct Supabase status write ("local" mode).
- The LiveKit agent posts call outcomes **to callops, not to this app** (`/api/calls/result` is a deprecated no-op).
- callops writes `call_records` rows directly via service role.

### Key env keys
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LIVEKIT_URL/_API_KEY/_API_SECRET`,
`LIVEKIT_SIP_OUTBOUND_TRUNK_ID`, `LIVEKIT_AGENT_NAME` (e.g. `outbound-recorder`),
`LIVEKIT_RECORD_*` (S3 recording), `INWORLD_API_KEY` (TTS), `CALLOPS_URL` + `CALLOPS_WEBHOOK_SECRET`,
`NEXT_PUBLIC_POLL_INTERVAL_MS` (default 15000).
