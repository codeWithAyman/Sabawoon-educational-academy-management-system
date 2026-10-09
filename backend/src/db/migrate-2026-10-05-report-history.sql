-- ============================================================
-- SABAWOON — PERMANENT REPORT HISTORY
--
-- Safe, additive migration.
--
-- WHY
--
--   Reports (assamsessments) are academic records. Deleting or
--   archiving a class must never delete a report, otherwise years
--   of results disappear with the class.
--
--   Two changes make reports permanent:
--
--     1. `exams.class_slot_id` becomes NULLABLE and uses
--        ON DELETE SET NULL instead of ON DELETE CASCADE, so
--        removing a class only detaches the report.
--
--     2. The report keeps its own copy of the class details in
--        `*_snapshot` columns. When the class is gone the report
--        still knows its subject, teacher, time, level, books,
--        class type and deadline.
--
-- SAFETY
--
--   * No report row is deleted.
--   * Existing reports keep their marks and scores.
--   * Snapshots are backfilled from the current class, so old
--     reports become self-describing too.
--   * Safe to run repeatedly.
-- ============================================================

-- 1. Detach reports from their class instead of deleting them.

ALTER TABLE exams
  ALTER COLUMN class_slot_id DROP NOT NULL;

DO $$
DECLARE
  cascade_constraint TEXT;
BEGIN
  -- Find any foreign key that would delete reports with the class.
  SELECT c.conname
  INTO cascade_constraint
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = current_schema()
    AND t.relname = 'exams'
    AND c.contype = 'f'
    AND c.confrelid = 'class_slots'::regclass
    AND c.confdeltype = 'c'; -- cascade

  IF cascade_constraint IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE exams DROP CONSTRAINT %I',
      cascade_constraint
    );
  END IF;
END
$$;

-- Only add the archiving constraint when it is missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = current_schema()
      AND t.relname = 'exams'
      AND c.contype = 'f'
      AND c.confrelid = 'class_slots'::regclass
      AND c.confdeltype = 'n' -- set null
  ) THEN
    ALTER TABLE exams
      ADD CONSTRAINT exams_class_slot_id_history_fkey
      FOREIGN KEY (class_slot_id)
      REFERENCES class_slots(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

-- 2. The snapshot columns that make a report self-describing.

ALTER TABLE exams ADD COLUMN IF NOT EXISTS subject_id_snapshot INTEGER;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS subject_name_snapshot TEXT;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS subject_code_snapshot TEXT;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS teacher_id_snapshot INTEGER;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS teacher_name_snapshot TEXT;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS start_time_snapshot TIME;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS end_time_snapshot TIME;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS level_snapshot TEXT;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS books_snapshot JSONB;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS class_slot_id_snapshot INTEGER;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS class_type_snapshot VARCHAR(50);
ALTER TABLE exams ADD COLUMN IF NOT EXISTS deadline_snapshot DATE;

-- 3. Backfill snapshots for reports created before this migration.

UPDATE exams e
SET
  class_slot_id_snapshot = COALESCE(e.class_slot_id_snapshot, e.class_slot_id),

  subject_id_snapshot = COALESCE(e.subject_id_snapshot, cs.subject_id),
  subject_name_snapshot = COALESCE(e.subject_name_snapshot, s.name),
  subject_code_snapshot = COALESCE(e.subject_code_snapshot, s.code),

  teacher_id_snapshot = COALESCE(e.teacher_id_snapshot, cs.teacher_id),
  teacher_name_snapshot = COALESCE(e.teacher_name_snapshot, t.full_name),

  start_time_snapshot = COALESCE(e.start_time_snapshot, cs.start_time),
  end_time_snapshot = COALESCE(e.end_time_snapshot, cs.end_time),

  level_snapshot = COALESCE(e.level_snapshot, cs.level),

  class_type_snapshot = COALESCE(
    e.class_type_snapshot,
    ct.name
  ),

  deadline_snapshot = COALESCE(e.deadline_snapshot, cs.deadline),

  books_snapshot = COALESCE(
    e.books_snapshot,
    (
      SELECT json_agg(
        json_build_object('id', sb.id, 'name', sb.name)
        ORDER BY sb.name
      )
      FROM class_slot_books csb
      JOIN subject_books sb ON sb.id = csb.book_id
      WHERE csb.class_slot_id = cs.id
    )
  )

FROM class_slots cs
LEFT JOIN subjects s ON s.id = cs.subject_id
LEFT JOIN teachers t ON t.id = cs.teacher_id
LEFT JOIN class_types ct ON ct.id = cs.class_type_id
WHERE cs.id = e.class_slot_id;

-- 4. The history view lists reports newest first.

CREATE INDEX IF NOT EXISTS idx_exams_exam_date
  ON exams(exam_date DESC);