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
| `agent-avm-sip-routr` | Routr SIP router (Connect) | 5060 SIP, 51908 API | **No** (see below) |

Supabase is external SaaS — no database container in this stack.

### Routr networking (important)

Routr is on the `shared` network so other stack containers can reach it by service name. **SIP does not go through Cloudflare Tunnel** — LiveKit and carriers must dial the host **public IP on port 5060** (UDP/TCP).

| Traffic | How to reach Routr |
| --- | --- |
| LiveKit outbound trunk / PSTN SIP | `<SERVER_PUBLIC_IP>:5060` (host port published in compose) |
| Other containers on `shared` (SIP) | `agent-avm-sip-routr:5060` |
| Routr APIServer (`rctl` / future SDK) | `agent-avm-sip-routr:51908` on `shared` only — **not** HTTP; do not add a Cloudflare public hostname |

Set `ROUTR_PUBLIC_IP` in server `.env` to the same public IPv4 used for LiveKit trunk configuration.

## Decommission FreeSWITCH (one-time, before first Routr deploy)

The production host may have **systemd FreeSWITCH** bound to `5060`. Routr cannot start until it is stopped.

```bash
# Confirm FreeSWITCH holds 5060
sudo ss -tulpn | grep 5060

# Stop and disable (does not uninstall)
sudo systemctl stop freeswitch
sudo systemctl disable freeswitch

# Port must be free
sudo ss -tulpn | grep 5060 || echo "5060 free"

# EC2 public IP — set this as ROUTR_PUBLIC_IP in .env
curl -s http://169.254.169.254/latest/meta-data/public-ipv4 && echo
```

Ensure the **AWS security group** allows inbound `5060/udp` and `5060/tcp` from LiveKit SIP and your carrier.

Rollback to FreeSWITCH (only if needed):

```bash
cd /opt/docker/production/evra_avm && docker compose stop agent-avm-sip-routr
sudo systemctl enable freeswitch && sudo systemctl start freeswitch
```


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
nano /opt/docker/production/evra_avm/.env   # fill Supabase keys + ROUTR_PUBLIC_IP

# Stop FreeSWITCH if it holds port 5060 (see "Decommission FreeSWITCH" above)
sudo systemctl stop freeswitch
sudo systemctl disable freeswitch

docker network inspect shared     # must exist; create outside this project if missing

cd /opt/docker/production/evra_avm
docker compose up -d --build
```

`.env` lives only on the server. The deploy workflow does not sync or overwrite it.

## Post-deploy validation

```bash
cd /opt/docker/production/evra_avm

docker compose ps
# agent-avm-web-web: expose only (no host ports)
# agent-avm-sip-routr: publishes 5060/udp and 5060/tcp — expected

docker network inspect shared | grep -E 'agent-avm-web-web|agent-avm-sip-routr'

docker compose logs -f agent-avm-sip-routr

# Routr should own 5060 after FreeSWITCH is stopped
sudo ss -tulpn | grep 5060

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
# then open http://localhost:30
```