const express = require("express");

const { query } = require("../db/pool");
const { authRequired, requireRoles } = require("../middleware/auth");
const { asyncH } = require("../utils/helpers");

const {
  parseSolarDate,
  dateToJalaali,
  formatSolarDate,
} = require("../utils/solarDate");

const router = express.Router();

/* ==========================================================================
   HELPERS
========================================================================== */

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function toSolarDateValue(dateValue) {
  if (!dateValue) {
    return null;
  }

  const date =
    dateValue instanceof Date
      ? dateValue
      : new Date(`${String(dateValue).slice(0, 10)}T12:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const solar = dateToJalaali(date);

  return formatSolarDate(solar.jy, solar.jm, solar.jd);
}

function parseOptionalSolarDate(value) {
  if (!value) {
    return null;
  }

  return parseSolarDate(String(value)).gregorianDate;
}

function getReconciliationStatus(expectedAmount, handedOverAmount) {
  if (
    expectedAmount === null ||
    expectedAmount === undefined ||
    handedOverAmount === null ||
    handedOverAmount === undefined
  ) {
    return "pending";
  }

  const difference = roundMoney(handedOverAmount - expectedAmount);

  if (difference === 0) {
    return "matched";
  }

  return difference < 0 ? "short" : "over";
}

async function ensureDefaultShareRate() {
  const existing = await query(`
    SELECT
      id,
      percentage,
      effective_at,
      created_by_user_id,
      created_at
    FROM finance_share_rates
    ORDER BY effective_at DESC, id DESC
    LIMIT 1
  `);

  if (existing.rows.length) {
    return existing.rows[0];
  }

  const adminResult = await query(`
    SELECT id
    FROM users
    WHERE role = 'admin'
      AND is_active = TRUE
    ORDER BY id ASC
    LIMIT 1
  `);

  const adminId = adminResult.rows[0]?.id || null;

  const inserted = await query(
    `
      INSERT INTO finance_share_rates
      (
        percentage,
        effective_at,
        created_by_user_id
      )
      VALUES
      (
        30.00,
        NOW(),
        $1
      )
      RETURNING
        id,
        percentage,
        effective_at,
        created_by_user_id,
        created_at
    `,
    [adminId],
  );

  return inserted.rows[0];
}

/* ==========================================================================
   OPTIONAL HEALTH CHECK
========================================================================== */

router.get(
  "/health",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const result = await query(`
      SELECT
        (SELECT COUNT(*) FROM finance_share_rates)::int AS share_rate_rows,
        (SELECT COUNT(*) FROM cash_reconciliations)::int AS reconciliation_rows,
        (SELECT COUNT(*) FROM fee_payments)::int AS payment_rows
    `);

    res.json({
      status: "ok",
      database: {
        share_rate_rows: Number(result.rows[0].share_rate_rows || 0),
        reconciliation_rows: Number(
          result.rows[0].reconciliation_rows || 0,
        ),
        payment_rows: Number(result.rows[0].payment_rows || 0),
      },
    });
  }),
);

/* ==========================================================================
   TEACHER SHARE RATE
========================================================================== */

/*
  GET /api/finance/teacher-share-rate
*/
router.get(
  "/teacher-share-rate",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const current = await ensureDefaultShareRate();

    const history = await query(`
      SELECT
        fsr.id,
        fsr.percentage,
        fsr.effective_at,
        fsr.created_at,
        fsr.created_by_user_id,
        COALESCE(u.full_name, 'Unknown') AS created_by_name
      FROM finance_share_rates fsr
      LEFT JOIN users u
        ON u.id = fsr.created_by_user_id
      ORDER BY
        fsr.effective_at DESC,
        fsr.id DESC
      LIMIT 100
    `);

    res.json({
      current: current
        ? {
            ...current,
            percentage: Number(current.percentage),
          }
        : null,

      history: history.rows.map((row) => ({
        ...row,
        percentage: Number(row.percentage),
      })),
    });
  }),
);

/*
  PUT /api/finance/teacher-share-rate
*/
router.put(
  "/teacher-share-rate",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const percentage = Number(req.body?.percentage);

    if (!Number.isFinite(percentage)) {
      return res.status(400).json({
        error: "Teacher share percentage must be a valid number.",
      });
    }

    if (percentage < 0 || percentage > 100) {
      return res.status(400).json({
        error: "Teacher share percentage must be between 0 and 100.",
      });
    }

    const latest = await ensureDefaultShareRate();

    if (
      latest &&
      Number(latest.percentage).toFixed(2) === percentage.toFixed(2)
    ) {
      return res.json({
        message: "Teacher share percentage is already set to this value.",
        rate: {
          ...latest,
          percentage: Number(latest.percentage),
        },
      });
    }

    const result = await query(
      `
        INSERT INTO finance_share_rates
        (
          percentage,
          effective_at,
          created_by_user_id
        )
        VALUES
        (
          $1,
          NOW(),
          $2
        )
        RETURNING
          id,
          percentage,
          effective_at,
          created_by_user_id,
          created_at
      `,
      [percentage, req.user.id],
    );

    res.json({
      message: "Teacher share percentage updated successfully.",
      rate: {
        ...result.rows[0],
        percentage: Number(result.rows[0].percentage),
      },
    });
  }),
);

/* ==========================================================================
   TEACHER SHARES
========================================================================== */

/*
  GET /api/finance/teacher-shares

  Optional:
    ?from_solar_date=1405-06-01
    ?to_solar_date=1405-06-31

  Attribution chain:

    fee_payments
      ↓
    fee_payment_allocations
      ↓
    fee_period_months
      ↓
    fee_periods
      ↓
    student_enrollments
      ↓
    class_slots
      ↓
    teachers
*/
router.get(
  "/teacher-shares",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    let fromDate = null;
    let toDate = null;

    try {
      fromDate = parseOptionalSolarDate(req.query.from_solar_date);
      toDate = parseOptionalSolarDate(req.query.to_solar_date);
    } catch (error) {
      return res.status(400).json({
        error: error.message,
      });
    }

    if (fromDate && toDate && fromDate > toDate) {
      return res.status(400).json({
        error: "From date cannot be after to date.",
      });
    }

    const result = await query(
      `
        SELECT
          fp.id AS payment_id,
          fp.amount AS payment_amount,
          fp.payment_date,
          fp.receipt_number,
          fp.comment,
          fp.created_at AS payment_created_at,

          fp.collected_by_user_id,

          collector.full_name AS collector_name,
          collector.role AS collector_role,

          s.id AS student_id,
          s.full_name AS student_name,
          s.roll_number,

          sub.id AS subject_id,
          sub.name AS subject_name,
          sub.code AS subject_code,

          t.id AS teacher_id,
          t.full_name AS teacher_name,

          fpa.id AS allocation_id,
          fpa.covered_days,
          fpa.allocated_amount,
          fpa.from_date AS coverage_from_date,
          fpa.to_date AS coverage_to_date,

          COALESCE(share_rate.percentage, 30.00) AS share_percent

        FROM fee_payments fp

        INNER JOIN fees f
          ON f.id = fp.fee_id

        INNER JOIN students s
          ON s.id = f.student_id

        LEFT JOIN users collector
          ON collector.id = fp.collected_by_user_id

        LEFT JOIN fee_payment_allocations fpa
          ON fpa.fee_payment_id = fp.id

        LEFT JOIN fee_period_months fpm
          ON fpm.id = fpa.fee_period_month_id

        LEFT JOIN fee_periods fper
          ON fper.id = fpm.fee_period_id

        LEFT JOIN student_enrollments se
          ON se.id = fper.enrollment_id

        LEFT JOIN class_slots cs
          ON cs.id = se.class_slot_id

        LEFT JOIN teachers t
          ON t.id = cs.teacher_id

        LEFT JOIN subjects sub
          ON sub.id = cs.subject_id

        LEFT JOIN LATERAL
        (
          SELECT
            fsr.percentage
          FROM finance_share_rates fsr
          WHERE fsr.effective_at <= fp.created_at
          ORDER BY
            fsr.effective_at DESC,
            fsr.id DESC
          LIMIT 1
        ) share_rate
          ON TRUE

        WHERE
          ($1::date IS NULL OR fp.payment_date >= $1::date)
          AND
          ($2::date IS NULL OR fp.payment_date <= $2::date)

        ORDER BY
          fp.payment_date DESC,
          fp.id DESC,
          fpa.id ASC
      `,
      [fromDate, toDate],
    );

    const rows = result.rows;

    const paymentMap = new Map();
    const teacherMap = new Map();

    let attributableAmount = 0;
    let teacherShareAmount = 0;

    for (const row of rows) {
      const paymentId = Number(row.payment_id);
      const paymentAmount = Number(row.payment_amount || 0);

      /*
        A payment can have multiple allocation rows.

        Count the original payment only once in total payment amount.
      */
      if (!paymentMap.has(paymentId)) {
        paymentMap.set(paymentId, paymentAmount);
      }

      const allocationAmount = Number(row.allocated_amount || 0);

      if (row.teacher_id && allocationAmount > 0) {
        attributableAmount += allocationAmount;

        const sharePercent = Number(row.share_percent || 0);

        const shareAmount = roundMoney(
          (allocationAmount * sharePercent) / 100,
        );

        teacherShareAmount += shareAmount;

        const teacherId = Number(row.teacher_id);

        if (!teacherMap.has(teacherId)) {
          teacherMap.set(teacherId, {
            teacher_id: teacherId,
            teacher_name: row.teacher_name || "Unknown",
            payment_ids: new Set(),
            attributable_amount: 0,
            teacher_share_amount: 0,
          });
        }

        const teacher = teacherMap.get(teacherId);

        teacher.payment_ids.add(paymentId);
        teacher.attributable_amount += allocationAmount;
        teacher.teacher_share_amount += shareAmount;
      }
    }

    const totalPaymentAmount = Array.from(paymentMap.values()).reduce(
      (sum, amount) => sum + Number(amount || 0),
      0,
    );

    const teachers = Array.from(teacherMap.values())
      .map((teacher) => ({
        teacher_id: teacher.teacher_id,
        teacher_name: teacher.teacher_name,
        payment_count: teacher.payment_ids.size,
        attributable_amount: roundMoney(teacher.attributable_amount),
        teacher_share_amount: roundMoney(teacher.teacher_share_amount),
      }))
      .sort((a, b) =>
        a.teacher_name.localeCompare(b.teacher_name, undefined, {
          sensitivity: "base",
        }),
      );

    const unattributedAmount = Math.max(
      roundMoney(totalPaymentAmount - attributableAmount),
      0,
    );

    const payments = rows.map((row) => {
      const allocatedAmount =
        row.allocated_amount !== null
          ? Number(row.allocated_amount)
          : 0;

      const sharePercent = Number(row.share_percent || 0);

      const shareAmount =
        row.teacher_id && allocatedAmount > 0
          ? roundMoney((allocatedAmount * sharePercent) / 100)
          : 0;

      return {
        payment_id: Number(row.payment_id),

        payment_amount: roundMoney(row.payment_amount),

        payment_date: row.payment_date,
        payment_solar_date: toSolarDateValue(row.payment_date),

        receipt_number: row.receipt_number || null,
        comment: row.comment || null,

        payment_created_at: row.payment_created_at,

        student_id: row.student_id ? Number(row.student_id) : null,
        student_name: row.student_name || null,
        roll_number: row.roll_number || null,

        subject_id: row.subject_id ? Number(row.subject_id) : null,
        subject_name: row.subject_name || null,
        subject_code: row.subject_code || null,

        teacher_id: row.teacher_id ? Number(row.teacher_id) : null,
        teacher_name: row.teacher_name || null,

        allocation_id: row.allocation_id
          ? Number(row.allocation_id)
          : null,

        covered_days:
          row.covered_days !== null
            ? Number(row.covered_days)
            : null,

        allocated_amount:
          row.allocated_amount !== null
            ? roundMoney(row.allocated_amount)
            : null,

        coverage_from_date: row.coverage_from_date || null,
        coverage_from_solar_date: toSolarDateValue(
          row.coverage_from_date,
        ),

        coverage_to_date: row.coverage_to_date || null,
        coverage_to_solar_date: toSolarDateValue(
          row.coverage_to_date,
        ),

        share_percent: sharePercent,
        teacher_share_amount: shareAmount,

        collected_by_user_id: row.collected_by_user_id
          ? Number(row.collected_by_user_id)
          : null,

        collector_name: row.collector_name || null,
        collector_role: row.collector_role || null,
      };
    });

    const shareRate = await ensureDefaultShareRate();

    res.json({
      filters: {
        from_solar_date: req.query.from_solar_date || null,
        to_solar_date: req.query.to_solar_date || null,
      },

      current_share_rate: Number(shareRate?.percentage ?? 30),

      totals: {
        total_payment_amount: roundMoney(totalPaymentAmount),
        attributable_amount: roundMoney(attributableAmount),
        teacher_share_amount: roundMoney(teacherShareAmount),
        unattributed_amount: roundMoney(unattributedAmount),
        payment_count: paymentMap.size,
        teacher_count: teachers.length,
      },

      teachers,
      payments,
    });
  }),
);

/* ==========================================================================
   CASH COLLECTORS
========================================================================== */

/*
  GET /api/finance/collectors

  Active admin/staff users can be collectors.
*/
router.get(
  "/collectors",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const result = await query(`
      SELECT
        id,
        full_name,
        email,
        role
      FROM users
      WHERE role IN ('admin', 'staff')
        AND is_active = TRUE
      ORDER BY
        full_name,
        id
    `);

    res.json(
      result.rows.map((row) => ({
        ...row,
        id: Number(row.id),
      })),
    );
  }),
);

/* ==========================================================================
   CASH EXPECTED PREVIEW
========================================================================== */

/*
  GET /api/finance/cash-reconciliation/expected

  Example:
    ?collector_user_id=5
    &from_solar_date=1405-06-01
    &to_solar_date=1405-06-31
*/
router.get(
  "/cash-reconciliation/expected",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const collectorUserId = Number(req.query.collector_user_id);

    if (!Number.isInteger(collectorUserId) || collectorUserId < 1) {
      return res.status(400).json({
        error: "A valid collector is required.",
      });
    }

    let fromDate;
    let toDate;

    try {
      fromDate = parseOptionalSolarDate(req.query.from_solar_date);
      toDate = parseOptionalSolarDate(req.query.to_solar_date);
    } catch (error) {
      return res.status(400).json({
        error: error.message,
      });
    }

    if (!fromDate || !toDate) {
      return res.status(400).json({
        error: "From and to Solar Hijri dates are required.",
      });
    }

    if (fromDate > toDate) {
      return res.status(400).json({
        error: "From date cannot be after to date.",
      });
    }

    const collector = await query(
      `
        SELECT
          id,
          full_name,
          role
        FROM users
        WHERE id = $1
          AND role IN ('admin', 'staff')
          AND is_active = TRUE
      `,
      [collectorUserId],
    );

    if (!collector.rows.length) {
      return res.status(404).json({
        error: "Collector not found.",
      });
    }

    const result = await query(
      `
        SELECT
          COUNT(*)::int AS payment_count,
          COALESCE(SUM(amount), 0)::numeric(12,2) AS expected_amount
        FROM fee_payments
        WHERE collected_by_user_id = $1
          AND payment_date >= $2
          AND payment_date <= $3
      `,
      [collectorUserId, fromDate, toDate],
    );

    const row = result.rows[0];

    res.json({
      collector: collector.rows[0],

      from_date: fromDate,
      to_date: toDate,

      from_solar_date: toSolarDateValue(fromDate),
      to_solar_date: toSolarDateValue(toDate),

      payment_count: Number(row.payment_count || 0),
      expected_amount: roundMoney(row.expected_amount),
    });
  }),
);

/* ==========================================================================
   CASH RECONCILIATION LIST
========================================================================== */

router.get(
  "/cash-reconciliation",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const collectorUserId = req.query.collector_user_id
      ? Number(req.query.collector_user_id)
      : null;

    if (
      collectorUserId !== null &&
      (!Number.isInteger(collectorUserId) || collectorUserId < 1)
    ) {
      return res.status(400).json({
        error: "Invalid collector.",
      });
    }

    let fromDate = null;
    let toDate = null;

    try {
      fromDate = parseOptionalSolarDate(req.query.from_solar_date);
      toDate = parseOptionalSolarDate(req.query.to_solar_date);
    } catch (error) {
      return res.status(400).json({
        error: error.message,
      });
    }

    if (fromDate && toDate && fromDate > toDate) {
      return res.status(400).json({
        error: "From date cannot be after to date.",
      });
    }

    const result = await query(
      `
        SELECT
          cr.id,

          cr.collector_user_id,
          collector.full_name AS collector_name,
          collector.role AS collector_role,

          cr.from_date,
          cr.to_date,

          cr.expected_amount,
          cr.handed_over_amount,
          cr.difference,
          cr.status,

          cr.payment_count,

          cr.verification_date,
          cr.verified_by_user_id,
          verifier.full_name AS verified_by_name,

          cr.notes,

          cr.created_at,
          cr.updated_at

        FROM cash_reconciliations cr

        INNER JOIN users collector
          ON collector.id = cr.collector_user_id

        LEFT JOIN users verifier
          ON verifier.id = cr.verified_by_user_id

        WHERE
          (
            $1::integer IS NULL
            OR cr.collector_user_id = $1
          )

          AND
          (
            $2::date IS NULL
            OR cr.to_date >= $2
          )

          AND
          (
            $3::date IS NULL
            OR cr.from_date <= $3
          )

        ORDER BY
          cr.from_date DESC,
          cr.id DESC
      `,
      [collectorUserId, fromDate, toDate],
    );

    res.json(
      result.rows.map((row) => ({
        id: Number(row.id),

        collector_user_id: Number(row.collector_user_id),
        collector_name: row.collector_name,
        collector_role: row.collector_role,

        from_date: row.from_date,
        to_date: row.to_date,

        from_solar_date: toSolarDateValue(row.from_date),
        to_solar_date: toSolarDateValue(row.to_date),

        expected_amount: roundMoney(row.expected_amount),

        handed_over_amount:
          row.handed_over_amount !== null
            ? roundMoney(row.handed_over_amount)
            : null,

        difference:
          row.difference !== null
            ? roundMoney(row.difference)
            : null,

        status: row.status,

        payment_count: Number(row.payment_count || 0),

        verification_date: row.verification_date,
        verification_solar_date: toSolarDateValue(
          row.verification_date,
        ),

        verified_by_user_id: row.verified_by_user_id
          ? Number(row.verified_by_user_id)
          : null,

        verified_by_name: row.verified_by_name || null,

        notes: row.notes || "",

        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
    );
  }),
);

/* ==========================================================================
   CREATE CASH RECONCILIATION
========================================================================== */

router.post(
  "/cash-reconciliation",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const collectorUserId = Number(req.body?.collector_user_id);

    if (!Number.isInteger(collectorUserId) || collectorUserId < 1) {
      return res.status(400).json({
        error: "A valid collector is required.",
      });
    }

    const { from_solar_date, to_solar_date } = req.body;

    let fromDate;
    let toDate;

    try {
      fromDate = parseOptionalSolarDate(from_solar_date);
      toDate = parseOptionalSolarDate(to_solar_date);
    } catch (error) {
      return res.status(400).json({
        error: error.message,
      });
    }

    if (!fromDate || !toDate) {
      return res.status(400).json({
        error: "From and to Solar Hijri dates are required.",
      });
    }

    if (fromDate > toDate) {
      return res.status(400).json({
        error: "From date cannot be after to date.",
      });
    }

    const handedOverAmount =
      req.body?.handed_over_amount === null ||
      req.body?.handed_over_amount === undefined ||
      req.body?.handed_over_amount === ""
        ? null
        : Number(req.body.handed_over_amount);

    if (
      handedOverAmount !== null &&
      (!Number.isFinite(handedOverAmount) || handedOverAmount < 0)
    ) {
      return res.status(400).json({
        error: "Handed-over amount must be zero or greater.",
      });
    }

    const collector = await query(
      `
        SELECT
          id,
          full_name,
          role
        FROM users
        WHERE id = $1
          AND role IN ('admin', 'staff')
          AND is_active = TRUE
      `,
      [collectorUserId],
    );

    if (!collector.rows.length) {
      return res.status(404).json({
        error: "Collector not found.",
      });
    }

    const overlap = await query(
      `
        SELECT id
        FROM cash_reconciliations
        WHERE collector_user_id = $1
          AND from_date <= $3
          AND to_date >= $2
        LIMIT 1
      `,
      [collectorUserId, fromDate, toDate],
    );

    if (overlap.rows.length) {
      return res.status(409).json({
        error:
          "This collector already has a reconciliation covering part of the selected period.",
        code: "RECONCILIATION_PERIOD_OVERLAP",
      });
    }

    const expectedResult = await query(
      `
        SELECT
          COUNT(*)::int AS payment_count,
          COALESCE(SUM(amount), 0)::numeric(12,2) AS expected_amount
        FROM fee_payments
        WHERE collected_by_user_id = $1
          AND payment_date >= $2
          AND payment_date <= $3
      `,
      [collectorUserId, fromDate, toDate],
    );

    const expectedAmount = roundMoney(
      expectedResult.rows[0]?.expected_amount || 0,
    );

    const paymentCount = Number(
      expectedResult.rows[0]?.payment_count || 0,
    );

    const status = getReconciliationStatus(
      expectedAmount,
      handedOverAmount,
    );

    const difference =
      handedOverAmount === null
        ? null
        : roundMoney(handedOverAmount - expectedAmount);

    const result = await query(
      `
        INSERT INTO cash_reconciliations
        (
          collector_user_id,
          from_date,
          to_date,

          expected_amount,
          handed_over_amount,
          difference,
          status,

          payment_count,

          notes,

          created_by_user_id
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
        RETURNING *
      `,
      [
        collectorUserId,
        fromDate,
        toDate,

        expectedAmount,
        handedOverAmount,
        difference,
        status,

        paymentCount,

        typeof req.body?.notes === "string"
          ? req.body.notes.trim() || null
          : null,

        req.user.id,
      ],
    );

    const row = result.rows[0];

    res.status(201).json({
      id: Number(row.id),

      collector_user_id: Number(row.collector_user_id),
      collector_name: collector.rows[0].full_name,
      collector_role: collector.rows[0].role,

      from_date: row.from_date,
      to_date: row.to_date,

      from_solar_date: toSolarDateValue(row.from_date),
      to_solar_date: toSolarDateValue(row.to_date),

      expected_amount: roundMoney(row.expected_amount),

      handed_over_amount:
        row.handed_over_amount !== null
          ? roundMoney(row.handed_over_amount)
          : null,

      difference:
        row.difference !== null
          ? roundMoney(row.difference)
          : null,

      status: row.status,

      payment_count: Number(row.payment_count || 0),

      verification_date: row.verification_date,
      verification_solar_date: toSolarDateValue(
        row.verification_date,
      ),

      verified_by_user_id: row.verified_by_user_id
        ? Number(row.verified_by_user_id)
        : null,

      verified_by_name: null,

      notes: row.notes || "",
    });
  }),
);

/* ==========================================================================
   UPDATE / VERIFY CASH RECONCILIATION
========================================================================== */

router.put(
  "/cash-reconciliation/:id([0-9]+)",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const reconciliationId = Number(req.params.id);

    if (!Number.isInteger(reconciliationId) || reconciliationId < 1) {
      return res.status(400).json({
        error: "Invalid reconciliation ID.",
      });
    }

    const existing = await query(
      `
        SELECT *
        FROM cash_reconciliations
        WHERE id = $1
      `,
      [reconciliationId],
    );

    if (!existing.rows.length) {
      return res.status(404).json({
        error: "Reconciliation not found.",
      });
    }

    const current = existing.rows[0];

    let handedOverAmount =
      current.handed_over_amount !== null
        ? Number(current.handed_over_amount)
        : null;

    if (
      Object.prototype.hasOwnProperty.call(
        req.body || {},
        "handed_over_amount",
      )
    ) {
      if (
        req.body.handed_over_amount === null ||
        req.body.handed_over_amount === ""
      ) {
        handedOverAmount = null;
      } else {
        handedOverAmount = Number(req.body.handed_over_amount);

        if (
          !Number.isFinite(handedOverAmount) ||
          handedOverAmount < 0
        ) {
          return res.status(400).json({
            error: "Handed-over amount must be zero or greater.",
          });
        }
      }
    }

    const expectedAmount = Number(current.expected_amount);

    const difference =
      handedOverAmount === null
        ? null
        : roundMoney(handedOverAmount - expectedAmount);

    const status = getReconciliationStatus(
      expectedAmount,
      handedOverAmount,
    );

    const currentHanded =
      current.handed_over_amount === null
        ? null
        : roundMoney(current.handed_over_amount);

    const nextHanded =
      handedOverAmount === null
        ? null
        : roundMoney(handedOverAmount);

    const handedAmountChanged =
      currentHanded !== nextHanded;

    const verify = req.body?.verify === true;

    if (verify && handedOverAmount === null) {
      return res.status(400).json({
        error: "A handed-over amount is required before verification.",
      });
    }

    let verificationDate = current.verification_date;
    let verifiedByUserId = current.verified_by_user_id;

    /*
      Any handover change invalidates previous verification.
    */
    if (handedAmountChanged) {
      verificationDate = null;
      verifiedByUserId = null;
    }

    if (verify) {
      verificationDate = new Date();
      verifiedByUserId = req.user.id;
    }

    const notes = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "notes",
    )
      ? typeof req.body.notes === "string"
        ? req.body.notes.trim() || null
        : null
      : current.notes;

    const result = await query(
      `
        UPDATE cash_reconciliations
        SET
          handed_over_amount = $1,
          difference = $2,
          status = $3,

          verification_date = $4,
          verified_by_user_id = $5,

          notes = $6,

          updated_at = NOW()
        WHERE id = $7
        RETURNING *
      `,
      [
        handedOverAmount,
        difference,
        status,

        verificationDate,
        verifiedByUserId,

        notes,

        reconciliationId,
      ],
    );

    const row = result.rows[0];

    const collector = await query(
      `
        SELECT
          id,
          full_name,
          role
        FROM users
        WHERE id = $1
      `,
      [row.collector_user_id],
    );

    const verifier = row.verified_by_user_id
      ? await query(
          `
            SELECT
              id,
              full_name
            FROM users
            WHERE id = $1
          `,
          [row.verified_by_user_id],
        )
      : null;

    res.json({
      id: Number(row.id),

      collector_user_id: Number(row.collector_user_id),
      collector_name:
        collector.rows[0]?.full_name || "Unknown",
      collector_role: collector.rows[0]?.role || null,

      from_date: row.from_date,
      to_date: row.to_date,

      from_solar_date: toSolarDateValue(row.from_date),
      to_solar_date: toSolarDateValue(row.to_date),

      expected_amount: roundMoney(row.expected_amount),

      handed_over_amount:
        row.handed_over_amount !== null
          ? roundMoney(row.handed_over_amount)
          : null,

      difference:
        row.difference !== null
          ? roundMoney(row.difference)
          : null,

      status: row.status,

      payment_count: Number(row.payment_count || 0),

      verification_date: row.verification_date,
      verification_solar_date: toSolarDateValue(
        row.verification_date,
      ),

      verified_by_user_id: row.verified_by_user_id
        ? Number(row.verified_by_user_id)
        : null,

      verified_by_name:
        verifier?.rows[0]?.full_name || null,

      notes: row.notes || "",

      updated_at: row.updated_at,
    });
  }),
);

module.exports = router;
