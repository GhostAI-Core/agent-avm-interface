# Agent AVM — Frontend Architecture

This document describes how the **Agent AVM Interface** frontend is structured: the tech stack, routing model, state management, component hierarchy, data flow to the backend, and how each major screen connects to the rest of the application. It is intended as a detailed reference for developers and as a source document for tools like NotebookLM.

---

## 1. Product overview

**Agent AVM** is a web dashboard for managing outbound IVR/voice campaigns in South Africa. Operators use it to:

- Create and control dialing campaigns (start, pause, stop, archive)
- Monitor live campaign stats and call outcomes
- Review per-campaign reports and call-level logs
- Analyze call quality via intent waterfalls
- Manage companies and contacts
- Configure voice recordings (upload or AI-generated TTS)
- Audit security events

The UI is branded **EVRA** (green-on-dark theme) and targets call-center engineers and administrators.

---

## 2. Technology stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Framework | **Next.js 16** (App Router) | Authenticated dashboard shell at `app/page.tsx`; standalone `/tv` and `/flow-builder` routes live alongside it |
| UI library | **MUI v9** (`@mui/material`) | Components, theming, layout |
| Styling | **Emotion** (via MUI) + **Tailwind CSS v4** | MUI `sx` props for component styling; global CSS variables in `app/globals.css` |
| Charts | **Chart.js** + **react-chartjs-2** | Dashboard charts in `components/Charts.tsx` and `components/InsightCharts.tsx` |
| Auth & data | **Supabase** (`@supabase/ssr`, `@supabase/supabase-js`) | Browser client for login; server client for API routes |
| Language | **TypeScript** | Shared types in `types/index.ts` and `types/telephony.ts` |

There is **no** global state library (Redux, Zustand, etc.). State lives in React hooks inside `app/page.tsx` and individual view components.

---

## 3. Application entry and shell

### 3.1 File layout (frontend-relevant)

```
app/
  layout.tsx          # Root HTML shell, font, Providers wrapper
  page.tsx            # Entire authenticated app (single client component)
  globals.css         # CSS variables, utility classes
components/
  Providers.tsx       # MUI ThemeProvider + CssBaseline
  Sidebar.tsx         # Desktop/mobile navigation drawer
  TopBar.tsx          # Sticky header with title, live indicator, logout
  FloatingNav.tsx     # Mobile-only radial quick-nav FAB
  AuthView.tsx        # Login screen (unauthenticated)
  InsightDashboard.tsx # Control Room widget grid
  ProductsView.tsx    # CallOps product + script-version management
  ContactsView.tsx    # Campaign contact list/actions
  LeadsView.tsx       # Lead-generation report table
  CampaignModal.tsx   # 5-step new-campaign wizard
  ... (view components, ui primitives, telephony subfolder)
lib/
  theme.ts            # MUI theme from design tokens
  tokens.ts           # EVRA color/spacing/typography tokens
  dashboardInsights.tsx # Insight widget registry
  useDashboardLayout.ts # Dashboard layout persistence hook
types/
  index.ts            # Campaign, Report, CallRecord, etc.
utils/supabase/
  client.ts           # Browser Supabase client (singleton)
  server.ts           # Server Supabase client (API routes)
  auth.ts             # getAuthUser() for API route protection
  middleware.ts       # Session cookie refresh
```

### 3.2 Bootstrap sequence

```
app/layout.tsx
  └── Providers (MUI dark theme, CssBaseline)
        └── app/page.tsx
```

1. **`app/layout.tsx`** loads the Michroma display font, sets page metadata, and wraps children in `Providers`.
2. **`components/Providers.tsx`** builds a fixed dark MUI theme via `lib/theme.ts` and exposes `ColorModeContext` (toggle is currently a no-op; mode is always dark).
3. **`app/page.tsx`** is a large `'use client'` component that owns the full application after hydration.

### 3.3 Authentication gate

`app/page.tsx` implements a three-state auth flow:

1. **Loading** (`!authChecked`) — shows a centered "Loading…" message while Supabase session initializes (4s fallback timeout prevents infinite spinner).
2. **Unauthenticated** (`!auth`) — renders `AuthView` full-screen.
3. **Authenticated** — renders the main shell: `Sidebar` + `TopBar` + view content + overlays.

