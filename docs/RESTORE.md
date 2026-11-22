# Restoring HD Events HQ

Four ways back, from the smallest to the largest. Start at the top.

| Problem | Use |
|---|---|
| A wrong change in the last 90 days (deleted a job, wrong stock count) | **A. Undo from Recent changes** |
| Need the whole workspace as it was on a given day | **B. Daily or monthly cloud backup** |
| You have a downloaded backup file | **C. Import backup** |
| The whole database is damaged or deleted | **D. D1 Time Travel**, then B |

A, B and C never delete history: each one is recorded as a new change and can itself be undone.

## A. Undo from Recent changes (in the app)
1. **History & backups** → **Recent changes**. Each row is one save, with what it changed.
2. Find the save where things went wrong and press **Undo from here**.
3. Every record changed by *that save and every later save* goes back to how it was just before. Records
   nobody touched since are left alone. The page reloads.

Changes are kept for 90 days.

## B. Cloud backup (in the app)
1. **History & backups** → **Daily and monthly backups** → **Restore** on the date you want.
2. The app checks the file's checksum and runs the same stock checks as a normal save. A damaged file is refused.
3. Only records that differ from the backup are changed.

Daily copies are kept for 35 days. The copy taken on the 1st of each month is kept permanently. The
pre-upgrade copy and any **Back up now** copies are under `manual/`.

## C. Import a downloaded backup file
**Import backup** accepts any file from **Export all data**, or from **Download** in the backup list.

## D. Whole-database recovery (Cloudflare D1 Time Travel)
D1 keeps its own point-in-time history: 30 days on the paid plan.
```
npx wrangler d1 time-travel info <your-database-name> --timestamp "2026-11-22T09:00:00Z"
npx wrangler d1 time-travel restore <your-database-name> --timestamp "2026-11-22T09:00:00Z"
```
If D1 itself is unusable:
1. Create a new database, then run `npx wrangler d1 migrations apply <new-name> --remote`.
2. Point `wrangler.toml` at it and deploy.
3. On the upgrade screen, press **Upgrade now**. It moves an empty workspace across.
4. Use **C** with the latest downloaded backup.

Photos and logos are in the `hd-events-hq-files` bucket. They are never overwritten or deleted by the app,
so a restored backup still finds them.

## Restore drill (do this once now, then every 3 months)
The goal is to prove a backup restores before you need it. Use a staging copy, never live data.

1. Create the staging resources:
   ```
   npx wrangler d1 create hd-events-hq-staging
   npx wrangler d1 migrations apply hd-events-hq-staging --remote
   npx wrangler r2 bucket create hd-events-hq-staging-backups
   npx wrangler r2 bucket create hd-events-hq-staging-files
   ```
2. Add an `[env.staging]` section to `wrangler.toml` with those names and a separate Access application,
   then run `npx wrangler deploy --env staging`.
3. Open staging and run the upgrade. It moves an empty workspace.
4. In **live**, **Download** last night's backup and note the `records` counts near the top of the file.
5. In **staging**, use **Import backup** with that file.
6. Check that staging shows the same number of jobs, equipment items and contacts, and that a reserved job shows
   the same shortages as live.
7. Record the drill in the log below.

`npm test` runs the same drill automatically on a local database on every change: back up, empty every
table, restore, compare.

### Drill log
| Date | Backup used | Counts match? | Done by |
|---|---|---|---|
| | | | |
