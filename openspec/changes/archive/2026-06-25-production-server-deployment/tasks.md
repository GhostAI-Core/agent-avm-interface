## 1. Health endpoint

- [x] 1.1 Add `app/api/health/route.ts` returning 200 JSON
- [x] 1.2 Add `wget` to Dockerfile runner stage for compose healthchecks

## 2. Docker Compose

- [x] 2.1 Rewrite `docker-compose.yml` with external `shared` network, namespaced `agent-avm-web-web` service, `expose` only, healthcheck, `restart: unless-stopped`
- [x] 2.2 Validate with `docker compose config` (no published ports)

## 3. Environment template

- [x] 3.1 Create `.env.example` with `WEB_PORT`, Supabase public vars, and comments

## 4. CI/CD

- [x] 4.1 Create `.github/workflows/deploy-agent-avm.yml` per org template with project placeholders filled

## 5. Documentation

- [x] 5.1 Create `infrastructure/deploy/runbook.md` with paths, routes, secrets, bootstrap, validation

## 6. Verification

- [x] 6.1 Run `docker compose config` locally to confirm valid compose
- [x] 6.2 Run `npm run build` to ensure health route compiles
