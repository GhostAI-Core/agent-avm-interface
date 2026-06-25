## 1. Trunk edit → callops PATCH

- [x] 1.1 Add `app/api/trunks/[trunk_id]/route.ts` with a `PATCH` handler → callops `PATCH /livekit/trunks/{trunk_id}` (X-Webhook-Secret, partial JSON body); 4xx pass-through with detail, 502 unreachable, 503 unconfigured
- [x] 1.2 `lib/telephony-mock.ts` `patchTrunk`: send only changed fields via the PATCH proxy; omit blank `auth_password`; address by `trunk_id`; mirror callops response into the local store
- [x] 1.3 Guard un-provisioned trunks (no `trunk_id`): block the edit with a clear message, no callops PATCH
- [x] 1.4 Remove the stale "re-POST create = update" path + comment from `app/api/trunks/route.ts` (saveTrunk) and `TrunksPanel` (edit now PATCHes via `editTrunk`, not `persist`)

## 2. Trunk delete → callops DELETE

- [x] 2.1 Add a `DELETE` handler to `app/api/trunks/[trunk_id]/route.ts` → callops `DELETE /livekit/trunks/{trunk_id}`
- [x] 2.2 `lib/telephony-mock.ts` `deleteTrunkRemote`: call the DELETE proxy (keep the `window.confirm` guard in CrudSection); remove the local row only on success, surface errors
- [x] 2.3 Guard un-provisioned trunks: delete from the local store only, no callops DELETE

## 3. Fence direct control-state writes

- [x] 3.1 Remove `status` from the allowed-fields list in `app/api/campaigns/[id]/route.ts` (PUT)
- [x] 3.2 Gate the local `campaigns.status` mirror fallback in `app/api/campaigns/[id]/[action]/route.ts` to `process.env.NODE_ENV !== 'production'`; return an error in production when callops is unconfigured

## 4. Validation

- [x] 4.1 `npx tsc --noEmit` clean across changed files
- [x] 4.2 `npx eslint` clean on changed files (no new findings vs baseline)
- [x] 4.3 `openspec validate callops-control-parity --strict`
- [ ] 4.4 Manual: edit a trunk → exactly one callops PATCH, no duplicate trunk created; delete → trunk gone in LiveKit; a PUT carrying `status` leaves status unchanged — PENDING (needs UI interaction against live callops)
- [x] 4.5 Confirm store rows carry `trunk_id` (create response provides it) so edit/delete can target it; un-provisioned rows are guarded — verified in code: `createTrunk` mirrors the returned `trunk_id`; `editTrunk`/`removeTrunk` guard on its absence
