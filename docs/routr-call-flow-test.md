# Routr outbound call flow — manual test guide

Minimal backend/CLI path to validate outbound calls through Routr. No frontend or Routr SDK sync required.

## Expected call flow

```
EVRA CLI / API
  → LiveKit createDispatch()
  → LiveKit createSipParticipant()
  → LIVEKIT_SIP_ROUTR_TRUNK_ID
  → LiveKit outbound trunk
  → Routr VPS
  → Utility Connect
  → +27 phone
```

The app always calls LiveKit the same way (`createDispatch` + `createSipParticipant`). Routr owns the hop from Routr to Utility Connect.

## Required env vars

| Variable | Purpose |
|----------|---------|
| `LIVEKIT_URL` | LiveKit project URL |
| `LIVEKIT_API_KEY` | LiveKit API key |
| `LIVEKIT_API_SECRET` | LiveKit API secret |
| `LIVEKIT_AGENT_NAME` | Agent worker name |
| `LIVEKIT_SIP_OUTBOUND_TRUNK_ID` | Legacy path — direct LiveKit → carrier |
| `LIVEKIT_SIP_ROUTR_TRUNK_ID` | Routr path — LiveKit trunk pointing at Routr VPS |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | CLI dial script DB access |

Use `LIVEKIT_SIP_ROUTR_TRUNK_ID` only when `campaigns.routing_mode = 'routr'` or when using `--route routr` on the CLI.

## Manual infrastructure (not automated in app)

### LiveKit

Create an outbound SIP trunk in LiveKit Console (or `lk` CLI):

- **Name:** EVRA Routr Test
- **Destination:** `sip:<ROUTR_HOST_OR_IP>:5060`

Set in `.env`:

```env
LIVEKIT_SIP_ROUTR_TRUNK_ID=ST_xxxxxxxx
```

This trunk must point at Routr, **not** directly at Utility Connect.

### Routr (manual)

Configure on the Routr VPS:

- LiveKit-facing peer / trunk
- **Utility Connect** carrier trunk (`utility_connect` → `sbc.convergedgroup.co.za`, auth `uc-jono`)
- Default outbound route: LiveKit → Utility Connect

Bootstrap from `.env` on deploy:

```env
ROUTR_CARRIER_NAME=utility_connect
ROUTR_CARRIER_SIP_HOST=sbc.convergedgroup.co.za
ROUTR_CARRIER_SIP_PORT=5060
ROUTR_CARRIER_SIP_USERNAME=uc-jono
ROUTR_CARRIER_SIP_PASSWORD=<server .env only>
```

Re-apply after changing carrier vars:

```bash
docker compose run --rm agent-avm-sip-routr-bootstrap
```

Caller ID `+27104760561` belongs on the **LiveKit** outbound trunk (`LIVEKIT_SIP_ROUTR_TRUNK_ID` → Numbers), not in Routr.

See [infrastructure/routr-m1-staging.md](../infrastructure/routr-m1-staging.md) and [infrastructure/deploy/runbook.md](../infrastructure/deploy/runbook.md).

### Utility Connect

Whitelist the **Routr VPS public IP**, not LiveKit Cloud.

## Campaign routing mode (SQL)

Mark one campaign for Routr testing:

```sql
UPDATE campaigns
SET routing_mode = 'routr'
WHERE id = <campaign_id>;
```

Roll back to legacy:

```sql
UPDATE campaigns
SET routing_mode = 'legacy'
WHERE id = <campaign_id>;
```

## CLI test commands

### Server prerequisites

The dial scripts are **not** in the production web Docker image. On the deploy host, install deps once in the repo directory:

```bash
cd /opt/docker/production/evra_avm   # your deploy path
npm ci
```

Then run dial commands from that directory (not from `scripts/`). `npm run` adds `node_modules/.bin` to PATH so `tsx` resolves locally — do **not** rely on `npx tsx` on the server.

Alternatively, run dial from your laptop where the repo already has `node_modules`.

### Dry-run trunk resolution (no call placed)

```bash
npm run dial:route -- --campaign-id <campaign_id>
npm run dial:route -- --campaign-id <campaign_id> --route routr
```

### Place a test call

One-off Routr test without changing the database:

```bash
npm run dial -- --campaign-id <campaign_id> --contact-id <contact_id> --route routr

Add `--wait` to block until the callee answers (or LiveKit returns a SIP error):

```bash
npm run dial -- --campaign-id <campaign_id> --phone +27821234567 --route routr --wait
```

Without `--wait`, `result: ok` only means LiveKit accepted `createDispatch` + `createSipParticipant` — not that the phone rang.
```

Ad-hoc phone number:

```bash
npm run dial -- --campaign-id <campaign_id> --phone +27821234567 --route routr
```

Force legacy trunk on a Routr campaign (in-memory only):

```bash
npm run dial -- --campaign-id <campaign_id> --contact-id <contact_id> --route legacy
```

`--route` overrides routing mode for that CLI run only. It does **not** update `campaigns.routing_mode`.

## Validation checklist

After running `npm run dial -- --campaign-id <id> --contact-id <id> --route routr`:

1. CLI shows `effective_mode: routr`
2. CLI shows `selected_trunk` = `LIVEKIT_SIP_ROUTR_TRUNK_ID` value (`ST_…`)
3. LiveKit dispatch is created
4. LiveKit SIP participant is created
5. Routr receives the SIP INVITE
6. Routr forwards to Utility Connect
7. The real +27 test phone rings
8. The LiveKit agent joins the room
9. A `call_records` row is created or updated
10. `POST /api/calls/result` still works when the agent posts the result
11. On failure, CLI prints the LiveKit/Twirp/SIP error clearly

## Troubleshooting

| Symptom | Check |
|---------|-------|
| `Campaign routing_mode is routr but LIVEKIT_SIP_ROUTR_TRUNK_ID is not set` | Set `LIVEKIT_SIP_ROUTR_TRUNK_ID` in `.env` |
| LiveKit errors, no INVITE at Routr | LiveKit trunk destination must be Routr IP/host:5060 |
| INVITE at Routr, no ring | Routr route to Utility Connect; UC must whitelist Routr IP |
| Call places but no agent | `LIVEKIT_AGENT_NAME` must match running worker |
| SIP 4xx/5xx in CLI | Twirp error line includes SIP status code when available |

Dry-run first:

```bash
npm run dial:route -- --campaign-id <id> --route routr
```

Expected output includes `trunk_source: LIVEKIT_SIP_ROUTR_TRUNK_ID` and `config_error: (none)`.
