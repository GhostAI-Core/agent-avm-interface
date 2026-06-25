## ADDED Requirements

### Requirement: Edit Campaign edits table-visible fields

The Edit Campaign dialog SHALL allow editing the fields shown in the campaigns table — name, agent, company, dialing speed, and time window (start and end) — in addition to the existing script selection, and SHALL persist them via `PUT /api/campaigns/{id}`. Campaign status is controlled by the row action buttons and is NOT edited in this dialog. The Reuse-as-template flow is unchanged.

#### Scenario: Edit fields are pre-filled
- **WHEN** the user opens Edit Campaign for an existing campaign
- **THEN** name, agent, company, dialing speed, and time window are initialized from that campaign

#### Scenario: Edits are persisted
- **WHEN** the user changes any of these fields and saves
- **THEN** a `PUT /api/campaigns/{id}` request carries the changed fields and the list refetches to show them

#### Scenario: Company and name are accepted by the API
- **WHEN** the PUT request includes `name` or `company_id`
- **THEN** the campaign update route accepts them (both are on the allowed-fields whitelist)

#### Scenario: Reuse flow untouched
- **WHEN** the user opens the Reuse-as-template flow
- **THEN** it behaves exactly as before (POST a cloned campaign), with no new edit fields
