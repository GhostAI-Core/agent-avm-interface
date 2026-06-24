## ADDED Requirements

### Requirement: Trunk selection submits the trunk foreign key

The New Campaign wizard's Trunk dropdown SHALL submit the integer `sip_trunks.id` as `sip_trunk_id`, never the `livekit_trunk_id` string. The create and update routes resolve `sip_trunk_id` as `Number(value)`; a non-numeric value coerces to `NaN` and persists `NULL`, which callops rejects on `/start`.

#### Scenario: Operator picks a trunk in the wizard

- **WHEN** the operator selects a trunk in the New Campaign wizard
- **THEN** the dropdown option value is the trunk's integer `sip_trunks.id`
- **AND** the campaign create payload sets `sip_trunk_id` to that integer (or `null` for "default trunk")

#### Scenario: Saved campaign has a resolvable trunk

- **WHEN** a campaign is created or edited with a trunk selected
- **THEN** `campaigns.sip_trunk_id` is a valid FK into `sip_trunks`
- **AND** callops `/start` does not return `422 campaign_missing_sip_trunk`

### Requirement: Lifecycle proxy surfaces the real callops error

The campaign lifecycle proxy (`/api/campaigns/{id}/{action}`) SHALL pass a callops client error (4xx) through with its original status code and `detail`, reserving `502` for callops 5xx responses or an unreachable orchestrator.

#### Scenario: callops rejects with a 4xx

- **WHEN** callops responds to a lifecycle action with a 4xx and a `detail` body
- **THEN** the proxy returns that same status code
- **AND** the response body carries the callops `detail` (e.g. `campaign_missing_sip_trunk`)

#### Scenario: callops is down or errors internally

- **WHEN** callops returns a 5xx or is unreachable
- **THEN** the proxy returns `502`
- **AND** the response body states the orchestrator failed

### Requirement: Exactly one live queue consumer per running campaign

A campaign in the `running` state SHALL always have an active dispatch loop consuming its queue. Starting a campaign whose previous dispatch loop has ended MUST create a fresh consumer; a finished or errored loop MUST NOT block a later start.

#### Scenario: Re-starting a previously completed campaign

- **WHEN** a campaign that previously ran to completion is started again
- **THEN** a new dispatch loop is created and consumes the campaign's queue
- **AND** enqueued contacts move from `pending` to `in_progress`/`dialed` rather than sitting unconsumed

#### Scenario: Stuck running campaign with an unconsumed queue (recovery)

- **WHEN** a campaign is `running` with queued contacts but no consumer (no progress, `read_ct` zero)
- **THEN** Pause followed by Start MUST recover it by stopping any stale state and creating a fresh consumer
