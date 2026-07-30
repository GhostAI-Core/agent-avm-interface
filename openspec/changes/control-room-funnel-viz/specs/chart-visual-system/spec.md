## ADDED Requirements

### Requirement: Control Room Dialling Funnel presentation

The Control Room's bespoke SVG Dialling Funnel (`components/ControlRoom.tsx`) SHALL render as a
numbered, angular, multi-stage funnel using the EVRA green schema: one distinct solid fill per
stage (no gradient/gloss), the stage index on the left, and the stage label with its count and
conversion percentage on a leader line to the right. The funnel MUST fill its container
top-to-bottom and be horizontally centred within its display block.

#### Scenario: Funnel renders in the Control Room

- **WHEN** the Control Room "Dialling Funnel" panel renders
- **THEN** each stage is a solid-filled angular band in a distinct green-schema shade, numbered on
  the left, with count and conversion % on a right-hand leader, tapering to a point
- **AND** the graphic fills the block vertically and is centred horizontally

### Requirement: KPI sparkline movement

Control Room KPI sparklines (`components/InsightCharts.tsx` `Sparkline`) SHALL auto-scale the
vertical axis to the series' own min/max (not a fixed zero baseline) so real day-to-day movement
is visible, use monotone interpolation, and mark the latest point.

#### Scenario: Sparkline reflects real trend

- **WHEN** a KPI metric card renders its sparkline over the day series
- **THEN** the line uses the series' own value range (with small grace padding) rather than a
  0-anchored axis, and the current (last) point is marked
