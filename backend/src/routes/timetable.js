const express = require("express");
const { query } = require("../db/pool");
const { authRequired, requireRoles } = require("../middleware/auth");
const { asyncH } = require("../utils/helpers");

const router = express.Router();

const DAY_ORDER = `
  CASE t.day_of_week
    WHEN 'Monday' THEN 1
    WHEN 'Tuesday' THEN 2
    WHEN 'Wednesday' THEN 3
    WHEN 'Thursday' THEN 4
    WHEN 'Friday' THEN 5
    WHEN 'Saturday' THEN 6
    WHEN 'Sunday' THEN 7
    ELSE 8
  END
`;

/*
  TIMETABLE
  ----------
  Timetable entries are separate schedule records.

  Current class-slot rules:
  - No days stored on class_slots.
  - No room stored on class_slots.
  - No academic year stored on class_slots.
  - Teachers are records in the teachers table.
  - Teachers do not have login accounts.

  Current application login roles:
  - admin
  - attendance

  Therefore timetable management is currently admin-only.
*/

/*
  GET /api/timetable

  Returns timetable entries joined with:
  - subject
  - teacher
  - class slot

  Optional filters:
    ?day_of_week=Monday
    ?class_slot_id=1
*/
router.get(
  "/",
  authRequired,
  asyncH(async (req, res) => {
    const { day_of_week, class_slot_id } = req.query;

    const conditions = [];
    const params = [];

    if (day_of_week) {
      params.push(day_of_week);
      conditions.push(`t.day_of_week = $${params.length}`);
    }

    if (class_slot_id) {
      params.push(class_slot_id);
      conditions.push(`t.class_slot_id = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `SELECT
         t.id,
         t.class_slot_id,
         t.day_of_week,
         t.start_time,
         t.end_time,

         cs.subject_id,
         s.name AS subject_name,
         s.code AS subject_code,

         cs.teacher_id,
         teachers.full_name AS teacher_name,

         cs.start_time AS class_slot_start_time,
         cs.end_time AS class_slot_end_time,
         cs.is_active AS class_slot_active

       FROM timetable t

       JOIN class_slots cs
         ON cs.id = t.class_slot_id

       JOIN subjects s
         ON s.id = cs.subject_id

       JOIN teachers
         ON teachers.id = cs.teacher_id

       ${where}

       ORDER BY
         ${DAY_ORDER},
         t.start_time,
         t.id`,
      params,
    );

    res.json(result.rows);
  }),
);

/*
  GET /api/timetable/class/:classSlotId

  Get the complete timetable for one class slot.
*/
router.get(
  "/class/:classSlotId([0-9]+)",
  authRequired,
  asyncH(async (req, res) => {
    const slotResult = await query(
      `SELECT
         cs.id,
         cs.subject_id,
         s.name AS subject_name,
         s.code AS subject_code,

         cs.teacher_id,
         teachers.full_name AS teacher_name,

         cs.start_time,
         cs.end_time,
         cs.is_active

       FROM class_slots cs

       JOIN subjects s
         ON s.id = cs.subject_id

       JOIN teachers
         ON teachers.id = cs.teacher_id

       WHERE cs.id = $1`,
      [req.params.classSlotId],
    );

    if (!slotResult.rows.length) {
      return res.status(404).json({
        error: "Class slot not found",
      });
    }

    const slot = slotResult.rows[0];

    const timetableResult = await query(
      `SELECT
         id,
         class_slot_id,
         day_of_week,
         start_time,
         end_time
       FROM timetable
       WHERE class_slot_id = $1
       ORDER BY
         ${DAY_ORDER},
         start_time,
         id`,
      [req.params.classSlotId],
    );

    res.json({
      class_slot: slot,
      timetable: timetableResult.rows,
    });
  }),
);

/*
  POST /api/timetable

  Creates one timetable entry.

  Body:
  {
    class_slot_id,
    day_of_week,
    start_time,
    end_time
  }

  Admin only.
*/
router.post(
  "/",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const { class_slot_id, day_of_week, start_time, end_time } = req.body;

    if (!class_slot_id || !day_of_week || !start_time || !end_time) {
      return res.status(400).json({
        error: "Class slot, day, start time and end time are required",
      });
    }

    const validDays = [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Saturday",
      "Sunday",
    ];

    if (!validDays.includes(day_of_week)) {
      return res.status(400).json({
        error: "Invalid day of week. Friday is not available.",
      });
    }

    const slotResult = await query(
      `SELECT
         id,
         start_time AS slot_start_time,
         end_time AS slot_end_time,
         is_active
       FROM class_slots
       WHERE id = $1`,
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

    if (end_time <= start_time) {
      return res.status(400).json({
        error: "End time must be after start time",
      });
    }

    const result = await query(
      `INSERT INTO timetable
       (
         class_slot_id,
         day_of_week,
         start_time,
         end_time
       )
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [class_slot_id, day_of_week, start_time, end_time],
    );

    res.status(201).json(result.rows[0]);
  }),
);

/*
  PUT /api/timetable/:id

  Update timetable entry.

  Admin only.
*/
router.put(
  "/:id([0-9]+)",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const existingResult = await query(
      `SELECT *
       FROM timetable
       WHERE id = $1`,
      [req.params.id],
    );

    if (!existingResult.rows.length) {
      return res.status(404).json({
        error: "Timetable entry not found",
      });
    }

    const existing = existingResult.rows[0];

    const { day_of_week, start_time, end_time } = req.body;

    const newDay = day_of_week ?? existing.day_of_week;
    const newStart = start_time ?? existing.start_time;
    const newEnd = end_time ?? existing.end_time;

    const validDays = [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Saturday",
      "Sunday",
    ];

    if (!validDays.includes(newDay)) {
      return res.status(400).json({
        error: "Invalid day of week. Friday is not available.",
      });
    }

    if (newEnd <= newStart) {
      return res.status(400).json({
        error: "End time must be after start time",
      });
    }

    const result = await query(
      `UPDATE timetable
       SET
         day_of_week = $1,
         start_time = $2,
         end_time = $3
       WHERE id = $4
       RETURNING *`,
      [newDay, newStart, newEnd, req.params.id],
    );

    res.json(result.rows[0]);
  }),
);

/*
  DELETE /api/timetable/:id

  Admin only.
*/
router.delete(
  "/:id([0-9]+)",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const existingResult = await query(
      `SELECT id
       FROM timetable
       WHERE id = $1`,
      [req.params.id],
    );

    if (!existingResult.rows.length) {
      return res.status(404).json({
        error: "Timetable entry not found",
      });
    }

    await query(
      `DELETE FROM timetable
       WHERE id = $1`,
      [req.params.id],
    );

    res.json({
      ok: true,
      message: "Timetable entry deleted successfully",
    });
  }),
);

module.exports = router;
