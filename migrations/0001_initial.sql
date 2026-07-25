CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  generated_at TEXT NOT NULL,
  window TEXT NOT NULL,
  provider TEXT NOT NULL,
  elapsed_ms INTEGER NOT NULL DEFAULT 0,
  event_count INTEGER NOT NULL DEFAULT 0,
  company_count INTEGER NOT NULL DEFAULT 0,
  multi_signal_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL,
  provider TEXT,
  published_at TEXT NOT NULL,
  signal TEXT NOT NULL,
  signal_label TEXT NOT NULL,
  country TEXT NOT NULL,
  company TEXT,
  company_confidence REAL NOT NULL DEFAULT 0,
  score INTEGER NOT NULL,
  confidence TEXT NOT NULL,
  reasons_json TEXT NOT NULL,
  suggested_action TEXT,
  source_language TEXT,
  source_country TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  company TEXT NOT NULL,
  normalized_company TEXT NOT NULL UNIQUE,
  score INTEGER NOT NULL,
  confidence TEXT NOT NULL,
  signal_count INTEGER NOT NULL,
  event_count INTEGER NOT NULL,
  source_count INTEGER NOT NULL,
  signals_json TEXT NOT NULL,
  countries_json TEXT NOT NULL,
  reasons_json TEXT NOT NULL,
  suggested_action TEXT,
  latest_at TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS company_events (
  company_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  linked_at TEXT NOT NULL,
  PRIMARY KEY (company_id, event_id)
);

CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT NOT NULL CHECK(target_type IN ('company','event')),
  target_id TEXT NOT NULL,
  rating TEXT NOT NULL CHECK(rating IN ('useful','review','dismiss')),
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_published_at ON events(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_score ON events(score DESC);
CREATE INDEX IF NOT EXISTS idx_events_company ON events(company);
CREATE INDEX IF NOT EXISTS idx_companies_score ON companies(score DESC);
CREATE INDEX IF NOT EXISTS idx_companies_latest_at ON companies(latest_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_target ON feedback(target_type, target_id);
