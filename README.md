# HD Events HQ

Cloudflare Worker app: owner dashboard, crew portal, stock and shortage checker, CRM, packages, cross-hire.

| File | Purpose |
|---|---|
| `worker.js` | Request routing, owner/crew pages, daily backup schedule |
| `access.js` | Cloudflare Access sign-in check |
| `stock.js` | Workspace validation and shortage calculation |
| `safety.js` | Version history, audit log, cloud backups, restore (Phase 1) |
| `owner.html` | Owner dashboard (single page) |
| `logo.txt` | Logo as a data URL for the crew page |
| `migrations/` | D1 database schema |

- Build plan: `docs/BUILD_PLAN.md`
- Phase 1 setup: `docs/PHASE1_SETUP.md`
- Restoring data: `docs/RESTORE.md`
- Security review: `docs/SECURITY_REVIEW.md`

Run the tests with `npm test` (Node 22+, no dependencies).
