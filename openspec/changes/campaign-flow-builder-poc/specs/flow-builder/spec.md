## ADDED Requirements

### Requirement: Visual campaign-flow builder (POC)

The system SHALL provide a standalone, node-based flow builder (`/flow-builder`, React Flow /
`@xyflow/react`) that lets a user assemble a campaign pipeline visually from connected nodes. Node
types SHALL include the pipeline stages (Dial, Connect, Engage, Qualify, Lead), a branch/decision
node with positive and negative outputs, action nodes (Transfer, WhatsApp, Opt-out, Mark Lead), and
Start/End. The canvas SHALL support adding, connecting, and deleting nodes and edges, and SHALL be
styled to the EVRA dark green schema (`lib/tokens`). As a POC it SHALL NOT persist to any backend.

#### Scenario: Building and exporting a flow

- **WHEN** the user opens `/flow-builder`
- **THEN** a canvas renders with a seeded pipeline flow and a node palette
- **AND** the user can add nodes from the palette, connect them via handles, branch a decision node
  into positive/negative paths, and delete nodes/edges
- **AND** an "Export JSON" action outputs the current nodes + edges as JSON

#### Scenario: No persistence in the POC

- **WHEN** the user edits the flow
- **THEN** changes live only in the browser session (export/import JSON), with no write to any
  campaign, product, or API
