# Routr M1 — staging setup, spikes, rollback

Milestone 1 for the `routr-outbound-v1` OpenSpec change. See also [routr_integration.md](./routr_integration.md) for the long-term architecture.

## Architecture (M1)

```
EVRA AVM (Cloudflare Tunnel)
  → LiveKit createDispatch + createSipParticipant
  → LIVEKIT_SIP_ROUTR_TRUNK_ID (ST_… → Routr)
  → Routr peer-to-pstn (default carrier trunk)
  → Utility Connect / first carrier
  → +27 handset
```

Parallel migration: campaigns with `routing_mode = 'legacy'` keep using `LIVEKIT_SIP_OUTBOUND_TRUNK_ID` and direct carrier trunks.

## Open spikes (fill before first real call)

### 1. Utility Connect SIP

| Field | Value |
|-------|-------|
| SIP host | _TBD_ |
| Auth model | _credentials / IP ACL / both_ |
| Username / password | _TBD_ |
| Allowed source IPs (Routr VPS) | _TBD_ |
| Caller ID / From rules | _TBD_ |
| Test DID / from number | _TBD_ |

### 2. LiveKit → Routr Peer

| Field | Value |
|-------|-------|
| LiveKit SIP edge host | _from LiveKit Cloud dashboard_ |
| Peer uses REGISTER vs `contactAddr` | _TBD after test_ |
| LiveKit SIP region | _TBD_ |
| Routr VPS region | _prefer ZA-adjacent_ |

### 3. RTP / media path

| Check | Result |
|-------|--------|
| Routr remains signaling-only | _expected yes_ |
| Bidirectional audio without RTPEngine | _verify on first call_ |

### 4. ZA caller ID

| Check | Result |
|-------|--------|
| Required From header format | _TBD_ |
| P-Asserted-Identity required | _TBD_ |
| Utility Connect validation | _TBD_ |

## Server prerequisites (FreeSWITCH → Routr)

On the EVRA production host, **systemd FreeSWITCH** may already bind `5060`. Stop it before starting Routr:

```bash
sudo systemctl stop freeswitch
sudo systemctl disable freeswitch
sudo ss -tulpn | grep 5060 || echo "5060 free"
```

Set `ROUTR_PUBLIC_IP` in `.env` to the server **public** IPv4 (not `172.31.x.x`).

## Deploy Routr

From the repo root (same stack as EVRA web):

```bash
cd /opt/docker/production/evra_avm
# ROUTR_PUBLIC_IP in .env
docker compose up -d agent-avm-sip-routr
docker compose logs -f agent-avm-sip-routr
```

Service name on `shared` network: `agent-avm-sip-routr`.

Image: `fonoster/routr-one:latest` with restart policy `unless-stopped`.

## Manual Routr config (M1)

Use `@routr/ctl` against `insecure://<ROUTR_HOST>:51908`:

1. **Credentials** — carrier SIP auth (Utility Connect)
2. **ACL** — carrier source IPs if required
3. **Peer** — LiveKit Cloud SIP (`contactAddr` if LiveKit does not REGISTER)
4. **Trunk** — Utility Connect outbound URIs + credentials
5. **Default route** — `peer-to-pstn` from LiveKit Peer uses this Trunk

Detailed resource shapes: [routr_integration.md §6–8](./routr_integration.md).

## LiveKit Routr trunk

Create a **separate** outbound SIP trunk in LiveKit Cloud:

| Field | Value |
|-------|-------|
| Name | `evra-routr-outbound` |
| Address | `<ROUTR_PUBLIC_IP>:5060` |
| Transport | UDP or TCP (match Routr EdgePort) |

Save the trunk id as `LIVEKIT_SIP_ROUTR_TRUNK_ID` on the EVRA server (alongside existing `LIVEKIT_SIP_OUTBOUND_TRUNK_ID`).

## EVRA configuration

### Environment (staging server)

```env
# Legacy path — unchanged
LIVEKIT_SIP_OUTBOUND_TRUNK_ID=ST_xxxxxxxx

# Routr path — new
LIVEKIT_SIP_ROUTR_TRUNK_ID=ST_yyyyyyyy
```

### Enable Routr on a test campaign

```sql
UPDATE campaigns SET routing_mode = 'routr' WHERE id = <test_campaign_id>;
```

Revert (rollback):

```sql
UPDATE campaigns SET routing_mode = 'legacy' WHERE id = <test_campaign_id>;
```

No application redeploy required for rollback.

## M1 validation checklist

| # | Check | Pass |
|---|-------|------|
| 1 | Routr running in dev/staging | ☐ |
| 2 | Carrier trunk configured in Routr | ☐ |
| 3 | LiveKit outbound trunk → Routr | ☐ |
| 4 | `routing_mode = 'routr'` on test campaign | ☐ |
| 5 | `npm run dial` succeeds through Routr | ☐ |
| 6 | UI campaign Play succeeds through Routr | ☐ |
| 7 | Real +27 handset rings | ☐ |
| 8 | LiveKit agent joins room | ☐ |
| 9 | `call_records` updates via webhooks | ☐ |
| 10 | `/api/calls/result` works | ☐ |
| 11 | Recording/egress works (if configured) | ☐ |
| 12 | Rollback to `legacy` tested | ☐ |

## Rollback procedure

1. `UPDATE campaigns SET routing_mode = 'legacy' WHERE id = <id>;`
2. Confirm `LIVEKIT_SIP_OUTBOUND_TRUNK_ID` still points at a working direct carrier trunk
3. Run `npm run dial -- --campaign-id <id>` — should use legacy trunk resolution
4. Routr may stay running; it simply receives no traffic from reverted campaigns

## Known M1 limitations (M2+)

- Single Routr instance (no HA/failover)
- No Settings UI sync to Routr (`@routr/sdk` deferred)
- Default carrier route only (no per-campaign carrier selection)
- No custom SIP headers or Routr middleware
- No inbound DIDs or callbacks
- `routing_mode` set via SQL/admin only (no Campaign Settings toggle)
