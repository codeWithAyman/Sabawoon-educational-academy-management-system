const express = require("express");

const router = express.Router();

const { query } = require("../db/pool");
const { authRequired, requireRoles } = require("../middleware/auth");

function asyncH(handler) {
  return (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);
}

function normalizeId(value) {
  const number = Number(value);

  return Number.isInteger(number) ? number : null;
}

function normalizeBooks(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((book) => ({
      id: book?.id === null || book?.id === undefined ? null : Number(book.id),
      name: typeof book?.name === "string" ? book.name.trim() : "",
    }))
    .filter((book) => book.name);
}

/*
|--------------------------------------------------------------------------
| CLASS SLOT HELPER
|--------------------------------------------------------------------------
*/

async function getClassSlot(classSlotId, activeOnly = false) {
  const result = await query(
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

        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', sb.id,
                'name', sb.name
              )
              ORDER BY sb.name
            )
            FROM class_slot_books csb
            JOIN subject_books sb
              ON sb.id = csb.book_id
            WHERE csb.class_slot_id = cs.id
          ),
          '[]'::json
        ) AS books,

        (
          SELECT COUNT(*)
          FROM student_enrollments se
          WHERE se.class_slot_id = cs.id
            AND se.is_active = TRUE
        ) AS student_count

      FROM class_slots cs

      LEFT JOIN subjects s
        ON s.id = cs.subject_id

      LEFT JOIN teachers t
        ON t.id = cs.teacher_id

      WHERE cs.id = $1
      ${activeOnly ? "AND cs.is_active = TRUE" : ""}

      LIMIT 1
    `,
    [classSlotId],
  );

  if (!result.rows.length) {
    return null;
  }

  const row = result.rows[0];

  return {
    ...row,

    id: Number(row.id),

    subject_id:
      row.subject_id === null || row.subject_id === undefined
        ? null
        : Number(row.subject_id),

    teacher_id:
      row.teacher_id === null || row.teacher_id === undefined
        ? null
        : Number(row.teacher_id),

    student_count: Number(row.student_count || 0),

    books: normalizeBooks(row.books),
  };
}

/*
|--------------------------------------------------------------------------
| EXAM HELPER
|--------------------------------------------------------------------------
*/

async function getExam(examId) {
  const result = await query(
    `
      SELECT
        e.id,
        e.name,
        e.class_slot_id,
        e.exam_date,
        e.total_marks,
        e.academic_year,
        e.created_by,
        e.is_published,
        e.created_at,

        cs.subject_id,
        s.name AS subject_name,
        s.code AS subject_code,

        cs.teacher_id,
        t.full_name AS teacher_name,

        cs.start_time,
        cs.end_time,
        cs.level,
        cs.is_active,

        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', sb.id,
                'name', sb.name
              )
              ORDER BY sb.name
            )
            FROM class_slot_books csb
            JOIN subject_books sb
              ON sb.id = csb.book_id
            WHERE csb.class_slot_id = cs.id
          ),
          '[]'::json
        ) AS books

      FROM exams e

      JOIN class_slots cs
        ON cs.id = e.class_slot_id

      LEFT JOIN subjects s
        ON s.id = cs.subject_id

      LEFT JOIN teachers t
        ON t.id = cs.teacher_id

      WHERE e.id = $1

      LIMIT 1
    `,
    [examId],
  );

  if (!result.rows.length) {
    return null;
  }

  const row = result.rows[0];

  return {
    ...row,

    id: Number(row.id),

    class_slot_id: Number(row.class_slot_id),

    subject_id:
      row.subject_id === null || row.subject_id === undefined
        ? null
        : Number(row.subject_id),

    teacher_id:
      row.teacher_id === null || row.teacher_id === undefined
        ? null
        : Number(row.teacher_id),

    total_marks: Number(row.total_marks || 0),

    books: normalizeBooks(row.books),
  };
}

/*
|--------------------------------------------------------------------------
| ACTIVE CLASS ASSIGNMENTS
|--------------------------------------------------------------------------
*/

router.get(
  "/assignments",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const result = await query(`
      SELECT
        cs.id,
        cs.id AS class_slot_id,

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

        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', sb.id,
                'name', sb.name
              )
              ORDER BY sb.name
            )
            FROM class_slot_books csb
            JOIN subject_books sb
              ON sb.id = csb.book_id
            WHERE csb.class_slot_id = cs.id
          ),
          '[]'::json
        ) AS books,

        (
          SELECT COUNT(*)
          FROM student_enrollments se
          WHERE se.class_slot_id = cs.id
            AND se.is_active = TRUE
        ) AS student_count

      FROM class_slots cs

      LEFT JOIN subjects s
        ON s.id = cs.subject_id

      LEFT JOIN teachers t
        ON t.id = cs.teacher_id

      WHERE cs.is_active = TRUE

      ORDER BY
        s.name ASC,
        cs.start_time ASC,
        t.full_name ASC
    `);

    res.json(
      result.rows.map((row) => ({
        ...row,

        id: Number(row.id),

        class_slot_id: Number(row.class_slot_id),

        subject_id:
          row.subject_id === null || row.subject_id === undefined
            ? null
            : Number(row.subject_id),

        teacher_id:
          row.teacher_id === null || row.teacher_id === undefined
            ? null
            : Number(row.teacher_id),

        student_count: Number(row.student_count || 0),

        books: normalizeBooks(row.books),
      })),
    );
  }),
);

/*
|--------------------------------------------------------------------------
| GET ASSESSMENTS
|--------------------------------------------------------------------------
*/

router.get(
  "/assessments",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const classSlotId = req.query.class_slot_id
      ? normalizeId(req.query.class_slot_id)
      : null;

    const subjectId = req.query.subject_id
      ? normalizeId(req.query.subject_id)
      : null;

    const conditions = [];
    const params = [];

    if (classSlotId !== null) {
      params.push(classSlotId);
      conditions.push(`e.class_slot_id = $${params.length}`);
    }

    if (subjectId !== null) {
      params.push(subjectId);
      conditions.push(`cs.subject_id = $${params.length}`);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const result = await query(
      `
        SELECT
          e.id,
          e.name,
          e.class_slot_id,
          e.exam_date,
          e.total_marks,
          e.academic_year,
          e.created_by,
          e.is_published,
          e.created_at,

          cs.subject_id,
          s.name AS subject_name,
          s.code AS subject_code,

          cs.teacher_id,
          t.full_name AS teacher_name,

          cs.start_time,
          cs.end_time,
          cs.level,
          cs.is_active,

          COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'id', sb.id,
                  'name', sb.name
                )
                ORDER BY sb.name
              )
              FROM class_slot_books csb
              JOIN subject_books sb
                ON sb.id = csb.book_id
              WHERE csb.class_slot_id = cs.id
            ),
            '[]'::json
          ) AS books,

          (
            SELECT COUNT(*)
            FROM marks m
            WHERE m.exam_id = e.id
          ) AS score_count

        FROM exams e

        JOIN class_slots cs
          ON cs.id = e.class_slot_id

        LEFT JOIN subjects s
          ON s.id = cs.subject_id

        LEFT JOIN teachers t
          ON t.id = cs.teacher_id

        ${whereClause}

        ORDER BY
          e.exam_date DESC,
          e.id DESC
      `,
      params,
    );

    res.json(
      result.rows.map((row) => ({
        ...row,

        id: Number(row.id),

        class_slot_id: Number(row.class_slot_id),

        subject_id:
          row.subject_id === null || row.subject_id === undefined
            ? null
            : Number(row.subject_id),

        teacher_id:
          row.teacher_id === null || row.teacher_id === undefined
            ? null
            : Number(row.teacher_id),

        total_marks: Number(row.total_marks || 0),

        score_count: Number(row.score_count || 0),

        books: normalizeBooks(row.books),
      })),
    );
  }),
);

/*
|--------------------------------------------------------------------------
| CREATE ASSESSMENT
|--------------------------------------------------------------------------
*/

router.post(
  "/assessments",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const { name, class_slot_id, exam_date, total_marks, is_published } =
      req.body || {};

    const cleanName = typeof name === "string" ? name.trim() : "";

    const classSlotId = normalizeId(class_slot_id);

    const cleanExamDate = typeof exam_date === "string" ? exam_date.trim() : "";

    const numericTotalMarks = Number(total_marks);

    if (!cleanName) {
      return res.status(400).json({
        message: "Assessment name is required.",
      });
    }

    if (classSlotId === null || classSlotId <= 0) {
      return res.status(400).json({
        message: "A valid class is required.",
      });
    }

    if (!cleanExamDate) {
      return res.status(400).json({
        message: "Assessment date is required.",
      });
    }

    if (!Number.isFinite(numericTotalMarks) || numericTotalMarks <= 0) {
      return res.status(400).json({
        message: "Total marks must be greater than zero.",
      });
    }

    const classSlot = await getClassSlot(classSlotId, true);

    if (!classSlot) {
      return res.status(404).json({
        message: "Active class not found.",
      });
    }

    if (
      classSlot.academic_year === null ||
      classSlot.academic_year === undefined
    ) {
      return res.status(400).json({
        message: "The selected class does not have an academic year.",
      });
    }

    const result = await query(
      `
        INSERT INTO exams (
          name,
          class_slot_id,
          exam_date,
          total_marks,
          academic_year,
          created_by,
          is_published
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7
        )
        RETURNING
          id,
          name,
          class_slot_id,
          exam_date,
          total_marks,
          academic_year,
          created_by,
          is_published,
          created_at
      `,
      [
        cleanName,
        classSlotId,
        cleanExamDate,
        numericTotalMarks,
        classSlot.academic_year,
        req.user.id,
        Boolean(is_published),
      ],
    );

    const created = result.rows[0];

    res.status(201).json({
      ...created,

      id: Number(created.id),

      class_slot_id: Number(created.class_slot_id),

      total_marks: Number(created.total_marks),

      subject_id: classSlot.subject_id,

      subject_name: classSlot.subject_name,

      subject_code: classSlot.subject_code,

      teacher_id: classSlot.teacher_id,

      teacher_name: classSlot.teacher_name,

      start_time: classSlot.start_time,

      end_time: classSlot.end_time,

      level: classSlot.level,

      books: classSlot.books,

      student_count: classSlot.student_count,
    });
  }),
);

/*
|--------------------------------------------------------------------------
| GET SCORES
|--------------------------------------------------------------------------
|
| REAL DATABASE FIELD:
|
| marks.marks_obtained
|
| NOT marks.score
|--------------------------------------------------------------------------
*/

router.get(
  "/assessments/:id/scores",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const examId = normalizeId(req.params.id);

    if (examId === null || examId <= 0) {
      return res.status(400).json({
        message: "Invalid assessment ID.",
      });
    }

    const exam = await getExam(examId);

    if (!exam) {
      return res.status(404).json({
        message: "Assessment not found.",
      });
    }

    const result = await query(
      `
        SELECT
          s.id AS student_id,
          s.full_name,
          s.roll_number,

          m.id AS mark_id,

          m.marks_obtained,
          m.grade,
          m.remarks

        FROM students s

        JOIN student_enrollments se
          ON se.student_id = s.id

        LEFT JOIN marks m
          ON m.student_id = s.id
         AND m.exam_id = $1

        WHERE se.class_slot_id = $2
          AND se.is_active = TRUE

        ORDER BY
          s.id ASC
      `,
      [examId, exam.class_slot_id],
    );

    res.json({
      exam: {
        ...exam,

        books: normalizeBooks(exam.books),
      },

      students: result.rows.map((row) => ({
        student_id: Number(row.student_id),

        full_name: row.full_name,

        roll_number: row.roll_number,

        mark_id:
          row.mark_id === null || row.mark_id === undefined
            ? null
            : Number(row.mark_id),

        marks_obtained:
          row.marks_obtained === null || row.marks_obtained === undefined
            ? null
            : Number(row.marks_obtained),

        grade: row.grade ?? null,

        remarks: row.remarks ?? "",
      })),
    });
  }),
);

/*
|--------------------------------------------------------------------------
| UPDATE ASSESSMENT
|--------------------------------------------------------------------------
*/

router.put(
  "/assessments/:id",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const examId = normalizeId(req.params.id);

    if (examId === null || examId <= 0) {
      return res.status(400).json({
        message: "Invalid assessment ID.",
      });
    }

    const existing = await getExam(examId);

    if (!existing) {
      return res.status(404).json({
        message: "Assessment not found.",
      });
    }

    const { name, exam_date, total_marks } = req.body || {};

    const cleanName = typeof name === "string" ? name.trim() : existing.name;

    const cleanDate =
      typeof exam_date === "string" ? exam_date.trim() : existing.exam_date;

    const numericTotalMarks =
      total_marks === undefined
        ? Number(existing.total_marks)
        : Number(total_marks);

    if (!cleanName) {
      return res.status(400).json({
        message: "Assessment name is required.",
      });
    }

    if (!cleanDate) {
      return res.status(400).json({
        message: "Assessment date is required.",
      });
    }

    if (!Number.isFinite(numericTotalMarks) || numericTotalMarks <= 0) {
      return res.status(400).json({
        message: "Total marks must be greater than zero.",
      });
    }

    const result = await query(
      `
        UPDATE exams
        SET
          name = $1,
          exam_date = $2,
          total_marks = $3
        WHERE id = $4
        RETURNING
          id,
          name,
          class_slot_id,
          exam_date,
          total_marks,
          academic_year,
          created_by,
          is_published,
          created_at
      `,
      [cleanName, cleanDate, numericTotalMarks, examId],
    );

    res.json(result.rows[0]);
  }),
);

/*
|--------------------------------------------------------------------------
| SAVE SCORES
|--------------------------------------------------------------------------
*/

router.put(
  "/assessments/:id/scores",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const examId = normalizeId(req.params.id);

    if (examId === null || examId <= 0) {
      return res.status(400).json({
        message: "Invalid assessment ID.",
      });
    }

    const exam = await getExam(examId);

    if (!exam) {
      return res.status(404).json({
        message: "Assessment not found.",
      });
    }

    const scores = Array.isArray(req.body?.scores) ? req.body.scores : [];

    if (!scores.length) {
      return res.status(400).json({
        message: "No scores were provided.",
      });
    }

    /*
     * Validate all scores first.
     */
    for (const item of scores) {
      const studentId = normalizeId(item?.student_id);

      if (studentId === null || studentId < 0) {
        return res.status(400).json({
          message: "Invalid student ID.",
        });
      }

      const marksValue = item?.marks_obtained;

      if (
        marksValue === null ||
        marksValue === undefined ||
        marksValue === ""
      ) {
        continue;
      }

      const numericMarks = Number(marksValue);

      if (!Number.isFinite(numericMarks)) {
        return res.status(400).json({
          message: `Invalid score for student ${studentId}.`,
        });
      }

      if (numericMarks < 0 || numericMarks > Number(exam.total_marks)) {
        return res.status(400).json({
          message:
            `Score for student ${studentId} must be between ` +
            `0 and ${exam.total_marks}.`,
        });
      }
    }

    /*
     * Verify students belong to this class.
     */
    for (const item of scores) {
      const studentId = normalizeId(item?.student_id);

      const enrollment = await query(
        `
          SELECT 1
          FROM student_enrollments
          WHERE student_id = $1
            AND class_slot_id = $2
            AND is_active = TRUE
          LIMIT 1
        `,
        [studentId, exam.class_slot_id],
      );

      if (!enrollment.rows.length) {
        return res.status(400).json({
          message:
            `Student ${studentId} is not actively enrolled ` + `in this class.`,
        });
      }
    }

    /*
     * Save marks.
     *
     * IMPORTANT:
     * marks_obtained is the real column.
     */
    for (const item of scores) {
      const studentId = normalizeId(item.student_id);

      const marksValue = item.marks_obtained;

      const numericMarks =
        marksValue === null || marksValue === undefined || marksValue === ""
          ? null
          : Number(marksValue);

      const grade =
        item.grade === null || item.grade === undefined || item.grade === ""
          ? null
          : String(item.grade).trim();

      const remarks =
        item.remarks === null || item.remarks === undefined
          ? null
          : String(item.remarks).trim();

      await query(
        `
          INSERT INTO marks (
            student_id,
            exam_id,
            marks_obtained,
            grade,
            remarks
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5
          )

          ON CONFLICT (
            student_id,
            exam_id
          )

          DO UPDATE SET
            marks_obtained =
              EXCLUDED.marks_obtained,

            grade =
              EXCLUDED.grade,

            remarks =
              EXCLUDED.remarks
        `,
        [studentId, examId, numericMarks, grade, remarks],
      );
    }

    res.json({
      ok: true,
      message: "Scores saved successfully.",
    });
  }),
);

/*
|--------------------------------------------------------------------------
| DELETE ASSESSMENT
|--------------------------------------------------------------------------
*/

router.delete(
  "/assessments/:id",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const examId = normalizeId(req.params.id);

    if (examId === null || examId <= 0) {
      return res.status(400).json({
        message: "Invalid assessment ID.",
      });
    }

    const existing = await getExam(examId);

    if (!existing) {
      return res.status(404).json({
        message: "Assessment not found.",
      });
    }

    await query(
      `
        DELETE FROM marks
        WHERE exam_id = $1
      `,
      [examId],
    );

    await query(
      `
        DELETE FROM exams
        WHERE id = $1
      `,
      [examId],
    );

    res.json({
      ok: true,
      message: "Assessment deleted successfully.",
    });
  }),
);

module.exports = router;
