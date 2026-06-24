# dashboard-polling

Periodic refresh of dashboard API data while the user is authenticated.

## ADDED Requirements

### Requirement: Dashboard polls call data on an interval

The main dashboard page MUST periodically re-fetch campaigns, reports, call logs, and intent stats while the user is authenticated.

#### Scenario: Data refreshes automatically

- **WHEN** a user is logged in and viewing the application
- **THEN** `/api/campaigns`, `/api/reports`, `/api/logs`, and `/api/intents` are re-fetched on a fixed interval

#### Scenario: Polling stops on logout

- **WHEN** the user logs out or the page unmounts
- **THEN** the polling interval is cleared and no further background fetches occur

### Requirement: Poll interval is configurable with a sensible default

The poll interval MUST default to 15000 milliseconds and MAY be overridden via `NEXT_PUBLIC_POLL_INTERVAL_MS`.

#### Scenario: Default interval

- **WHEN** `NEXT_PUBLIC_POLL_INTERVAL_MS` is not set
- **THEN** polling occurs every 15 seconds

#### Scenario: Custom interval

- **WHEN** `NEXT_PUBLIC_POLL_INTERVAL_MS` is set to `5000`
- **THEN** polling occurs every 5 seconds

### Requirement: Polling does not block initial load

The initial data fetch on login MUST complete before or independently of the polling interval; polling MUST NOT duplicate the first fetch synchronously.

#### Scenario: Login then poll

- **WHEN** a user authenticates
- **THEN** the existing initial `useEffect` fetch runs once immediately
- **AND** the polling interval begins afterward without an extra synchronous duplicate fetch at t=0
