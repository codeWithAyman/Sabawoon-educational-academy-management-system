const express = require("express");
const { query } = require("../db/pool");
const { authRequired, requireRoles } = require("../middleware/auth");
const { asyncH } = require("../utils/helpers");

const router = express.Router();

/*
  Helper:
  Get an assessment together with its class slot and teacher.
*/
async function getExam(examId) {
  const result = await query(
    `SELECT
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
       cs.end_time
     FROM exams e
     JOIN class_slots cs
       ON cs.id = e.class_slot_id
     JOIN subjects s
       ON s.id = cs.subject_id
     JOIN teachers t
       ON t.id = cs.teacher_id
     WHERE e.id = $1`,
    [examId],
  );

  return result.rows[0] || null;
}

/*
  GET /api/marks/assignments

  Returns available active class slots for assessments.
  Admin only because teachers no longer have accounts.
*/
router.get(
  "/assignments",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const result = await query(
      `SELECT
         cs.id AS class_slot_id,
         cs.subject_id,
         s.name AS subject_name,
         s.code AS subject_code,
         cs.teacher_id,
         t.full_name AS teacher_name,
         cs.start_time,
         cs.end_time,
         COUNT(se.id)::int AS student_count
       FROM class_slots cs
       JOIN subjects s
         ON s.id = cs.subject_id
       JOIN teachers t
         ON t.id = cs.teacher_id
       LEFT JOIN student_enrollments se
         ON se.class_slot_id = cs.id
        AND se.is_active = TRUE
       WHERE cs.is_active = TRUE
       GROUP BY
         cs.id,
         cs.subject_id,
         s.name,
         s.code,
         cs.teacher_id,
         t.full_name,
         cs.start_time,
         cs.end_time
       ORDER BY s.name, cs.start_time`,
    );

    res.json(result.rows);
  }),
);

/*
  GET /api/marks/assessments

  List assessments.
*/
router.get(
  "/assessments",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const { class_slot_id, subject_id } = req.query;

    const conditions = [];
    const params = [];

    if (class_slot_id) {
      params.push(class_slot_id);
      conditions.push(`e.class_slot_id = $${params.length}`);
    }

    if (subject_id) {
      params.push(subject_id);
      conditions.push(`cs.subject_id = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `SELECT
         e.id,
         e.name,
         e.class_slot_id,
         cs.subject_id,
         s.name AS subject_name,
         s.code AS subject_code,
         cs.teacher_id,
         t.full_name AS teacher_name,
         cs.start_time,
         cs.end_time,
         e.exam_date,
         e.total_marks,
         e.academic_year,
         e.created_by,
         e.is_published,
         e.created_at,
         COUNT(m.id)::int AS score_count
       FROM exams e
       JOIN class_slots cs
         ON cs.id = e.class_slot_id
       JOIN subjects s
         ON s.id = cs.subject_id
       JOIN teachers t
         ON t.id = cs.teacher_id
       LEFT JOIN marks m
         ON m.exam_id = e.id
       ${where}
       GROUP BY
         e.id,
         cs.subject_id,
         s.name,
         s.code,
         cs.teacher_id,
         t.full_name,
         cs.start_time,
         cs.end_time
       ORDER BY e.exam_date DESC, e.id DESC`,
      params,
    );

    res.json(result.rows);
  }),
);

/*
  POST /api/marks/assessments

  Create an assessment for a class slot.
*/
router.post(
  "/assessments",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const {
      name,
      class_slot_id,
      exam_date,
      total_marks,
      academic_year,
      is_published,
    } = req.body;

    if (
      !name ||
      !class_slot_id ||
      !exam_date ||
      total_marks === undefined ||
      total_marks === null
    ) {
      return res.status(400).json({
        error:
          "Assessment name, class slot, date and maximum marks are required",
      });
    }

    const slotResult = await query(
      `SELECT
         cs.id,
         cs.subject_id,
         cs.teacher_id,
         cs.is_active,
         s.name AS subject_name
       FROM class_slots cs
       JOIN subjects s
         ON s.id = cs.subject_id
       WHERE cs.id = $1`,
      [class_slot_id],
    );

    if (!slotResult.rows.length) {
      return res.status(404).json({
        error: "Class slot not found",
      });
    }

    const slot = slotResult.rows[0];

    if (!slot.is_active) {
      return res.status(400).json({
        error: "This class slot is inactive",
      });
    }

    if (Number(total_marks) <= 0) {
      return res.status(400).json({
        error: "Maximum marks must be greater than zero",
      });
    }

    const result = await query(
      `INSERT INTO exams
       (
         name,
         class_slot_id,
         exam_date,
         total_marks,
         academic_year,
         created_by,
         is_published
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        name,
        class_slot_id,
        exam_date,
        total_marks,
        academic_year || null,
        req.user.id,
        Boolean(is_published),
      ],
    );

    res.status(201).json(result.rows[0]);
  }),
);

