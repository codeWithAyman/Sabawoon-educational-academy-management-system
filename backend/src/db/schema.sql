-- ============================================================
-- SABAWOON EDUCATIONAL ACADEMY MANAGEMENT SYSTEM
-- Clean database schema
--
-- Academic model:
--
-- Student
--    ↓
-- Subject
--    ↓
-- Class Slot / Time
--    ↓
-- Teacher
--
-- Example:
-- English → 2:00-3:00 → Ahmad
-- Quran   → 3:00-4:00 → Mohammad
-- Computer → 4:00-5:00 → Ali
-- ============================================================


-- ============================================================
-- USERS
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,

  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,

  role VARCHAR(20) NOT NULL
    CHECK (role IN ('admin', 'teacher', 'staff')),

  full_name VARCHAR(150) NOT NULL,
  phone VARCHAR(30),

  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- TEACHERS
-- ============================================================

CREATE TABLE IF NOT EXISTS teachers (
  id SERIAL PRIMARY KEY,

  user_id INTEGER UNIQUE NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,

  employee_id VARCHAR(50) UNIQUE NOT NULL,

  qualification VARCHAR(150),
  specialization VARCHAR(150),

  joining_date DATE DEFAULT CURRENT_DATE,

  salary NUMERIC(12,2)
);


-- ============================================================
-- STUDENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS students (
  id SERIAL PRIMARY KEY,

  roll_number VARCHAR(50) UNIQUE NOT NULL,

  age INTEGER,
  gender VARCHAR(10),
  blood_group VARCHAR(10),

  address TEXT,

  guardian_name VARCHAR(150),
  guardian_phone VARCHAR(30),
  guardian_email VARCHAR(150),

  admission_date DATE DEFAULT CURRENT_DATE
);


-- ============================================================
-- STUDENTS — AGE REPLACES DATE OF BIRTH
--
-- CREATE TABLE IF NOT EXISTS is a no-op on databases that already
-- have a `students` table, so the age column is also added here for
-- existing installs. Ages are backfilled from the old `dob` values
-- before that column is dropped.
-- ============================================================

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS age INTEGER;

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

    EXECUTE 'ALTER TABLE students DROP COLUMN dob';
  END IF;
END
$$;


-- ============================================================
-- SUBJECTS
--
-- Examples:
-- English
-- Quran
-- Computer
-- Mathematics
-- ============================================================

CREATE TABLE IF NOT EXISTS subjects (
  id SERIAL PRIMARY KEY,

  name VARCHAR(100) NOT NULL,
  code VARCHAR(30),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(name)
);


-- ============================================================
-- CLASS SLOTS
--
-- A class slot means:
--
-- Subject + Teacher + Time + Days
--
-- Example:
--
-- English
-- 2:00 - 3:00
-- Ahmad
-- Saturday, Monday, Wednesday
-- ============================================================

CREATE TABLE IF NOT EXISTS class_slots (
  id SERIAL PRIMARY KEY,

  subject_id INTEGER NOT NULL
    REFERENCES subjects(id) ON DELETE CASCADE,

  teacher_id INTEGER NOT NULL
    REFERENCES users(id) ON DELETE RESTRICT,

  start_time TIME NOT NULL,
  end_time TIME NOT NULL,

  days VARCHAR(100) NOT NULL,

  room VARCHAR(50),

  academic_year VARCHAR(20),

  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CHECK (end_time > start_time)
);


-- ============================================================
-- CLASS SLOTS — DEADLINE
--
-- CREATE TABLE IF NOT EXISTS is a no-op on databases that already
-- have a `class_slots` table, so the deadline column is also added
-- here for existing installs.
--
-- The deadline is stored as a plain Gregorian DATE, exactly like
-- admission dates. The interface converts it to Solar Hijri.
-- ============================================================

ALTER TABLE class_slots
  ADD COLUMN IF NOT EXISTS deadline DATE;


-- ============================================================
-- CLASS TYPES
--
-- A class time slot belongs to a type such as Male, Female, Kids
-- or Mixed.
--
-- The list lives in the database so the interface always reads
-- the available types from the API instead of hardcoding them.
-- The INSERT is idempotent, so it is safe on every migration run
-- and never overwrites an administrator's changes.
-- ============================================================

