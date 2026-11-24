# Data model (Phase 2)

One D1 table per kind of record:

| App name | Table | Searchable columns (generated from the record) |
|---|---|---|
| jobs | `jobs` | title, stage, booking, start_at, end_at, client_id, staff_id |
| inventory | `inventory` | name (unique, case-insensitive), category |
| clients | `clients` | name, email |
| staff | `staff` | name, email |
| quotes | `quotes` | job_id |
| packages | `packages` | name |
| tasks | `tasks` | done, due |
| projects | `projects` | name |
| crewInvites | `crew_invites` | job_id, staff_id |
| crossHires | `cross_hires` | item |
| plans | `plans` | job_id, title, event_date |
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

## Job pipeline (Phase 3)
Each job has a `stage`. The stage decides `booking`, the stock reservation used by the shortage checker:

| Stage | Label | Reserves stock (`booking`) |
|---|---|---|
| `enquiry` | Enquiry | Draft (no) |
| `quote` | Quote sent | Draft (no) |
| `booked` | Booked | Reserved (yes) |
| `out` | Out on hire | Reserved (yes) |
| `returned` | Returned | Returned (released) |
| `invoiced` | Invoiced | Returned (released) |

The server refuses a job whose `stage` and `booking` disagree. Jobs saved before the pipeline have no `stage`:
the app and the `stage` column treat Draft as Enquiry, Reserved as Booked and Returned as Returned. Nothing is
rewritten until the job is next edited.

Enquiries and quotes may have no dates or kit. Booking a job requires both, and is refused if any item would
be short.

Tasks may have a `due` date (`YYYY-MM-DD`).

## Event plans (Phase 4)
One `plans` record per event, linked to its job by `jobId`:
- `stages`: the 11 checklist stages, each with items `{title, status (todo|doing|done|na), owner, due, notes, files[], link?, doc?}`
- `doc` (safety documents): `{kind (ra|fra|ms|hs|other), content, status (draft|approved), approval?}`
- `site`: `{address, center, zoom, features[]}`. Features are pins `{kind, label, at}` or shapes `{kind, label, points}`.
- `creative`: `{theme, vibe, audience, palette[], notes, images[]}`, where images are uploaded or AI-generated (`/files/creative/...`)
- `posters[]`: poster designs (text, layout, colours, background image); `exported` is the saved PNG

**Approval rule (checked by the server on every save):** a document can only be `approved` with an approval that
names the approver, gives a time, and carries a fingerprint of the exact approved text. If the text changes, the
fingerprint no longer matches and the save is refused unless the document goes back to `draft`. An approved
document therefore always matches what was signed off.

Plan deadlines appear on the calendar.

## Event plan: profile, suppliers and compliance

- `plan.profile`: answers to the event questions (outdoor, alcohol, food, liveMusic, structures, generators, rigging, children, camping, traffic, sfx, drones). Together with `plan.capacity`, it decides which checklist items `planFromTemplate` includes. Changing the profile later only adds missing items; it never deletes any.
- Checklist items can have `why` (the reason and the UK law or guidance behind it) and `cert: true` (a certificate or evidence to attach).
- `plan.suppliers[]`: `{id, name, type, contact, kw, phase, needsPower, pliExpiry, ra, ms, pat, foodReg, hygiene, gas, gasCert, licence, calcs, elecCert, sia, medPlan, notes, files}`.
  - `supplierGaps()` in stock.js lists missing evidence.
  - `powerEstimate()` sizes a generator: kW × 0.7 diversity ÷ 0.8 power factor × 1.25 headroom. This is a planning estimate only; the BS 7909 design is done by a competent electrician.
- Document kinds: ra, fra, ms, hs, evac, medical, crowd, traffic, noise, bar, other.
