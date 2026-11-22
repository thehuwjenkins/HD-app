-- Phase 3: job pipeline stage and task due dates as searchable columns.
-- Jobs saved before the pipeline existed get a stage worked out from their reservation status.
ALTER TABLE jobs ADD COLUMN stage TEXT GENERATED ALWAYS AS (coalesce(json_extract(data,'$.stage'),
  CASE json_extract(data,'$.booking') WHEN 'Reserved' THEN 'booked' WHEN 'Returned' THEN 'returned' ELSE 'enquiry' END)) VIRTUAL;
CREATE INDEX IF NOT EXISTS jobs_stage ON jobs(stage);
ALTER TABLE tasks ADD COLUMN due TEXT GENERATED ALWAYS AS (json_extract(data,'$.due')) VIRTUAL;
CREATE INDEX IF NOT EXISTS tasks_due ON tasks(due);
