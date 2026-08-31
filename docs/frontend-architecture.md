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
| Framework | **Next.js 16** (App Router) | Single-page shell at `app/page.tsx`, plus standalone `/tv` and `/flow-builder` routes |
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
  ControlRoom.tsx      # Mounted Control Room dashboard
  InsightDashboard.tsx # Dormant legacy/configurable widget grid
  CampaignModal.tsx   # 5-step new-campaign wizard
  ... (view components, ui primitives, telephony subfolder)
lib/
  theme.ts            # MUI theme from design tokens
  tokens.ts           # EVRA color/spacing/typography tokens
  dashboardInsights.tsx # Shared dashboard context/types + dormant insight registry
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
- **Inactivity logout**: 30 minutes without mouse/keyboard activity triggers `signOut`.
- **401 handling**: `getJson()` helper signs the user out if any API returns 401.

`proxy.ts` (Next.js middleware) runs `updateSession()` on every request to refresh Supabase auth cookies without blocking on `getUser()`.

---

## 4. Navigation model

The app uses **client-side view switching**, not URL-based routing. A single string state `view` in `app/page.tsx` determines which screen is shown.

### 4.1 View IDs and titles

| `view` value | Screen title | Primary component |
|--------------|--------------|-------------------|
| `dashboard` | Control Room | `ControlRoom` + scope/range filters |
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
- **`FloatingNav`** — mobile-only (`xs`–`md`) radial menu fixed bottom-right. It has fewer entries than the desktop sidebar.
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

### 4.3 Standalone routes

These routes live outside the sidebar view switcher:

| Route | Component | Purpose |
|---|---|---|
| `/tv` | `app/tv/page.tsx` | Read-only wallboard that polls authenticated `/api/reports`, supports TV remote/D-pad navigation, and auto-cycles campaign detail views. |
| `/flow-builder` | `app/flow-builder/page.tsx` | Visual-only campaign flow-builder POC. It can call `/api/flow-builder/generate` for a Claude-generated node spec, but has no persistence or execution path. |

---

## 5. Central state in `app/page.tsx`

Almost all shared application state lives in `Page()` inside `app/page.tsx`. Child views receive data via props; they do not fetch global lists independently (except where noted).

### 5.1 Core state variables

| State | Type | Purpose |
|-------|------|---------|
| `auth`, `authChecked`, `role` | boolean / boolean / `AppRole` | Login gate and role for admin-only UI |
| `view` | string | Active screen (`dashboard`, `companies`, `campaigns`, `products`, `contacts`, `leads`, `reports`, `quality`, `telephony`, `security`, `settings`, `profile`) |
| `campaigns` | `Campaign[]` | All non-archived campaigns |
| `liveStatus` | `Record<number, CampaignLiveStatus>` | Real-time callops stats per running campaign |
| `reports` | `CampaignReport[]` | Aggregated campaign metrics |
| `allCalls` | call log rows | Per-call records for dashboard insights |
| `allIntents` | intent stat rows | Intent waterfall data (today) |
| `companiesList` | `Company[]` | Company records with contacts |
| `securityLogs` | audit rows | Security events |
| `filterAgent`, `filterDate`, `rangePreset` | strings | Report and Control Room filters; `filterAgent` is `product:<id>` or legacy `agent:<name>` |
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

**On filter/range change** (`filterAgent`, `filterDate`, `rangePreset`, custom dates), only `GET /api/reports` is re-fetched.

**Polling** (default every 15s via `NEXT_PUBLIC_POLL_INTERVAL_MS`):

- Campaigns, reports, logs, intents
- Skips when `document.visibilityState === 'hidden'`
- Also calls `refreshLiveStatus()` for running/paused campaigns via `GET /api/campaigns/{id}/status`

### 5.3 Scoped dashboard data

When `companyFilter` or `campaignFilter` is set, derived arrays feed the Control Room:

- `dashCampaigns` — campaigns in scope
- `dashReports` — reports filtered by campaign IDs in scope and by selected product/range filters
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

All frontend `fetch()` calls go to Next.js Route Handlers under `app/api/`. Dashboard routes check Supabase auth via `getAuthUser()` or `getAccessToken()` before reading locally or proxying to CallOps.

