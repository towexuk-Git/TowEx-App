# TowEx data flow

```mermaid
flowchart LR
  A[New job form] --> B[(Job Register)]
  B --> C[Dispatch Board]
  B --> D[Driver Runs]
  B --> E[Delivered jobs]
  E --> F[Invoice drafts]
  F --> G[Issued invoice snapshot]
  B --> H[Activity Log]
  D -->|Collection and delivery status| B
```

## Rule: never create job records directly on the Dispatch Board

Dispatch is a **view** of the Job Register. The driver view is another projection over the same records. Status updates from either screen apply back to the shared job record. There is no manually maintained separate `dispatchJobs` table or workbook.

## Current persistence

`localStorage` persists a single-browser register only. For multi-user deployment replace `saveState` / `loadState` with authenticated backend operations. Client-side audit entries do not provide tamper-proof auditing.

## Proposed production relational schema

`jobs` has unique job UUID, idempotent external reference, version counter, client ID, VRM, vehicle, source/destination, schedule, driver ID, job status, collected/delivered timestamps, driver and billable miles, pricing choices, costs and invoice reference. `job_events` append-only job status/assignment history; `clients` and `drivers` are authoritative lookup entities; `invoices` and `invoice_items` snapshot issued prices. Index jobs on `(status, collection_date)`, `(driver_id, status)` and `(client_id, created_at)`.

Authenticated roles: owner/admin (write all), dispatcher (jobs & allocation), driver (read assigned / submit permitted status+evidence), accountant (invoice approvals only). Enforce authorization server-side. Never embed private keys in the frontend. Backups, restore and point-in-time recovery are needed before production.
