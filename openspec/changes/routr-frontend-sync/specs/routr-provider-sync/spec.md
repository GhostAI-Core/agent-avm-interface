## ADDED Requirements

### Requirement: Carrier provider sync to Routr

When an administrator saves a `voip_providers` row with complete SIP carrier fields, the system SHALL upsert a Routr **Credentials** resource and a Routr **Trunk** resource matching the deployed M1 shape: `inboundUri` = `{slug}.evra.local`, outbound URI with `host`, `port`, `transport` = `UDP`, `sendRegister` from provider row, and `extended.evraProviderId` set to the provider id.

#### Scenario: Create new carrier provider

- **WHEN** admin POSTs a new provider with `name`, `slug`, `sip_host`, `sip_port`, `sip_username`, and `sip_password`
- **THEN** Routr Credentials and Trunk are created, `routr_credentials_ref` and `routr_trunk_ref` are stored on the row, and `sync_status` is `synced`

#### Scenario: Update existing carrier provider

- **WHEN** admin PATCHes an existing provider’s SIP fields
- **THEN** Routr Credentials and Trunk are updated via existing refs or lookup by `extended.evraProviderId` / name, and `last_synced_at` is updated

#### Scenario: Routr unreachable on save

- **WHEN** admin saves a provider but the Routr API is unreachable from the web container
- **THEN** the provider row is persisted, `sync_status` is `error`, `sync_error` contains a clear message, and the API returns a non-2xx or 207-style response indicating sync failure

#### Scenario: Idempotent upsert on duplicate username

- **WHEN** Routr returns `ALREADY_EXISTS` for a peer or trunk unique field from a prior bootstrap run
- **THEN** sync updates the existing Routr resource instead of failing permanently

### Requirement: Provider sync uses Routr SDK constraints

The sync layer SHALL enforce Routr database limits: `transport` MUST be uppercase `UDP` (or other valid enum), trunk `user` MUST match SIP username when provided, and credential passwords MUST NOT exceed 255 characters.

#### Scenario: Transport sent as UDP enum

- **WHEN** sync creates a trunk outbound URI
- **THEN** the `transport` field sent to `@routr/sdk` is `UDP`, not lowercase `udp`

### Requirement: Admin-only provider sync

Only users with admin role SHALL trigger Routr sync via provider APIs.

#### Scenario: Engineer cannot sync provider

- **WHEN** a user with role `engineer` POSTs or PATCHes `/api/providers`
- **THEN** the request is rejected with 403 and no Routr sync occurs
