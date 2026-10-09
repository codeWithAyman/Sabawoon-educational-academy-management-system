-- ============================================================
-- SABAWOON — CLASS DEADLINE
--
-- Safe, additive migration.
--
-- WHY
--
--   A class time slot needs an optional deadline, for example the
--   last date a student can hand in work for that subject.
--
--   The deadline is stored as a plain Gregorian DATE, exactly like
--   `students.admission_date`. The interface converts it to Solar
--   Hijri for display and input, so no extra column is needed for
--   the calendar system.
--
-- SAFETY
--
--   * No table is dropped, recreated or truncated.
--   * No existing row is deleted or modified.
--   * The new column is nullable, so all existing classes stay
--     valid and simply have no deadline yet.
--   * Safe to run repeatedly.
-- ============================================================

ALTER TABLE class_slots
  ADD COLUMN IF NOT EXISTS deadline DATE;

CREATE INDEX IF NOT EXISTS idx_class_slots_deadline
  ON class_slots(deadline);