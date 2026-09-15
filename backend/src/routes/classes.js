const express = require("express");
const { query, pool } = require("../db/pool");
const { authRequired, requireRoles } = require("../middleware/auth");
const { asyncH } = require("../utils/helpers");

const router = express.Router();

/*
|--------------------------------------------------------------------------
| GET ALL ACTIVE CLASS SLOTS
|--------------------------------------------------------------------------
*/

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

/*
|--------------------------------------------------------------------------
| GET ALL SUBJECTS
|--------------------------------------------------------------------------
*/

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

/*
|--------------------------------------------------------------------------
| CREATE SUBJECT
|--------------------------------------------------------------------------
*/

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
          INSERT INTO subjects (
            name,
            code
          )
          VALUES ($1, $2)
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

/*
|--------------------------------------------------------------------------
| UPDATE SUBJECT
|--------------------------------------------------------------------------
*/

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

/*
|--------------------------------------------------------------------------
| DELETE SUBJECT
|--------------------------------------------------------------------------
|
| Permanent deletion.
| PostgreSQL will reject this if the subject is still used by a class slot.
|
*/

router.delete(
  "/subjects/:id",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    try {
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

      res.json({
        ok: true,
      });
    } catch (error) {
      if (error.code === "23503") {
        return res.status(409).json({
          error:
            "This subject cannot be deleted because it is being used by a class time slot.",
          code: "SUBJECT_IN_USE",
        });
      }

      throw error;
    }
  }),
);

/*
|--------------------------------------------------------------------------
| GET BOOKS FOR SUBJECT
|--------------------------------------------------------------------------
*/

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

/*
|--------------------------------------------------------------------------
| CREATE BOOK
|--------------------------------------------------------------------------
*/

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
          INSERT INTO subject_books (
            subject_id,
            name
          )
          VALUES ($1, $2)
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

/*
|--------------------------------------------------------------------------
| UPDATE BOOK
|--------------------------------------------------------------------------
*/

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

/*
|--------------------------------------------------------------------------
| DELETE BOOK
|--------------------------------------------------------------------------
|
| Permanent deletion.
| class_slot_books uses ON DELETE CASCADE, so deleting a book also removes
| that book from any class slots where it was selected.
|
*/

router.delete(
  "/books/:id([0-9]+)",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
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

    res.json({
      ok: true,
    });
  }),
);

/*
|--------------------------------------------------------------------------
| GET ONE CLASS SLOT
|--------------------------------------------------------------------------
*/

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

/*
|--------------------------------------------------------------------------
| NORMALIZE BOOK IDS
|--------------------------------------------------------------------------
*/

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

/*
|--------------------------------------------------------------------------
| VALIDATE BOOKS BELONG TO SUBJECT
|--------------------------------------------------------------------------
*/

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

/*
|--------------------------------------------------------------------------
| ADD BOOKS TO CLASS SLOT
|--------------------------------------------------------------------------
*/

async function insertClassBooks(client, classSlotId, bookIds) {
  if (!bookIds || bookIds.length === 0) {
    return;
  }

  for (const bookId of bookIds) {
    await client.query(
      `
        INSERT INTO class_slot_books (
          class_slot_id,
          book_id
        )
        VALUES ($1, $2)
      `,
      [classSlotId, bookId],
    );
  }
}

/*
|--------------------------------------------------------------------------
| CREATE CLASS SLOT
|--------------------------------------------------------------------------
*/

router.post(
  "/",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const { subject_id, teacher_id, start_time, end_time, book_ids } = req.body;

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

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const teacher = await client.query(
        `
          SELECT
            id,
            full_name
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
          INSERT INTO class_slots (
            subject_id,
            teacher_id,
            start_time,
            end_time,
            is_active
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            TRUE
          )
          RETURNING *
        `,
        [subject_id, teacher_id, start_time, end_time],
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

/*
|--------------------------------------------------------------------------
| UPDATE CLASS SLOT
|--------------------------------------------------------------------------
|
| If book_ids is supplied:
|   The existing book selection is completely replaced.
|
| If book_ids is omitted:
|   Existing book selection is preserved.
|
*/

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

      const finalSubjectId =
        subject_id !== undefined ? subject_id : current.subject_id;

      const finalTeacherId =
        teacher_id !== undefined ? teacher_id : current.teacher_id;

      const finalStartTime =
        start_time !== undefined ? start_time : current.start_time;

      const finalEndTime = end_time !== undefined ? end_time : current.end_time;

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

      const updated = await client.query(
        `
          UPDATE class_slots
          SET
            subject_id = $1,
            teacher_id = $2,
            start_time = $3,
            end_time = $4,
            is_active = COALESCE($5, is_active)
          WHERE id = $6
          RETURNING *
        `,
        [
          finalSubjectId,
          finalTeacherId,
          finalStartTime,
          finalEndTime,
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

/*
|--------------------------------------------------------------------------
| DEACTIVATE CLASS SLOT
|--------------------------------------------------------------------------
|
| We do not physically delete the class slot.
| This preserves historical relationships such as attendance/enrollment.
|
*/

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

    res.json({
      ok: true,
    });
  }),
);

/*
|--------------------------------------------------------------------------
| GET STUDENTS IN CLASS SLOT
|--------------------------------------------------------------------------
*/

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

/*
|--------------------------------------------------------------------------
| ENROLL STUDENT INTO CLASS SLOT
|--------------------------------------------------------------------------
*/

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
        SELECT id
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

    const r = await query(
      `
        INSERT INTO student_enrollments (
          student_id,
          class_slot_id
        )
        VALUES ($1, $2)

        ON CONFLICT (student_id, class_slot_id)
        DO UPDATE SET
          is_active = TRUE

        RETURNING *
      `,
      [student_id, req.params.id],
    );

    res.status(201).json(r.rows[0]);
  }),
);

/*
|--------------------------------------------------------------------------
| REMOVE STUDENT FROM CLASS SLOT
|--------------------------------------------------------------------------
*/

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

    res.json({
      ok: true,
    });
  }),
);

module.exports = router;
