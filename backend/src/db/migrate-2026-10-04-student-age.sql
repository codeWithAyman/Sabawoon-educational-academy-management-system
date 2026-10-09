-- ============================================================
-- SABAWOON — STUDENT AGE INSTEAD OF DATE OF BIRTH
--
-- Safe, additive-then-removing migration.
--
-- WHY
--
--   The Students page now captures the student's age at
--   enrolment instead of their date of birth, because a full
--   date of birth is more personal data than the school needs.
--
--   `students.dob` is replaced by `students.age`, holding a
--   whole number of years.
--
-- SAFETY
--
--   * Existing ages are backfilled from the current `dob` value
--     so no information is silently lost.
--   * `dob` is only dropped after the backfill.
--   * No row is deleted.
--   * Safe to run repeatedly.
-- ============================================================

-- 1. Add the age column when it is missing.

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS age INTEGER;

-- 2. Backfill ages from the existing date of birth, if present.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'students'
      AND column_name = 'dob'
  ) THEN
    EXECUTE $backfill$
      UPDATE students
      SET age = GREATEST(
        0,
        (EXTRACT(YEAR FROM age(CURRENT_DATE, dob))::INTEGER)
      )
      WHERE dob IS NOT NULL
        AND age IS NULL
    $backfill$;
  END IF;
END
$$;

-- 3. Drop the old date of birth column when it still exists.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'students'
      AND column_name = 'dob'
  ) THEN
    EXECUTE 'ALTER TABLE students DROP COLUMN dob';
  END IF;
END
$$;