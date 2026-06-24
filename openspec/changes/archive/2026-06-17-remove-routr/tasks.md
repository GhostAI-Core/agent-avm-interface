## 1. Database migration

- [x] 1.1 Add migration `supabase/migrations/*_remove_routr.sql`: `UPDATE campaigns SET routing_mode = 'legacy' WHERE routing_mode = 'routr'`; `ALTER TABLE campaigns DROP COLUMN routing_mode`; drop `voip_providers` columns `routr_trunk_ref`, `routr_credentials_ref`, `sync_status`, `sync_error`, `last_synced_at` and related CHECK constraints
- [x] 1.2 Update `schema.sql` to match (no `routing_mode`, no Routr columns on `voip_providers`)

## 2. Remove Routr module and API routes

- [x] 2.1 Delete directory `lib/routr/` (all 14 files)
- [x] 2.2 Delete `app/api/routr/status/route.ts` and `app/api/routr/livekit-peer/route.ts` (and empty parent dirs)
- [x] 2.3 Refactor `app/api/providers/route.ts` and `app/api/providers/[id]/route.ts`: remove `@/lib/routr/*` imports, `syncProviderRow`, `routr_unreachable` responses; plain CRUD only
- [x] 2.4 Remove `routing_mode` handling from `app/api/campaigns/route.ts` and `app/api/campaigns/[id]/route.ts`
- [x] 2.5 Remove `routrTrunkConfigError` check from `app/api/campaigns/[id]/dial/route.ts`

## 3. Simplify outbound / LiveKit layer

- [x] 3.1 In `lib/outbound-call.ts`: remove `routr` from `CampaignRoutingMode`, delete `routrTrunkId`, `routrTrunkConfigError`, routr branch in `resolveTrunkWithSource`, and `LIVEKIT_SIP_ROUTR_TRUNK_ID` from `TrunkSource`
- [x] 3.2 Update `lib/livekit.ts` re-exports (drop `routrTrunkConfigError` if exported)
- [x] 3.3 Slim `lib/types/voip-provider.ts`: remove `RoutrSyncStatus`, routr ref fields, `ROUTE_LIVEKIT_SETTINGS_KEY`, `LiveKitPeerSettings` if unused
- [x] 3.4 Update `types/index.ts`: remove `CampaignRoutingMode` routr variant and `routing_mode` from Campaign type

## 4. Frontend

- [x] 4.1 `components/SettingsView.tsx`: remove Routr status card, LiveKit peer sync section, sync chips/refs on carriers; relabel carrier form (no "sync to Routr")
- [x] 4.2 `components/CampaignModal.tsx`: remove routing mode `Select` and Routr helper text
- [x] 4.3 `components/CampaignActionDialog.tsx`: remove routing mode state/UI and `routing_mode` from PATCH body

## 5. Infrastructure and deploy

- [x] 5.1 `docker-compose.yml`: remove `agent-avm-sip-routr`, `agent-avm-sip-routr-bootstrap`, `routr-pgdata`, `ROUTR_API_ENDPOINT` on web, Routr `depends_on`
- [x] 5.2 Delete `infrastructure/routr/` directory (bootstrap, config templates, Dockerfile, docker-compose.yaml)
- [x] 5.3 `.github/workflows/deploy-agent-avm.yml`: remove bootstrap build/run steps and Routr comments

## 6. Scripts, tests, and package config

- [x] 6.1 Delete `scripts/test-routr-outbound.ts`, `scripts/dial-route.ts`, `tests/lib/routr/`
- [x] 6.2 Simplify `scripts/dial-cli-shared.ts` and `scripts/dial-outbound.ts`: remove `--route` / `routr` support
- [x] 6.3 `package.json`: remove `@routr/sdk` and scripts `routr:*`, `test:routr`, `test:routr:unit`, `dial:route` (if removed)
- [x] 6.4 Run `npm install` to refresh `package-lock.json`
- [x] 6.5 `next.config.ts`: remove `@routr/sdk`, `@routr/common` from `serverExternalPackages` (and gRPC entries if unused elsewhere)

## 7. Environment and documentation

- [x] 7.1 Remove Routr vars from `.env.example` and `.env.local.example` (`LIVEKIT_SIP_ROUTR_TRUNK_ID`, `ROUTR_*`)
- [x] 7.2 Delete `docs/routr-frontend-integration.md`, `docs/routr-call-flow-test.md`, `infrastructure/routr_integration.md`, `infrastructure/routr-m1-staging.md`
- [x] 7.3 Update `README.md`, `docs/README.md`, `infrastructure/deploy/runbook.md`, `infrastructure/deploy/cursor-server-verify.md` — remove Routr sections and env tables

## 8. Verification

- [x] 8.1 `npm run build` succeeds with no `@/lib/routr` or `@routr/sdk` references
- [x] 8.2 Grep repo for `routr`, `ROUTR`, `@routr` — only allowed in this OpenSpec change or git history
- [x] 8.3 Smoke test: create campaign, dial via API or `npm run dial`, confirm legacy trunk resolution
