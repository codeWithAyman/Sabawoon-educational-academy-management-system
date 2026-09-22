const express = require("express");
const { query, pool } = require("../db/pool");
const { authRequired, requireRoles } = require("../middleware/auth");
const { asyncH } = require("../utils/helpers");

const { parseSolarDate } = require("../utils/feePeriod");
const {
  getJalaaliMonthDays,
  dateToJalaali,
  formatSolarDate,
  jalaaliToDate,
} = require("../utils/solarDate");

const router = express.Router();

/* ============================================================
   HELPERS
============================================================ */

function roundMoney(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.round(number / 10) * 10;
}

function isMultipleOfTen(value) {
  const number = Number(value);

  return (
    Number.isFinite(number) &&
    Number.isInteger(number) &&
    number > 0 &&
    number % 10 === 0
  );
}

function getKabulGregorianDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kabul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return new Date(
    Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      12,
      0,
      0,
      0,
    ),
  );
}

function getCurrentSolarDate() {
  const now = getKabulGregorianDate();
  const solar = dateToJalaali(now);

  return formatSolarDate(solar.jy, solar.jm, solar.jd);
}

function getSolarMonthDateRange(solarYear, solarMonth) {
  const monthDays = getJalaaliMonthDays(solarYear, solarMonth);

  const first = jalaaliToDate(solarYear, solarMonth, 1);
  const last = jalaaliToDate(solarYear, solarMonth, monthDays);

  return {
    from_date: first,
    to_date: last,
    month_days: monthDays,
  };
}

function getMonthCoverageRange(period, month) {
  const monthRange = getSolarMonthDateRange(
    Number(month.solar_year),
    Number(month.solar_month),
  );

  const periodFrom = new Date(period.from_date);
  const periodTo = new Date(period.to_date);

  const fromDate =
    periodFrom > monthRange.from_date ? periodFrom : monthRange.from_date;

  const toDate = periodTo < monthRange.to_date ? periodTo : monthRange.to_date;

  return {
    from_date: fromDate,
    to_date: toDate,
  };
}

