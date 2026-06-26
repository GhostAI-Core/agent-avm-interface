## ADDED Requirements

### Requirement: Call detail reads the split call-report

The call-detail view SHALL fetch callops `GET /calls/{id}/call-report` (via a server-side proxy) and render the telephony narrative it returns — including AMD classification, SIP attributes, DTMF digits / matched key, playback metadata, disconnect reason, transfer target, and `talk_seconds`. These telephony fields MUST come from the call-report endpoint, not from the (now business-only) outcome record.

#### Scenario: Telephony narrative is shown for a call

- **WHEN** an operator opens the detail for a completed call
- **THEN** the view requests `GET /calls/{id}/call-report` through the server proxy
- **AND** renders the AMD category, DTMF/matched-key, playback, and disconnect-reason fields it returns

#### Scenario: Call with no report yet

- **WHEN** a call has no call-report (e.g. still in progress or report not posted)
- **THEN** the detail view renders without error and indicates the telephony detail is unavailable

### Requirement: Call detail reads model-usage telemetry

The call-detail view SHALL fetch callops `GET /calls/{id}/telemetry` (via a server-side proxy) and present the model-usage / SDK metric events it returns (e.g. LLM and TTS metrics). The view MUST tolerate an empty telemetry list (script-only calls skip model usage).

#### Scenario: Model-usage metrics are shown

- **WHEN** an operator opens the detail for a call that ran the LLM/STT agent
- **THEN** the view requests `GET /calls/{id}/telemetry` through the proxy
- **AND** renders the returned telemetry events (e.g. `llm_metrics`, `tts_metrics`)

#### Scenario: Script-only call has no telemetry

- **WHEN** a call's telemetry list is empty
- **THEN** the view renders without error and shows no model-usage section (or an empty state)

### Requirement: Detail reads go through a server-side proxy

The call-report and telemetry reads SHALL be proxied server-side so the callops credential never reaches the browser, consistent with the existing control proxy.

#### Scenario: Credential stays server-side

- **WHEN** the browser opens a call detail
- **THEN** the call-report and telemetry requests carry the callops credential only on the server hop
- **AND** no callops credential appears in the browser-visible network calls
