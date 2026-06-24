## 1. Spikes (open questions — not M1 blockers)

- [x] 1.1 Spike Utility Connect SIP: host, auth model (credentials vs IP), allowed IPs, caller ID rules, test DID/from number
- [x] 1.2 Spike LiveKit → Routr Peer shape: REGISTER vs `contactAddr`, LiveKit SIP region vs Routr VPS placement
- [x] 1.3 Spike RTP/media path: confirm Routr signaling-only; verify bidirectional audio LiveKit ↔ carrier without RTPEngine
- [x] 1.4 Spike ZA caller ID: From header and P-Asserted-Identity requirements for Utility Connect

## 2. Schema — routing mode

- [x] 2.1 Add Supabase migration: `campaigns.routing_mode VARCHAR` with CHECK (`legacy`, `routr`), default `legacy`
- [x] 2.2 Update `schema.sql` to reflect `routing_mode` column and comment
- [x] 2.3 Verify existing campaigns receive `routing_mode = 'legacy'` after migration

## 3. Resolver design and implementation

- [x] 3.1 Document trunk resolution branching in `lib/outbound-call.ts` (legacy path unchanged; routr path uses `LIVEKIT_SIP_ROUTR_TRUNK_ID`)
- [x] 3.2 Implement `resolveTrunkId()` branch on `campaign.routing_mode`
- [x] 3.3 Return clear error when `routing_mode = 'routr'` and `LIVEKIT_SIP_ROUTR_TRUNK_ID` is unset (no silent fallback to legacy)
- [x] 3.4 Update `app/api/campaigns/[id]/dial/route.ts` to pass `routing_mode` from campaign row into dial target
- [x] 3.5 Update `scripts/dial-outbound.ts` to load and respect `routing_mode`

## 4. Environment variables

- [x] 4.1 Add `LIVEKIT_SIP_ROUTR_TRUNK_ID` to `.env.local.example` with routing-mode documentation
- [x] 4.2 Document both trunk env vars in README or `docs/livekit-outbound-integration.md` (legacy vs routr semantics)
- [ ] 4.3 Set `LIVEKIT_SIP_ROUTR_TRUNK_ID` on staging server env alongside existing `LIVEKIT_SIP_OUTBOUND_TRUNK_ID`

## 5. Routr staging infrastructure

- [ ] 5.1 Provision dev/staging VPS with public IP and firewall rules for SIP (:5060 UDP/TCP) and APIServer (:51908)
- [x] 5.2 Deploy Routr (`fonoster/routr-one` or Connect) with restart policy and basic logging
- [ ] 5.3 Create Routr Peer for LiveKit Cloud SIP endpoint (per spike 1.2 outcome)
- [x] 5.4 Document Routr staging host, ports, and manual config steps in `infrastructure/` (append to or reference `routr_integration.md`)

## 6. LiveKit Routr trunk

- [ ] 6.1 Create LiveKit outbound SIP trunk pointing at Routr staging host (separate from any legacy carrier trunk)
- [ ] 6.2 Record trunk id as `LIVEKIT_SIP_ROUTR_TRUNK_ID` in staging env
- [ ] 6.3 Verify LiveKit SIP can reach Routr EdgePort (OPTIONS or test INVITE in LiveKit dashboard)

## 7. Manual carrier trunk (Utility Connect)

- [ ] 7.1 Manually configure Utility Connect (or first available carrier) Trunk in Routr with credentials and outbound URIs
- [ ] 7.2 Configure default outbound route so `peer-to-pstn` from LiveKit Peer uses this trunk
- [ ] 7.3 Validate caller ID / From header behavior on a test INVITE (per spike 1.4)

## 8. CLI validation

- [ ] 8.1 Set one test campaign to `routing_mode = 'routr'` via Supabase SQL/admin
- [ ] 8.2 Run `npm run dial` against test campaign; confirm INVITE reaches Routr logs
- [ ] 8.3 Confirm real +27 handset rings; agent joins room; audio both ways

## 9. UI validation

- [ ] 9.1 Start test campaign from UI (Play); confirm dial API uses routr trunk path
- [ ] 9.2 Confirm `call_records` row created with pending outcome and correct room name
- [ ] 9.3 Confirm dashboard/logs show call state updates via polling

## 10. Logging, webhooks, and agent result

- [ ] 10.1 Confirm LiveKit webhooks update `call_records` (connected, finished, egress events)
- [ ] 10.2 Confirm agent `POST /api/calls/result` succeeds and intent/outcome reporting works
- [ ] 10.3 Confirm recording/egress uploads when `LIVEKIT_RECORD_*` is configured

## 11. Rollback validation

- [ ] 11.1 Set test campaign `routing_mode = 'legacy'`; confirm next dial uses legacy trunk resolution
- [x] 11.2 Document rollback procedure (SQL one-liner + env var reference) in design or deploy docs
- [ ] 11.3 Confirm legacy-path campaign still dials successfully with no code deploy

## 12. M1 sign-off

- [ ] 12.1 Walk M1 definition-of-done checklist (design.md / spec) and record pass/fail per item
- [x] 12.2 Note known limitations (single Routr instance, no provider sync, default carrier only) for M2 planning

## Deferred — not M1 (reference only)

The following are explicitly out of M1 scope. Track in future OpenSpec changes:

- Settings UI provider sync to Routr (`@routr/sdk`)
- Custom SIP headers and Routr middleware/processors
- Per-campaign carrier selection beyond `legacy` vs `routr`
- Inbound DIDs and callback routing
- HA/failover, Kubernetes/Helm, automated carrier provisioning
- Campaign Settings UI toggle for `routing_mode` (unless added opportunistically)
