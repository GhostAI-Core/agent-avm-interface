## 1. Design Tokens Foundation

- [x] 1.1 Add full EVRA `:root` CSS custom properties to `app/globals.css` (colors, typography, type scale, spacing, radii, convenience aliases)
- [x] 1.2 Add EVRA base body styles, `.mono`, `.logo-wordmark`, `.card`, `.input`, `.button-primary`, `.button-secondary` utility classes
- [x] 1.3 Update `:focus-visible` outline and scrollbar styles to EVRA green accent / dark surfaces
- [x] 1.4 Create `lib/tokens.ts` exporting color, semantic, radius, typography, and `CHART_COLORS` constants mirroring CSS values

## 2. Fonts and Layout

- [x] 2.1 Load Michroma via `next/font/google` in `app/layout.tsx` and expose `--font-display` CSS variable on `<html>`
- [x] 2.2 Remove Inter font import; apply body font stack via globals.css / MUI theme (system stack)
- [x] 2.3 Verify no SSR font hydration warnings in dev console

## 3. MUI Theme

- [x] 3.1 Rewrite `lib/theme.ts` palette to EVRA tokens (background, paper, primary, semantic, text)
- [x] 3.2 Set `shape.borderRadius` to `4` and typography to 15px body / EVRA font stacks
- [x] 3.3 Add `MuiPaper` / `MuiCard` overrides: flat `#292929` surface, `#1A1A1A` border, no blur/shadow
- [x] 3.4 Add `MuiButton` overrides: primary green (`#37A660` / `#0E2014` text), secondary `#5C5C5C`
- [x] 3.5 Add `MuiTextField` / `MuiOutlinedInput` overrides: recessed `#141414` bg, `#3A3A3A` border
- [x] 3.6 Add `MuiAppBar`, `MuiDrawer`, `MuiListItemButton` overrides for flat nav shell and green selected state
- [x] 3.7 Add overrides for `MuiTableCell`, `MuiChip`, `MuiDialog`, `MuiDivider`, `MuiToggleButton`, `MuiAlert`, `MuiButtonBase` focus-visible
- [x] 3.8 Map light mode to EVRA dark palette (or lock to dark-only in `Providers.tsx`)

## 4. Shared UI Primitives

- [x] 4.1 Restyle `components/ui/GlassCard.tsx` to flat EVRA surface (optionally rename to `SurfaceCard` and update imports)
- [x] 4.2 Remap `components/ui/StatusChip.tsx` colors to EVRA semantic palette
- [x] 4.3 Remap `components/ui/AgentChip.tsx` colors to EVRA-compatible distinct hues

## 5. Layout Shell

- [x] 5.1 Update `components/Sidebar.tsx`: remove glass/blur, EVRA surfaces, green selected nav, Michroma tagline/wordmark glow
- [x] 5.2 Update `components/TopBar.tsx`: flat AppBar, EVRA live indicator green, remove blue agent/highlight colors
- [x] 5.3 Update `components/FloatingNav.tsx`: EVRA surfaces and accent, remove glass patterns

## 6. Dashboard and Views

- [x] 6.1 Remove `C` / `glass` constants from `app/page.tsx`; use theme tokens for remaining inline styles
- [x] 6.2 Apply `.mono` / tabular-nums to KPI values, currency, phone numbers, and ID columns in `app/page.tsx`
- [x] 6.3 Update `components/KpiStrip.tsx`: mono metric values, EVRA tone colors for deltas
- [x] 6.4 Update `components/AuthView.tsx`: remove legacy style props/overrides; rely on themed MUI components
- [x] 6.5 Update `components/CampaignModal.tsx` to EVRA flat styling
- [x] 6.6 Update `components/SettingsView.tsx` to EVRA flat styling
- [x] 6.7 Update `components/SecurityView.tsx` to EVRA flat styling
- [x] 6.8 Update `components/STSDashboard.tsx` to EVRA flat styling
- [x] 6.9 Update `components/ProfileView.tsx` to EVRA flat styling

## 7. Charts

- [x] 7.1 Replace hardcoded chart colors in `components/Charts.tsx` with `lib/tokens.ts` imports
- [x] 7.2 Update chart grid, tick, and legend colors to EVRA muted foreground tokens
- [x] 7.3 Shift agent bar colors to EVRA-compatible distinct hues

## 8. Verification

- [x] 8.1 Grep codebase for legacy values: `#3b82f6`, `#0f172a`, `#10b981`, `rgba(30,41,59`, `backdropFilter`, `blur(14px)` — fix any remaining hits
- [x] 8.2 Visual QA: auth screen, dashboard KPIs, campaign table, charts, modals, sidebar nav (desktop + mobile drawer)
- [x] 8.3 Confirm keyboard focus rings use EVRA green across buttons, inputs, and nav items
- [x] 8.4 Confirm logo/wordmark area has Michroma glow; no unintended glow on other elements
