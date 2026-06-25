## Why

Cale's `expand-callops-operational-api` merge (callops `origin/main`, 2026-06-25) added real `PATCH /livekit/trunks/{trunk_id}` and `DELETE /livekit/trunks/{trunk_id}` endpoints. The dashboard predates them: it re-POSTs `POST /livekit/trunks` to "edit" a trunk — which risks creating a **duplicate** LiveKit trunk on every save — and deletes trunks only from browser localStorage. LiveKit trunks are callops-owned control-plane state, so under the locked FE-zero-control split every trunk mutation must flow through callops.

Two dashboard-side crutches also let the FE write campaign **lifecycle** state directly: a dev-only "callops unset → write `campaigns.status`" fallback in the control proxy, and `status` on the `PUT /api/campaigns/{id}` allowed-fields list. The same principle forbids the dashboard writing lifecycle state behind callops' back. This change brings trunk editing/deletion onto the real callops endpoints and fences the direct control-state writes, so the implementation is fully on par with "callops owns all control."

## What Changes

- Add `PATCH /api/trunks/{trunk_id}` → callops `PATCH /livekit/trunks/{trunk_id}` (partial update) and `DELETE /api/trunks/{trunk_id}` → callops `DELETE /livekit/trunks/{trunk_id}`, server-side so `CALLOPS_WEBHOOK_SECRET` never reaches the browser.
- Trunk **edit** uses PATCH (only changed fields) instead of a re-POST create; trunk **delete** calls callops DELETE instead of mutating localStorage only. Both key on the LiveKit `trunk_id` (`ST_…`); un-provisioned trunks (no `trunk_id`) are guarded with a clear message.
- Supersedes the `callops-frontend-redesign` assumption that callops has no trunk update endpoint (the "re-POST create = update" path and its comment are now stale).
- Fence direct control-state writes: remove `status` from the `PUT /api/campaigns/{id}` allowed-fields list (lifecycle is owned by the row action buttons → callops control proxy), and gate the local `campaigns.status` mirror fallback to non-production.

## Capabilities

### New Capabilities
- `telephony-trunk-crud`: dashboard trunk edit and delete flow through callops `PATCH`/`DELETE /livekit/trunks/{trunk_id}`, keyed on the LiveKit trunk id, with un-provisioned trunks guarded and callops errors passed through.
- `campaign-control-integrity`: the dashboard never writes campaign lifecycle (`status`) state directly — lifecycle changes go through the callops control proxy, and the local mirror fallback exists only outside production.
