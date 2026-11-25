-- Public sign-ups (e.g. "register interest" for Aberavon Beach Fest). Kept apart from the workspace
-- state: these can grow large, and only people with the Event Planner can see them.
CREATE TABLE IF NOT EXISTS signups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  list TEXT NOT NULL, email TEXT NOT NULL, data TEXT NOT NULL CHECK (json_valid(data)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(list, email)
);
