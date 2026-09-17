const express = require("express");
const { query, pool } = require("../db/pool");
const { authRequired, requireRoles } = require("../middleware/auth");
const { asyncH } = require("../utils/helpers");

const { parseSolarDate, formatSolarDate } = require("../utils/feePeriod");

const { getJalaaliMonthDays, dateToJalaali } = require("../utils/solarDate");

const router = express.Router();

/*
  ============================================================
  HELPERS
  ============================================================
*/

function roundMoney(value) {
  return Number(Number(value).toFixed(2));
}

function getCurrentSolarDate() {
  const now = new Date();
  const solar = dateToJalaali(now);

  return formatSolarDate(solar.jy, solar.jm, solar.jd);
}

/*
  Calculate every Solar Hijri month touched by a fee period.

  monthlyAmounts:
  [
    {
      solar_year: 1405,
      solar_month: 6,
      monthly_amount: 3000
    }
  ]
*/
function calculatePeriodMonths(
  fromSolarDate,
  toSolarDate,
  monthlyAmounts = [],
) {
  const start = parseSolarDate(fromSolarDate);
  const end = parseSolarDate(toSolarDate);

  if (start.gregorianDate > end.gregorianDate) {
    throw new Error("To date cannot be before from date");
  }

  if (!Array.isArray(monthlyAmounts) || monthlyAmounts.length === 0) {
    throw new Error("Monthly fee amounts are required");
  }

  const amountMap = new Map();

  for (const item of monthlyAmounts) {
    if (
      item === null ||
      item === undefined ||
      item.solar_year === undefined ||
      item.solar_month === undefined ||
      item.monthly_amount === undefined ||
      item.monthly_amount === null
    ) {
      throw new Error(
        "Each monthly fee must include solar_year, solar_month, and monthly_amount",
      );
    }

    const solarYear = Number(item.solar_year);
    const solarMonth = Number(item.solar_month);
    const monthlyAmount = Number(item.monthly_amount);

    if (!Number.isInteger(solarYear)) {
      throw new Error("Invalid Solar Hijri year");
    }

    if (!Number.isInteger(solarMonth) || solarMonth < 1 || solarMonth > 12) {
      throw new Error("Invalid Solar Hijri month");
    }

    if (!Number.isFinite(monthlyAmount) || monthlyAmount <= 0) {
      throw new Error(
        `Monthly fee for ${solarYear}/${String(solarMonth).padStart(
          2,
          "0",
        )} must be greater than zero`,
      );
    }

    amountMap.set(`${solarYear}-${solarMonth}`, monthlyAmount);
  }

  const months = [];

  let jy = start.jy;
  let jm = start.jm;

  while (jy < end.jy || (jy === end.jy && jm <= end.jm)) {
    const monthDays = getJalaaliMonthDays(jy, jm);

    const rangeStart = jy === start.jy && jm === start.jm ? start.jd : 1;

    const rangeEnd = jy === end.jy && jm === end.jm ? end.jd : monthDays;

    const coveredDays = rangeEnd - rangeStart + 1;

    if (coveredDays > 0) {
      const key = `${jy}-${jm}`;

      if (!amountMap.has(key)) {
        throw new Error(
          `Monthly fee is missing for Solar Hijri month ${formatSolarDate(
            jy,
            jm,
            1,
          ).slice(0, 7)}`,
        );
      }

      const monthlyAmount = Number(amountMap.get(key));

      const calculatedAmount = roundMoney(
        (monthlyAmount / monthDays) * coveredDays,
      );

      months.push({
        solar_year: jy,
        solar_month: jm,
        month_days: monthDays,
        covered_days: coveredDays,
        monthly_amount: monthlyAmount,
        calculated_amount: calculatedAmount,
      });
    }

    jm++;

    if (jm > 12) {
      jm = 1;
      jy++;
    }
  }

  if (!months.length) {
    throw new Error("The selected fee period contains no days");
  }

  const coveredDays = months.reduce(
    (sum, month) => sum + month.covered_days,
    0,
  );

  const totalAmount = roundMoney(
    months.reduce((sum, month) => sum + month.calculated_amount, 0),
  );

  return {
    from_solar_date: formatSolarDate(start.jy, start.jm, start.jd),

    to_solar_date: formatSolarDate(end.jy, end.jm, end.jd),

    from_date: start.gregorianDate,
    to_date: end.gregorianDate,

    covered_days: coveredDays,
    total_amount: totalAmount,

    months,
  };
}

