## Why

The `callops-outcome-contract-alignment` change requires the dashboard to source report/outcome aggregates from CallOps' `dashboard/*` analytics endpoints and **forbids** rolling up raw `call_records` (`consume-callops-analytics` → "Local analytics roll-up is removed"). The 2026-07-02 telemetry audit proved those CallOps aggregates are **wrong**, and verifying current `evra_callops` `origin/main` confirmed the bug is live (not a stale snapshot):

- `increment_call_log` (`app/db/queries.py`) only remaps `busy→busy_line`. Outcomes `subscribed` and `opted_out` have **no counter column** in `call_logs` → dropped. `dialed` is **never incremented** → 0.
- Result: `call_logs`/`campaign_report` drop the actual conversion (`subscribed`), report `dialed=0`, and disagree with each other.

Meanwhile the raw per-call truth is 100% correct: CallOps writes every `call_records` row with accurate `outcome`, `talk_seconds`, `cost`. Garth ratified (2026-07-02) the model below, keeping `fe-zero-control` intact for **control**.

## What Changes

- **Ratify the reads model.** CallOps stays the single source of truth for **control** (dialing, gate, lifecycle, STS) **and** for the **raw per-call facts** it writes to Supabase. The dashboard MAY compute **display aggregates** from those raw facts — it does not act, it only derives views. Supabase is the shared store CallOps fills.
- **`/api/reports` computes the campaign roll-up from raw `call_records`** (auth-gated, service-role read), mapping the six real outcomes into the report columns: `connected→connected`, `subscribed→qualified`, `opted_out→opt_out`, `no_answer→no_answer`, `voicemail→voicemail`, `failed→failed`. `dialed`=attempt count, `total_spent`=Σ`cost`, avg-talk from `talk_seconds`.
- **Add an `opt_out` bucket** to the report shape/display; drop the never-produced dialer buckets (`no_speech/hangup/ni/callback/busy_line`) and the misused `dnq` from the reports table display.
- **Supersede `consume-callops-analytics` for the reports table** — this is interim until CallOps' analytics endpoints divide the outcome vocab correctly, at which point the dashboard MAY switch back to consuming them (the raw-derived view remains valid regardless).

## Non-goals

- Control/ability moving to the dashboard — unchanged; CallOps owns all control (`fe-zero-control`).
- The per-campaign `opt_out`/`connected`/`calls_total` summary shown in the campaign view — that still reads CallOps' `GET /campaigns/{id}` summary (`campaign-outcome-summary`), not re-summed here.
- Model-usage / recording telemetry gaps — those are missing raw data (worker-side, Cale), not a division/read problem.

## Impact

- **Dashboard:** `app/api/reports/route.ts` (raw `call_records` roll-up), `app/page.tsx` (`REPORT_KEYS`/headers → `opt_out`, drop dead buckets), `types/index.ts` (`CampaignReport.opt_out`).
- **Spec:** supersedes the `consume-callops-analytics` "consume CallOps / remove local roll-up" requirements for the reports/outcome table; `campaign-outcome-summary` (campaign view) is unaffected.
- **Coordination:** amends the `CallOps-authoritative read` rule for computed aggregates — flag to Cale so `fe-zero-control` reflects the ratified split (control = CallOps; display-math on raw facts = dashboard OK).
