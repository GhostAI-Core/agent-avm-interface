# livekit-outbound-dial

Node CLI script that dispatches a LiveKit agent and places an outbound SIP call for frontend testing.

## ADDED Requirements

### Requirement: Dial script dispatches agent then places SIP call

The repository MUST provide a Node script that, for each dial attempt, calls `AgentDispatchClient.createDispatch` followed by `SipClient.createSipParticipant` using a stored outbound trunk ID.

#### Scenario: Successful dispatch and dial

- **WHEN** the script runs with valid LiveKit credentials, agent name, trunk ID, and phone number
- **THEN** an agent dispatch is created for the target room
- **AND** a SIP participant is created dialing the phone number into the same room
- **AND** the script logs dispatch ID and SIP participant info to stdout

#### Scenario: SIP dial failure

- **WHEN** `createSipParticipant` fails with a `TwirpError`
- **THEN** the script logs the error and SIP status metadata
- **AND** updates the associated `call_records` row outcome to a failure status where mappable (`failed`, `no_answer`, or `busy`)

### Requirement: Dial script resolves configuration from campaign and environment

The script MUST resolve `agentName` from `campaigns.agent_name` or `LIVEKIT_AGENT_NAME` env, and `trunkId` from `campaigns.sip_trunk_id` → `sip_trunks.livekit_trunk_id` or `LIVEKIT_SIP_OUTBOUND_TRUNK_ID` env.

#### Scenario: Campaign-based dial

- **WHEN** the script is invoked with `--campaign-id` and `--contact-id`
- **THEN** it loads the campaign and contact from Supabase
- **AND** uses campaign-level overrides when present, otherwise env defaults

#### Scenario: Direct phone dial

- **WHEN** the script is invoked with `--phone` and optional `--campaign-id`
- **THEN** it dials the normalized phone number without requiring a contact row

### Requirement: Dial script writes Supabase state before calling LiveKit

The script MUST insert a `call_records` row with `outcome: pending`, `room` set to the generated room name, and `contact_id` when applicable; and MUST set `contacts.status` to `in_progress` when dialing a contact.

#### Scenario: Call record created on dial start

- **WHEN** the script begins a dial for campaign 16 contact 51
- **THEN** a `call_records` row exists with `campaign_id` 16, `contact_id` 51, matching `phone`, `room`, and `outcome` `pending`

#### Scenario: Contact marked in progress

- **WHEN** the script dials a contact with status `pending` or `retry`
- **THEN** `contacts.status` is updated to `in_progress`
- **AND** `contacts.last_attempted_at` is set to the current timestamp

### Requirement: Phone numbers are normalized before dialing

The script MUST normalize phone numbers by stripping surrounding quotes and whitespace and producing a dialable E.164 string before passing to LiveKit or storing in `call_records`.

#### Scenario: Malformed contact phone cleaned

- **WHEN** a contact phone is stored as `"\"+27 86 656 7784\""`
- **THEN** the script dials `+27866567784` (or equivalent normalized form)

### Requirement: Dial script is invocable via npm script

`package.json` MUST expose `npm run dial` that runs the dial script with CLI argument passthrough.

#### Scenario: Developer runs dial command

- **WHEN** a developer runs `npm run dial -- --campaign-id 16 --contact-id 51`
- **THEN** the dial script executes with those arguments

### Requirement: LiveKit and script environment variables are documented

`.env.example` MUST document `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_AGENT_NAME`, `LIVEKIT_SIP_OUTBOUND_TRUNK_ID`, and `SUPABASE_SERVICE_ROLE_KEY` for script usage.

#### Scenario: Developer reads env example

- **WHEN** a developer copies `.env.example` to configure local dialing
- **THEN** all required LiveKit and Supabase script variables are listed with brief descriptions
