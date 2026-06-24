# Legacy outbound calling

Outbound SIP calls are placed via LiveKit only. Trunk selection uses per-campaign `sip_trunk_id`, the `sip_trunks` catalog, or the `LIVEKIT_SIP_OUTBOUND_TRUNK_ID` environment default. Routr and campaign routing modes are not part of the stack.

## Requirements

### Requirement: Outbound calls use legacy LiveKit trunk resolution only

The system SHALL resolve the SIP trunk for outbound calls using only the legacy path: `campaigns.sip_trunk_id` (if `ST_…` or numeric FK to `sip_trunks`), then `sip_trunks.livekit_trunk_id`, then `LIVEKIT_SIP_OUTBOUND_TRUNK_ID`. The system MUST NOT reference `LIVEKIT_SIP_ROUTR_TRUNK_ID` or any Routr routing mode.

#### Scenario: Campaign with explicit LiveKit trunk id

- **WHEN** a campaign has `sip_trunk_id` set to a value starting with `ST_`
- **THEN** outbound dial uses that trunk id for `createSipParticipant`

#### Scenario: Campaign with sip_trunks foreign key

- **WHEN** a campaign has numeric `sip_trunk_id` matching a row in `sip_trunks`
- **THEN** outbound dial uses that row's `livekit_trunk_id`

#### Scenario: Campaign with default env trunk

- **WHEN** a campaign has no resolvable per-campaign trunk
- **THEN** outbound dial uses `LIVEKIT_SIP_OUTBOUND_TRUNK_ID` from server environment

### Requirement: No Routr runtime in application stack

The application MUST NOT include Routr Docker services, `@routr/sdk` dependency, Routr bootstrap scripts, or HTTP API routes under `/api/routr`. Deploy workflows MUST NOT build or run Routr bootstrap containers.

#### Scenario: Production deploy

- **WHEN** the deploy workflow completes on the application host
- **THEN** only the web (and non-Routr) compose services are required for outbound calling

#### Scenario: Settings page load

- **WHEN** an authenticated admin opens Settings
- **THEN** no request is made to `/api/routr/status` or `/api/routr/livekit-peer`

### Requirement: Campaigns have no routing mode selector

The system MUST NOT expose `routing_mode` or "Via Routr" in campaign create or edit UI. The `campaigns.routing_mode` database column MUST NOT exist after migration.

#### Scenario: Create campaign

- **WHEN** a user creates a campaign via the UI or API
- **THEN** the payload MUST NOT accept or persist `routing_mode`
