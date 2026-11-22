# Deploying Phases 1 to 3

This switches on backups, history, the new table storage and the redesigned dashboard in one go. Allow about 30 minutes.
Run the commands from the project folder with Wrangler signed in to the HD Events Cloudflare account.
From now on, deploy with Wrangler (`npx wrangler deploy`), not by pasting files into the Cloudflare dashboard:
the app is now several files plus database migrations.

## Before you start
1. **Download a backup by hand.** Open the live app and press **Export all data**. Keep the file safe.
2. **Workers Paid plan** ($5/month). Saving checks stock across the whole workspace, which can exceed the free
   plan's 10 ms CPU limit.

## 1. Create the two storage buckets
```
npx wrangler r2 bucket create hd-events-hq-backups
npx wrangler r2 bucket create hd-events-hq-files
```
Leave both private. Do not turn on public access or an `r2.dev` address.

## 2. Add the new database tables
```
npx wrangler d1 migrations apply <your-database-name> --remote
```
This runs the files in `migrations/`. All of them only *add* tables: the first one recognises the
existing `workspace` table and leaves it alone. Your current data is not touched.

## 3. Update `wrangler.toml`
Merge the parts marked **NEW** and **CHANGED** in `wrangler.toml.example` into your existing file:
- `main` now points to `src/worker.js`
- the `[assets]` section
- the two R2 buckets
- the cron trigger

## 4. (Optional) failure alerts
```
npx wrangler secret put ALERT_WEBHOOK
```
Paste an ntfy.sh topic URL, or a Slack or Discord incoming webhook. Failures always show in red in the app either way.

## 5. Deploy
```
npm test
npx wrangler deploy
```

## 6. Run the one-off storage upgrade
1. Open the app. You see **One-off storage upgrade** with a count of every kind of record.
2. Press **Upgrade now**. It:
   - takes a verified cloud backup of the current workspace
   - moves the embedded logo into file storage
   - copies every record into its own table
   - reads every record back and compares it with the original, field by field
   - switches over only if everything matches
3. You should see *"Done. Every record matched"*, and the **After upgrade** column should equal **Now**.
   If anything differs, it stops and says why, and nothing is switched over. The app keeps showing the upgrade screen.
4. Press **Open HD Events HQ**.

Crew members keep seeing their jobs throughout.

## 7. Check
- The backup box (bottom right) is green.
- Edit something small, such as ticking a task. Open **History & backups**. It appears under **Recent changes**
  with an **Undo from here** button.
- Upload a picture for one equipment item (**Upload picture**).
- Next morning, `daily/<date>.json` appears in the backup list.

Then do the restore drill in `RESTORE.md` once.

## If something goes wrong
- **During the upgrade:** nothing is switched over until every record matches. The old `workspace` record is
  never changed, so redeploying the previous version (`git checkout 44c0e0e` then `npx wrangler deploy`)
  brings the old app back exactly as it was.
- **After the upgrade:** use **History & backups** (see `RESTORE.md`). The pre-upgrade backup is listed under
  `manual/`.
