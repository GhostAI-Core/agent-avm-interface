## ADDED Requirements

### Requirement: Campaign creation offers a Seeker/Grace/Lead-Gen mode toggle

Campaign creation SHALL replace the Product dropdown with a single-select toggle offering `Seeker`, `Grace`, and `Lead Gen`. The selection MUST map to the campaign payload as: Seeker → `agent="seeker"`, `routing_mode="script"`; Grace → `agent="grace"`, `routing_mode="script"`; Lead Gen → `agent="lead_gen"`, `routing_mode="lead"`. The toggle is exclusive (exactly one mode) and required before a campaign can be created.

#### Scenario: Selecting Seeker persists product + script mode

- **WHEN** an operator picks the Seeker toggle and saves
- **THEN** the campaign payload carries `agent="seeker"` and `routing_mode="script"`

#### Scenario: Selecting Lead Gen persists lead mode

- **WHEN** an operator picks the Lead Gen toggle and saves
- **THEN** the campaign payload carries `routing_mode="lead"` (and `agent="lead_gen"`)
- **AND** no product-subscribe (STS) semantics are implied on the dashboard side

### Requirement: routing_mode is forwarded on create and edit

The campaign create route and the campaign PUT route SHALL forward `routing_mode` to CallOps (whitelisted, like other campaign fields). This is forward-compatible: if the deployed CallOps `CampaignCreate/CampaignUpdate` does not yet accept `routing_mode`, the value is ignored without error until it does.

#### Scenario: routing_mode persists once CallOps accepts it

- **WHEN** a campaign save carries `routing_mode`
- **THEN** the create/PUT route includes it in the CallOps payload
- **AND** an unknown-field rejection does not occur (CallOps ignores extras today)

### Requirement: Lead Gen is gated on the CallOps lead mode

Because CallOps currently implements only `mode == "script"` (an unknown mode errors as `unsupported_mode`), the Lead Gen toggle MUST NOT be presented as production-ready until CallOps ships the `routing_mode="lead"` gate (press-1 → `lead` outcome, no STS relay, no two-step confirm) and accepts `routing_mode` on its campaign models.

#### Scenario: Lead Gen surfaced only when the gate exists

- **WHEN** the CallOps `lead` mode is not yet deployed
- **THEN** the Lead Gen option is disabled or clearly marked "coming soon" so an operator cannot launch a campaign that would hit `unsupported_mode`
