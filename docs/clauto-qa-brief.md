# Agent AVM Dashboard — QA Test Brief (for clauto)

**Date:** 2026-06-30 · **Build:** M2 dash-sync (contacts + SIP trunks + analytics + call-detail)
**Backend:** CallOps `https://call-center.evra-ai.com` (live, api 0.2.0) — the dashboard talks to this.

You are testing the **running dashboard** (the web app you normally log into), not code. Log in
with a normal user account. Work through each section, record **PASS / FAIL / BLOCKED**, and for any
FAIL note: what you did, what you expected, what actually happened (screenshot if you can).

**Read this first — these are EXPECTED, do NOT flag them as bugs:**
- In analytics, **Qualified, CPL, Cost/Spend, and the old outcome columns (Voicemail, No-Speech,
  Hangup, NI, DNQ, Busy) show 0 or blank.** The backend doesn't track those anymore — by design.
- **Analytics numbers will look small / different from the previous run.** They now come from the
  authoritative per-call records (CallOps), not the old aggregate table. e.g. a campaign may show
  a handful of calls. Dialed/Connected are now consistent (no more "0 dialed but 9 connected").
- **SIP Trunks start empty** and are created per company (see §2). Empty ≠ broken.
- The **date filter** on Campaign Report does nothing right now (all-time only). Known.
- In **Telephony**, only the **SIP Trunks** tab is real. The other tabs (LiveKit Settings, SIP
  Providers, Dispatch Rules, Agents, Test Dial, Status) are still mock/demo — ignore them.
- If a list is empty because there's genuinely no data yet (no contacts/trunks/campaigns for that
  scope), that's not a failure — note it as "no data" and move on.

---

## 0. Login & shell
1. Open the dashboard, log in.
   - ✅ PASS: you reach the Control Room. Sidebar shows: Control Room, Companies, Campaigns,
     **Contacts**, Campaign Report, Call Quality, Telephony, Security Audit, Settings, Profile.
   - ✅ The new **Contacts** item is present between Campaigns and Campaign Report.
2. Leave it ~30s, click around.
   - ✅ No spinner that never resolves; no full-page crash; no "Unauthorized" bounce while active.

## 1. Contacts (NEW)
Sidebar → **Contacts**.
1. ✅ A **Campaign** dropdown appears and auto-selects the first campaign. A table loads with
   columns: Phone, Name, Status, Network, Retries, Last attempted, Actions.
2. Change the **Campaign** dropdown to another campaign.
   - ✅ The list reloads for that campaign (resets to page 1).
3. Use the **Status** filter (e.g. pending / dialed / failed).
   - ✅ List narrows to that status. Setting it back to "All statuses" restores the list.
4. Type a phone or name in **Search**, press Enter (or click Search).
   - ✅ List filters to matches. Clearing + searching empty restores.
5. If there are more than ~50 contacts, use **Previous / Next**.
   - ✅ Page changes; the "X contacts · page N of M" counter updates.
6. **Import CSV**: click Import CSV, pick a CSV with a `phone` column (optionally first_name,
   last_name).
   - ✅ A green banner reports a summary like "Imported N rows — X created, Y updated, Z rejected."
   - ✅ The list refreshes and shows the imported numbers.
   - Try a CSV with **no phone column** → ✅ red "No valid rows found" message, nothing imported.
7. Row actions on any contact: **Retry**, **Archive**, **DNC**.
   - ✅ The action completes and the contact's Status updates on reload (Retry→retry,
     Archive→archived, DNC→do_not_call). No crash.
8. Phone numbers should display **masked** (e.g. `+27 8• ••• ••12`), not full.

## 2. Telephony → SIP Trunks (NEW — real data, **per company**)
Sidebar → **Telephony** → **SIP Trunks** tab.

> ⚠️ EXPECTED: trunks are now **per company**, and there are **no trunks yet** (the old test
> trunks were unassigned and are not shown by design). So the list starts **empty** for every
> company — that's correct, not a bug. The real test here is **creating** a trunk and seeing it
> appear. Same for the campaign wizard's Trunk dropdown — it only lists the selected company's
> trunks, so it's empty until you add one.

1. ✅ A **Company** dropdown appears and auto-selects the first company. A table loads (likely
   **empty** — expected). Columns: Name, From number, LiveKit trunk, Status, Health, Actions.
2. Switch the **Company** dropdown.
   - ✅ Trunk list reloads for that company (empty is fine).
3. **+ Add Trunk** → fill Name (required) and any of From number / SIP address / Numbers
   (comma-separated) / Auth username / Auth password / LiveKit trunk id → **Create**.
   - ✅ Green "Trunk created" banner; the new trunk appears in the list.
   - ✅ Auth password is **never shown** anywhere in the table or after saving.
4. On a trunk row, click **Check** under Health.
   - ✅ It resolves to 🟢 live or 🔴 <status>. No crash either way.
5. Click **Test call** on a row → enter a phone number → Place test call.
   - ✅ A banner reports the result. A failed call shows as a **failure message**, not a crash/blank.
6. Click **Archive** on a (test) trunk.
   - ✅ "Trunk archived" banner; it drops off the active list on reload.

## 3. Campaign Report & analytics
Sidebar → **Campaign Report**.
1. ✅ A table of campaigns loads. **Dialed, Connected, Failed** show real numbers; Duration shows
   m:ss. (Qualified/Voicemail/Hangup/etc. and CPL/Spent show 0 — EXPECTED.)
2. Click a campaign row.
   - ✅ Opens the per-call detail for that campaign: a list of calls with an **Outcome** column and
     a separate **Business disposition** column (e.g. subscribe / opt_out / interested), missing
     disposition shows "—".
   - ✅ **Export CSV** downloads a file that includes both Outcome and Disposition columns.
3. Agent filter dropdown (All Agents / Seeker / Grace / Sangoma) → ✅ list narrows; no crash.
4. Back to **Control Room**: the KPI cards + charts render. Dialed/Connected/Avg-Talk are real;
   Qualified/CPL/Spend = 0 (EXPECTED). The **Outcome donut** and **Campaign comparison** render
   without error.

## 4. Call Quality
Sidebar → **Call Quality**.
1. ✅ An intent "waterfall" table loads (Intent, Count, % of Connected, % dropped from previous).
2. Opt-out should **not** be counted inside "connected" anywhere it appears.

## 5. Companies & Campaigns (regression — should still work)
1. **Companies**: list loads (cards or table). **+ New Company** → create one → ✅ it appears.
2. **Campaigns**: list loads. Play/Pause/Stop/Edit/Archive buttons work; a failed lifecycle action
   shows a real error message (e.g. "campaign_missing_sip_trunk"), **not** a blank/generic error.
3. **+ New Campaign** wizard: the **Trunk** dropdown is populated (from real CallOps trunks).
   Create a campaign → ✅ it appears in the list. (Full dial test is a separate backend exercise.)

## 6. General robustness
- Navigate every sidebar item once. ✅ None crash to a blank screen.
- If the backend is briefly unreachable, lists should show an **error banner or empty state**, not a
  white screen.

---

## How to report back
For each section give: **PASS / FAIL / BLOCKED / NO-DATA**. For FAILs, include the steps, the
expected vs actual, and a screenshot. List anything ambiguous separately so we can decide if it's a
bug or expected. Priority order to test if short on time: **1 (Contacts) → 2 (SIP Trunks) →
3 (Reports/analytics)** — those are the new code most likely to have issues.
