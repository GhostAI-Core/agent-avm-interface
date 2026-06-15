# Cursor agent: EVRA AVM server health check

You are on the **production server**. Run every check below yourself (do not ask the user to run commands). Produce a final pass/fail report.

## Context

| Item | Value |
| --- | --- |
| Compose project | `agent-avm-web` |
| Working directory | `/opt/docker/production/evra_avm` |
| Stack | Next.js web + Routr SIP + one-shot Routr bootstrap |
| External network | Docker network `shared` (must exist) |
| Public SIP IP | `ROUTR_PUBLIC_IP` in `.env` (expected `16.28.15.189`) |

**Security:** Never print secret values from `.env` (passwords, API keys, service role). Only report whether each required variable is **set** or **missing**.

---

## Rules

1. `cd /opt/docker/production/evra_avm` before all compose commands.
2. Run checks in order. If a prerequisite fails, note it and continue where possible.
3. Do **not** modify files, restart services, or run bootstrap unless the user explicitly asked you to fix something.
4. End with a markdown table: Component | Status | Evidence | Action needed.

---

## 1. Prerequisites

```bash
cd /opt/docker/production/evra_avm
docker network inspect shared >/dev/null && echo "shared: OK" || echo "shared: MISSING"
test -f .env && echo ".env: OK" || echo ".env: MISSING"
docker compose config --quiet && echo "compose: OK" || echo "compose: INVALID"
```

**Pass:** `shared` network exists, `.env` exists, `docker compose config` succeeds.

---

## 2. Container status

```bash
docker compose ps -a
```

**Pass criteria:**

| Service | Expected |
| --- | --- |
| `agent-avm-sip-routr` | `Up` (running) |
| `agent-avm-web-web` | `Up` and **`healthy`** (not `unhealthy`) |
| `agent-avm-sip-routr-bootstrap` | `Exited (0)` from the **most recent** run, OR no container if never run after last deploy |

**Fail hints:**
- Web `unhealthy` → check `HOSTNAME=0.0.0.0` in `docker-compose.yml` and recreate web container.
- Bootstrap `Exited (1)` → read logs (step 5); Routr peer/trunk config is incomplete.

---

## 3. Host ports (SIP + Routr admin)

```bash
sudo ss -tulpn | grep -E ':5060|:51908' || true
```

**Pass:**
- `5060` UDP and TCP bound (Routr SIP) on `0.0.0.0` or docker-proxy.
- `51908` TCP bound on **`127.0.0.1` only** (not `0.0.0.0`).

**Fail hints:**
- `5060` held by `freeswitch` → FreeSWITCH must be stopped before Routr.
- `51908` on `0.0.0.0` → security risk; compose should map `127.0.0.1:51908:51908`.

---

## 4. Web application

```bash
# In-container health (what Docker healthcheck uses)
docker compose exec -T agent-avm-web-web wget -qO- http://localhost:3000/api/health

# On shared network (how reverse proxy reaches the app)
docker compose exec -T agent-avm-web-web wget -qO- http://127.0.0.1:3000/api/health 2>/dev/null || true
```

**Pass:** Response JSON includes `"status":"ok"` (or equivalent from `/api/health`).

```bash
docker inspect --format '{{.State.Health.Status}}' "$(docker compose ps -q agent-avm-web-web)"
```

**Pass:** `healthy`

**Recent errors:**

```bash
docker compose logs --tail=40 agent-avm-web-web 2>&1 | tail -20
```

---

## 5. Routr SIP server

```bash
docker compose logs --tail=30 agent-avm-sip-routr 2>&1
```

**Pass:** No repeating crash loop. Logs show edgeport on `5060` and admin API on `51908`. `EXTERNAL_ADDRS` / external host matches `ROUTR_PUBLIC_IP`.

**API reachability from bootstrap network namespace:**

```bash
docker compose run --rm --no-TTY agent-avm-sip-routr-bootstrap \
  node -e "
const net=require('net');
const s=net.connect(51908,'agent-avm-sip-routr',()=>{console.log('tcp-51908: OK');s.end();process.exit(0);});
s.on('error',e=>{console.error('tcp-51908:',e.message);process.exit(1);});
setTimeout(()=>{console.error('tcp-51908: timeout');process.exit(1);},5000);
"
```

**Pass:** `tcp-51908: OK`

---

## 6. Routr configuration (peers, trunks, credentials)

Use `@routr/ctl` v2 syntax (`peers get`, not `peers list`). Endpoint is `host:port` with `-e`, not `insecure://…`.

```bash
docker compose exec -T agent-avm-sip-routr sh -c \
  'npx --yes @routr/ctl@2 peers get -e 127.0.0.1:51908 --insecure'

docker compose exec -T agent-avm-sip-routr sh -c \
  'npx --yes @routr/ctl@2 trunks get -e 127.0.0.1:51908 --insecure'

docker compose exec -T agent-avm-sip-routr sh -c \
  'npx --yes @routr/ctl@2 credentials get -e 127.0.0.1:51908 --insecure'
```