/*
  Calculate how much of a payment covers COMPLETE days.

  IMPORTANT:
  Existing allocations are considered.

  This prevents:
    Payment 1 -> days 1-10
    Payment 2 -> starting again at day 1

  Instead:
    Payment 1 -> days 1-10
    Payment 2 -> days 11-20

  Any money that does not complete another day remains
  financially recorded in fees/fee_payments but does NOT
  create a fake attendance day.
*/
function calculatePaidCoverage(paymentAmount, months) {
  let remaining = roundMoney(paymentAmount);

  const allocations = [];

  for (const month of months) {
    if (remaining <= 0) {
      break;
    }

    const monthlyAmount = Number(month.monthly_amount);
    const monthDays = Number(month.month_days);

    const coveredDays = Number(month.covered_days);

    if (
      !Number.isFinite(monthlyAmount) ||
      monthlyAmount <= 0 ||
      !Number.isFinite(monthDays) ||
      monthDays <= 0 ||
      !Number.isFinite(coveredDays) ||
      coveredDays <= 0
    ) {
      continue;
    }

    const dailyRate = monthlyAmount / monthDays;

    /*
      Only the amount required for the remaining complete
      days in this month can be allocated to this month.
    */
    const maximumMonthAmount = roundMoney(dailyRate * coveredDays);

    const amountForMonth = Math.min(remaining, maximumMonthAmount);

    if (amountForMonth <= 0) {
      continue;
    }

    /*
      Only complete days count as attendance coverage.
    */
    const completeDays = Math.min(
      coveredDays,
      Math.floor((amountForMonth + 0.000001) / dailyRate),
    );

    if (completeDays <= 0) {
      /*
        Not enough money for one complete day.

        Do not create an allocation because the DB requires
        covered_days > 0.

        The money itself is still recorded at fee/payment level.
      */
      continue;
    }

    const completeDayAmount = roundMoney(dailyRate * completeDays);

    allocations.push({
      solar_year: month.solar_year,
      solar_month: month.solar_month,
      covered_days: completeDays,
      allocated_amount: completeDayAmount,
    });

    remaining = roundMoney(remaining - completeDayAmount);
  }

  return {
    allocations,
    unallocated_amount: remaining,
  };
}

/*
  Get month rows for a fee.
*/
async function getFeeMonths(client, feeId) {
  const result = await client.query(
    `SELECT
       fpm.id,
       fpm.fee_period_id,
       fpm.solar_year,
       fpm.solar_month,
       fpm.month_days,
       fpm.covered_days,
       fpm.monthly_amount,
       fpm.calculated_amount,
       fpm.created_at
     FROM fee_period_months fpm
     JOIN fee_periods fp
       ON fp.id = fpm.fee_period_id
     WHERE fp.fee_id = $1
     ORDER BY
       fpm.solar_year ASC,
       fpm.solar_month ASC,
       fpm.id ASC`,
    [feeId],
  );

  return result.rows;
}

/*
  ============================================================
  LEGACY SUBJECT FEE CONFIGURATION
  ============================================================
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
  ACTIVE STUDENT ENROLLMENTS
  ============================================================
*/

/*
  GET /api/fees/enrollments
*/
router.get(
  "/enrollments",
  authRequired,
  requireRoles("admin", "staff"),
  asyncH(async (req, res) => {
    const result = await query(
      `SELECT
         e.id AS enrollment_id,
         e.student_id,

         s.full_name AS student_name,
         s.roll_number,

         e.class_slot_id,

         cs.subject_id,
         sub.name AS subject_name,

         cs.teacher_id,
         t.full_name AS teacher_name,

         cs.start_time,
         cs.end_time,

         e.enrolled_on,
         e.is_active AS enrollment_active,
         cs.is_active AS class_active

       FROM student_enrollments e

       JOIN students s
         ON s.id = e.student_id

       JOIN class_slots cs
         ON cs.id = e.class_slot_id

       JOIN subjects sub
         ON sub.id = cs.subject_id

       JOIN teachers t
         ON t.id = cs.teacher_id

       WHERE e.is_active = TRUE
         AND cs.is_active = TRUE

       ORDER BY
         s.full_name ASC,
         sub.name ASC,
         cs.start_time ASC,
         e.id ASC`,
    );

    res.json(result.rows);
  }),
);

/*
  ============================================================
  FEE RECORDS
  ============================================================
*/

