# TowEx Operations — v0.3 admin-gated route scheduling prototype (23 October 2026)

**Status: locally working prototype, not production deployment.** This repository establishes an independently editable source code baseline. It does not claim to contain the unrecoverable source of the existing published ChatGPT Site.

## Architecture

**Job Register (single source of truth) → Dispatch Board, Driver Runs / Schedules, Condition Reports, Invoice Workspace, Activity Log.**

Every newly saved job goes into the Job Register (`src/store.js`); other screens derive from its records. Updating a driver's assignment or a job's status immediately changes every view in the same browser. Delivered jobs are accumulated by client and automatically produce an unissued **draft invoice** when a threshold of two or three eligible delivered jobs is reached (default three). Issued invoices snapshot their associated job records so later edits do not silently alter billed totals.

## Run

No build tools or external packages needed:

```bash
cd towex-app-v1
python3 -m http.server 8080
# Open http://localhost:8080
node --test tests/*.test.mjs
```

You may also deploy the directory to any static web server. **Do not treat the static site as a multi-user system:** jobs currently save to browser `localStorage`, not the cloud. Use Settings → Export backup regularly. Browsers/devices do **not** share data. Clearing site data can erase the local register. We have intentionally not connected production data or shared this with drivers.

## Four essential TowEx workflows (v0.2)

1. **Screenshot → Job Register.** Upload a booking screenshot, run browser-side Tesseract.js OCR (downloaded from a pinned public CDN when online), inspect candidate vehicle, registration, addresses, client and date. You **must** open the prefilled job editor and correct any missed fields before saving. The OCR parser intentionally does not guess ambiguous booking dates or collection directions. Text-paste fallback included. **Not yet a hosted AI document extractor.**
2. **Driver schedules and release approvals.** The Schedules tab creates editable per-driver/per-day drafts from the Job Register. For each leg a dispatcher enters **at least two checked real map routes** (format `via | miles | minutes`), a confirmed target arrival time, handover time and driver origin. The app compares **shortest travel time** or a **75%-of-range mid-length practical route** (previously agreed invoice-planning preference, used here only as a route comparison target, never as automatic billed mileage). It calculates planned arrivals, flags lateness and hours-limit overruns, and records relay notes/verification. The route options must be supplied from mapping; **there is still no automatic navigation, live traffic, rail/public-transit, cross-driver relay solver or reliable source of truth for travel times**.

   A schedule moves through **Draft → Pending approval → Approved → Released**. Only a submitted plan without blocking warnings can be approved; release requires prior approval. Editing the plan resets approval; relevant changes to underlying jobs automatically mark it `Needs revision`. Driver-share copy is disabled until release, and approved/released history is stored. **This remains a single-browser demonstration, not secure authorisation:** the “admin” name is typed into the UI, not authenticated. Real role enforcement and publication must be implemented in the backend before production.
3. **Collection/delivery condition evidence.** Separate stages per job. Drivers/operators can tap a vehicle diagram, add multiple types of damage and notes, and photograph each stage (1-4 photos, resized for prototype storage). The app shows collection damage annotations while completing the delivery report. Actions to mark collected/delivered require the matching saved report. **No authenticated drivers, secure cloud photo storage, timestamps sourced from a trusted server, or signed reports yet.** Images are in browser localStorage; do not use for live insurance evidence.
4. **Client invoice batching.** A default of three (optionally two globally or per-client) delivered, not-yet-billed vehicles from one client triggers a draft invoice. Existing drafts are excluded from subsequent batches. The draft must receive a proper unique TX-#### number and be manually approved before issuance. **No email send, live payment terms automation or exact locked V10 invoice artwork yet.**

## Status of user-approved work

| Item | Current state |
|---|---|
| 1. Recover existing app | Existing site identified, source not exposed by available Site/Drive snapshot; this independent baseline is versioned in GitHub |
| 2. Job Register feeds dispatch | **Implemented** |
| 3. Reconcile October active jobs | Reconciliation staging file provided; import only after confirming against the actual live list |
| 4. Locked invoice V10 | Price computation, candidate selection, invoice register, print preview built; **visual V10 template not yet provided in editable/source form** |
| 5. Test | 27 unit tests pass; browser end-to-end testing, OCR accuracy / mobile camera tests, production persistence still pending |
| 6. Driver workflows | Draft/approve/release schedule + photographed collection/delivery condition reports built; **no authentication or shared photo storage yet** |

## Scheduling guardrails (v0.3)

- Driver journeys compare *measured options provided by a dispatcher*. No road distances or durations are generated automatically. The shortest-timed option is not necessarily the shortest mileage.
- Mid-length preference targets **75% of the distance range between shortest and longest *reasonable* supplied routes**, then selects the closest actual supplied option. It never fabricates a new route.
- The planning maximum shift length defaults to **9.5 hours as an editable planning target**, not a statement of transport law.
- All route and stop times are estimates, not guarantees. Planned targets are treated as latest arrivals until confirmed with the booking party. Live traffic, closures, access restrictions, public transport, parking, handovers and time-zone changes require operator review.
- Daily plans currently have one assigned driver per job. **Baton vehicles, multi-driver relays, driver pickup/drop-off, breaks, pre-positioning and inter-driver dependencies still need an integrated optimiser and shared database.**
- `Released` authorises copying instructions but does not send messages automatically. No authenticated user roles, multi-device synchronisation or production audit yet.
- **Driver pay miles and billable client miles remain separate from the schedule policy.** Record actual defensible travel and have the client invoice approved.

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
3. Implement authenticated driver-only screens, encrypted cloud photo attachments, digital signatures, server audit log, and role-restricted collection/delivery reports.
4. Integrate a more robust screenshot/document extraction API with confidence scores, review queue, duplicates and robust address parsing. Add verified live route alternatives, traffic-aware ETA calculation, cross-driver baton/relay scheduling, and hard role-based approval gates. Import exact locked V10 invoice layout and bank details; generate pixel-matched PDFs with approval step.
5. Integrate Google Sheets if it remains operationally necessary; avoid creating two independently editable sources of truth.
6. Run end-to-end browser testing, user acceptance, backup/restore drills and production deployment.

## Data schema

Job records include `id`, `registration`, `vehicle`, `client`, `pickup`, `dropoff`, `collectionDate`, `deliveryDate`, `driver`, `status`, `serviceLevel`, `movementType`, `billableMiles`, `driverMiles`, `manualFee`, negotiation amounts, charge toggles, expenses, `invoiceId`, notes, and timestamps. `schemaVersion` is 1. JSON import intentionally replaces the whole register and requires confirmation.

## Safety boundary

The older published site at https://towex-operations.towex-uk.chatgpt.site was **not** modified in this step. It showed 6 old active jobs in its 8 October snapshot. Do not rely on either site's currently recorded statuses as a confirmed live dispatch list until reconciled.
