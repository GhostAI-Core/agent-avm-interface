## 1. Database and types

- [x] 1.1 Add Supabase migration `voip_providers` carrier columns (`slug`, `provider_type`, `sip_*`, `routr_*_ref`, `sync_*`)
- [x] 1.2 Update `schema.sql` with extended `voip_providers` definition
- [x] 1.3 Add TypeScript types `VoipProvider`, `RoutrSyncStatus`, `CarrierProviderForm` in `lib/types/` or adjacent module

## 2. Routr SDK library (shared with bootstrap)

- [x] 2.1 Add `@routr/sdk` to main `package.json`
- [x] 2.2 Create `lib/routr/client.ts` — endpoint normalize, `insecure` client opts from `ROUTR_API_ENDPOINT`
- [x] 2.3 Extract `lib/routr/resolve-contact-addr.ts` from bootstrap (20-char limit, DNS resolve)
- [x] 2.4 Extract `lib/routr/upsert.ts` — generic upsert + `ALREADY_EXISTS` fallback helpers
- [x] 2.5 Implement `lib/routr/sync-carrier.ts` — Credentials + Trunk from `VoipProvider`
- [x] 2.6 Implement `lib/routr/sync-livekit-peer.ts` — Peer + optional ACL/Credentials from platform settings
- [x] 2.7 Refactor `infrastructure/routr/bootstrap-apply.cjs` to call shared logic or duplicate minimal thin wrapper (keep Docker bootstrap working)

## 3. API routes

- [x] 3.1 Extend `GET /api/providers` — return new columns (mask `sip_password`)
- [x] 3.2 Replace `POST /api/providers` body with carrier SIP fields; admin-only; trigger sync after insert
- [x] 3.3 Add `PATCH /api/providers/[id]` — update + re-sync
- [x] 3.4 Add `GET /api/routr/status` — list peer + trunks via SDK (admin-only)
- [x] 3.5 Add `GET/PUT /api/routr/livekit-peer` — platform settings in `system_settings` key `routr_livekit_peer` (admin-only)
- [x] 3.6 Return clear errors when Routr unreachable (503, `sync_status = error`)

## 4. Settings UI

- [x] 4.1 Redesign `SettingsView` carrier form: name, type, slug, sip host/port, username, password, send register
- [x] 4.2 Show sync status chip (`pending` / `synced` / `error`) and `sync_error` message per provider
- [x] 4.3 Add **Platform → LiveKit SIP** card: SIP host, optional CIDRs, optional password
- [x] 4.4 Add read-only **Routr status** panel (peer + trunks from `/api/routr/status`)
- [x] 4.5 Client-side validation: slug format, port range, host:port hint (no `sip:` prefix)

## 5. Campaign UI

- [x] 5.1 Add `routing_mode` select to campaign create/edit (`legacy` | `routr`)
- [x] 5.2 Persist `routing_mode` via campaign API / Supabase update
- [x] 5.3 Show helper text when `routr` selected (requires `LIVEKIT_SIP_ROUTR_TRUNK_ID` on server)

## 6. Documentation and env

- [x] 6.1 Update `.env.example` comments for M2 (provider sync vs bootstrap fallback)
- [x] 6.2 Update `infrastructure/routr_integration.md` §8 with implemented sync paths (or pointer to `lib/routr/`)
- [x] 6.3 Update `infrastructure/deploy/cursor-server-verify.md` — optional check for provider sync_status

## 7. Verification

- [x] 7.1 Unit tests for `resolveContactAddr` (long hostname, IP, failure)
- [x] 7.2 Unit tests for `sync-carrier` payload shape (`transport: UDP`, `inboundUri`)
- [ ] 7.3 Manual: save Twilio provider in UI → `rctl trunks get` shows updated trunk
- [ ] 7.4 Manual: toggle campaign to `routr` in UI → dial uses Routr path
- [ ] 7.5 Manual: engineer role cannot POST `/api/providers`
