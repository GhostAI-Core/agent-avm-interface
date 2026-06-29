## ADDED Requirements

### Requirement: Companies sourced from CallOps
The dashboard SHALL list and create companies through CallOps (`GET /companies`, `POST /companies`) rather than the Supabase `companies` table. The list response envelope SHALL be read as `{ companies: [...] }` and the create response as `{ company: {...} }`.

#### Scenario: List companies
- **WHEN** the dashboard loads the companies list
- **THEN** it calls `GET /companies` with the user's bearer token
- **AND** renders the `companies` array from the envelope

#### Scenario: Create company
- **WHEN** the user submits a new company
- **THEN** the dashboard calls `POST /companies` with the bearer token
- **AND** uses the returned `company` object as the created record

### Requirement: Company detail, update, and archive via CallOps
The dashboard SHALL read company detail and perform update and archive/restore actions through the corresponding CallOps company endpoints, never via direct Supabase writes.

#### Scenario: Archive instead of hard delete
- **WHEN** the user archives a company
- **THEN** the dashboard calls the CallOps company archive endpoint
- **AND** the company is excluded from the default (active) list afterward

### Requirement: Company scoping enforced by the backend
The dashboard SHALL rely on CallOps to return only companies the authenticated user may access and SHALL NOT add its own company filter. A request for an out-of-scope company SHALL surface the backend's not-found/forbidden response.

#### Scenario: Out-of-scope company
- **WHEN** the dashboard requests a company the user cannot access
- **THEN** CallOps returns 404/403 and the dashboard surfaces that state without exposing the resource
