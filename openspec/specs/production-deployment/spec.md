# production-deployment Specification

## Purpose
Define the production packaging and deployment contract for the Agent AVM Next.js web app on the shared Docker host.
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

### Requirement: Manual Docker Compose deployment

The repository SHALL be deployable by updating source at `/opt/docker/production/evra_avm` and running `docker compose up -d --build` from the repo root on a host where the external `shared` Docker network already exists. Production secrets SHALL remain in the server-local `.env` file and MUST NOT be committed or overwritten by source syncs.

#### Scenario: Shared network missing fails compose

- **WHEN** `docker compose up -d --build` runs on a server without the external `shared` network
- **THEN** Compose fails before starting the web service

#### Scenario: Source rollback

- **WHEN** an operator checks out a known-good commit at `DEPLOY_PATH` and runs `docker compose up -d --build`
- **THEN** the web service is rebuilt and restarted from that ref while preserving the server-local `.env`

### Requirement: Deploy runbook

The repository SHALL include `infrastructure/deploy/runbook.md` documenting deploy path, service names, Cloudflare tunnel target, server-local environment handling, first-deploy bootstrap steps, routine deploy, rollback, and post-deploy validation commands.

#### Scenario: Operator can validate deployment

- **WHEN** an operator follows the runbook validation section after deploy
- **THEN** they can confirm containers are running, on `shared`, and health responds

