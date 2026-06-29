## ADDED Requirements

### Requirement: Campaigns sourced from CallOps
The dashboard SHALL list, create, update, duplicate, and archive campaigns through CallOps (`GET /companies/{company_id}/campaigns`, `POST /companies/{company_id}/campaigns`, and the campaign detail/update/duplicate/archive endpoints) rather than direct Supabase writes to `campaigns`. The campaign list SHALL be read from the paginated envelope `{ items, page, page_size, total }`.

#### Scenario: Create campaign through CallOps
- **WHEN** the user creates a campaign
- **THEN** the dashboard calls `POST /companies/{company_id}/campaigns` with the bearer token and the campaign fields
- **AND** uses CallOps' returned `{ campaign, contacts_imported, contacts_rejected }` to report the result

#### Scenario: List campaigns paginated
- **WHEN** the dashboard loads campaigns for a company
- **THEN** it calls `GET /companies/{company_id}/campaigns`
- **AND** reads `items`/`total` from the paginated envelope

### Requirement: Contacts created via CallOps using the campaign_id model
Campaign creation and contact import SHALL deliver contacts to CallOps (inline on campaign create, or via the contacts import endpoint) so CallOps owns `contacts.campaign_id`, E.164 phone normalisation, and rejection reporting. The dashboard SHALL NOT normalise or insert contacts directly.

#### Scenario: Inline contacts on campaign create
- **WHEN** a campaign is created with a contact list
- **THEN** the contacts are sent in the CallOps create payload
- **AND** CallOps returns counts of imported and rejected contacts

### Requirement: Remove the campaign_contacts M:N write path
The dashboard SHALL NOT write to the `campaign_contacts` M:N join table, and SHALL NOT perform the post-create `contacts.campaign_id` patch workaround. The dispatcher reads `contacts.campaign_id`; the legacy M:N table is unused.

**Reason**: Contacts written only to `campaign_contacts` are invisible to the CallOps dispatcher, so wizard-created campaigns dial nobody.
**Migration**: Create contacts exclusively through CallOps (inline on campaign create or via `POST /campaigns/{id}/contacts/import`); the M:N table is left in the DB but no longer written.

#### Scenario: No M:N or patch workaround on create
- **WHEN** a campaign with contacts is created
- **THEN** no insert to `campaign_contacts` occurs
- **AND** no direct `contacts.campaign_id` update is issued from the dashboard

### Requirement: Retain campaign voice_id persistence
Campaign create/edit SHALL continue to persist the chosen Inworld `voice_id` so CallOps can select voice-matched confirm audio, carried via the CallOps campaign payload.

#### Scenario: voice_id persisted on generate
- **WHEN** a campaign script is generated and saved
- **THEN** the chosen `voice_id` is included in the campaign create/update payload to CallOps
