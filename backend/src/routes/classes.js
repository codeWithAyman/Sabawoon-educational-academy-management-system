const express = require("express");
const { query, pool } = require("../db/pool");
const { authRequired, requireRoles } = require("../middleware/auth");
const { asyncH } = require("../utils/helpers");

const router = express.Router();

function normalizeOptionalText(value) {
  if (value === undefined || value === null) return null;

  const text = String(value).trim();

  return text || null;
}

/* =========================================================
   DEADLINE

   Deadlines are optional. When present they must be a real
   Gregorian calendar date such as "2026-09-21". They are stored
   as-is and rendered as Solar Hijri by the interface.

   Returns the normalized date, or null when cleared. Sets
   `error` when the value cannot be used.
========================================================= */

const DEADLINE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/* =========================================================
   CLASS TYPE

   The class type is optional. When present it must reference an
   existing active class type.
========================================================= */

function normalizeClassTypeId(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    return Number.NaN;
  }

  return id;
}

async function validateClassTypeId(client, classTypeId) {
  if (classTypeId === null) {
    return;
  }

  const result = await client.query(
    `
      SELECT id
      FROM class_types
      WHERE id = $1
        AND is_active = TRUE
    `,
    [classTypeId],
  );

  if (!result.rows.length) {
    const error = new Error("Selected class type was not found");

    error.status = 400;
    error.code = "INVALID_CLASS_TYPE";

    throw error;
  }
}

/* =========================================================
   DEFAULT CLASS TYPES

   The four built-in types (Male, Female, Kids, Mixed) are part of
   the application's data model — see db/schema.sql. Some existing
   installations have the class_types table but none of the rows,
   which made the class type selector show "No class type".

   This idempotent insert restores only the missing built-in rows.
   It never updates or deletes anything an administrator created.
========================================================= */

const DEFAULT_CLASS_TYPES = [
  { name: "Male", sortOrder: 1 },
  { name: "Female", sortOrder: 2 },
  { name: "Kids", sortOrder: 3 },
  { name: "Mixed", sortOrder: 4 },
];

let defaultClassTypesEnsured = false;

async function ensureDefaultClassTypes() {
  if (defaultClassTypesEnsured) {
    return;
  }

  try {
    for (const classType of DEFAULT_CLASS_TYPES) {
      await query(
        `
          INSERT INTO class_types (name, sort_order)
          VALUES ($1, $2)
          ON CONFLICT (name) DO NOTHING
        `,
        [classType.name, classType.sortOrder],
      );
    }

    defaultClassTypesEnsured = true;
  } catch (error) {
    // Keep the flag false so a later request retries. A missing table or a
    // briefly unreachable database must never crash the API.
    console.error("Could not ensure default class types:", error.message);
  }
}

function normalizeDeadline(value) {
  if (value === undefined || value === null) {
    return { value: null, error: null };
  }

  if (typeof value === "object") {
    return { value: null, error: null };
  }

  const text = String(value).trim();

  if (!text) {
    return { value: null, error: null };
  }

  if (!DEADLINE_PATTERN.test(text)) {
    return { value: null, error: "Deadline must be a valid date" };
  }

  const [year, month, day] = text.split("-").map(Number);

  const parsed = new Date(Date.UTC(year, month - 1, day));

  const isRealDate =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;

  if (!isRealDate) {
    return { value: null, error: "Deadline must be a valid date" };
  }

  return { value: text, error: null };
}

/* =========================================================
   ACTIVE CLASSES
========================================================= */

router.get(
  "/",
  authRequired,
  asyncH(async (req, res) => {
    const r = await query(`
      SELECT
        cs.id,
        cs.subject_id,
        s.name AS subject_name,
        s.code AS subject_code,
        cs.teacher_id,
        t.full_name AS teacher_name,
        cs.start_time,
        cs.end_time,
        cs.academic_year,
        cs.level,
        cs.deadline,
        cs.class_type_id,
        ct.name AS class_type,
        cs.is_active,
        cs.created_at,

        (
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'id', sb.id,
                'name', sb.name
              )
              ORDER BY sb.name
            ),
            '[]'::json
          )
          FROM class_slot_books csb
          INNER JOIN subject_books sb
            ON sb.id = csb.book_id
          WHERE csb.class_slot_id = cs.id
        ) AS books,

        (
          SELECT COUNT(*)::int
          FROM student_enrollments se
          WHERE se.class_slot_id = cs.id
            AND se.is_active = TRUE
        ) AS student_count

      FROM class_slots cs
      INNER JOIN subjects s
        ON s.id = cs.subject_id
      INNER JOIN teachers t
        ON t.id = cs.teacher_id
      LEFT JOIN class_types ct
        ON ct.id = cs.class_type_id

      WHERE cs.is_active = TRUE

      ORDER BY
        s.name,
        cs.start_time,
        t.full_name
    `);

    res.json(r.rows);
  }),
);

