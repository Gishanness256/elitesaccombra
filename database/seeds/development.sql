BEGIN;

DO $$
BEGIN
  IF current_setting('app.environment', true) IS DISTINCT FROM 'development' THEN
    RAISE EXCEPTION
      'Refusing to load development seed data: set app.environment=development for this session.';
  END IF;
END
$$;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Demo accounts use a development-only password. Change it before sharing
-- this environment. pgcrypto's bcrypt hashes are compatible with bcrypt.
INSERT INTO users (id, name, email, role, initials, password_hash, is_active)
VALUES
  (
    '10000000-0000-4000-8000-000000000001',
    'Development Administrator',
    'admin@example.test',
    'Admin',
    'DA',
    crypt('dev-only-change-me', gen_salt('bf', 12)),
    TRUE
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'Development Treasurer',
    'treasurer@example.test',
    'Treasurer',
    'DT',
    crypt('dev-only-change-me', gen_salt('bf', 12)),
    TRUE
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    'Development Credit Officer',
    'credit@example.test',
    'Credit Officer',
    'DCO',
    crypt('dev-only-change-me', gen_salt('bf', 12)),
    TRUE
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  initials = EXCLUDED.initials,
  password_hash = EXCLUDED.password_hash,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

INSERT INTO members (id, acc, first, last, dob, addr, nin, tel, email)
VALUES
  (
    '20000000-0000-4000-8000-000000000001',
    'M000101',
    'Alex',
    'Example',
    DATE '1990-04-12',
    '101 Example Street',
    'DEV-NIN-0001',
    '+10000000001',
    'alex@example.test'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'M000102',
    'Sam',
    'Sample',
    DATE '1985-09-23',
    '202 Sample Avenue',
    'DEV-NIN-0002',
    '+10000000002',
    'sam@example.test'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO savings_transactions (id, ref, acc, amt, date, w, ch, slip, rm, ini)
VALUES
  (
    '30000000-0000-4000-8000-000000000001',
    'DEV-SAV-0001',
    'M000101',
    125.00,
    CURRENT_DATE - 14,
    FALSE,
    'Development seed',
    'DEV-SLIP-0001',
    'Demo opening deposit',
    'DA'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    'DEV-SAV-0002',
    'M000102',
    80.00,
    CURRENT_DATE - 7,
    FALSE,
    'Development seed',
    'DEV-SLIP-0002',
    'Demo opening deposit',
    'DA'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO loan_requests (
  id,
  ref,
  account_id,
  applicant_type,
  applicant_name,
  telephone,
  email,
  address,
  nin,
  category,
  term_months,
  amount,
  monthly_rate,
  request_date,
  status,
  requested_by
)
VALUES (
  '40000000-0000-4000-8000-000000000001',
  'DEV-REQ-0001',
  'M000101',
  'member',
  'Alex Example',
  '+10000000001',
  'alex@example.test',
  '101 Example Street',
  'DEV-NIN-0001',
  'Development loan',
  12,
  500.00,
  1.00,
  CURRENT_DATE - 2,
  'Pending',
  '10000000-0000-4000-8000-000000000003'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO regulatory_inputs (
  id,
  regulator,
  input_key,
  input_value,
  unit,
  effective_from,
  source_reference,
  notes,
  entered_by
)
VALUES (
  '50000000-0000-4000-8000-000000000001',
  'Development Example',
  'demo_interest_rate',
  1.000000,
  'percent_per_month',
  CURRENT_DATE - 30,
  'DEVELOPMENT-SEED',
  'Fictional development-only value; not regulatory guidance.',
  '10000000-0000-4000-8000-000000000001'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO audit_logs (
  id,
  actor_id,
  actor_name,
  actor_role,
  action,
  entity_type,
  entity_id,
  details
)
VALUES (
  '60000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Development Administrator',
  'Admin',
  'development.seed',
  'database',
  'development',
  '{"source":"database/seeds/development.sql"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

COMMIT;