const express = require("express");
const { query, pool } = require("../db/pool");
const { authRequired, requireRoles } = require("../middleware/auth");

const router = express.Router();

/* =========================================================
   HELPERS
========================================================= */

function isValidPositiveInteger(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0;
}

/* =========================================================
   Age is stored instead of date of birth, so it must be a
   whole number of years.
========================================================= */

const MAX_STUDENT_AGE = 120;

function normalizeAge(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const age = Number(value);

  if (!Number.isInteger(age) || age < 0 || age > MAX_STUDENT_AGE) {
    return Number.NaN;
  }

  return age;
}

function isValidAge(value) {
  return !Number.isNaN(normalizeAge(value));
}

/* =========================================================
   GET /api/students
   Get all ACTIVE students + active class enrollments

   Archived students remain in the database for historical
   records but are intentionally hidden from the normal
   Students page.
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
          s.age,
          s.gender,
          s.blood_group,
          s.address,
          s.guardian_name,
          s.guardian_phone,
          s.guardian_email,
          s.admission_date,
          s.is_active,

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
                'is_active', se.is_active,

                'books',
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
                  )
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
          s.is_active = TRUE
          AND (
            $1 = ''
            OR s.full_name ILIKE '%' || $1 || '%'
            OR s.phone ILIKE '%' || $1 || '%'
            OR s.roll_number ILIKE '%' || $1 || '%'
            OR s.guardian_name ILIKE '%' || $1 || '%'
            OR s.guardian_phone ILIKE '%' || $1 || '%'
          )

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
          s.age,
          s.gender,
          s.blood_group,
          s.address,
          s.guardian_name,
          s.guardian_phone,
          s.guardian_email,
          s.admission_date,
          s.is_active
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
          se.is_active,

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

        FROM student_enrollments se

        JOIN class_slots cs
          ON cs.id = se.class_slot_id

        JOIN subjects sub
          ON sub.id = cs.subject_id

        JOIN teachers t
          ON t.id = cs.teacher_id

        WHERE se.student_id = $1
          AND se.is_active = TRUE

        ORDER BY
          sub.name ASC,
          cs.start_time ASC
        `,
      [req.params.id],
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/* =========================================================
   POST /api/students/create-complete

   Complete enrollment endpoint.

   Creates:
   1. Student
   2. Class enrollments

   Financial operations are NOT handled here.

   Fees and payments belong exclusively to the Payments
   module/backend.

   This endpoint is kept for compatibility with the
   existing application.
========================================================= */