/* =========================================================
   CLASS TYPES
   The options come from the database so the interface never
   has to hardcode them.
========================================================= */

router.get(
  "/types",
  authRequired,
  asyncH(async (req, res) => {
    await ensureDefaultClassTypes();

    const r = await query(`
      SELECT
        ct.id,
        ct.name,
        ct.sort_order,

        (
          SELECT COUNT(*)::int
          FROM class_slots cs
          WHERE cs.class_type_id = ct.id
            AND cs.is_active = TRUE
        ) AS class_count

      FROM class_types ct

      WHERE ct.is_active = TRUE

      ORDER BY
        ct.sort_order,
        ct.name
    `);

    res.json(r.rows);
  }),
);

/* =========================================================
   SUBJECTS
========================================================= */

router.get(
  "/subjects/all",
  authRequired,
  asyncH(async (req, res) => {
    const r = await query(`
      SELECT
        s.id,
        s.name,
        s.code,
        s.created_at,

        (
          SELECT COUNT(*)::int
          FROM class_slots cs
          WHERE cs.subject_id = s.id
            AND cs.is_active = TRUE
        ) AS class_count,

        (
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'id', sb.id,
                'name', sb.name
              )
              ORDER BY sb.name
            ),
            '[]'::json
          )
          FROM subject_books sb
          WHERE sb.subject_id = s.id
        ) AS books

      FROM subjects s
      ORDER BY s.name
    `);

    res.json(r.rows);
  }),
);

router.post(
  "/subjects",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const { name, code } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        error: "Subject name is required",
      });
    }

    try {
      const r = await query(
        `
          INSERT INTO subjects(name, code)
          VALUES($1, $2)
          RETURNING *
        `,
        [
          String(name).trim(),
          code !== undefined && String(code).trim()
            ? String(code).trim()
            : null,
        ],
      );

      res.status(201).json(r.rows[0]);
    } catch (error) {
      if (error.code === "23505") {
        return res.status(409).json({
          error: "A subject with this name already exists",
          code: "SUBJECT_EXISTS",
        });
      }

      throw error;
    }
  }),
);

router.put(
  "/subjects/:id",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const { name, code } = req.body;

    if (name !== undefined && !String(name).trim()) {
      return res.status(400).json({
        error: "Subject name cannot be empty",
      });
    }

    try {
      const r = await query(
        `
          UPDATE subjects
          SET
            name = COALESCE($1, name),
            code = $2
          WHERE id = $3
          RETURNING *
        `,
        [
          name !== undefined ? String(name).trim() : null,
          code !== undefined && String(code).trim()
            ? String(code).trim()
            : null,
          req.params.id,
        ],
      );

      if (!r.rows.length) {
        return res.status(404).json({
          error: "Subject not found",
        });
      }

      res.json(r.rows[0]);
    } catch (error) {
      if (error.code === "23505") {
        return res.status(409).json({
          error: "A subject with this name already exists",
          code: "SUBJECT_EXISTS",
        });
      }

      throw error;
    }
  }),
);