/*
  GET /api/fees
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
         f.created_at,

         fp.id AS fee_period_id,
         fp.enrollment_id,
         fp.from_date,
         fp.to_date,
         fp.covered_days

       FROM fees f

       JOIN students s
         ON s.id = f.student_id

       LEFT JOIN subjects sub
         ON sub.id = f.subject_id

       LEFT JOIN fee_periods fp
         ON fp.fee_id = f.id

       ${where}

       ORDER BY
         f.created_at DESC,
         f.id DESC`,
      params,
    );

    const rows = result.rows;

    const output = rows.map((row) => {
      const item = {
        ...row,
        is_period_based: Boolean(row.fee_period_id),
        coverage_info: null,
      };

      if (row.fee_period_id && row.from_date && row.to_date) {
        const fromSolar = dateToJalaali(row.from_date);

        const toSolar = dateToJalaali(row.to_date);

        item.coverage_info = {
          from_solar_date: formatSolarDate(
            fromSolar.jy,
            fromSolar.jm,
            fromSolar.jd,
          ),

          to_solar_date: formatSolarDate(toSolar.jy, toSolar.jm, toSolar.jd),

          covered_days: row.covered_days,
        };
      }

      if (!row.fee_period_id) {
        item.coverage_info = {
          legacy: true,
          label: "Legacy record",
        };
      }

      return item;
    });

    res.json(output);
  }),
);

/*
  ============================================================
  SINGLE FEE
  ============================================================
*/

/*
  GET /api/fees/:id
*/
router.get(
  "/:id([0-9]+)",
  authRequired,
  requireRoles("admin", "staff"),
  asyncH(async (req, res) => {
    const client = await pool.connect();

    try {
      const feeResult = await client.query(
        `SELECT
           f.*,

           s.full_name AS student_name,
           s.roll_number,
           s.guardian_name,
           s.guardian_phone,
           s.guardian_email,

           sub.name AS subject_name

         FROM fees f

         JOIN students s
           ON s.id = f.student_id

         LEFT JOIN subjects sub
           ON sub.id = f.subject_id

         WHERE f.id = $1`,
        [req.params.id],
      );

      if (!feeResult.rows.length) {
        return res.status(404).json({
          error: "Fee record not found",
        });
      }

      const fee = feeResult.rows[0];

      const periodResult = await client.query(
        `SELECT
           fp.id,
           fp.fee_id,
           fp.enrollment_id,
           fp.from_date,
           fp.to_date,
           fp.covered_days,
           fp.total_amount,
           fp.monthly_amount,
           fp.created_at,

           e.class_slot_id,
           e.enrolled_on,

           cs.subject_id,
           cs.teacher_id,
           cs.start_time,
           cs.end_time,

           sub.name AS subject_name,

           t.full_name AS teacher_name

         FROM fee_periods fp

         JOIN student_enrollments e
           ON e.id = fp.enrollment_id

         JOIN class_slots cs
           ON cs.id = e.class_slot_id

         JOIN subjects sub
           ON sub.id = cs.subject_id

         JOIN teachers t
           ON t.id = cs.teacher_id

         WHERE fp.fee_id = $1

         ORDER BY fp.id ASC`,
        [req.params.id],
      );

      const periods = [];

      for (const period of periodResult.rows) {
        const monthsResult = await client.query(
          `SELECT
             id,
             fee_period_id,
             solar_year,
             solar_month,
             month_days,
             covered_days,
             monthly_amount,
             calculated_amount,
             created_at

           FROM fee_period_months

           WHERE fee_period_id = $1

           ORDER BY
             solar_year ASC,
             solar_month ASC,
             id ASC`,
          [period.id],
        );

        const fromSolar = dateToJalaali(period.from_date);

        const toSolar = dateToJalaali(period.to_date);

        periods.push({
          ...period,

          from_solar_date: formatSolarDate(
            fromSolar.jy,
            fromSolar.jm,
            fromSolar.jd,
          ),

          to_solar_date: formatSolarDate(toSolar.jy, toSolar.jm, toSolar.jd),

          months: monthsResult.rows,
        });
      }

      const paymentsResult = await client.query(
        `SELECT
           fp.id,
           fp.fee_id,
           fp.amount,
           fp.payment_date,
           fp.receipt_number,
           fp.fee_period_id,
           fp.created_at

         FROM fee_payments fp

         WHERE fp.fee_id = $1

         ORDER BY
           fp.payment_date ASC,
           fp.id ASC`,
        [req.params.id],
      );

      const payments = [];

      for (const payment of paymentsResult.rows) {
        const allocationsResult = await client.query(
          `SELECT
             fpa.id,
             fpa.fee_payment_id,
             fpa.fee_period_month_id,
             fpa.covered_days,
             fpa.allocated_amount,

             fpm.solar_year,
             fpm.solar_month,
             fpm.month_days,
             fpm.monthly_amount,
             fpm.calculated_amount

           FROM fee_payment_allocations fpa

           JOIN fee_period_months fpm
             ON fpm.id = fpa.fee_period_month_id

           WHERE fpa.fee_payment_id = $1

           ORDER BY
             fpm.solar_year ASC,
             fpm.solar_month ASC,
             fpa.id ASC`,
          [payment.id],
        );

        let paymentSolarDate = null;

        if (payment.payment_date) {
          const solar = dateToJalaali(payment.payment_date);

          paymentSolarDate = formatSolarDate(solar.jy, solar.jm, solar.jd);
        }

        payments.push({
          ...payment,

          payment_solar_date: paymentSolarDate,

          allocations: allocationsResult.rows,
        });
      }

      let enrollment = null;

      if (periods.length) {
        const firstPeriod = periods[0];

        enrollment = {
          enrollment_id: firstPeriod.enrollment_id,

          class_slot_id: firstPeriod.class_slot_id,

          subject_id: firstPeriod.subject_id,

          subject_name: firstPeriod.subject_name,

          teacher_id: firstPeriod.teacher_id,

          teacher_name: firstPeriod.teacher_name,

          start_time: firstPeriod.start_time,

          end_time: firstPeriod.end_time,

          enrolled_on: firstPeriod.enrolled_on,
        };
      }

      res.json({
        ...fee,

        is_period_based: periods.length > 0,

        enrollment,

        periods,

        payments,
      });
    } finally {
      client.release();
    }
  }),
);

