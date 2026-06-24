# VoIP provider config

Carrier SIP credentials are stored in Supabase `voip_providers` for operator configuration. Writes are local to the database with no external SIP router sync.

## Requirements

### Requirement: VoIP providers are stored without external sync

The system SHALL allow authenticated users to create, read, update, and delete carrier records in `voip_providers` with fields: name, slug, provider_type, sip_host, sip_port, sip_username, sip_password, send_register. Writes MUST NOT invoke Routr SDK or set Routr-specific sync metadata.

#### Scenario: Add carrier via API

- **WHEN** an authenticated POST to `/api/providers` includes valid carrier fields
- **THEN** a row is inserted in `voip_providers` and the response returns the stored record without `routr_trunk_ref` or `sync_status`

#### Scenario: Update carrier via API

- **WHEN** an authenticated PATCH to `/api/providers/[id]` updates SIP credentials
- **THEN** only Supabase is updated and no external SIP router sync occurs

### Requirement: Settings carrier UI is local-config only

The Settings carrier section MUST list providers from Supabase and MUST NOT display Routr sync status chips, Routr trunk/credential refs, or "Save & sync to Routr" actions.

#### Scenario: View carriers in Settings

- **WHEN** an admin views the carrier list
- **THEN** each entry shows name, type, slug, and SIP endpoint without Routr references
