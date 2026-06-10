# Agent AVM — Production Deploy Runbook

## Project identifiers

| Placeholder | Value |
|-------------|-------|
| `PROJECT_SLUG` | `agent-avm` |
| `TIER` | `web` |
| `COMPOSE_DIR` | `.` (repo root) |
| `DEPLOY_PATH` | `/opt/docker/production/evra_avm` |
| `DEPLOY_USER` | `deploy` |
| `CONCURRENCY_GROUP` | `agent-avm-deploy` |
| `PUBLIC_DOMAIN` | Confirm with ops (e.g. `vas.inc`) |

## Services

| Compose service | Role | Internal port | Cloudflare route |
|-----------------|------|---------------|------------------|
| `agent-avm-web-web` | Next.js web app | 3000 | Yes |

Supabase is external SaaS — no database container in this stack.

## Cloudflare Tunnel routes

Configure in **Cloudflare Zero Trust → Networks → Tunnels → [tunnel] → Public Hostname**.

| Public hostname | Tunnel target | Access policy |
|-----------------|---------------|---------------|
| `agent-avm.{PUBLIC_DOMAIN}` | `http://agent-avm-web-web:3000` | Public or Cloudflare Access per ops |

Target must match the compose **service name** and **expose** port exactly.

## GitHub repository secrets

| Secret | Example value |
|--------|---------------|
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
nano /opt/docker/production/evra_avm/.env   # fill Supabase keys

docker network inspect shared     # must exist; create outside this project if missing

cd /opt/docker/production/evra_avm
docker compose up -d --build
```

`.env` lives only on the server. The deploy workflow does not sync or overwrite it.

## Post-deploy validation

```bash
cd /opt/docker/production/evra_avm

docker compose ps
# Confirm no 0.0.0.0 or 127.0.0.1 port mappings

docker network inspect shared | grep agent-avm-web-web

docker compose logs -f agent-avm-web-web

docker exec $(docker compose ps -q agent-avm-web-web) \
  wget -q -O - http://localhost:3000/api/health
```

External (after Cloudflare route exists):

```bash
curl -sf https://agent-avm.{PUBLIC_DOMAIN}/api/health
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
