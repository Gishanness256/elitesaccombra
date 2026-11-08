CREATE SEQUENCE IF NOT EXISTS member_account_number_seq
  START WITH 100000
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

CREATE TABLE IF NOT EXISTS members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acc VARCHAR(64) NOT NULL UNIQUE,
  first VARCHAR(100) NOT NULL,
  last VARCHAR(100) NOT NULL,
  dob DATE NOT NULL,
  addr TEXT NOT NULL,
  nin VARCHAR(100) NOT NULL UNIQUE,
  tel VARCHAR(40) NOT NULL,
  email VARCHAR(254),
  photo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_members_last_first ON members (last, first);
CREATE INDEX IF NOT EXISTS idx_members_acc ON members (acc);
CREATE INDEX IF NOT EXISTS idx_members_nin ON members (nin);
CREATE INDEX IF NOT EXISTS idx_members_email ON members (email);