| Endpoint | Method | Used by | Returns |
|----------|--------|---------|---------|
| `/api/campaigns` | GET | page.tsx | `{ campaigns }` — CallOps-backed fan-out over companies |
| `/api/campaigns` | POST | CampaignModal, CampaignActionDialog | `{ campaign }` |
| `/api/campaigns/{id}` | PUT | CampaignActionDialog (edit voice) | updated campaign |
| `/api/campaigns/{id}` | GET | Campaign Detail flow | `{ campaign, summary }` from CallOps when configured |
| `/api/campaigns/{id}/{action}` | POST | page.tsx (`start`/`pause`/`stop`) | callops result |
| `/api/campaigns/{id}/status` | GET | page.tsx live polling | `CampaignLiveStatus` |
| `/api/campaigns/{id}/contacts` | GET | ContactsView | paged contacts + network breakdown |
| `/api/campaigns/{id}/contacts/import` | POST | ContactsView | CallOps import summary |
| `/api/products` | GET, POST | ProductsView, CampaignModal | company-scoped product list/create |
| `/api/products/{id}/versions` | GET, POST | ProductsView | product script version history/create |
| `/api/products/{id}/versions/{versionId}/activate` | POST | ProductsView | promote/roll back current script version |
| `/api/reports` | GET | page.tsx | `{ reports }` — query: `product_id` or legacy `agent`, plus `date`/`from`/`to` |
| `/api/logs` | GET | page.tsx, CampaignDetail flow | `{ logs }` — query: `campaignId`; CallOps `duration_seconds` becomes `on_air_seconds` |
| `/api/leads` | GET | LeadsView | single/double opt-in leads from CallOps |
| `/api/intents` | GET | page.tsx, CallQuality | `{ intents, connectedTotal }` |
| `/api/companies` | GET, POST | page.tsx | `{ companies }` |
| `/api/security` | GET | page.tsx | `{ logs }` |
| `/api/trunks` | GET | CampaignModal | `{ trunks }` — SIP trunk picker |
| `/api/settings` | GET, PATCH | SettingsView | CallOps cost-per-minute setting |
| `/api/lookups/{type}` | GET | ContactsView and forms | allowlisted CallOps vocabularies |
| `/api/dashboard-templates` | GET, POST, DELETE | useDashboardLayout | saved layouts |
| `/api/tts/generate` | POST | VoiceGenerator | base64 audio |
| `/api/tts/save` | POST | VoiceGenerator | public URL for recording |

Voice file uploads for new campaigns go **directly to Supabase Storage** (`voice-recordings` bucket) from the browser, then the storage path is sent to `POST /api/campaigns` as `audio_path`/`voice_recording_url` for CallOps dispatch.

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
- Receives `liveStatus` from `GET /api/campaigns/{id}/status`
- Renders a fixed AVM dashboard: Live Now band, 10 KPI cards, funnel/outcome panels, and campaign performance table
- Lets users switch the funnel between the built-in 3D cone SVG and `FunnelGraphFlow` (`funnel-graph-js`)
- Opens an in-place campaign drill-down dialog when a campaign row is clicked

`InsightDashboard` and `useDashboardLayout()` still exist for the older configurable insight grid and saved templates, but `app/page.tsx` currently mounts `ControlRoom`.

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

`ProductsView` is the data-driven replacement for the old hardcoded agent/product pairing.

- Company-scoped list from `GET /api/products?company_id=...`
- Create flow supports `lead_gen` and `sts_subscription`; STS products require an STS product key
- Product script dialog lists versions, uses `VoiceGenerator` to create a new script/audio version, and can activate an older version
- Campaign creation can prefill script text, generated audio URL, voice id, and duration from a product's current version

### 7.6 Contacts — `contacts` view

`ContactsView` works per campaign and is backed by CallOps.

- Loads contacts from `GET /api/campaigns/{id}/contacts`
- Imports CSV rows through `POST /api/campaigns/{id}/contacts/import`; CallOps owns normalization, dedupe, and rejection counts
- Status/search/network filters are server-side query params
- The Network selector is also the campaign dial gate: it persists `campaigns.network_provider` through `PUT /api/campaigns/{id}`
- Network breakdown chips come from CallOps' campaign-wide `contacts/network-breakdown` endpoint

### 7.7 Leads — `leads` view

`LeadsView` lists Lead-Gen contacts that pressed 1 at least once.

- Reads `GET /api/leads`, which fans out over the user's companies through CallOps
- Distinguishes `single` and `double` opt-ins
- Shows campaign/contact names best-effort and exports CSV

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

`TelephonyView` — mixed live/mock LiveKit telephony admin UI.

- SIP Trunks tab is live via `SipTrunksPanel` and CallOps-backed `/api/companies/{id}/sip-trunks` + `/api/sip-trunks/{id}/*` routes.
- Other tabs are still stored in browser via `useTelephonyStore()` from `lib/telephony-mock.ts` (localStorage).
- Seven tabs: Settings, SIP Providers, Outbound Trunks, Dispatch Rules, Agents, Test Dial, Status.
- Uses reusable `CrudSection` + `EntityFormDialog` from `components/telephony/`.

