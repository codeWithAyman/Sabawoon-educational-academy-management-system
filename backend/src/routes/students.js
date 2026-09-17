const express = require("express");
const { query, pool } = require("../db/pool");
const { authRequired, requireRoles } = require("../middleware/auth");
const crypto = require("crypto");

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
   Get student's active class slots
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

   Creates:

   1. Student
   2. All selected class enrollments
   3. One fee per selected subject
   4. Optional payment for each subject

   EVERYTHING happens inside ONE PostgreSQL transaction.

   If anything fails:
   - student is rolled back
   - enrollments are rolled back
   - fees are rolled back
   - payments are rolled back

   Expected body:

   {
     student: {
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
     },

     class_slot_ids: [1, 2, 3],

     payments: [
       {
         subject_id: 1,
         paid_amount: 500,
         payment_date: "2026-09-16",
         description: "Student enrollment"
       }
     ]
   }

   IMPORTANT:
   total fee amounts are NEVER trusted from the frontend.
   They are taken from subject_fee_config.
   ========================================================= */
router.post(
  "/create-complete",
  authRequired,
  requireRoles("admin", "staff"),
  async (req, res, next) => {
    const client = await pool.connect();

    try {
      const {
        student = {},
        class_slot_ids = [],
        payments = [],
      } = req.body || {};

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
      } = student;

      if (!full_name || !String(full_name).trim()) {
        return res.status(400).json({
          error: "Student full name is required",
        });
      }

      if (!Array.isArray(class_slot_ids)) {
        return res.status(400).json({
          error: "class_slot_ids must be an array",
        });
      }

      if (!Array.isArray(payments)) {
        return res.status(400).json({
          error: "payments must be an array",
        });
      }

      /*
        Remove duplicate class slot IDs.
      */
      const uniqueClassSlotIds = [
        ...new Set(
          class_slot_ids
            .map((id) => Number(id))
            .filter((id) => Number.isInteger(id) && id > 0),
        ),
      ];

      /*
        Validate that the supplied IDs were actually valid numbers.
      */
      if (
        class_slot_ids.some(
          (id) => !Number.isInteger(Number(id)) || Number(id) <= 0,
        )
      ) {
        return res.status(400).json({
          error: "Invalid class slot ID",
        });
      }

      /*
        Normalize payment information.
      */
      const normalizedPayments = payments.map((payment) => ({
        subject_id: Number(payment?.subject_id),
        paid_amount:
          payment?.paid_amount === undefined ||
          payment?.paid_amount === null ||
          payment?.paid_amount === ""
            ? 0
            : Number(payment.paid_amount),
        payment_date:
          payment?.payment_date || new Date().toISOString().slice(0, 10),
        description: payment?.description
          ? String(payment.description).trim()
          : "Student enrollment",
      }));

      /*
        Validate payment values.
      */
      for (const payment of normalizedPayments) {
        if (!Number.isInteger(payment.subject_id) || payment.subject_id <= 0) {
          return res.status(400).json({
            error: "Invalid payment subject",
          });
        }

        if (!Number.isFinite(payment.paid_amount) || payment.paid_amount < 0) {
          return res.status(400).json({
            error: "Payment amount cannot be negative",
          });
        }
      }

      /*
        A subject should appear only once in the payment list.
      */
      const paymentSubjectIds = normalizedPayments.map(
        (payment) => payment.subject_id,
      );

      if (new Set(paymentSubjectIds).size !== paymentSubjectIds.length) {
        return res.status(400).json({
          error: "Each subject can only have one payment entry",
        });
      }

      await client.query("BEGIN");

      /*
        ---------------------------------------------------------
        1. VALIDATE CLASS SLOTS
        ---------------------------------------------------------
      */

      let classSlots = [];

      if (uniqueClassSlotIds.length) {
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

        classSlots = classSlotsResult.rows;

        if (classSlots.length !== uniqueClassSlotIds.length) {
          await client.query("ROLLBACK");

          return res.status(400).json({
            error:
              "One or more selected class slots do not exist or are inactive",
          });
        }
      }

      /*
        ---------------------------------------------------------
        2. DETERMINE UNIQUE SUBJECTS
        ---------------------------------------------------------
      */

      const subjectIds = [
        ...new Set(classSlots.map((slot) => Number(slot.subject_id))),
      ];

      /*
        If classes were selected, every selected subject must have
        a backend fee configuration.
      */
      let feeConfigs = [];

      if (subjectIds.length) {
        const feeConfigResult = await client.query(
          `
          SELECT
            sfc.subject_id,
            sfc.amount,
            s.name AS subject_name

          FROM subject_fee_config sfc

          JOIN subjects s
            ON s.id = sfc.subject_id

          WHERE sfc.subject_id = ANY($1::integer[])
          `,
          [subjectIds],
        );

        feeConfigs = feeConfigResult.rows;

        const configuredSubjectIds = new Set(
          feeConfigs.map((row) => Number(row.subject_id)),
        );

        const missingFeeSubjects = subjectIds.filter(
          (subjectId) => !configuredSubjectIds.has(Number(subjectId)),
        );

        if (missingFeeSubjects.length) {
          await client.query("ROLLBACK");

          return res.status(400).json({
            error:
              "Every selected subject must have a fee configuration before the student can be enrolled",
            subject_ids: missingFeeSubjects,
          });
        }
      }

      /*
        ---------------------------------------------------------
        3. VALIDATE PAYMENT SUBJECTS
        ---------------------------------------------------------
      */

      const selectedSubjectSet = new Set(subjectIds);

      for (const payment of normalizedPayments) {
        if (!selectedSubjectSet.has(payment.subject_id)) {
          await client.query("ROLLBACK");

          return res.status(400).json({
            error:
              "A payment was supplied for a subject the student is not being enrolled in",
            subject_id: payment.subject_id,
          });
        }
      }

      /*
        ---------------------------------------------------------
        4. VALIDATE PAYMENT AMOUNTS AGAINST BACKEND CONFIG
        ---------------------------------------------------------
      */

      const feeConfigMap = new Map(
        feeConfigs.map((row) => [Number(row.subject_id), Number(row.amount)]),
      );

      for (const payment of normalizedPayments) {
        const configuredAmount = feeConfigMap.get(payment.subject_id);

        if (payment.paid_amount > configuredAmount) {
          await client.query("ROLLBACK");

          return res.status(400).json({
            error: `Payment for subject ID ${payment.subject_id} cannot be greater than its configured fee of ${configuredAmount}`,
          });
        }
      }

      /*
        ---------------------------------------------------------
        5. CREATE STUDENT
        ---------------------------------------------------------
      */

      let studentResult;

      try {
        studentResult = await client.query(
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
            roll_number ? String(roll_number).trim() : null,
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

      /*
        ---------------------------------------------------------
        6. CREATE ALL ENROLLMENTS
        ---------------------------------------------------------
      */

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

      /*
        ---------------------------------------------------------
        7. CREATE ONE FEE PER SUBJECT
        ---------------------------------------------------------
      */

      const createdFees = [];

      for (const subjectId of subjectIds) {
        const totalAmount = feeConfigMap.get(Number(subjectId));

        const payment = normalizedPayments.find(
          (item) => Number(item.subject_id) === Number(subjectId),
        );

        const paidAmount = payment ? Number(payment.paid_amount) : 0;

        const dueAmount = totalAmount - paidAmount;

        let status = "pending";

        if (dueAmount === 0) {
          status = "paid";
        } else if (paidAmount > 0) {
          status = "partial";
        }

        let receiptNumber = null;

        if (paidAmount > 0) {
          const datePart = new Date()
            .toISOString()
            .slice(0, 10)
            .replace(/-/g, "");

          receiptNumber = `REC-${datePart}-${crypto
            .randomBytes(5)
            .toString("hex")
            .toUpperCase()}`;
        }

        const feeResult = await client.query(
          `
          INSERT INTO fees (
            student_id,
            subject_id,
            total_amount,
            paid_amount,
            due_amount,
            status,
            payment_date,
            receipt_number,
            academic_year,
            description
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10
          )
          RETURNING *
          `,
          [
            createdStudent.id,
            subjectId,
            totalAmount,
            paidAmount,
            dueAmount,
            status,
            paidAmount > 0 ? payment.payment_date : null,
            receiptNumber,
            new Date().getFullYear().toString(),
            payment?.description || "Student enrollment",
          ],
        );

        const createdFee = feeResult.rows[0];

        const subjectName =
          feeConfigs.find(
            (config) => Number(config.subject_id) === Number(subjectId),
          )?.subject_name || null;

        createdFees.push({
          ...createdFee,
          subject_name: subjectName,
        });
      }

      /*
        ---------------------------------------------------------
        8. COMMIT EVERYTHING
        ---------------------------------------------------------
      */

      await client.query("COMMIT");

      res.status(201).json({
        message:
          "Student, enrollments, fees, and payments created successfully",

        student: createdStudent,

        enrollments: createdEnrollments,

        fees: createdFees,
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
   Create student
   Existing endpoint preserved.
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
          roll_number ? String(roll_number).trim() : null,
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
          roll_number ? String(roll_number).trim() : null,
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
   Delete student
   Admin only.
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