Session handling:

- `supabase.auth.onAuthStateChange` subscribes on mount and calls `resolveUserRole()` from `lib/roles.ts` to sync the user's `admin` or `engineer` role from the `profiles` table.
- **Inactivity logout**: 15 minutes without mouse/keyboard activity triggers `signOut`.
- **401 handling**: `getJson()` helper signs the user out if any API returns 401.

`proxy.ts` (Next.js middleware) runs `updateSession()` on every request to refresh Supabase auth cookies without blocking on `getUser()`.

---

## 4. Navigation model

The app uses **client-side view switching**, not URL-based routing. A single string state `view` in `app/page.tsx` determines which screen is shown.

### 4.1 View IDs and titles

| `view` value | Screen title | Primary component |
|--------------|--------------|-------------------|
| `dashboard` | Control Room | `InsightDashboard` + scope filters |
| `companies` | Companies | Inline JSX in `page.tsx` |
| `campaigns` | Campaigns | Inline JSX in `page.tsx` |
| `products` | Products | `ProductsView` |
| `contacts` | Contacts | `ContactsView` |
| `leads` | Leads | `LeadsView` |
| `reports` | Campaign Report | Inline table or `CampaignDetail` |
| `quality` | Call Quality | `CallQuality` |
| `telephony` | Telephony | `TelephonyView` |
| `security` | Security Audit Log | `SecurityView` |
| `settings` | System Settings | `SettingsView` |
| `profile` | Profile & Appearance | `ProfileView` |

Navigation is triggered by:

- **`Sidebar`** — permanent drawer on `lg+`, temporary drawer on smaller screens. Groups: Campaigns, Telephony, Operations, Platform.
- **`FloatingNav`** — mobile-only (`xs`–`md`) radial menu fixed bottom-right. Includes the high-traffic dashboard/company/campaign/report/lead/quality/security/settings destinations; Telephony, Products, Contacts, and Profile remain Sidebar-only.
- **Deep links within views** — e.g. clicking a company/campaign card calls `openInControlRoom(company, campaignId?)` which sets filters and switches to `dashboard`.

### 4.2 Responsive layout

```
┌─────────────────────────────────────────────────────────┐
│ Sidebar (lg+)  │  TopBar (title, live dot, tour, logout) │
│                ├─────────────────────────────────────────┤
│  NAV_GROUPS    │  <main> — active view content           │
│                │                                         │
│  Replay tour   │  FloatingNav (mobile only, bottom-right)│
└────────────────┴─────────────────────────────────────────┘
```

---

## 5. Central state in `app/page.tsx`

Almost all shared application state lives in `Page()` inside `app/page.tsx`. Child views receive data via props; they do not fetch global lists independently (except where noted).

### 5.1 Core state variables

| State | Type | Purpose |
|-------|------|---------|
| `auth`, `authChecked`, `role` | boolean / boolean / `AppRole` | Login gate and role for admin-only UI |
| `view` | string | Active screen |
| `campaigns` | `Campaign[]` | Campaign list returned by CallOps |
| `liveStatus` | `Record<number, CampaignLiveStatus>` | Real-time callops stats per running campaign |
| `reports` | `CampaignReport[]` | Aggregated campaign metrics |
| `allCalls` | call log rows | Per-call records for dashboard insights |
| `allIntents` | intent stat rows | Intent waterfall data (today) |
| `companiesList` | `Company[]` | Company records with contacts |
| `securityLogs` | audit rows | Security events |
| `filterAgent`, `filterDate` | strings | Report view filters |
| `companyFilter`, `campaignFilter` | strings | Control Room scope (`''` = all) |
| `selectedCampaign` | `CampaignReport \| null` | Drill-down in reports view |
| `detailedLogs` | call rows | Per-campaign call list for `CampaignDetail` |
| `showModal`, `campaignAction`, `showCompanyModal` | booleans / objects | Dialog visibility |
| `tourStep` | `number \| null` | Guided tour step index |
| `companiesView`, `campaignsView` | `'cards' \| 'table'` | List layout preference (localStorage) |

