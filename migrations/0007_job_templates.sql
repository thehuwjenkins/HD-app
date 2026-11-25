-- Job templates: a saved starting point (kit, crew lines, venue, notes) for new jobs. No dates or workflow.
CREATE TABLE IF NOT EXISTS job_templates (
  id INTEGER PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL CHECK (json_valid(data)),
  updated_at TEXT NOT NULL, updated_by TEXT NOT NULL
);
