const express = require("express");
const { query } = require("../db/pool");
const { authRequired, requireRoles } = require("../middleware/auth");
const { asyncH } = require("../utils/helpers");

const router = express.Router();

/*
  Helper:
  Get an assignment with its class slot, subject and teacher.
*/
async function getAssignment(id) {
  const result = await query(
    `SELECT
       a.id,
       a.title,
       a.description,
       a.class_slot_id,
       a.teacher_id,
       a.due_date,
       a.file_path,
       a.created_at,

       cs.subject_id,
       s.name AS subject_name,
       s.code AS subject_code,
       cs.start_time,
       cs.end_time,

       t.full_name AS teacher_name

     FROM assignments a

     LEFT JOIN class_slots cs
       ON cs.id = a.class_slot_id

     LEFT JOIN subjects s
       ON s.id = cs.subject_id

     LEFT JOIN teachers t
       ON t.id = a.teacher_id

     WHERE a.id = $1`,
    [id],
  );

  return result.rows[0] || null;
}

/*
  GET /api/assignments

  Admin:
    See all assignments.

  Optional:
    ?class_slot_id=1
*/
router.get(
  "/",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const { class_slot_id } = req.query;

    const conditions = [];
    const params = [];

    if (class_slot_id) {
      params.push(class_slot_id);
      conditions.push(`a.class_slot_id = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `SELECT
         a.id,
         a.title,
         a.description,
         a.class_slot_id,
         a.teacher_id,
         a.due_date,
         a.file_path,
         a.created_at,

         cs.subject_id,
         s.name AS subject_name,
         s.code AS subject_code,
         cs.start_time,
         cs.end_time,

         t.full_name AS teacher_name

       FROM assignments a

       LEFT JOIN class_slots cs
         ON cs.id = a.class_slot_id

       LEFT JOIN subjects s
         ON s.id = cs.subject_id

       LEFT JOIN teachers t
         ON t.id = a.teacher_id

       ${where}

       ORDER BY
         a.due_date ASC NULLS LAST,
         a.created_at DESC,
         a.id DESC`,
      params,
    );

    res.json(result.rows);
  }),
);

/*
  GET /api/assignments/:id

  Get one assignment.
*/
router.get(
  "/:id([0-9]+)",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const assignment = await getAssignment(req.params.id);

    if (!assignment) {
      return res.status(404).json({
        error: "Assignment not found",
      });
    }

    res.json(assignment);
  }),
);

/*
  POST /api/assignments

  Create an assignment.

  Body:
  {
    title,
    description,
    class_slot_id,
    due_date,
    file_path
  }

  Admin only.
*/
router.post(
  "/",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const { title, description, class_slot_id, due_date, file_path } = req.body;

    if (!title || !class_slot_id) {
      return res.status(400).json({
        error: "Title and class slot are required",
      });
    }

    const slotResult = await query(
      `SELECT
         cs.id,
         cs.teacher_id,
         cs.subject_id,
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

    const result = await query(
      `INSERT INTO assignments
       (
         title,
         description,
         class_slot_id,
         teacher_id,
         due_date,
         file_path
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        String(title).trim(),
        description || null,
        class_slot_id,
        slot.teacher_id,
        due_date || null,
        file_path || null,
      ],
    );

    res.status(201).json(result.rows[0]);
  }),
);

/*
  PUT /api/assignments/:id

  Update assignment.

  Admin only.
*/
router.put(
  "/:id([0-9]+)",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const { title, description, due_date, file_path } = req.body;

    const assignment = await getAssignment(req.params.id);

    if (!assignment) {
      return res.status(404).json({
        error: "Assignment not found",
      });
    }

    if (title !== undefined && !String(title).trim()) {
      return res.status(400).json({
        error: "Title cannot be empty",
      });
    }

    const result = await query(
      `UPDATE assignments
       SET
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         due_date = COALESCE($3, due_date),
         file_path = COALESCE($4, file_path)
       WHERE id = $5
       RETURNING *`,
      [
        title !== undefined ? String(title).trim() : null,
        description !== undefined ? description : null,
        due_date !== undefined ? due_date : null,
        file_path !== undefined ? file_path : null,
        req.params.id,
      ],
    );

    res.json(result.rows[0]);
  }),
);

/*
  DELETE /api/assignments/:id

  Admin only.
*/
router.delete(
  "/:id([0-9]+)",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const assignment = await getAssignment(req.params.id);

    if (!assignment) {
      return res.status(404).json({
        error: "Assignment not found",
      });
    }

    await query(
      `DELETE FROM assignments
       WHERE id = $1`,
      [req.params.id],
    );

    res.json({
      ok: true,
      message: "Assignment deleted successfully",
    });
  }),
);

module.exports = router;
