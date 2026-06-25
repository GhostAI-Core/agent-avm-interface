## 1. Dependency + shared table

- [x] 1.1 Add `@mui/x-data-grid@^9.6.0` and verify it peers with `@mui/material ^9.0.0`
- [x] 1.2 Build `components/ui/DataTable.tsx` — themed DataGrid wrapper: toolbar (Columns/Filters/Export) + quick-filter Search, checkbox selection, pagination (default 10), dense rows, dark-glass theming, `onRowClick`, row-click vs selection/action separation

## 2. List-view conversions

- [x] 2.1 Companies table → `DataTable` (preserve columns, CPL formatting, row click → control room)
- [x] 2.2 Campaigns table → `DataTable` (Agent/Status chips, Window/Speed, Actions column with play/pause/stop/edit/reuse/archive; action clicks don't trigger row click)
- [x] 2.3 Campaign Report table → `DataTable` (REPORT_KEYS numeric columns, Duration/CPL/Spent, row click → detailed report)
- [x] 2.4 Default the Companies/Campaigns list view to `table` (honor saved preference)
- [x] 2.5 Call Quality table → `DataTable`
- [x] 2.6 Telephony SIP Providers panel → `DataTable` (+ Enabled column + Actions) — via CrudSection
- [x] 2.7 Telephony Outbound Trunks panel → `DataTable` (numbers summary column, Enabled, Actions) — via CrudSection

## 3. Telephony editing

- [x] 3.1 Trunk numbers display: single number vs "multiple" in the list
- [x] 3.2 Trunk on/off toggle (client-side; flagged for backend persistence)
- [x] 3.3 Trunk numbers field: press-Enter chips with drag-to-reorder
- [x] 3.4 SIP provider edit drawer fields: Name / Host / Username / Password / Caller ID / Enabled — already present

## 4. Campaign editing

- [x] 4.1 Edit Campaign dialog: add name / agent / company / dialing speed / time window fields
- [x] 4.2 Add `name` + `company_id` to the `PUT /api/campaigns/[id]` allow-list

## 5. callops trunk proxies

- [x] 5.1 `POST /api/trunks` → callops `/livekit/trunks` (create/update), secret server-side
- [x] 5.2 `POST /api/trunks/test-call` → callops `/livekit/test-call` (phone + sip_trunk_id), 4xx pass-through, 502 on unreachable

## 6. Validation

- [x] 6.1 `npx tsc --noEmit` clean across all changed files
- [x] 6.2 `npx eslint` clean on changed files (no new findings vs baseline)
- [x] 6.3 `openspec validate callops-frontend-redesign --strict`
- [~] 6.4 Manual: run the app — structure/behavior verified; telephony page now matches Cale's mockup (custom tab bar, table-as-card, green Add pill, drawer). Companies/Campaigns/Report/CallQuality re-wired to the bespoke DataTable. Remaining eyeball: 7.4 expandable rows, 7.5 drawer field styling.
- [x] 6.5 Confirm with Cale: does re-POST `/livekit/trunks` update or duplicate a trunk? — ANSWERED: moot. callops `origin/main` (expand-callops-operational-api) added `PATCH`/`DELETE /livekit/trunks/{trunk_id}`; trunk edit/delete rewire tracked in the `callops-control-parity` change.
## 7. Rematch to Cale's HTML mockup (received 2026-06-25)

Mockup revealed his "DataGrid" is a BESPOKE CSS-grid table, not MUI X DataGrid. Pivot: rebuild the wrapper bespoke, port his exact styles, drop the dependency.

- [x] 7.1 Rebuild `components/ui/DataTable.tsx` as a bespoke CSS-grid table (zebra rows, #141414 header, sticky Actions, decorative toolbar, pagination footer, tinted action buttons, agent/status chip tints)
- [x] 7.2 Re-wire Companies / Campaigns / Campaign Report tables (app/page.tsx) to the bespoke DataTable
- [x] 7.3 Re-wire Call Quality + Telephony Providers/Trunks to the bespoke DataTable (+ telephony shell: custom tab bar, table-as-card, green Add pill, full-width)
- [ ] 7.4 Companies expandable rows (click → inline campaigns sub-table; sub-rows click → edit that campaign) per mockup — design agreed (simple: row expands, sub-rows navigate); `renderExpanded` capability on DataTable, accordion, accessible caret
- [ ] 7.5 Drawer restyle: 420px, label/input styling, switch pill, tag chips with drag handle + "Drag to reorder · press Enter to add"
- [x] 7.6 Remove `@mui/x-data-grid` dependency once nothing imports it
- [ ] 7.7 Re-validate (tsc/eslint/openspec) + manual eyeball vs mockup
