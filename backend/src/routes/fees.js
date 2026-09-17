const express = require("express");
const { query, pool } = require("../db/pool");
const { authRequired, requireRoles } = require("../middleware/auth");
const { asyncH } = require("../utils/helpers");

const router = express.Router();

/*
  ============================================================
  LEGACY SUBJECT FEE CONFIGURATION
  ============================================================

  These endpoints are kept so existing Payments functionality
  does not suddenly break.

  The NEW student-enrollment workflow does NOT use these
  configurations. Student fees are entered manually per student.
*/

/*
  GET /api/fees/subject-config
*/
router.get(
  "/subject-config",
  authRequired,
  requireRoles("admin", "staff"),
  asyncH(async (req, res) => {
    const result = await query(
      `SELECT
         s.id AS subject_id,
         s.name AS subject_name,
         sfc.amount,
         sfc.updated_at
       FROM subjects s
       LEFT JOIN subject_fee_config sfc
         ON sfc.subject_id = s.id
       ORDER BY s.name ASC`,
    );

    res.json(result.rows);
  }),
);

/*
  GET /api/fees/subject-config/:subjectId
*/
router.get(
  "/subject-config/:subjectId([0-9]+)",
  authRequired,
  requireRoles("admin", "staff"),
  asyncH(async (req, res) => {
    const result = await query(
      `SELECT
         s.id AS subject_id,
         s.name AS subject_name,
         sfc.amount,
         sfc.updated_at
       FROM subjects s
       LEFT JOIN subject_fee_config sfc
         ON sfc.subject_id = s.id
       WHERE s.id = $1`,
      [req.params.subjectId],
    );

    if (!result.rows.length) {
      return res.status(404).json({
        error: "Subject not found",
      });
    }

    res.json(result.rows[0]);
  }),
);

/*
  POST /api/fees/subject-config
*/
router.post(
  "/subject-config",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const { subject_id, amount } = req.body;

    if (!subject_id || amount === undefined || amount === null) {
      return res.status(400).json({
        error: "Subject and amount are required",
      });
    }

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        error: "Amount must be greater than zero",
      });
    }

    const subject = await query(
      `SELECT id, name
       FROM subjects
       WHERE id = $1`,
      [subject_id],
    );

    if (!subject.rows.length) {
      return res.status(404).json({
        error: "Subject not found",
      });
    }

    const result = await query(
      `INSERT INTO subject_fee_config
       (
         subject_id,
         amount,
         updated_at
       )
       VALUES
       (
         $1,
         $2,
         NOW()
       )
       ON CONFLICT (subject_id)
       DO UPDATE SET
         amount = EXCLUDED.amount,
         updated_at = NOW()
       RETURNING *`,
      [subject_id, numericAmount],
    );

    res.status(201).json({
      ...result.rows[0],
      subject_name: subject.rows[0].name,
    });
  }),
);

/*
  PUT /api/fees/subject-config/:subjectId
*/
router.put(
  "/subject-config/:subjectId([0-9]+)",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const { amount } = req.body;

    if (amount === undefined || amount === null) {
      return res.status(400).json({
        error: "Amount is required",
      });
    }

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        error: "Amount must be greater than zero",
      });
    }

    const result = await query(
      `UPDATE subject_fee_config
       SET
         amount = $1,
         updated_at = NOW()
       WHERE subject_id = $2
       RETURNING *`,
      [numericAmount, req.params.subjectId],
    );

    if (!result.rows.length) {
      return res.status(404).json({
        error: "Fee configuration not found for this subject",
      });
    }

    res.json(result.rows[0]);
  }),
);

/*
  DELETE /api/fees/subject-config/:subjectId
*/
router.delete(
  "/subject-config/:subjectId([0-9]+)",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const result = await query(
      `DELETE FROM subject_fee_config
       WHERE subject_id = $1
       RETURNING subject_id`,
      [req.params.subjectId],
    );

    if (!result.rows.length) {
      return res.status(404).json({
        error: "Fee configuration not found",
      });
    }

    res.json({
      ok: true,
      message: "Subject fee configuration deleted successfully",
    });
  }),
);

/*
  ============================================================
  FEE RECORDS
  ============================================================
*/