function addDays(date, days) {
  const result = new Date(date);

  if (Number.isNaN(result.getTime())) {
    throw new Error("Invalid Gregorian date");
  }

  result.setUTCDate(result.getUTCDate() + Number(days));

  return result;
}

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

    if (!isMultipleOfTen(monthlyAmount)) {
      throw new Error(
        `Monthly fee for ${solarYear}/${String(solarMonth).padStart(
          2,
          "0",
        )} must be a positive multiple of 10`,
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

      const rawCalculatedAmount = (monthlyAmount / monthDays) * coveredDays;

      const calculatedAmount = roundMoney(rawCalculatedAmount);

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

function calculateDaysAmount(monthlyAmount, monthDays, days) {
  const amount = Number(monthlyAmount);
  const totalDays = Number(monthDays);
  const coveredDays = Number(days);

  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !Number.isFinite(totalDays) ||
    totalDays <= 0 ||
    !Number.isFinite(coveredDays) ||
    coveredDays <= 0
  ) {
    return 0;
  }

  return roundMoney((amount / totalDays) * coveredDays);
}

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

    let completeDays = 0;
    let completeDayAmount = 0;

    for (let dayCount = 1; dayCount <= coveredDays; dayCount++) {
      const amountForDays = calculateDaysAmount(
        monthlyAmount,
        monthDays,
        dayCount,
      );

      if (amountForDays <= remaining) {
        completeDays = dayCount;
        completeDayAmount = amountForDays;
      } else {
        break;
      }
    }

    if (completeDays <= 0 || completeDayAmount <= 0) {
      continue;
    }

    allocations.push({
      solar_year: Number(month.solar_year),
      solar_month: Number(month.solar_month),
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

function calculateAllocationDates(
  period,
  month,
  alreadyPaidDays,
  newCoveredDays,
) {
  const range = getMonthCoverageRange(period, month);

  const fromDate = addDays(range.from_date, Number(alreadyPaidDays));

  const toDate = addDays(fromDate, Number(newCoveredDays) - 1);

  return {
    from_date: fromDate,
    to_date: toDate,
  };
}

function toSolarDateValue(date) {
  if (!date) {
    return null;
  }

  const solar = dateToJalaali(date);

  return formatSolarDate(solar.jy, solar.jm, solar.jd);
}

async function recordPaymentAudit(
  client,
  {
    paymentId = null,
    receiptNumber = null,
    action,
    req,
    oldData = null,
    newData = null,
  },
) {
  await client.query(
    `INSERT INTO fee_payment_audit (
       fee_payment_id,
       receipt_number,
       action,
       performed_by,
       performed_by_name,
       performed_by_role,
       old_data,
       new_data
     )
     VALUES (
       $1,
       $2,
       $3,
       $4,
       $5,
       $6,
       $7::jsonb,
       $8::jsonb
     )`,
    [
      paymentId,
      receiptNumber,
      action,
      req.user?.id ?? null,
      req.user?.name ?? null,
      req.user?.role ?? null,
      oldData ? JSON.stringify(oldData) : null,
      newData ? JSON.stringify(newData) : null,
    ],
  );
}

async function getPaymentForMonths(client, paymentId) {
  const result = await client.query(
    `SELECT DISTINCT
       fpm.solar_year,
       fpm.solar_month
     FROM fee_payment_allocations fpa
     JOIN fee_period_months fpm
       ON fpm.id = fpa.fee_period_month_id
     WHERE fpa.fee_payment_id = $1
     ORDER BY
       fpm.solar_year ASC,
       fpm.solar_month ASC`,
    [paymentId],
  );

  return result.rows.map((row) => `${row.solar_year}/${row.solar_month}`);
}

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

async function rebuildFeePeriodAllocations(client, feePeriodId) {
  await client.query(
    `DELETE FROM fee_payment_allocations
     WHERE fee_period_month_id IN (
       SELECT id
       FROM fee_period_months
       WHERE fee_period_id = $1
     )`,
    [feePeriodId],
  );

  const periodResult = await client.query(
    `SELECT
       id,
       fee_id,
       enrollment_id,
       from_date,
       to_date,
       covered_days,
       total_amount
     FROM fee_periods
     WHERE id = $1
     FOR UPDATE`,
    [feePeriodId],
  );

  if (!periodResult.rows.length) {
    throw new Error("Fee period not found");
  }

  const period = periodResult.rows[0];

  const monthResult = await client.query(
    `SELECT
       id,
       fee_period_id,
       solar_year,
       solar_month,
       month_days,
       covered_days,
       monthly_amount,
       calculated_amount
     FROM fee_period_months
     WHERE fee_period_id = $1
     ORDER BY
       solar_year ASC,
       solar_month ASC,
       id ASC`,
    [feePeriodId],
  );

  const paymentResult = await client.query(
    `SELECT
       id,
       fee_id,
       amount,
       payment_date,
       receipt_number,
       fee_period_id,
       created_at
     FROM fee_payments
     WHERE fee_period_id = $1
     ORDER BY
       payment_date ASC,
       id ASC
     FOR UPDATE`,
    [feePeriodId],
  );

  const paidDaysByMonth = new Map();
  const allocations = [];

  for (const payment of paymentResult.rows) {
    const remainingMonths = monthResult.rows.map((month) => ({
      ...month,

      already_paid_days: Number(paidDaysByMonth.get(month.id) || 0),

      covered_days: Math.max(
        Number(month.covered_days) - Number(paidDaysByMonth.get(month.id) || 0),
        0,
      ),
    }));

    const coverage = calculatePaidCoverage(
      Number(payment.amount),
      remainingMonths,
    );

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

      const alreadyPaidDays = Number(paidDaysByMonth.get(month.id) || 0);

      const dates = calculateAllocationDates(
        period,
        month,
        alreadyPaidDays,
        allocation.covered_days,
      );

      const allocationResult = await client.query(
        `INSERT INTO fee_payment_allocations
         (
           fee_payment_id,
           fee_period_month_id,
           covered_days,
           allocated_amount,
           from_date,
           to_date
         )
         VALUES
         (
           $1,
           $2,
           $3,
           $4,
           $5,
           $6
         )
         RETURNING *`,
        [
          payment.id,
          month.id,
          allocation.covered_days,
          allocation.allocated_amount,
          dates.from_date,
          dates.to_date,
        ],
      );

      allocations.push(allocationResult.rows[0]);

      paidDaysByMonth.set(month.id, alreadyPaidDays + allocation.covered_days);
    }
  }

  return {
    period,
    months: monthResult.rows,
    payments: paymentResult.rows,
    allocations,
  };
}

async function recalculateFeeTotals(client, feeId) {
  const feeResult = await client.query(
    `SELECT
       id,
       total_amount,
       status
     FROM fees
     WHERE id = $1
     FOR UPDATE`,
    [feeId],
  );

  if (!feeResult.rows.length) {
    throw new Error("Fee record not found");
  }

  const fee = feeResult.rows[0];

  const paidResult = await client.query(
    `SELECT
       COALESCE(SUM(amount), 0) AS paid_amount
     FROM fee_payments
     WHERE fee_id = $1`,
    [feeId],
  );

  const paidAmount = roundMoney(Number(paidResult.rows[0].paid_amount));

  const totalAmount = roundMoney(Number(fee.total_amount));

  const dueAmount = Math.max(roundMoney(totalAmount - paidAmount), 0);

  let status = "pending";

  if (paidAmount >= totalAmount) {
    status = "paid";
  } else if (paidAmount > 0) {
    status = "partial";
  }

  const latestPaymentResult = await client.query(
    `SELECT
       payment_date,
       receipt_number
     FROM fee_payments
     WHERE fee_id = $1
     ORDER BY
       payment_date DESC,
       id DESC
     LIMIT 1`,
    [feeId],
  );

  const latestPayment = latestPaymentResult.rows[0] || null;

  const result = await client.query(
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
      paidAmount,
      dueAmount,
      status,
      latestPayment ? latestPayment.payment_date : null,
      latestPayment ? latestPayment.receipt_number : null,
      feeId,
    ],
  );

  return result.rows[0];
}

/* ============================================================
   LEGACY SUBJECT FEE CONFIGURATION
============================================================ */

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

    if (!isMultipleOfTen(numericAmount)) {
      return res.status(400).json({
        error: "Amount must be a positive multiple of 10",
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

    if (!isMultipleOfTen(numericAmount)) {
      return res.status(400).json({
        error: "Amount must be a positive multiple of 10",
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

/* ============================================================
   ACTIVE STUDENT ENROLLMENTS
============================================================ */

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
         s.guardian_name AS father_name,

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

/* ============================================================
   FEE RECORDS
============================================================ */

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

    const output = result.rows.map((row) => {
      const item = {
        ...row,
        is_period_based: Boolean(row.fee_period_id),
        coverage_info: null,
      };

      if (row.fee_period_id && row.from_date && row.to_date) {
        item.coverage_info = {
          from_solar_date: toSolarDateValue(row.from_date),
          to_solar_date: toSolarDateValue(row.to_date),
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

/* ============================================================
   ENROLLMENT PAYMENT HISTORY
============================================================ */

router.get(
  "/enrollments/:enrollmentId/history",
  authRequired,
  requireRoles("admin", "staff"),
  asyncH(async (req, res) => {
    const enrollmentId = Number(req.params.enrollmentId);

    if (!Number.isInteger(enrollmentId) || enrollmentId <= 0) {
      return res.status(400).json({
        error: "Invalid enrollment ID",
      });
    }

    const enrollmentResult = await query(
      `
      SELECT
        e.id AS enrollment_id,
        e.student_id,

        s.full_name AS student_name,
        s.roll_number,
        s.guardian_name AS father_name,
        s.guardian_phone,

        e.enrolled_on,

        cs.id AS class_slot_id,
        cs.start_time,
        cs.end_time,

        sub.id AS subject_id,
        sub.name AS subject_name,

        t.id AS teacher_id,
        t.full_name AS teacher_name

      FROM student_enrollments e

      JOIN students s
        ON s.id = e.student_id

      JOIN class_slots cs
        ON cs.id = e.class_slot_id

      JOIN subjects sub
        ON sub.id = cs.subject_id

      JOIN teachers t
        ON t.id = cs.teacher_id

      WHERE e.id = $1
      LIMIT 1
      `,
      [enrollmentId],
    );

    if (!enrollmentResult.rows.length) {
      return res.status(404).json({
        error: "Enrollment not found",
      });
    }

    const enrollment = enrollmentResult.rows[0];

    const periodsResult = await query(
      `
      SELECT
        fp.id AS fee_period_id,
        fp.fee_id,
        fp.enrollment_id,

        fp.from_date,
        fp.to_date,
        fp.covered_days,
        fp.total_amount,
        fp.monthly_amount,

        f.status AS fee_status,
        f.total_amount AS fee_total_amount,
        f.paid_amount AS fee_paid_amount,
        f.due_amount AS fee_due_amount,

        COALESCE(
          (
            SELECT SUM(fpa.allocated_amount)
            FROM fee_payment_allocations fpa
            JOIN fee_period_months fpm
              ON fpm.id = fpa.fee_period_month_id
            WHERE fpm.fee_period_id = fp.id
          ),
          0
        ) AS allocated_paid_amount,

        COALESCE(
          (
            SELECT SUM(fpa.covered_days)
            FROM fee_payment_allocations fpa
            JOIN fee_period_months fpm
              ON fpm.id = fpa.fee_period_month_id
            WHERE fpm.fee_period_id = fp.id
          ),
          0
        ) AS paid_days

      FROM fee_periods fp

      JOIN fees f
        ON f.id = fp.fee_id

      WHERE fp.enrollment_id = $1

      ORDER BY
        fp.from_date DESC,
        fp.id DESC
      `,
      [enrollmentId],
    );

    const monthsResult = await query(
      `
      SELECT
        fpm.id AS fee_period_month_id,
        fpm.fee_period_id,

        fp.fee_id,
        fp.from_date AS period_from_date,
        fp.to_date AS period_to_date,

        fpm.solar_year,
        fpm.solar_month,

        fpm.month_days,
        fpm.covered_days,

        fpm.monthly_amount,
        fpm.calculated_amount,

        f.status AS fee_status,
        f.total_amount AS fee_total_amount,
        f.paid_amount AS fee_paid_amount,
        f.due_amount AS fee_due_amount,

        COALESCE(
          SUM(fpa.covered_days),
          0
        ) AS paid_days,

        COALESCE(
          SUM(fpa.allocated_amount),
          0
        ) AS paid_amount

      FROM fee_period_months fpm

      JOIN fee_periods fp
        ON fp.id = fpm.fee_period_id

      JOIN fees f
        ON f.id = fp.fee_id

      LEFT JOIN fee_payment_allocations fpa
        ON fpa.fee_period_month_id = fpm.id

      WHERE fp.enrollment_id = $1

      GROUP BY
        fpm.id,
        fpm.fee_period_id,
        fp.fee_id,
        fp.from_date,
        fp.to_date,

        fpm.solar_year,
        fpm.solar_month,

        fpm.month_days,
        fpm.covered_days,

        fpm.monthly_amount,
        fpm.calculated_amount,

        f.status,
        f.total_amount,
        f.paid_amount,
        f.due_amount

      ORDER BY
        fpm.solar_year DESC,
        fpm.solar_month DESC
      `,
      [enrollmentId],
    );

    const paymentsResult = await query(
      `
      SELECT
        fp.id AS payment_id,
        fp.amount,
        fp.payment_date,
        fp.receipt_number,
        fp.comment,
        fp.created_at,
        fp.recorded_by,

        recorded_user.full_name AS recorded_by_name,
        recorded_user.role AS recorded_by_role,

        COALESCE(
          SUM(fpa.allocated_amount),
          0
        ) AS allocated_amount,

        COALESCE(
          SUM(fpa.covered_days),
          0
        ) AS covered_days,

        MIN(fpa.from_date) AS coverage_from_date,
        MAX(fpa.to_date) AS coverage_to_date,

        ARRAY(
          SELECT DISTINCT
            fpm2.solar_year::text || '/' || fpm2.solar_month::text
          FROM fee_payment_allocations fpa2
          JOIN fee_period_months fpm2
            ON fpm2.id = fpa2.fee_period_month_id
          WHERE fpa2.fee_payment_id = fp.id
          ORDER BY 1
        ) AS payment_for_months

      FROM fee_payments fp

      LEFT JOIN users recorded_user
        ON recorded_user.id = fp.recorded_by

      LEFT JOIN fee_payment_allocations fpa
        ON fpa.fee_payment_id = fp.id

      LEFT JOIN fee_period_months fpm
        ON fpm.id = fpa.fee_period_month_id

      LEFT JOIN fee_periods fper
        ON fper.id = fpm.fee_period_id

      WHERE fper.enrollment_id = $1

      GROUP BY
        fp.id,
        fp.amount,
        fp.payment_date,
        fp.receipt_number,
        fp.comment,
        fp.created_at,
        fp.recorded_by,
        recorded_user.full_name,
        recorded_user.role

      ORDER BY
        fp.payment_date DESC,
        fp.id DESC
      `,
      [enrollmentId],
    );

    const payments = paymentsResult.rows.map((payment) => ({
      ...payment,

      payment_solar_date: toSolarDateValue(payment.payment_date),

      coverage_from_solar_date: toSolarDateValue(payment.coverage_from_date),

      coverage_to_solar_date: toSolarDateValue(payment.coverage_to_date),
    }));

    const currentSolarDate = getCurrentSolarDate();
    const currentSolar = parseSolarDate(currentSolarDate);

    res.json({
      enrollment,

      periods: periodsResult.rows,

      months: monthsResult.rows,

      payments,

      current_solar_date: currentSolarDate,

      current_solar_year: currentSolar.jy,
      current_solar_month: currentSolar.jm,
      current_solar_day: currentSolar.jd,
    });
  }),
);

/* ============================================================
   PAYMENT HISTORY FOR ONE FEE
============================================================ */

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
         fp.comment,
         fp.fee_period_id,
         fp.created_at,
         fp.recorded_by,

         recorded_user.full_name AS recorded_by_name,
         recorded_user.role AS recorded_by_role

       FROM fee_payments fp

       LEFT JOIN users recorded_user
         ON recorded_user.id = fp.recorded_by

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
           fpa.from_date,
           fpa.to_date,

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

      payments.push({
        ...payment,

        payment_solar_date: toSolarDateValue(payment.payment_date),

        payment_for_months: [
          ...new Set(
            allocations.rows.map(
              (allocation) =>
                `${allocation.solar_year}/${allocation.solar_month}`,
            ),
          ),
        ],

        allocations: allocations.rows.map((allocation) => ({
          ...allocation,

          from_solar_date: toSolarDateValue(allocation.from_date),

          to_solar_date: toSolarDateValue(allocation.to_date),
        })),
      });
    }

    res.json(payments);
  }),
);

/* ============================================================
   CREATE FEE
============================================================ */

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
      initial_payment_comment,
      academic_year,
      description,
    } = req.body;

    const numericStudentId = Number(student_id);

    if (!Number.isInteger(numericStudentId) || numericStudentId < 0) {
      return res.status(400).json({
        error: "Valid student ID is required",
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

    if (initialPaid > 0 && !isMultipleOfTen(initialPaid)) {
      return res.status(400).json({
        error: "Initial payment must be a positive multiple of 10",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const studentResult = await client.query(
        `SELECT
           id,
           full_name,
           roll_number,
           guardian_name,
           guardian_phone
         FROM students
         WHERE id = $1`,
        [numericStudentId],
      );

      if (!studentResult.rows.length) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          error: "Student not found",
        });
      }

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
        [enrollment_id, numericStudentId],
      );

      if (!enrollmentResult.rows.length) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          error: "Active enrollment not found for this student",
        });
      }

      const enrollment = enrollmentResult.rows[0];

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

      const totalAmount = roundMoney(period.total_amount);

      if (initialPaid > totalAmount) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          error: "Initial payment cannot be greater than the total fee",
        });
      }

      const initialDue = Math.max(roundMoney(totalAmount - initialPaid), 0);

      const initialStatus =
        initialDue === 0 ? "paid" : initialPaid > 0 ? "partial" : "pending";

      let initialPaymentDate = null;

      if (initialPaid > 0) {
        const solarPayment = initial_payment_solar_date
          ? parseSolarDate(initial_payment_solar_date)
          : parseSolarDate(getCurrentSolarDate());

        initialPaymentDate = solarPayment.gregorianDate;
      }

      let receiptNumber = null;

      if (initialPaid > 0) {
        await client.query("SELECT pg_advisory_xact_lock(874321)");

        const receiptResult = await client.query(
          `SELECT
             COUNT(*)::int + 1 AS next_number
           FROM fee_payments`,
        );

        const nextNumber = receiptResult.rows[0].next_number;

        const datePart = getKabulGregorianDate()
          .toISOString()
          .slice(0, 10)
          .replace(/-/g, "");

        receiptNumber = `REC-${datePart}-${String(nextNumber).padStart(
          4,
          "0",
        )}`;
      }

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
          numericStudentId,
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
          totalAmount,
        ],
      );

      const feePeriod = periodResult.rows[0];

      const monthRows = [];

      for (const month of period.months) {
        const calculatedAmount = roundMoney(month.calculated_amount);

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
            calculatedAmount,
          ],
        );

        monthRows.push(monthResult.rows[0]);
      }

      let payment = null;
      const allocations = [];

      if (initialPaid > 0) {
        const paymentResult = await client.query(
          `INSERT INTO fee_payments
           (
             fee_id,
             amount,
             payment_date,
             receipt_number,
             fee_period_id,
             comment,
             recorded_by
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
            fee.id,
            initialPaid,
            initialPaymentDate,
            receiptNumber,
            feePeriod.id,
            initial_payment_comment || null,
            req.user.id,
          ],
        );

        payment = paymentResult.rows[0];

        const coverage = calculatePaidCoverage(initialPaid, monthRows);

        const paidDaysByMonth = new Map();

        for (const allocation of coverage.allocations) {
          const month = monthRows.find(
            (item) =>
              Number(item.solar_year) === Number(allocation.solar_year) &&
              Number(item.solar_month) === Number(allocation.solar_month),
          );

          if (!month) {
            continue;
          }

          const alreadyPaidDays = paidDaysByMonth.get(month.id) || 0;

          const dates = calculateAllocationDates(
            feePeriod,
            month,
            alreadyPaidDays,
            allocation.covered_days,
          );

          const allocationResult = await client.query(
            `INSERT INTO fee_payment_allocations
             (
               fee_payment_id,
               fee_period_month_id,
               covered_days,
               allocated_amount,
               from_date,
               to_date
             )
             VALUES
             (
               $1,
               $2,
               $3,
               $4,
               $5,
               $6
             )
             RETURNING *`,
            [
              payment.id,
              month.id,
              allocation.covered_days,
              allocation.allocated_amount,
              dates.from_date,
              dates.to_date,
            ],
          );

          allocations.push(allocationResult.rows[0]);

          paidDaysByMonth.set(
            month.id,
            alreadyPaidDays + allocation.covered_days,
          );
        }

        const paymentForMonths = [
          ...new Set(
            allocations
              .map((allocation) => {
                const month = monthRows.find(
                  (item) => item.id === allocation.fee_period_month_id,
                );

                return month
                  ? `${month.solar_year}/${month.solar_month}`
                  : null;
              })
              .filter(Boolean),
          ),
        ];

        await recordPaymentAudit(client, {
          paymentId: payment.id,
          receiptNumber: payment.receipt_number,
          action: "create",
          req,
          newData: {
            ...payment,
            payment_for_months: paymentForMonths,
          },
        });
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

/* ============================================================
   EDIT FEE
============================================================ */

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

    let newTotal = Number(fee.total_amount);

    if (total_amount !== undefined && total_amount !== null) {
      newTotal = Number(total_amount);

      if (!isMultipleOfTen(newTotal)) {
        return res.status(400).json({
          error: "Total amount must be a positive multiple of 10",
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

    newTotal = roundMoney(newTotal);

    const dueAmount = Math.max(roundMoney(newTotal - paidAmount), 0);

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

/* ============================================================
   RECORD PAYMENT
============================================================ */

router.post(
  "/:id([0-9]+)/payment",
  authRequired,
  requireRoles("admin", "staff"),
  asyncH(async (req, res) => {
    const { amount, payment_date, payment_solar_date, comment } = req.body;

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

    if (!isMultipleOfTen(paymentAmount)) {
      return res.status(400).json({
        error: "Payment amount must be a multiple of 10",
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

      const currentPaid = roundMoney(Number(fee.paid_amount));

      const total = roundMoney(Number(fee.total_amount));

      const currentDue = Math.max(roundMoney(total - currentPaid), 0);

      if (paymentAmount > currentDue) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          error: `Payment cannot be greater than the remaining due amount of ${currentDue}`,
        });
      }

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
          finalPaymentDate = getKabulGregorianDate();
        }
      }

      await client.query("SELECT pg_advisory_xact_lock(874321)");

      const receiptResult = await client.query(
        `SELECT
           COUNT(*)::int + 1 AS next_number
         FROM fee_payments`,
      );

      const nextNumber = receiptResult.rows[0].next_number;

      const receiptDate = getKabulGregorianDate()
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, "");

      const receiptNumber = `REC-${receiptDate}-${String(nextNumber).padStart(
        4,
        "0",
      )}`;

      const paymentResult = await client.query(
        `INSERT INTO fee_payments
         (
           fee_id,
           amount,
           payment_date,
           receipt_number,
           fee_period_id,
           comment,
           recorded_by
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
          req.params.id,
          paymentAmount,
          finalPaymentDate,
          receiptNumber,
          feePeriodId,
          comment || null,
          req.user.id,
        ],
      );

      const payment = paymentResult.rows[0];

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

      const allocations = [];

      if (isPeriodBased) {
        const period = periodResult.rows[0];

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
               SUM(fpa.covered_days),
               0
             ) AS already_paid_days

           FROM fee_period_months fpm

           LEFT JOIN fee_payment_allocations fpa
             ON fpa.fee_period_month_id = fpm.id

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

        const remainingMonths = monthResult.rows.map((month) => ({
          ...month,

          already_paid_days: Number(month.already_paid_days),

          covered_days: Math.max(
            Number(month.covered_days) - Number(month.already_paid_days),
            0,
          ),
        }));

        const coverage = calculatePaidCoverage(paymentAmount, remainingMonths);

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

          const alreadyPaidDays = Number(month.already_paid_days);

          const dates = calculateAllocationDates(
            period,
            month,
            alreadyPaidDays,
            allocation.covered_days,
          );

          const allocationResult = await client.query(
            `INSERT INTO fee_payment_allocations
               (
                 fee_payment_id,
                 fee_period_month_id,
                 covered_days,
                 allocated_amount,
                 from_date,
                 to_date
               )
               VALUES
               (
                 $1,
                 $2,
                 $3,
                 $4,
                 $5,
                 $6
               )
               RETURNING *`,
            [
              payment.id,
              month.id,
              allocation.covered_days,
              allocation.allocated_amount,
              dates.from_date,
              dates.to_date,
            ],
          );

          allocations.push(allocationResult.rows[0]);
        }
      }

      const paymentForMonths = isPeriodBased
        ? [
            ...new Set(
              allocations
                .map((allocation) => {
                  const allocationMonthResult = allocations.find(
                    (item) => item.id === allocation.id,
                  );

                  return allocationMonthResult ? null : null;
                })
                .filter(Boolean),
            ),
          ]
        : [];

      let resolvedPaymentForMonths = paymentForMonths;

      if (isPeriodBased) {
        resolvedPaymentForMonths = await getPaymentForMonths(
          client,
          payment.id,
        );
      }

      await recordPaymentAudit(client, {
        paymentId: payment.id,
        receiptNumber: payment.receipt_number,
        action: "create",
        req,
        newData: {
          ...payment,
          payment_for_months: resolvedPaymentForMonths,
        },
      });

      await client.query("COMMIT");

      const paymentSolarDate = toSolarDateValue(finalPaymentDate);

      const formattedAllocations = allocations.map((allocation) => ({
        ...allocation,

        from_solar_date: toSolarDateValue(allocation.from_date),

        to_solar_date: toSolarDateValue(allocation.to_date),
      }));

      res.json({
        message: "Payment recorded successfully",

        fee: feeResult.rows[0],

        payment: {
          ...payment,

          payment_solar_date: paymentSolarDate,

          payment_for_months: resolvedPaymentForMonths,
        },

        allocations: formattedAllocations,
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

/* ============================================================
   EDIT INDIVIDUAL PAYMENT
============================================================ */

router.put(
  "/payments/:paymentId([0-9]+)",
  authRequired,
  requireRoles("admin", "staff"),
  asyncH(async (req, res) => {
    const paymentId = Number(req.params.paymentId);

    const { amount, payment_date, payment_solar_date, comment } = req.body;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const paymentResult = await client.query(
        `SELECT
           fp.*,
           f.total_amount,
           f.student_id,
           f.subject_id
         FROM fee_payments fp
         JOIN fees f
           ON f.id = fp.fee_id
         WHERE fp.id = $1
         FOR UPDATE OF fp, f`,
        [paymentId],
      );

      if (!paymentResult.rows.length) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          error: "Payment not found",
        });
      }

      const existingPayment = paymentResult.rows[0];

      let newAmount = Number(existingPayment.amount);

      if (amount !== undefined && amount !== null && amount !== "") {
        newAmount = Number(amount);
      }

      if (!Number.isFinite(newAmount) || newAmount <= 0) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          error: "Payment amount must be greater than zero",
        });
      }

      if (!isMultipleOfTen(newAmount)) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          error: "Payment amount must be a multiple of 10",
        });
      }

      const otherPaymentsResult = await client.query(
        `SELECT
             COALESCE(SUM(amount), 0) AS other_paid
           FROM fee_payments
           WHERE fee_id = $1
             AND id <> $2`,
        [existingPayment.fee_id, paymentId],
      );

      const otherPaid = Number(otherPaymentsResult.rows[0].other_paid);

      const totalAmount = roundMoney(Number(existingPayment.total_amount));

      if (roundMoney(otherPaid + newAmount) > totalAmount) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          error: `Payment cannot make total paid amount greater than the fee total of ${totalAmount}`,
        });
      }

      let finalPaymentDate = existingPayment.payment_date;

      const isPeriodBased = Boolean(existingPayment.fee_period_id);

      if (isPeriodBased) {
        if (payment_solar_date) {
          try {
            const parsed = parseSolarDate(payment_solar_date);

            finalPaymentDate = parsed.gregorianDate;
          } catch (error) {
            await client.query("ROLLBACK");

            return res.status(400).json({
              error: error.message,
            });
          }
        }
      } else if (payment_date) {
        const parsed = new Date(payment_date);

        if (Number.isNaN(parsed.getTime())) {
          await client.query("ROLLBACK");

          return res.status(400).json({
            error: "Invalid payment date",
          });
        }

        finalPaymentDate = payment_date;
      }

      const finalComment =
        comment === undefined
          ? existingPayment.comment
          : comment === null || String(comment).trim() === ""
            ? null
            : String(comment).trim();

      const updatedPaymentResult = await client.query(
        `UPDATE fee_payments
           SET
             amount = $1,
             payment_date = $2,
             comment = $3
           WHERE id = $4
           RETURNING *`,
        [newAmount, finalPaymentDate, finalComment, paymentId],
      );

      const updatedPayment = updatedPaymentResult.rows[0];

      if (isPeriodBased) {
        await rebuildFeePeriodAllocations(
          client,
          existingPayment.fee_period_id,
        );
      }

      const updatedFee = await recalculateFeeTotals(
        client,
        existingPayment.fee_id,
      );

      const paymentForMonths = isPeriodBased
        ? await getPaymentForMonths(client, paymentId)
        : [];

      await recordPaymentAudit(client, {
        paymentId,
        receiptNumber: existingPayment.receipt_number,
        action: "update",
        req,
        oldData: existingPayment,
        newData: {
          ...updatedPayment,
          payment_for_months: paymentForMonths,
        },
      });

      await client.query("COMMIT");

      res.json({
        message: "Payment updated successfully",

        fee: updatedFee,

        payment: {
          ...updatedPayment,

          payment_solar_date: toSolarDateValue(updatedPayment.payment_date),

          payment_for_months: paymentForMonths,
        },
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

/* ============================================================
   DELETE INDIVIDUAL PAYMENT
============================================================ */

router.delete(
  "/payments/:paymentId([0-9]+)",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const paymentId = Number(req.params.paymentId);

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const paymentResult = await client.query(
        `SELECT
           fp.*,
           f.total_amount
         FROM fee_payments fp
         JOIN fees f
           ON f.id = fp.fee_id
         WHERE fp.id = $1
         FOR UPDATE OF fp, f`,
        [paymentId],
      );

      if (!paymentResult.rows.length) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          error: "Payment not found",
        });
      }

      const payment = paymentResult.rows[0];

      const paymentForMonths = payment.fee_period_id
        ? await getPaymentForMonths(client, paymentId)
        : [];

      const auditOldData = {
        ...payment,
        payment_for_months: paymentForMonths,
      };

      await client.query(
        `DELETE FROM fee_payment_allocations
         WHERE fee_payment_id = $1`,
        [paymentId],
      );

      await client.query(
        `DELETE FROM fee_payments
         WHERE id = $1`,
        [paymentId],
      );

      await recalculateFeeTotals(client, payment.fee_id);

      const periodResult = await client.query(
        `SELECT id
           FROM fee_periods
           WHERE fee_id = $1
           ORDER BY id ASC`,
        [payment.fee_id],
      );

      for (const period of periodResult.rows) {
        await rebuildFeePeriodAllocations(client, period.id);
      }

      const finalFee = await recalculateFeeTotals(client, payment.fee_id);

      await recordPaymentAudit(client, {
        paymentId,
        receiptNumber: payment.receipt_number,
        action: "delete",
        req,
        oldData: auditOldData,
        newData: null,
      });

      await client.query("COMMIT");

      res.json({
        ok: true,
        message: "Payment deleted successfully",
        fee: finalFee,
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

/* ============================================================
   RECEIPT
============================================================ */

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

    res.json({
      ...receipt,

      payment_solar_date: toSolarDateValue(receipt.payment_date),
    });
  }),
);

/* ============================================================
   DELETE FEE
============================================================ */

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
