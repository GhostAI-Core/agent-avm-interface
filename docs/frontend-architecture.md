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
| Framework | **Next.js 16** (App Router) | Authenticated shell at `app/page.tsx`; standalone `/flow-builder` POC route |
| UI library | **MUI v9** (`@mui/material`) | Components, theming, layout |
| Styling | **Emotion** (via MUI) + **Tailwind CSS v4** | MUI `sx` props for component styling; global CSS variables in `app/globals.css` |
| Charts | **Chart.js** + **react-chartjs-2** + **funnel-graph-js** | Legacy insight charts plus the Control Room funnel flow option |
| Flow canvas | **@xyflow/react** | Standalone campaign flow-builder POC at `/flow-builder` |
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
  flow-builder/page.tsx # Standalone visual flow-builder POC
  globals.css         # CSS variables, utility classes
components/
  Providers.tsx       # MUI ThemeProvider + CssBaseline
  Sidebar.tsx         # Desktop/mobile navigation drawer
  TopBar.tsx          # Sticky header with title, live indicator, logout
  FloatingNav.tsx     # Mobile-only radial quick-nav FAB
  AuthView.tsx        # Login screen (unauthenticated)
  ControlRoom.tsx     # Live operations dashboard mounted by page.tsx
  CampaignModal.tsx   # 3-step new-campaign wizard
  flow-builder/       # React Flow canvas, custom nodes, node spec registry
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

| `view` value | Navigation label | Primary component |
|--------------|--------------|-------------------|
| `dashboard` | Control Room | `ControlRoom` + scope filters |
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
- **`FloatingNav`** — mobile-only (`xs`–`md`) radial menu fixed bottom-right. Includes the high-frequency operator views; it does not include Products, Contacts, Telephony, or Profile.
- **Deep links within views** — e.g. clicking a company/campaign card calls `openInControlRoom(company, campaignId?)` which sets filters and switches to `dashboard`.
- **Standalone route** — `/flow-builder` is not part of the authenticated `view` switcher; it mounts its own full-height React Flow demo canvas.

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
| `campaigns` | `Campaign[]` | All non-archived campaigns |
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

These are passed to `ControlRoom` as `ctx`.

### 5.4 Campaign lifecycle actions

`updateStatus(id, status)` in `page.tsx`:

- **`running` / `paused` / `stopped`** → `POST /api/campaigns/{id}/{start|pause|stop}` (proxied to evra-callops; secret never exposed to browser)
- **Other statuses** (e.g. `archived`) → `PUT /api/campaigns/{id}` with JSON body

After any status change, `fetchData()` refreshes campaigns and reports.

---

## 6. API surface (frontend consumer)

All frontend `fetch()` calls go to Next.js Route Handlers under `app/api/`. User-facing routes check Supabase auth either by validating the session with `getAuthUser()` or by forwarding the user's bearer token from `getAccessToken()` to CallOps.

