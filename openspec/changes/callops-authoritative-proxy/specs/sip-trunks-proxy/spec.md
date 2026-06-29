## ADDED Requirements

### Requirement: SIP trunks sourced from CallOps
The Telephony view's SIP Trunks tab SHALL list, create, update, and archive trunks through CallOps (`GET/POST /companies/{id}/sip-trunks`, and the trunk update/archive endpoints), replacing the browser-only mock state (`lib/telephony-mock.ts`).

#### Scenario: List trunks from CallOps
- **WHEN** the SIP Trunks tab loads
- **THEN** it calls `GET /companies/{id}/sip-trunks` with the user's bearer token
- **AND** renders company-owned and globally available trunks
- **AND** no mock trunk state is used

#### Scenario: Create trunk
- **WHEN** the user creates a trunk
- **THEN** the dashboard calls `POST /companies/{id}/sip-trunks` with the trunk fields

### Requirement: Trunk credentials never rendered
The dashboard SHALL NOT display SIP trunk authentication credentials (e.g. `auth_password`); responses from CallOps omit them and the UI SHALL NOT attempt to surface or store them client-side.

#### Scenario: No credential in the UI
- **WHEN** trunk detail is shown
- **THEN** no authentication password/secret field is rendered

### Requirement: Trunk health-check and test-call
The SIP Trunks tab SHALL offer a health-check (`GET /sip-trunks/{id}/health`) and a test-call (`POST /sip-trunks/{id}/test-call` with a phone) action, surfacing the result; a SIP/carrier failure returned at HTTP 200 with `ok=false` SHALL be shown as a failure message, not a crash.

#### Scenario: Failed test-call surfaced gracefully
- **WHEN** a test-call returns HTTP 200 with `ok=false`
- **THEN** the dashboard shows the failure message from the response
- **AND** does not treat it as a fatal error
