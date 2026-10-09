-- Incremental, immutable teacher-share payment history.
-- The monthly settlement remains the unique current balance/paid snapshot;
-- this ledger records each actual payout, including supplemental amounts
-- that accrue after an earlier payout for the same month.
CREATE TABLE IF NOT EXISTS finance_teacher_settlement_payments (
  id BIGSERIAL PRIMARY KEY,
  teacher_settlement_id INTEGER NOT NULL
    REFERENCES finance_teacher_settlements(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  share_calculation_snapshot JSONB NOT NULL,
  paid_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  paid_by_name_snapshot VARCHAR(150) NOT NULL,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teacher_settlement_payments_settlement
  ON finance_teacher_settlement_payments(teacher_settlement_id, paid_at DESC);
