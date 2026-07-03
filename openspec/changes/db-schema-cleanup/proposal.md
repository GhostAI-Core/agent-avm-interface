## Why

The shared Supabase has accumulated **redundant/dead tables**, and the repo's migrations no longer match the live schema. Both were surfaced during the 2026-07-02 telemetry audit (after two live 100-call batches):

- **Schema drift.** Live Supabase has relations that exist and are populated but have **no migration in this repo**: `call_session_reports` (323 rows, was 298) and `call_model_usage` (23 rows, was 21) — both written by CallOps (`POST /calls/call-report`, `POST /calls/model-usage`). And `campaign_report` exists live with **no `CREATE` statement anywhere** in either repo. So `schema.sql` / `supabase/migrations/*` are not authoritative — two subagents each wrongly concluded telemetry tables "don't exist" by trusting the repo over prod.
- **`campaign_report` is a reporting VIEW, NOT a dead table (corrected 2026-07-03).** Re-verification found it at **4 rows and growing (was 2)** — one row per campaign, all metric columns typed `bigint` (i.e. `COUNT(*)` aggregates), with a real FK `campaign_id → campaigns.id` in the PostgREST schema. It auto-reflects `call_records`/`call_logs` grouped by campaign; the +2 growth is simply two new campaigns (82 lead-gen, 81) getting calls, not an external writer. The graph has **0 nodes** for it — it was created directly in the Supabase SQL editor. It must be **captured (extract the view SQL), NOT `DROP TABLE`-d in Tier 1**. `DROP TABLE campaign_report` would fail (it is not a table) or destroy a live reporting view. Decision on keep-vs-supersede (reports now read from raw `call_records`) is deferred until its definition is captured.
- **Dead / redundant tables (re-verified 0 rows live 2026-07-03):**
  - `call_events` — superseded by `call_session_events` (719 rows); CallOps' `/calls/events` handler now inserts `call_session_events`, never this legacy table. Its BEFORE-INSERT trigger `trg_process_call_event` drops with the table; the ETL fn `process_call_event()` must be dropped alongside. The only apparent code "reference" is a function *name* `get_call_events` (an HTTP endpoint), not a table access.
  - `voip_providers` — 0 rows, 0 live references (24 graph nodes, all historical); replaced by `sip_trunks` + CallOps trunk management. `campaigns.sip_trunk_id` FKs `sip_trunks`, not this table.
  - `campaign_contacts` — 0 rows; referenced **only** by the orphaned dashboard `/dial` route (confirmed **no caller** anywhere; CallOps reads `contacts.campaign_id`, not the M:N join).
  - `compliance_events` — 0 rows; referenced **only** by the same orphaned `/dial` route.

  No inbound FKs point at any of the four drop candidates — clean drops, no CASCADE surprises.

Dropping the coupled pair (`campaign_contacts`, `compliance_events`) requires retiring the orphaned `/dial` route first — which the [[provider-dial-gate]] proposal already plans.

## What Changes

- **Capture live truth in migrations first.** Add migrations that `CREATE TABLE IF NOT EXISTS` `call_session_reports` and `call_model_usage` with the exact columns CallOps writes, and `CREATE OR REPLACE VIEW campaign_report` with its extracted definition, so the repo matches prod before anything is dropped. (Idempotent — they already exist live. Extracting the `campaign_report` view SQL needs the DB password / Supabase SQL editor — not reachable from either repo's `.env`.)
- **Drop dead tables in two independent tiers**, each behind a backup + verification gate.
  - **Tier 1 (no code coupling):** drop `call_events` (+ its orphaned `process_call_event()` fn), `voip_providers`. `campaign_report` is EXCLUDED from Tier 1 — it is a live view to be captured, not dropped.
  - **Tier 2 (coupled to `/dial` retirement):** delete `app/api/campaigns/[id]/dial/route.ts` (+ its `lib/compliance/gate` network clause), then drop `campaign_contacts` + `compliance_events`.
- **Never drop a table with a live writer/reader.** Every candidate is verified 0-row and unreferenced in both repos immediately before the drop.

## Non-goals (documented, NOT built)

- Dropping tables that are empty-but-wired (`dial_number_state`, `product_consent`, `suppression_list`, `intent_stats`, `script_audio`) — features not yet exercised, NOT redundant. Kept.
- Any change to `call_logs` — it is written live by CallOps via RPC counters; not redundant.
- CallOps-side schema (Cale owns the CallOps DB migrations); this change only touches the Supabase schema the dashboard repo owns + the orphaned dashboard `/dial` route.
- The `voice_id` create/persist fix (that is [[provider-dial-gate]]-adjacent / campaign-voice-id work, handled separately).

## Impact

- **DB / migration:** new capture-migrations for `call_session_reports`, `call_model_usage`, and the `campaign_report` view; drop-migrations for `call_events` (+ `process_call_event()`), `voip_providers` (Tier 1) and `campaign_contacts`, `compliance_events` (Tier 2). Each drop-migration has a documented reversible restore-from-dump.
- **Dashboard code:** Tier 2 deletes the orphaned `app/api/campaigns/[id]/dial/route.ts` and the network clause in `lib/compliance/gate.ts`.
- **Safety:** `pg_dump` (schema+data) each table to a timestamped backup before dropping; verify dashboard + CallOps health after each tier.
- **Open dependencies:** Tier 2 is sequenced after (or bundled with) [[provider-dial-gate]]'s `/dial` retirement so no live path loses a table.

## Capabilities

### New Capabilities

- `db-schema-hygiene`: the repo's migrations reflect the live Supabase schema, and redundant/dead tables are removed only after a backup + zero-reference verification, in reversible steps.