/*
  ============================================================
  PERIODS
  ============================================================
*/

/*
  GET /api/fees/:id/periods
*/
router.get(
  "/:id([0-9]+)/periods",
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

    const periods = await query(
      `SELECT
         fp.id,
         fp.fee_id,
         fp.enrollment_id,
         fp.from_date,
         fp.to_date,
         fp.covered_days,
         fp.total_amount,
         fp.monthly_amount,
         fp.created_at

       FROM fee_periods fp

       WHERE fp.fee_id = $1

       ORDER BY
         fp.from_date ASC,
         fp.id ASC`,
      [req.params.id],
    );

    const output = [];

    for (const period of periods.rows) {
      const months = await query(
        `SELECT
           id,
           fee_period_id,
           solar_year,
           solar_month,
           month_days,
           covered_days,
           monthly_amount,
           calculated_amount,
           created_at

         FROM fee_period_months

         WHERE fee_period_id = $1

         ORDER BY
           solar_year ASC,
           solar_month ASC,
           id ASC`,
        [period.id],
      );

      const fromSolar = dateToJalaali(period.from_date);

      const toSolar = dateToJalaali(period.to_date);

      output.push({
        ...period,

        from_solar_date: formatSolarDate(
          fromSolar.jy,
          fromSolar.jm,
          fromSolar.jd,
        ),

        to_solar_date: formatSolarDate(toSolar.jy, toSolar.jm, toSolar.jd),

        months: months.rows,
      });
    }

    res.json(output);
  }),
);

/*
  ============================================================
  PAYMENT HISTORY
  ============================================================
*/

/*
  GET /api/fees/:id/payments
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
         fp.id,
         fp.fee_id,
         fp.amount,
         fp.payment_date,
         fp.receipt_number,
         fp.fee_period_id,
         fp.created_at

       FROM fee_payments fp

       WHERE fp.fee_id = $1

       ORDER BY
         fp.payment_date ASC,
         fp.id ASC`,
      [req.params.id],
    );

    const payments = [];

    for (const payment of result.rows) {
      const allocations = await query(
        `SELECT
           fpa.id,
           fpa.fee_payment_id,
           fpa.fee_period_month_id,
           fpa.covered_days,
           fpa.allocated_amount,

           fpm.solar_year,
           fpm.solar_month,
           fpm.month_days,
           fpm.monthly_amount,
           fpm.calculated_amount

         FROM fee_payment_allocations fpa

         JOIN fee_period_months fpm
           ON fpm.id = fpa.fee_period_month_id

         WHERE fpa.fee_payment_id = $1

         ORDER BY
           fpm.solar_year ASC,
           fpm.solar_month ASC,
           fpa.id ASC`,
        [payment.id],
      );

      let paymentSolarDate = null;

      if (payment.payment_date) {
        const solar = dateToJalaali(payment.payment_date);

        paymentSolarDate = formatSolarDate(solar.jy, solar.jm, solar.jd);
      }

      payments.push({
        ...payment,

        payment_solar_date: paymentSolarDate,

        allocations: allocations.rows,
      });
    }

    res.json(payments);
  }),
);

/*
  ============================================================
  CREATE FEE
  ============================================================
*/

