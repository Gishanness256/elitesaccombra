CREATE TABLE IF NOT EXISTS loan_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref VARCHAR(128) NOT NULL UNIQUE,
  account_id VARCHAR(64)
    REFERENCES members (acc) ON DELETE RESTRICT,
  applicant_type VARCHAR(20) NOT NULL
    CHECK (applicant_type IN ('member', 'non-member')),
  applicant_name VARCHAR(200) NOT NULL,
  telephone VARCHAR(40) NOT NULL,
  email VARCHAR(254),
  address TEXT,
  nin VARCHAR(100),
  category VARCHAR(100) NOT NULL,
  term_months INTEGER NOT NULL CHECK (term_months BETWEEN 1 AND 60),
  amount NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
  monthly_rate NUMERIC(7, 4) NOT NULL
    CHECK (monthly_rate > 0 AND monthly_rate <= 30),
  request_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'Approved', 'Rejected', 'On Hold')),
  remark TEXT,
  requested_by UUID NOT NULL
    REFERENCES users (id) ON DELETE RESTRICT,
  decided_by UUID
    REFERENCES users (id) ON DELETE RESTRICT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (applicant_type = 'member' AND account_id IS NOT NULL)
    OR (applicant_type = 'non-member' AND account_id IS NULL)
  ),
  CHECK (
    (status = 'Pending' AND decided_at IS NULL)
    OR (status <> 'Pending' AND decided_at IS NOT NULL AND decided_by IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_loan_requests_status_created
  ON loan_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_loan_requests_account_created
  ON loan_requests (account_id, created_at DESC);


CREATE TABLE IF NOT EXISTS loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref VARCHAR(128) NOT NULL UNIQUE,
  request_id UUID NOT NULL UNIQUE
    REFERENCES loan_requests (id) ON DELETE RESTRICT,
  account_id VARCHAR(64)
    REFERENCES members (acc) ON DELETE RESTRICT,
  borrower_name VARCHAR(200) NOT NULL,
  telephone VARCHAR(40) NOT NULL,
  category VARCHAR(100) NOT NULL,
  term_months INTEGER NOT NULL CHECK (term_months BETWEEN 1 AND 60),
  principal NUMERIC(18, 2) NOT NULL CHECK (principal > 0),
  monthly_rate NUMERIC(7, 4) NOT NULL
    CHECK (monthly_rate > 0 AND monthly_rate <= 30),
  total_due NUMERIC(18, 2) NOT NULL CHECK (total_due >= principal),
  outstanding_balance NUMERIC(18, 2) NOT NULL
    CHECK (outstanding_balance >= 0),
  outstanding_interest NUMERIC(18, 2) NOT NULL DEFAULT 0
    CHECK (outstanding_interest >= 0),
  disbursed_at DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Active'
    CHECK (status IN ('Active', 'Paid', 'Closed', 'Defaulted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (outstanding_balance <= total_due),
  CHECK (
    (status = 'Paid' AND outstanding_balance = 0)
    OR status <> 'Paid'
  )
);

CREATE INDEX IF NOT EXISTS idx_loans_account_created
  ON loans (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_loans_status_created
  ON loans (status, created_at DESC);


CREATE TABLE IF NOT EXISTS loan_repayments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL
    REFERENCES loans (id) ON DELETE RESTRICT,
  payment_date DATE NOT NULL,
  amount NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
  principal_paid NUMERIC(18, 2) NOT NULL DEFAULT 0
    CHECK (principal_paid >= 0),
  interest_paid NUMERIC(18, 2) NOT NULL DEFAULT 0
    CHECK (interest_paid >= 0),
  balance_after NUMERIC(18, 2) NOT NULL CHECK (balance_after >= 0),
  type VARCHAR(100) NOT NULL,
  recorded_by UUID NOT NULL
    REFERENCES users (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (amount = principal_paid + interest_paid)
);

CREATE INDEX IF NOT EXISTS idx_loan_repayments_loan_date
  ON loan_repayments (loan_id, payment_date DESC, created_at DESC);