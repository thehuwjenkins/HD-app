-- Reference schema for the existing single-record workspace, as used by worker.js.
-- Already present in production; IF NOT EXISTS makes this a no-op there.
-- Only needed when building a fresh copy (for example a staging database for a restore drill).
CREATE TABLE IF NOT EXISTS workspace (
  id INTEGER PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL
);
INSERT OR IGNORE INTO workspace (id, revision, payload) VALUES (1, 0,
  '{"jobs":[],"inventory":[],"staff":[],"clients":[],"tasks":[],"projects":[],"packages":[],"crewInvites":[],"crossHires":[],"quotes":[]}');