| Endpoint | Method | Used by | Returns |
|----------|--------|---------|---------|
| `/api/campaigns` | GET | page.tsx | `{ campaigns }` |
| `/api/campaigns` | POST | CampaignModal, CampaignActionDialog | `{ campaign }` |
| `/api/campaigns/{id}` | PUT | CampaignActionDialog (edit voice) | updated campaign |
| `/api/campaigns/{id}/{action}` | POST | page.tsx (`start`/`pause`/`stop`) | callops result |
| `/api/campaigns/{id}/status` | GET | page.tsx live polling | `CampaignLiveStatus` |
| `/api/campaigns/{id}/contacts` | GET | ContactsView | paged contact rows + network breakdown |
| `/api/campaigns/{id}/contacts/import` | POST | ContactsView CSV import | CallOps import summary |
| `/api/contacts/{id}/{action}` | POST | ContactsView row actions | action result |
| `/api/products` | GET, POST | ProductsView | company-scoped products |
| `/api/products/{id}` | GET, PATCH | ProductsView | product detail/update |
| `/api/products/{id}/versions` | GET, POST | ProductsView script manager | product script versions |
| `/api/products/{id}/versions/{versionId}/activate` | POST | ProductsView script manager | activated version |
| `/api/leads` | GET | LeadsView | lead rows + opt-in counts |
| `/api/reports` | GET | page.tsx | `{ reports }` — query: `agent`, `date` |
| `/api/logs` | GET | page.tsx, CampaignDetail flow | `{ logs }` — query: `campaignId` |
| `/api/intents` | GET | page.tsx, CallQuality | `{ intents, connectedTotal }` |
| `/api/companies` | GET, POST | page.tsx | `{ companies }` |
| `/api/security` | GET | page.tsx | `{ logs }` |
| `/api/trunks` | GET | CampaignModal | `{ trunks }` — SIP trunk picker |
| `/api/companies/{id}/sip-trunks` | GET, POST | TelephonyView | company-scoped SIP trunks |
| `/api/sip-trunks/{id}` | GET, PATCH | TelephonyView | trunk detail/update |
| `/api/sip-trunks/{id}/health` | GET | TelephonyView | trunk health |
| `/api/sip-trunks/{id}/test-call` | POST | TelephonyView | test call result |
| `/api/sip-trunks/{id}/archive` | POST | TelephonyView | archived trunk |
| `/api/dashboard-templates` | GET, POST, DELETE | useDashboardLayout | saved layouts |
| `/api/tts/generate` | POST | VoiceGenerator | base64 audio |
| `/api/tts/save` | POST | VoiceGenerator | public URL for recording |
| `/api/script-audio` | GET, POST | Campaign edit / script history | campaign-scoped script audio |
| `/api/flow-builder/generate` | POST | `/flow-builder` | generated flow nodes/edges preview |

Voice file uploads for new campaigns go **directly to Supabase Storage** (`voice-recordings` bucket) from the browser, then the storage path is sent to `POST /api/campaigns` as `voice_path`.

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

**Body** — `ControlRoom`:

- Receives `ctx` with scoped `reports`, `calls`, `intents`, and `campaigns`
- Receives `liveStatus` for active-call, queue, dialed, and failed counters
- Renders the fixed operations layout in `components/ControlRoom.tsx`

