# Agent AVM — Server verification checklist

Post-deploy checks for the **web stack** on the production host.

## Context

| Item | Value |
| --- | --- |
| Compose project | `agent-avm-web` |
| Deploy path | `/opt/docker/production/evra_avm` |
| Compose service | `agent-avm-web-web` |
| Stack | Next.js web app |
| External network | Docker network `shared` (must exist) |
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

## 4. Environment (Supabase + callops + LiveKit)

```bash
grep -E '^(CALLOPS_|LIVEKIT_|NEXT_PUBLIC_SUPABASE|SUPABASE_SERVICE|INWORLD_|AVM_SCRIPT_)' .env | sed 's/=.*/=***/'
```

**Pass for production lifecycle:**

- `CALLOPS_URL`, `CALLOPS_WEBHOOK_SECRET` set
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` set
- `SUPABASE_SERVICE_ROLE_KEY` set for webhook writes and diagnostic scripts

**Pass for LiveKit webhook / diagnostics:**

- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` set
- `LIVEKIT_SIP_OUTBOUND_TRUNK_ID` set if using `npm run dial`

**Pass for campaign voice generation (if enabled):**

- `INWORLD_API_KEY` set
- `AVM_SCRIPT_AUDIO_STORAGE_BUCKET`, `AVM_SCRIPT_AUDIO_STORAGE_ACCESS_KEY`, `AVM_SCRIPT_AUDIO_STORAGE_SECRET`, `AVM_SCRIPT_AUDIO_STORAGE_ENDPOINT` set

## 5. callops smoke test

From the deploy host (with `.env` loaded):

```bash
npm run callops -- status <campaignId>
```

**Pass:** CLI returns live campaign counters from callops, or a clear upstream error to investigate.

## 6. Direct LiveKit diagnostic dial (optional)

```bash
npm run dial -- --campaign-id <id> --contact-id <id>
```

**Pass:** CLI prints `selected_trunk` and `result: ok` (or a clear SIP error from LiveKit). This is not the production dashboard path.

## Summary template

| Check | Result | Notes |
| --- | --- | --- |
| agent-avm-web-web | PASS/FAIL | |
| /api/health | PASS/FAIL | |
| callops env | PASS/FAIL | |
| callops status | PASS/FAIL | |
| LiveKit diagnostic dial | PASS/FAIL/SKIP | |
