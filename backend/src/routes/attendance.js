const express = require("express");
const { query } = require("../db/pool");
const { authRequired, requireRoles } = require("../middleware/auth");

const router = express.Router();

/*
  ATTENDANCE
  ----------
  Attendance belongs to:
    student + class_slot + date

  Login roles:
    admin      -> full access
    attendance -> view, create and modify attendance

  Teachers:
    - records only
    - no login account
    - teacher information comes from teachers table
*/

// GET /api/attendance
// Optional query:
// ?date=2026-09-13
// ?class_slot_id=1
// ?student_id=1
router.get("/", authRequired, async (req, res, next) => {
  try {
    const { date, class_slot_id, student_id } = req.query;

    const conditions = [];
    const values = [];

    if (date) {
      values.push(date);
      conditions.push(`a.date = $${values.length}`);
    }

    if (class_slot_id) {
      values.push(class_slot_id);
      conditions.push(`a.class_slot_id = $${values.length}`);
    }

    if (student_id) {
      values.push(student_id);
      conditions.push(`a.student_id = $${values.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `
      SELECT
        a.id,
        a.student_id,
        s.roll_number,
        a.class_slot_id,
        sub.id AS subject_id,
        sub.name AS subject_name,
        sub.code AS subject_code,

        cs.teacher_id,
        t.full_name AS teacher_name,

        a.date,
        a.status,
        a.remarks,
        a.marked_by,
        marker.full_name AS marked_by_name,
        marker.role AS marked_by_role,
        a.created_at

      FROM attendance a

      JOIN students s
        ON s.id = a.student_id

      JOIN class_slots cs
        ON cs.id = a.class_slot_id

      JOIN subjects sub
        ON sub.id = cs.subject_id

      JOIN teachers t
        ON t.id = cs.teacher_id

      LEFT JOIN users marker
        ON marker.id = a.marked_by

      ${where}

      ORDER BY
        a.date DESC,
        sub.name,
        s.roll_number
      `,
      values,
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/attendance/class/:classSlotId/students
// Returns all active students enrolled in a class slot.
// Useful for the attendance marking screen.
router.get(
  "/class/:classSlotId([0-9]+)/students",
  authRequired,
  async (req, res, next) => {
    try {
      const classSlot = await query(
        `
        SELECT
          cs.id,
          cs.subject_id,
          sub.name AS subject_name,
          sub.code AS subject_code,

          cs.teacher_id,
          t.full_name AS teacher_name,

          cs.start_time,
          cs.end_time

        FROM class_slots cs

        JOIN subjects sub
          ON sub.id = cs.subject_id

        JOIN teachers t
          ON t.id = cs.teacher_id

        WHERE cs.id = $1
          AND cs.is_active = TRUE
        `,
        [req.params.classSlotId],
      );

      if (!classSlot.rows.length) {
        return res.status(404).json({
          error: "Class slot not found",
        });
      }

      const result = await query(
        `
        SELECT
          se.student_id,
          s.full_name,
          s.roll_number,
          s.guardian_name,
          s.guardian_phone,
          se.enrolled_on

        FROM student_enrollments se

        JOIN students s
          ON s.id = se.student_id

        WHERE se.class_slot_id = $1
          AND se.is_active = TRUE

        ORDER BY s.roll_number
        `,
        [req.params.classSlotId],
      );

      res.json({
        class_slot: classSlot.rows[0],
        students: result.rows,
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/attendance/class/:classSlotId/date/:date
// Returns attendance for one class slot on one date.
router.get(
  "/class/:classSlotId([0-9]+)/date/:date",
  authRequired,
  async (req, res, next) => {
    try {
      const classSlot = await query(
        `
        SELECT
          cs.id,
          cs.subject_id,
          sub.name AS subject_name,
          sub.code AS subject_code,

          cs.teacher_id,
          t.full_name AS teacher_name,

          cs.start_time,
          cs.end_time

        FROM class_slots cs

        JOIN subjects sub
          ON sub.id = cs.subject_id

        JOIN teachers t
          ON t.id = cs.teacher_id

        WHERE cs.id = $1
        `,
        [req.params.classSlotId],
      );

      if (!classSlot.rows.length) {
        return res.status(404).json({
          error: "Class slot not found",
        });
      }

      const result = await query(
        `
        SELECT
          a.id,
          a.student_id,
          s.full_name,
          s.roll_number,
          a.class_slot_id,
          a.date,
          a.status,
          a.remarks,
          a.marked_by,
          marker.full_name AS marked_by_name,
          marker.role AS marked_by_role

        FROM attendance a

        JOIN students s
          ON s.id = a.student_id

        LEFT JOIN users marker
          ON marker.id = a.marked_by

        WHERE a.class_slot_id = $1
          AND a.date = $2

        ORDER BY s.roll_number
        `,
        [req.params.classSlotId, req.params.date],
      );

      res.json({
        class_slot: classSlot.rows[0],
        attendance: result.rows,
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/attendance
// Create one attendance record.
router.post(
  "/",
  authRequired,
  requireRoles("admin", "attendance"),
  async (req, res, next) => {
    try {
      const { student_id, class_slot_id, date, status, remarks } = req.body;

      if (!student_id || !class_slot_id || !date || !status) {
        return res.status(400).json({
          error: "student_id, class_slot_id, date and status are required",
        });
      }

      const validStatuses = ["present", "absent", "late", "leave"];

      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          error: "Invalid attendance status",
        });
      }

      const classSlot = await query(
        `
        SELECT id
        FROM class_slots
        WHERE id = $1
          AND is_active = TRUE
        `,
        [class_slot_id],
      );

      if (!classSlot.rows.length) {
        return res.status(404).json({
          error: "Class slot not found or inactive",
        });
      }

      const enrollment = await query(
        `
        SELECT id
        FROM student_enrollments
        WHERE student_id = $1
          AND class_slot_id = $2
          AND is_active = TRUE
        `,
        [student_id, class_slot_id],
      );

      if (!enrollment.rows.length) {
        return res.status(400).json({
          error: "Student is not enrolled in this class",
        });
      }

      const result = await query(
        `
        INSERT INTO attendance (
          student_id,
          class_slot_id,
          date,
          status,
          remarks,
          marked_by
        )
        VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING *
        `,
        [student_id, class_slot_id, date, status, remarks || null, req.user.id],
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      if (err.code === "23505") {
        return res.status(409).json({
          error:
            "Attendance has already been marked for this student, class and date",
        });
      }

      next(err);
    }
  },
);

// PUT /api/attendance/:id
// Admin and Attendance Account can modify attendance.
router.put(
  "/:id([0-9]+)",
  authRequired,
  requireRoles("admin", "attendance"),
  async (req, res, next) => {
    try {
      const { status, remarks } = req.body;

      const validStatuses = ["present", "absent", "late", "leave"];

      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          error: "Invalid attendance status",
        });
      }

      const existing = await query(
        `
        SELECT
          a.id,
          a.student_id,
          a.class_slot_id
        FROM attendance a
        WHERE a.id = $1
        `,
        [req.params.id],
      );

      if (!existing.rows.length) {
        return res.status(404).json({
          error: "Attendance record not found",
        });
      }

      const result = await query(
        `
        UPDATE attendance
        SET
          status = $1,
          remarks = $2,
          marked_by = $3
        WHERE id = $4
        RETURNING *
        `,
        [status, remarks || null, req.user.id, req.params.id],
      );

      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/attendance/:id
// Admin only.
router.delete(
  "/:id([0-9]+)",
  authRequired,
  requireRoles("admin"),
  async (req, res, next) => {
    try {
      const result = await query(
        `
        DELETE FROM attendance
        WHERE id = $1
        RETURNING id
        `,
        [req.params.id],
      );

      if (!result.rows.length) {
        return res.status(404).json({
          error: "Attendance record not found",
        });
      }

      res.json({
        message: "Attendance deleted successfully",
      });
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