router.delete(
  "/subjects/:id",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    /*
      Accurate dependency check.

      Only ACTIVE classes keep a subject in use. Archived classes are
      historical records: they must survive the removal of a subject,
      so the check reports them separately and the database keeps them
      (see db/migrate-2026-10-20-subject-archive-safe.sql, which turns
      the old destructive cascade into ON DELETE SET NULL).
    */
    const usage = await query(
      `
        SELECT
          COUNT(*) FILTER (WHERE cs.is_active = TRUE) AS active_slots,
          COUNT(*) FILTER (WHERE cs.is_active <> TRUE) AS archived_slots
        FROM class_slots cs
        WHERE cs.subject_id = $1
      `,
      [req.params.id],
    );

    const activeSlots = Number(usage.rows[0].active_slots || 0);
    const archivedSlots = Number(usage.rows[0].archived_slots || 0);

    if (activeSlots > 0) {
      return res.status(409).json({
        error:
          `This subject is still used by ${activeSlots} active ` +
          `${activeSlots === 1 ? "class" : "classes"}. Archive or reassign ` +
          "those classes first — active classes always keep their subject.",
        code: "SUBJECT_IN_USE",
      });
    }

    if (archivedSlots > 0) {
      /*
        Deleting the subject must not delete the archived classes that
        still reference it. That is only safe when the foreign key is
        ON DELETE SET NULL; with the old ON DELETE CASCADE the row
        removal would silently destroy archived class records.
      */
      const fk = await query(
        `
          SELECT c.confdeltype
          FROM pg_constraint c
          WHERE c.conrelid = 'class_slots'::regclass
            AND c.confrelid = 'subjects'::regclass
            AND c.contype = 'f'
          LIMIT 1
        `,
      );

      const preservesArchived = fk.rows[0]?.confdeltype === "n";

      if (!preservesArchived) {
        return res.status(409).json({
          error:
            `This subject is no longer used by any active class, but it is ` +
            `still linked to ${archivedSlots} archived ` +
            `${archivedSlots === 1 ? "class" : "classes"}. Before it can ` +
            "be removed, run the database migration " +
            "migrate-2026-10-20-subject-archive-safe.sql (npm run migrate) " +
            "so archived classes keep their history instead of being " +
            "deleted with the subject.",
          code: "SUBJECT_MIGRATION_REQUIRED",
        });
      }
    }

    const r = await query(
      `
        DELETE FROM subjects
        WHERE id = $1
        RETURNING id
      `,
      [req.params.id],
    );

    if (!r.rows.length) {
      return res.status(404).json({
        error: "Subject not found",
      });
    }

    res.json({ ok: true });
  }),
);

/* =========================================================
   SUBJECT BOOKS
========================================================= */

router.get(
  "/subjects/:id([0-9]+)/books",
  authRequired,
  asyncH(async (req, res) => {
    const subject = await query(
      `
        SELECT id, name, code
        FROM subjects
        WHERE id = $1
      `,
      [req.params.id],
    );

    if (!subject.rows.length) {
      return res.status(404).json({
        error: "Subject not found",
      });
    }

    const r = await query(
      `
        SELECT
          id,
          subject_id,
          name,
          created_at
        FROM subject_books
        WHERE subject_id = $1
        ORDER BY name
      `,
      [req.params.id],
    );

    res.json(r.rows);
  }),
);

router.post(
  "/subjects/:id([0-9]+)/books",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const { name } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        error: "Book name is required",
      });
    }

    const subject = await query(
      `
        SELECT id
        FROM subjects
        WHERE id = $1
      `,
      [req.params.id],
    );

    if (!subject.rows.length) {
      return res.status(404).json({
        error: "Subject not found",
      });
    }

    try {
      const r = await query(
        `
          INSERT INTO subject_books(subject_id, name)
          VALUES($1, $2)
          RETURNING *
        `,
        [req.params.id, String(name).trim()],
      );

      res.status(201).json(r.rows[0]);
    } catch (error) {
      if (error.code === "23505") {
        return res.status(409).json({
          error: "This book already exists for this subject",
          code: "BOOK_EXISTS",
        });
      }

      throw error;
    }
  }),
);

router.put(
  "/books/:id([0-9]+)",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const { name } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        error: "Book name is required",
      });
    }

    try {
      const r = await query(
        `
          UPDATE subject_books
          SET name = $1
          WHERE id = $2
          RETURNING *
        `,
        [String(name).trim(), req.params.id],
      );

      if (!r.rows.length) {
        return res.status(404).json({
          error: "Book not found",
        });
      }

      res.json(r.rows[0]);
    } catch (error) {
      if (error.code === "23505") {
        return res.status(409).json({
          error: "This book already exists for this subject",
          code: "BOOK_EXISTS",
        });
      }

      throw error;
    }
  }),
);

