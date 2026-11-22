-- Phase 1: backup and safety layer.
-- Adds version history, an audit log and a backup log alongside the existing
-- `workspace` table (id, revision, payload). The workspace table is not changed.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS workspace_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  revision INTEGER NOT NULL,          -- revision this payload had before it was replaced
  payload TEXT NOT NULL,              -- full workspace JSON as it was
  saved_at TEXT NOT NULL,             -- ISO time it was replaced
  saved_by TEXT NOT NULL,             -- email of the person whose action replaced it
  reason TEXT NOT NULL                -- 'save' | 'restore'
);
CREATE INDEX IF NOT EXISTS workspace_versions_revision ON workspace_versions(revision);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  email TEXT NOT NULL,
  action TEXT NOT NULL,               -- 'save' | 'restore' | 'backup' | 'backup-failed'
  revision INTEGER,                   -- workspace revision after the action
  summary TEXT NOT NULL               -- JSON: what changed
);
CREATE INDEX IF NOT EXISTS audit_log_at ON audit_log(at);

CREATE TABLE IF NOT EXISTS backup_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  ok INTEGER NOT NULL,                -- 1 = written and verified, 0 = failed
  object_key TEXT,
  bytes INTEGER,
  sha256 TEXT,
  revision INTEGER,
  records TEXT,                       -- JSON record counts, for before/after checks
  error TEXT
);
CREATE INDEX IF NOT EXISTS backup_log_at ON backup_log(at);
