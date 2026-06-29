## ADDED Requirements

### Requirement: Call history sourced from CallOps
The dashboard SHALL list calls through CallOps (`GET /companies/{id}/calls`, `GET /campaigns/{id}/calls`) rather than reading `call_records`/`call_logs` from Supabase, supporting the backend's filters (outcome, campaign_id, contact_id, from/to date, phone, search).

#### Scenario: Company call list
- **WHEN** the call log view loads
- **THEN** it calls `GET /companies/{id}/calls` with the user's bearer token and any active filters
- **AND** renders the returned calls

### Requirement: Per-call two-tier result display
The per-call view SHALL render `outcome` (telephony) and `business_disposition` (business result) as two distinct fields, sourced from the CallOps call object; a missing disposition SHALL render as "—".

#### Scenario: Outcome and disposition shown distinctly
- **WHEN** a connected call with `business_disposition=opt_out` is displayed
- **THEN** `outcome` and `business_disposition` appear in separate columns/fields
- **AND** a call without a disposition shows "—"

### Requirement: Call detail and recording via CallOps
The call-detail view SHALL read detail from `GET /calls/{id}` (including timestamps and `business_disposition`) and obtain the recording via `GET /calls/{id}/recording` (signed URL), opened on demand.

#### Scenario: Recording opened via signed URL
- **WHEN** the user opens a call's recording
- **THEN** the dashboard fetches `GET /calls/{id}/recording` and opens the returned `recording_url`

### Requirement: Split call-report and telemetry detail
The call-detail view SHALL read the telephony narrative from `GET /calls/{id}/call-report` (AMD, SIP, DTMF/matched-key, playback, disconnect, transfer, talk_seconds) and model-usage from `GET /calls/{id}/telemetry`, using the live split endpoints — NOT a combined telemetry payload. Absent report/telemetry SHALL render an unavailable/empty state without error.

#### Scenario: Telephony narrative from call-report
- **WHEN** a call with a report is opened
- **THEN** the dashboard reads `GET /calls/{id}/call-report` and renders the narrative fields

#### Scenario: Script-only call has no model usage
- **WHEN** a script-only call (no model usage) is opened
- **THEN** `GET /calls/{id}/telemetry` returns an empty collection
- **AND** the view shows no model-usage section without raising an error
