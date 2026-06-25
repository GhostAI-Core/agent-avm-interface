## ADDED Requirements

### Requirement: SIP provider edit drawer fields

The Telephony SIP Providers panel SHALL edit a provider through a right-hand drawer exposing Name, Host, Username, Password, Caller ID, and an Enabled toggle.

#### Scenario: Editing a provider
- **WHEN** the user opens a provider for editing
- **THEN** the drawer shows Name, Host, Username, Password, Caller ID, and an Enabled toggle initialized from the provider

### Requirement: Trunk numbers display and editing

The Outbound Trunks list SHALL display a trunk's numbers as the single number when it has exactly one, and as "multiple" when it has two or more, without losing the underlying list. The trunk edit drawer SHALL present the numbers as removable chips where a number is added by pressing Enter and the chips can be reordered by dragging.

#### Scenario: Single number shown
- **WHEN** a trunk has exactly one number
- **THEN** the list shows that number

#### Scenario: Multiple numbers summarized
- **WHEN** a trunk has two or more numbers
- **THEN** the list shows "multiple" while the full list remains editable in the drawer

#### Scenario: Add and reorder numbers
- **WHEN** the user types a number in the trunk drawer and presses Enter
- **THEN** it is added as a chip, and existing chips can be dragged to reorder

### Requirement: Trunk on/off toggle

Each trunk row SHALL expose an on/off toggle. Until backend persistence exists (a `sip_trunks.enabled` column and a setter), the toggle state is held client-side only and this limitation is documented.

#### Scenario: Toggle reflects state
- **WHEN** the user toggles a trunk on or off
- **THEN** the row reflects the new state for the session

### Requirement: Dashboard proxies trunk management to callops

The dashboard SHALL proxy trunk create/update and test-call to callops server-side so the webhook secret never reaches the browser: `POST /api/trunks` → callops `POST /livekit/trunks` (create and update both re-POST this endpoint), and `POST /api/trunks/test-call` → callops `POST /livekit/test-call` (requiring `phone` and `sip_trunk_id`). These follow the established start/pause/stop proxy pattern, passing upstream 4xx through and reporting unreachable callops as 502.

#### Scenario: Create/update proxied
- **WHEN** a trunk is saved in the drawer
- **THEN** the dashboard POSTs to `/api/trunks` which forwards to callops `/livekit/trunks` with the secret attached server-side

#### Scenario: Test call proxied
- **WHEN** the user places a test call with a phone and trunk
- **THEN** the dashboard POSTs to `/api/trunks/test-call` which forwards to callops `/livekit/test-call` and surfaces the result

#### Scenario: callops unreachable
- **WHEN** callops cannot be reached
- **THEN** the proxy responds 502 rather than throwing
