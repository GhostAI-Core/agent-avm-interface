## ADDED Requirements

### Requirement: Voip providers table includes carrier SIP columns

The database schema SHALL include extended `voip_providers` columns for SIP carrier configuration and Routr synchronization as defined in the voip-provider-carrier-schema capability.

#### Scenario: Schema script lists extended voip_providers

- **WHEN** `schema.sql` is applied
- **THEN** `voip_providers` includes `slug`, `provider_type`, `sip_host`, `sip_port`, `sip_username`, `sip_password`, `send_register`, `routr_trunk_ref`, `routr_credentials_ref`, `sync_status`, `sync_error`, and `last_synced_at`

## MODIFIED Requirements

### Requirement: Core tables exist

The Supabase project MUST have all tables, triggers, seed data, and RLS policies defined in `schema.sql` applied.

#### Scenario: Core tables exist

- **WHEN** the schema script is run in the Supabase SQL editor
- **THEN** tables `campaigns`, `call_logs`, `contacts`, `voip_providers`, `security_logs`, `system_settings`, and `profiles` exist

#### Scenario: Voip providers supports carrier fields

- **WHEN** the schema script completes
- **THEN** `voip_providers` includes carrier SIP and Routr sync columns required for Routr frontend sync
