# TowEx Operations — development baseline (22 October 2026)

**Status: locally working prototype, not production deployment.** This repository establishes an independently editable source code baseline. It does not claim to contain the unrecoverable source of the existing published ChatGPT Site.

## Architecture

**Job Register (single source of truth) → Dispatch Board, Driver Runs, Invoice Workspace, Activity Log.**

Every newly saved job goes into the Job Register (`src/store.js`); other screens derive from its records. Updating a driver's assignment or a job's status immediately changes every view in the same browser. Delivered jobs become available for invoice drafting. Issued invoices snapshot their associated job records so later edits do not silently alter billed totals.

## Run

No build tools or external packages needed:

```bash
cd towex-app-v1
python3 -m http.server 8080
# Open http://localhost:8080
node --test tests/*.test.mjs
```

You may also deploy the directory to any static web server. **Do not treat the static site as a multi-user system:** jobs currently save to browser `localStorage`, not the cloud. Use Settings → Export backup regularly. Browsers/devices do **not** share data. Clearing site data can erase the local register. We have intentionally not connected production data or shared this with drivers.

## Status of user-approved work

| Item | Current state |
|---|---|
| 1. Recover existing app | Existing site identified, source not exposed by available Site/Drive snapshot; this independent baseline is versioned in GitHub |
| 2. Job Register feeds dispatch | **Implemented** |
| 3. Reconcile October active jobs | Reconciliation staging file provided; import only after confirming against the actual live list |
| 4. Locked invoice V10 | Price computation, candidate selection, invoice register, print preview built; **visual V10 template not yet provided in editable/source form** |
| 5. Test | Unit tests for pricing; browser end-to-end testing / production persistence still pending |
| 6. Driver workflows | Assignment view + collection/delivery actions built; **no authentication or driver permissions yet** |

## Pricing assumptions to verify before billing

- Standard £80 covers first 60 miles; £1 per mile after 60.
- Non-Stellantis urgent / same-day £100 covers first 60 miles; £1.20 after 60.
- Stellantis standard / urgent / same-day **all** £80 + £1 for every mile after the first 60. **No handover fee.**
- Appraisal/OBD optionally £20, other-client handover optionally £30, negotiation optionally 20% of purchase saving, EV charge time £20/hour, electricity/fuel/other at cost.
- GCS management movement: £80 flat.
- Billable miles and shortest driver miles are **separate editable fields**; no automatic route inflation. Only invoice defensible mileage actually driven.
- Manual movement-fee override supports negotiated deals. This calculation is an *estimate* until reviewed and approved.
- VAT/bank details are intentionally not invented. Invoices are previews until the actual V10 master and tax details are verified.
- Five **working day** payment terms should be confirmed against applicable bank holidays and due-date chosen before issue; the app intentionally leaves due date blank.

## Next engineering steps

1. Recover site project source from the original authoring environment if available; compare before migrating code or replacing production URL.
2. Add authenticated database (e.g., Postgres with row-level security and user roles), migrations, and a robust sync/audit layer. Migrate existing records only after deduplication.
3. Implement secure driver-only role and mobile collection/delivery confirmations, optional photos/signatures and inspections.
4. Import exact locked V10 invoice layout and bank details; generate pixel-matched PDFs with approval step.
5. Integrate Google Sheets if it remains operationally necessary; avoid creating two independently editable sources of truth.
6. Run end-to-end browser testing, user acceptance, backup/restore drills and production deployment.

## Data schema

Job records include `id`, `registration`, `vehicle`, `client`, `pickup`, `dropoff`, `collectionDate`, `deliveryDate`, `driver`, `status`, `serviceLevel`, `movementType`, `billableMiles`, `driverMiles`, `manualFee`, negotiation amounts, charge toggles, expenses, `invoiceId`, notes, and timestamps. `schemaVersion` is 1. JSON import intentionally replaces the whole register and requires confirmation.

## Safety boundary

The older published site at https://towex-operations.towex-uk.chatgpt.site was **not** modified in this step. It showed 6 old active jobs in its 8 October snapshot. Do not rely on either site's currently recorded statuses as a confirmed live dispatch list until reconciled.
