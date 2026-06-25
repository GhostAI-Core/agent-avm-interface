## Context

The dashboard's list views were a mix of cards and hand-rolled MUI `<Table>`s with no shared toolbar, search, pagination, or selection. Cale's 2026-06-24 walkthrough mockups (his HTML) standardize every list on a MUI X DataGrid look. Separately, the callops endpoint contract (FE-zero-control) requires the dashboard to proxy trunk management server-side, and operators asked for richer trunk/provider editing and an Edit Campaign that covers the table fields. The branch `fix/campaign-trunk-fk` (commit `9ebb56d`) already implements the trunk proxies, trunk drawer chips/display/toggle, Edit Campaign fields, default-table view, and a first `DataTable` wrapper + the three `app/page.tsx` table conversions; this change documents and finishes that work.

## Goals / Non-Goals

**Goals:**
- One reusable, themed DataGrid wrapper used by every list view, matching the mockup (Columns/Filters/Export toolbar, Search, pagination, checkbox selection, Actions).
- Table as the default list view, preserving the cards toggle and saved preference.
- Telephony: provider/trunk drawers, trunk numbers display rule, on/off toggle, press-Enter chips with reorder, and the callops trunk proxies.
- Edit Campaign edits the table-visible fields without weakening the existing script/reuse flows.

**Non-Goals:**
- Company + campaign CRUD endpoints (Cale owns the payloads — not built here).
- Recorder endpoint, agent script-per-campaign endpoint, campaign report endpoint (pending from Cale).
- Trunk on/off **persistence** (needs a `sip_trunks.enabled` column + setter; toggle is client-side only for now).
- Dispatch rules (deprioritized). `voice-script-reuse` (separate change).

## Decisions

- **Adopt `@mui/x-data-grid@^9.6.0`** rather than hand-rolling toolbar/search/pagination/selection. It pixel-matches the mockup with far less custom code and peers cleanly with `@mui/material ^9.0.0`. Cost: one MIT runtime dependency.
- **Single `DataTable` wrapper** owns theming and toolbar so all views stay consistent; views supply `GridColDef[]` + handlers. Row-click vs selection vs action is resolved with `disableRowSelectionOnClick` + `stopPropagation` on the Actions cell.
- **v9 composable toolbar** (`Toolbar` + `ColumnsPanelTrigger`/`FilterPanelTrigger`/`ExportCsv`/`QuickFilter`) over the deprecated `GridToolbar`, so the controls are themed via our own `Button`/`TextField`.
- **Trunk "update" re-POSTs create** (`/livekit/trunks`) because callops exposes no separate update endpoint — per Cale's instruction; flagged for confirmation that it upserts rather than duplicates.
- **Edit Campaign reuses the existing PUT route**; only `name` + `company_id` are added to its allow-list (the rest were already allowed).

## Risks / Trade-offs

- **DataGrid bundle weight** added to the app; acceptable for the UX parity and code reduction. Watch barrel-import bloat (per project perf guidance).
- **v9 composable toolbar is newer** — needs a visual smoke test that Columns/Filters panels, Export, and Search render correctly in the running app.
- **Trunk re-POST semantics**: if callops `POST /livekit/trunks` is not an upsert, editing a trunk could create a duplicate in LiveKit — confirm with Cale.
- **On/off toggle is non-persistent** until the backend column/setter exists — clearly documented so it isn't mistaken for durable state.
