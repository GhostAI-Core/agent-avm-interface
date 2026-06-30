## Why

The dashboard is excellent on desktop but **unusable on mobile** (reported 2026-06-30): the
radial nav opens off-screen, data tables can't be scrolled/read, and modals overflow. None of
this is captured in a spec — `openspec/specs/` has design-token / theme / chart specs but **no
responsive/mobile spec**, and issue #15 (a11y/keyboard/**responsive** QA) is still open. This
change establishes the mobile contract and fixes the offenders so the phone experience reflects
the desktop's ease of use.

## Root causes (audited 2026-06-30)

1. **Radial nav opens off-screen** — `components/FloatingNav.tsx`: with `START_ANGLE=180` and
   `tx=-cos·R, ty=-sin·R`, the arc fans items **right and down** (tx>0, ty>0) toward the
   bottom-right corner the FAB already occupies → items land off-screen. It's also **redundant**
   with the working hamburger drawer (`TopBar` → `Sidebar` temporary drawer).
2. **Tables can't move** — `components/ui/DataTable.tsx` pins the grid to `minWidth` up to
   **1458px**. On a ~375px phone that's a 4×-wide grid behind a bare `overflowX:auto`: no momentum
   scroll, gesture-conflicts with the page's vertical scroll and the row-click handler, and no
   stacked alternative. Companies/Campaigns have card views but **default to `table`**; Campaign
   Report, Contacts, SIP Trunks, and the dashboard insight tables have **no** card fallback.
3. **Modals overflow** — **zero** `fullScreen`/`useMediaQuery` usage anywhere: the campaign wizard,
   company modal, chart-expand, and action dialogs render as fixed-width dialogs that overflow phones.
4. **Thin responsive coverage** — only 10/22 top-level components touch breakpoints; fixed
   `p:3` (24px) padding and fixed-width `Select`s (180–200px) crowd small screens.

## What Changes

- **New `responsive-ui` capability/spec** defining the mobile contract: primary nav, table
  presentation, dialog behavior, spacing, and touch targets at `xs`/`sm`.
- **Nav**: fix the radial so it fans **up-and-left into the viewport**, or retire it in favor of
  the (already working) hamburger drawer + a thumb-reachable bottom bar — decided in design.md.
- **Tables**: on `xs`, `DataTable` renders **stacked, labeled cards** (one card per row) instead of
  a 1458px scroll grid; touch-momentum scroll retained as the fallback for wide tables. Companies/
  Campaigns **default to card view on mobile**.
- **Dialogs**: a shared helper makes every `Dialog` `fullScreen` below `sm` (one change, all modals).
- **Layout**: responsive page padding (`p:1.5` on xs), wrapping/full-width filter toolbars,
  responsive insight grid + chart sizing.

## Impact

- **Components**: `FloatingNav.tsx`, `ui/DataTable.tsx`, `app/page.tsx` (modals + default views +
  padding), `CampaignModal.tsx`, `CampaignActionDialog.tsx`, `TopBar.tsx`, `InsightDashboard.tsx`,
  `Charts.tsx`, `CampaignDetail.tsx`, `ContactsView.tsx`, `telephony/SipTrunksPanel.tsx`.
- **New**: a `useIsMobile()` hook (or `useMediaQuery`) + a `<ResponsiveDialog>` wrapper + the
  stacked-card render path in `DataTable`.
- **Specs**: adds `responsive-ui`; advances issue #15.
- **Out of scope**: visual redesign, new features, the Tailwind/MUI cleanup (#14 — tracked separately).
- **No backend / CallOps change.** Pure frontend.