CREATE TABLE IF NOT EXISTS class_types (
  id SERIAL PRIMARY KEY,

  name VARCHAR(50) NOT NULL UNIQUE,

  sort_order INTEGER NOT NULL DEFAULT 0,

  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);


INSERT INTO class_types (name, sort_order)
VALUES
  ('Male', 1),
  ('Female', 2),
  ('Kids', 3),
  ('Mixed', 4)
ON CONFLICT (name) DO NOTHING;


-- ============================================================
-- CLASS SLOTS — CLASS TYPE
--
-- Nullable on purpose: classes created before this feature keep
-- working without a type, and deleting a type only clears the
-- reference instead of removing classes.
-- ============================================================

ALTER TABLE class_slots
  ADD COLUMN IF NOT EXISTS class_type_id INTEGER
    REFERENCES class_types(id) ON DELETE SET NULL;


CREATE INDEX IF NOT EXISTS idx_class_slots_class_type
  ON class_slots(class_type_id);


-- ============================================================
-- STUDENT ENROLLMENTS
--
-- This is the important relationship.
--
-- A student can study multiple subjects/classes.
--
-- Example:
--
-- Student A
--   → English → 2-3 → Ahmad
--   → Quran → 3-4 → Mohammad
--   → Computer → 4-5 → Ali
-- ============================================================

CREATE TABLE IF NOT EXISTS student_enrollments (
  id SERIAL PRIMARY KEY,

  student_id INTEGER NOT NULL
    REFERENCES students(id) ON DELETE CASCADE,

  class_slot_id INTEGER NOT NULL
    REFERENCES class_slots(id) ON DELETE CASCADE,

  enrolled_on DATE DEFAULT CURRENT_DATE,

  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(student_id, class_slot_id)
);


-- ============================================================
-- ATTENDANCE
--
-- Attendance is now tied to the actual class slot.
--
-- This means we know:
-- student + subject + time + teacher + date
-- ============================================================

CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,

  student_id INTEGER NOT NULL
    REFERENCES students(id) ON DELETE CASCADE,

  class_slot_id INTEGER NOT NULL
    REFERENCES class_slots(id) ON DELETE CASCADE,

  date DATE NOT NULL,

  status VARCHAR(15) NOT NULL
    CHECK (status IN ('present', 'absent', 'late', 'leave')),

  remarks TEXT,

  marked_by INTEGER
    REFERENCES users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(student_id, class_slot_id, date)
);


-- ============================================================
-- ASSESSMENTS / EXAMS
--
-- Reports are based on subject + class slot.
-- ============================================================

CREATE TABLE IF NOT EXISTS exams (
  id SERIAL PRIMARY KEY,

  name VARCHAR(150) NOT NULL,

  -- Reports are academic records, so removing a class only detaches
  -- the report. It must never delete it.
  class_slot_id INTEGER
    REFERENCES class_slots(id) ON DELETE SET NULL,

  exam_date DATE NOT NULL,

  total_marks NUMERIC(8,2) NOT NULL DEFAULT 100,

  academic_year VARCHAR(20),

  created_by INTEGER
    REFERENCES users(id) ON DELETE SET NULL,

  is_published BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Snapshot of the class at the moment the report was created, so
  -- the report stays readable even after the class is gone.
  subject_id_snapshot INTEGER,
  subject_name_snapshot TEXT,
  subject_code_snapshot TEXT,

  teacher_id_snapshot INTEGER,
  teacher_name_snapshot TEXT,

  start_time_snapshot TIME,
  end_time_snapshot TIME,

  level_snapshot TEXT,
  books_snapshot JSONB,

  class_slot_id_snapshot INTEGER,
  class_type_snapshot VARCHAR(50),
  deadline_snapshot DATE
);


-- ============================================================
-- EXAMS — ARCHIVE SAFETY ON EXISTING DATABASES
--
-- CREATE TABLE IF NOT EXISTS is a no-op when the table already
-- exists, so older databases that were created with
-- ON DELETE CASCADE are corrected here instead of silently
-- deleting reports along with their class.
-- ============================================================

ALTER TABLE exams
  ALTER COLUMN class_slot_id DROP NOT NULL;

DO $$
DECLARE
  cascade_constraint TEXT;