/*
  GET /api/fees

  Admin + Staff

  Optional filters:
  ?student_id=1
  ?status=pending
  ?subject_id=2
*/
router.get(
  "/",
  authRequired,
  requireRoles("admin", "staff"),
  asyncH(async (req, res) => {
    const { student_id, status, subject_id } = req.query;

    const conditions = [];
    const params = [];

    if (student_id) {
      params.push(student_id);
      conditions.push(`f.student_id = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`f.status = $${params.length}`);
    }

    if (subject_id) {
      params.push(subject_id);
      conditions.push(`f.subject_id = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `SELECT
         f.id,
         f.student_id,
         s.full_name AS student_name,
         s.roll_number,
         s.guardian_name,
         s.guardian_phone,

         f.subject_id,
         sub.name AS subject_name,

         f.total_amount,
         f.paid_amount,
         f.due_amount,
         f.status,
         f.payment_date,
         f.receipt_number,
         f.academic_year,
         f.description,
         f.created_at

       FROM fees f

       JOIN students s
         ON s.id = f.student_id

       LEFT JOIN subjects sub
         ON sub.id = f.subject_id

       ${where}

       ORDER BY f.created_at DESC, f.id DESC`,
      params,
    );

    res.json(result.rows);
  }),
);

/*
  GET /api/fees/:id

  Get one fee record.
*/
router.get(
  "/:id([0-9]+)",
  authRequired,
  requireRoles("admin", "staff"),
  asyncH(async (req, res) => {
    const result = await query(
      `SELECT
         f.id,
         f.student_id,

         s.full_name AS student_name,
         s.roll_number,
         s.guardian_name,
         s.guardian_phone,
         s.guardian_email,

         f.subject_id,
         sub.name AS subject_name,

         f.total_amount,
         f.paid_amount,
         f.due_amount,
         f.status,
         f.payment_date,
         f.receipt_number,
         f.academic_year,
         f.description,
         f.created_at

       FROM fees f

       JOIN students s
         ON s.id = f.student_id

       LEFT JOIN subjects sub
         ON sub.id = f.subject_id

       WHERE f.id = $1`,
      [req.params.id],
    );

    if (!result.rows.length) {
      return res.status(404).json({
        error: "Fee record not found",
      });
    }

    res.json(result.rows[0]);
  }),
);

/*
  GET /api/fees/:id/payments

  Get the complete payment history for one fee.
*/
router.get(
  "/:id([0-9]+)/payments",
  authRequired,
  requireRoles("admin", "staff"),
  asyncH(async (req, res) => {
    const fee = await query(
      `SELECT id
       FROM fees
       WHERE id = $1`,
      [req.params.id],
    );

    if (!fee.rows.length) {
      return res.status(404).json({
        error: "Fee record not found",
      });
    }

    const result = await query(
      `SELECT
         id,
         fee_id,
         amount,
         payment_date,
         receipt_number,
         created_at
       FROM fee_payments
       WHERE fee_id = $1
       ORDER BY payment_date ASC, id ASC`,
      [req.params.id],
    );

    res.json(result.rows);
  }),
);

/*
  POST /api/fees

  Create a student-specific fee.

  IMPORTANT:
  There is NO fixed subject price here.

  Body:
  {
    student_id: 1,
    subject_id: 2,
    total_amount: 1500,
    academic_year: "2026",
    description: "Student enrollment"
  }
*/
router.post(
  "/",
  authRequired,
  requireRoles("admin", "staff"),
  asyncH(async (req, res) => {
    const { student_id, subject_id, total_amount, academic_year, description } =
      req.body;

    if (
      !student_id ||
      !subject_id ||
      total_amount === undefined ||
      total_amount === null
    ) {
      return res.status(400).json({
        error: "Student, subject, and total amount are required",
      });
    }

    const amount = Number(total_amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        error: "Total amount must be greater than zero",
      });
    }

    const student = await query(
      `SELECT
         id,
         full_name,
         roll_number,
         guardian_name
       FROM students
       WHERE id = $1`,
      [student_id],
    );

    if (!student.rows.length) {
      return res.status(404).json({
        error: "Student not found",
      });
    }

    const subject = await query(
      `SELECT
         id,
         name
       FROM subjects
       WHERE id = $1`,
      [subject_id],
    );

    if (!subject.rows.length) {
      return res.status(404).json({
        error: "Subject not found",
      });
    }

    const enrollment = await query(
      `SELECT 1
       FROM student_enrollments e
       JOIN class_slots cs
         ON cs.id = e.class_slot_id
       WHERE e.student_id = $1
         AND cs.subject_id = $2
         AND cs.is_active = TRUE
         AND e.is_active = TRUE
       LIMIT 1`,
      [student_id, subject_id],
    );

    if (!enrollment.rows.length) {
      return res.status(400).json({
        error: "Student is not enrolled in this subject",
      });
    }

    const result = await query(
      `INSERT INTO fees
       (
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
       VALUES
       (
         $1,
         $2,
         $3,
         0,
         $3,
         'pending',
         NULL,
         NULL,
         $4,
         $5
       )
       RETURNING *`,
      [
        student_id,
        subject_id,
        amount,
        academic_year || null,
        description || null,
      ],
    );

    res.status(201).json({
      ...result.rows[0],
      student_name: student.rows[0].full_name,
      subject_name: subject.rows[0].name,
    });
  }),
);

