## Context

Agent AVM is a Next.js 16 standalone app backed by Supabase (external SaaS). The repo has a `Dockerfile` (port 3000) and a dev-oriented `docker-compose.yml` that maps `9000:9000` with no shared network. The organization runs multiple projects on one host using Docker network `shared`, Cloudflare Tunnel for ingress, and GitHub Actions (rsync + SSH + compose) for deploys.

This project is a single-tier web app — no API worker, database container, or background jobs in compose. Supabase is hosted externally.

## Goals / Non-Goals

**Goals:**

- Deploy Agent AVM to the shared production server following the org deployment template
- Automated deploy on push to `main` via GitHub Actions
- Container reachable only on `shared` network; public access via Cloudflare Tunnel
- Health endpoint for compose healthchecks and external monitoring
- Documented runbook for first deploy, routes, and validation

**Non-Goals:**

- Managing Cloudflare Tunnel or `shared` network from this repo
- Container registry / image push workflow
- Self-hosted Postgres or Supabase in compose
- Changing application features or auth behavior

## Decisions

### Project identifiers

| Placeholder | Value |
|-------------|-------|
| `PROJECT_SLUG` | `agent-avm` |
| `TIER` | `web` |
| `COMPOSE_DIR` | `.` (repo root) |
| `DEPLOY_PATH` | `/opt/docker/production/evra_avm` |
| `DEPLOY_USER` | `deploy` (via GitHub secret) |
| `WORKFLOW_NAME` | `Deploy Agent AVM` |
| `CONCURRENCY_GROUP` | `agent-avm-deploy` |
| `PUBLIC_DOMAIN` | `vas.inc` (placeholder — confirm with ops) |

### Service naming

Single public service: `agent-avm-web-web` on internal port `3000` (matches Dockerfile `PORT=3000`).

Rationale: `{project}-{tier}-{role}` avoids DNS collisions on `shared`. The duplicate `web` segment reflects tier=`web` and role=`web` (HTTP frontend).

### Compose location

Keep `docker-compose.yml` at repo root (`COMPOSE_DIR=.`) since `Dockerfile` build context is already `.`.

### Health check

Add `GET /api/health` returning `200` JSON. Use `wget` in healthcheck (available in alpine via `apk add --no-cache wget` in Dockerfile runner stage) since `curl` is not in node:20-alpine by default.

Alternative considered: `node -e` HTTP request — rejected as harder to maintain.

### Environment variables

Production `.env` on server only. `.env.example` in repo documents:

- `WEB_PORT` (default 3000)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Compose references `.env` with `required: false` for local `docker compose config` without secrets.

### Cloudflare route

| Public hostname | Tunnel target | Access |
|-----------------|---------------|--------|
| `agent-avm.vas.inc` (or `app.vas.inc`) | `http://agent-avm-web-web:3000` | Public or Cloudflare Access per ops policy |

Exact hostname documented in runbook as ops-configured; not hardcoded in app.

## Risks / Trade-offs

- **[Risk] Port mismatch in old compose (9000 vs 3000)** → New compose uses `3000` consistently with Dockerfile
- **[Risk] No `.env` on server** → Containers start but Supabase calls fail; health endpoint still returns 200 (app process up). Document that auth will fail without env vars.
- **[Risk] `PUBLIC_DOMAIN` unknown** → Runbook uses placeholder; ops fills Cloudflare routes manually
- **[Trade-off] Breaking local compose port mapping** → Developers use `npm run dev` or SSH tunnel for container debugging

## Migration Plan

1. Bootstrap server: create `/opt/docker/production/evra_avm`, copy `.env.example` → `.env`, fill Supabase keys
2. Merge PR with compose + workflow
3. Configure GitHub secrets
4. Add Cloudflare Tunnel public hostname → `http://agent-avm-web-web:3000`
5. Push to `main` or `workflow_dispatch` to deploy
6. Validate with `docker compose ps`, network inspect, `curl` health via tunnel

**Rollback:** Re-run prior successful workflow or `docker compose up -d` after checking out known-good commit on server.

## Open Questions

- Confirm production public hostname (`agent-avm.vas.inc` vs subdomain under existing domain)
- Confirm `DEPLOY_PATH` and `DEPLOY_USER` with server admin
