> **Live re-verification 2026-07-03** (supersedes the 2026-07-02 counts): `call_session_reports`=323, `call_model_usage`=23, `campaign_report`=4 (**VIEW, grows with call data — do NOT drop**), `call_events`=0, `voip_providers`=0, `campaign_contacts`=0, `compliance_events`=0. No inbound FKs to any drop candidate. `/dial` route confirmed to have no caller.

## 1. Capture live truth in migrations (do first — no drops)

- [x] 1.1 Read live columns for `call_session_reports` and `call_model_usage` via service-role and write `CREATE TABLE IF NOT EXISTS` migrations matching them exactly — DONE 2026-07-03: `20260703070000_capture_call_session_reports.sql` (22 cols), `20260703070100_capture_call_model_usage.sql` (12 cols); columns verified against live PostgREST OpenAPI (323 / 23 rows)
- [x] 1.2 `campaign_report` reporting VIEW — DONE 2026-07-03: real body extracted via `pg_get_viewdef` (user ran it in SQL editor) and written verbatim to `20260703070200_capture_campaign_report_view.sql` as active `CREATE OR REPLACE VIEW` (idempotent no-op vs live). Confirmed: `FROM call_records cr JOIN campaigns c` grouped by campaign — inner join, so only campaigns with call_records appear. **KEEP decision:** dashboard reads raw `call_records` (reads-from-raw), nothing in repo depends on the view; cheap+harmless so keep, may drop later if no external consumer. **KNOWN QUIRK captured:** `cpl` divides by `qualified` count → always 0 for lead-gen (conversions are `outcome='lead'`, never `qualified`); dashboard computes its own CPL from raw, so this doesn't affect the product.
- [x] 1.3 Verify capture-migrations are idempotent against live (re-apply = no-op) — guaranteed: both use `CREATE TABLE IF NOT EXISTS` and the tables are confirmed to exist live, so re-application is a definitional no-op; the view file has no executable DDL. (Cannot run DDL against live from here — no migration-apply path beyond PostgREST.)

## 2. Tier 1 — drop dead tables (no code coupling)

- [x] 2.1 Re-verify 0 rows + 0 references immediately before drop — DONE 2026-07-03: both 0-row (service-role count=*/0); no refs in `app/`/`lib/` (only historical migrations mention them)
- [x] 2.2 Backup schema+data before drop — DONE via in-DB structural backup instead of `pg_dump` (SQL editor can't shell out): `_backup_20260703_call_events`, `_backup_20260703_voip_providers` (`LIKE ... INCLUDING ALL EXCLUDING DEFAULTS/IDENTITY`; the `EXCLUDING` avoids the owned-sequence dependency that first blocked the drop). Full DDL also lives in the original CREATE migrations.
- [x] 2.3 Write drop-migration `20260703080000_drop_tier1_redundant.sql` — DONE: transaction-guarded (aborts if non-empty) `DROP TABLE call_events, voip_providers` + `DROP FUNCTION process_call_event()`, with commented reversible restore.
- [x] 2.4 Apply + verify — DONE 2026-07-03: user ran it live, committed cleanly. Verified: `call_events`/`voip_providers` now `404 PGRST205`; replacements healthy (`call_session_events`=719, `sip_trunks`=3); CallOps `/health`=200.

## 3. Tier 2 — retire `/dial`, then drop its tables (coupled)

- [ ] 3.1 (Sequenced with [[provider-dial-gate]]) Delete `app/api/campaigns/[id]/dial/route.ts` and the network clause in `lib/compliance/gate.ts`; confirm nothing imports them
- [ ] 3.2 Re-verify 0 rows + 0 references for `campaign_contacts`, `compliance_events`
- [ ] 3.3 `pg_dump` each; write drop-migration `<ts>_drop_dial_tables.sql` with reversible restore
- [ ] 3.4 Apply; verify dashboard build/lint + health; confirm campaign create/start still work end-to-end

## 4. Keep list (documented, do NOT drop)

- [ ] 4.1 Document that `dial_number_state`, `product_consent`, `suppression_list`, `intent_stats`, `script_audio` are empty-but-wired (kept), and `call_logs` is live-written by CallOps (kept)
