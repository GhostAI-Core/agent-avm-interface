## ADDED Requirements

### Requirement: Campaign routing mode in UI

The campaign create and edit UI SHALL expose `routing_mode` with options `legacy` (direct LiveKit carrier trunk) and `routr` (LiveKit trunk to Routr). The selected value MUST be persisted to `campaigns.routing_mode`.

#### Scenario: Create campaign with routr mode

- **WHEN** admin creates a campaign and selects routing mode `routr`
- **THEN** the stored `routing_mode` is `routr` and the next dial uses `LIVEKIT_SIP_ROUTR_TRUNK_ID`

#### Scenario: Edit campaign routing mode

- **WHEN** admin changes an existing campaign from `legacy` to `routr` in the UI
- **THEN** the database row is updated without redeploying the application

#### Scenario: UI explains routr env dependency

- **WHEN** admin selects `routr` routing mode
- **THEN** the UI displays that server `LIVEKIT_SIP_ROUTR_TRUNK_ID` must be configured (and does not imply per-campaign Routr trunk selection in M2)
