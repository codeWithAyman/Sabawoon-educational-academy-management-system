-- ============================================================
-- SABAWOON — ARCHIVED CLASSES SURVIVE SUBJECT DELETION
--
-- Safe, additive migration.
--
-- WHY
--
--   class_slots.subject_id was ON DELETE CASCADE, so removing a
--   subject deleted every class that still referenced it — including
--   archived classes, which are historical records. To avoid that,
--   the API refused to delete ANY subject referenced by any class,
--   even one that was only referenced by archived (inactive) classes
--   the administrator had already stopped using. That is why an
--   "unused" subject could not be removed.
--
--   This migration makes the database keep archived classes when a
--   subject row disappears: the class row stays and its subject_id
--   simply becomes NULL. Active classes are still protected — the
--   API refuses to delete a subject while any active class uses it
--   (see routes/classes.js), so a live class can never lose its
--   subject.
--
-- WHAT IT CHANGES
--
--   1. class_slots.subject_id becomes nullable (NULL only ever
--      appears on archived classes whose subject was removed).
--   2. The foreign key becomes ON DELETE SET NULL instead of
--      ON DELETE CASCADE. No row is deleted by this migration.
--
-- SAFETY
--
--   * No table is dropped, recreated or truncated.
--   * No existing row is deleted or modified.
--   * Every existing class keeps its subject reference.
--   * Safe to run repeatedly.
--
-- REVERSAL
--
--   To go back, re-create the CASCADE constraint and (optionally)
--   make the column NOT NULL again after resolving any NULL rows:
--
--     ALTER TABLE class_slots DROP CONSTRAINT IF EXISTS
--       class_slots_subject_id_fkey;
--     ALTER TABLE class_slots ADD CONSTRAINT class_slots_subject_id_fkey
--       FOREIGN KEY (subject_id) REFERENCES subjects(id)
--       ON DELETE CASCADE;
--     -- Only after resolving NULL subject_id rows:
--     -- ALTER TABLE class_slots ALTER COLUMN subject_id SET NOT NULL;
-- ============================================================

-- 1. NULL is only possible for archived classes whose subject was removed.

ALTER TABLE class_slots
  ALTER COLUMN subject_id DROP NOT NULL;

-- 2. Keep the class row instead of deleting it with its subject.

ALTER TABLE class_slots
  DROP CONSTRAINT IF EXISTS class_slots_subject_id_fkey;

ALTER TABLE class_slots
  ADD CONSTRAINT class_slots_subject_id_fkey
  FOREIGN KEY (subject_id)
  REFERENCES subjects(id)
  ON DELETE SET NULL;
