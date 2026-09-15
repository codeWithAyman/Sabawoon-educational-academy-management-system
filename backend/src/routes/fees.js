const express = require("express");
const { query } = require("../db/pool");
const { authRequired, requireRoles } = require("../middleware/auth");
const { asyncH } = require("../utils/helpers");

const router = express.Router();

/*
  GET /api/fees

  Admin + Staff:
  List all fee records.

  Optional filters:
  ?student_id=1
  ?status=pending
*/
router.get(
  "/",
  authRequired,
  requireRoles("admin", "staff"),
  asyncH(async (req, res) => {
    const { student_id, status } = req.query;

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

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `SELECT
         f.id,
         f.student_id,
         s.roll_number,
         s.guardian_name,
         s.guardian_phone,
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
       ${where}
       ORDER BY f.created_at DESC, f.id DESC`,
      params,
    );

    res.json(result.rows);
  }),
);

/*
  GET /api/fees/:id

  Get one fee record with student information.
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
         s.roll_number,
         s.guardian_name,
         s.guardian_phone,
         s.guardian_email,
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
  POST /api/fees

  Create a new fee/bill for a student.
*/
router.post(
  "/",
  authRequired,
  requireRoles("admin", "staff"),
  asyncH(async (req, res) => {
    const { student_id, total_amount, academic_year, description } = req.body;

    if (!student_id || total_amount === undefined || total_amount === null) {
      return res.status(400).json({
        error: "Student and total amount are required",
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

    const result = await query(
      `INSERT INTO fees
       (
         student_id,
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
         0,
         $2,
         'pending',
         NULL,
         NULL,
         $3,
         $4
       )
       RETURNING *`,
      [student_id, amount, academic_year || null, description || null],
    );

    res.status(201).json(result.rows[0]);
  }),
);

/*
  PUT /api/fees/:id

  Update a fee/bill.

  Intended for correcting the bill itself.
  Payment should normally be recorded through /payment.
*/
router.put(
  "/:id([0-9]+)",
  authRequired,
  requireRoles("admin", "staff"),
  asyncH(async (req, res) => {
    const { total_amount, academic_year, description } = req.body;

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
         total_amount = $1,
         due_amount = $2,
         status = $3,
         academic_year = COALESCE($4, academic_year),
         description = COALESCE($5, description)
       WHERE id = $6
       RETURNING *`,
      [
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
  POST /api/fees/:id/payment

  Record a payment against a fee.

  Body:
  {
    amount: 500,
    payment_date: "2026-09-13"
  }

  The fee's paid_amount and due_amount are updated automatically.
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

    const existing = await query(
      `SELECT
         f.*,
         s.roll_number,
         s.guardian_name
       FROM fees f
       JOIN students s
         ON s.id = f.student_id
       WHERE f.id = $1`,
      [req.params.id],
    );

    if (!existing.rows.length) {
      return res.status(404).json({
        error: "Fee record not found",
      });
    }

    const fee = existing.rows[0];

    const currentPaid = Number(fee.paid_amount);
    const total = Number(fee.total_amount);
    const currentDue = Math.max(total - currentPaid, 0);

    if (paymentAmount > currentDue) {
      return res.status(400).json({
        error: `Payment cannot be greater than the remaining due amount of ${currentDue}`,
      });
    }

    const newPaid = currentPaid + paymentAmount;
    const newDue = Math.max(total - newPaid, 0);

    const newStatus =
      newDue === 0 ? "paid" : newPaid > 0 ? "partial" : "pending";

    /*
      Generate a simple receipt number.

      Example:
      REC-20260913-0001
    */
    const receiptResult = await query(
      `SELECT
         COUNT(*)::int + 1 AS next_number
       FROM fees
       WHERE receipt_number IS NOT NULL`,
    );

    const nextNumber = receiptResult.rows[0].next_number;

    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");

    const receiptNumber = `REC-${datePart}-${String(nextNumber).padStart(4, "0")}`;

    const result = await query(
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
        payment_date || new Date().toISOString().slice(0, 10),
        receiptNumber,
        req.params.id,
      ],
    );

    res.json({
      message: "Payment recorded successfully",
      fee: result.rows[0],
      payment: {
        amount: paymentAmount,
        receipt_number: receiptNumber,
        payment_date: payment_date || new Date().toISOString().slice(0, 10),
      },
    });
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
         s.id AS student_id,
         s.roll_number,
         s.guardian_name,
         s.guardian_phone
       FROM fees f
       JOIN students s
         ON s.id = f.student_id
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
