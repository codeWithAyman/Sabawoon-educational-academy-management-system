-- Finance settlements schema (idempotent)
-- Creates tables used by the finance routes if they don't already exist.

CREATE TABLE IF NOT EXISTS finance_share_rates (
  id SERIAL PRIMARY KEY,
  percentage NUMERIC(5,2) NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fee_payments (
  id SERIAL PRIMARY KEY,
  receipt_number VARCHAR(50) UNIQUE NOT NULL,
  payment_date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  collected_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fee_periods (
  id SERIAL PRIMARY KEY,
  enrollment_id INTEGER NOT NULL REFERENCES student_enrollments(id) ON DELETE CASCADE,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  monthly_amount NUMERIC(10,2),
  academic_year VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(enrollment_id, from_date, to_date)
);

CREATE TABLE IF NOT EXISTS fee_period_months (
  id SERIAL PRIMARY KEY,
  fee_period_id INTEGER NOT NULL REFERENCES fee_periods(id) ON DELETE CASCADE,
  solar_year INTEGER NOT NULL,
  solar_month INTEGER NOT NULL CHECK (solar_month >= 1 AND solar_month <= 12),
  month_days INTEGER NOT NULL DEFAULT 30,
  covered_days INTEGER NOT NULL DEFAULT 0,
  calculated_amount NUMERIC(10,2),
  monthly_amount NUMERIC(10,2),
  UNIQUE(fee_period_id, solar_year, solar_month)
);

CREATE TABLE IF NOT EXISTS fee_payment_allocations (
  id SERIAL PRIMARY KEY,
  fee_payment_id INTEGER NOT NULL REFERENCES fee_payments(id) ON DELETE CASCADE,
  fee_period_month_id INTEGER NOT NULL REFERENCES fee_period_months(id) ON DELETE CASCADE,
  allocated_amount NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(fee_payment_id, fee_period_month_id)
);

CREATE TABLE IF NOT EXISTS fee_payment_audit (
  id SERIAL PRIMARY KEY,
  fee_payment_id INTEGER NOT NULL REFERENCES fee_payments(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL,
  performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_teacher_settlements (
  id SERIAL PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  solar_year INTEGER NOT NULL,
  solar_month INTEGER NOT NULL CHECK (solar_month >= 1 AND solar_month <= 12),
  expected_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  paid_at TIMESTAMPTZ,
  paid_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(teacher_id, solar_year, solar_month)
);

CREATE TABLE IF NOT EXISTS finance_teacher_settlement_payments (
  id SERIAL PRIMARY KEY,
  teacher_settlement_id INTEGER NOT NULL REFERENCES finance_teacher_settlements(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  share_calculation_snapshot JSONB,
  paid_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  paid_by_name_snapshot VARCHAR(150),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_staff_settlements (
  id SERIAL PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  solar_year INTEGER NOT NULL,
  solar_month INTEGER NOT NULL CHECK (solar_month >= 1 AND solar_month <= 12),
  expected_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  paid_at TIMESTAMPTZ,
  paid_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(staff_id, solar_year, solar_month)
);

CREATE TABLE IF NOT EXISTS finance_staff_settlement_payments (
  id SERIAL PRIMARY KEY,
  staff_settlement_id INTEGER NOT NULL REFERENCES finance_staff_settlements(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  paid_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  paid_by_name_snapshot VARCHAR(150),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fee_payments_receipt ON fee_payments(receipt_number);
CREATE INDEX IF NOT EXISTS idx_fee_periods_enrollment ON fee_periods(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_fee_period_months_period ON fee_period_months(fee_period_id);
CREATE INDEX IF NOT EXISTS idx_fee_payment_allocations_payment ON fee_payment_allocations(fee_payment_id);
CREATE INDEX IF NOT EXISTS idx_fee_payment_allocations_month ON fee_payment_allocations(fee_period_month_id);
CREATE INDEX IF NOT EXISTS idx_teacher_settlements_teacher ON finance_teacher_settlements(teacher_id);
CREATE INDEX IF NOT EXISTS idx_staff_settlements_staff ON finance_staff_settlements(staff_id);
CREATE INDEX IF NOT EXISTS idx_fee_payment_audit_payment ON fee_payment_audit(fee_payment_id);
