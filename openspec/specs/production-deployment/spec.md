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

### Requirement: Ops-controlled deploy process

The repository SHALL document a Docker Compose deploy path, but it SHALL NOT require a checked-in
GitHub Actions deploy workflow. Deployment credentials and environment files stay outside git.

#### Scenario: Shared network missing blocks deploy

- **WHEN** the operator validates the target server before deploying
- **THEN** `docker network inspect shared` must succeed before compose is started

#### Scenario: Server env is preserved

- **WHEN** code is deployed to `DEPLOY_PATH`
- **THEN** the existing server `.env` is not overwritten from git

### Requirement: Deploy runbook

The repository SHALL include `infrastructure/deploy/runbook.md` documenting deploy path, service names, Cloudflare tunnel target, deployment inputs, first-deploy bootstrap steps, and post-deploy validation commands.

#### Scenario: Operator can validate deployment

- **WHEN** an operator follows the runbook validation section after deploy
- **THEN** they can confirm containers are running, on `shared`, and health responds

