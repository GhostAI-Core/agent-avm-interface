## Why

M1 Routr outbound routing is deployed and bootstrap applies LiveKit Peer + carrier Trunk from `.env`, but the EVRA frontend still treats “VoIP providers” as generic API keys with no link to Routr’s real resource model (Peer, Credentials, Trunk, ACL). Operators cannot view, edit, or sync carrier SIP config from Settings; campaign routing mode exists in the database but has no UI. We need M2 so the admin surface matches Routr and Supabase becomes the source of truth for carrier trunks while keeping LiveKit `ST_…` ids separate.

## What Changes

- Extend `voip_providers` with SIP trunk fields (host, port, username, password, slug, type, Routr refs) and migrate away from misleading `api_key` / `api_secret` labels for carriers
- Add server-side `@routr/sdk` sync: saving a provider upserts Routr **Credentials** + **Trunk** (same shape as `bootstrap-apply.cjs` for Twilio)
- Redesign Settings **VoIP Provider** form for carrier SIP fields with validation (transport `UDP`, `contactAddr` 20-char limit documented, password handling)
- Add read-only Routr status panel (peer + trunks via SDK or cached refs) for admins
- Add platform-level LiveKit peer settings (SIP host, optional ACL CIDRs, optional peer password) with sync to Routr **Peer** / **ACL**
- Expose `campaigns.routing_mode` (`legacy` | `routr`) in campaign create/edit UI
- Store `routr_trunk_ref` and `routr_credentials_ref` on provider rows; use `extended.evraProviderId` on Routr entities for idempotent upsert
- **BREAKING (admin UX)**: `POST /api/providers` payload shape changes from `{ name, api_key, api_secret }` to carrier SIP fields; existing rows need migration or re-entry

## Capabilities

### New Capabilities

- `routr-provider-sync`: Backend sync from `voip_providers` to Routr Credentials + Trunk; idempotent upsert; error surfacing to API
- `routr-platform-settings`: Admin UI + API for LiveKit Peer / optional ACL; env fallback until saved
- `voip-provider-carrier-schema`: Supabase schema and types for extended `voip_providers` and Routr ref columns

### Modified Capabilities

- `supabase-database`: `voip_providers` table gains SIP carrier columns and Routr ref columns; migration required
- `routr-outbound-routing`: Campaign UI exposes `routing_mode`; documentation that routr mode still uses env `LIVEKIT_SIP_ROUTR_TRUNK_ID` until per-campaign LiveKit trunk selection is added (deferred)

## Impact

- **Database**: New Supabase migration on `voip_providers`; optional `campaigns` UI-only exposure of existing `routing_mode` column
- **Backend**: `lib/routr/` client + sync modules; extend `app/api/providers/route.ts`; new `app/api/routr/` or `app/api/settings/routr/` routes for platform peer sync and status
- **Frontend**: `components/SettingsView.tsx`; campaign forms in `app/page.tsx` or campaign components
- **Dependencies**: `@routr/sdk` in web app image (not only bootstrap container); `ROUTR_API_ENDPOINT` already in compose
- **Infrastructure**: Bootstrap remains fallback for greenfield deploy; UI sync becomes primary after M2
- **Unchanged for this change**: Inbound Routr Numbers, per-campaign Routr trunk selection, multi-region HA, LiveKit webhook flow