/*
  PUT /api/fees/:id

  Update a fee/bill.
*/
router.put(
  "/:id([0-9]+)",
  authRequired,
  requireRoles("admin", "staff"),
  asyncH(async (req, res) => {
    const { total_amount, subject_id, academic_year, description } = req.body;

    const existing = await query(
      `SELECT *
       FROM fees
       WHERE id = $1`,
      [req.params.id],
    );

    if (!existing.rows.length) {
      return res.status(404).json({
        error: "Fee record not found",
      });
    }

    const fee = existing.rows[0];

    let newTotal = Number(fee.total_amount);

    if (total_amount !== undefined && total_amount !== null) {
      newTotal = Number(total_amount);

      if (!Number.isFinite(newTotal) || newTotal <= 0) {
        return res.status(400).json({
          error: "Total amount must be greater than zero",
        });
      }
    }

    const paidAmount = Number(fee.paid_amount);

    if (newTotal < paidAmount) {
      return res.status(400).json({
        error: "Total amount cannot be less than the amount already paid",
      });
    }

    let newSubjectId = fee.subject_id;

    if (subject_id !== undefined && subject_id !== null) {
      const subject = await query(
        `SELECT id
         FROM subjects
         WHERE id = $1`,
        [subject_id],
      );

      if (!subject.rows.length) {
        return res.status(404).json({
          error: "Subject not found",
        });
      }

      newSubjectId = subject_id;
    }

    const dueAmount = newTotal - paidAmount;

    let status = "pending";

    if (paidAmount >= newTotal) {
      status = "paid";
    } else if (paidAmount > 0) {
      status = "partial";
    }

    if (fee.status === "overdue" && dueAmount > 0) {
      status = "overdue";
    }

    const result = await query(
      `UPDATE fees
       SET
         subject_id = $1,
         total_amount = $2,
         due_amount = $3,
         status = $4,
         academic_year = COALESCE($5, academic_year),
         description = COALESCE($6, description)
       WHERE id = $7
       RETURNING *`,
      [
        newSubjectId,
        newTotal,
        dueAmount,
        status,
        academic_year !== undefined ? academic_year : null,
        description !== undefined ? description : null,
        req.params.id,
      ],
    );

    res.json(result.rows[0]);
  }),
);

/*
  ============================================================
  PAYMENTS
  ============================================================
*/

