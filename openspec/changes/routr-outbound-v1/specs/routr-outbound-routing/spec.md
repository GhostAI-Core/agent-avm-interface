## ADDED Requirements

### Requirement: Campaign routing mode column

The system SHALL store a `routing_mode` on each campaign with allowed values `legacy` and `routr`. New and existing campaigns MUST default to `legacy` when the column is absent or unset.

#### Scenario: New campaign defaults to legacy

- **WHEN** a campaign row is created without an explicit `routing_mode`
- **THEN** the stored `routing_mode` is `legacy`

#### Scenario: Existing campaigns remain on legacy after migration

- **WHEN** the `routing_mode` column is added via database migration
- **THEN** all existing campaign rows have `routing_mode = 'legacy'`

### Requirement: Legacy trunk resolution preserved

When `campaigns.routing_mode` is `legacy`, outbound dialing SHALL resolve the LiveKit SIP trunk using the existing behavior: literal `ST_…` on `campaigns.sip_trunk_id`, numeric lookup in `sip_trunks.livekit_trunk_id`, then `LIVEKIT_SIP_OUTBOUND_TRUNK_ID`.

#### Scenario: Legacy campaign uses sip_trunk_id

- **WHEN** a campaign has `routing_mode = 'legacy'` and `sip_trunk_id` set to a LiveKit trunk id or `sip_trunks` row id
- **THEN** `createSipParticipant` is called with the trunk id resolved by the existing legacy resolver

#### Scenario: Legacy campaign falls back to env default

- **WHEN** a campaign has `routing_mode = 'legacy'` and no resolvable `sip_trunk_id`
- **THEN** `createSipParticipant` is called with `LIVEKIT_SIP_OUTBOUND_TRUNK_ID`

### Requirement: Routr trunk resolution

When `campaigns.routing_mode` is `routr`, outbound dialing SHALL use `LIVEKIT_SIP_ROUTR_TRUNK_ID` as the LiveKit outbound trunk for `createSipParticipant`. The legacy `sip_trunk_id` and `LIVEKIT_SIP_OUTBOUND_TRUNK_ID` MUST NOT be used for trunk selection in routr mode.

#### Scenario: Routr campaign uses Routr-facing trunk

- **WHEN** a campaign has `routing_mode = 'routr'` and `LIVEKIT_SIP_ROUTR_TRUNK_ID` is set
- **THEN** `createSipParticipant` is called with `LIVEKIT_SIP_ROUTR_TRUNK_ID`

#### Scenario: Routr mode missing env fails safely

- **WHEN** a campaign has `routing_mode = 'routr'` and `LIVEKIT_SIP_ROUTR_TRUNK_ID` is unset or empty
- **THEN** the dial attempt for that contact fails with a clear error and does not fall back to the legacy trunk

### Requirement: Unchanged agent and webhook lifecycle

Outbound calls through Routr SHALL use the same room naming, agent dispatch metadata, LiveKit webhook handling, agent result callback, and simulator fallback as legacy outbound calls.

#### Scenario: Routr call creates pending call record

- **WHEN** a routr-mode dial succeeds at the API layer
- **THEN** a `call_records` row is created with `outcome` pending and the generated room name

#### Scenario: Routr call receives webhook updates

- **WHEN** LiveKit emits SIP and room lifecycle webhooks for a routr-mode call
- **THEN** `/api/livekit/webhook` updates `call_records` the same way as legacy calls

#### Scenario: Routr call agent result

- **WHEN** the LiveKit agent completes a routr-mode call
- **THEN** `POST /api/calls/result` accepts the outcome and updates reporting tables

### Requirement: Per-campaign rollback without deploy

An operator SHALL be able to revert a campaign from Routr routing to legacy routing by setting `routing_mode` back to `legacy` without application redeployment.

#### Scenario: Rollback restores legacy trunk path

- **WHEN** a campaign previously on `routing_mode = 'routr'` is updated to `routing_mode = 'legacy'`
- **THEN** the next dial for that campaign uses legacy trunk resolution and does not use `LIVEKIT_SIP_ROUTR_TRUNK_ID`

### Requirement: M1 environment configuration

The deployment configuration SHALL support both `LIVEKIT_SIP_OUTBOUND_TRUNK_ID` (legacy) and `LIVEKIT_SIP_ROUTR_TRUNK_ID` (Routr path) concurrently. Documentation SHALL describe both variables and which routing mode uses each.

#### Scenario: Both trunk env vars documented

- **WHEN** an operator reads the environment template for outbound dialing
- **THEN** both `LIVEKIT_SIP_OUTBOUND_TRUNK_ID` and `LIVEKIT_SIP_ROUTR_TRUNK_ID` are listed with routing-mode semantics

### Requirement: M1 validation checklist

Milestone 1 SHALL be considered complete only when all of the following have been verified on a staging Routr instance with a real carrier trunk:

1. Routr runs in dev/staging with Peer and carrier Trunk configured
2. LiveKit has a separate outbound trunk pointing to Routr (`LIVEKIT_SIP_ROUTR_TRUNK_ID`)
3. `npm run dial` succeeds for a campaign with `routing_mode = 'routr'`
4. A UI-started campaign call succeeds through Routr
5. A real +27 handset rings and audio is bidirectional
6. The LiveKit agent joins the room
7. `call_records` updates correctly via webhooks
8. `/api/calls/result` works
9. Recording/egress works when configured
10. Rollback to `routing_mode = 'legacy'` is documented and tested

#### Scenario: End-to-end routr validation

- **WHEN** an operator runs the M1 validation checklist against a test campaign with `routing_mode = 'routr'`
- **THEN** each checklist item passes or is explicitly documented with a known limitation

#### Scenario: Rollback validation

- **WHEN** the test campaign is set to `routing_mode = 'legacy'` after routr validation
- **THEN** a subsequent dial uses the legacy LiveKit trunk path successfully