router.delete(
  "/books/:id([0-9]+)",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    /*
      Same rule as subjects: only ACTIVE classes keep a book in use.
      Removing a book that is only attached to archived classes removes
      just the book's own links — the archived classes themselves, their
      enrollments, attendance and every saved report stay untouched
      (reports keep their own books snapshot).
    */
    const usage = await query(
      `
        SELECT
          COUNT(*) FILTER (WHERE cs.is_active = TRUE) AS active_links,
          COUNT(*) FILTER (WHERE cs.is_active <> TRUE) AS archived_links
        FROM class_slot_books csb
        INNER JOIN class_slots cs
          ON cs.id = csb.class_slot_id
        WHERE csb.book_id = $1
      `,
      [req.params.id],
    );

    const activeLinks = Number(usage.rows[0].active_links || 0);

    if (activeLinks > 0) {
      return res.status(409).json({
        error:
          `This book is still attached to ${activeLinks} active ` +
          `${activeLinks === 1 ? "class" : "classes"}. Remove it from ` +
          "those classes (or archive them) before deleting it.",
        code: "BOOK_IN_USE",
      });
    }

    const r = await query(
      `
        DELETE FROM subject_books
        WHERE id = $1
        RETURNING id
      `,
      [req.params.id],
    );

    if (!r.rows.length) {
      return res.status(404).json({
        error: "Book not found",
      });
    }

    res.json({ ok: true });
  }),
);

/* =========================================================
   SINGLE CLASS
========================================================= */

router.get(
  "/:id([0-9]+)",
  authRequired,
  asyncH(async (req, res) => {
    const r = await query(
      `
        SELECT
          cs.id,
          cs.subject_id,
          s.name AS subject_name,
          s.code AS subject_code,
          cs.teacher_id,
          t.full_name AS teacher_name,
          cs.start_time,
          cs.end_time,
          cs.academic_year,
          cs.level,
          cs.deadline,
          cs.class_type_id,
          ct.name AS class_type,
          cs.is_active,
          cs.created_at,

          (
            SELECT COALESCE(
              json_agg(
                json_build_object(
                  'id', sb.id,
                  'name', sb.name
                )
                ORDER BY sb.name
              ),
              '[]'::json
            )
            FROM class_slot_books csb
            INNER JOIN subject_books sb
              ON sb.id = csb.book_id
            WHERE csb.class_slot_id = cs.id
          ) AS books

        FROM class_slots cs
        INNER JOIN subjects s
          ON s.id = cs.subject_id
        INNER JOIN teachers t
          ON t.id = cs.teacher_id
        LEFT JOIN class_types ct
          ON ct.id = cs.class_type_id

        WHERE cs.id = $1
      `,
      [req.params.id],
    );

    if (!r.rows.length) {
      return res.status(404).json({
        error: "Class slot not found",
      });
    }

    res.json(r.rows[0]);
  }),
);

/* =========================================================
   BOOK HELPERS
========================================================= */

function normalizeBookIds(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const ids = [];

  for (const valueItem of value) {
    const id = Number(valueItem);

    if (!Number.isInteger(id) || id <= 0) {
      return null;
    }

    if (!ids.includes(id)) {
      ids.push(id);
    }
  }

  return ids;
}

async function validateBookIdsForSubject(client, subjectId, bookIds) {
  if (!bookIds || bookIds.length === 0) {
    return;
  }

  const result = await client.query(
    `
      SELECT id
      FROM subject_books
      WHERE subject_id = $1
        AND id = ANY($2::int[])
    `,
    [subjectId, bookIds],
  );

  if (result.rows.length !== bookIds.length) {
    const error = new Error(
      "One or more selected books do not belong to the selected subject",
    );

    error.status = 400;
    error.code = "INVALID_SUBJECT_BOOK";

    throw error;
  }
}

async function insertClassBooks(client, classSlotId, bookIds) {
  if (!bookIds || bookIds.length === 0) {
    return;
  }

  for (const bookId of bookIds) {
    await client.query(
      `
        INSERT INTO class_slot_books(class_slot_id, book_id)
        VALUES($1, $2)
      `,
      [classSlotId, bookId],
    );
  }
}

/* =========================================================
   CREATE CLASS
========================================================= */

