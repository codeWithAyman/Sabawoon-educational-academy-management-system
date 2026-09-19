const express = require("express");

const router = express.Router();

const { query } = require("../db/pool");
const { authRequired, requireRoles } = require("../middleware/auth");

const asyncH = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

async function getTimetableRows(classSlotId = null) {
  const values = [];
  let where = "WHERE cs.is_active = TRUE";

  if (classSlotId !== null) {
    values.push(classSlotId);
    where += ` AND cs.id = $${values.length}`;
  }

  const result = await query(
    `
      SELECT
        cs.id,

        cs.subject_id,
        s.name AS subject_name,
        s.code AS subject_code,

        cs.teacher_id,
        t.full_name AS teacher_name,

        cs.start_time AS class_start_time,
        cs.end_time AS class_end_time,

        cs.comments,

        tt.id AS timetable_id,
        tt.day_of_week,

        COALESCE(tt.start_time, cs.start_time) AS timetable_start_time,
        COALESCE(tt.end_time, cs.end_time) AS timetable_end_time,

        tt.room,

        CASE
          WHEN tt.id IS NULL THEN FALSE
          ELSE TRUE
        END AS has_timetable_entry,

        cs.is_active,
        cs.created_at,

        COALESCE(
          (
            SELECT COUNT(*)
            FROM student_enrollments se
            WHERE se.class_slot_id = cs.id
              AND se.is_active = TRUE
          ),
          0
        )::INTEGER AS student_count,

        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', b.id,
                'name', b.name
              )
              ORDER BY b.name
            )
            FROM class_slot_books cb
            INNER JOIN subject_books b
              ON b.id = cb.book_id
            WHERE cb.class_slot_id = cs.id
          ),
          '[]'::json
        ) AS books

      FROM class_slots cs

      INNER JOIN subjects s
        ON s.id = cs.subject_id

      INNER JOIN teachers t
        ON t.id = cs.teacher_id

      LEFT JOIN timetable tt
        ON tt.class_slot_id = cs.id

      ${where}

      ORDER BY
        CASE
          WHEN tt.id IS NULL THEN 99
          WHEN LOWER(tt.day_of_week) = 'monday' THEN 1
          WHEN LOWER(tt.day_of_week) = 'tuesday' THEN 2
          WHEN LOWER(tt.day_of_week) = 'wednesday' THEN 3
          WHEN LOWER(tt.day_of_week) = 'thursday' THEN 4
          WHEN LOWER(tt.day_of_week) = 'friday' THEN 5
          WHEN LOWER(tt.day_of_week) = 'saturday' THEN 6
          WHEN LOWER(tt.day_of_week) = 'sunday' THEN 7
          ELSE 98
        END,

        COALESCE(tt.start_time, cs.start_time),

        s.name,

        t.full_name
    `,
    values,
  );

  return result.rows;
}

/*
 * GET /api/timetable
 *
 * Returns every active class from class_slots.
 *
 * If a timetable record exists:
 *   - day_of_week comes from timetable
 *   - room comes from timetable
 *   - time comes from timetable
 *
 * If no timetable record exists:
 *   - the class still appears
 *   - day/room are null
 *   - class time comes from class_slots
 */
router.get(
  "/",
  authRequired,
  asyncH(async (req, res) => {
    const rows = await getTimetableRows();

    res.json(rows);
  }),
);

/*
 * GET /api/timetable/class/:classSlotId
 */
router.get(
  "/class/:classSlotId",
  authRequired,
  asyncH(async (req, res) => {
    const classSlotId = Number(req.params.classSlotId);

    if (!Number.isInteger(classSlotId) || classSlotId <= 0) {
      return res.status(400).json({
        message: "Invalid class slot ID.",
      });
    }

    const rows = await getTimetableRows(classSlotId);

    if (!rows.length) {
      return res.status(404).json({
        message: "Active class not found.",
      });
    }

    res.json(rows[0]);
  }),
);

/*
 * PUT /api/timetable/class/:classSlotId/comments
 *
 * Comments belong to class_slots, not timetable.
 */
router.put(
  "/class/:classSlotId/comments",
  authRequired,
  requireRoles("admin", "teacher"),
  asyncH(async (req, res) => {
    const classSlotId = Number(req.params.classSlotId);

    if (!Number.isInteger(classSlotId) || classSlotId <= 0) {
      return res.status(400).json({
        message: "Invalid class slot ID.",
      });
    }

    const comments =
      typeof req.body?.comments === "string" ? req.body.comments.trim() : "";

    if (comments.length > 5000) {
      return res.status(400).json({
        message: "Comments cannot exceed 5000 characters.",
      });
    }

    const result = await query(
      `
        UPDATE class_slots
        SET comments = $1
        WHERE id = $2
          AND is_active = TRUE
        RETURNING
          id,
          comments
      `,
      [comments || null, classSlotId],
    );

    if (!result.rows.length) {
      return res.status(404).json({
        message: "Active class not found.",
      });
    }

    res.json({
      message: "Comment saved.",
      id: result.rows[0].id,
      comments: result.rows[0].comments,
    });
  }),
);

module.exports = router;