Note: Telephony appears in `Sidebar` but **not** in `FloatingNav`.

### 7.12 Settings — `settings` view

`SettingsView` — CallOps-backed platform settings.

- Loads `GET /api/settings`
- Admins can update `cost_per_minute_zar` through `PATCH /api/settings`
- CallOps prices future call outcomes with the updated rate; historical call costs are not recalculated
- Telephony note points users to the Telephony tab for trunk management

### 7.13 Profile — `profile` view

`ProfileView`:

- Password reset via `supabase.auth.updateUser`
- Admin-only "Link Employee" section (UI mock with placeholder emails; invite not wired)

---

## 8. Control Room system

The mounted Control Room is `components/ControlRoom.tsx`, a fixed operations dashboard aligned
to the EVRA visual design. It consumes the same `InsightCtx` shape as the older insight-grid
system, but does not render draggable/pinnable cards.

### 8.1 Mounted layout

| Section | Purpose | Source data |
|---|---|---|
| Live Now | Active calls, running/paused counts, top live campaigns, contact progress. | `liveStatus`, scoped campaigns, scoped reports |
| Key Metrics | 10 indicators grouped into Funnel Metrics, Call Outcomes, Operations, Financials. | `reports`, `calls` |
| Funnel & Outcomes | 3D funnel or campaign flow graph, live outcome feed, donut breakdown. | `reports`, `calls` |
| Campaign Performance | Performance table ordered by spend; row click opens drill-down. | `reports`, `campaigns`, `liveStatus` |
| Drill-down dialog | Campaign KPIs, progress, and funnel. | selected campaign report + live status |

### 8.2 Funnel options

- `3D Funnel`: local SVG frustum/cone visualization with hover dimming and conversion labels.
- `Flow`: `FunnelGraphFlow` wraps `funnel-graph-js`; top three campaigns get distinct series and the rest roll up into `Other`.

### 8.3 Legacy configurable insight grid

`InsightDashboard`, `SaveTemplateDialog`, and `useDashboardLayout()` still exist and
`page.tsx` still initializes the layout hook for saved-template support. They are not the
currently mounted Control Room body.

#### Architecture

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

#### Layout persistence

`lib/useDashboardLayout.ts`:

- **localStorage key**: `avm.dash.layout.v3`
- **Default layout**: `DEFAULT_INSIGHTS` visible; all other registered insights hidden (available via "Add insight" dropdown)
- **Operations**: pin (move to top), hide, drag-reorder, reset, save/apply templates
- **Templates**: `GET/POST /api/dashboard-templates` (stored in Supabase for team sharing)

#### Insight sizes (grid spans)

| Size | MUI Grid span (xs / sm / md) |
|------|------------------------------|
| `sm` | 6 / 4 / 3 (quarter width on desktop) |
| `md` | 12 / 12 / 6 (half width) |
| `lg` | 12 / 12 / 12 (full width) |

#### Insight registry (`INSIGHTS` in `lib/dashboardInsights.tsx`)

**Default visible insights** (`DEFAULT_INSIGHTS`):

- Tables: `campaigns-table`, `campaign-report`
- KPI cards: `dialed`, `connected`, `qualified`, `avg-talk`, `hangup`, `callback`, `avg-cpl`, `total-spent`
- Charts: `outcome-donut`, `campaign-compare`, `spend-cpl`, `funnel`

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

#### Chart components

| Component file | Used for |
|----------------|----------|
| `components/Charts.tsx` | `OutcomeDonut`, `FunnelChart`, `CampaignBar`, `SpendChart` — styled Chart.js charts using `lib/chartTheme.ts` |
| `components/InsightCharts.tsx` | `BarChart`, `LineChart`, `DonutChart`, `Sparkline`, `MiniBars` — lighter charts for KPI sparklines and add-on insights; `ControlRoom` uses `Sparkline` |
| `components/FunnelGraphFlow.tsx` | `funnel-graph-js` wrapper used by the Control Room Flow funnel option |

`components/KpiStrip.tsx` exists as a standalone KPI row component but is **not currently mounted** in `app/page.tsx` (superseded by individual insight KPI cards).

---

## 9. Modals and overlays

| Component | Trigger | Purpose |
|-----------|---------|---------|
| `CampaignModal` | "+ New Campaign" | 5-step wizard: Basics → Trunk → Voice → Contacts → Schedule |
| `CampaignActionDialog` | Edit / Reuse on campaign | Edit product/script/trunk/schedule fields or clone campaign with a new CSV |
| `SaveTemplateDialog` | "Save layout template" on dashboard | Names and saves current insight layout |
| `TutorialOverlay` | First visit or "Replay tour" / `?` button | Spotlight guided tour (`TOUR_STEPS`) |
| Chart expand `Dialog` | (legacy path in page.tsx) | Full-screen chart with campaign filter — `expandedChart` state exists but no current UI sets it |
| New Company `Dialog` | "+ New Company" | Inline in `page.tsx` |

