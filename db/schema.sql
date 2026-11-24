CREATE TABLE IF NOT EXISTS usage_counters (
  key text PRIMARY KEY,
  count int NOT NULL CHECK (count >= 0),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS usage_counters_expiry_idx ON usage_counters(expires_at);
UPDATE usage_counters SET expires_at = now() + interval '24 hours'
WHERE key LIKE 'session:%' AND expires_at = 'infinity'::timestamptz;

CREATE TABLE IF NOT EXISTS questions (
  site_id text NOT NULL,
  question text NOT NULL CHECK (char_length(question) <= 500),
  answered boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS questions_created_at_idx ON questions(created_at);
