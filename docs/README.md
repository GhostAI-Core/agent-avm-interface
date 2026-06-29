# Agent AVM — Developer docs

Documentation for integrating and operating the Agent AVM dashboard, callops lifecycle proxy, telephony stack, and voice generation workflow.

| Doc | Audience | Contents |
|-----|----------|----------|
| [API reference & alignment guide](./app-api-reference.md) | Backend / frontend / integration | Current `app/api/` route inventory, auth model, Supabase tables, callops/OpenAPI boundary |
| [Callops and LiveKit outbound integration](./livekit-outbound-integration.md) | Ops / backend / UI | Production callops flow, LiveKit webhook, trunk catalog, diagnostic CLI, testing |
| [STS SmartCall SDP integration](./sts-sdp-integration.md) | Backend / agent integration | Product subscribe/opt-out relay, STS GUID/env contract, outcome vocabulary |
| [Inworld voice list](./voicelist.md) | Product / frontend | Voice IDs used by the campaign voice generator |
| [evra-callops OpenAPI](./openapi.json) | Backend integration | External callops API contract; not the Next.js app route spec |
| [Deployment runbook](../infrastructure/deploy/runbook.md) | Ops | Docker/Cloudflare deploy steps and environment checklist |
| [Server verification checklist](../infrastructure/deploy/cursor-server-verify.md) | Ops | Post-deploy health, env, and callops smoke checks |

Start with **app-api-reference.md** to understand this repo's API surface, then **livekit-outbound-integration.md** for outbound calling operations.
