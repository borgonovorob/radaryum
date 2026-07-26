CREATE TABLE IF NOT EXISTS snapshots (
  snapshot_id TEXT PRIMARY KEY,
  window TEXT NOT NULL,
  created_at TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',
  partial INTEGER NOT NULL DEFAULT 0,
  event_count INTEGER NOT NULL DEFAULT 0,
  company_count INTEGER NOT NULL DEFAULT 0,
  collector_summary_json TEXT NOT NULL DEFAULT '{}',
  payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_snapshots_window_created
ON snapshots(window, created_at DESC);

CREATE TABLE IF NOT EXISTS collector_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  window TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  status TEXT NOT NULL,
  items_found INTEGER NOT NULL DEFAULT 0,
  partial INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_collector_runs_provider_finished
ON collector_runs(provider, finished_at DESC);

CREATE TABLE IF NOT EXISTS source_health (
  provider TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  last_checked_at TEXT NOT NULL,
  last_success_at TEXT,
  last_error_at TEXT,
  last_error_message TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_item_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS company_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company TEXT NOT NULL,
  normalized_company TEXT NOT NULL,
  newsroom_url TEXT,
  rss_url TEXT,
  investor_relations_url TEXT,
  sec_cik TEXT,
  sector TEXT,
  country TEXT,
  priority INTEGER NOT NULL DEFAULT 50,
  active INTEGER NOT NULL DEFAULT 1,
  last_checked_at TEXT,
  last_success_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(normalized_company)
);

CREATE INDEX IF NOT EXISTS idx_company_sources_active_priority
ON company_sources(active, priority DESC);
