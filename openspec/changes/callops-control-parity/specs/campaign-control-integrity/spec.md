## ADDED Requirements

### Requirement: Dashboard does not write campaign lifecycle state directly

The `PUT /api/campaigns/{id}` route SHALL NOT accept `status`; `status` is removed from its allowed-fields list. Campaign lifecycle changes (start, pause, stop) SHALL go only through the callops control proxy `POST /api/campaigns/{id}/{action}`. Authoring fields (name, company, schedule, trunk, dialing speed, audio) remain editable via PUT.

#### Scenario: PUT ignores status
- **WHEN** a `PUT /api/campaigns/{id}` request includes a `status` field
- **THEN** the route does not apply it (it is not on the allowed-fields list), while other valid fields are still updated

#### Scenario: Lifecycle goes through the control proxy
- **WHEN** an operator starts, pauses, or stops a campaign from the dashboard
- **THEN** the change is issued via `POST /api/campaigns/{id}/{start|pause|stop}`, which proxies to callops, not via a direct status write

### Requirement: Local lifecycle fallback is development-only

When `CALLOPS_URL` / `CALLOPS_WEBHOOK_SECRET` are unset, the control proxy MAY mirror the lifecycle by writing `campaigns.status` to Supabase locally, but ONLY outside production. In production an unconfigured callops SHALL return an error rather than write lifecycle state directly, so the dashboard can never set control state behind callops.

#### Scenario: Local dev mirrors the lifecycle
- **WHEN** callops is unconfigured and the environment is not production
- **THEN** a lifecycle action falls back to a direct `campaigns.status` write so the dashboard stays usable locally

#### Scenario: Production refuses to write lifecycle without callops
- **WHEN** callops is unconfigured and the environment is production
- **THEN** a lifecycle action returns an error and does NOT write `campaigns.status` directly
