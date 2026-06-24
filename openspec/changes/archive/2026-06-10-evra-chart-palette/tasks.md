## 1. Chart Theme Foundation

- [x] 1.1 Create `lib/chartTheme.ts` with data colours, UI colours, glow tokens, and per-chart mappings
- [x] 1.2 Add gradient and glow helper functions (`createBarGradient`, `brighterStroke`, `baseChartOptions`)
- [x] 1.3 Add `--chart-*` CSS custom properties to `app/globals.css`
- [x] 1.4 Update `lib/tokens.ts` to re-export chart UI constants from chartTheme for backward compatibility

## 2. Chart Component Updates

- [x] 2.1 Update OutcomeDonut with new outcome colours, segment borders, and flat legend
- [x] 2.2 Update CampaignBar with Connected/Qualified colours, gradients, and soft bar glow
- [x] 2.3 Update SpendChart with Spent/CPL colours and aligned dual-axis label colours
- [x] 2.4 Update FunnelChart with funnel-specific stage colours and subtle positive-stage glow

## 3. Verification

- [x] 3.1 Run TypeScript check and confirm no console errors
- [x] 3.2 Manually verify all four charts render with new palette at dashboard width
