## Context

`callops-frontend-redesign` wired the dashboard→callops trunk proxies on the assumption (design.md, task 6.5) that callops exposes a single idempotent `POST /livekit/trunks` and **no** separate update endpoint, so trunk "edit" re-POSTs the create body. Cale's `expand-callops-operational-api` merge replaced that reality: callops `origin/main` now has `GET/POST/PATCH/DELETE /livekit/trunks[/{trunk_id}]`. Verified contract:

- `PATCH /livekit/trunks/{trunk_id}` — body `{name?, address?, numbers?, auth_username?, auth_password?}`, partial; at least one field or `422`; `200 → {trunk_id, name, address, numbers, auth_username}`; `404 {detail:"Trunk not found"}`.
- `DELETE /livekit/trunks/{trunk_id}` — `200 → {deleted: true, trunk_id}`; `404`.

Auth is the same `X-Webhook-Secret` header as the existing proxies.

## Goals / Non-Goals

**Goals:**
- Trunk edit/delete flow through callops PATCH/DELETE; no more duplicate-on-edit.
- The dashboard cannot write campaign lifecycle (`status`) state directly in production.

**Non-Goals:**
- Persisting trunk on/off `enabled` (still no `sip_trunks.enabled` column — unchanged from `callops-frontend-redesign`).
- SIP providers / dispatch rules / agents CRUD (still client-side mock — callops exposes no endpoints for them).
- Migrating campaign/company CRUD to callops (callops owns control, not data CRUD; the dashboard keeps authoring those in Supabase).

## Decisions

- **Address trunks by the LiveKit `trunk_id` (`ST_…`), not our integer `sip_trunks.id`.** callops addresses trunks by their LiveKit id; the telephony store already carries `trunk_id` from the create response. The proxy route is `app/api/trunks/[trunk_id]/route.ts` (new dynamic segment) for PATCH/DELETE.
- **PATCH sends only changed fields.** A blank `auth_password` means "unchanged" and is omitted (callops never returns it, so we cannot diff it). If nothing changed, skip the call (callops would 422 on an empty body).
- **Un-provisioned trunks (no `trunk_id`) are client-only.** They cannot be PATCHed/DELETEd upstream; edit/delete on them is blocked with a clear message (they exist only in the local store until a successful create returns a `trunk_id`).
- **Fence, don't delete, the dev fallback.** The local "callops unset → write `campaigns.status`" mirror stays for local dev (no callops running), but is gated to `NODE_ENV !== 'production'`; in production an unconfigured callops returns an error instead of writing lifecycle state.
- **Remove `status` from the PUT allow-list** so even a crafted PUT cannot set lifecycle; the only path to a status change is the control proxy.

## Risks / Trade-offs

- **DELETE is destructive** — it removes the LiveKit trunk and any future call referencing it fails. Mitigated by the existing `window.confirm` guard in the CRUD section.
- **Removing `status` from PUT** could break a caller that set status via PUT — audit shows only the row action buttons change status (via the control proxy); the Edit Campaign dialog never sends it. Low risk.
- **callops 404 on edit/delete** (trunk deleted upstream out-of-band) passes through so the UI can reconcile a stale row rather than silently succeeding.