### 5.2 Data loading lifecycle

**On login** (`auth === true`), a parallel `Promise.allSettled` fetches:

- `GET /api/campaigns`
- `GET /api/security`
- `GET /api/companies`
- `GET /api/logs`
- `GET /api/intents?date={today}`

**On filter change** (`filterAgent`, `filterDate`), only `GET /api/reports` is re-fetched.

**Polling** (default every 15s via `NEXT_PUBLIC_POLL_INTERVAL_MS`):

- Campaigns, reports, logs, intents
- Skips when `document.visibilityState === 'hidden'`
- Also calls `refreshLiveStatus()` for running/paused campaigns via `GET /api/campaigns/{id}/status`

### 5.3 Scoped dashboard data

When `companyFilter` or `campaignFilter` is set, derived arrays feed the Control Room:

- `dashCampaigns` — campaigns in scope
- `dashReports` — reports filtered by campaign IDs in scope
- `dashCalls` — call logs filtered likewise
- `dashIntents` — intent stats filtered likewise

These are passed to `InsightDashboard` as `ctx`.

### 5.4 Campaign lifecycle actions

`updateStatus(id, status)` in `page.tsx`:

- **`running` / `paused` / `stopped`** → `POST /api/campaigns/{id}/{start|pause|stop}` (proxied to evra-callops; secret never exposed to browser)
- **Other statuses** (e.g. `archived`) → `PUT /api/campaigns/{id}` with JSON body

After any status change, `fetchData()` refreshes campaigns and reports.

---

## 6. API surface (frontend consumer)

All frontend `fetch()` calls go to Next.js Route Handlers under `app/api/`. Browser-facing routes check Supabase auth either as a session (`getAuthUser()`) or as a bearer token forwarded to CallOps (`getAccessToken()`).

| Endpoint | Method | Used by | Returns |
|----------|--------|---------|---------|
| `/api/campaigns` | GET | page.tsx | `{ campaigns }` |
| `/api/campaigns` | POST | CampaignModal, CampaignActionDialog | `{ campaign, contacts_imported?, contacts_rejected? }` |
| `/api/campaigns/{id}` | GET, PUT, DELETE | CampaignDetail, CampaignActionDialog, archive actions | summary/read, updated campaign, or archive success |
| `/api/campaigns/{id}/{action}` | POST | page.tsx (`start`/`pause`/`stop`) | callops result |
| `/api/campaigns/{id}/status` | GET | page.tsx live polling | `CampaignLiveStatus` |
| `/api/campaigns/{id}/contacts` | GET | ContactsView | `{ items, page, page_size, total, breakdown }` |
| `/api/campaigns/{id}/contacts/import` | POST | contact import flows | CallOps import summary |
| `/api/contacts/{id}/{action}` | POST | ContactsView | action result (`archive`, `retry`, `do-not-call`) |
| `/api/products*` | GET/POST/PATCH | ProductsView, CampaignModal, CampaignActionDialog | products + script versions |
| `/api/reports` | GET | page.tsx, `/tv` | `{ reports }` — query: `agent`, `product_id`, `from`, `to` |
| `/api/logs` | GET | page.tsx, CampaignDetail flow | `{ logs }` — query: `campaignId` |
| `/api/intents` | GET | page.tsx, CallQuality | `{ intents, connectedTotal }` |
| `/api/companies` | GET, POST | page.tsx | `{ companies }` |
| `/api/leads` | GET | LeadsView | `{ leads, total, double_optin, single_optin }` |
| `/api/security` | GET | page.tsx | `{ logs }` |
| `/api/trunks` | GET | CampaignModal | `{ trunks }` — SIP trunk picker |
| `/api/settings` | GET, PATCH | SettingsView, CostBreakdown | CallOps cost-per-minute settings |
| `/api/dashboard-templates` | GET, POST, DELETE | useDashboardLayout | saved layouts |
| `/api/tts/generate` | POST | VoiceGenerator | base64 audio |
| `/api/tts/save` | POST | VoiceGenerator | public URL for recording |
| `/api/voice-scripts` | GET, POST | VoiceGenerator | global script reuse library |
| `/api/script-audio` | GET, POST | CampaignModal, CampaignActionDialog | per-campaign generated script history |

