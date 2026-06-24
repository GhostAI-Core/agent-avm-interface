# supabase-database

Delta: contacts created by the dashboard must be discoverable by the dialer.

## ADDED Requirements

### Requirement: The campaign_contacts join is the authoritative contact-enumeration contract

The M:N `campaign_contacts` join SHALL be the single authoritative way to enumerate a campaign's contacts (DECIDED 2026-06-24). Contact identity (phone, consent, timezone, score) lives on the canonical `contacts` row; per-campaign membership and dial status live on `campaign_contacts`. callops MUST enumerate, count, and update dial status via the join — not via `contacts.campaign_id`.

#### Scenario: callops enumerates via the join

- **WHEN** callops selects a campaign's contacts to dial
- **THEN** it reads `campaign_contacts` for that campaign (joining `contacts` for identity)
- **AND** it filters/updates per-campaign status on the join row, not on `contacts.status`

#### Scenario: Transitional bridge during migration

- **WHEN** the dashboard create flow runs before callops has shipped the join read
- **THEN** it also sets `contacts.campaign_id` as a temporary bridge so the current callops build can still dial
- **AND** that bridge is REMOVED once callops enumerates via `campaign_contacts`

#### Scenario: Canonical contact shared across campaigns

- **WHEN** the same phone is a contact in two campaigns
- **THEN** there is one canonical `contacts` row linked by two `campaign_contacts` rows
- **AND** each campaign tracks its own dial status independently on its join row

### Requirement: Contacts status uses the dialer lifecycle vocabulary

`contacts.status` SHALL be constrained to the dialer lifecycle values `pending`, `in_progress`, `dialed`, `failed`, `retry`. Writers MUST NOT use values outside this set (e.g. `completed` is rejected by the CHECK constraint).

#### Scenario: Excluding a contact from a dial run

- **WHEN** a contact must be excluded from an active campaign without deletion
- **THEN** it is excluded via a lifecycle-valid status or by unsetting `contacts.campaign_id`
- **AND** never by writing a status outside the allowed set
