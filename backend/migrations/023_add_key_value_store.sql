-- Key-value store for job state (e.g. BigQuery last export timestamp)
CREATE TABLE IF NOT EXISTS key_value_store (
  key VARCHAR(255) PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);
