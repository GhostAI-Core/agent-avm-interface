## ADDED Requirements

### Requirement: Analytics sourced from CallOps dashboard endpoints
The dashboard's reports table, KPI cards, outcome chart, call-volume chart, and live queue SHALL read from CallOps dashboard endpoints — `GET /companies/{id}/dashboard` (summary), `/dashboard/live`, `/dashboard/outcomes`, `/dashboard/call-volume` (with `group_by`), and `/dashboard/campaign-performance` — rather than recomputing from `call_records`/`call_logs`.

#### Scenario: KPI summary from CallOps
- **WHEN** the dashboard renders KPI cards
- **THEN** it reads values from `GET /companies/{id}/dashboard`
- **AND** does not aggregate `call_records` client-side

#### Scenario: Call-volume time series
- **WHEN** the call-volume chart is shown grouped by day
- **THEN** the dashboard calls `GET /companies/{id}/dashboard/call-volume?group_by=day`
- **AND** plots the returned period/calls/connected/failed points

### Requirement: Opt-out reported separately from connected
The dashboard SHALL surface opt-out counts as a distinct metric and SHALL NOT include opt-out in the connected total, matching the CallOps dashboard contract.

#### Scenario: Opt-out excluded from connected
- **WHEN** summary and outcome metrics are displayed
- **THEN** opt-out is shown as its own figure
- **AND** the connected total does not include opt-out

### Requirement: Intent funnel from CallOps intent-stats
The Call Quality / intent funnel SHALL source `connected_total` and the intent waterfall from `GET /campaigns/{id}/intent-stats` (or the company-level variant) rather than local computation.

#### Scenario: Funnel from intent-stats
- **WHEN** the Call Quality view loads
- **THEN** it reads the intent funnel and connected total from the CallOps intent-stats endpoint

### Requirement: Remove the local analytics roll-up
The client-side outcome roll-up over `call_records`/`call_logs` (report keys/headers, outcome summation, positional donut buckets) SHALL be removed once analytics read from CallOps. No dashboard path SHALL re-aggregate raw call rows for outcome or disposition counts.

#### Scenario: No local re-aggregation remains
- **WHEN** the analytics views render after this change
- **THEN** all outcome/disposition counts come from CallOps responses
- **AND** no local summation of `call_records`/`call_logs` is performed
