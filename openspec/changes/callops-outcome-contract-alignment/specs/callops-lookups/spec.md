## ADDED Requirements

### Requirement: Server-side lookups proxy

The dashboard SHALL expose a server-side route `GET /api/lookups/[type]` that proxies callops `GET /lookups/{type}` for the supported types: `call-outcomes`, `agent-outcomes`, `business-dispositions`, `contact-statuses`, `campaign-statuses`, `calling-windows`, `timezones`. The route MUST attach the callops credential server-side so it never reaches the browser, mirroring the existing start/pause/stop control proxy. An unsupported `type` MUST return a 4xx without calling callops.

#### Scenario: Proxy returns lookup items

- **WHEN** the browser requests `/api/lookups/call-outcomes`
- **THEN** the route calls callops `GET /lookups/call-outcomes` with the server-held credential
- **AND** returns the `{ items: [{ value, label }] }` payload to the browser
- **AND** the callops credential is never present in the browser-visible response or network call

#### Scenario: Unsupported lookup type is rejected

- **WHEN** the browser requests `/api/lookups/not-a-real-type`
- **THEN** the route responds with a 4xx error
- **AND** does not issue a request to callops

#### Scenario: callops lookup error is surfaced

- **WHEN** callops returns an error for a lookup request
- **THEN** the proxy passes the error status/message through rather than masking it as success

### Requirement: useLookup hook supplies dropdown options

The dashboard SHALL provide a `useLookup(type)` hook that fetches and caches a lookup list via the proxy and returns its `{ value, label }` items for use as dropdown options and label maps. The hook MUST tolerate the fetch being in-flight (no options yet) and failed (empty list) without crashing the consuming component.

#### Scenario: Hook drives a status filter

- **WHEN** a component calls `useLookup('campaign-statuses')`
- **THEN** the hook returns the campaign-status `{ value, label }` items once loaded
- **AND** the status filter dropdown renders those options

#### Scenario: Lookup unavailable degrades gracefully

- **WHEN** the lookup fetch is still loading or has failed
- **THEN** the consuming dropdown renders with no options (or a loading state) and does not throw

### Requirement: Hardcoded enums replaced by lookups

Dashboard dropdowns and label maps for call outcomes, business dispositions, contact statuses, and campaign statuses SHALL source their values from lookups rather than locally hardcoded enum arrays. `/lookups/business-dispositions` is the authoritative result-disposition source; `/lookups/agent-outcomes` is legacy and MUST NOT be the basis for new display. The stale local `Agent` union (`seeker`/`grace`/`sangoma`) MUST NOT be used to populate a callops-facing agent selector.

#### Scenario: Status dropdown no longer hardcoded

- **WHEN** the campaign-status filter renders
- **THEN** its options come from `useLookup('campaign-statuses')`
- **AND** no local hardcoded campaign-status array is the source of those options

#### Scenario: Stale agent enum not surfaced for callops

- **WHEN** a selector that maps to a callops campaign agent is rendered
- **THEN** it does not present `seeker`/`grace`/`sangoma` as the callops agent options
