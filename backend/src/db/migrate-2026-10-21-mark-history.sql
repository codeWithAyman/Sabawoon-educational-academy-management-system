ALTER TABLE marks ADD COLUMN IF NOT EXISTS student_id_snapshot INTEGER;
ALTER TABLE marks ADD COLUMN IF NOT EXISTS student_name_snapshot TEXT;
ALTER TABLE marks ADD COLUMN IF NOT EXISTS student_roll_number_snapshot TEXT;

UPDATE marks m
SET student_id_snapshot = COALESCE(m.student_id_snapshot, m.student_id),
    student_name_snapshot = COALESCE(m.student_name_snapshot, s.full_name),
    student_roll_number_snapshot = COALESCE(m.student_roll_number_snapshot, s.roll_number)
FROM students s WHERE s.id = m.student_id;

DO $$ DECLARE fk_name TEXT; BEGIN
  SELECT c.conname INTO fk_name FROM pg_constraint c
  WHERE c.conrelid = 'marks'::regclass AND c.contype = 'f'
    AND c.confrelid = 'students'::regclass;
  IF fk_name IS NOT NULL THEN EXECUTE format('ALTER TABLE marks DROP CONSTRAINT %I', fk_name); END IF;
END $$;

ALTER TABLE marks ALTER COLUMN student_id DROP NOT NULL;
ALTER TABLE marks ADD CONSTRAINT marks_student_id_history_fkey
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_marks_student_snapshot ON marks(student_id_snapshot);
