## Why

In the 2026-06-24 walkthrough videos Cale specced a dashboard redesign: every list page should default to a data table (his HTML mockup uses MUI X DataGrid — Columns/Filters/Export toolbar, search, pagination, checkbox selection, row actions), the telephony page needs richer provider/trunk editing, and Edit Campaign should edit the fields shown in the table — not just the script. This aligns the dashboard UI with the locked FE-zero-control split (the dashboard authors/displays; callops owns control) and unblocks the release. Much of this is already implemented on `fix/campaign-trunk-fk` (commit `9ebb56d`); this proposal documents it so it can be validated and archived through OpenSpec rather than landing spec-less.

## What Changes

- Convert all list tables — Companies, Campaigns, Campaign Report, Call Quality, Telephony SIP Providers + Outbound Trunks — to a shared themed MUI X DataGrid wrapper (`components/ui/DataTable.tsx`): toolbar (Columns / Filters / Export-CSV) + quick-filter Search, checkbox selection, pagination, an Actions column where applicable. Add `@mui/x-data-grid@^9.6.0`.
- Make the **table** the default list view (cards remain via the existing toggle; saved preference still wins).
- Telephony: SIP-provider edit drawer fields (Name / Host / Username / Password / Caller ID / Enabled); trunk numbers display (single number shown, 2+ shown as "multiple"); trunk on/off toggle; trunk numbers field as press-Enter chips with drag-to-reorder.
- Edit Campaign dialog gains fields matching the table — name, agent, company, dialing speed, time window — and the PUT whitelist gains `name` + `company_id`.
- callops contract proxies (server-side, secret never reaches the browser, mirroring the start/pause/stop proxy): `POST /api/trunks` → callops `/livekit/trunks` (create/update), `POST /api/trunks/test-call` → `/livekit/test-call`.

## Capabilities

### New Capabilities
- `datagrid-list-tables`: a shared DataGrid-based list table (toolbar, search, pagination, selection, actions column, dark-glass theming) and its adoption across the Companies, Campaigns, Campaign Report, Call Quality, and Telephony Providers/Trunks views, with table as the default view.
- `campaign-edit-fields`: the Edit Campaign dialog edits the table-visible fields (name, agent, company, dialing speed, time window) and persists them via the campaign PUT route.

### Modified Capabilities
- `voip-provider-config`: SIP provider/trunk editing gains the drawer field set, trunk numbers display rule (single vs "multiple"), on/off toggle, press-Enter chips with reorder, and dashboard→callops proxies for trunk create/update and test-call.

## Impact

- **Frontend**: `app/page.tsx` (Companies/Campaigns/Report tables), `components/CallQuality.tsx`, `components/TelephonyView.tsx` (Providers/Trunks panels), `components/telephony/EntityFormDrawer.tsx`, `components/CampaignActionDialog.tsx`; new `components/ui/DataTable.tsx`.
- **API**: new `app/api/trunks/test-call/route.ts`; `app/api/trunks/route.ts` (POST proxy); `app/api/campaigns/[id]/route.ts` (PUT whitelist + `name`/`company_id`).
- **Dependencies**: add `@mui/x-data-grid@^9.6.0` (MIT; peers with `@mui/material ^9.0.0`).
- **Out of scope / blocked on Cale** (documented, not built here): company + campaign CRUD payloads (Create/Edit/Archive endpoints), recorder endpoint + provider-field source, agent script-per-campaign endpoint, campaign report endpoint, and trunk on/off **persistence** (`sip_trunks.enabled` column + setter — toggle is browser-local until then). Dispatch rules deprioritized. `voice-script-reuse` is a separate existing change and is not duplicated here.
