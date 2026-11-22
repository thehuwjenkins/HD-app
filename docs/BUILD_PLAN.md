# HD Events HQ: Build Plan

Builds on the existing Cloudflare-hosted app (owner dashboard, crew portal, stock and shortage checker, CRM, packages, cross-hire). Nothing is thrown away; each phase improves what is already there.

## Guiding principles
- Keep the existing app and data. Build on it, do not restart.
- Safety of business data comes first: backups and version history before new features.
- All health and safety, risk assessment and insurance content is a first draft only. A competent person must review, edit and sign off every document before use.
- Plain, clear dashboard: one obvious next action per screen.

## Phase 1: Backup and safety layer
**Status: built and tested locally (22 Nov 2026). Not yet deployed: see `DEPLOY.md`.**

1. Automatic daily backups to a separate location, keeping at least 30 days of copies.
2. Tested restore: documented, rehearsed on a copy before it is ever needed.
3. Version history: keep the last several saved versions of the workspace for rollback.
4. Audit log: who changed what and when.
5. Status check: panel showing date/result of last backup, with an alert on failure.
6. Security review: staff sign-in rules, owner-only editing, no secrets in page code.

## Phase 2: Database restructure for scale
**Status: built and tested locally (22 Nov 2026). Not yet deployed: see `DEPLOY.md` (deploys together with Phase 1). Details in `DATA_MODEL.md`.**

- Move from one saved record (capped near 1.8 MB) to tables: jobs, inventory, clients, staff, quotes, packages, tasks, cross-hires.
- Save only the record that changed.
- Equipment photos and logos in file storage, not inside the data.
- Migration importing the existing workspace, with before/after record-count checks.
- Split the large owner page into smaller pieces.

## Phase 3: Dashboard redesign
**Status: built and tested locally (22 Nov 2026). Not yet deployed: deploys with Phases 1 and 2 (`DEPLOY.md`).**

- Job pipeline: enquiry, quote, booked, out, returned, invoiced.
- Calendar view of jobs, crew and kit.
- Overview cards: this week's jobs, shortages, tasks due, outstanding quotes.
- Cleaner spacing, consistent buttons, mobile-friendly crew layouts.

## Phase 4: Event Planner module
"Plan an Event" guided checklist built from templates of past events. Stages:
1. Concept and creative design
2. Venue, licensing and permissions
3. Insurance
4. Risk assessment
5. Health and safety plan
6. Method statements and site plans
7. Staffing and crew booking
8. Equipment booking (reserves stock in the existing job system)
9. Suppliers and subcontractors
10. Build, show day and derig schedule
11. Post-event review and invoicing

Each item: status, owner, deadline, notes, attached documents.
AI-assisted drafting of risk assessments, method statements and H&S plan, always marked "Draft: needs review" and only finalised once a named person approves.

## Phase 5: Business extras
- Invoices and online payment links
- Customer-facing booking / enquiry page
- Barcode / QR check-out and check-in
- Calendar feeds for crew
- Accounting export (Xero / QuickBooks)

## Order of work
1. Upload current files (access.js, stock.js, worker.js, owner.html, logo.txt).
2. Phase 1, including a tested restore.
3. Phase 2, then Phase 3, with Phase 4 designed alongside so the data model fits.

## Open questions
- Backup location: Cloudflare R2 for now (default); Google Drive copy optional later.
- ~~Who besides Huw needs edit rights?~~ Decided: only Huw edits.
- Which past events become the first planner templates?
- Who is the competent person signing off H&S documents?
