## ADDED Requirements

### Requirement: Campaign network filter control

Campaign create/edit SHALL provide a control to set the campaign's allowed mobile network — `All networks` / `Vodacom` / `MTN` / `Cell C` — that persists to `campaigns.network_provider`. `All networks` maps to `null` (no filter). The control MUST offer only the CallOps-validated values (`Vodacom`, `MTN`, `Cell C`, or null); the create route and PUT route already forward `network_provider`, and CallOps validates it (422 on an invalid value) and enforces it in the enqueuer.

#### Scenario: Operator restricts a campaign to one network

- **WHEN** an operator sets the network control to `MTN` and saves
- **THEN** the campaign persists `network_provider="MTN"`
- **AND** CallOps' enqueuer dispatches only contacts whose `network_provider="MTN"`

#### Scenario: All networks clears the filter

- **WHEN** an operator sets the control to `All networks`
- **THEN** the campaign persists `network_provider=null` and every eligible contact is dialable regardless of network

### Requirement: Contact list network breakdown

The dashboard SHALL show a per-campaign breakdown of the contact list by network — counts per `Vodacom` / `MTN` / `Cell C` and `unknown` (null `network_provider`) — so an operator can see the mix before dialing. The breakdown MAY be derived from the per-contact `network_provider` returned by `/api/campaigns/{id}/contacts`.

#### Scenario: Breakdown reflects the list

- **WHEN** a campaign's contacts view is opened
- **THEN** the network breakdown shows counts per network plus an `unknown` bucket
- **AND** the counts sum to the campaign's total contacts

#### Scenario: Unknown-network contacts are visible

- **WHEN** contacts have a null `network_provider`
- **THEN** they appear in the `unknown` bucket so the operator knows the filter would skip them

### Requirement: contacts.network_provider is populated for wizard campaigns

Contacts created through the dashboard campaign wizard SHALL have `network_provider` derived from the E.164 prefix (as CallOps' `contacts.py` upload path already does), so the campaign network filter has data to match against. Where existing contacts have a null `network_provider`, they SHALL be backfilled from the prefix.

#### Scenario: Wizard-created contact gets a provider

- **WHEN** a campaign is created via the wizard with SA mobile contacts
- **THEN** each contact's `network_provider` is set from its prefix (or `unknown` for an unallocated/ported-looking prefix)

#### Scenario: A network filter is usable after backfill

- **WHEN** a campaign with `network_provider="Vodacom"` is started after contacts are populated
- **THEN** the Vodacom contacts are enqueued (not skipped as null)

### Requirement: Orphaned dashboard network gate is retired

The network-allow-list clause in the orphaned dashboard `/dial` path (`app/api/campaigns/[id]/dial/route.ts` and the `isAllowedNetwork` check in `lib/compliance/gate.ts`) SHALL be removed — nothing calls `/dial`, and provider gating is owned by CallOps' enqueuer. `lib/networks.ts` is retained for UI labelling/derivation only.

#### Scenario: No dashboard-side network gating remains

- **WHEN** the codebase is inspected after this change
- **THEN** no live dashboard path gates dialing on `isAllowedNetwork`
- **AND** `lib/networks.ts` is used only for labelling/derivation, not enforcement
