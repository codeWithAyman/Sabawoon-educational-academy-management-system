BEGIN;

-- ============================================================
-- SABAWOON — CLEAN PEOPLE / AUTH STRUCTURE RESET
-- ============================================================
-- Keeps the rest of the academy database intact.
-- Removes the old Teacher/Staff account model.
-- ============================================================


-- ============================================================
-- 1. CREATE NEW STAFF TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS staff (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(30),
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- 2. PREPARE USERS TABLE FOR THE NEW ACCOUNT MODEL
-- ============================================================

-- Temporarily remove the old role restriction.
ALTER TABLE users
DROP CONSTRAINT IF EXISTS users_role_check;


-- ============================================================
-- 3. CREATE STANDALONE TEACHER INFORMATION
-- ============================================================

ALTER TABLE teachers
ADD COLUMN IF NOT EXISTS full_name VARCHAR(150);

ALTER TABLE teachers
ADD COLUMN IF NOT EXISTS email VARCHAR(255);

ALTER TABLE teachers
ADD COLUMN IF NOT EXISTS phone VARCHAR(30);


-- ============================================================
-- 4. REMOVE OLD TEACHER/STUDENT? NO.
--    ONLY REMOVE OLD TEACHER/STAFF ACCOUNTS.
-- ============================================================

-- Copy existing teacher information into the teacher record
-- before removing the old user accounts.
UPDATE teachers t
SET
    full_name = u.full_name,
    email = u.email,
    phone = u.phone
FROM users u
WHERE t.user_id = u.id
  AND u.role = 'teacher';


-- Copy existing staff records into the new standalone staff table.
INSERT INTO staff (
    full_name,
    email,
    phone,
    password_hash,
    is_active,
    created_at,
    updated_at
)
SELECT
    u.full_name,
    u.email,
    u.phone,
    u.password_hash,
    u.is_active,
    u.created_at,
    u.updated_at
FROM users u
WHERE u.role = 'staff';


-- ============================================================
-- 5. CHANGE CLASS SLOTS TO USE TEACHER RECORDS
-- ============================================================

ALTER TABLE class_slots
DROP CONSTRAINT IF EXISTS class_slots_teacher_id_fkey;

UPDATE class_slots cs
SET teacher_id = t.id
FROM teachers t
WHERE t.user_id = cs.teacher_id;


ALTER TABLE class_slots
ADD CONSTRAINT class_slots_teacher_id_fkey
FOREIGN KEY (teacher_id)
REFERENCES teachers(id)
ON DELETE RESTRICT;


-- ============================================================
-- 6. CHANGE ASSIGNMENTS TO USE TEACHER RECORDS
-- ============================================================

ALTER TABLE assignments
DROP CONSTRAINT IF EXISTS assignments_teacher_id_fkey;

UPDATE assignments a
SET teacher_id = t.id
FROM teachers t
WHERE t.user_id = a.teacher_id;


ALTER TABLE assignments
ADD CONSTRAINT assignments_teacher_id_fkey
FOREIGN KEY (teacher_id)
REFERENCES teachers(id)
ON DELETE SET NULL;


-- ============================================================
-- 7. REMOVE OLD TEACHER → USER RELATIONSHIP
-- ============================================================

ALTER TABLE teachers
DROP CONSTRAINT IF EXISTS teachers_user_id_fkey;

ALTER TABLE teachers
ALTER COLUMN user_id DROP NOT NULL;

UPDATE teachers
SET user_id = NULL;

ALTER TABLE teachers
DROP COLUMN IF EXISTS user_id;


-- ============================================================
-- 8. REMOVE OLD TEACHER AND STAFF ACCOUNTS
-- ============================================================

DELETE FROM users
WHERE role IN ('teacher', 'staff');


-- ============================================================
-- 9. NEW USER ROLES
-- ============================================================

ALTER TABLE users
ADD CONSTRAINT users_role_check
CHECK (role IN ('admin', 'attendance'));


-- ============================================================
-- 10. ONLY ONE ATTENDANCE ACCOUNT IS ALLOWED
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS users_one_attendance_account
ON users (role)
WHERE role = 'attendance';


-- ============================================================
-- 11. SAFETY CHECK
-- ============================================================

DO $$
BEGIN

    IF EXISTS (
        SELECT 1
        FROM users
        WHERE role NOT IN ('admin', 'attendance')
    ) THEN
        RAISE EXCEPTION
        'Invalid user role remains in users table.';
    END IF;

END $$;


COMMIT;