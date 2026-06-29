## ADDED Requirements

### Requirement: Contacts management view
The dashboard SHALL provide a contacts management view (reachable from the sidebar) that lists a campaign's contacts via `GET /campaigns/{campaign_id}/contacts` with pagination, search, and status filtering, showing at least phone, name, status, network, retry count, and last attempted.

#### Scenario: Paginated, filtered contact list
- **WHEN** the user opens the contacts view for a campaign
- **THEN** the dashboard calls `GET /campaigns/{campaign_id}/contacts?page=N&search=...&status=...`
- **AND** renders the returned page of contacts with the total count

#### Scenario: Status filter options from lookups
- **WHEN** the status filter is shown
- **THEN** its options are sourced from `GET /lookups/contact-statuses`

### Requirement: CSV contact import via CallOps
The contacts view SHALL import contacts by parsing the CSV client-side and posting to `POST /campaigns/{campaign_id}/contacts/import`, then displaying the created/updated/rejected summary and any per-row errors returned.

#### Scenario: Import summary surfaced
- **WHEN** a CSV is imported
- **THEN** the dashboard posts the rows to the import endpoint
- **AND** shows the returned counts (created, updated, rejected) and the `errors` for rejected rows

### Requirement: Contact row actions via CallOps
The contacts view SHALL perform Archive, Retry, and Do-Not-Call actions through their CallOps endpoints (`/contacts/{id}/archive`, `/contacts/{id}/retry`, `/contacts/{id}/do-not-call`), never via direct Supabase writes.

#### Scenario: Mark do-not-call
- **WHEN** the user marks a contact do-not-call
- **THEN** the dashboard calls the CallOps do-not-call endpoint
- **AND** the contact is suppressed from future dials per the backend
