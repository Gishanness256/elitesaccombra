CREATE TABLE IF NOT EXISTS savings_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref VARCHAR(128) NOT NULL UNIQUE,
  acc VARCHAR(64) NOT NULL
    REFERENCES members (acc) ON DELETE RESTRICT,
  amt NUMERIC(18, 2) NOT NULL CHECK (amt > 0),
  date DATE NOT NULL,
  w BOOLEAN NOT NULL DEFAULT FALSE,
  ch VARCHAR(100),
  slip VARCHAR(128),
  rm TEXT,
  ini VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_savings_transactions_acc_date
  ON savings_transactions (acc, date DESC);

CREATE INDEX IF NOT EXISTS idx_savings_transactions_created_at
  ON savings_transactions (created_at DESC);