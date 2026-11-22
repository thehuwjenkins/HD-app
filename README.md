# HD Events HQ

Cloudflare Worker app: owner dashboard, crew portal, stock and shortage checker, CRM, packages, cross-hire.

## Layout
| Path | Purpose |
|---|---|
| `src/worker.js` | Request routing, sign-in check, daily backup schedule |
| `src/access.js` | Cloudflare Access sign-in check |
| `src/store.js` | Table storage: per-record saves, history, undo |
| `src/safety.js` | Backups, restore, audit log, backup status |
| `src/migrate.js` | One-off move from the old single record to tables |
| `src/files.js` | Photo and logo storage (R2) |
| `src/pages.js` | Crew page and upgrade screen |
| `src/owner.html` | Owner page shell |
| `public/app/` | Owner app in the browser, one file per area: overview, pipeline, calendar, jobs, inventory, CRM, … |
| `public/app/styles.css` | Styles, with colour and spacing tokens at the top |
| `public/app/stock.js` | Stock checks, shared by server and browser |
| `migrations/` | D1 database schema |

## Docs
- `docs/BUILD_PLAN.md`: the plan and status
- `docs/DEPLOY.md`: how to deploy (Phases 1 to 3)
- `docs/RESTORE.md`: getting data back, and the restore drill
- `docs/DATA_MODEL.md`: tables, saving and history
- `docs/SECURITY_REVIEW.md`: security review

## Tests
`npm test` (Node 22+, no dependencies). Covers the upgrade, per-record saves and conflicts, undo, backups,
restore, uploads and access rules, against a real SQLite database and signed Access tokens.
