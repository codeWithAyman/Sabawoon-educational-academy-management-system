-- ============================================================
-- SABAWOON — FINANCE STAFF COLLECTOR IDENTITY
--
-- Safe, additive migration.
--
-- WHY
--
--   Finance staff settlements were keyed to `staff_user_id`, which
--   references `users(id)`. That made administrator accounts appear as
--   Finance staff collectors.
--
--   Real collectors already live in the `staff` table, and real
--   payments already reference them through
--   `fee_payments.collected_by_staff_id`.
--
--   This migration adds a staff-table reference to staff settlements
--   so Finance is driven by actual Staff records instead of
--   authentication users.
--
-- SAFETY
--
--   * No table is dropped, recreated or truncated.
--   * No existing row is deleted or modified.
--   * `staff_user_id` is left exactly as it is, including its foreign
--     key and unique constraint, so legacy settlement history stays
--     intact and resolvable.
--   * The new column is nullable, so all existing rows remain valid.
--   * Safe to run repeatedly.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. STAFF REFERENCE ON SETTLEMENTS
-- ============================================================

ALTER TABLE finance_staff_settlements
ADD COLUMN IF NOT EXISTS collector_staff_id INTEGER;

-- ============================================================
-- 1b. REAL STAFF ARE NOT AUTHENTICATION USERS
--
-- `staff_user_id` was NOT NULL, which forced every staff settlement to
-- point at a row in `users`. Real Staff live in the `staff` table and
-- have no `users` row, so the column has to allow NULL.
--
-- Only the NOT NULL constraint is relaxed. Existing rows keep their
-- staff_user_id values and the foreign key stays in place.
-- ============================================================

ALTER TABLE finance_staff_settlements
ALTER COLUMN staff_user_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'finance_staff_settlements_collector_staff_id_fkey'
  ) THEN
    ALTER TABLE finance_staff_settlements
    ADD CONSTRAINT finance_staff_settlements_collector_staff_id_fkey
    FOREIGN KEY (collector_staff_id)
    REFERENCES staff(id)
    ON DELETE RESTRICT;
  END IF;
END $$;

COMMENT ON COLUMN finance_staff_settlements.collector_staff_id IS
  'Staff table reference for the collector. Legacy rows keyed by staff_user_id (users.id) keep a NULL value here and are preserved unchanged.';

-- ============================================================
-- 2. ONE SETTLEMENT PER STAFF PER SOLAR MONTH
--
-- Partial unique index: one settlement per staff per month, without
-- touching the existing (staff_user_id, solar_year, solar_month)
-- constraint or the rows it governs.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS finance_staff_settlements_collector_month_unique
ON finance_staff_settlements (collector_staff_id, solar_year, solar_month)
WHERE collector_staff_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_finance_staff_settlements_collector
ON finance_staff_settlements (collector_staff_id);

-- ============================================================
-- 3. SETTLEMENT KEY FOR INDIVIDUAL PAYMENTS
--
-- `finance_staff_payment_settlements` settles individual payments
-- rather than monthly staff totals.
--
-- A unique constraint on fee_payment_id already exists
-- (finance_staff_payment_settlements_fee_payment_id_key) and is
-- what prevents the same transaction being settled twice, so it is
-- deliberately NOT duplicated here. Only the collector lookup index
-- is added.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_finance_staff_payment_settlements_collector
ON finance_staff_payment_settlements (collector_staff_id);

-- ============================================================
-- 4. PAYMENT INDEX FOR COLLECTOR LOOKUPS
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_fee_payments_collected_by_staff
ON fee_payments (collected_by_staff_id);

-- ============================================================
-- 5. SAFETY CHECK
-- ============================================================

DO $$
BEGIN

  IF EXISTS (
    SELECT 1
    FROM finance_staff_settlements fss
    LEFT JOIN staff s
      ON s.id = fss.collector_staff_id
    WHERE fss.collector_staff_id IS NOT NULL
      AND s.id IS NULL
  ) THEN
    RAISE EXCEPTION
      'finance_staff_settlements contains a collector_staff_id with no matching staff record.';
  END IF;

END $$;


COMMIT;
