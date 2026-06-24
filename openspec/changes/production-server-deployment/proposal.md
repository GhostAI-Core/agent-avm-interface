## Why

Agent AVM currently has a development-oriented `docker-compose.yml` that binds host ports and lacks CI/CD for the shared production server. We need standardized deployment artifacts so the Next.js portal can run on the shared Docker `shared` network behind Cloudflare Tunnel, with automated deploys on push to `main`.

## What Changes

- Replace root `docker-compose.yml` with production-ready compose: external `shared` network, `expose` only (no host `ports`), namespaced service `agent-avm-web-web`
- Add `.env.example` documenting production environment variables (Supabase keys, port)
- Add GitHub Actions workflow `.github/workflows/deploy-agent-avm.yml` (SSH + rsync + compose)
- Add `infrastructure/deploy/runbook.md` with Cloudflare route table, server paths, and validation commands
- Add `/api/health` route for container healthchecks
- **BREAKING**: Local `docker compose` no longer publishes `9000:9000`; use `npm run dev` locally or SSH port-forward for container debugging

## Capabilities

### New Capabilities

- `production-deployment`: Docker Compose stack, CI/CD workflow, env template, health endpoint, and deploy runbook for the shared production server

### Modified Capabilities

<!-- None — no existing openspec specs -->

## Impact

- `docker-compose.yml` — full rewrite for shared-network production pattern
- `Dockerfile` — may need healthcheck tooling (`curl` or `wget`) for compose healthchecks
- New files: `.env.example`, `.github/workflows/deploy-agent-avm.yml`, `infrastructure/deploy/runbook.md`, `app/api/health/route.ts`
- Server ops: manual `.env` bootstrap at `/opt/docker/production/evra_avm`, Cloudflare Tunnel route for public hostname
- GitHub repository secrets: `DEPLOY_SSH_PRIVATE_KEY`, `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PATH`
