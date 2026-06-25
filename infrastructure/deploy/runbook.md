# Agent AVM — Production Deploy Runbook

## Project identifiers

| Placeholder | Value |
| --- | --- |
| `PROJECT_SLUG` | `agent-avm` |
| `TIER` | `web` |
| `COMPOSE_DIR` | `.` (repo root) |
| `DEPLOY_PATH` | `/opt/docker/production/evra_avm` |
| `DEPLOY_USER` | `deploy` |
| `CONCURRENCY_GROUP` | `agent-avm-deploy` |
| `PUBLIC_DOMAIN` | Confirm with ops (e.g. `vas.inc`) |

## Services

| Compose service | Role | Internal port | Cloudflare route |
| --- | --- | --- | --- |
| `agent-avm-web-web` | Next.js web app | 3000 | Yes |

Supabase is external SaaS — no database container in this stack. Campaign lifecycle and dispatch are owned by evra-callops; outbound SIP trunks are configured in LiveKit Cloud and referenced through Supabase `sip_trunks`.

The web app is on the `shared` network so the reverse proxy / tunnel can reach it by service name.

## Cloudflare tunnel

Configure in **Cloudflare Zero Trust → Networks → Tunnels → \[tunnel\] → Public Hostname**.

| Public hostname | Tunnel target | Access policy |
| --- | --- | --- |
| `agent-avm.{PUBLIC_DOMAIN}` | `http://agent-avm-web-web:3000` | Public or Cloudflare Access per ops |

Target must match the compose **service name** and **expose** port exactly.

## GitHub repository secrets

| Secret | Example value |
| --- | --- |
| `DEPLOY_SSH_PRIVATE_KEY` | Deploy user private key |
| `DEPLOY_HOST` | Server hostname or IP |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_PATH` | `/opt/docker/production/evra_avm` |

## First deploy (manual bootstrap)

```bash
# On server — one time
sudo mkdir -p /opt/docker/production/evra_avm
sudo chown -R deploy:deploy /opt/docker/production/evra_avm

# After first rsync or clone
cp /opt/docker/production/evra_avm/.env.example /opt/docker/production/evra_avm/.env
nano /opt/docker/production/evra_avm/.env   # fill Supabase + callops + LiveKit/TTS keys

docker network inspect shared     # must exist; create outside this project if missing

cd /opt/docker/production/evra_avm
docker compose up -d --build
```

`.env` lives only on the server. The deploy workflow does not sync or overwrite it.

## Runtime environment checklist

| Group | Variables | Required for |
|-------|-----------|--------------|
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Authenticated dashboard routes |
| Service role | `SUPABASE_SERVICE_ROLE_KEY` | LiveKit webhook writes, direct diagnostic scripts |
| callops | `CALLOPS_URL`, `CALLOPS_WEBHOOK_SECRET` | Production Play/Pause/Stop lifecycle and live stats |
| LiveKit | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Webhook validation and direct diagnostic CLI |
| LiveKit diagnostics | `LIVEKIT_SIP_OUTBOUND_TRUNK_ID`, `LIVEKIT_AGENT_NAME`, `LIVEKIT_RECORD_*` | `npm run dial` and optional egress |
| TTS | `INWORLD_API_KEY`, `AVM_SCRIPT_AUDIO_STORAGE_*` | Campaign script generation and saved audio |

If `CALLOPS_URL` or `CALLOPS_WEBHOOK_SECRET` is blank, lifecycle buttons fall back to local status updates and do not dispatch calls.

## Post-deploy validation

```bash
cd /opt/docker/production/evra_avm

docker compose ps
# agent-avm-web-web: expose only (no host ports)

docker network inspect shared | grep agent-avm-web-web

docker exec $(docker compose ps -q agent-avm-web-web) \
  wget -q -O - http://localhost:3000/api/health

grep -E '^(CALLOPS_|LIVEKIT_|NEXT_PUBLIC_SUPABASE|SUPABASE_SERVICE|INWORLD_|AVM_SCRIPT_)' .env | sed 's/=.*/=***/'
```

External (after Cloudflare route exists):

```bash
curl -sf https://agent-avm.{PUBLIC_DOMAIN}/api/health
```

Callops smoke test from a shell with `.env` loaded:

```bash
npm run callops -- status <campaignId>
```

## Rollback

```bash
cd /opt/docker/production/evra_avm
docker compose up -d
```

Prefer re-running a prior successful GitHub Actions deploy from a known-good commit on `production`.

## Debugging without host ports

```bash
ssh -L 3000:agent-avm-web-web:3000 deploy@{DEPLOY_HOST}
# then open http://localhost:3000
```
