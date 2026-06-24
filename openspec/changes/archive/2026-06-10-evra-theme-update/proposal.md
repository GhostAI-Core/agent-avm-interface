## Why

The Agent AVM interface currently uses a blue-tinted glassmorphism aesthetic (slate backgrounds, blur panels, Inter font, `#3b82f6` accent) that does not match the EVRA brand identity. Aligning the UI with the EVRA design system — dark luxury-tech dashboard, green/mint signal accent, flat panels, and tabular numeric typography — gives the product a cohesive, enterprise-grade look consistent with the EVRA dashboard.

## What Changes

- Replace the current MUI theme (`lib/theme.ts`) with EVRA palette, typography, shape, and component overrides (flat surfaces, minimal shadows, small radii).
- Introduce a centralized CSS custom-property layer in `app/globals.css` with the full EVRA token set (colors, fonts, type scale, spacing, radii).
- Load **Michroma** (display/wordmark) via `next/font/google`; use system body stack and monospace for metrics/IDs/phone numbers.
- Remove glassmorphism patterns (backdrop blur, translucent rgba panels, heavy box shadows) from `GlassCard`, `TopBar`, `Sidebar`, and inline `glass` style objects.
- Migrate scattered hardcoded color constants (`C` in `page.tsx`, `TONE_COLOR`, `AGENT_COLOR`, chart colors, chip colors) to theme tokens or a shared `lib/tokens.ts`.
- Update focus rings, scrollbars, and semantic colors (positive/negative/warning/info) to EVRA values.
- Restyle logo/wordmark area with Michroma uppercase treatment and subtle mint glow (brand-only).
- Apply tabular-nums monospace styling to KPI values, phone numbers, campaign IDs, and table numeric columns.
- Update chart color palette in `Charts.tsx` to harmonize with EVRA greens and semantic colors.
- **BREAKING**: Visual appearance changes across every view; light mode (if used) will be de-emphasized or remapped to EVRA dark tokens.

## Capabilities

### New Capabilities

- `evra-design-tokens`: CSS custom properties and TypeScript token exports for the EVRA color, typography, spacing, radius, and semantic palettes.
- `evra-mui-theme`: MUI `createTheme` configuration mapping EVRA tokens to palette, typography, shape, and per-component overrides (Paper, Button, TextField, Table, Chip, AppBar, Drawer, etc.).
- `evra-component-reskin`: Component-level styling updates across layout shell, dashboard views, auth, modals, and shared UI primitives to consume tokens and remove legacy glass/blue styling.

### Modified Capabilities

<!-- No existing specs in openspec/specs/ — all requirements are new. -->

## Impact

- **Core theme**: `lib/theme.ts`, `app/globals.css`, `app/layout.tsx` (font loading)
- **Providers**: `components/Providers.tsx` (theme mode behavior)
- **Shared UI**: `components/ui/GlassCard.tsx` (rename or restyle to flat `SurfaceCard`), `StatusChip.tsx`, `AgentChip.tsx`
- **Layout shell**: `components/Sidebar.tsx`, `components/TopBar.tsx`, `components/FloatingNav.tsx`
- **Views**: `app/page.tsx`, `components/AuthView.tsx`, `components/KpiStrip.tsx`, `components/CampaignModal.tsx`, `components/SettingsView.tsx`, `components/SecurityView.tsx`, `components/STSDashboard.tsx`, `components/ProfileView.tsx`, `components/Charts.tsx`
- **Dependencies**: Add Michroma via `next/font/google`; no new npm packages required
- **Assets**: Logo image may need filter/glow adjustments; wordmark typography handled in CSS
- **APIs / backend**: None — purely frontend visual change
