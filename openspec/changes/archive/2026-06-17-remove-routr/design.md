## Context

Routr was added as an M1/M2 milestone: a `fonoster/routr-one` container on the Docker network, bootstrapped via `@routr/sdk`, with campaign-level `routing_mode` (`legacy` | `routr`) selecting either direct LiveKit carrier trunks or a single LiveKit trunk pointing at Routr. M2 extended this with Settings UI, `voip_providers` carrier CRUD synced to Routr, and API routes under `/api/routr/*`.

The team is changing telephony direction and will not operate Routr in production. The codebase must be reduced to legacy LiveKit outbound only, with carrier configuration kept in Supabase for future use but not pushed to an external SIP router.

## Goals / Non-Goals

**Goals:**

- Remove all Routr runtime dependencies (Docker services, npm package, bootstrap, env vars).
- Single outbound path: LiveKit `createSipParticipant` via `resolveTrunkId` legacy logic only.
- Clean deploy workflow without bootstrap profile or Routr health assumptions.
- Database schema without Routr-specific columns; existing `routing_mode = 'routr'` campaigns safe after migration.
- Settings UI without Routr status/sync; carrier list remains as local config store.

**Non-Goals:**

- Implementing the replacement telephony architecture (new SIP path, Twilio-only, etc.).
- Deleting `voip_providers` table or SIP credential columns (only Routr sync metadata).
- Removing `sip_trunks` or per-campaign `sip_trunk_id` legacy model.
- Production data migration for carriers already in Routr (ops will decommission the container separately).

## Decisions

### 1. Removal order: leaf → root

Delete in dependency order to keep the app buildable at each step:

1. Tests and scripts that only serve Routr (`test-routr-outbound.ts`, `tests/lib/routr/*`, `routr:*` npm scripts).
2. API routes `app/api/routr/*` and Routr imports from `app/api/providers/*`.
3. `lib/routr/*` entire directory.
4. `infrastructure/routr/*` and docker-compose services.
5. Frontend Routr sections; simplify campaign forms.
6. `lib/outbound-call.ts` routr branch and types.
7. Package/config cleanup (`package.json`, `next.config.ts`, env examples).
8. New Supabase migration + `schema.sql` update.
9. Documentation deletion/update.

**Alternative considered:** Feature-flag Routr off. Rejected — adds complexity with no planned re-enable.

### 2. Keep `voip_providers` SIP fields, drop Routr sync columns

Retain `name`, `slug`, `provider_type`, `sip_host`, `sip_port`, `sip_username`, `sip_password`, `send_register` for operator-managed carrier records.

Drop: `routr_trunk_ref`, `routr_credentials_ref`, `sync_status`, `sync_error`, `last_synced_at`.

Providers API becomes straight Supabase CRUD using a slim type (no `syncProviderRow`, no `maskProviderForClient` Routr masking).

**Alternative considered:** Delete entire carrier UI. Rejected — useful config surface for next direction; low cost to keep CRUD without sync.

### 3. Drop `campaigns.routing_mode` column entirely

No UI selector; no CLI `--route routr`. Migration:

```sql
-- Ensure no routr campaigns block dial (informational only before drop)
UPDATE campaigns SET routing_mode = 'legacy' WHERE routing_mode = 'routr';
ALTER TABLE campaigns DROP COLUMN routing_mode;
```

**Alternative considered:** Keep column with only `legacy` allowed. Rejected — dead schema.

### 4. Remove LiveKit peer settings row (`system_settings` key `routr_livekit_peer`)

The LiveKit peer card in Settings exists only to push peer config to Routr. Remove UI and API; env-based LiveKit trunk config remains via `LIVEKIT_SIP_OUTBOUND_TRUNK_ID` / campaign trunk.

### 5. CLI simplification

- Remove `scripts/test-routr-outbound.ts` and `npm run test:routr*`.
- Merge `dial-route.ts` behavior into `dial-outbound.ts` or keep `dial:route` as legacy-only alias that ignores `--route` (deprecation message). Prefer **delete `dial-route.ts`** and `--route` flag from `dial-cli-shared.ts`.

### 6. Deploy workflow

Remove from `.github/workflows/deploy-agent-avm.yml`:

- `docker compose --profile bootstrap build/run agent-avm-sip-routr-bootstrap`

Remove `depends_on: agent-avm-sip-routr` from web service.

### 7. `next.config.ts`

Remove `serverExternalPackages` entries that exist only for `@routr/sdk` (`@routr/sdk`, `@routr/common`, and optionally gRPC if unused elsewhere — verify before removing gRPC packages).

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Campaigns still set to `routing_mode = routr` in DB | Migration forces `legacy` before column drop; verify dial works post-deploy |
| Deploy host still runs Routr container from old compose | Document one-time `docker compose down` + volume prune; not automated in this change |
| Carrier UI shows stale sync chips | Remove sync UI in same PR as column drop |
| `LIVEKIT_SIP_ROUTR_TRUNK_ID` referenced in LiveKit cloud | Ops removes/repoints trunk in LiveKit console separately |
| Partial removal leaves broken imports | Follow removal order; run `npm run build` and `npm test` after each layer |

## Migration Plan

1. **Pre-deploy (staging):** Apply DB migration; deploy code without Routr services; run outbound test call on legacy campaign.
2. **Deploy:** Standard `docker compose up` — no bootstrap profile; web container no longer needs `ROUTR_API_ENDPOINT`.
3. **Post-deploy:** Stop/remove `agent-avm-sip-routr` container and `routr-pgdata` volume on host if present.
4. **Rollback:** Revert git + redeploy previous image; re-run Routr bootstrap from previous compose (only if Routr direction resumed — unlikely).

## Open Questions

- **Carrier UI scope:** Keep full “Add carrier” form or reduce to read-only list until new architecture is defined? *Default: keep CRUD, remove sync.*
- **`utility_connect` provider type:** Added for Routr carrier bootstrap — keep in enum or restrict to twilio/telnyx/sangoma? *Default: keep for existing rows.*
- **Docs:** Delete Routr docs entirely vs. archive under `docs/archive/`? *Default: delete Routr-specific files; trim README references.*
