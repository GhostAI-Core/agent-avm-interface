## 1. Foundation
- [x] 1.1 `hooks/useIsMobile.ts` (`useMediaQuery(theme.breakpoints.down('sm'))`)
- [x] 1.2 `components/ui/ResponsiveDialog.tsx` → `fullScreen` below `sm` (caller can override)

## 2. Phase 1 — quick wins (terrible → usable) — SHIPPED
- [x] 2.1 `FloatingNav` math fixed: `START_ANGLE=90`, `tx=cos·R` (≤0), `ty=-sin·R` (≤0) → fans up-and-left into the viewport, on-screen at 360px
- [x] 2.2 All dialogs routed through `ResponsiveDialog`: campaign wizard, company modal, chart-expand, `CampaignActionDialog`, `SaveTemplateDialog`, SIP-trunk create/test-call
- [x] 2.3 `<main>` padding `p:{ xs:1.5, sm:3 }`
- [x] 2.4 Companies + Campaigns force `cards` view on mobile (`companiesViewEff`/`campaignsViewEff`); ViewToggle hidden on mobile; desktop pref untouched
- [x] 2.5 `DataTable` scroll container: `WebkitOverflowScrolling:'touch'` + `overscrollBehaviorX:'contain'` (momentum + no scroll-chaining)
- [~] 2.6 Filter `Select`s already `flexWrap` and fit < 360px (wrap, no overflow) — deferred aggressive full-width restyle to Phase 3 polish

## 3. Phase 2 — DataTable stacked-card mobile layout (the real win)
- [ ] 3.1 Add optional `priority?: 'primary'|'secondary'|'hidden'` to `DataTableColumn`
- [ ] 3.2 `DataTable` `xs` render path: one stacked card per row (`label: value` from existing columns/renderers); primary = title; Actions = button row
- [ ] 3.3 Apply across Campaign Report, Contacts (`ContactsView`), SIP Trunks (`SipTrunksPanel`), Campaign Detail call table; set sensible `priority` per table
- [ ] 3.4 `CampaignModal` wizard: StepRail → compact progress on `xs`; step content scrolls in the full-screen sheet

## 4. Phase 3 — nav + polish + a11y (closes #15)
- [ ] 4.1 Bottom tab bar for top views (Control Room / Campaigns / Contacts / Report); retire the radial (design Option A)
- [ ] 4.2 Charts: `width:100%` + fixed height, no fixed px widths; insight grid `xs:12` everywhere
- [ ] 4.3 Touch targets ≥44px; focus-visible; `aria-label` coverage sweep
- [ ] 4.4 Responsive QA checklist (issue #15) at 360/390/414/768px + on-device via clauto

## 5. Validate
- [ ] 5.1 `npx tsc --noEmit` clean; lint no new errors; `npm run build` green
- [ ] 5.2 `openspec validate --strict mobile-responsive-ux`
- [ ] 5.3 Sync `responsive-ui` spec → `openspec/specs/`; archive when shipped