router.post(
  "/create-complete",
  authRequired,
  requireRoles("admin", "staff"),
  async (req, res, next) => {
    const client = await pool.connect();

    try {
      const { student = {}, class_slot_ids = [] } = req.body || {};

      const {
        full_name,
        phone,
        roll_number,
        age,
        gender,
        blood_group,
        address,
        guardian_name,
        guardian_phone,
        guardian_email,
        admission_date,
      } = student;

      if (!full_name || !String(full_name).trim()) {
        return res.status(400).json({
          error: "Student full name is required",
        });
      }

      if (!isValidAge(age)) {
        return res.status(400).json({
          error: `Student age must be a whole number between 0 and ${MAX_STUDENT_AGE}`,
        });
      }

      if (!Array.isArray(class_slot_ids)) {
        return res.status(400).json({
          error: "class_slot_ids must be an array",
        });
      }

      const uniqueClassSlotIds = [
        ...new Set(
          class_slot_ids
            .map(Number)
            .filter((id) => Number.isInteger(id) && id > 0),
        ),
      ];

      if (
        class_slot_ids.some(
          (id) => !Number.isInteger(Number(id)) || Number(id) <= 0,
        )
      ) {
        return res.status(400).json({
          error: "Invalid class slot ID",
        });
      }

      await client.query("BEGIN");

      const classSlotsResult = await client.query(
        `
          SELECT
            cs.id,
            cs.subject_id,
            cs.teacher_id,
            cs.start_time,
            cs.end_time,

            sub.name AS subject_name,

            t.full_name AS teacher_name

          FROM class_slots cs

          JOIN subjects sub
            ON sub.id = cs.subject_id

          JOIN teachers t
            ON t.id = cs.teacher_id

          WHERE cs.id = ANY($1::integer[])
            AND cs.is_active = TRUE

          ORDER BY
            sub.name ASC,
            cs.start_time ASC
          `,
        [uniqueClassSlotIds],
      );

      const classSlots = classSlotsResult.rows;

      if (classSlots.length !== uniqueClassSlotIds.length) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          error:
            "One or more selected class slots do not exist or are inactive",
        });
      }

      let studentResult;

      try {
        studentResult = await client.query(
          `
            INSERT INTO students (
              full_name,
              phone,
              roll_number,
              age,
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
            roll_number ? String(roll_number).trim() : null,
            normalizeAge(age),
            gender || null,
            blood_group || null,
            address ? String(address).trim() : null,
            guardian_name ? String(guardian_name).trim() : null,
            guardian_phone ? String(guardian_phone).trim() : null,
            guardian_email ? String(guardian_email).trim() : null,
            admission_date || null,
          ],
        );
      } catch (err) {
        if (err.code === "23505" && err.constraint?.includes("roll")) {
          await client.query("ROLLBACK");

          return res.status(409).json({
            error: "A student with this roll number already exists",
          });
        }

        throw err;
      }

      const createdStudent = studentResult.rows[0];

      const createdEnrollments = [];

      for (const classSlot of classSlots) {
        const enrollmentResult = await client.query(
          `
            INSERT INTO student_enrollments (
              student_id,
              class_slot_id
            )
            VALUES ($1, $2)
            RETURNING *
            `,
          [createdStudent.id, classSlot.id],
        );

        createdEnrollments.push({
          ...enrollmentResult.rows[0],
          subject_id: classSlot.subject_id,
          subject_name: classSlot.subject_name,
          teacher_id: classSlot.teacher_id,
          teacher_name: classSlot.teacher_name,
          start_time: classSlot.start_time,
          end_time: classSlot.end_time,
        });
      }

      await client.query("COMMIT");

      res.status(201).json({
        message: "Student and enrollments created successfully",
        student: createdStudent,
        enrollments: createdEnrollments,
      });
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Transaction rollback failed:", rollbackError);
      }

      if (err.code === "23505" && err.constraint?.includes("roll")) {
        return res.status(409).json({
          error: "A student with this roll number already exists",
        });
      }

      next(err);
    } finally {
      client.release();
    }
  },
);

/* =========================================================
   POST /api/students
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
        age,
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

      if (!isValidAge(age)) {
        return res.status(400).json({
          error: `Student age must be a whole number between 0 and ${MAX_STUDENT_AGE}`,
        });
      }

      const result = await query(
        `
        INSERT INTO students (
          full_name,
          phone,
          roll_number,
          age,
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
          roll_number ? String(roll_number).trim() : null,
          normalizeAge(age),
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
      if (err.code === "23505" && err.constraint?.includes("roll")) {
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
        age,
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

      if (!isValidAge(age)) {
        return res.status(400).json({
          error: `Student age must be a whole number between 0 and ${MAX_STUDENT_AGE}`,
        });
      }

      const result = await query(
        `
        UPDATE students
        SET
          full_name = $1,
          phone = $2,
          roll_number = $3,
          age = $4,
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
          roll_number ? String(roll_number).trim() : null,
          normalizeAge(age),
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
      if (err.code === "23505" && err.constraint?.includes("roll")) {
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

   IMPORTANT:
   This is an ARCHIVE, not a physical database delete.

   Student history must remain available for:
   - Attendance
   - Payments
   - Exams
   - Marks
   - Reports
   - Historical records

   The student row therefore remains permanently in the
   database with is_active = FALSE.
========================================================= */

router.delete(
  "/:id([0-9]+)",
  authRequired,
  requireRoles("admin"),
  async (req, res, next) => {
    try {
      const result = await query(
        `
        UPDATE students
        SET is_active = FALSE
        WHERE id = $1
          AND is_active = TRUE
        RETURNING
          id,
          full_name,
          roll_number,
          is_active
        `,
        [req.params.id],
      );

      if (!result.rows.length) {
        const existing = await query(
          `
          SELECT
            id,
            is_active
          FROM students
          WHERE id = $1
          `,
          [req.params.id],
        );

        if (!existing.rows.length) {
          return res.status(404).json({
            error: "Student not found",
          });
        }

        return res.status(409).json({
          error: "Student is already archived",
        });
      }

      res.json({
        message: "Student archived successfully",
        student: result.rows[0],
      });
    } catch (err) {
      next(err);
    }
  },
);

/* =========================================================
   POST /api/students/:id/classes

   Enroll an existing student into an active class slot.

   No fee/payment operation is performed here.

   Financial operations belong exclusively to the
   Payments module.
========================================================= */

router.post(
  "/:id([0-9]+)/classes",
  authRequired,
  requireRoles("admin", "staff"),
  async (req, res, next) => {
    try {
      const { class_slot_id } = req.body;

      if (!isValidPositiveInteger(class_slot_id)) {
        return res.status(400).json({
          error: "class_slot_id is required",
        });
      }

      const student = await query(
        `
        SELECT
          id,
          is_active
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

      if (!student.rows[0].is_active) {
        return res.status(409).json({
          error: "Archived students cannot be enrolled in classes",
        });
      }

      const classSlot = await query(
        `
        SELECT
          cs.id,
          cs.subject_id,
          cs.teacher_id,
          cs.start_time,
          cs.end_time,

          sub.name AS subject_name,

          t.full_name AS teacher_name

        FROM class_slots cs

        JOIN subjects sub
          ON sub.id = cs.subject_id

        JOIN teachers t
          ON t.id = cs.teacher_id

        WHERE cs.id = $1
          AND cs.is_active = TRUE
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
        SELECT
          id,
          is_active
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

        return res.status(200).json({
          ...reactivated.rows[0],
          ...classSlot.rows[0],
        });
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

      res.status(201).json({
        ...result.rows[0],
        ...classSlot.rows[0],
      });
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

   This removes the CURRENT enrollment only.
   It does NOT delete the student or historical student
   records.

   No fee/payment operation is performed here.
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
