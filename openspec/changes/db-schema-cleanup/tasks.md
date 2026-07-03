> **Live re-verification 2026-07-03** (supersedes the 2026-07-02 counts): `call_session_reports`=323, `call_model_usage`=23, `campaign_report`=4 (**VIEW, grows with call data — do NOT drop**), `call_events`=0, `voip_providers`=0, `campaign_contacts`=0, `compliance_events`=0. No inbound FKs to any drop candidate. `/dial` route confirmed to have no caller.

## 1. Capture live truth in migrations (do first — no drops)

- [x] 1.1 Read live columns for `call_session_reports` and `call_model_usage` via service-role and write `CREATE TABLE IF NOT EXISTS` migrations matching them exactly — DONE 2026-07-03: `20260703070000_capture_call_session_reports.sql` (22 cols), `20260703070100_capture_call_model_usage.sql` (12 cols); columns verified against live PostgREST OpenAPI (323 / 23 rows)
- [~] 1.2 `campaign_report` is a **reporting VIEW** (per-campaign aggregate over `call_records`/`call_logs`, all-`bigint` counts, FK `campaign_id→campaigns.id`, 0 graph nodes, no repo DDL). Extract its real definition (`pg_get_viewdef` / Supabase SQL editor — needs DB password, not in either `.env`) and write `CREATE OR REPLACE VIEW campaign_report` capture-migration. Then decide keep vs supersede (reports already read raw `call_records`). **NOT a Tier-1 drop.** — STUB written `20260703070200_capture_campaign_report_view.sql`: confirmed live VIEW (4 rows), captured exact 19-col contract + the `pg_get_viewdef` extraction command; real body BLOCKED (no DB password / no `pg_get_viewdef` RPC via PostgREST). Reconstructed def left COMMENTED OUT so it can't clobber the live view.
- [x] 1.3 Verify capture-migrations are idempotent against live (re-apply = no-op) — guaranteed: both use `CREATE TABLE IF NOT EXISTS` and the tables are confirmed to exist live, so re-application is a definitional no-op; the view file has no executable DDL. (Cannot run DDL against live from here — no migration-apply path beyond PostgREST.)

## 2. Tier 1 — drop dead tables (no code coupling)

- [ ] 2.1 Re-verify 0 rows + 0 references immediately before drop: `call_events`, `voip_providers` (grep both repos; the only `call_events` hit is the endpoint fn name `get_call_events`, not a table access; `voip_providers` refs are all historical schema/migrations)
- [ ] 2.2 `pg_dump` schema+data of each to a timestamped backup file
- [ ] 2.3 Write drop-migration `supabase/migrations/<ts>_drop_tier1_redundant.sql` (`DROP TABLE IF EXISTS call_events, voip_providers;` + `DROP FUNCTION IF EXISTS process_call_event();` — the orphaned ETL fn; trigger `trg_process_call_event` drops with the table) with a commented reversible restore-from-dump
- [ ] 2.4 Apply; verify dashboard `/api/health` + CallOps `/health` still green; confirm no dashboard view errors

## 3. Tier 2 — retire `/dial`, then drop its tables (coupled)

- [ ] 3.1 (Sequenced with [[provider-dial-gate]]) Delete `app/api/campaigns/[id]/dial/route.ts` and the network clause in `lib/compliance/gate.ts`; confirm nothing imports them
- [ ] 3.2 Re-verify 0 rows + 0 references for `campaign_contacts`, `compliance_events`
- [ ] 3.3 `pg_dump` each; write drop-migration `<ts>_drop_dial_tables.sql` with reversible restore
- [ ] 3.4 Apply; verify dashboard build/lint + health; confirm campaign create/start still work end-to-end

## 4. Keep list (documented, do NOT drop)

- [ ] 4.1 Document that `dial_number_state`, `product_consent`, `suppression_list`, `intent_stats`, `script_audio` are empty-but-wired (kept), and `call_logs` is live-written by CallOps (kept)
