## 1. Sparklines (SHIPPED to branch, awaiting sign-off)
- [x] 1.1 `InsightCharts.tsx` `Sparkline`: remove `beginAtZero`, auto-scale y with `grace:'12%'`
- [x] 1.2 Monotone interpolation + end-point marker for the current value

## 2. Funnel fill + smoothing (SUPERSEDED by section 3 design)
- [x] 2.1 Fill the block top-to-bottom (taller viewBox, `height:100%`, stretch container)
- [x] 2.2 Flatten to classic solid-colour-per-stage in the EVRA greens (no gradient/gloss)

## 3. Funnel redesign — Option 1: 3D cone funnel (client-selected direction)
- [x] 3.1 Shaded cone frustums (elliptical rims, cylindrical shading, drop shadow) — "more 3D"
- [x] 3.2 Stage number on the left, label + count + conversion % on a right leader
- [x] 3.3 Correct near/far layering (wider upper cones paint over lower; shadow falls down)
- [x] 3.4 Digits centred in each cone's visible area; whole graphic centred in the block
- [x] 3.5 Distinct solid green-schema shade per stage; tapers to a cone tip

## 4. Funnel — Option 2: horizontal flow (both offered, client to choose via toggle)
- [x] 4.1 `FunnelFlow` — stacked streaming series (top 3 campaigns + Other) in the green schema
- [x] 4.2 Stage totals + conversion % across the top with dividers; series legend below
- [x] 4.3 `FunnelStyleToggle` (3D Funnel / Flow) in the panel header switches designs live

## 5. Verify
- [x] 5.1 `npm run build` clean (tsc + eslint)
- [x] 5.2 Screenshots approved by Garth ("save this, its beautiful", 2026-07-24) before commit/PR
- [x] 5.3 `openspec validate control-room-funnel-viz --strict`
