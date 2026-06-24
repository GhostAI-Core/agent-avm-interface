## ADDED Requirements

### Requirement: Voip providers carrier columns

The `voip_providers` table SHALL include columns for carrier SIP configuration and Routr sync state: `slug`, `provider_type`, `sip_host`, `sip_port`, `sip_username`, `sip_password`, `send_register`, `routr_trunk_ref`, `routr_credentials_ref`, `sync_status`, `sync_error`, and `last_synced_at`.

#### Scenario: Migration adds columns idempotently

- **WHEN** the migration runs on an existing database
- **THEN** all new columns exist on `voip_providers` without dropping `api_key` or `api_secret`

#### Scenario: Slug used for inbound URI

- **WHEN** a provider has `slug = twilio` and is synced to Routr
- **THEN** the trunk `inboundUri` is `twilio.evra.local`

### Requirement: Provider type enumeration

`provider_type` SHALL accept `twilio`, `telnyx`, or `sangoma` and MUST default to `twilio` when unset.

#### Scenario: Default provider type

- **WHEN** a provider is inserted without `provider_type`
- **THEN** the stored value is `twilio`

### Requirement: Sync status tracking

Each provider row SHALL track Routr sync outcome in `sync_status` with allowed values `pending`, `synced`, and `error`.

#### Scenario: New provider before first sync

- **WHEN** a provider is created
- **THEN** `sync_status` is `pending` until a successful Routr sync sets it to `synced`
