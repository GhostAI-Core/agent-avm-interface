## Why

The project is pivoting away from Fonoster Routr as the SIP routing layer between LiveKit and PSTN carriers. Routr was integrated across infrastructure, backend sync, UI, database schema, and deployment — leaving dead code and operational burden if we keep it while pursuing a different telephony direction. A deliberate, inventory-driven removal avoids orphaned env vars, broken deploy steps, and half-maintained carrier sync paths.

## What Changes

- **BREAKING**: Remove the `routr` campaign routing mode; all outbound calls use the legacy LiveKit trunk resolution path only.
- **BREAKING**: Remove Docker services `agent-avm-sip-routr`, `agent-avm-sip-routr-bootstrap`, and volume `routr-pgdata` from `docker-compose.yml`.
- **BREAKING**: Delete Routr API routes (`/api/routr/*`) and stop syncing `voip_providers` / LiveKit peer config to Routr on create/update.
- Delete the entire `lib/routr/` module (14 files), `infrastructure/routr/` (bootstrap, config templates, Dockerfile), and Routr-specific scripts/tests.
- Remove `@routr/sdk` dependency, npm scripts (`routr:*`, `test:routr*`), and `serverExternalPackages` entries in `next.config.ts`.
- Strip Routr UI from Settings (status card, LiveKit peer sync, carrier “sync to Routr”), and routing-mode selectors from campaign create/edit flows.
- Simplify outbound trunk resolution in `lib/outbound-call.ts` — drop `LIVEKIT_SIP_ROUTR_TRUNK_ID`, `routrTrunkConfigError`, and `CampaignRoutingMode = 'routr'`.
- Database migration to drop Routr-specific columns (`campaigns.routing_mode`, `voip_providers.routr_*`, `sync_status`, `sync_error`, `last_synced_at`) and reset any `routing_mode = 'routr'` campaigns to legacy behavior before column drop.
- Remove Routr env vars from `.env.example`, deploy workflow bootstrap steps, and Routr documentation files.
- Simplify CLI dial scripts: remove `--route routr` / `dial:route` Routr path (or collapse to legacy-only).
- **Retain (for now)**: `voip_providers` SIP credential fields and carrier CRUD UI — relabel without Routr sync semantics so they can support the next direction; exact shape decided in design.

## Capabilities

### New Capabilities

- `legacy-outbound-calling`: Outbound SIP uses LiveKit trunks only (`campaigns.sip_trunk_id` → `sip_trunks` → `LIVEKIT_SIP_OUTBOUND_TRUNK_ID`); no intermediate SIP proxy.
- `voip-provider-config`: Carrier/provider records stored in Supabase for operator configuration without external Routr sync.

### Modified Capabilities

- _(none — no existing `openspec/specs/` baseline in this repo)_

## Impact

### Code inventory (Routr touchpoints)

| Area | Files / locations |
|------|---------------------|
| **Core SDK module** | `lib/routr/*` (14 files: client, sync-*, upsert-*, find-refs, mask-provider, inbound-uri, resolve-contact-addr, peer-credentials) |
| **Outbound / LiveKit** | `lib/outbound-call.ts` (`CampaignRoutingMode`, `routrTrunkId`, `routrTrunkConfigError`, routr branch in `resolveTrunkWithSource`); `lib/livekit.ts` re-exports |
| **API routes** | `app/api/routr/status/route.ts`, `app/api/routr/livekit-peer/route.ts`; `app/api/providers/route.ts`, `app/api/providers/[id]/route.ts` (Routr sync on write); `app/api/campaigns/route.ts`, `app/api/campaigns/[id]/route.ts` (`routing_mode`); `app/api/campaigns/[id]/dial/route.ts` (`routrTrunkConfigError`) |
| **Frontend** | `components/SettingsView.tsx` (Routr status, LiveKit peer card, carrier Routr sync); `components/CampaignModal.tsx`, `components/CampaignActionDialog.tsx` (routing mode selector) |
| **Types** | `lib/types/voip-provider.ts` (`RoutrSyncStatus`, `ROUTE_LIVEKIT_SETTINGS_KEY`, routr refs); `types/index.ts` (`CampaignRoutingMode`, `routing_mode` on Campaign) |
| **Infrastructure** | `docker-compose.yml` (3 services + volume + `ROUTR_API_ENDPOINT` on web); `infrastructure/routr/*`; `.github/workflows/deploy-agent-avm.yml` (bootstrap build/run) |
| **Scripts / CLI** | `scripts/test-routr-outbound.ts`, `scripts/dial-route.ts`, `scripts/dial-cli-shared.ts` (`--route routr`), `scripts/dial-outbound.ts` |
| **Tests** | `tests/lib/routr/resolve-contact-addr.test.ts` |
| **Database** | `supabase/migrations/20260615120000_campaign_routing_mode.sql`, `20260615140000_voip_provider_carrier.sql`; `schema.sql` mirrors |
| **Config** | `package.json` (dependency + 9 scripts), `package-lock.json`, `next.config.ts` (`serverExternalPackages`), `.env.example`, `.env.local.example` |
| **Docs** | `docs/routr-frontend-integration.md`, `docs/routr-call-flow-test.md`, `infrastructure/routr_integration.md`, `infrastructure/routr-m1-staging.md`, sections in `README.md`, `docs/README.md`, `infrastructure/deploy/runbook.md` |

### Dependencies & ops

- npm: `@routr/sdk`, transitive `@routr/common`, gRPC packages used only for Routr
- Docker image: `fonoster/routr-one:latest`
- Deploy host: port 51908 (Routr admin API), bootstrap profile, `ROUTR_PUBLIC_IP` for `EXTERNAL_ADDRS`
- LiveKit: `LIVEKIT_SIP_ROUTR_TRUNK_ID` trunk becomes unused; campaigns on routr mode must be migrated before deploy

### Systems no longer involved

- Routr Postgres (`routr-pgdata`)
- `@routr/ctl` CLI (used via npx in npm scripts)
- Bootstrap container applying peers/trunks/numbers to Routr API
