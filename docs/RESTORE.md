# Restoring HD Events HQ

There are four ways back, from the smallest to the largest. Start at the top.

| Problem | Use |
|---|---|
| A bad save in the last few hours (deleted a job, wrong stock count) | **A. Saved versions** |
| Something went wrong days ago | **B. Daily or monthly cloud backup** |
| The app will not load, but you have a downloaded file | **C. Import backup file** |
| The whole database is damaged or deleted | **D. D1 Time Travel**, then B |

Every restore through A, B or C first keeps the current workspace as a saved version, so it can be undone.

## A. Saved versions (in the app)
1. **History & backups** → **Saved versions**.
2. Each row is the workspace as it was *before* a save at that time. Read the **Activity log** to find the
   save that caused the problem, then pick the version just before it.
3. Press **Restore** and confirm. The page reloads.

## B. Cloud backup (in the app)
1. **History & backups** → **Daily and monthly backups**.
2. Press **Restore** on the date you want. The app checks the file's checksum and runs the same stock checks
   as a normal save before it replaces anything. A damaged file is refused.

Daily copies are kept for 35 days. A copy taken on the 1st of each month is kept permanently under `monthly/`.

## C. Import a downloaded backup file
Any file from **Export all data** or from **Download** in the backup list can be loaded with **Import backup**.
They use the same format.

## D. Whole-database recovery (Cloudflare D1 Time Travel)
D1 keeps its own point-in-time history: 30 days on the paid plan, 7 days on the free plan.
```
npx wrangler d1 time-travel info <your-database-name> --timestamp "2026-11-22T09:00:00Z"
npx wrangler d1 time-travel restore <your-database-name> --timestamp "2026-11-22T09:00:00Z"
```
If D1 itself is unusable, create a new database, run both files in `migrations/`, point `wrangler.toml` at it,
deploy, then use **B** to load the latest cloud backup.

## Restore drill (do this once now, then every 3 months)
The goal is to prove a backup restores before you ever need it. Do it on a *staging copy*, never on live data.

1. Make a staging database and bucket:
   ```
   npx wrangler d1 create hd-events-hq-staging
   npx wrangler d1 execute hd-events-hq-staging --remote --file migrations/0001_workspace.sql
   npx wrangler d1 execute hd-events-hq-staging --remote --file migrations/0002_safety_layer.sql
   npx wrangler r2 bucket create hd-events-hq-staging-backups
   ```
2. Add a `[env.staging]` section to `wrangler.toml` using those two names and a separate Access application,
   then `npx wrangler deploy --env staging`.
3. In the **live** app, **Download** last night's backup and note the record counts (`records` near the top of
   the file).
4. In the **staging** app, **Import backup** with that file.
5. Check that the staging app shows the same number of jobs, inventory items and clients, and that a
   reserved job shows the same shortages as live.
6. Write the date and result in the log below.

The automated tests (`npm test`) run the same drill against a local database on every change:
back up, wipe, restore, compare.

### Drill log
| Date | Backup used | Counts match? | Done by |
|---|---|---|---|
| | | | |
