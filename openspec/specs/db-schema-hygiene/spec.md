# DB schema hygiene

## Purpose

Keep the repository's Supabase migrations authoritative for the live schema, and remove redundant/dead tables only after a backup and zero-reference verification, in reversible steps.

## Requirements

### Requirement: Repo migrations reflect the live Supabase schema

The repository SHALL contain a migration for every table that exists in live Supabase, so `supabase/migrations/*` is authoritative. Specifically, `call_session_reports` and `call_model_usage` (written live by CallOps `POST /calls/call-report` and `POST /calls/model-usage`) MUST have `CREATE TABLE IF NOT EXISTS` migrations whose columns match the live schema. Capture-migrations MUST be idempotent (the tables already exist live), so re-applying them is a no-op rather than an error.

#### Scenario: Telemetry tables are defined in the repo

- **WHEN** a developer greps `supabase/migrations/` for `call_session_reports` and `call_model_usage`
- **THEN** each has a `CREATE TABLE IF NOT EXISTS` definition
- **AND** the columns match the live table columns exactly (verified via a live service-role read)

#### Scenario: Capture-migration is a no-op on live

- **WHEN** the capture-migrations are applied against live Supabase (where the tables already exist)
- **THEN** they succeed without error and do not alter existing data (idempotent `IF NOT EXISTS`)

### Requirement: Redundant tables are removed only after backup and zero-reference verification

A table MAY be dropped only when it is confirmed to have zero rows AND zero code references in both the dashboard and CallOps repos, immediately before the drop. Every drop MUST be preceded by a backup (schema + data) to a timestamped location, and the drop-migration MUST document a reversible restore. No table with a live writer or reader may be dropped.

#### Scenario: Tier 1 dead tables are dropped

- **WHEN** `call_events` and `voip_providers` are each verified 0-row and unreferenced
- **THEN** each is backed up before its `DROP TABLE`
- **AND** after the drops, the dashboard and CallOps health checks still pass

#### Scenario: A table with references is NOT dropped

- **WHEN** a candidate table (e.g. `call_logs`) is found to have a live writer/reader
- **THEN** it is excluded from the drop set and retained

#### Scenario: A live view is captured, not dropped

- **WHEN** a relation (e.g. `campaign_report`) is found to be a live reporting VIEW rather than a table
- **THEN** its real definition is captured as a `CREATE OR REPLACE VIEW` migration and it is retained, NOT `DROP TABLE`-d

### Requirement: Coupled `/dial` tables are dropped only after the route is retired

`campaign_contacts` and `compliance_events` are referenced only by the orphaned dashboard `/dial` route. They MUST NOT be dropped until that route (`app/api/campaigns/[id]/dial/route.ts`) is deleted, so no live code path loses its table.

#### Scenario: Tier 2 drop follows route deletion

- **WHEN** the orphaned `/dial` route has been deleted and the build passes
- **THEN** `campaign_contacts` and `compliance_events` are verified 0-row and unreferenced
- **AND** each is backed up and dropped, and dashboard build + health checks still pass

#### Scenario: Tier 2 drop is blocked while `/dial` exists

- **WHEN** the `/dial` route still exists in the codebase
- **THEN** `campaign_contacts` and `compliance_events` are NOT dropped
