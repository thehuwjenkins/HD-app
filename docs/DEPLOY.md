# Deploying Phases 1 to 4

This switches on backups, history, the new table storage, the redesigned dashboard and the event planner in one go. Allow about 30 minutes.
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
- the `[ai]` binding (AI images in the event planner)

## AI images
The event planner's **Generate image** and **Generate artwork** buttons use Cloudflare Workers AI on your
existing Cloudflare account; nothing else to sign up for. The `[ai]` section in `wrangler.toml` switches it on.
- Model: FLUX.1 schnell (`@cf/black-forest-labs/flux-1-schnell`). To try another Workers AI image model, set
  `AI_IMAGE_MODEL` under `[vars]`.
- Cost: Workers AI includes a daily free allowance, then charges per use. Check the current Workers AI pricing
  page. A few dozen images a day is typically within or close to the free allowance.
- Without the `[ai]` section the rest of the planner works; the buttons explain that AI images are off.

## Maps
The site map uses Esri satellite imagery and OpenStreetMap, which need no key, and address search by Photon
(OpenStreetMap data). Typing an address sends it to Photon. Each map has an **Open in Google Maps** link. Esri's
imagery is free for light use with attribution. If the planner becomes heavily used, or you want Google's own
satellite tiles in the app, that can be switched with a Google Maps API key.

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

## 7. Set the document approver
Branding → Company details → **Approver for safety documents**: enter your full name exactly as it should appear
on approved documents.

## 8. Check
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

## Live setup (November 2026)

- **Address:** https://hq.hd-events.co.uk. This is a Workers custom domain on the hd-events.co.uk zone.
- **Worker:** `hd-events-hq`
- **Database:** D1 `hd-hq`
- **Storage:** R2 buckets `hd-events-hq-backups` and `hd-events-hq-files`
- **Daily backup:** runs at 02:17 UTC.
- **Sign-in:** Cloudflare Access, team `billowing-wind-e033`.
  - Application: "HD Events HQ". Login is by email code.
  - Policy: anyone who proves their email gets past Access. The worker then decides what they see:
    - the owner gets the full app;
    - emails listed under Staff get "My jobs" only;
    - everyone else is refused.
- **App files:** the files in `public/` are bundled into the worker (`npm run build` writes `src/static.gen.js`) rather than uploaded as static assets. A test fails if the bundle is out of date.
- **Deploy:** run `npm run deploy`. This builds, tests, then runs `wrangler deploy`.

## People & access (team members and invite-only sign-in)

- Team members are stored in the setting `access` = `{members: [{name, email, sections[]}]}`. Rules live in `src/roles.js`:
  - collections outside a member's sections are never sent to them;
  - money fields are stripped unless they have `money`;
  - changes outside their sections are refused;
  - hidden prices are put back on save;
  - only the owner can approve or change approved safety documents.
- The Cloudflare Access policy "Invited people only (managed by HD Events HQ)" lists:
  - the owner;
  - team members;
  - Staff with an email address.

  The worker updates it after any save that touches Staff or People & access. This needs the worker secret `CF_ACCESS_TOKEN`: an API token with only *Account > Access: Apps and Policies > Edit*. Without it, saves still work, but the page shows that the sign-in list needs updating.

## Loading inventory from a list

`NODE_USE_ENV_PROXY=1 node --import ./test/register.js tools/import-inventory.mjs items.json`

- Adds new items and updates existing ones (matched by name), all in one save.
- The save goes through the app's own `applyChanges`, so it is validated, appears in History and can be undone.
- Add `--dry-run` to preview without saving.
- Uses `tools/live-d1.mjs`, which talks to the live D1 database through Cloudflare's API.

## Client quote links (/q/<token>)

- Each job gets a random 40-character token when a quote is first sent. https://hq.hd-events.co.uk/q/<token> shows the quote to the client without sign-in.
- A second Cloudflare Access application, "HD Events HQ: client quote links (public)", covers `hq.hd-events.co.uk/q` with a **bypass** policy. Everything else still needs sign-in, and the worker itself refuses any non-/q request without a valid Access pass.
- Accepting a quote on that page:
  - books the job (if stock and dates allow);
  - creates the invoice number;
  - records who accepted it;
  - turns the same link into the invoice page.

  If the job can't be booked automatically, it stays at Quote sent with `needsBooking`, and Overview asks Huw to book it.
- Quotes expire 30 days after `quoteSentAt`.
