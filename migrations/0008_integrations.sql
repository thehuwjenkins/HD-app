-- Connections to outside services (Google Drive). Never part of the workspace state sent to browsers;
-- tokens are stored encrypted.
CREATE TABLE IF NOT EXISTS integrations (name TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
