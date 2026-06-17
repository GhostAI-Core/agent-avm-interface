# Agent AVM — Server verification checklist

Post-deploy checks for the **web stack** on the production host.

## Context

| Item | Value |
| --- | --- |
| Deploy path | `/opt/docker/production/evra_avm` |
| Compose service | `agent-avm-web-web` |
| Public access | Cloudflare Tunnel → `agent-avm-web-web:3000` |

## 1. Compose status

```bash
cd /opt/docker/production/evra_avm
docker compose ps
```

**Pass:** `agent-avm-web-web` is `Up` and healthy.

## 2. Health endpoint (in container)

```bash
docker exec $(docker compose ps -q agent-avm-web-web) \
  wget -q -O - http://localhost:3000/api/health
```

**Pass:** HTTP 200 with health JSON.

## 3. Shared network

```bash
docker network inspect shared | grep agent-avm-web-web
```

**Pass:** Web container attached to `shared` network (if tunnel routes through it).

## 4. Environment (LiveKit + Supabase)

```bash
grep -E '^(LIVEKIT_|NEXT_PUBLIC_SUPABASE|SUPABASE_SERVICE)' .env | sed 's/=.*/=***/'
```

**Pass for outbound dialing:**

- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` set
- `LIVEKIT_SIP_OUTBOUND_TRUNK_ID` set (or campaigns use per-trunk `sip_trunk_id`)
- `SUPABASE_SERVICE_ROLE_KEY` set (webhooks + agent result)

## 5. Manual dial smoke test (optional)

From the deploy host (with `.env` loaded):

```bash
npm run dial -- --campaign-id <id> --contact-id <id>
```

**Pass:** CLI prints `selected_trunk` and `result: ok` (or a clear SIP error from LiveKit).

## Summary template

| Check | Result | Notes |
| --- | --- | --- |
| agent-avm-web-web | PASS/FAIL | |
| /api/health | PASS/FAIL | |
| LiveKit env | PASS/FAIL | |
| Manual dial | PASS/FAIL/SKIP | |