See [Section 8](#8-control-room-analytics-and-flow-builder-systems) for the analytics layout and the standalone flow-builder POC.

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

`ProductsView` manages the data-driven replacement for the hardcoded `campaigns.agent` pairing.

- Loads companies from `GET /api/companies`, then products for the selected company from `GET /api/products?company_id=...`.
- Creates products with `POST /api/products`; `sts_subscription` products require an `sts_product_key`.
- Toggles product active state with `PATCH /api/products/{id}`.
- Opens a script manager that uses `VoiceGenerator` plus `GET/POST /api/products/{id}/versions` and `POST /api/products/{id}/versions/{versionId}/activate`.

### 7.6 Contacts — `contacts` view

`ContactsView` is campaign-scoped.

- Loads the campaign selector from `GET /api/campaigns`.
- Reads paged contacts from `GET /api/campaigns/{id}/contacts`.
- Filters by status, search text, and network provider.
- The network filter also persists the campaign dial gate with `PUT /api/campaigns/{id}` (`network_provider`).
- CSV import parses rows client-side and forwards them to `POST /api/campaigns/{id}/contacts/import`; CallOps owns dedupe, E.164 normalization, and rejection summaries.
- Row actions are allowlisted calls to `POST /api/contacts/{id}/archive|retry|do-not-call`.

### 7.7 Leads — `leads` view

`LeadsView` lists contacts who pressed 1 in Lead-Gen campaigns.

- Fetches `GET /api/leads`.
- Shows double opt-in and single opt-in counts separately.
- Exports visible rows to CSV.

### 7.8 Campaign Report — `reports` view

Two sub-states:

1. **List** (`!selectedCampaign`): sortable table of all `reports` with agent/date filters and CSV export (`handleExportCSV`).
2. **Detail** (`selectedCampaign` set): `CampaignDetail` with per-call rows from `GET /api/logs?campaignId=…`.

Clicking a report row calls `viewDetailedLogs(report)`.

### 7.9 Call Quality — `quality` view

`CallQuality` component:

- Campaign picker + date picker
- Fetches `GET /api/intents?campaignId=&date=`
- Renders intent waterfall table: count, % of connected, % dropped from previous row
- CSV export

The legacy `call-quality` insight widget inside `dashboardInsights.tsx` uses the same intent waterfall concepts but is not the mounted Control Room implementation.

### 7.10 Security Audit — `security` view

`SecurityView` — read-only table of `securityLogs` passed from parent. Event types styled with MUI Chips (`login`, `unauthorized_access`, etc.).

### 7.11 Telephony — `telephony` view

`TelephonyView` has seven tabs: Settings, SIP Providers, Outbound Trunks, Dispatch Rules, Agents, Test Dial, Status.

- **Outbound Trunks** mounts `SipTrunksPanel` and is live through CallOps (`/api/companies/{id}/sip-trunks`, `/api/sip-trunks/{id}`, `/health`, `/test-call`, `/archive`).
- The other tabs still use `useTelephonyStore()` from `lib/telephony-mock.ts` and store data in this browser's localStorage.

Note: Telephony appears in `Sidebar` but **not** in `FloatingNav`.

### 7.12 Settings — `settings` view

`SettingsView` reads and updates the platform cost-per-minute setting via `GET/PATCH /api/settings`. CallOps enforces write permissions.

### 7.13 Profile — `profile` view

`ProfileView`:

- Password reset via `supabase.auth.updateUser`
- Admin-only "Link Employee" section (UI mock with placeholder emails; invite not wired)

---

## 8. Control Room analytics and flow-builder systems

The mounted Control Room is a fixed operations dashboard in `components/ControlRoom.tsx`. The older configurable insight registry remains in the repo for supporting widgets/templates, but it is not the primary dashboard body rendered by `app/page.tsx`.

### 8.1 Mounted Control Room architecture

```
app/page.tsx
  ├─ fetches campaigns, reports, logs, intents
  ├─ polls /api/campaigns/{id}/status for running/paused campaigns
  ├─ derives dashCampaigns, dashReports, dashCalls, dashIntents from scope filters
  └─ ControlRoom(ctx, liveStatus)
       ├─ Live Now band
       ├─ grouped KPI cards
       ├─ funnel + outcome panels
       └─ campaign performance table + drill-down dialog
```

### 8.2 Control Room panels

- **Live Now** — active calls on air, running/paused campaign counts, and up to three live campaign cards.
- **Key Metrics** — 10 indicators grouped into Funnel Metrics, Call Outcomes, Operations, and Financials.
- **Funnel & Outcomes** — a toggle between the custom 3D cone funnel and the `funnel-graph-js` flow, plus live outcome feed and donut breakdown.
- **Campaign Performance** — sorted report table; clicking a campaign opens a drill-down dialog.

Metrics are derived from the scoped `reports` and `calls` arrays. `liveStatus` supplies queue/runtime counters only; it is not persisted by the frontend.

### 8.3 Funnel rendering

- `ControlRoom` owns the decorative 3D cone funnel SVG. Counts drive labels and conversion percentages; the taper is visual.
- `FunnelGraphFlow` wraps `funnel-graph-js`, which draws into a DOM container. It redraws on data or container resize and uses the green EVRA color schema.
- `types/funnel-graph-js.d.ts` declares the library's untyped UMD bundle and CSS modules.

### 8.4 Legacy insight registry and templates

`components/InsightDashboard.tsx`, `components/InsightCard.tsx`, `lib/dashboardInsights.tsx`, and `lib/useDashboardLayout.ts` still exist.

- **localStorage key**: `avm.dash.layout.v3`
- **Templates API**: `GET/POST/DELETE /api/dashboard-templates`
- **Current limitation**: `app/page.tsx` imports `useDashboardLayout()` and `SaveTemplateDialog`, but there is no visible opener for saving/applying templates in the current `ControlRoom` UI.

`INSIGHTS` still defines these widget groups:

- Tables: `campaigns-table`, `campaign-report`
- KPI cards: `dialed`, `connected`, `qualified`, `avg-talk`, `hangup`, `callback`, `avg-cpl`, `total-spent`
- Charts: `outcome-donut`, `campaign-compare`, `spend-cpl`, `funnel`
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
| `components/FunnelGraphFlow.tsx` | DOM-driven `funnel-graph-js` flow option in the mounted Control Room |

`components/KpiStrip.tsx` exists as a standalone KPI row component but is **not currently mounted** in `app/page.tsx` (superseded by individual insight KPI cards).

### 8.6 Flow Builder POC (`/flow-builder`)

The campaign flow builder is a standalone visual demo, not part of the authenticated shell.

| File | Role |
|------|------|
| `app/flow-builder/page.tsx` | Route entry; renders `FlowBuilder` |
| `components/flow-builder/FlowCanvas.tsx` | React Flow canvas, seeded demo graph, palette, inspector, import/export, Claude preview modal |
| `components/flow-builder/FlowNodes.tsx` | Custom node renderer for start/end, config/action, and branch nodes |
| `components/flow-builder/nodeSpecs.ts` | Source of truth for available node types, fields, default params, branch outputs, and palette groups |
| `app/api/flow-builder/generate/route.ts` | Anthropic-powered prompt-to-flow endpoint |

POC constraints:

- Browser session only: edits live in React state unless the user exports JSON.
- Import/export format is React Flow `nodes` and `edges`, not a persisted campaign schema.
- No writes to campaigns, products, contacts, or CallOps.
- Node palette is spec-driven. To add a node type, update `SPECS`; the palette, inspector, custom handles, and Claude catalog all read from the same registry.
- Claude generation requires `ANTHROPIC_API_KEY`. The endpoint returns `400` when the key is unset, validates node `specKey`s against `SPECS`, filters edges to known node IDs, and opens a proof-check preview before replacing the canvas.

---

## 9. Modals and overlays

| Component | Trigger | Purpose |
|-----------|---------|---------|
| `CampaignModal` | "+ New Campaign" | 3-step wizard: Campaign → Schedule → Voice & Contacts |
| `CampaignActionDialog` | Edit / Reuse on campaign | Edit MP4 URL or clone campaign with new CSV |
| `SaveTemplateDialog` | Dormant import in `page.tsx` | Template save dialog exists, but no current UI opens it |
| `TutorialOverlay` | First visit or "Replay tour" / `?` button | Spotlight guided tour (`TOUR_STEPS`) |
| Chart expand `Dialog` | (legacy path in page.tsx) | Full-screen chart with campaign filter — `expandedChart` state exists but no current UI sets it |
| New Company `Dialog` | "+ New Company" | Inline in `page.tsx` |

### 9.1 CampaignModal flow (detail)

**Step 1 — Campaign**: name, agent (seeker/grace/auto), SIP trunk picker (`GET /api/trunks`).

**Step 2 — Schedule**: dialing speed, time window, max concurrent, retries, transfer key/target.

**Step 3 — Voice & Contacts**:

- Voice mode toggle: **Upload** (MP4 to Supabase Storage) or **Generate** (`VoiceGenerator` → TTS APIs)
- CSV contact list parsed by `lib/parseCsv.ts` (requires `phone` column)

Submit → `POST /api/campaigns` with contacts array and optional `voice_path` or `voice_recording_url`.

### 9.2 VoiceGenerator (`components/VoiceGenerator.tsx`)

Embedded in `CampaignModal` step 3 when voice mode is "generate".

1. User picks Inworld voice (gender, ethnicity, voice ID) from `lib/inworld-voices.ts`
2. User enters script text
3. **Preview**: `POST /api/tts/generate` → plays base64 audio in browser
4. **Save**: `POST /api/tts/save` → returns public URL stored as `voice_recording_url` on campaign

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
| `Product` | Company-scoped product with consent-flow type and active script version |
| `ProductScriptVersion` | Versioned script text/audio metadata for a product |
| `Contact` | Campaign contact row used by ContactsView and CallOps dial state |
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
| `avm.dash.layout.v3` | Legacy dashboard insight layout state; not actively surfaced by current Control Room |
| `avm.view.companies` | Companies list: `cards` or `table` |
| `avm.view.campaigns` | Campaigns list: `cards` or `table` |
| `avm.tour.seen` | Suppresses auto-start of guided tour |
| Telephony mock keys | Managed inside `lib/telephony-mock.ts` for non-SIP-trunk Telephony tabs |

---

## 16. Guided tour (`TutorialOverlay`)

- **Steps**: defined in `TOUR_STEPS` export from `components/TutorialOverlay.tsx`
- **Mechanism**: steps with `view` switch `page.tsx` view; steps with `target` spotlight DOM elements by `data-tour` attribute
- **Auto-start**: first authenticated visit if `avm.tour.seen` is unset
- **Replay**: Sidebar footer link or TopBar `?` button

Elements tagged with `data-tour`: sidebar nav items (`nav-dashboard`, etc.), dashboard header (`dash-header`, `dash-scope`), and new company/campaign buttons.

---

## 17. Environment variables (frontend-relevant)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/publishable key |
| `NEXT_PUBLIC_POLL_INTERVAL_MS` | Dashboard polling interval (default 15000) |

Server-only vars (not in browser, but affect API responses the UI consumes): `CALLOPS_URL`, `CALLOPS_WEBHOOK_SECRET`, `LIVEKIT_*`, TTS provider keys, STS relay/GUID values, and `ANTHROPIC_API_KEY` for `/api/flow-builder/generate`.

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
│  + Supabase DB  │          │  ControlRoom         │
│  + callops proxy│          │  CampaignModal       │
└────────┬────────┘          │  Products, Contacts  │
         │                   │  Leads, CallQuality  │
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
  → CallOps creates campaign + imports contacts → user starts campaign
  → POST /api/campaigns/{id}/start → callops dials via LiveKit
  → webhooks update call_records → UI polls /api/logs and /api/reports
```

---

## 19. Component dependency graph (simplified)

```
page.tsx
├── Sidebar
├── TopBar
├── [view content]
│   ├── ControlRoom
│   │   ├── FunnelGraphFlow
│   │   └── campaign drill-down Dialog
│   ├── ProductsView
│   ├── ContactsView
│   ├── LeadsView
│   ├── CallQuality
│   ├── SecurityView
│   ├── SettingsView
│   ├── TelephonyView
│   │   ├── SipTrunksPanel
│   │   └── telephony/CrudSection → EntityFormDrawer
│   ├── ProfileView
│   └── CampaignDetail
├── CampaignModal
│   ├── ui/WizardChrome
│   └── VoiceGenerator
├── CampaignActionDialog
├── SaveTemplateDialog (dormant)
├── TutorialOverlay
├── FloatingNav
└── AuthView (when logged out)
```

Standalone route:

```
app/flow-builder/page.tsx
└── FlowBuilder
    ├── FlowCanvas
    ├── FlowNodes
    └── nodeSpecs
```

---

## 20. Known limitations and placeholders

1. **Single route** — no deep linking to views; refreshing always lands on Control Room default.
2. **Flow Builder** — visual POC only; no auth shell, no persistence, no campaign execution wiring.
3. **Telephony view** — SIP trunk tab is CallOps-backed; all other tabs are localStorage mock data.
4. **Dashboard templates** — template API and dialog exist, but the current Control Room UI has no visible save/apply entry point.
5. **Passkey login** — registration UI exists; passwordless sign-in not implemented.
6. **Profile employee invite** — UI only; no backend invite flow.
7. **KpiStrip / InsightDashboard** — components exist but are not mounted in the current page layout.
8. **Chart expand dialog** — state and dialog JSX exist in `page.tsx` but no button currently sets `expandedChart`.
9. **FloatingNav** — intentionally shorter than Sidebar; it omits Products, Contacts, Telephony, and Profile.

---

## 21. Related documentation

| Document | Focus |
|----------|-------|
| `docs/livekit-outbound-integration.md` | Backend dialer pipeline, callops, webhooks |
| `docs/app-api-reference.md` | API route reference |
| `types/index.ts` | TypeScript domain types |
| `lib/dashboardInsights.tsx` | Full insight widget registry source |

---

*Last aligned with codebase: Agent AVM v0.1.0, Next.js 16, MUI 9.*
