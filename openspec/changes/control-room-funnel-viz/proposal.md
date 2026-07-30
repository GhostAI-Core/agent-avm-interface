## Why

The Control Room's Dialling Funnel and KPI sparklines were flagged in client review (2026-07-24):
the funnel only filled ~75% of its block, read as "heavy geometry" (hard trapezoids), and the
KPI sparklines were near-flat (a 0-baseline y-axis flattened real day-to-day movement). The
Control Room funnel is a bespoke SVG (`components/ControlRoom.tsx` `Funnel`), separate from the
Chart.js `FunnelChart`, and its visual contract was **not captured in any spec** — only the
Chart.js funnel colours are in `chart-visual-system`.

## What Changes

- **Funnel visual redesign (Option 1, client-selected direction):** the Control Room funnel
  renders as a numbered, angular multi-stage funnel in the EVRA green schema — distinct solid
  colour per stage (no gloss), stage number on the left, stage label/metrics on a leader to the
  right, tapering to a point. Fills its block top-to-bottom and is centred in the display block.
- **Sparklines depict real movement:** drop the zero-baseline (auto-scale to each series' own
  min/max with grace), monotone interpolation, and an end-point marker for the current value.
- **New spec requirement** in `chart-visual-system` capturing the Control Room funnel + sparkline
  contract so this can't silently regress.

Both designs are shipped behind a header toggle (**3D Funnel / Flow**) so the client can choose
live; Option 2 is the horizontal flowing/streamgraph funnel by campaign. Once the client picks,
the losing option can be removed in a follow-up. The spec below captures the 3D funnel + sparkline
contract (the selected direction); the flow view is an offered alternative pending that decision.

## Impact

- Affected specs: `chart-visual-system` (added requirements).
- Affected code: `components/ControlRoom.tsx` (`Funnel`), `components/InsightCharts.tsx`
  (`Sparkline`). Front-end only; no data/endpoint changes.
- Deploy: `agent-avm-interface` auto-deploys to prod on push to `main` — ship only after visual
  sign-off (screenshots approved) per the UI review rule.
