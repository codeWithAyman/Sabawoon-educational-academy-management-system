const express = require("express");
const { query } = require("../db/pool");
const { authRequired, requireRoles } = require("../middleware/auth");

const router = express.Router();

/*
  STUDENTS
  ----------
  Students are records only.
  They do NOT have login accounts.

  Roles:
  - admin: full CRUD
  - staff: full CRUD
  - teacher: view only
*/

/* =========================================================
   GET /api/students
   Get all students + active class enrollments
   Supports search
   ========================================================= */
router.get("/", authRequired, async (req, res, next) => {
  try {
    const search = String(req.query.search || "").trim();

    const result = await query(
      `
      SELECT
        s.id,
        s.full_name,
        s.phone,
        s.roll_number,
        s.dob,
        s.gender,
        s.blood_group,
        s.address,
        s.guardian_name,
        s.guardian_phone,
        s.guardian_email,
        s.admission_date,

        COALESCE(
          json_agg(
            json_build_object(
              'id', cs.id,
              'class_slot_id', cs.id,
              'subject_id', sub.id,
              'subject_name', sub.name,
              'subject_code', sub.code,
              'teacher_id', cs.teacher_id,
              'teacher_name', t.full_name,
              'start_time', cs.start_time,
              'end_time', cs.end_time,
              'enrollment_id', se.id,
              'enrolled_on', se.enrolled_on,
              'is_active', se.is_active
            )
            ORDER BY cs.start_time, sub.name
          ) FILTER (WHERE cs.id IS NOT NULL),
          '[]'::json
        ) AS enrolled_classes

      FROM students s

      LEFT JOIN student_enrollments se
        ON se.student_id = s.id
       AND se.is_active = TRUE

      LEFT JOIN class_slots cs
        ON cs.id = se.class_slot_id

      LEFT JOIN subjects sub
        ON sub.id = cs.subject_id

      LEFT JOIN teachers t
        ON t.id = cs.teacher_id

      WHERE
        $1 = ''
        OR s.full_name ILIKE '%' || $1 || '%'
        OR s.phone ILIKE '%' || $1 || '%'
        OR s.roll_number ILIKE '%' || $1 || '%'
        OR s.guardian_name ILIKE '%' || $1 || '%'
        OR s.guardian_phone ILIKE '%' || $1 || '%'

      GROUP BY s.id
      ORDER BY s.id DESC
      `,
      [search],
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/* =========================================================
   GET /api/students/:id
   Get one student
   ========================================================= */
router.get("/:id([0-9]+)", authRequired, async (req, res, next) => {
  try {
    const result = await query(
      `
      SELECT
        s.id,
        s.full_name,
        s.phone,
        s.roll_number,
        s.dob,
        s.gender,
        s.blood_group,
        s.address,
        s.guardian_name,
        s.guardian_phone,
        s.guardian_email,
        s.admission_date
      FROM students s
      WHERE s.id = $1
      `,
      [req.params.id],
    );

    if (!result.rows.length) {
      return res.status(404).json({
        error: "Student not found",
      });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/* =========================================================
   GET /api/students/:id/classes
   Get student's class slots
   ========================================================= */
router.get("/:id([0-9]+)/classes", authRequired, async (req, res, next) => {
  try {
    const result = await query(
      `
      SELECT
        se.id AS enrollment_id,
        cs.id AS class_slot_id,
        sub.id AS subject_id,
        sub.name AS subject_name,
        sub.code AS subject_code,
        cs.teacher_id,
        t.full_name AS teacher_name,
        cs.start_time,
        cs.end_time,
        se.enrolled_on,
        se.is_active
      FROM student_enrollments se

      JOIN class_slots cs
        ON cs.id = se.class_slot_id

      JOIN subjects sub
        ON sub.id = cs.subject_id

      JOIN teachers t
        ON t.id = cs.teacher_id

      WHERE se.student_id = $1
        AND se.is_active = TRUE

      ORDER BY cs.start_time, sub.name
      `,
      [req.params.id],
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/* =========================================================
   POST /api/students
   Create student
   ========================================================= */
router.post(
  "/",
  authRequired,
  requireRoles("admin", "staff"),
  async (req, res, next) => {
    try {
      const {
        full_name,
        phone,
        roll_number,
        dob,
        gender,
        blood_group,
        address,
        guardian_name,
        guardian_phone,
        guardian_email,
        admission_date,
      } = req.body;

      if (!full_name || !String(full_name).trim()) {
        return res.status(400).json({
          error: "Student full name is required",
        });
      }

      if (!roll_number || !String(roll_number).trim()) {
        return res.status(400).json({
          error: "Roll number is required",
        });
      }

      const result = await query(
        `
        INSERT INTO students (
          full_name,
          phone,
          roll_number,
          dob,
          gender,
          blood_group,
          address,
          guardian_name,
          guardian_phone,
          guardian_email,
          admission_date
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
        )
        RETURNING *
        `,
        [
          String(full_name).trim(),
          phone ? String(phone).trim() : null,
          String(roll_number).trim(),
          dob || null,
          gender || null,
          blood_group || null,
          address ? String(address).trim() : null,
          guardian_name ? String(guardian_name).trim() : null,
          guardian_phone ? String(guardian_phone).trim() : null,
          guardian_email ? String(guardian_email).trim() : null,
          admission_date || null,
        ],
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      if (err.code === "23505") {
        return res.status(409).json({
          error: "A student with this roll number already exists",
        });
      }

      next(err);
    }
  },
);

/* =========================================================
   PUT /api/students/:id
   Update student
   ========================================================= */
router.put(
  "/:id([0-9]+)",
  authRequired,
  requireRoles("admin", "staff"),
  async (req, res, next) => {
    try {
      const {
        full_name,
        phone,
        roll_number,
        dob,
        gender,
        blood_group,
        address,
        guardian_name,
        guardian_phone,
        guardian_email,
        admission_date,
      } = req.body;

      if (!full_name || !String(full_name).trim()) {
        return res.status(400).json({
          error: "Student full name is required",
        });
      }

      if (!roll_number || !String(roll_number).trim()) {
        return res.status(400).json({
          error: "Roll number is required",
        });
      }

      const result = await query(
        `
        UPDATE students
        SET
          full_name = $1,
          phone = $2,
          roll_number = $3,
          dob = $4,
          gender = $5,
          blood_group = $6,
          address = $7,
          guardian_name = $8,
          guardian_phone = $9,
          guardian_email = $10,
          admission_date = $11
        WHERE id = $12
        RETURNING *
        `,
        [
          String(full_name).trim(),
          phone ? String(phone).trim() : null,
          String(roll_number).trim(),
          dob || null,
          gender || null,
          blood_group || null,
          address ? String(address).trim() : null,
          guardian_name ? String(guardian_name).trim() : null,
          guardian_phone ? String(guardian_phone).trim() : null,
          guardian_email ? String(guardian_email).trim() : null,
          admission_date || null,
          req.params.id,
        ],
      );

      if (!result.rows.length) {
        return res.status(404).json({
          error: "Student not found",
        });
      }

      res.json(result.rows[0]);
    } catch (err) {
      if (err.code === "23505") {
        return res.status(409).json({
          error: "A student with this roll number already exists",
        });
      }

      next(err);
    }
  },
);

/* =========================================================
   DELETE /api/students/:id
   Delete student
   ========================================================= */
router.delete(
  "/:id([0-9]+)",
  authRequired,
  requireRoles("admin"),
  async (req, res, next) => {
    try {
      const result = await query(
        `
        DELETE FROM students
        WHERE id = $1
        RETURNING id, full_name, roll_number
        `,
        [req.params.id],
      );

      if (!result.rows.length) {
        return res.status(404).json({
          error: "Student not found",
        });
      }

      res.json({
        message: "Student deleted successfully",
        student: result.rows[0],
      });
    } catch (err) {
      next(err);
    }
  },
);

/* =========================================================
   POST /api/students/:id/classes
   Enroll student into class slot
   ========================================================= */
router.post(
  "/:id([0-9]+)/classes",
  authRequired,
  requireRoles("admin", "staff"),
  async (req, res, next) => {
    try {
      const { class_slot_id } = req.body;

      if (!class_slot_id) {
        return res.status(400).json({
          error: "class_slot_id is required",
        });
      }

      const student = await query(
        `
        SELECT id
        FROM students
        WHERE id = $1
        `,
        [req.params.id],
      );

      if (!student.rows.length) {
        return res.status(404).json({
          error: "Student not found",
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

      const existing = await query(
        `
        SELECT id, is_active
        FROM student_enrollments
        WHERE student_id = $1
          AND class_slot_id = $2
        `,
        [req.params.id, class_slot_id],
      );

      if (existing.rows.length) {
        const enrollment = existing.rows[0];

        if (enrollment.is_active) {
          return res.status(409).json({
            error: "Student is already enrolled in this class",
          });
        }

        const reactivated = await query(
          `
          UPDATE student_enrollments
          SET
            is_active = TRUE,
            enrolled_on = CURRENT_DATE
          WHERE id = $1
          RETURNING *
          `,
          [enrollment.id],
        );

        return res.status(200).json(reactivated.rows[0]);
      }

      const result = await query(
        `
        INSERT INTO student_enrollments (
          student_id,
          class_slot_id
        )
        VALUES ($1, $2)
        RETURNING *
        `,
        [req.params.id, class_slot_id],
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      if (err.code === "23505") {
        return res.status(409).json({
          error: "Student is already enrolled in this class",
        });
      }

      next(err);
    }
  },
);

/* =========================================================
   DELETE /api/students/:id/classes/:classSlotId
   Remove enrollment
   ========================================================= */
router.delete(
  "/:id([0-9]+)/classes/:classSlotId([0-9]+)",
  authRequired,
  requireRoles("admin", "staff"),
  async (req, res, next) => {
    try {
      const result = await query(
        `
        DELETE FROM student_enrollments
        WHERE student_id = $1
          AND class_slot_id = $2
        RETURNING id
        `,
        [req.params.id, req.params.classSlotId],
      );

      if (!result.rows.length) {
        return res.status(404).json({
          error: "Enrollment not found",
        });
      }

      res.json({
        message: "Student removed from class successfully",
      });
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
