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
    const usage = await query(
      `
        SELECT EXISTS(
          SELECT 1
          FROM class_slots
          WHERE subject_id = $1
        ) AS in_use
      `,
      [req.params.id],
    );

    if (usage.rows[0].in_use) {
      return res.status(409).json({
        error:
          "This subject cannot be deleted because it is used by a class time slot. Archive or stop using the class instead.",
        code: "SUBJECT_IN_USE",
      });
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
    const usage = await query(
      `
        SELECT EXISTS(
          SELECT 1
          FROM class_slot_books
          WHERE book_id = $1
        ) AS in_use
      `,
      [req.params.id],
    );

    if (usage.rows[0].in_use) {
      return res.status(409).json({
        error:
          "This book cannot be deleted because it is attached to a class. Create a new book instead of removing historical class information.",
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

      const classResult = await client.query(
        `
          INSERT INTO class_slots(
            subject_id,
            teacher_id,
            start_time,
            end_time,
            academic_year,
            level,
            is_active
          )
          VALUES($1, $2, $3, $4, $5, $6, TRUE)
          RETURNING *
        `,
        [
          subject_id,
          teacher_id,
          start_time,
          end_time,
          normalizedAcademicYear,
          normalizedLevel,
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
      is_active,
    } = req.body;

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
        (book_ids !== undefined &&
          JSON.stringify(
            [...(normalizedBookIds || [])].sort((a, b) => a - b),
          ) !== JSON.stringify(currentBookIds));

      if (hasExams && identityChanged) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          error:
            "This class has assessments and its historical identity is locked. Archive this class and create a new class for a different teacher, subject, time, level, academic year, or book.",
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
            is_active = COALESCE($7, is_active)
          WHERE id = $8
        `,
        [
          finalSubjectId,
          finalTeacherId,
          finalStartTime,
          finalEndTime,
          finalAcademicYear,
          finalLevel,
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
          st.roll_number,
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
          st.roll_number,
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
