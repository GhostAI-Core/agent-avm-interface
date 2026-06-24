## Why

The EVRA operational dashboard charts currently use flat, muted colours that blend into dark panels. Multiple green series are indistinguishable, gridlines feel muddy, and data lacks visual lift. A centralised, premium neon-inspired chart palette is needed to improve readability and brand cohesion without sacrificing daily operational comfort.

## What Changes

- Introduce a reusable EVRA chart colour system in `lib/chartTheme.ts` with data colours, UI colours, glow tokens, and gradient helpers.
- Update CSS design tokens in `app/globals.css` and TypeScript exports in `lib/tokens.ts` for chart UI values (grid, axis, text, backgrounds).
- Refactor `components/Charts.tsx` to consume the central palette for all four chart types: Outcome Donut, Campaign Comparison, Spend & CPL, and Dialling Funnel.
- Apply subtle segment borders on the donut chart and soft bar glows where Chart.js supports them.
- Use distinct Connected (`#47D16A`) vs Qualified (`#5BE8BE` mint/aqua) colours in Campaign Comparison with optional vertical gradients.
- Align Spend & CPL dual-axis label colours with their respective series.
- Reduce gridline intensity and standardise axis/legend text colours across charts.
- Add subtle panel lift via chart container styling where appropriate.

## Capabilities

### New Capabilities

- `chart-visual-system`: Centralised EVRA chart colour palette, glow tokens, gradient helpers, and per-chart colour mappings for all dashboard charts.

### Modified Capabilities

<!-- No existing specs in openspec/specs/ -->

## Impact

- **Files**: `lib/chartTheme.ts` (new), `lib/tokens.ts`, `app/globals.css`, `components/Charts.tsx`
- **Library**: react-chartjs-2 / Chart.js — styling-only changes, no library replacement
- **Out of scope**: data calculations, API contracts, dashboard layout, full app theme redesign, animations beyond hover glow
