# supabase-database

Delta: LiveKit dialer schema sync for `evra_avm`.

## ADDED Requirements

### Requirement: LiveKit dialer schema is defined in repo migrations

The repository MUST include idempotent Supabase migrations for all LiveKit dialer tables and columns present in the remote `evra_avm` project.

#### Scenario: SIP trunks table exists

- **WHEN** migrations are applied
- **THEN** table `sip_trunks` exists with columns `name`, `livekit_trunk_id`, `from_number`, and optional `company_id`

#### Scenario: Campaign dialer columns exist

- **WHEN** migrations are applied
- **THEN** `campaigns` includes `agent_name`, `sip_trunk_id`, `max_retries`, `retry_cooldown_seconds`, `max_concurrent`, `auto_paused`, and `voice_path`

#### Scenario: Call records LiveKit columns exist

- **WHEN** migrations are applied
- **THEN** `call_records` includes `room`, `contact_id`, and `egress_id` with foreign key from `contact_id` to `contacts`

#### Scenario: Contacts support dialer lifecycle

- **WHEN** migrations are applied
- **THEN** `contacts.status` allows `pending`, `in_progress`, `dialed`, `failed`, and `retry`
- **AND** `contacts` includes `retry_count` and `last_attempted_at`

### Requirement: SIP trunks table has row-level security

Table `sip_trunks` MUST have RLS enabled with an authenticated read/write policy consistent with other operational tables.

#### Scenario: RLS enabled on sip_trunks

- **WHEN** migrations complete
- **THEN** `sip_trunks` has RLS enabled
- **AND** authenticated users can read and write rows per policy
