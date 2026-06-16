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

### Utility Connect (carrier trunk in Routr)

Set in server `.env` (bootstrap creates Routr credentials + `trunk-carrier-default`):

| Field | Value |
|-------|-------|
| `ROUTR_CARRIER_NAME` | `utility_connect` |
| `ROUTR_CARRIER_SIP_HOST` | `sbc.convergedgroup.co.za` |
| `ROUTR_CARRIER_SIP_PORT` | `5060` |
| `ROUTR_CARRIER_SIP_USERNAME` | `uc-jono` |
| `ROUTR_CARRIER_SIP_PASSWORD` | _(server `.env` only)_ |

Utility Connect must whitelist the **Routr VPS public IP** (`ROUTR_PUBLIC_IP`).

Outbound caller ID (`+27104760561`) is configured on the **LiveKit** Routr-facing trunk (`LIVEKIT_SIP_ROUTR_TRUNK_ID` → Numbers in LiveKit Console), not on the Routr carrier trunk.

After updating `.env` on the server:

```bash
docker compose run --rm agent-avm-sip-routr-bootstrap
npx @routr/ctl@2 trunks get -e 127.0.0.1:51908 --insecure
```

### 1. Twilio Elastic SIP (optional / legacy direct path)

| Field | Value |
|-------|-------|
| Termination URI (Routr dials **to** Twilio) | `evra-routr.pstn.twilio.com` |
| Credentials | username `evra` + password in server `.env` only |
| IP ACL on Twilio | Allow `16.28.15.189/32` (Routr elastic IP) |
| Caller ID / From | `+27102886988` on LiveKit Routr trunk Numbers |
| Origination (inbound only) | `sip:16.28.15.189:5060` — for future inbound to DID |

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

# Add carrier vars to .env when ready (see .env.example ROUTR_CARRIER_*)
docker compose up -d agent-avm-sip-routr agent-avm-sip-routr-bootstrap
docker compose logs agent-avm-sip-routr-bootstrap
docker compose logs -f agent-avm-sip-routr
```

`agent-avm-sip-routr-bootstrap` applies LiveKit Peer (+ optional carrier Trunk) from `infrastructure/routr/config/` on every deploy. Config persists in Docker volume `routr-pgdata`.

**Admin API from laptop:**

```bash
ssh -L 51908:127.0.0.1:51908 deploy@your-server
npx @routr/ctl@2 peers get -e 127.0.0.1:51908 --insecure
npx @routr/ctl@2 trunks get -e 127.0.0.1:51908 --insecure
```

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
