## Why

EVRA AVM currently routes outbound PSTN calls through LiveKit SIP trunks configured per carrier. LiveKit is the right runtime for rooms, agent dispatch, media, and webhooks — but it is the wrong long-term control plane for SIP trunking, multi-carrier routing, and South African/local provider support. Introducing [Routr](https://routr.io/docs/2.11.5/overview/introduction) as a dedicated SIP signaling and carrier-routing layer restores clean separation of concerns: EVRA owns campaigns and routing intent, Routr owns SIP routing, LiveKit owns agent/media sessions.

Milestone 1 (M1) proves this path with minimal scope: outbound only, one Routr instance, one carrier trunk, default outbound route, and per-campaign parallel migration alongside the existing LiveKit-direct path.

## What Changes

- Add `campaigns.routing_mode` (`legacy` | `routr`) so campaigns can dial via the existing LiveKit carrier trunk path or the new LiveKit → Routr → carrier path without a deploy-level cutover
- Add `LIVEKIT_SIP_ROUTR_TRUNK_ID` env var for the LiveKit outbound trunk that points at Routr; keep `LIVEKIT_SIP_OUTBOUND_TRUNK_ID` as the legacy default/fallback
- Branch trunk resolution in the dial path: `routing_mode = 'legacy'` preserves current `resolveTrunkId()` behavior; `routing_mode = 'routr'` uses the Routr-facing LiveKit trunk
- Document and validate Routr staging infrastructure (dedicated VPS, public IP, SIP ports) separate from the Next.js production deployment behind Cloudflare Tunnel
- Manually configure Routr (Peer for LiveKit, one carrier Trunk — Utility Connect or equivalent, default outbound route) for M1; no Settings UI sync or `@routr/sdk` integration in M1
- Document M1 definition of done, rollback procedure, and deferred milestones (provider sync, per-campaign carrier selection, inbound, HA)

## Capabilities

### New Capabilities

- `routr-outbound-routing`: Campaign routing mode (`legacy` | `routr`), dual LiveKit trunk env vars, trunk resolver branching, M1 validation and rollback requirements for outbound calls through Routr

### Modified Capabilities

<!-- None — outbound dialing behavior is net-new at the spec level; legacy path requirements are preserved via routing_mode = 'legacy' -->

## Impact

- **Database**: Supabase migration adding `campaigns.routing_mode` (default `legacy`)
- **Application**: `lib/outbound-call.ts` trunk resolver; `app/api/campaigns/[id]/dial/route.ts`; `scripts/dial-outbound.ts`; `.env.local.example`
- **Infrastructure**: New Routr staging VPS (not in EVRA compose); manual Routr + LiveKit trunk configuration documented in design/tasks
- **Unchanged for M1**: LiveKit webhooks (`/api/livekit/webhook`), agent results (`/api/calls/result`), simulator mode, Settings UI provider management, `voip_providers` sync to Routr
- **Reference**: `infrastructure/routr_integration.md` remains the long-term integration guide; this change scopes M1 only
