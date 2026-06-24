## Context

The EVRA dashboard uses **react-chartjs-2** (Chart.js v4) for four chart components in `components/Charts.tsx`: Outcome Donut, Campaign Comparison bar chart, Spend & CPL dual-axis bar chart, and Dialling Funnel. Colours are partially centralised via `lib/tokens.ts` (`CHART_COLORS`, `CHART_GRID`, etc.) but Campaign Comparison and Spend & CPL still hardcode rgba values. The app theme lives in `lib/theme.ts` (MUI) and `lib/tokens.ts` with CSS variables in `app/globals.css`.

Chart.js supports: `backgroundColor`, `borderColor`, `borderWidth`, gradient fills via canvas context, and plugin-based shadow/glow via `shadowBlur`/`shadowColor` on datasets or custom plugins. Legend and grid styling are configured via `options.scales` and `options.plugins.legend`.

## Goals / Non-Goals

**Goals:**

- Centralise all chart data colours, UI colours, and glow tokens in `lib/chartTheme.ts`.
- Apply the specified EVRA neon palette to all four dashboard charts.
- Distinguish Connected vs Qualified with green vs mint/aqua.
- Subtle glow on data elements only (opacity 0.15–0.22).
- Consistent grid (`rgba(255,255,255,0.06)`), axis (`#A8A8A8`), and text (`#EDEDED`) styling.
- Export gradient helpers for Campaign Comparison bars.

**Non-Goals:**

- Changing chart data logic, calculations, labels, or API contracts.
- Replacing Chart.js or refactoring dashboard layout.
- Full application theme redesign.
- Aggressive animations or cyberpunk styling.

## Decisions

### 1. New file: `lib/chartTheme.ts`

**Decision:** Create `lib/chartTheme.ts` as the single source of truth for chart styling, importing shared UI tokens from `lib/tokens.ts` where they overlap.

**Rationale:** Keeps chart-specific semantics (outcome colours, glow, gradients) separate from general UI tokens while avoiding duplication. `tokens.ts` already has `CHART_COLORS` — these will be deprecated in favour of semantic names from `chartTheme.ts`.

**Alternative considered:** Extend `tokens.ts` only — rejected because chart palette is large and chart-specific helpers (gradients, glow) don't belong in general design tokens.

### 2. Chart.js gradient fills via helper function

**Decision:** Export `createBarGradient(ctx, chartArea, topColor, bottomColor)` that returns a CanvasLinearGradient for vertical bar fills in Campaign Comparison.

**Rationale:** Chart.js requires canvas context at render time; a small helper keeps `Charts.tsx` clean.

### 3. Glow via dataset `shadowBlur` / `shadowColor`

**Decision:** Use Chart.js built-in shadow properties on bar datasets (`shadowBlur: 8–12`, `shadowColor` from `chartGlow`) rather than a custom plugin.

**Rationale:** Minimal complexity; shadow applies to data elements only. Donut gets subtle `borderColor` (brighter stroke) instead of aggressive per-slice glow.

### 4. Shared chart options factory

**Decision:** Export `baseChartOptions()` returning common grid, tick, and legend config to DRY up the four components.

**Rationale:** All charts share the same axis/legend styling per requirements.

### 5. CSS variables for chart UI in `globals.css`

**Decision:** Add `--chart-*` CSS custom properties mirroring the TypeScript exports for future non-Chart.js charts.

**Rationale:** User-specified palette includes CSS variable names; keeps TS and CSS in sync.

## Risks / Trade-offs

- **[Risk] Canvas gradients require chart instance** → Mitigation: use Chart.js `backgroundColor` callback `(context) => ...` pattern.
- **[Risk] Shadow glow may look heavy on retina** → Mitigation: keep `shadowBlur` ≤ 12 and opacity ≤ 0.22; no glow on legend/grid.
- **[Risk] Funnel stage colours differ from donut mapping** → Mitigation: explicit `funnelStageColors` array in `chartTheme.ts`, not reusing `outcomeDonutColors`.
- **[Trade-off] Campaign Comparison loses per-agent colour variation** → Connected/Qualified use fixed palette colours per spec; agent tinting removed for clarity.

## Migration Plan

1. Add `lib/chartTheme.ts` with all tokens and helpers.
2. Update `lib/tokens.ts` to re-export or alias chart UI constants for backward compatibility.
3. Refactor `components/Charts.tsx` to use new theme.
4. Add CSS variables to `globals.css`.
5. Manual visual verification on dashboard.

Rollback: revert the four files; no data or API changes.

## Open Questions

None — palette and per-chart mappings are fully specified in the proposal.