router.post(
  "/",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const {
      subject_id,
      teacher_id,
      start_time,
      end_time,
      book_ids,
      academic_year,
      level,
      deadline,
      class_type_id,
    } = req.body;

    if (!subject_id || !teacher_id || !start_time || !end_time) {
      return res.status(400).json({
        error: "Subject, teacher, start time and end time are required",
      });
    }

    if (String(end_time) <= String(start_time)) {
      return res.status(400).json({
        error: "End time must be after start time",
      });
    }

    const normalizedBookIds = normalizeBookIds(book_ids);

    if (book_ids !== undefined && normalizedBookIds === null) {
      return res.status(400).json({
        error: "book_ids must be an array of valid book IDs",
      });
    }

    const normalizedAcademicYear = normalizeOptionalText(academic_year);

    const normalizedLevel = normalizeOptionalText(level);

    const { value: normalizedDeadline, error: deadlineError } =
      normalizeDeadline(deadline);

    if (deadlineError) {
      return res.status(400).json({
        error: deadlineError,
      });
    }

    const normalizedClassTypeId = normalizeClassTypeId(class_type_id);

    if (Number.isNaN(normalizedClassTypeId)) {
      return res.status(400).json({
        error: "class_type_id must be a valid class type ID",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const teacher = await client.query(
        `
          SELECT id, full_name
          FROM teachers
          WHERE id = $1
        `,
        [teacher_id],
      );

      if (!teacher.rows.length) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          error: "Selected teacher was not found",
        });
      }

      const subject = await client.query(
        `
          SELECT id
          FROM subjects
          WHERE id = $1
        `,
        [subject_id],
      );

      if (!subject.rows.length) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          error: "Subject not found",
        });
      }

      await validateBookIdsForSubject(
        client,
        subject_id,
        normalizedBookIds || [],
      );

      await validateClassTypeId(client, normalizedClassTypeId);

      const classResult = await client.query(
        `
          INSERT INTO class_slots(
            subject_id,
            teacher_id,
            start_time,
            end_time,
            academic_year,
            level,
            deadline,
            class_type_id,
            is_active
          )
          VALUES($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
          RETURNING *
        `,
        [
          subject_id,
          teacher_id,
          start_time,
          end_time,
          normalizedAcademicYear,
          normalizedLevel,
          normalizedDeadline,
          normalizedClassTypeId,
        ],
      );

      const classSlot = classResult.rows[0];

      await insertClassBooks(client, classSlot.id, normalizedBookIds || []);

      await client.query("COMMIT");

      const finalResult = await query(
        `
          SELECT
            cs.id,
            cs.subject_id,
            s.name AS subject_name,
            s.code AS subject_code,
            cs.teacher_id,
            t.full_name AS teacher_name,
            cs.start_time,
            cs.end_time,
            cs.academic_year,
            cs.level,
            cs.deadline,
            cs.class_type_id,
            ct.name AS class_type,
            cs.is_active,
            cs.created_at,

            (
              SELECT COALESCE(
                json_agg(
                  json_build_object(
                    'id', sb.id,
                    'name', sb.name
                  )
                  ORDER BY sb.name
                ),
                '[]'::json
              )
              FROM class_slot_books csb
              INNER JOIN subject_books sb
                ON sb.id = csb.book_id
              WHERE csb.class_slot_id = cs.id
            ) AS books

          FROM class_slots cs
          INNER JOIN subjects s
            ON s.id = cs.subject_id
          INNER JOIN teachers t
            ON t.id = cs.teacher_id
          LEFT JOIN class_types ct
            ON ct.id = cs.class_type_id

          WHERE cs.id = $1
        `,
        [classSlot.id],
      );

      res.status(201).json(finalResult.rows[0]);
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {}

      throw error;
    } finally {
      client.release();
    }
  }),
);

/* =========================================================
   UPDATE CLASS
========================================================= */

