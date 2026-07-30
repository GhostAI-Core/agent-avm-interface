## 1. Setup
- [ ] 1.1 `npm i @xyflow/react`; confirm it resolves against React 19 / Next 16
- [ ] 1.2 Standalone route `app/flow-builder/page.tsx` ('use client'), import `@xyflow/react/dist/style.css`

## 2. Canvas + theme
- [ ] 2.1 `components/flow-builder/FlowCanvas.tsx` — ReactFlow with Background (dots), Controls, MiniMap, recoloured to `lib/tokens` dark green schema
- [ ] 2.2 Node/edge state (`useNodesState`/`useEdgesState`), connect via handles (`onConnect`), delete nodes/edges (keyboard + control)

## 3. Custom nodes (campaign pipeline)
- [ ] 3.1 `StageNode` — Dial / Connect / Engage / Qualify / Lead, green-schema styled, target+source handles
- [ ] 3.2 `BranchNode` — decision / DTMF (e.g. "Press 1?") with two source handles: positive (green) / negative (muted)
- [ ] 3.3 `ActionNode` — Transfer / WhatsApp / Opt-out / Mark Lead (distinct accent per action)
- [ ] 3.4 Start / End terminal nodes
- [ ] 3.5 A seeded default flow (Dial→Connect→Engage→Qualify→Lead with a press-1 branch) so the canvas opens populated

## 4. Palette + actions
- [ ] 4.1 Node palette sidebar (MUI) — click/drag to add each node type to the canvas
- [ ] 4.2 Toolbar: delete selection, clear, **Export JSON** (nodes+edges → download / modal), and Import JSON
- [ ] 4.3 Optional: auto-layout button

## 5. Config inspector + spec registry (real logic)
- [x] 5.1 `nodeSpecs.ts` — typed field schema per node (number/text/select/toggle) + branch outputs
- [x] 5.2 Spec-driven `SpecNode`; inspector panel edits selected node's params live
- [x] 5.3 Pruned non-actionable palette items (Note; dead "On Answered/Press 1" → branch outputs)

## 6. Build with Claude (NL → flow, proof-check before apply)
- [x] 6.1 `app/api/flow-builder/generate` — Claude Opus 4.8, forced `build_flow` tool constrained to the spec registry (valid specKeys + fields only); graceful message when ANTHROPIC_API_KEY unset
- [x] 6.2 "Build with Claude" panel → generate → auto-layout → **proof-check preview modal** (read-only canvas) → Apply / Discard
- [ ] 6.3 Live end-to-end run (needs ANTHROPIC_API_KEY in .env)

## 7. Verify
- [x] 7.1 `npm run build` clean (tsc + eslint)
- [ ] 7.2 Run locally, screenshots, get Garth's sign-off before commit/PR
- [x] 7.3 `openspec validate campaign-flow-builder-poc --strict`
