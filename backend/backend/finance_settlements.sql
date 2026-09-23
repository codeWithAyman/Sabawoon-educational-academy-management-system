-- ============================================================
-- SABAWOON FINANCE SETTLEMENTS
-- Persistent teacher salary/share and staff settlement records
-- ============================================================

BEGIN;

-- ============================================================
-- TEACHER SETTLEMENTS
-- One settlement per teacher per Solar month.
-- ============================================================

CREATE TABLE IF NOT EXISTS finance_teacher_settlements (
  id SERIAL PRIMARY KEY,

  teacher_id INTEGER NOT NULL
    REFERENCES teachers(id) ON DELETE RESTRICT,

  solar_year INTEGER NOT NULL,
  solar_month INTEGER NOT NULL,

  expected_amount NUMERIC(12,2) NOT NULL,

  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid')),

  paid_at TIMESTAMPTZ,

  paid_by_user_id INTEGER
    REFERENCES users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT finance_teacher_settlement_month_check
    CHECK (solar_month >= 1 AND solar_month <= 12),

  CONSTRAINT finance_teacher_settlement_amount_check
    CHECK (expected_amount >= 0),

  CONSTRAINT finance_teacher_settlement_paid_check
    CHECK (
      (status = 'pending' AND paid_at IS NULL)
      OR
      (status = 'paid' AND paid_at IS NOT NULL)
    ),

  CONSTRAINT finance_teacher_settlement_unique
    UNIQUE (teacher_id, solar_year, solar_month)
);

CREATE INDEX IF NOT EXISTS idx_finance_teacher_settlements_teacher
  ON finance_teacher_settlements(teacher_id);

CREATE INDEX IF NOT EXISTS idx_finance_teacher_settlements_period
  ON finance_teacher_settlements(solar_year, solar_month);

CREATE INDEX IF NOT EXISTS idx_finance_teacher_settlements_status
  ON finance_teacher_settlements(status);


-- ============================================================
-- STAFF SETTLEMENTS
-- One settlement per staff member per Solar month.
-- ============================================================

CREATE TABLE IF NOT EXISTS finance_staff_settlements (
  id SERIAL PRIMARY KEY,

  staff_user_id INTEGER NOT NULL
    REFERENCES users(id) ON DELETE RESTRICT,

  solar_year INTEGER NOT NULL,
  solar_month INTEGER NOT NULL,

  expected_amount NUMERIC(12,2) NOT NULL,

  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'received')),

  received_at TIMESTAMPTZ,

  received_by_user_id INTEGER
    REFERENCES users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT finance_staff_settlement_month_check
    CHECK (solar_month >= 1 AND solar_month <= 12),

  CONSTRAINT finance_staff_settlement_amount_check
    CHECK (expected_amount >= 0),

  CONSTRAINT finance_staff_settlement_received_check
    CHECK (
      (status = 'pending' AND received_at IS NULL)
      OR
      (status = 'received' AND received_at IS NOT NULL)
    ),

  CONSTRAINT finance_staff_settlement_unique
    UNIQUE (staff_user_id, solar_year, solar_month)
);

CREATE INDEX IF NOT EXISTS idx_finance_staff_settlements_staff
  ON finance_staff_settlements(staff_user_id);

CREATE INDEX IF NOT EXISTS idx_finance_staff_settlements_period
  ON finance_staff_settlements(solar_year, solar_month);

CREATE INDEX IF NOT EXISTS idx_finance_staff_settlements_status
  ON finance_staff_settlements(status);


COMMIT;