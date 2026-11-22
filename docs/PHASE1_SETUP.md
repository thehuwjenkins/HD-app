# Phase 1 setup: backups, version history and audit log

These steps switch on the safety layer for the live app. Each command is run once, from the project folder,
with Wrangler signed in to the HD Events Cloudflare account.

## Before you start
1. **Download a backup by hand.** Open the app and press **Export all data**. Keep the file somewhere safe.
   This is your fallback if anything below goes wrong.
2. Check the Cloudflare plan. D1, R2 and cron triggers all work on the free plan, but the Workers free plan
   allows only 10 ms of CPU per request. Saving now also reads the old workspace to record what changed, so
   use the **Workers Paid** plan ($5/month), as the build plan already recommends.

## 1. Create the backup bucket
```
npx wrangler r2 bucket create hd-events-hq-backups
```

## 2. Add the new tables
These add three tables (`workspace_versions`, `audit_log`, `backup_log`) and leave `workspace` untouched.
```
npx wrangler d1 execute <your-database-name> --remote --file migrations/0002_safety_layer.sql
```
(`0001_workspace.sql` documents the existing table. It is only needed when building a fresh staging copy.)

## 3. Update the Wrangler config
Merge the sections marked **NEW** in `wrangler.toml.example` into your existing `wrangler.toml`
(R2 binding `BACKUPS`, the daily cron trigger, optional `VERSIONS_KEEP`).

## 4. (Optional) failure alerts
Create a free topic at ntfy.sh, or a Slack or Discord incoming webhook, then run:
```
npx wrangler secret put ALERT_WEBHOOK
```
Backup failures always show in red on the dashboard whether or not this is set.

## 5. Deploy and check
```
npm test
npx wrangler deploy
```
Then in the app:
1. The backup box (bottom right) shows *"No successful backup yet"* in red.
2. Open **History & backups** and press **Back up now**. Expect *"Backup saved and verified"*.
3. The status turns green. Make a small edit, such as adding a task, and check it appears under **Activity log**
   and that a new entry appears under **Saved versions**.
4. Next morning, check that `daily/<date>.json` appears in the backup list.

Then do the restore drill in `docs/RESTORE.md` once.