/*
  POST /api/fees
*/
router.post(
  "/",
  authRequired,
  requireRoles("admin", "staff"),
  asyncH(async (req, res) => {
    const {
      student_id,
      enrollment_id,
      from_solar_date,
      to_solar_date,
      monthly_amounts,
      initial_paid_amount,
      initial_payment_solar_date,
      academic_year,
      description,
    } = req.body;

    if (!student_id) {
      return res.status(400).json({
        error: "Student is required",
      });
    }

    if (!enrollment_id) {
      return res.status(400).json({
        error: "Enrollment is required",
      });
    }

    if (!from_solar_date) {
      return res.status(400).json({
        error: "From date is required",
      });
    }

    if (!to_solar_date) {
      return res.status(400).json({
        error: "To date is required",
      });
    }

    if (!Array.isArray(monthly_amounts)) {
      return res.status(400).json({
        error: "Monthly fee amounts are required",
      });
    }

    const initialPaid =
      initial_paid_amount === undefined ||
      initial_paid_amount === null ||
      initial_paid_amount === ""
        ? 0
        : Number(initial_paid_amount);

    if (!Number.isFinite(initialPaid) || initialPaid < 0) {
      return res.status(400).json({
        error: "Initial paid amount must be zero or greater",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      /*
        Verify student.
      */
      const studentResult = await client.query(
        `SELECT
           id,
           full_name,
           roll_number,
           guardian_name,
           guardian_phone
         FROM students
         WHERE id = $1`,
        [student_id],
      );

      if (!studentResult.rows.length) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          error: "Student not found",
        });
      }

      /*
        Verify enrollment.

        IMPORTANT FIX:
        This MUST start from student_enrollments e.

        The previous version incorrectly started from
        fee_periods fp while referencing e.
      */
      const enrollmentResult = await client.query(
        `SELECT
           e.id,
           e.student_id,
           e.class_slot_id,
           e.enrolled_on,

           cs.subject_id,
           cs.teacher_id,
           cs.start_time,
           cs.end_time,

           sub.name AS subject_name,

           t.full_name AS teacher_name

         FROM student_enrollments e

         JOIN class_slots cs
           ON cs.id = e.class_slot_id

         JOIN subjects sub
           ON sub.id = cs.subject_id

         JOIN teachers t
           ON t.id = cs.teacher_id

         WHERE e.id = $1
           AND e.student_id = $2
           AND e.is_active = TRUE
           AND cs.is_active = TRUE

         FOR UPDATE OF e`,
        [enrollment_id, student_id],
      );

      if (!enrollmentResult.rows.length) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          error: "Active enrollment not found for this student",
        });
      }

      const enrollment = enrollmentResult.rows[0];

      /*
        Calculate requested period.
      */
      let period;

      try {
        period = calculatePeriodMonths(
          from_solar_date,
          to_solar_date,
          monthly_amounts,
        );
      } catch (error) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          error: error.message,
        });
      }

      /*
        Reject monthly fee entries outside
        the selected period.
      */
      for (const item of monthly_amounts) {
        const key = `${Number(item.solar_year)}-${Number(item.solar_month)}`;

        const used = period.months.some(
          (month) => `${month.solar_year}-${month.solar_month}` === key,
        );

        if (!used) {
          await client.query("ROLLBACK");

          return res.status(400).json({
            error: `Monthly fee supplied for ${item.solar_year}/${item.solar_month}, but that month is outside the selected period`,
          });
        }
      }

      /*
        Prevent overlapping fee coverage.
      */
      const overlapResult = await client.query(
        `SELECT
           fp.id,
           fp.from_date,
           fp.to_date

         FROM fee_periods fp

         WHERE fp.enrollment_id = $1

           AND fp.from_date <= $3::date
           AND fp.to_date >= $2::date

         FOR UPDATE`,
        [enrollment_id, period.from_date, period.to_date],
      );

      if (overlapResult.rows.length) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          error:
            "This enrollment already has fee coverage that overlaps the selected dates",

          overlapping_periods: overlapResult.rows,
        });
      }

      const totalAmount = period.total_amount;

      if (initialPaid > totalAmount) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          error: "Initial payment cannot be greater than the total fee",
        });
      }

      const initialDue = roundMoney(totalAmount - initialPaid);

      const initialStatus =
        initialDue === 0 ? "paid" : initialPaid > 0 ? "partial" : "pending";

      /*
        Convert Solar payment date to Gregorian
        for PostgreSQL.
      */
      let initialPaymentDate = null;

      if (initialPaid > 0) {
        const solarPayment = initial_payment_solar_date
          ? parseSolarDate(initial_payment_solar_date)
          : parseSolarDate(getCurrentSolarDate());

        initialPaymentDate = solarPayment.gregorianDate;
      }

      /*
        Generate receipt number when there
        is an initial payment.
      */
      let receiptNumber = null;

      if (initialPaid > 0) {
        const receiptResult = await client.query(
          `SELECT
             COUNT(*)::int + 1 AS next_number
           FROM fee_payments`,
        );

        const nextNumber = receiptResult.rows[0].next_number;

        const datePart = new Date()
          .toISOString()
          .slice(0, 10)
          .replace(/-/g, "");

        receiptNumber = `REC-${datePart}-${String(nextNumber).padStart(
          4,
          "0",
        )}`;
      }

      /*
        Create fee summary.
      */
      const feeResult = await client.query(
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
           $4,
           $5,
           $6,
           $7,
           $8,
           $9,
           $10
         )
         RETURNING *`,
        [
          student_id,
          enrollment.subject_id,
          totalAmount,
          initialPaid,
          initialDue,
          initialStatus,
          initialPaymentDate,
          receiptNumber,
          academic_year || null,
          description || null,
        ],
      );

      const fee = feeResult.rows[0];

      /*
        Create fee period.
      */
      const periodResult = await client.query(
        `INSERT INTO fee_periods
         (
           fee_id,
           enrollment_id,
           from_date,
           to_date,
           covered_days,
           total_amount,
           monthly_amount
         )
         VALUES
         (
           $1,
           $2,
           $3,
           $4,
           $5,
           $6,
           NULL
         )
         RETURNING *`,
        [
          fee.id,
          enrollment_id,
          period.from_date,
          period.to_date,
          period.covered_days,
          period.total_amount,
        ],
      );

      const feePeriod = periodResult.rows[0];

      /*
        Create one row per Solar Hijri month.
      */
      const monthRows = [];

      for (const month of period.months) {
        const monthResult = await client.query(
          `INSERT INTO fee_period_months
           (
             fee_period_id,
             solar_year,
             solar_month,
             month_days,
             covered_days,
             monthly_amount,
             calculated_amount
           )
           VALUES
           (
             $1,
             $2,
             $3,
             $4,
             $5,
             $6,
             $7
           )
           RETURNING *`,
          [
            feePeriod.id,
            month.solar_year,
            month.solar_month,
            month.month_days,
            month.covered_days,
            month.monthly_amount,
            month.calculated_amount,
          ],
        );

        monthRows.push(monthResult.rows[0]);
      }

      /*
        Initial payment.
      */
      let payment = null;
      let allocations = [];

      if (initialPaid > 0) {
        const paymentResult = await client.query(
          `INSERT INTO fee_payments
           (
             fee_id,
             amount,
             payment_date,
             receipt_number,
             fee_period_id
           )
           VALUES
           (
             $1,
             $2,
             $3,
             $4,
             $5
           )
           RETURNING *`,
          [
            fee.id,
            initialPaid,
            initialPaymentDate,
            receiptNumber,
            feePeriod.id,
          ],
        );

        payment = paymentResult.rows[0];

        /*
          Calculate complete-day coverage.

          Any remainder that cannot form a complete
          attendance day remains financially recorded
          at fee/payment level.
        */
        const coverage = calculatePaidCoverage(initialPaid, monthRows);

        for (const allocation of coverage.allocations) {
          const month = monthRows.find(
            (item) =>
              Number(item.solar_year) === Number(allocation.solar_year) &&
              Number(item.solar_month) === Number(allocation.solar_month),
          );

          if (!month) {
            continue;
          }

          const allocationResult = await client.query(
            `INSERT INTO fee_payment_allocations
               (
                 fee_payment_id,
                 fee_period_month_id,
                 covered_days,
                 allocated_amount
               )
               VALUES
               (
                 $1,
                 $2,
                 $3,
                 $4
               )
               RETURNING *`,
            [
              payment.id,
              month.id,
              allocation.covered_days,
              allocation.allocated_amount,
            ],
          );

          allocations.push(allocationResult.rows[0]);
        }
      }

      await client.query("COMMIT");

      res.status(201).json({
        message: "Fee record created successfully",

        fee,

        period: {
          ...feePeriod,

          from_solar_date: period.from_solar_date,

          to_solar_date: period.to_solar_date,

          months: monthRows,
        },

        enrollment: {
          enrollment_id: enrollment.id,
          student_id: enrollment.student_id,
          class_slot_id: enrollment.class_slot_id,
          subject_id: enrollment.subject_id,
          subject_name: enrollment.subject_name,
          teacher_id: enrollment.teacher_id,
          teacher_name: enrollment.teacher_name,
          start_time: enrollment.start_time,
          end_time: enrollment.end_time,
          enrolled_on: enrollment.enrolled_on,
        },

        payment,

        allocations,
      });
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {}

      throw error;
    } finally {
      client.release();
    }
  }),
);

/*
  ============================================================
  EDIT FEE
  ============================================================
*/

/*
  PUT /api/fees/:id

  Period-based:
    only academic_year + description

  Legacy:
    keeps older editable fields.
*/
router.put(
  "/:id([0-9]+)",
  authRequired,
  requireRoles("admin", "staff"),
  asyncH(async (req, res) => {
    const { total_amount, subject_id, academic_year, description } = req.body;

    const existing = await query(
      `SELECT
         f.*,

         EXISTS (
           SELECT 1
           FROM fee_periods fp
           WHERE fp.fee_id = f.id
         ) AS is_period_based

       FROM fees f

       WHERE f.id = $1`,
      [req.params.id],
    );

    if (!existing.rows.length) {
      return res.status(404).json({
        error: "Fee record not found",
      });
    }

    const fee = existing.rows[0];

    /*
      Period-based fee:
      do NOT modify financial coverage.
    */
    if (fee.is_period_based) {
      const result = await query(
        `UPDATE fees
         SET
           academic_year =
             CASE
               WHEN $1::text IS NULL
               THEN academic_year
               ELSE $1
             END,

           description =
             CASE
               WHEN $2::text IS NULL
               THEN description
               ELSE $2
             END

         WHERE id = $3

         RETURNING *`,
        [
          academic_year !== undefined ? academic_year : null,

          description !== undefined ? description : null,

          req.params.id,
        ],
      );

      return res.json({
        ...result.rows[0],
        message: "Fee information updated successfully",
      });
    }

    /*
      Legacy fee editing.
    */
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

    const dueAmount = roundMoney(newTotal - paidAmount);

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

         academic_year =
           CASE
             WHEN $5::text IS NULL
             THEN academic_year
             ELSE $5
           END,

         description =
           CASE
             WHEN $6::text IS NULL
             THEN description
             ELSE $6
           END

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

  Period-based:
    {
      amount: 500,
      payment_solar_date: "1405/06/26"
    }

  Legacy:
    {
      amount: 500,
      payment_date: "2026-09-17"
    }
*/
router.post(
  "/:id([0-9]+)/payment",
  authRequired,
  requireRoles("admin", "staff"),
  asyncH(async (req, res) => {
    const { amount, payment_date, payment_solar_date } = req.body;

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

      /*
        Lock fee summary.
      */
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

      const currentDue = Math.max(roundMoney(total - currentPaid), 0);

      if (paymentAmount > currentDue) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          error: `Payment cannot be greater than the remaining due amount of ${currentDue}`,
        });
      }

      /*
        Determine whether period-based.
      */
      const periodResult = await client.query(
        `SELECT
           fp.*,
           e.class_slot_id

         FROM fee_periods fp

         JOIN student_enrollments e
           ON e.id = fp.enrollment_id

         WHERE fp.fee_id = $1

         ORDER BY fp.id ASC

         LIMIT 1`,
        [req.params.id],
      );

      const isPeriodBased = periodResult.rows.length > 0;

      let finalPaymentDate = null;
      let feePeriodId = null;

      if (isPeriodBased) {
        const period = periodResult.rows[0];

        feePeriodId = period.id;

        const solarPaymentDate = payment_solar_date || getCurrentSolarDate();

        try {
          const parsed = parseSolarDate(solarPaymentDate);

          finalPaymentDate = parsed.gregorianDate;
        } catch (error) {
          await client.query("ROLLBACK");

          return res.status(400).json({
            error: error.message,
          });
        }
      } else {
        /*
          Legacy payment.
        */
        if (payment_date) {
          const parsed = new Date(payment_date);

          if (Number.isNaN(parsed.getTime())) {
            await client.query("ROLLBACK");

            return res.status(400).json({
              error: "Invalid payment date",
            });
          }

          finalPaymentDate = payment_date;
        } else {
          finalPaymentDate = new Date().toISOString().slice(0, 10);
        }
      }

      /*
        Generate receipt number.
      */
      const receiptResult = await client.query(
        `SELECT
             COUNT(*)::int + 1 AS next_number
           FROM fee_payments`,
      );

      const nextNumber = receiptResult.rows[0].next_number;

      const receiptDate = new Date()
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, "");

      const receiptNumber = `REC-${receiptDate}-${String(nextNumber).padStart(
        4,
        "0",
      )}`;

      /*
        Insert payment.
      */
      const paymentResult = await client.query(
        `INSERT INTO fee_payments
           (
             fee_id,
             amount,
             payment_date,
             receipt_number,
             fee_period_id
           )
           VALUES
           (
             $1,
             $2,
             $3,
             $4,
             $5
           )
           RETURNING *`,
        [
          req.params.id,
          paymentAmount,
          finalPaymentDate,
          receiptNumber,
          feePeriodId,
        ],
      );

      const payment = paymentResult.rows[0];

      /*
        Update fee summary.
      */
      const newPaid = roundMoney(currentPaid + paymentAmount);

      const newDue = Math.max(roundMoney(total - newPaid), 0);

      const newStatus =
        newDue === 0 ? "paid" : newPaid > 0 ? "partial" : "pending";

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

      let allocations = [];

      /*
        Period-based allocation.
      */
      if (isPeriodBased) {
        const monthResult = await client.query(
          `SELECT
               fpm.id,
               fpm.fee_period_id,
               fpm.solar_year,
               fpm.solar_month,
               fpm.month_days,
               fpm.covered_days,
               fpm.monthly_amount,
               fpm.calculated_amount,

               COALESCE(
                 SUM(
                   fpa.covered_days
                 ),
                 0
               ) AS already_paid_days

             FROM fee_period_months fpm

             LEFT JOIN fee_payment_allocations fpa
               ON fpa.fee_period_month_id =
                  fpm.id

             WHERE fpm.fee_period_id = $1

             GROUP BY
               fpm.id,
               fpm.fee_period_id,
               fpm.solar_year,
               fpm.solar_month,
               fpm.month_days,
               fpm.covered_days,
               fpm.monthly_amount,
               fpm.calculated_amount

             ORDER BY
               fpm.solar_year ASC,
               fpm.solar_month ASC,
               fpm.id ASC`,
          [feePeriodId],
        );

        /*
          Build remaining coverage for each month.

          Example:

          Month has 30 paid-coverage days.
          Previous payments covered 10.

          New payment can therefore cover
          at most 20 additional days.
        */
        const remainingMonths = monthResult.rows.map((month) => ({
          ...month,

          covered_days: Math.max(
            Number(month.covered_days) - Number(month.already_paid_days),
            0,
          ),
        }));

        const coverage = calculatePaidCoverage(paymentAmount, remainingMonths);

        /*
          IMPORTANT:

          We intentionally DO NOT reject a payment
          when a tiny/fractional remainder cannot
          create another complete attendance day.

          The complete payment is still stored in:
            fees.paid_amount
            fee_payments.amount

          Only complete days are added to
          fee_payment_allocations.
        */
        for (const allocation of coverage.allocations) {
          if (allocation.covered_days <= 0) {
            continue;
          }

          const month = monthResult.rows.find(
            (item) =>
              Number(item.solar_year) === Number(allocation.solar_year) &&
              Number(item.solar_month) === Number(allocation.solar_month),
          );

          if (!month) {
            continue;
          }

          const allocationResult = await client.query(
            `INSERT INTO fee_payment_allocations
               (
                 fee_payment_id,
                 fee_period_month_id,
                 covered_days,
                 allocated_amount
               )
               VALUES
               (
                 $1,
                 $2,
                 $3,
                 $4
               )
               RETURNING *`,
            [
              payment.id,
              month.id,
              allocation.covered_days,
              allocation.allocated_amount,
            ],
          );

          allocations.push(allocationResult.rows[0]);
        }
      }

      await client.query("COMMIT");

      let paymentSolarDate = null;

      if (finalPaymentDate) {
        const solar = dateToJalaali(finalPaymentDate);

        paymentSolarDate = formatSolarDate(solar.jy, solar.jm, solar.jd);
      }

      res.json({
        message: "Payment recorded successfully",

        fee: feeResult.rows[0],

        payment: {
          ...payment,
          payment_solar_date: paymentSolarDate,
        },

        allocations,
      });
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {}

      throw error;
    } finally {
      client.release();
    }
  }),
);

/*
  ============================================================
  RECEIPT
  ============================================================
*/

/*
  GET /api/fees/:id/receipt
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

    let paymentSolarDate = null;

    if (receipt.payment_date) {
      const solar = dateToJalaali(receipt.payment_date);

      paymentSolarDate = formatSolarDate(solar.jy, solar.jm, solar.jd);
    }

    res.json({
      ...receipt,
      payment_solar_date: paymentSolarDate,
    });
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
