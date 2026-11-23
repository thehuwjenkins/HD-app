-- Phase 4: event plans. One plan per event, linked to its job. The plan holds the checklist,
-- site map, creative board, posters and safety documents as JSON in `data`.
CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL CHECK (json_valid(data)),
  updated_at TEXT NOT NULL, updated_by TEXT NOT NULL,
  job_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.jobId')) VIRTUAL,
  title TEXT GENERATED ALWAYS AS (json_extract(data,'$.title')) VIRTUAL,
  event_date TEXT GENERATED ALWAYS AS (json_extract(data,'$.eventDate')) VIRTUAL
);
CREATE INDEX IF NOT EXISTS plans_job ON plans(job_id);
CREATE INDEX IF NOT EXISTS plans_date ON plans(event_date);
