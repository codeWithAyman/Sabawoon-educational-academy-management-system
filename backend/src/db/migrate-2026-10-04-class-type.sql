-- ============================================================
-- SABAWOON — CLASS TYPES
--
-- Safe, additive migration.
--
-- WHY
--
--   A class time slot needs a type, such as Male, Female, Kids
--   or Mixed, so classes can be split by audience.
--
--   The list of types is stored in its own table and served by
--   the API, so the interface never hardcodes the options and an
--   administrator can extend the list later.
--
-- SAFETY
--
--   * No table is dropped, recreated or truncated.
--   * No existing row is deleted or modified.
--   * `class_slots.class_type_id` is nullable, so every existing
--     class stays valid and simply has no type yet.
--   * Deleting a type later only clears the reference, it never
--     removes a class.
--   * Safe to run repeatedly.
-- ============================================================

-- 1. The lookup table.

CREATE TABLE IF NOT EXISTS class_types (
  id SERIAL PRIMARY KEY,

  name VARCHAR(50) NOT NULL UNIQUE,

  sort_order INTEGER NOT NULL DEFAULT 0,

  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. The default types. Existing names are left untouched.

INSERT INTO class_types (name, sort_order)
VALUES
  ('Male', 1),
  ('Female', 2),
  ('Kids', 3),
  ('Mixed', 4)
ON CONFLICT (name) DO NOTHING;

-- 3. Link every class to a type.

ALTER TABLE class_slots
  ADD COLUMN IF NOT EXISTS class_type_id INTEGER
    REFERENCES class_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_class_slots_class_type
  ON class_slots(class_type_id);