### 9.1 CampaignModal flow (detail)

**Step 1 — Basics**: campaign name, company, and optional product. Product choices are loaded
per company; selecting one can prefill the Voice step from its current script version.

**Step 2 — Trunk**: SIP trunk picker (`GET /api/trunks`). Empty selection uses the CallOps/default trunk.

**Step 3 — Voice**:

- Voice mode toggle: **Upload** (MP4 to Supabase Storage) or **Generate** (`VoiceGenerator` → TTS APIs)
- Generated audio tracks `voice_id`, script text, and measured duration for ETA calculations

**Step 4 — Contacts**: CSV contact list parsed by `lib/parseCsv.ts` (requires `phone` column).

**Step 5 — Schedule**: dialing speed, max concurrent, network dial gate, retries/cooldown, start/end dates, and daily time window.

Submit → `POST /api/campaigns` with contacts array, product/trunk fields, network gate, and optional
`audio_path`/`voice_recording_url`. CallOps owns contact normalization and campaign creation.

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
| `Campaign` | Campaign config: name, status, pacing, time window, SIP trunk, voice/script URLs, network gate, product links, company |
| `CampaignLiveStatus` | Real-time stats from callops: active_calls, queued, dialed, failed, etc. |
| `CampaignReport` | Aggregated metrics per campaign: dialed, connected, qualified/lead, product name, CPL, spend |
| `CallRecord` | Individual call: phone, outcome, business disposition, talk/on-air seconds, cost, transferred, recording URL |
| `Product` | Company-scoped script + consent-flow bundle (`lead_gen` or `sts_subscription`) |
| `ProductScriptVersion` | Versioned script text, voice id, generated audio URL, and measured duration |
| `Contact` | Campaign contact row from CallOps, including status, retry count, and `network_provider` |
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
│ campaigns · products · reports · calls · companies│
└────────┬─────────────────────────────┬───────────┘
         │ fetch /api/*                 │ props
         ▼                              ▼
┌─────────────────┐          ┌─────────────────────┐
│  Route Handlers │          │  View components     │
│  CallOps proxy  │          │  ControlRoom         │
│  + Supabase auth│          │  CampaignModal       │
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
  → CallOps creates campaign + contacts → user starts campaign
  → POST /api/campaigns/{id}/start → callops dials via LiveKit
  → CallOps outcomes/webhooks update call_records → UI polls /api/logs and /api/reports
```

---

## 19. Component dependency graph (simplified)

```
page.tsx
├── Sidebar
├── TopBar
├── [view content]
│   ├── InsightDashboard (legacy configurable grid)
│   │   ├── InsightCard (×N)
│   │   │   └── dashboardInsights render → Charts / InsightCharts / tables
│   │   └── useDashboardLayout
│   ├── ControlRoom
│   │   ├── InsightCharts.Sparkline
│   │   └── FunnelGraphFlow
│   ├── ProductsView
│   ├── ContactsView
│   ├── LeadsView
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

1. **Single route for the main shell** — no deep linking to sidebar views; refreshing lands on Control Room default.
2. **Control Room templates are legacy support** — `useDashboardLayout`, `InsightDashboard`, and saved templates remain, but the mounted `ControlRoom` is fixed.
3. **Telephony is mixed live/mock** — SIP Trunks are live through CallOps; Settings/SIP Providers/Dispatch Rules/Agents/Test Dial/Status tabs still use local mock state.
4. **Passkey login** — registration UI exists; passwordless sign-in is not implemented.
5. **Profile employee invite** — UI only; no backend invite flow.
6. **Chart expand dialog** — state and dialog JSX exist in `page.tsx` but no button currently sets `expandedChart`.
7. **FloatingNav** — fewer entries than the desktop Sidebar.
8. **Product-version "current" is not live-bound** — campaigns keep the script URL materialized at save time; re-save to pick up a newly activated product version.

---

## 21. Related documentation

| Document | Focus |
|----------|-------|
| `docs/livekit-outbound-integration.md` | Backend dialer pipeline, callops, webhooks |
| `docs/app-api-reference.md` | API route reference |
| `docs/data-model.md` | Current CallOps-owned operational model and frontend data boundaries |
| `types/index.ts` | TypeScript domain types |
| `lib/dashboardInsights.tsx` | Full insight widget registry source |

---

*Last aligned with codebase: Agent AVM v0.1.0, Next.js 16, MUI 9.*
