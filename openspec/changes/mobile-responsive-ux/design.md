# Design — mobile-responsive-ux

## Breakpoint contract
MUI defaults: `xs` 0–599, `sm` 600–899, `md`+ desktop. "Mobile" = `< sm` (phones). The persistent
desktop sidebar already swaps to a temporary drawer at `lg`; this change targets the `xs`/`sm`
content + chrome that never adapted.

A single source of truth: `useIsMobile()` → `useMediaQuery(theme.breakpoints.down('sm'))`.

## Decision 1 — Radial nav: fix vs retire
The hamburger drawer (TopBar → Sidebar temporary drawer) is the standard, reliable mobile nav and
**already works**. The radial is broken (off-screen) and redundant.

- **Option A (recommended): retire the radial; keep the hamburger drawer; add a slim bottom tab bar**
  for the 4–5 most-used views (Control Room, Campaigns, Contacts, Report). Thumb-reachable, no math,
  matches mobile conventions. Removes `FloatingNav` complexity.
- **Option B (minimal): fix the radial math** — fan into the viewport (up-and-left): use
  `START_ANGLE=270`, `tx=cos·R` (≤0), `ty=sin·R` (≤0) so items move left+up; clamp `RADIUS` so the
  farthest item stays on-screen given `right:28/bottom:28`. Cheapest, keeps the signature look.

Default to **B for the quick win** (one-file fix, ships today), and propose **A** as the durable
follow-up. Both leave the hamburger drawer as the primary nav.

## Decision 2 — Tables on mobile: stacked cards, not wide scroll
A 1458px grid on a 375px screen can't be made "easy" by scrolling. The desktop ease-of-use is that
a row is readable at a glance — on mobile that means **one card per row** with `label: value` pairs,
the same data, vertically stacked, full-width, tap = the row's `onRowClick`.

`DataTable` gains an `xs` render path: when `useIsMobile()`, map each row through the existing
`columns` (reusing each `column.render`/`label`) into a stacked card. Columns flagged with a new
optional `priority?: 'primary' | 'secondary' | 'hidden'` control prominence (primary = card title,
hidden = dropped on mobile); default keeps all columns as `label: value` lines. The Actions column
renders as a button row at the card foot. No per-call-site rewrite — every existing `DataTable`
inherits the mobile layout. Wide tables that opt out keep momentum scroll
(`WebkitOverflowScrolling:'touch'`, `touchAction:'pan-x'`, a fade affordance).

Companies/Campaigns: default `view` to `'cards'` when `useIsMobile()` (they already have card UIs).

## Decision 3 — Dialogs
A `<ResponsiveDialog>` wrapper (or a shared `dialogProps`): `fullScreen={useIsMobile()}`. Applied to
the campaign wizard, company modal, chart-expand, and action dialogs. Wizard step content scrolls
within the full-screen sheet; the StepRail collapses to a compact progress indicator on `xs`.

## Decision 4 — Spacing & toolbars
- `<main>` padding `p:{ xs: 1.5, sm: 3 }`; bottom padding keeps clearance for the bottom bar.
- Filter `Stack`s already `flexWrap` — make their `Select`s `fullWidth` / `minWidth:0` on `xs` so
  they stack instead of overflowing.
- Insight grid + charts: ensure `Grid size={{ xs:12, sm:6, lg:4 }}` everywhere and chart containers
  use `width:'100%'` with a fixed height (no fixed pixel widths).

## Phasing
- **Phase 1 (quick wins, ship first):** radial math fix (B), `ResponsiveDialog` (all modals
  fullScreen), `<main>` padding, default card view on mobile, table momentum-scroll. Turns
  "terrible" → "usable" with low risk.
- **Phase 2:** `DataTable` stacked-card mobile layout + `priority` column flags (the real
  ease-of-use win) across Report/Contacts/SIP-Trunks/Detail.
- **Phase 3:** bottom tab bar (Option A) + retire radial; charts/insight-grid polish; touch-target
  + a11y sweep (closes issue #15).

## Verification
Test at 360–414px widths (iPhone SE / 12 / Pixel) and 768px (tablet): every view reachable, no
horizontal page scroll, tables readable without pinch-zoom, modals fit, all tap targets ≥ 44px.
Then verify on-device via clauto.
