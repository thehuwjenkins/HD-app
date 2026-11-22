# Data model (Phase 2)

One D1 table per kind of record:

| App name | Table | Searchable columns (generated from the record) |
|---|---|---|
| jobs | `jobs` | title, booking, start_at, end_at, client_id, staff_id |
| inventory | `inventory` | name (unique, case-insensitive), category |
| clients | `clients` | name, email |
| staff | `staff` | name, email |
| quotes | `quotes` | job_id |
| packages | `packages` | name |
| tasks | `tasks` | done |
| projects | `projects` | name |
| crewInvites | `crew_invites` | job_id, staff_id |
| crossHires | `cross_hires` | item |
| company, branding, … | `settings` (one row per key) | – |

Each row stores:
- the full record as JSON in `data`
- `version`, which goes up by one on every change
- `updated_at` and `updated_by`

The searchable columns are SQLite *generated columns*, read from `data`, so they can never disagree with it.
This keeps every field the app already uses, including old fields on older records, while giving Phase 3
(calendar, pipeline) and Phase 4 (planner) indexed columns to query. Fields can be promoted to real columns
later without another full migration.

## Saving
The browser keeps the last saved copy of every record. On each change it sends only the records that differ,
each with the `version` it last saw. In one transaction, the server:
1. checks every version still matches; if any record was changed elsewhere, nothing is written (409)
2. runs the stock checks on the whole workspace with the changes applied
3. writes the changed rows, a before-image of each into `record_history`, and one `audit_log` entry

Two devices editing *different* records no longer conflict.

## History
- `record_history`: the record as it was before each change, grouped by save, kept 90 days. Used by **Undo from here**.
- `audit_log`: one line per save, restore, backup and upgrade, with a summary of what changed. Kept permanently
  and included in every backup.
- `backup_log`: result of every backup.
- `migration_log`: result of the one-off upgrade, with before and after counts.

## Files
Photos and logos are stored in the `FILES` R2 bucket as `branding/<sha256>.<ext>` or `equipment/<sha256>.<ext>`.
Records hold only the `/files/...` address. Files are named by their contents and never overwritten.

## Legacy
The old `workspace` row is left exactly as it was before the upgrade, as a fallback. It is no longer read once the
`meta.migrated` flag is set.
