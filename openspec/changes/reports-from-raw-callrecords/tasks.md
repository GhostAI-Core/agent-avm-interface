## 1. Reports roll-up from raw call_records (done)

- [x] 1.1 Rewrite `app/api/reports/route.ts` to aggregate `call_records` (service-role, auth-gated) into the report shape; map the six real outcomes; `dialed`=rows, spend=Σcost, avg-talk from talk_seconds
- [x] 1.2 Add `opt_out` to `CampaignReport` (`types/index.ts`); map `opted_out→opt_out`
- [x] 1.3 `app/page.tsx`: `REPORT_KEYS`/`REPORT_HEADERS` → drop dead buckets, `opt_out`="Opted Out", `qualified`="Subscribed"
- [x] 1.4 Verify aggregation vs raw distribution for batches 74/75 (dialed/connected/subscribed/opt_out/no_answer/failed match); typecheck + build green

## 2. Spec reconciliation

- [x] 2.1 Record supersession of `consume-callops-analytics` (reports table) in this change
- [ ] 2.2 Annotate `callops-outcome-contract-alignment` `consume-callops-analytics` spec with a SUPERSEDED-BY pointer to this change
- [ ] 2.3 Flag to Cale: `fe-zero-control` `CallOps-authoritative read` rule amended for computed aggregates (control unchanged; dashboard may derive display-math from raw facts)

## 3. Follow-ups (not this change)

- [ ] 3.1 When CallOps `increment_call_log` is fixed to count `subscribed`/`opted_out`/`dialed`, evaluate switching the reports table back to CallOps analytics (raw-derived view stays valid either way)
