-- Crew reports against a job: equipment damage, debrief notes, and uploaded receipts / venue photos.
CREATE TABLE IF NOT EXISTS job_reports (
  id INTEGER PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL CHECK (json_valid(data)),
  updated_at TEXT NOT NULL, updated_by TEXT NOT NULL,
  job_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.jobId')) VIRTUAL,
  kind TEXT GENERATED ALWAYS AS (json_extract(data,'$.kind')) VIRTUAL
);
CREATE INDEX IF NOT EXISTS job_reports_job ON job_reports(job_id);