Voice file uploads for new campaigns go **directly to Supabase Storage** (`voice-recordings` bucket) from the browser, then the storage path is sent to `POST /api/campaigns` as `audio_path`.

---

## 7. Screen-by-screen breakdown

### 7.1 AuthView (`components/AuthView.tsx`)

Full-screen login before the main app loads.

- **Password mode**: `supabase.auth.signInWithPassword` → `onAuth(true, role)`.
- **Passkey mode**: UI exists but sign-in via passkey is not implemented; users can link a passkey after password login (WebAuthn credential stored in `profiles.passkey_credential`).
- Requires HTTPS or localhost for biometric features (`isSecure` prop).

### 7.2 Control Room — `dashboard` view

The primary operational screen.

**Header** (in `page.tsx`):

- Company `<Select>` — `companyFilter`
- Campaign `<Select>` — `campaignFilter` (scoped to selected company)

**Body** — `InsightDashboard`:

- Receives `dash` from `useDashboardLayout()` hook
- Receives `ctx` with scoped `reports`, `calls`, `intents`, `campaigns`, and `actions` (play/pause/stop/edit/reuse/archive callbacks)

See [Section 8](#8-control-room-insight-system) for the insight widget architecture.

### 7.3 Companies — `companies` view

Rendered inline in `page.tsx` (not a separate file).

- **Card or table view** toggled via `ViewToggle`; preference stored in `localStorage` (`avm.view.companies`).
- **Company stats** derived client-side: active campaigns, total campaigns, CPL from `reports`.
- **"+ New Company"** opens a MUI Dialog; `POST /api/companies` then refreshes list.
- Clicking a row/card calls `openInControlRoom(companyName)`.

### 7.4 Campaigns — `campaigns` view

Also inline in `page.tsx`.

- Lists all campaigns with `AgentChip`, `StatusChip`, schedule/speed info.
- **Live stats strip** on cards when `liveStatus[campaign.id]` exists (active, queued, dialed, failed).
- **Actions** on each card: Play/Pause, Stop, Edit, Reuse, Archive — same handlers as Control Room `actions`.
- **"+ New Campaign"** opens `CampaignModal`.
- Card/table toggle persisted in `localStorage` (`avm.view.campaigns`).

### 7.5 Products — `products` view

`ProductsView` manages CallOps products for one selected company.

- `GET /api/products?company_id=...` lists products and scopes the view to a company.
- New products post `{ company_id, name, integration_type, sts_product_key?, active? }` to `/api/products`.
- Product edit uses `PATCH /api/products/{id}`.
- Script-version history uses `/api/products/{id}/versions`; activating an older version posts to `/api/products/{id}/versions/{versionId}/activate`.
- These products are not just labels: the campaign wizard can send `product_id`/`product_version_id`, and CallOps derives script, consent-flow, routing mode, agent, and STS product from them.

### 7.6 Contacts — `contacts` view

`ContactsView` shows campaign contacts from CallOps.

- Lists contacts through `GET /api/campaigns/{id}/contacts` with status/search/network pagination.
- Displays the whole-campaign network breakdown returned by the same proxy.
- Row actions post to `/api/contacts/{id}/archive`, `/retry`, or `/do-not-call`.
- CSV/import operations should go through `/api/campaigns/{id}/contacts/import` so CallOps owns dedupe, E.164 normalization, and rejection summaries.

### 7.7 Leads — `leads` view

`LeadsView` is the lead-generation report.

- Fetches `GET /api/leads`, which fans out across the user's CallOps companies.
- Shows both double opt-in leads and single opt-in records; counts are returned as `double_optin` and `single_optin`.
- Exports CSV with phone, resolved contact/campaign name, opt-in tier, timestamps, talk/on-air duration, and persisted per-call cost.

### 7.8 Campaign Report — `reports` view

Two sub-states:

1. **List** (`!selectedCampaign`): sortable table of all `reports` with product/legacy-agent, date/range filters, and CSV export (`handleExportCSV`).
2. **Detail** (`selectedCampaign` set): `CampaignDetail` with per-call rows from `GET /api/logs?campaignId=…`.

Clicking a report row calls `viewDetailedLogs(report)`.

### 7.9 Call Quality — `quality` view

`CallQuality` component:

- Campaign picker + date picker
- Fetches `GET /api/intents?campaignId=&date=`
- Renders intent waterfall table: count, % of connected, % dropped from previous row
- CSV export

Same calculation logic is duplicated in the `call-quality` insight widget inside `dashboardInsights.tsx`.

### 7.10 Security Audit — `security` view

`SecurityView` — read-only table of `securityLogs` passed from parent. Event types styled with MUI Chips (`login`, `unauthorized_access`, etc.).

### 7.11 Telephony — `telephony` view

`TelephonyView` — **mock/local-only** LiveKit telephony admin UI.

- State stored in browser via `useTelephonyStore()` from `lib/telephony-mock.ts` (localStorage).
- Seven tabs: Settings, SIP Providers, Outbound Trunks, Dispatch Rules, Agents, Test Dial, Status.
- Uses reusable `CrudSection` + `EntityFormDialog` from `components/telephony/`.
- **Not connected** to production callops or LiveKit APIs yet.

Note: Telephony appears in `Sidebar` but **not** in `FloatingNav`.

### 7.12 Settings — `settings` view

`SettingsView` loads CallOps platform settings from `GET /api/settings` and lets admins update `cost_per_minute_zar` with `PATCH /api/settings`. Non-admin users can view the current carrier cost-per-minute rate but cannot edit it.

`CostBreakdown` also reads `/api/settings` so campaign/call detail cost explanations use the same configured rate as CallOps.

### 7.13 Profile — `profile` view

`ProfileView`:

- Password reset via `supabase.auth.updateUser`
- Admin-only "Link Employee" section (UI mock with placeholder emails; invite not wired)

---

## 8. Control Room insight system

The Control Room is a **configurable dashboard** built from a registry of "insight" widgets.

### 8.1 Architecture

```
useDashboardLayout()          lib/dashboardInsights.tsx
        │                              │
        │ layout: { order,             │ INSIGHTS[] registry
        │   pinned, hidden }           │ each: id, title, size, render(ctx)
        ▼                              ▼
InsightDashboard ──────────► InsightCard (drag/pin/hide chrome)
                                      │
                                      └── def.render(ctx) → charts/tables/KPIs
```

### 8.2 Layout persistence

`lib/useDashboardLayout.ts`:

- **localStorage key**: `avm.dash.layout.v3`
- **Default layout**: `DEFAULT_INSIGHTS` visible; all other registered insights hidden (available via "Add insight" dropdown)
- **Operations**: pin (move to top), hide, drag-reorder, reset, save/apply templates
- **Templates**: `GET/POST /api/dashboard-templates` (stored in Supabase for team sharing)

### 8.3 Insight sizes (grid spans)

| Size | MUI Grid span (xs / sm / md) |
|------|------------------------------|
| `sm` | 6 / 4 / 3 (quarter width on desktop) |
| `md` | 12 / 12 / 6 (half width) |
| `lg` | 12 / 12 / 12 (full width) |

### 8.4 Insight registry (`INSIGHTS` in `lib/dashboardInsights.tsx`)

**Default visible insights** (`DEFAULT_INSIGHTS`):

- Tables: `campaigns-table`, `campaign-report`
- KPI cards: `dialed`, `connected`, `qualified`, `leads`, `avg-talk`, `on-air-total`, `avg-cpl`, `total-spent`
- Charts: `outcome-donut`, `campaign-compare`, `spend-cpl`, `cost-breakdown`, `funnel`

**Add-on insights** (hidden by default, user can add):

- KPIs: `transfer-rate`, `voicemail`, `no-answer`, `spend-efficiency`, `active-campaigns`
- Charts: `company-compare`, `calls-trend`, `busiest-hours`, `talk-distribution`, `dropoff`, `status-breakdown`, `agent-split`
- Tables: `recent-calls`, `leaderboard`, `call-quality`

Each insight's `render(ctx)` receives `InsightCtx`:

```typescript
interface InsightCtx {
  reports: CampaignReport[]
  calls: DashCall[]      // CallRecord + campaign_id
  intents: DashIntent[]  // IntentStat + campaign_id
  campaigns: Campaign[]
  actions?: CampaignActions  // lifecycle buttons on campaigns-table
}
```

### 8.5 Chart components

| Component file | Used for |
|----------------|----------|
| `components/Charts.tsx` | `OutcomeDonut`, `FunnelChart`, `CampaignBar`, `SpendChart` — styled Chart.js charts using `lib/chartTheme.ts` |
| `components/InsightCharts.tsx` | `BarChart`, `LineChart`, `DonutChart`, `Sparkline`, `MiniBars` — lighter charts for KPI sparklines and add-on insights |

`components/KpiStrip.tsx` exists as a standalone KPI row component but is **not currently mounted** in `app/page.tsx` (superseded by individual insight KPI cards).

---

## 9. Modals and overlays

| Component | Trigger | Purpose |
|-----------|---------|---------|
| `CampaignModal` | "+ New Campaign" | 5-step wizard: Basics → Trunk → Voice → Contacts → Schedule |
| `CampaignActionDialog` | Edit / Reuse on campaign | Edit MP4 URL or clone campaign with new CSV |
| `SaveTemplateDialog` | "Save layout template" on dashboard | Names and saves current insight layout |
| `TutorialOverlay` | First visit or "Replay tour" / `?` button | Spotlight guided tour (`TOUR_STEPS`) |
| Chart expand `Dialog` | (legacy path in page.tsx) | Full-screen chart with campaign filter — `expandedChart` state exists but no current UI sets it |
| New Company `Dialog` | "+ New Company" | Inline in `page.tsx` |

### 9.1 CampaignModal flow (detail)

**Step 1 — Basics**: campaign name, company (required), and optional product.

- Product options load from `GET /api/products?company_id=...`.
- Selecting a product preloads its current script version via `GET /api/products/{id}` + `GET /api/products/{id}/versions`.
- The submitted campaign sends `product_id`; when a version is pinned, `product_version_id` can be sent too. CallOps derives routing mode, STS product, agent, script URL, and voice from the product/version.

**Step 2 — Trunk**: SIP trunk picker (`GET /api/trunks`).

- Empty selection means "default trunk (env)".
- Selected values are persisted as `sip_trunk_id`, the integer persisted trunk row id CallOps resolves to the LiveKit trunk.

**Step 3 — Voice**:

- **Audio Upload** uploads an audio file directly to Supabase Storage bucket `voice-recordings`; max size is 50 MB. The private storage key becomes `audio_path`.
- **Generate AI Script** embeds `VoiceGenerator`; saved generated audio returns a public URL and selected Inworld `voice_id`.
- The script/audio length feeds the schedule estimate when available.

**Step 4 — Contacts**: CSV contact list parsed by `lib/parseCsv.ts`; max size is 15 MB and requires a `phone` column (also supports `first_name`, `last_name`).

**Step 5 — Schedule**: dialing speed, max concurrent calls, network filter, max retries, retry cooldown, date range, and daily calling window. The estimator compares the rate limit against the concurrency limit using script duration plus the DTMF response window.

Submit → `POST /api/campaigns` with product, trunk, voice, contact, network, and schedule fields. If the voice was generated and has script text, the modal best-effort posts `/api/script-audio` after campaign creation so the generated script can be reloaded later; this history write never blocks campaign creation.

### 9.2 VoiceGenerator (`components/VoiceGenerator.tsx`)

Embedded in `CampaignModal` step 3 when voice mode is "generate".

1. User picks Inworld voice (gender, ethnicity, voice ID) from `lib/inworld-voices.ts`
2. Existing reuse bubbles load from `GET /api/voice-scripts`; clicking a bubble loads its text/voice for editing, and the play icon previews its saved audio without changing the editor.
3. User enters or edits script text
4. **Preview**: `POST /api/tts/generate` → plays base64 audio in browser
5. **Save**: `POST /api/tts/save` → uploads the generated audio and returns a public URL stored as `voice_recording_url` on the campaign

After save, `VoiceGenerator` refreshes `/api/voice-scripts` so newly saved scripts appear as reuse bubbles when CallOps has persisted the library metadata.

---

## 10. UI primitives (`components/ui/`)

| Component | Role |
|-----------|------|
| `AgentChip` | Colored chip for agent persona (`seeker`, `grace`, `sangoma`) — colors from `lib/tokens.ts` `agentChipTone()` |
| `StatusChip` | Campaign/call outcome status chip; special case for `auto_paused` (callops paused outside time window) |
| `GlassCard` | Semi-transparent card surface used in tables and insight cards |
| `WizardChrome` | `WizardHeader`, `StepRail`, `SectionLabel` — shared chrome for `CampaignModal` |

---

## 11. Design system

### 11.1 Tokens (`lib/tokens.ts` + `app/globals.css`)

- **Brand green**: `#37A660` (primary actions, accents)
- **Backgrounds**: layered grays `#1F1F1F` → `#5C5C5C`
- **Semantic colors**: positive (green), negative (red `#E0524F`), warning, info
- **Agent colors**: seeker, grace, sangoma each have dedicated hues for chips and TopBar legend

### 11.2 MUI theme (`lib/theme.ts`)

`buildTheme('dark')` applies flat surfaces (no elevation shadows), green primary buttons, custom table headers, drawer/sidebar styling. Typography uses system/body font from tokens; display headings use Michroma via CSS class `logo-wordmark`.

### 11.3 Global CSS utilities (`app/globals.css`)

- CSS variables mirror `lib/tokens.ts`
- `.mono` class for tabular numeric data
- `@keyframes livePulse` for TopBar live indicator

---

## 12. Types and domain model (`types/index.ts`)

Key entities the frontend works with:

| Type | Description |
|------|-------------|
| `Agent` | `'seeker' \| 'grace' \| 'sangoma'` — voice persona label |
| `CampaignStatus` | `draft`, `running`, `paused`, `stopped`, `completed`, `archived`, `deleted` |
| `Campaign` | Campaign config: name, agent, status, dialing_speed, time window, sip_trunk_id, voice URLs, company |
| `CampaignLiveStatus` | Real-time stats from callops: active_calls, queued, dialed, failed, etc. |
| `CampaignReport` | Aggregated metrics per campaign: dialed, connected, qualified, outcomes, CPL, spend |
| `CallRecord` | Individual call: phone, outcome, talk_seconds, cost, transferred, recording_url |
| `IntentStat` | IVR intent name, step, reached count |
| `Company` | Client company with optional contact fields |
| `DashboardLayout` | `{ order: string[], pinned: string[], hidden: string[] }` |

---

## 13. Roles and permissions

| Role | Source | UI impact |
|------|--------|-----------|
| `admin` | `profiles.role` or `user_metadata.role` | Settings warning hidden; Profile shows employee invite section |
| `engineer` | Default fallback role | Full operational access; settings are read-only message |

Role is resolved on login and stored in `page.tsx` `role` state. Most views do not gate on role today — only Settings and Profile partially do.

---

## 14. Security and privacy (frontend)

- **Phone masking**: `maskPhone()` from `lib/security.ts` used in `CampaignDetail`, `recent-calls` insight, CSV exports
- **Session cookies**: refreshed by middleware; API routes reject unauthenticated requests with 401
- **Secrets**: callops API keys and LiveKit credentials never sent to browser; lifecycle actions proxied server-side
- **Passkeys**: credential stored in Supabase `profiles` table (experimental)

---

## 15. LocalStorage keys

| Key | Purpose |
|-----|---------|
| `avm.dash.layout.v3` | Dashboard insight layout |
| `avm.view.companies` | Companies list: `cards` or `table` |
| `avm.view.campaigns` | Campaigns list: `cards` or `table` |
| `avm.tour.seen` | Suppresses auto-start of guided tour |
| Telephony mock keys | Managed inside `lib/telephony-mock.ts` |

---

## 16. Guided tour (`TutorialOverlay`)

- **Steps**: defined in `TOUR_STEPS` export from `components/TutorialOverlay.tsx`
- **Mechanism**: steps with `view` switch `page.tsx` view; steps with `target` spotlight DOM elements by `data-tour` attribute
- **Auto-start**: first authenticated visit if `avm.tour.seen` is unset
- **Replay**: Sidebar footer link or TopBar `?` button

Elements tagged with `data-tour`: sidebar nav items (`nav-dashboard`, etc.), dashboard header (`dash-header`, `dash-scope`, `dash-templates`, `add-insight`), new company/campaign buttons.

---

## 17. Environment variables (frontend-relevant)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/publishable key |
| `NEXT_PUBLIC_POLL_INTERVAL_MS` | Dashboard polling interval (default 15000) |

Server-only vars (not in browser, but affect API responses the UI consumes): `LIVEKIT_*`, callops URLs, TTS provider keys, etc.

---

## 18. Data flow diagram (end-to-end)

```
┌──────────────┐     signIn      ┌─────────────┐
│   AuthView   │ ──────────────► │  Supabase   │
└──────────────┘                 │    Auth     │
       │                         └──────┬──────┘
       │ onAuth(true)                   │ session cookies
       ▼                                ▼
┌──────────────────────────────────────────────────┐
│              app/page.tsx (state hub)             │
│  campaigns · reports · calls · intents · companies│
└────────┬─────────────────────────────┬───────────┘
         │ fetch /api/*                 │ props
         ▼                              ▼
┌─────────────────┐          ┌─────────────────────┐
│  Route Handlers │          │  View components     │
│  + CallOps proxy│          │  InsightDashboard    │
│  + local storage│          │  CampaignModal       │
└────────┬────────┘          │  CallQuality, etc.   │
         │                   └─────────────────────┘
         ▼
┌─────────────────┐
│  evra-callops   │  start/pause/stop campaigns
│  LiveKit SIP    │  actual outbound dialing
│  Agent workers  │  outbound-recorder joins calls
└─────────────────┘
```

**Campaign creation flow:**

```
CampaignModal → parse CSV → upload voice (optional) → POST /api/campaigns
  → CallOps campaigns + contacts import → user starts campaign
  → POST /api/campaigns/{id}/start → callops dials via LiveKit
  → CallOps records outcomes/reports → UI polls /api/logs and /api/reports
```

---

## 19. Component dependency graph (simplified)

```
page.tsx
├── Sidebar
├── TopBar
├── [view content]
│   ├── InsightDashboard
│   │   ├── InsightCard (×N)
│   │   │   └── dashboardInsights render → Charts / InsightCharts / tables
│   │   └── useDashboardLayout
│   ├── CallQuality
│   ├── SecurityView
│   ├── SettingsView
│   ├── TelephonyView
│   │   └── telephony/CrudSection → EntityFormDialog
│   ├── ProfileView
│   └── CampaignDetail
├── CampaignModal
│   ├── ui/WizardChrome
│   └── VoiceGenerator
├── CampaignActionDialog
├── SaveTemplateDialog
├── TutorialOverlay
├── FloatingNav
└── AuthView (when logged out)
```

---

## 20. Known limitations and placeholders

1. **Dashboard view state is not URL-addressable** — the authenticated dashboard shell uses client-side view switching, so refreshing `app/page.tsx` lands on Control Room default. Standalone `/tv` and `/flow-builder` routes are separate pages.
2. **STS Dashboard** — empty placeholder.
3. **Telephony view** — mock localStorage only; not production telephony management.
4. **Settings** — no editable platform config in UI.
5. **Passkey login** — registration UI exists; passwordless sign-in not implemented.
6. **Profile employee invite** — UI only; no backend invite flow.
7. **KpiStrip** — component exists but unused in current page layout.
8. **Chart expand dialog** — state and dialog JSX exist in `page.tsx` but no button currently sets `expandedChart`.
9. **FloatingNav** — missing Products, Contacts, Telephony, and Profile entries compared to Sidebar.

---

## 21. Related documentation

| Document | Focus |
|----------|-------|
| `docs/livekit-outbound-integration.md` | Backend dialer pipeline, callops, webhooks |
| `docs/app-api-reference.md` | API route reference |
| `types/index.ts` | TypeScript domain types |
| `lib/dashboardInsights.tsx` | Full insight widget registry source |

---

*Last aligned with codebase: Agent AVM v0.1.0, Next.js 16, MUI 9, CallOps-backed product/script workflows.*
