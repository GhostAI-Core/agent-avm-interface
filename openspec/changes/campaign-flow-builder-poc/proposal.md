## Why

Cale proposed a visual, node-based flow builder for the platform (shared 2026-07-23:
reactflow.dev + the react-flow-builder repo). We want a **proof of concept** to demo the concept —
an editable canvas where a campaign's pipeline/automation is built from connected nodes instead of
forms. Today there is **no flow model and no visual editor**: call "flow" is an implicit single
audio clip + a fixed press-1/press-9 DTMF convention + a `transfer_key`→transfer branch
(`types/index.ts` Campaign, `components/CampaignModal.tsx`). React Flow is not yet a dependency.

## What Changes (POC scope — agreed with Garth 2026-07-24)

- **Model:** a **campaign pipeline / automation** flow. Nodes are the pipeline stages that already
  exist as the Control Room funnel — **Dial → Connect → Engage → Qualify → Lead** — plus branch and
  action nodes (decision/DTMF branch with positive/negative outputs, and actions: Transfer,
  WhatsApp, Opt-out/Suppress, Mark Lead), with Start/End.
- **Depth:** **visual demo only** — a standalone route (`/flow-builder`) with the canvas, custom
  nodes themed to our dark green schema, add / connect / delete, branching, and **export-to-JSON**.
  **No backend persistence, no wiring to real campaign data/APIs** (explicitly out of scope).
- **Library:** add `@xyflow/react` (React Flow v12, MIT, Next.js-compatible). The react-flow-builder
  repo is UX inspiration for the branching model, not a dependency.

## Impact

- New spec/capability: `flow-builder` (POC-level requirements).
- New code: `app/flow-builder/page.tsx`, `components/flow-builder/*` (canvas, custom nodes, palette,
  export). New dependency `@xyflow/react`. No changes to existing dashboard/campaign code.
- Risk: React 19 / Next 16 compatibility with `@xyflow/react` — verified by a clean `next build`
  during implementation; if the pinned version conflicts, fall back to the latest v12 that supports
  React 19.
- Not for production: standalone demo route, no auth wiring, no data writes.
