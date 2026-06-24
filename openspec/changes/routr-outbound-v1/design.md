## Context

EVRA AVM is a Next.js outbound IVR campaign portal backed by Supabase. Outbound calls flow through `lib/outbound-call.ts`: `AgentDispatchClient.createDispatch()` then `SipClient.createSipParticipant()` using a LiveKit outbound trunk ID resolved from `campaigns.sip_trunk_id`, `sip_trunks`, or `LIVEKIT_SIP_OUTBOUND_TRUNK_ID`.

Today, carrier SIP credentials and trunking live in LiveKit Cloud. The long-term architecture (documented in `infrastructure/routr_integration.md`) places [Routr](https://routr.io/docs/2.11.5/overview/introduction) between LiveKit and PSTN carriers. Routr is a lightweight SIP proxy and Connect-mode routing framework — signaling only by default, not a media server.

EVRA AVM runs on a production Next.js container behind Cloudflare Tunnel. SIP infrastructure cannot share that networking model; Routr requires a dedicated host with a public IP and exposed SIP ports.

This design covers **Milestone 1 (M1) only**: prove outbound calls through Routr with parallel per-campaign migration and rollback.

## Goals / Non-Goals

**Goals:**

- Introduce Routr as the SIP signaling layer between LiveKit and the first carrier (Utility Connect or equivalent)
- Keep LiveKit responsible for rooms, agent dispatch, media, webhooks, and egress
- Add `campaigns.routing_mode` (`legacy` | `routr`) for parallel migration without big-bang cutover
- Preserve existing legacy trunk resolution when `routing_mode = 'legacy'`
- Use `LIVEKIT_SIP_ROUTR_TRUNK_ID` for Routr-facing campaigns; keep `LIVEKIT_SIP_OUTBOUND_TRUNK_ID` unchanged
- Document Routr staging setup, LiveKit trunk configuration, validation checklist, and rollback
- Meet M1 definition of done (real +27 handset call, full call lifecycle, rollback tested)

**Non-Goals (M1):**

- Settings UI provider sync to Routr
- `@routr/sdk` / `@routr/ctl` integration in application code
- Custom SIP headers or Routr processors/middleware
- Per-campaign carrier selection beyond `legacy` vs `routr` mode
- Inbound DIDs, callbacks, inbound routing
- HA, failover, Kubernetes/Helm
- Automated carrier provisioning
- Campaign Settings UI toggle for routing mode (DB/admin flag acceptable for M1)

## Architecture

### Layer separation

```
┌─────────────────────────────────────────────────────────────────────┐
│  EVRA AVM + Supabase                                                │
│  Campaigns, contacts, routing_mode, call_records, operator UI       │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ createDispatch + createSipParticipant
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LiveKit Cloud                                                      │
│  Agent workers, rooms, SIP module, webhooks, egress                  │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ SIP INVITE (routing_mode = 'routr')
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Routr (dedicated VPS)                                              │
│  EdgePort :5060, Connect processor, default outbound → carrier      │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ SIP INVITE
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Utility Connect (or first carrier)                                   │
│  PSTN → callee (+27…)                                               │
└─────────────────────────────────────────────────────────────────────┘
```

### Infrastructure split

```
  EVRA AVM (existing)              Routr (new, separate)
  ───────────────────              ─────────────────────
  Next.js on prod server           Dedicated VPS / SIP host
  Cloudflare Tunnel ingress        Public IP (no tunnel)
  No SIP ports                     :5060 UDP/TCP (SIP)
  Supabase external                :51908 TCP (APIServer, manual config)
```

M1 accepts a **dev/staging Routr VPS**. Production Routr eventually runs on a dedicated SIP host in or near a ZA-friendly region.

### Call flow (routing_mode = 'routr')

```
Operator Play
  → POST /api/campaigns/:id/dial
  → load campaign (routing_mode = 'routr')
  → resolveTrunkId() → LIVEKIT_SIP_ROUTR_TRUNK_ID
  → createDispatch(room, agent, metadata)     [unchanged]
  → createSipParticipant(ST_routr, phone, room) [Routr-facing trunk]
  → LiveKit SIP → Routr EdgePort
  → Routr peer-to-pstn → default carrier Trunk
  → Utility Connect → PSTN
  → agent joins room, webhooks update call_records
  → agent POSTs /api/calls/result
```

### Call flow (routing_mode = 'legacy')

Unchanged from today:

```
resolveTrunkId()
  → campaigns.sip_trunk_id (ST_… or sip_trunks lookup)
  → else LIVEKIT_SIP_OUTBOUND_TRUNK_ID
  → createSipParticipant(ST_carrier, phone, room)
  → LiveKit → carrier directly
```

## Decisions

### 1. Campaign routing mode (not wholesale resolver replacement)

Add `campaigns.routing_mode` with values `legacy` (default) and `routr`.

| Mode | Trunk resolution |
|------|------------------|
| `legacy` | Existing `resolveTrunkId()` — `sip_trunk_id`, `sip_trunks`, `LIVEKIT_SIP_OUTBOUND_TRUNK_ID` |
| `routr` | `LIVEKIT_SIP_ROUTR_TRUNK_ID` only (ignore per-carrier `sip_trunk_id` for M1) |

**Rationale:** Enables per-campaign parallel validation and rollback without code deploy. Setting `routing_mode` back to `legacy` restores prior behavior immediately.

**Alternative considered:** Replace all traffic via Routr in M1 — rejected because it removes safe rollback and blocks incremental validation.

### 2. Dual LiveKit trunk environment variables

| Variable | Purpose |
|----------|---------|
| `LIVEKIT_SIP_OUTBOUND_TRUNK_ID` | Legacy path — LiveKit trunk to carrier (unchanged) |
| `LIVEKIT_SIP_ROUTR_TRUNK_ID` | Routr path — LiveKit trunk pointing at Routr host |

Both may coexist in LiveKit Cloud. Legacy campaigns never reference the Routr trunk.

### 3. Routr configuration — manual for M1

M1 configures Routr via CLI or YAML apply on the staging VPS:

- **Peer** — LiveKit Cloud SIP endpoint (`contactAddr` if LiveKit does not REGISTER)
- **Trunk** — Utility Connect (or first carrier) with credentials and outbound URIs
- **Default outbound route** — all `peer-to-pstn` traffic uses this trunk

No application sync from `voip_providers` in M1.

**Rationale:** Proves signaling path before building sync UX and SDK integration.

### 4. No custom SIP headers in M1

Routr selects the default carrier trunk for all `peer-to-pstn` INVITEs from the LiveKit Peer. Per-campaign carrier selection deferred to Milestone 3.

**Alternative considered:** `X-Routr-Trunk-Ref` header from LiveKit — deferred pending LiveKit header support verification and Routr middleware need.

### 5. M1 routing_mode assignment — DB/admin flag

Set `campaigns.routing_mode = 'routr'` via Supabase SQL or admin tooling for the test campaign. Campaign Settings UI toggle deferred unless trivial.

### 6. Unchanged call lifecycle components

These require no M1 code changes:

- Room naming: `avm_<campaignId>_<contactId>_<random>`
- `POST /api/livekit/webhook`
- `POST /api/calls/result`
- Simulator when LiveKit env missing
- `startRoomRecording()` / egress

## Deferred Phases

| Phase | Scope |
|-------|-------|
| **M2 — Provider sync** | `@routr/sdk`, `lib/routr/`, Settings save → deliberate Sync to Routr, `routr_trunk_ref` on `sip_trunks`, sync status UI |
| **M3 — Per-campaign carrier** | Route profiles in Supabase, Routr trunk selection (headers or middleware), fallback routing |
| **M4 — Production hardening** | Prod Routr VPS, TLS SIP, monitoring/alerting, config backup, inbound DIDs |

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| RTP/media path issues between LiveKit and carrier via Routr | Routr is signaling-only; spike confirms media flows LiveKit ↔ carrier; add RTPEngine only if needed |
| LiveKit Peer shape unknown (REGISTER vs contactAddr) | Spike before LiveKit trunk creation; document working Peer config |
| Utility Connect SIP/auth/caller-ID rules unknown | Spike task; manual trunk config on staging |
| `routing_mode = 'routr'` but `LIVEKIT_SIP_ROUTR_TRUNK_ID` unset | Resolver returns clear error; dial route records failure on contact |
| Routr single-instance restart drops in-flight calls | Acceptable for M1; failed calls logged; campaign state must not corrupt |
| Dual config drift (future sync phases) | Out of M1 scope; M2 adds `routr_synced_at` and deliberate sync |
| ZA caller ID non-compliance | Spike From / P-Asserted-Identity; validate on real +27 test before production volume |

## Migration Plan

### Rollout

1. Deploy Routr on staging VPS; manually configure Peer + carrier Trunk
2. Create LiveKit outbound trunk `ST_routr` → Routr host (keep existing carrier trunks)
3. Add `LIVEKIT_SIP_ROUTR_TRUNK_ID` to server env alongside existing vars
4. Apply Supabase migration: `routing_mode` default `legacy`
5. Set one test campaign to `routing_mode = 'routr'`
6. Validate M1 checklist (CLI dial, UI dial, +27 handset, webhooks, agent result, egress)
7. Leave other campaigns on `legacy` until Routr path is signed off

### Rollback (per campaign, no deploy)

```sql
UPDATE campaigns SET routing_mode = 'legacy' WHERE id = <test_campaign_id>;
```

Campaign immediately resumes using `LIVEKIT_SIP_OUTBOUND_TRUNK_ID` / `sip_trunk_id` resolution. Routr can remain running; it simply receives no traffic from that campaign.

### Rollback (full)

- Set all campaigns to `legacy`
- Optionally remove `LIVEKIT_SIP_ROUTR_TRUNK_ID` from env (not required if unused)

## Open Questions

Record as spikes — not M1 blockers:

1. **Utility Connect SIP credentials** — host, username/password vs IP auth, allowed IPs, caller ID rules, test DID/from number
2. **LiveKit → Routr SIP behavior** — REGISTER vs `contactAddr` on Peer; required Routr Peer/Trunk shape; LiveKit SIP region vs Routr VPS region
3. **RTP/media path** — confirm Routr stays signaling-only; confirm bidirectional audio LiveKit ↔ carrier without RTPEngine
4. **ZA caller ID / headers** — From header, P-Asserted-Identity if required, Utility Connect validation rules
5. **M1 UI** — DB/admin flag sufficient; Campaign Settings toggle deferred unless low effort
