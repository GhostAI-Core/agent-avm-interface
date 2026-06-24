## ADDED Requirements

### Requirement: Platform LiveKit peer settings

The system SHALL allow administrators to configure LiveKit → Routr peer settings: SIP host (`host:port` without `sip:` prefix), optional `ROUTR_LIVEKIT_ALLOWED_CIDRS`, optional peer username (default `livekit`), and optional peer password.

#### Scenario: Save LiveKit peer settings

- **WHEN** admin PUTs platform LiveKit peer settings with `sip_host` = `2exlse86t0v.sip.livekit.cloud:5060`
- **THEN** settings are persisted and Routr Peer is upserted with `username` required, `contactAddr` resolved to IP:port if hostname exceeds 20 characters, and optional Credentials when password is set

#### Scenario: Optional ACL applied

- **WHEN** admin sets allowed LiveKit CIDRs
- **THEN** Routr ACL is upserted and Peer references `accessControlListRef`

#### Scenario: Omit ACL when unset

- **WHEN** allowed CIDRs are empty
- **THEN** no ACL is required for peer sync and bootstrap-equivalent behavior is preserved

### Requirement: Routr status read API

Administrators SHALL be able to read a summary of configured Routr resources (at minimum LiveKit peer and carrier trunks) via an authenticated API without using rctl manually.

#### Scenario: Status returns peer and trunks

- **WHEN** admin GETs `/api/routr/status`
- **THEN** the response includes peer list fields (`ref`, `name`, `username`, `aor`, `contactAddr`) and trunk list fields (`ref`, `name`, `inboundUri`, `sendRegister`)

#### Scenario: Status when Routr down

- **WHEN** Routr API is unreachable
- **THEN** the API returns 503 with a clear error and does not expose secrets

### Requirement: Platform settings admin-only

LiveKit peer configuration and Routr status endpoints SHALL be restricted to admin role.

#### Scenario: Engineer denied routr status

- **WHEN** a user with role `engineer` GETs `/api/routr/status`
- **THEN** the response is 403
