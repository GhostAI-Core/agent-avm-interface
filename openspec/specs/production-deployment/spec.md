# production-deployment Specification

## Purpose
TBD - created by archiving change production-server-deployment. Update Purpose after archive.
## Requirements
### Requirement: Production Docker Compose uses shared network

The production `docker-compose.yml` SHALL declare `networks.shared.external: true` and attach all services to `shared`. The compose file MUST NOT define `ports:` host bindings on any service. Public-facing services MUST use `expose` for their internal listen port only.

#### Scenario: Compose validates without host ports

- **WHEN** `docker compose config` is run against the production compose file
- **THEN** the output contains zero `published` port mappings and includes `shared` as an external network

#### Scenario: Service joins shared network

- **WHEN** `docker compose up -d` runs on a server where network `shared` exists
- **THEN** the `agent-avm-web-web` container is attached to the `shared` network

### Requirement: Namespaced service identity

The web service SHALL be named `agent-avm-web-web` in compose. The compose project name SHOULD be `agent-avm-web`.

#### Scenario: DNS resolution on shared network

- **WHEN** another container on `shared` resolves `agent-avm-web-web`
- **THEN** it reaches the Agent AVM web container on the exposed port

### Requirement: Health endpoint

The application SHALL expose `GET /api/health` returning HTTP 200 with a JSON body indicating healthy status when the Next.js server process is running.

#### Scenario: Health check succeeds inside container

- **WHEN** a request is made to `http://localhost:3000/api/health` from inside the running container
- **THEN** the response status is 200

#### Scenario: Compose healthcheck passes

- **WHEN** the compose healthcheck runs against the web service after start period
- **THEN** the service is marked healthy

### Requirement: Environment configuration

The repository SHALL include `.env.example` listing all required production environment variables. Production secrets MUST NOT be committed. Compose MUST reference `.env` with `required: false`.

#### Scenario: Local compose config without env file

- **WHEN** `.env` is absent and `docker compose config` is run
- **THEN** compose parsing succeeds without error

### Requirement: GitHub Actions deploy workflow

The repository SHALL include `.github/workflows/deploy-agent-avm.yml` that on push to `main` (and `workflow_dispatch`): checks out code, connects via SSH, verifies `shared` network exists, rsyncs the repo to `DEPLOY_PATH` excluding `.git/` and `.github/`, and runs `docker compose up -d --build` from the compose directory.

#### Scenario: Shared network missing fails deploy

- **WHEN** the deploy workflow runs and `docker network inspect shared` fails on the server
- **THEN** the workflow exits with error before rsync or compose

#### Scenario: Concurrent deploys serialized

- **WHEN** two deploy workflows are triggered for the same project
- **THEN** only one runs at a time via concurrency group `agent-avm-deploy`

### Requirement: Deploy runbook

The repository SHALL include `infrastructure/deploy/runbook.md` documenting deploy path, service names, Cloudflare tunnel target, GitHub secrets, first-deploy bootstrap steps, and post-deploy validation commands.

#### Scenario: Operator can validate deployment

- **WHEN** an operator follows the runbook validation section after deploy
- **THEN** they can confirm containers are running, on `shared`, and health responds

