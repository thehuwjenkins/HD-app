-- Phase 2: one table per kind of record, replacing the single `workspace` record.
-- Each row keeps the full record as JSON in `data`, so no field the app uses is lost, plus
-- generated columns pulled from that JSON for the things we search, sort and check on.
-- `version` goes up by one on every change and stops two devices overwriting each other.
-- The old `workspace` table is left exactly as it was, as a fallback.

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL CHECK (json_valid(data)),
  updated_at TEXT NOT NULL, updated_by TEXT NOT NULL,
  title TEXT GENERATED ALWAYS AS (json_extract(data,'$.title')) VIRTUAL,
  booking TEXT GENERATED ALWAYS AS (json_extract(data,'$.booking')) VIRTUAL,
  start_at TEXT GENERATED ALWAYS AS (json_extract(data,'$.start')) VIRTUAL,
  end_at TEXT GENERATED ALWAYS AS (json_extract(data,'$.end')) VIRTUAL,
  client_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.clientId')) VIRTUAL,
  staff_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.staffId')) VIRTUAL
);
CREATE INDEX IF NOT EXISTS jobs_dates ON jobs(start_at, end_at);
CREATE INDEX IF NOT EXISTS jobs_booking ON jobs(booking);
CREATE INDEX IF NOT EXISTS jobs_client ON jobs(client_id);
CREATE INDEX IF NOT EXISTS jobs_staff ON jobs(staff_id);

CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL CHECK (json_valid(data)),
  updated_at TEXT NOT NULL, updated_by TEXT NOT NULL,
  name TEXT GENERATED ALWAYS AS (json_extract(data,'$.name')) VIRTUAL,
  category TEXT GENERATED ALWAYS AS (json_extract(data,'$.category')) VIRTUAL
);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_name ON inventory(lower(name));

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL CHECK (json_valid(data)),
  updated_at TEXT NOT NULL, updated_by TEXT NOT NULL,
  name TEXT GENERATED ALWAYS AS (json_extract(data,'$.name')) VIRTUAL,
  email TEXT GENERATED ALWAYS AS (lower(trim(json_extract(data,'$.email')))) VIRTUAL
);
CREATE INDEX IF NOT EXISTS clients_name ON clients(name);

CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL CHECK (json_valid(data)),
  updated_at TEXT NOT NULL, updated_by TEXT NOT NULL,
  name TEXT GENERATED ALWAYS AS (json_extract(data,'$.name')) VIRTUAL,
  email TEXT GENERATED ALWAYS AS (lower(trim(json_extract(data,'$.email')))) VIRTUAL
);
CREATE INDEX IF NOT EXISTS staff_email ON staff(email);

CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL CHECK (json_valid(data)),
  updated_at TEXT NOT NULL, updated_by TEXT NOT NULL,
  job_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.jobId')) VIRTUAL
);
CREATE TABLE IF NOT EXISTS packages (
  id INTEGER PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL CHECK (json_valid(data)),
  updated_at TEXT NOT NULL, updated_by TEXT NOT NULL,
  name TEXT GENERATED ALWAYS AS (json_extract(data,'$.name')) VIRTUAL
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL CHECK (json_valid(data)),
  updated_at TEXT NOT NULL, updated_by TEXT NOT NULL,
  done INTEGER GENERATED ALWAYS AS (json_extract(data,'$.done')) VIRTUAL
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL CHECK (json_valid(data)),
  updated_at TEXT NOT NULL, updated_by TEXT NOT NULL,
  name TEXT GENERATED ALWAYS AS (json_extract(data,'$.name')) VIRTUAL
);
CREATE TABLE IF NOT EXISTS crew_invites (
  id INTEGER PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL CHECK (json_valid(data)),
  updated_at TEXT NOT NULL, updated_by TEXT NOT NULL,
  job_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.jobId')) VIRTUAL,
  staff_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.staffId')) VIRTUAL
);
CREATE TABLE IF NOT EXISTS cross_hires (
  id INTEGER PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL CHECK (json_valid(data)),
  updated_at TEXT NOT NULL, updated_by TEXT NOT NULL,
  item TEXT GENERATED ALWAYS AS (json_extract(data,'$.item')) VIRTUAL
);

-- Company details, branding and any other workspace-wide settings, one row per key.
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL CHECK (json_valid(data)),
  updated_at TEXT NOT NULL, updated_by TEXT NOT NULL
);

-- Every change keeps the record as it was before, so any save can be undone.
CREATE TABLE IF NOT EXISTS record_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id INTEGER NOT NULL,           -- groups the records changed by one save
  at TEXT NOT NULL,
  email TEXT NOT NULL,
  reason TEXT NOT NULL,               -- 'save' | 'restore' | 'migrate'
  collection TEXT NOT NULL,
  record_id TEXT NOT NULL,
  op TEXT NOT NULL,                   -- 'create' | 'update' | 'delete'
  before TEXT                         -- JSON before the change; NULL when created
);
CREATE INDEX IF NOT EXISTS record_history_save ON record_history(save_id);
CREATE INDEX IF NOT EXISTS record_history_at ON record_history(at);

-- Used inside a save to abort the whole transaction if any record changed underneath us.
CREATE TABLE IF NOT EXISTS sync_guard (ok INTEGER NOT NULL CHECK (ok = 1));

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS migration_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  email TEXT NOT NULL,
  ok INTEGER NOT NULL,
  before_counts TEXT,
  after_counts TEXT,
  detail TEXT
);