BEGIN
  SELECT c.conname
  INTO cascade_constraint
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = current_schema()
    AND t.relname = 'exams'
    AND c.contype = 'f'
    AND c.confrelid = 'class_slots'::regclass
    AND c.confdeltype = 'c';

  IF cascade_constraint IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE exams DROP CONSTRAINT %I',
      cascade_constraint
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = current_schema()
      AND t.relname = 'exams'
      AND c.contype = 'f'
      AND c.confrelid = 'class_slots'::regclass
      AND c.confdeltype = 'n'
  ) THEN
    ALTER TABLE exams
      ADD CONSTRAINT exams_class_slot_id_history_fkey
      FOREIGN KEY (class_slot_id)
      REFERENCES class_slots(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

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

CREATE INDEX IF NOT EXISTS idx_exams_exam_date
  ON exams(exam_date DESC);


-- ============================================================
-- MARKS
-- ============================================================

CREATE TABLE IF NOT EXISTS marks (
  id SERIAL PRIMARY KEY,

  student_id INTEGER NOT NULL
    REFERENCES students(id) ON DELETE CASCADE,

  exam_id INTEGER NOT NULL
    REFERENCES exams(id) ON DELETE CASCADE,

  marks_obtained NUMERIC(6,2) NOT NULL,

  grade VARCHAR(5),

  remarks TEXT,

  UNIQUE(student_id, exam_id)
);


-- ============================================================
-- FEES
-- ============================================================

CREATE TABLE IF NOT EXISTS fees (
  id SERIAL PRIMARY KEY,

  student_id INTEGER NOT NULL
    REFERENCES students(id) ON DELETE CASCADE,

  total_amount NUMERIC(12,2) NOT NULL,

  paid_amount NUMERIC(12,2) DEFAULT 0,

  due_amount NUMERIC(12,2) NOT NULL,

  status VARCHAR(15) DEFAULT 'pending'
    CHECK (status IN ('pending', 'partial', 'paid', 'overdue')),

  payment_date DATE,

  receipt_number VARCHAR(50),

  academic_year VARCHAR(20),

  description TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- ASSIGNMENTS
--
-- Teacher assignments/homework.
-- ============================================================

CREATE TABLE IF NOT EXISTS assignments (
  id SERIAL PRIMARY KEY,

  title VARCHAR(255) NOT NULL,

  description TEXT,

  class_slot_id INTEGER
    REFERENCES class_slots(id) ON DELETE CASCADE,

  teacher_id INTEGER
    REFERENCES users(id) ON DELETE SET NULL,

  due_date DATE,

  file_path VARCHAR(500),

  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- SUBMISSIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS submissions (
  id SERIAL PRIMARY KEY,

  assignment_id INTEGER NOT NULL
    REFERENCES assignments(id) ON DELETE CASCADE,

  student_id INTEGER NOT NULL
    REFERENCES students(id) ON DELETE CASCADE,

  file_path VARCHAR(500),

  notes TEXT,

  marks NUMERIC(6,2),

  remarks TEXT,

  submitted_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(assignment_id, student_id)
);


-- ============================================================
-- TIMETABLE
--
-- class_slots are the actual academic classes.
-- timetable can later be used for weekly scheduling/display.
-- ============================================================

CREATE TABLE IF NOT EXISTS timetable (
  id SERIAL PRIMARY KEY,

  class_slot_id INTEGER NOT NULL
    REFERENCES class_slots(id) ON DELETE CASCADE,

  day_of_week VARCHAR(10) NOT NULL,

  start_time TIME NOT NULL,

  end_time TIME NOT NULL,

  room VARCHAR(50)
);


-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_students_roll
  ON students(roll_number);

CREATE INDEX IF NOT EXISTS idx_student_enrollments_student
  ON student_enrollments(student_id);

CREATE INDEX IF NOT EXISTS idx_student_enrollments_slot
  ON student_enrollments(class_slot_id);

CREATE INDEX IF NOT EXISTS idx_class_slots_subject
  ON class_slots(subject_id);

CREATE INDEX IF NOT EXISTS idx_class_slots_teacher
  ON class_slots(teacher_id);

CREATE INDEX IF NOT EXISTS idx_attendance_student
  ON attendance(student_id);

CREATE INDEX IF NOT EXISTS idx_attendance_date
  ON attendance(date);

CREATE INDEX IF NOT EXISTS idx_attendance_slot
  ON attendance(class_slot_id);

CREATE INDEX IF NOT EXISTS idx_marks_student
  ON marks(student_id);

CREATE INDEX IF NOT EXISTS idx_fees_student
  ON fees(student_id);