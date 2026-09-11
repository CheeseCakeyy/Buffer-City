CREATE TABLE IF NOT EXISTS visitors (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    visitor_key TEXT NOT NULL,
    hidden INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_visitors_id ON visitors(id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_visitors_visitor_key ON visitors(visitor_key);
CREATE TABLE IF NOT EXISTS submission_limits (
    key TEXT PRIMARY KEY NOT NULL,
    attempts INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_submission_limits_expires_at ON submission_limits(expires_at);