router.put(
  "/:id([0-9]+)",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const {
      subject_id,
      teacher_id,
      start_time,
      end_time,
      book_ids,
      academic_year,
      level,
      deadline,
      class_type_id,
      is_active,
    } = req.body;

    const { value: normalizedDeadline, error: deadlineError } =
      normalizeDeadline(deadline);

    if (deadlineError) {
      return res.status(400).json({
        error: deadlineError,
      });
    }

    const normalizedClassTypeId = normalizeClassTypeId(class_type_id);

    if (Number.isNaN(normalizedClassTypeId)) {
      return res.status(400).json({
        error: "class_type_id must be a valid class type ID",
      });
    }

    const normalizedBookIds = normalizeBookIds(book_ids);

    if (book_ids !== undefined && normalizedBookIds === null) {
      return res.status(400).json({
        error: "book_ids must be an array of valid book IDs",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const existing = await client.query(
        `
          SELECT
            id,
            subject_id,
            teacher_id,
            start_time,
            end_time,
            academic_year,
            level,
            deadline,
            class_type_id,
            is_active
          FROM class_slots
          WHERE id = $1
          FOR UPDATE
        `,
        [req.params.id],
      );

      if (!existing.rows.length) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          error: "Class slot not found",
        });
      }

      const current = existing.rows[0];

      const assessmentCheck = await client.query(
        `
          SELECT EXISTS(
            SELECT 1
            FROM exams
            WHERE class_slot_id = $1
          ) AS has_exams
        `,
        [req.params.id],
      );

      const hasExams = assessmentCheck.rows[0].has_exams;

      const finalSubjectId =
        subject_id !== undefined ? subject_id : current.subject_id;

      const finalTeacherId =
        teacher_id !== undefined ? teacher_id : current.teacher_id;

      const finalStartTime =
        start_time !== undefined ? start_time : current.start_time;

      const finalEndTime = end_time !== undefined ? end_time : current.end_time;

      const finalAcademicYear =
        academic_year !== undefined
          ? normalizeOptionalText(academic_year)
          : current.academic_year;

      const finalLevel =
        level !== undefined ? normalizeOptionalText(level) : current.level;

      // The deadline is deliberately not part of identityChanged:
      // a deadline can be corrected at any time, even for a class
      // that already has assessments.
      const finalDeadline =
        deadline !== undefined ? normalizedDeadline : current.deadline;

      const finalClassTypeId =
        class_type_id !== undefined
          ? normalizedClassTypeId
          : current.class_type_id;

      let currentBookIds = [];

      if (book_ids !== undefined) {
        const currentBooks = await client.query(
          `
            SELECT book_id
            FROM class_slot_books
            WHERE class_slot_id = $1
            ORDER BY book_id
          `,
          [req.params.id],
        );

        currentBookIds = currentBooks.rows.map((row) => Number(row.book_id));
      }

      const identityChanged =
        Number(finalSubjectId) !== Number(current.subject_id) ||
        Number(finalTeacherId) !== Number(current.teacher_id) ||
        String(finalStartTime) !== String(current.start_time) ||
        String(finalEndTime) !== String(current.end_time) ||
        String(finalAcademicYear || "") !==
          String(current.academic_year || "") ||
        String(finalLevel || "") !== String(current.level || "") ||
        Number(finalClassTypeId || 0) !== Number(current.class_type_id || 0) ||
        (book_ids !== undefined &&
          JSON.stringify(
            [...(normalizedBookIds || [])].sort((a, b) => a - b),
          ) !== JSON.stringify(currentBookIds));

      if (hasExams && identityChanged) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          error:
            "This class has assessments and its historical identity is locked. Archive this class and create a new class for a different teacher, subject, time, level, class type, academic year, or book.",
          code: "CLASS_HISTORY_LOCKED",
        });
      }

      if (String(finalEndTime) <= String(finalStartTime)) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          error: "End time must be after start time",
        });
      }

      const teacher = await client.query(
        `
          SELECT id
          FROM teachers
          WHERE id = $1
        `,
        [finalTeacherId],
      );

      if (!teacher.rows.length) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          error: "Selected teacher was not found",
        });
      }

      const subject = await client.query(
        `
          SELECT id
          FROM subjects
          WHERE id = $1
        `,
        [finalSubjectId],
      );

      if (!subject.rows.length) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          error: "Subject not found",
        });
      }

      if (book_ids !== undefined) {
        await validateBookIdsForSubject(
          client,
          finalSubjectId,
          normalizedBookIds || [],
        );
      }

      await validateClassTypeId(client, finalClassTypeId);

      await client.query(
        `
          UPDATE class_slots
          SET
            subject_id = $1,
            teacher_id = $2,
            start_time = $3,
            end_time = $4,
            academic_year = $5,
            level = $6,
            deadline = $7,
            class_type_id = $8,
            is_active = COALESCE($9, is_active)
          WHERE id = $10
        `,
        [
          finalSubjectId,
          finalTeacherId,
          finalStartTime,
          finalEndTime,
          finalAcademicYear,
          finalLevel,
          finalDeadline ? String(finalDeadline).slice(0, 10) : null,
          finalClassTypeId ?? null,
          is_active ?? null,
          req.params.id,
        ],
      );

      if (book_ids !== undefined) {
        await client.query(
          `
            DELETE FROM class_slot_books
            WHERE class_slot_id = $1
          `,
          [req.params.id],
        );

        await insertClassBooks(client, req.params.id, normalizedBookIds || []);
      }

      await client.query("COMMIT");

      const finalResult = await query(
        `
          SELECT
            cs.id,
            cs.subject_id,
            s.name AS subject_name,
            s.code AS subject_code,
            cs.teacher_id,
            t.full_name AS teacher_name,
            cs.start_time,
            cs.end_time,
            cs.academic_year,
            cs.level,
            cs.deadline,
            cs.class_type_id,
            ct.name AS class_type,
            cs.is_active,
            cs.created_at,

            (
              SELECT COALESCE(
                json_agg(
                  json_build_object(
                    'id', sb.id,
                    'name', sb.name
                  )
                  ORDER BY sb.name
                ),
                '[]'::json
              )
              FROM class_slot_books csb
              INNER JOIN subject_books sb
                ON sb.id = csb.book_id
              WHERE csb.class_slot_id = cs.id
            ) AS books

          FROM class_slots cs
          INNER JOIN subjects s
            ON s.id = cs.subject_id
          INNER JOIN teachers t
            ON t.id = cs.teacher_id
          LEFT JOIN class_types ct
            ON ct.id = cs.class_type_id

          WHERE cs.id = $1
        `,
        [req.params.id],
      );

      res.json(finalResult.rows[0]);
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {}

      throw error;
    } finally {
      client.release();
    }
  }),
);

