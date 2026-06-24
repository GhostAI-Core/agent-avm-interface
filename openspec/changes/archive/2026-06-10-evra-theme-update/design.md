## Context

The Agent AVM interface is a Next.js 15 app using MUI v6 for components and a custom `buildTheme()` in `lib/theme.ts`. Styling is split across three layers:

1. **MUI theme** — palette, typography, component overrides (currently slate/blue glass aesthetic, 12px radius, Inter font).
2. **`app/globals.css`** — Tailwind preflight only, focus ring, scrollbars, keyframe animations.
3. **Inline hardcoded tokens** — `C` / `glass` objects in `app/page.tsx`, per-component color maps (`AGENT_COLOR`, `TONE_COLOR`, `STATUS_STYLE`, chart palettes).

The target EVRA design system specifies dark charcoal surfaces, flat panels, green/mint accent, Michroma display font, monospace tabular numerals, and small radii (4–6px). Glow is reserved for logo/wordmark only.

## Goals / Non-Goals

**Goals:**

- Establish a single source of truth for EVRA design tokens (CSS variables + TypeScript exports).
- Map tokens into MUI `createTheme` so most components inherit correct colors, typography, and shape automatically.
- Reskin all 15+ UI files to remove glassmorphism and blue accent in favor of EVRA flat dark panels and green accent.
- Apply Michroma + glow to brand wordmark; apply `font-variant-numeric: tabular-nums` on metrics, IDs, and phone numbers.
- Harmonize Chart.js palettes and status/agent chip colors with EVRA semantic colors while preserving distinguishability.

**Non-Goals:**

- Rebuilding components in a different UI library or migrating away from MUI.
- Adding a full light-mode EVRA theme (dark-only is the design target; light mode toggle may remain but is not a first-class deliverable).
- Changing layout structure, navigation, or business logic.
- Redesigning the logo image asset itself (CSS treatment only).
- Wiring Tailwind utility classes (Tailwind remains preflight-only).

## Decisions

### 1. Dual token layer: CSS variables + TypeScript

**Decision:** Define the full EVRA token set as `:root` CSS custom properties in `app/globals.css`, and mirror key values in `lib/tokens.ts` for use in MUI theme, Chart.js, and inline `sx` props.

**Rationale:** CSS variables enable global consistency and future theming; TypeScript exports are required where JS needs color strings (charts, conditional styles). MUI theme will reference the TS tokens, not parse CSS at runtime.

**Alternatives considered:**
- *MUI theme only* — insufficient for Chart.js and scattered `sx` usage.
- *Tailwind `@theme` extension* — project explicitly does not use Tailwind utilities.

### 2. EVRA dark as the default and primary mode

**Decision:** `buildTheme()` will produce an EVRA dark theme regardless of mode. If `ColorModeContext` light mode is retained, it will map to the same EVRA dark palette (or a near-identical variant) rather than maintaining the old slate/blue light theme.

**Rationale:** EVRA spec is dark-only; maintaining two full palettes doubles migration effort with no design brief for light.

### 3. Rename `GlassCard` → `SurfaceCard` (or restyle in place)

**Decision:** Restyle `components/ui/GlassCard.tsx` to flat EVRA surface (`--evra-bg-1`, `--evra-border-1`, `border-radius: 4px`, no blur/shadow). Optionally rename to `SurfaceCard` and update imports.

**Rationale:** "Glass" is misleading after migration; rename clarifies intent. Minimal import churn (6–8 files).

### 4. Font loading strategy

**Decision:**
- Load **Michroma** via `next/font/google` in `app/layout.tsx`, expose as CSS variable `--font-display`.
- Body font uses the system stack from the spec (no web font download for SF Pro / DM Sans).
- Monospace uses the CSS `font-mono` stack; no JetBrains Mono download unless visual QA shows need.

**Rationale:** Matches spec; minimizes font payload. Michroma is the only required external font.

### 5. MUI component override scope

**Decision:** Extend `lib/theme.ts` with overrides for: `MuiCssBaseline`, `MuiPaper`, `MuiCard`, `MuiButton`, `MuiIconButton`, `MuiTextField`, `MuiOutlinedInput`, `MuiTableCell`, `MuiTableHead`, `MuiChip`, `MuiAppBar`, `MuiDrawer`, `MuiListItemButton`, `MuiDialog`, `MuiDivider`, `MuiSelect`, `MuiToggleButton`, `MuiAlert`, `MuiTooltip`.

Key overrides:
- `borderRadius: 4` (theme shape)
- Paper/Card: solid `#292929` background, `1px solid #1A1A1A`, no backdrop-filter, no box-shadow
- Primary button: `#37A660` bg, `#0E2014` text, `#1F6F35` border
- Secondary button: `#5C5C5C` bg
- Focus-visible: `#60BC84` outline (replacing `#3b82f6`)
- Typography variants: body 15px/1.5; caption for labels/tabs

### 6. Agent identity colors

**Decision:** Keep distinct hues per agent (Seeker, Grace, Sangoma) for chart/bar differentiation, but shift palette toward EVRA-compatible tones (greens, mint, warm amber) rather than blue/purple/orange defaults.

**Rationale:** Agent color is functional (identification), not brand accent. Full green monochrome would reduce scannability.

### 7. Chart palette

**Decision:** Create `CHART_COLORS` in `lib/tokens.ts` — ordered array using EVRA semantic colors (`positive`, `warning`, `negative`, `info`) plus muted surface tones for low-priority segments.

### 8. Migration order

**Decision:** Implement bottom-up:
1. Tokens (`globals.css` + `lib/tokens.ts`)
2. MUI theme (`lib/theme.ts`)
3. Layout/fonts (`layout.tsx`)
4. Shared primitives (`SurfaceCard`, chips)
5. Shell (Sidebar, TopBar, FloatingNav)
6. Views (page, Auth, KPI, modals, settings, security, STS, profile)
7. Charts
8. Visual QA pass

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Hardcoded rgba colors missed during migration | Grep for `#3b82f6`, `#0f172a`, `rgba(30,41,59`, `backdropFilter`, `blur` after implementation |
| MUI default styles bleed through on un-overridden components | Audit all MUI imports; add overrides as discovered in QA |
| Michroma readability at small sizes | Restrict Michroma to logo/wordmark and large headings only |
| Chart segment colors less distinguishable after palette shift | Keep ≥8 distinct hues; test donut legend legibility |
| SSR/hydration font mismatch | Use `next/font` with `variable` class on `<html>` |
| Light mode toggle becomes meaningless | Document as dark-only; consider hiding toggle in Settings if present |

## Migration Plan

1. Ship all token + theme changes in a single PR (visual consistency requires atomic update).
2. No database or API migration.
3. Rollback: revert the PR; no persistent state affected.
4. Post-deploy: smoke-test auth, dashboard KPIs, campaign table, charts, modals, mobile nav drawer.

## Open Questions

- Should the product wordmark text change from "AGENT AVM \| SOUTH AFRICA" to "EVRA" or remain as-is with EVRA typography treatment only?
- Should the existing `/logo.png` image be kept, replaced, or dropped in favor of a text-only Michroma wordmark?
- Is the Settings light/dark toggle still needed, or should it be removed?