/*
  GET /api/marks/assessments/:id/scores

  Get all students enrolled in the assessment's class slot,
  together with their marks if already entered.
*/
router.get(
  "/assessments/:id/scores",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const exam = await getExam(req.params.id);

    if (!exam) {
      return res.status(404).json({
        error: "Assessment not found",
      });
    }

    const result = await query(
      `SELECT
         s.id AS student_id,
         s.roll_number,
         s.guardian_name,
         s.guardian_phone,
         se.enrolled_on,
         m.id AS mark_id,
         m.marks_obtained,
         m.grade,
         m.remarks
       FROM student_enrollments se
       JOIN students s
         ON s.id = se.student_id
       LEFT JOIN marks m
         ON m.student_id = s.id
        AND m.exam_id = $1
       WHERE se.class_slot_id = $2
         AND se.is_active = TRUE
       ORDER BY s.roll_number`,
      [req.params.id, exam.class_slot_id],
    );

    res.json({
      assessment: exam,
      students: result.rows,
    });
  }),
);

/*
  PUT /api/marks/assessments/:id

  Update assessment information.
*/
router.put(
  "/assessments/:id",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const { name, exam_date, total_marks, academic_year, is_published } =
      req.body;

    const exam = await getExam(req.params.id);

    if (!exam) {
      return res.status(404).json({
        error: "Assessment not found",
      });
    }

    if (
      total_marks !== undefined &&
      total_marks !== null &&
      Number(total_marks) <= 0
    ) {
      return res.status(400).json({
        error: "Maximum marks must be greater than zero",
      });
    }

    const result = await query(
      `UPDATE exams
       SET
         name = COALESCE($1, name),
         exam_date = COALESCE($2, exam_date),
         total_marks = COALESCE($3, total_marks),
         academic_year = COALESCE($4, academic_year),
         is_published = COALESCE($5, is_published)
       WHERE id = $6
       RETURNING *`,
      [
        name || null,
        exam_date || null,
        total_marks !== undefined ? total_marks : null,
        academic_year !== undefined ? academic_year : null,
        is_published !== undefined ? Boolean(is_published) : null,
        req.params.id,
      ],
    );

    res.json(result.rows[0]);
  }),
);

/*
  PUT /api/marks/assessments/:id/scores

  Save marks for multiple students.
*/
router.put(
  "/assessments/:id/scores",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const { scores } = req.body;

    if (!Array.isArray(scores)) {
      return res.status(400).json({
        error: "scores must be an array",
      });
    }

    const exam = await getExam(req.params.id);

    if (!exam) {
      return res.status(404).json({
        error: "Assessment not found",
      });
    }

    for (const score of scores) {
      if (
        !score.student_id ||
        score.marks_obtained === undefined ||
        score.marks_obtained === null
      ) {
        return res.status(400).json({
          error: "Each score requires student_id and marks_obtained",
        });
      }

      const obtained = Number(score.marks_obtained);
      const total = Number(exam.total_marks);

      if (!Number.isFinite(obtained)) {
        return res.status(400).json({
          error: `Invalid score for student ${score.student_id}`,
        });
      }

      if (obtained < 0 || obtained > total) {
        return res.status(400).json({
          error: `Score for student ${score.student_id} must be between 0 and ${total}`,
        });
      }

      const enrollment = await query(
        `SELECT id
         FROM student_enrollments
         WHERE student_id = $1
           AND class_slot_id = $2
           AND is_active = TRUE`,
        [score.student_id, exam.class_slot_id],
      );

      if (!enrollment.rows.length) {
        return res.status(400).json({
          error: `Student ${score.student_id} is not enrolled in this class`,
        });
      }

      await query(
        `INSERT INTO marks
         (
           student_id,
           exam_id,
           marks_obtained,
           grade,
           remarks
         )
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (student_id, exam_id)
         DO UPDATE SET
           marks_obtained = EXCLUDED.marks_obtained,
           grade = EXCLUDED.grade,
           remarks = EXCLUDED.remarks`,
        [
          score.student_id,
          req.params.id,
          obtained,
          score.grade || null,
          score.remarks || null,
        ],
      );
    }

    res.json({
      ok: true,
      message: "Scores saved successfully",
    });
  }),
);

/*
  DELETE /api/marks/assessments/:id

  Admin only.
*/
router.delete(
  "/assessments/:id",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const exam = await getExam(req.params.id);

    if (!exam) {
      return res.status(404).json({
        error: "Assessment not found",
      });
    }

    await query(
      `DELETE FROM exams
       WHERE id = $1`,
      [req.params.id],
    );

    res.json({
      ok: true,
      message: "Assessment deleted successfully",
    });
  }),
);

module.exports = router;