/* =========================================================
   ARCHIVE CLASS
========================================================= */

router.delete(
  "/:id([0-9]+)",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const r = await query(
      `
        UPDATE class_slots
        SET is_active = FALSE
        WHERE id = $1
        RETURNING id
      `,
      [req.params.id],
    );

    if (!r.rows.length) {
      return res.status(404).json({
        error: "Class slot not found",
      });
    }

    res.json({ ok: true });
  }),
);

/* =========================================================
   CLASS STUDENTS
========================================================= */

router.get(
  "/:id([0-9]+)/students",
  authRequired,
  asyncH(async (req, res) => {
    const r = await query(
      `
        SELECT
          se.id AS enrollment_id,
          st.id AS student_id,
          st.full_name,
          st.roll_number,
          st.age,
          st.phone,
          st.guardian_name,
          st.guardian_phone,
          se.enrolled_on,
          se.is_active

        FROM student_enrollments se

        INNER JOIN students st
          ON st.id = se.student_id

        WHERE se.class_slot_id = $1
          AND se.is_active = TRUE

        ORDER BY
          st.roll_number NULLS LAST,
          st.full_name NULLS LAST,
          st.id
      `,
      [req.params.id],
    );

    res.json(r.rows);
  }),
);

router.post(
  "/:id([0-9]+)/students",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const { student_id } = req.body;

    if (!student_id) {
      return res.status(400).json({
        error: "Student is required",
      });
    }

    const slot = await query(
      `
        SELECT id
        FROM class_slots
        WHERE id = $1
          AND is_active = TRUE
      `,
      [req.params.id],
    );

    if (!slot.rows.length) {
      return res.status(404).json({
        error: "Class slot not found",
      });
    }

    const student = await query(
      `
        SELECT id, is_active
        FROM students
        WHERE id = $1
      `,
      [student_id],
    );

    if (!student.rows.length) {
      return res.status(404).json({
        error: "Student not found",
      });
    }

    if (!student.rows[0].is_active) {
      return res.status(409).json({
        error: "Archived students cannot be enrolled in classes",
      });
    }

    const r = await query(
      `
        INSERT INTO student_enrollments(
          student_id,
          class_slot_id
        )
        VALUES($1, $2)

        ON CONFLICT(student_id, class_slot_id)
        DO UPDATE SET is_active = TRUE

        RETURNING *
      `,
      [student_id, req.params.id],
    );

    res.status(201).json(r.rows[0]);
  }),
);

router.delete(
  "/:id([0-9]+)/students/:studentId",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const r = await query(
      `
        UPDATE student_enrollments
        SET is_active = FALSE

        WHERE class_slot_id = $1
          AND student_id = $2

        RETURNING id
      `,
      [req.params.id, req.params.studentId],
    );

    if (!r.rows.length) {
      return res.status(404).json({
        error: "Enrollment not found",
      });
    }

    res.json({ ok: true });
  }),
);

module.exports = router;
