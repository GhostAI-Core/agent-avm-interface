# Cursor agent: EVRA AVM server health check

You are on the **production server**. Run every check below yourself (do not ask the user to run commands). Produce a final pass/fail report.

## Context

| Item | Value |
| --- | --- |
| Compose project | `agent-avm-web` |
| Working directory | `/opt/docker/production/evra_avm` |
| Stack | Next.js web app |
| External network | Docker network `shared` (must exist) |

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
| `agent-avm-web-web` | `Up` and **`healthy`** (not `unhealthy`) |

**Fail hints:**
- Web `unhealthy` → check `HOSTNAME=0.0.0.0` in `docker-compose.yml` and recreate web container.

---

## 3. Web application

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

## 4. Environment variables (presence only)

```bash
cd /opt/docker/production/evra_avm
for key in \
  LIVEKIT_URL \
  LIVEKIT_API_KEY \
  LIVEKIT_API_SECRET \
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

**Pass:**
- `LIVEKIT_*` vars set (including `LIVEKIT_SIP_OUTBOUND_TRUNK_ID`).
- `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set.

---

## 5. Final report template

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
| agent-avm-web-web | PASS/FAIL | health: healthy/unhealthy |
| .env required vars | PASS/FAIL | list missing keys only |

## Blockers (if any)
1. ...

## Recommended fixes (only if failures found)
1. ...
```

---

## Remediation commands (run only if user asks you to fix)

```bash
cd /opt/docker/production/evra_avm

# Rebuild web (HOSTNAME / health fix)
docker compose up -d --build agent-avm-web-web

# Full stack rebuild
docker compose up -d --build
```
