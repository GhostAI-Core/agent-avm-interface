## ADDED Requirements

### Requirement: Trunk edit updates through callops PATCH

The dashboard SHALL update an existing SIP outbound trunk by calling `PATCH /api/trunks/{trunk_id}`, which proxies server-side to callops `PATCH /livekit/trunks/{trunk_id}` with the `X-Webhook-Secret` header, sending only the changed fields — rather than re-creating the trunk via `POST`. The trunk is addressed by its LiveKit `trunk_id`. A callops client error (e.g. `404 Trunk not found`, `422`) is passed through with its status and detail; an unreachable callops returns `502`; an unconfigured callops returns `503`.

#### Scenario: Edit sends a partial PATCH
- **WHEN** the user changes one or more fields of an existing, provisioned trunk and saves
- **THEN** a single `PATCH /api/trunks/{trunk_id}` request carries only the changed fields and proxies to callops `PATCH /livekit/trunks/{trunk_id}`, and no `POST /livekit/trunks` (create) is issued

#### Scenario: Unchanged password is omitted
- **WHEN** the user saves an edit without re-entering the auth password
- **THEN** `auth_password` is omitted from the PATCH body (it is treated as unchanged), not sent blank

#### Scenario: Un-provisioned trunk cannot be edited upstream
- **WHEN** the trunk has no LiveKit `trunk_id` (never successfully created upstream)
- **THEN** the edit is blocked with a clear message and no callops PATCH is attempted

#### Scenario: callops 404 passes through
- **WHEN** callops returns `404 Trunk not found` for the PATCH
- **THEN** the proxy returns `404` with the detail so the dashboard can surface that the trunk no longer exists upstream

### Requirement: Trunk delete through callops DELETE

The dashboard SHALL delete a SIP outbound trunk by calling `DELETE /api/trunks/{trunk_id}`, which proxies server-side to callops `DELETE /livekit/trunks/{trunk_id}`, rather than removing it only from local browser state. Deletion is confirmed by the user first. On success the local store row is removed to mirror callops; on a callops error the row is kept and the error surfaced.

#### Scenario: Delete calls callops
- **WHEN** the user confirms deletion of a provisioned trunk
- **THEN** a `DELETE /api/trunks/{trunk_id}` request proxies to callops `DELETE /livekit/trunks/{trunk_id}` and, on `200 {deleted:true}`, the row is removed locally

#### Scenario: Un-provisioned trunk delete is client-only
- **WHEN** the user deletes a trunk that has no LiveKit `trunk_id`
- **THEN** the row is removed from the local store only and no callops DELETE is attempted

#### Scenario: callops error keeps the row
- **WHEN** callops returns an error (e.g. `404`, `502`, or `503` unconfigured) for the delete
- **THEN** the local row is NOT removed and the error is surfaced to the user