/*
  POST /api/fees/:id/payment

  Record an individual payment.

  Body:
  {
    amount: 500,
    payment_date: "2026-09-16"
  }

  This now:
  1. Inserts a permanent payment-history row.
  2. Updates the fee summary.
*/
router.post(
  "/:id([0-9]+)/payment",
  authRequired,
  requireRoles("admin", "staff"),
  asyncH(async (req, res) => {
    const { amount, payment_date } = req.body;

    if (amount === undefined || amount === null) {
      return res.status(400).json({
        error: "Payment amount is required",
      });
    }

    const paymentAmount = Number(amount);

    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({
        error: "Payment amount must be greater than zero",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const existing = await client.query(
        `SELECT
     f.*,
     s.full_name AS student_name,
     s.roll_number,
     s.guardian_name,
     sub.name AS subject_name
   FROM fees f
   JOIN students s
     ON s.id = f.student_id
   LEFT JOIN subjects sub
     ON sub.id = f.subject_id
   WHERE f.id = $1
   FOR UPDATE OF f`,
        [req.params.id],
      );

      if (!existing.rows.length) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          error: "Fee record not found",
        });
      }

      const fee = existing.rows[0];

      const currentPaid = Number(fee.paid_amount);
      const total = Number(fee.total_amount);
      const currentDue = Math.max(total - currentPaid, 0);

      if (paymentAmount > currentDue) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          error: `Payment cannot be greater than the remaining due amount of ${currentDue}`,
        });
      }

      const finalPaymentDate =
        payment_date || new Date().toISOString().slice(0, 10);

      /*
        Lock the payment-history rows while generating
        the next receipt number.
      */
      const receiptResult = await client.query(
        `SELECT
           COUNT(*)::int + 1 AS next_number
         FROM fee_payments`,
      );

      const nextNumber = receiptResult.rows[0].next_number;

      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");

      const receiptNumber = `REC-${datePart}-${String(nextNumber).padStart(
        4,
        "0",
      )}`;

      /*
        Save the individual payment permanently.
      */
      const paymentResult = await client.query(
        `INSERT INTO fee_payments
         (
           fee_id,
           amount,
           payment_date,
           receipt_number
         )
         VALUES
         (
           $1,
           $2,
           $3,
           $4
         )
         RETURNING *`,
        [req.params.id, paymentAmount, finalPaymentDate, receiptNumber],
      );

      const newPaid = currentPaid + paymentAmount;
      const newDue = Math.max(total - newPaid, 0);

      const newStatus =
        newDue === 0 ? "paid" : newPaid > 0 ? "partial" : "pending";

      /*
        Keep the fee table as the current summary.
      */
      const feeResult = await client.query(
        `UPDATE fees
         SET
           paid_amount = $1,
           due_amount = $2,
           status = $3,
           payment_date = $4,
           receipt_number = $5
         WHERE id = $6
         RETURNING *`,
        [
          newPaid,
          newDue,
          newStatus,
          finalPaymentDate,
          receiptNumber,
          req.params.id,
        ],
      );

      await client.query("COMMIT");

      res.json({
        message: "Payment recorded successfully",

        fee: feeResult.rows[0],

        payment: paymentResult.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

/*
  GET /api/fees/:id/receipt

  Return receipt-ready information.
*/
router.get(
  "/:id([0-9]+)/receipt",
  authRequired,
  requireRoles("admin", "staff"),
  asyncH(async (req, res) => {
    const result = await query(
      `SELECT
         f.id,
         f.receipt_number,
         f.payment_date,
         f.total_amount,
         f.paid_amount,
         f.due_amount,
         f.status,
         f.academic_year,
         f.description,

         f.subject_id,
         sub.name AS subject_name,

         s.id AS student_id,
         s.full_name AS student_name,
         s.roll_number,
         s.guardian_name,
         s.guardian_phone

       FROM fees f

       JOIN students s
         ON s.id = f.student_id

       LEFT JOIN subjects sub
         ON sub.id = f.subject_id

       WHERE f.id = $1`,
      [req.params.id],
    );

    if (!result.rows.length) {
      return res.status(404).json({
        error: "Fee record not found",
      });
    }

    const receipt = result.rows[0];

    if (!receipt.receipt_number) {
      return res.status(400).json({
        error: "No payment has been recorded for this fee",
      });
    }

    res.json(receipt);
  }),
);

/*
  ============================================================
  DELETE
  ============================================================
*/

/*
  DELETE /api/fees/:id

  Admin only.
*/
router.delete(
  "/:id([0-9]+)",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const result = await query(
      `DELETE FROM fees
       WHERE id = $1
       RETURNING id`,
      [req.params.id],
    );

    if (!result.rows.length) {
      return res.status(404).json({
        error: "Fee record not found",
      });
    }

    res.json({
      ok: true,
      message: "Fee record deleted successfully",
    });
  }),
);

module.exports = router;
