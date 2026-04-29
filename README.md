# Agent AVM Interface

Outbound IVR campaign management platform for the South African market. Launch, monitor and report on automated voice campaigns across AI agents — **Seeker**, **Grace** and **Sangoma** — from any device on the network.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Database | Supabase (PostgreSQL) |
| Charts | Chart.js + react-chartjs-2 |
| Icons | Lucide React |
| Container | Docker |

---

## Getting Started (Local Dev)

### 1. Clone the repo

```bash
git clone https://github.com/GhostAI-Core/agent-avm-interface.git
cd agent-avm-interface
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.local.example .env.local
```

Open `.env.local` and fill in your Supabase project credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Find these in your Supabase project under **Settings → API**.

> **No Supabase yet?** The app runs in demo mode automatically with sample campaign data — no setup needed.

### 4. Set up the database

In your Supabase project, go to the **SQL Editor** and run the contents of `schema.sql`. This creates:

- `campaigns` — campaign config, agent, status, dialling window
- `call_logs` — all call dispositions and financial metrics (CPL, spend)
- `voip_providers` — VoIP integration credentials
- Row Level Security policies

### 5. Run the dev server

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

To share with someone on the same network, find your machine's IP:

```bash
# Windows
ipconfig
# Look for IPv4 Address under your Wi-Fi or LAN adapter
```

Then send them: `http://192.168.x.x:3000`

---

## Running with Docker

### Build and run

```bash
# Copy and fill in your env file first
cp .env.local.example .env.local

# Build and start
docker compose up --build
```

The app will be available at `http://localhost:3000`.

To run in the background:

```bash
docker compose up --build -d
```

To stop:

```bash
docker compose down
```

### Share on your network

Once running, anyone on the same network can access it at `http://<your-ip>:3000`.

---

## Production Build (without Docker)

```bash
npm run build
npm start
```

---

## Project Structure

```
agent-avm-interface/
├── app/
│   ├── api/
│   │   ├── campaigns/         # GET, POST campaigns
│   │   │   └── [id]/          # PUT, DELETE campaign by ID
│   │   └── reports/           # GET call reports
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx               # Main dashboard (client component)
├── components/
│   ├── Sidebar.tsx            # Collapsible nav with agent legend
│   ├── TopBar.tsx             # Header + active campaign strip
│   ├── KpiStrip.tsx           # 9 KPI cards calculated from report data
│   ├── Charts.tsx             # Outcome, Campaign, Spend, Funnel charts
│   └── CampaignModal.tsx      # New campaign form modal
├── lib/
│   ├── supabase.ts            # Supabase client (with demo mode fallback)
│   └── demo-data.ts           # Sample data when Supabase not configured
├── types/
│   └── index.ts               # Campaign, CampaignReport types
├── schema.sql                 # Supabase PostgreSQL schema + RLS
├── Dockerfile                 # Multi-stage production Docker build
├── docker-compose.yml         # Single-service compose config
└── .env.local.example         # Environment variable template
```

---

## Agents

| Agent | Colour | Role |
|-------|--------|------|
| Seeker | Blue | Primary outbound dialler |
| Grace | Purple | Follow-up and nurture campaigns |
| Sangoma | Orange | Specialised qualification campaigns |

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/campaigns` | List all campaigns |
| POST | `/api/campaigns` | Create a new campaign |
| PUT | `/api/campaigns/:id` | Update campaign status / settings |
| DELETE | `/api/campaigns/:id` | Soft-delete a campaign |
| GET | `/api/reports` | Fetch call reports (filter by agent, date) |
