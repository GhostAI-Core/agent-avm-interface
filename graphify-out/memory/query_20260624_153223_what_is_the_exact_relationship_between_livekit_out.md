---
type: "query"
date: "2026-06-24T15:32:23.882853+00:00"
question: "What is the exact relationship between LiveKit outbound call flow and POST /api/calls/result?"
contributor: "graphify"
source_nodes: ["LiveKit outbound call flow", "POST /api/calls/result", "POST /api/livekit/webhook"]
---

# Q: What is the exact relationship between LiveKit outbound call flow and POST /api/calls/result?

## Answer

Expanded from original query via vocab: [livekit, outbound, call, result, webhook, outcome, callops, dial]. The outbound flow has two parallel post-dial reporting channels: (1) LiveKit webhooks update call_records for connect/recording/duration; (2) agent outcome callback was POST /api/calls/result but is now deprecated no-op—agents should POST evra-callops /calls/outcome per issue #34. README still documents the old contract; graph edge is AMBIGUOUS.

## Source Nodes

- LiveKit outbound call flow
- POST /api/calls/result
- POST /api/livekit/webhook