CREATE TABLE IF NOT EXISTS roles (
  name VARCHAR(80) PRIMARY KEY,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
  name VARCHAR(100) PRIMARY KEY,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_name VARCHAR(80) NOT NULL
    REFERENCES roles (name) ON DELETE CASCADE,
  permission_name VARCHAR(100) NOT NULL
    REFERENCES permissions (name) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_name, permission_name)
);

INSERT INTO roles (name, description) VALUES
  ('Admin', 'Full system access'),
  ('Treasurer', 'Financial operations and audit access'),
  ('Credit Supervisor', 'Loan review and approval'),
  ('Credit Officer', 'Member and loan-request operations'),
  ('Accountant', 'Financial records and reporting'),
  ('Member', 'Member self-service access'),
  ('Staff', 'General staff access')
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (name, description) VALUES
  ('users.read', 'View users'),
  ('users.manage', 'Create, update, and remove users'),
  ('members.read', 'View member records'),
  ('members.manage', 'Create, update, and remove member records'),
  ('savings.read', 'View savings transactions'),
  ('savings.record', 'Record savings transactions'),
  ('loans.read', 'View loan requests and loans'),
  ('loans.request', 'Create loan requests'),
  ('loans.review', 'Review and decide loan requests'),
  ('loans.disburse', 'Disburse approved loans'),
  ('loans.repay', 'Record loan repayments'),
  ('reports.weekly', 'View weekly reports'),
  ('reports.monthly', 'View monthly reports'),
  ('audit.read', 'View audit log entries')
ON CONFLICT (name) DO NOTHING;

-- Administrators receive every permission.
INSERT INTO role_permissions (role_name, permission_name)
SELECT 'Admin', name FROM permissions
ON CONFLICT DO NOTHING;

-- Financial operations and audit access.
INSERT INTO role_permissions (role_name, permission_name) VALUES
  ('Treasurer', 'members.read'),
  ('Treasurer', 'savings.read'),
  ('Treasurer', 'savings.record'),
  ('Treasurer', 'loans.read'),
  ('Treasurer', 'loans.disburse'),
  ('Treasurer', 'loans.repay'),
  ('Treasurer', 'reports.weekly'),
  ('Treasurer', 'reports.monthly'),
  ('Treasurer', 'audit.read'),
  ('Accountant', 'members.read'),
  ('Accountant', 'savings.read'),
  ('Accountant', 'loans.read'),
  ('Accountant', 'loans.repay'),
  ('Accountant', 'reports.weekly'),
  ('Accountant', 'reports.monthly')
ON CONFLICT DO NOTHING;

-- Loan review and origination.
INSERT INTO role_permissions (role_name, permission_name) VALUES
  ('Credit Supervisor', 'members.read'),
  ('Credit Supervisor', 'loans.read'),
  ('Credit Supervisor', 'loans.review'),
  ('Credit Officer', 'members.read'),
  ('Credit Officer', 'members.manage'),
  ('Credit Officer', 'loans.read'),
  ('Credit Officer', 'loans.request'),
  ('Staff', 'members.read'),
  ('Staff', 'loans.read'),
  ('Member', 'loans.request')
ON CONFLICT DO NOTHING;