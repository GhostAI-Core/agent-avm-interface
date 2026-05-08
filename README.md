# Agent AVM — Enterprise Voice Identity Portal
### Managed by VAS Inc.

**Agent AVM** is a state-of-the-art, high-performance voice identity and campaign management platform designed for the South African market. Built with a "Security-First" philosophy, it combines next-generation biometric authentication with a powerful real-time dialing engine.

---

## 🚀 Key Features

### 1. The "Future of Fast" Authentication
*   **Native Passkeys (WebAuthn):** Fully integrated biometric login using Face ID, Touch ID, or Windows Hello.
*   **Phishing-Proof Security:** Passwordless authentication that eliminates credential theft.
*   **Role-Based Access Control (RBAC):** Granular permissions for **Administrators** (Full Control) and **Voice Engineers** (Campaign Management).

### 2. High-Fidelity Dialing Engine
*   **Intelligent Simulation:** A built-in engine that emulates real-world telephony outcomes (Qualified, Voicemail, Busy, etc.).
*   **Live Monitoring:** Real-time KPI dashboard showing dialing funnels, spend metrics, and call success rates.
*   **VoIP Gateway Integration:** Secure management for **Twilio**, **Vonage**, and **Sangoma** API credentials.

### 3. Corporate Branding (VAS Inc.)
*   **Premium Aesthetic:** Modern glassmorphism design with a dark-mode optimized interface.
*   **White-Labeled:** Official VAS Inc. corporate identity integrated across the Login Portal, Sidebar, and Dashboard.

### 4. Advanced Security & Audit
*   **Immutable Audit Logs:** Every login attempt and campaign change is logged to the `security_logs` table.
*   **IP Whitelisting:** Restrict platform access to specific corporate IP ranges.
*   **Supabase SSR:** Secure server-side session management using the latest Next.js 16 conventions.

---

## 🛠️ Technology Stack

*   **Framework:** Next.js 16 (App Router + Turbopack)
*   **Backend:** Supabase (PostgreSQL, Auth, RLS)
*   **Auth:** WebAuthn / Passkeys + Supabase SSR
*   **Styling:** Vanilla CSS + Modern Design Tokens
*   **Infrastructure:** Edge-ready Proxy Architecture

---

## 📂 Project Structure

```text
/app               # Next.js App Router (Pages & API)
  /api             # Backend API Routes (Campaigns, Security, Simulation)
/components        # Modular UI Components (AuthView, Sidebar, TopBar)
/lib               # Shared Utilities (Security, Demo Data)
/public            # Static Assets (VAS Inc. Logo)
/utils/supabase    # Supabase Client & Server Helpers
proxy.ts           # Next.js 16 Global Request Proxy
schema.sql         # Idempotent Database Schema
```

---

## ⚙️ Setup & Deployment

### 1. Environment Configuration
Create a `.env.local` file with your Supabase credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_public_key
```

### 2. Database Initialization
Run the content of `schema.sql` in your Supabase SQL Editor. This will create all necessary tables, triggers, and Row-Level Security (RLS) policies.

### 3. Biometric Setup
To test **Passkeys** on local IP addresses, ensure you are running on `localhost` or enable the following flag in Chrome:
`chrome://flags/#unsafely-treat-insecure-origin-as-secure` (Add your network IP here).

### 4. Running the Project
```bash
npm install
npm run dev
```

### 5. Rasa Integration
The platform is integrated with **Rasa NLU** for intelligent assistant capabilities.
1. Ensure Rasa is installed on your machine.
2. Start the Rasa server with the REST API enabled:
   ```bash
   rasa run --enable-api --cors "*"
   ```
3. The app will automatically connect to `http://localhost:5005` via the built-in proxy.

---

## 📈 Roadmap
- [x] Production Supabase Migration
- [x] VAS Inc. Brand Integration
- [x] Biometric Passkey Implementation
- [x] High-Fidelity Dialing Simulation
- [x] AI Voice Agent Intelligence (Rasa NLU Integration)
- [ ] Production VoIP Gateway Cutover
- [ ] AI Voice Agent Voice Synthesis (Phase 2)

**© 2026 VAS Inc. All Rights Reserved.**