**Pass (M1 outbound):**

| Ref | Kind |
| --- | --- |
| `peer-livekit` | Peer (LiveKit Cloud) |
| `cred-carrier` | Credentials (Twilio) |
| `trunk-carrier-default` | Trunk → `evra-routr.pstn.twilio.com` |

**If empty or missing:** bootstrap did not succeed. Check:

```bash
docker compose logs agent-avm-sip-routr-bootstrap 2>&1 | tail -50
```

**Pass bootstrap log lines:**
```
[routr-bootstrap] SDK endpoint=agent-avm-sip-routr:51908
[routr-bootstrap] Routr API is up
[routr-bootstrap] create peer-livekit
[routr-bootstrap] create cred-carrier
[routr-bootstrap] create trunk-carrier-default
[routr-bootstrap] done
```

**Fail patterns:**
- `Cannot find module 'js-yaml'` → old bootstrap image; rebuild with `Dockerfile.bootstrap`.
- `Routr API not reachable` → SDK endpoint bug (must strip `insecure://`) or Routr not ready; confirm step 5.

---

## 7. Environment variables (presence only)

```bash
cd /opt/docker/production/evra_avm
for key in \
  ROUTR_PUBLIC_IP \
  ROUTR_CARRIER_SIP_HOST \
  ROUTR_CARRIER_SIP_USERNAME \
  ROUTR_CARRIER_SIP_PASSWORD \
  LIVEKIT_URL \
  LIVEKIT_API_KEY \
  LIVEKIT_API_SECRET \
  LIVEKIT_SIP_ROUTR_TRUNK_ID \
  LIVEKIT_SIP_OUTBOUND_TRUNK_ID \
  LIVEKIT_AGENT_NAME \
  NEXT_PUBLIC_SUPABASE_URL \
  SUPABASE_SERVICE_ROLE_KEY; do
  if grep -q "^${key}=" .env 2>/dev/null && \
     grep "^${key}=" .env | grep -qvE '^[^=]+=$' && \
     grep "^${key}=" .env | grep -qvE '^[^=]+=\s*$'; then
    echo "$key: set"
  else
    echo "$key: MISSING or empty"
  fi
done
```

**Pass for Routr outbound path:**
- All `ROUTR_CARRIER_*` vars set.
- `LIVEKIT_SIP_ROUTR_TRUNK_ID` set (LiveKit trunk pointing at `ROUTR_PUBLIC_IP:5060`).
- `ROUTR_PUBLIC_IP` matches EC2 elastic IP.

---

## 8. Bootstrap image version

Confirm the server uses the **built** bootstrap image, not the old `node:20-alpine` + volume-mount setup:

```bash
docker compose config | grep -A5 agent-avm-sip-routr-bootstrap
docker images | grep -E 'agent-avm|bootstrap|routr' || true
```

**Pass:** `build: context: ./infrastructure/routr` and `dockerfile: Dockerfile.bootstrap` in compose config.

---

## 9. Optional: end-to-end readiness (do not place a real call unless asked)

Only verify configuration is **consistent**:

| Check | How |
| --- | --- |
| LiveKit Routr trunk address | Must be `<ROUTR_PUBLIC_IP>:5060` in LiveKit Cloud (user confirms or use `lk` CLI if available) |
| Twilio termination ACL | Must allow `<ROUTR_PUBLIC_IP>/32` |
| Campaign `routing_mode` | Supabase: test campaign set to `routr` for Routr path |

Do not dial a phone number unless the user explicitly requests a test call.

---

## 10. Final report template

Fill this in and return it to the user:

```markdown
# EVRA AVM server health report
**Checked:** <timestamp UTC>
**Host:** <hostname>
**Path:** /opt/docker/production/evra_avm

## Summary
| Component | Status | Notes |
| --- | --- | --- |
| Docker network `shared` | PASS/FAIL | |
| agent-avm-sip-routr | PASS/FAIL | |
| agent-avm-web-web | PASS/FAIL | health: healthy/unhealthy |
| Routr bootstrap | PASS/FAIL/SKIP | exit code, last run |
| Routr peer-livekit | PASS/FAIL | |
| Routr trunk-carrier-default | PASS/FAIL | |
| .env required vars | PASS/FAIL | list missing keys only |
| SIP port 5060 | PASS/FAIL | |
| Routr admin 51908 (localhost) | PASS/FAIL | |

## Blockers (if any)
1. ...

## Recommended fixes (only if failures found)
1. ...

## Safe to test outbound call?
YES / NO — reason
```

---

## Remediation commands (run only if user asks you to fix)

```bash
cd /opt/docker/production/evra_avm

# Rebuild web (HOSTNAME / health fix)
docker compose up -d --build agent-avm-web-web

# Rebuild and run Routr bootstrap
docker compose build agent-avm-sip-routr-bootstrap
docker compose run --rm agent-avm-sip-routr-bootstrap

# Full stack rebuild
docker compose up -d --build
docker compose run --rm agent-avm-sip-routr-bootstrap
```
