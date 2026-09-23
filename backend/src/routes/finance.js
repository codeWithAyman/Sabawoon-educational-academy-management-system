const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

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
   CONSTANTS / HELPERS
========================================================================== */

const DEFAULT_SHARE_PERCENT = 30;

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function toSolarDateValue(dateValue) {
  if (!dateValue) return null;

  const date =
    dateValue instanceof Date
      ? dateValue
      : new Date(`${String(dateValue).slice(0, 10)}T12:00:00Z`);

  if (Number.isNaN(date.getTime())) return null;

  const solar = dateToJalaali(date);

  return formatSolarDate(solar.jy, solar.jm, solar.jd);
}

function parseOptionalSolarDate(value) {
  if (!value) return null;

  return parseSolarDate(String(value)).gregorianDate;
}

function parseSolarMonth(value) {
  if (value === undefined || value === null || value === "") return null;

  const month = Number(value);

  if (!Number.isInteger(month) || month < 1 || month > 12) return null;

  return month;
}

function parseSolarYear(value) {
  if (value === undefined || value === null || value === "") return null;

  const year = Number(value);

  if (!Number.isInteger(year) || year < 1) return null;

  return year;
}

function getPositiveInteger(value, fallback) {
  const number = Number(value);

  if (!Number.isInteger(number) || number < 1) {
    return fallback;
  }

  return number;
}

function getPagination(req, defaults = {}) {
  const page = getPositiveInteger(req.query.page, defaults.page || 1);

  const requestedLimit = getPositiveInteger(
    req.query.limit,
    defaults.limit || 25,
  );

  const maxLimit = defaults.maxLimit || 100;
  const limit = Math.min(requestedLimit, maxLimit);

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
}

function buildPagination(page, limit, total) {
  const totalItems = Number(total || 0);
  const totalPages = totalItems > 0 ? Math.ceil(totalItems / Number(limit)) : 0;

  return {
    page: Number(page),
    limit: Number(limit),
    total_items: totalItems,
    total_pages: totalPages,
    has_previous: Number(page) > 1,
    has_next: Number(page) < totalPages,
  };
}

function normalizeUser(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    full_name: row.full_name || null,
    email: row.email || null,
    role: row.role || null,
  };
}

function monthName(month) {
  const names = [
    "Hamal",
    "Sawr",
    "Jawza",
    "Saratan",
    "Asad",
    "Sonbola",
    "Mizan",
    "Aqrab",
    "Qaws",
    "Jadi",
    "Dalwa",
    "Hoot",
  ];

  return names[Number(month) - 1] || null;
}

/*
  Afghanistan Solar Hijri month boundaries.

  Months 1-6 = 31 days
  Months 7-11 = 30 days
  Month 12 = 29 days for the academy's current supported year model.
*/
function solarMonthDays(year, month) {
  const y = Number(year);
  const m = Number(month);

  if (!Number.isInteger(y) || !Number.isInteger(m)) return null;
  if (m < 1 || m > 12) return null;

  if (m <= 6) return 31;
  if (m <= 11) return 30;

  return 29;
}

/* ==========================================================================
   SHARE RATE
========================================================================== */

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
    [DEFAULT_SHARE_PERCENT, adminId],
  );

  return inserted.rows[0];
}

async function getEffectiveShareRate(atTimestamp) {
  const result = await query(
    `
      SELECT
        id,
        percentage,
        effective_at
      FROM finance_share_rates
      WHERE effective_at <= COALESCE($1::timestamptz, NOW())
      ORDER BY
        effective_at DESC,
        id DESC
      LIMIT 1
    `,
    [atTimestamp || null],
  );

  if (!result.rows.length) {
    const fallback = await ensureDefaultShareRate();

    return {
      id: fallback?.id || null,
      percentage: Number(fallback?.percentage ?? DEFAULT_SHARE_PERCENT),
      effective_at: fallback?.effective_at || null,
    };
  }

  return {
    id: Number(result.rows[0].id),
    percentage: Number(result.rows[0].percentage),
    effective_at: result.rows[0].effective_at,
  };
}

/* ==========================================================================
   FINANCE ADMIN PASSWORD VERIFICATION
========================================================================== */

/*
  IMPORTANT:

  Finance intentionally does NOT use /auth/verify-password.

  That generic endpoint may accept other account passwords elsewhere.

  Finance requires the password of the currently authenticated ACTIVE ADMIN.
*/

async function verifyFinanceAdministratorPassword(req, password) {
  if (typeof password !== "string" || !password) {
    return false;
  }

  const adminId = Number(req.user?.id);

  if (!Number.isInteger(adminId) || adminId < 1) {
    return false;
  }

  const result = await query(
    `
      SELECT
        id,
        password_hash
      FROM users
      WHERE id = $1
        AND role = 'admin'
        AND is_active = TRUE
      LIMIT 1
    `,
    [adminId],
  );

  if (!result.rows.length) {
    return false;
  }

  return bcrypt.compare(password, result.rows[0].password_hash);
}

function createFinanceVerificationToken(req) {
  const adminId = Number(req.user?.id);

  return jwt.sign(
    {
      type: "finance_admin_password_verification",
      purpose: "finance",
      id: adminId,
      role: "admin",
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "5m",
    },
  );
}

function verifyFinanceVerificationToken(req, token) {
  if (typeof token !== "string" || !token.trim()) {
    return false;
  }

  const adminId = Number(req.user?.id);

  if (!Number.isInteger(adminId) || adminId < 1) {
    return false;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded?.type !== "finance_admin_password_verification") {
      return false;
    }

    if (decoded?.purpose !== "finance") {
      return false;
    }

    if (decoded?.role !== "admin") {
      return false;
    }

    if (Number(decoded?.id) !== adminId) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/* ==========================================================================
   ADMIN PASSWORD ENDPOINT
========================================================================== */

router.post(
  "/verify-admin-password",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const password = req.body?.password;

    const valid = await verifyFinanceAdministratorPassword(req, password);

    if (!valid) {
      return res.status(403).json({
        error: "Administrator password is incorrect.",
        code: "INVALID_FINANCE_ADMIN_PASSWORD",
      });
    }

    const verificationToken = createFinanceVerificationToken(req);

    const adminResult = await query(
      `
        SELECT
          id,
          full_name,
          email,
          role
        FROM users
        WHERE id = $1
          AND role = 'admin'
          AND is_active = TRUE
        LIMIT 1
      `,
      [req.user.id],
    );

    res.json({
      message: "Finance administrator password verified.",
      verification_token: verificationToken,
      verified_user: adminResult.rows[0]
        ? normalizeUser(adminResult.rows[0])
        : {
            id: Number(req.user.id),
            role: "admin",
          },
      expires_in: 300,
    });
  }),
);

/* ==========================================================================
   HEALTH
========================================================================== */

router.get(
  "/health",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const result = await query(`
      SELECT
        (SELECT COUNT(*) FROM finance_share_rates)::int
          AS share_rate_rows,

        (SELECT COUNT(*) FROM fee_payments)::int
          AS payment_rows,

        (
          SELECT COUNT(*)
          FROM fee_payments
          WHERE collected_by_user_id IS NOT NULL
        )::int AS collected_payment_rows,

        (
          SELECT COUNT(*)
          FROM finance_teacher_settlements
        )::int AS teacher_settlement_rows,

        (
          SELECT COUNT(*)
          FROM finance_staff_settlements
        )::int AS staff_settlement_rows,

        (
          SELECT COUNT(*)
          FROM fee_payment_audit
        )::int AS audit_rows
    `);

    const row = result.rows[0];

    res.json({
      status: "ok",

      database: {
        share_rate_rows: Number(row.share_rate_rows || 0),
        payment_rows: Number(row.payment_rows || 0),
        collected_payment_rows: Number(row.collected_payment_rows || 0),
        teacher_settlement_rows: Number(row.teacher_settlement_rows || 0),
        staff_settlement_rows: Number(row.staff_settlement_rows || 0),
        audit_rows: Number(row.audit_rows || 0),
      },
    });
  }),
);

/* ==========================================================================
   TEACHER SHARE RATE
========================================================================== */

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
            id: Number(current.id),
            percentage: Number(current.percentage),
            created_by_user_id: current.created_by_user_id
              ? Number(current.created_by_user_id)
              : null,
          }
        : null,

      history: history.rows.map((row) => ({
        id: Number(row.id),
        percentage: Number(row.percentage),
        effective_at: row.effective_at,
        created_at: row.created_at,
        created_by_user_id: row.created_by_user_id
          ? Number(row.created_by_user_id)
          : null,
        created_by_name: row.created_by_name,
      })),
    });
  }),
);

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
          id: Number(latest.id),
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
        id: Number(result.rows[0].id),
        percentage: Number(result.rows[0].percentage),
        created_by_user_id: result.rows[0].created_by_user_id
          ? Number(result.rows[0].created_by_user_id)
          : null,
      },
    });
  }),
);

/* ==========================================================================
   TEACHER ROSTER
========================================================================== */

router.get(
  "/teachers",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const result = await query(`
      SELECT
        t.id,
        t.full_name,

        COUNT(DISTINCT CASE
          WHEN cs.is_active = TRUE
          THEN cs.id
        END)::int AS class_count,

        COUNT(DISTINCT CASE
          WHEN cs.is_active = TRUE
          THEN se.student_id
        END)::int AS student_count

      FROM teachers t

      LEFT JOIN class_slots cs
        ON cs.teacher_id = t.id

      LEFT JOIN student_enrollments se
        ON se.class_slot_id = cs.id
       AND se.is_active = TRUE

      GROUP BY
        t.id,
        t.full_name

      ORDER BY
        t.full_name,
        t.id
    `);

    const classResult = await query(`
      SELECT
        t.id AS teacher_id,
        cs.id AS class_id,

        sub.id AS subject_id,
        sub.name AS subject_name,
        sub.code AS subject_code,

        cs.start_time,
        cs.end_time,
        cs.academic_year,
        cs.level,

        COUNT(DISTINCT se.student_id)::int AS student_count

      FROM teachers t

      INNER JOIN class_slots cs
        ON cs.teacher_id = t.id
       AND cs.is_active = TRUE

      LEFT JOIN subjects sub
        ON sub.id = cs.subject_id

      LEFT JOIN student_enrollments se
        ON se.class_slot_id = cs.id
       AND se.is_active = TRUE

      GROUP BY
        t.id,
        t.full_name,
        cs.id,
        sub.id,
        sub.name,
        sub.code,
        cs.start_time,
        cs.end_time,
        cs.academic_year,
        cs.level

      ORDER BY
        t.full_name,
        cs.start_time,
        cs.id
    `);

    const classesByTeacher = new Map();

    for (const row of classResult.rows) {
      const teacherId = Number(row.teacher_id);

      if (!classesByTeacher.has(teacherId)) {
        classesByTeacher.set(teacherId, []);
      }

      classesByTeacher.get(teacherId).push({
        class_id: Number(row.class_id),

        subject_id: row.subject_id ? Number(row.subject_id) : null,

        subject_name: row.subject_name || null,
        subject_code: row.subject_code || null,

        start_time: row.start_time,
        end_time: row.end_time,

        academic_year: row.academic_year || null,
        level: row.level || null,

        student_count: Number(row.student_count || 0),
      });
    }

    res.json(
      result.rows.map((row) => {
        const teacherId = Number(row.id);

        return {
          teacher_id: teacherId,
          teacher_name: row.full_name || "Unknown",

          class_count: Number(row.class_count || 0),
          student_count: Number(row.student_count || 0),

          classes: classesByTeacher.get(teacherId) || [],
        };
      }),
    );
  }),
);

/* ==========================================================================
   TEACHER MONTHLY FINANCE
========================================================================== */

/*
  Source of truth:

  fee_payment_allocations
      -> fee_period_months
      -> fee_periods
      -> student_enrollments
      -> class_slots
      -> teachers

  This avoids selecting only one fee period per enrollment and therefore
  preserves historical allocations correctly.
*/

router.get(
  "/teacher-monthly",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const teacherId = Number(req.query.teacher_id);
    const solarYear = parseSolarYear(req.query.solar_year);
    const solarMonth = parseSolarMonth(req.query.solar_month);

    if (!Number.isInteger(teacherId) || teacherId < 1) {
      return res.status(400).json({
        error: "A valid teacher is required.",
      });
    }

    if (!solarYear || !solarMonth) {
      return res.status(400).json({
        error: "Solar year and Solar month are required.",
      });
    }

    const pagination = getPagination(req, {
      page: 1,
      limit: 25,
      maxLimit: 100,
    });

    const teacherResult = await query(
      `
        SELECT
          id,
          full_name
        FROM teachers
        WHERE id = $1
        LIMIT 1
      `,
      [teacherId],
    );

    if (!teacherResult.rows.length) {
      return res.status(404).json({
        error: "Teacher not found.",
      });
    }

    /*
      One row per active student enrollment in one active class.

      Payment totals are calculated independently from all fee-period-month
      rows belonging to that enrollment and selected Solar month.
    */
    const countResult = await query(
      `
        SELECT COUNT(*)::int AS total
        FROM
        (
          SELECT DISTINCT
            s.id AS student_id,
            se.id AS enrollment_id,
            cs.id AS class_id

          FROM class_slots cs

          INNER JOIN student_enrollments se
            ON se.class_slot_id = cs.id
           AND se.is_active = TRUE

          INNER JOIN students s
            ON s.id = se.student_id

          WHERE cs.teacher_id = $1
            AND cs.is_active = TRUE
        ) x
      `,
      [teacherId],
    );

    const totalStudents = Number(countResult.rows[0]?.total || 0);

    const result = await query(
      `
        SELECT
          s.id AS student_id,
          s.full_name AS student_name,
          s.roll_number,

          se.id AS enrollment_id,
          se.enrolled_on,

          cs.id AS class_id,
          cs.level,
          cs.academic_year,

          sub.id AS subject_id,
          sub.name AS subject_name,
          sub.code AS subject_code,

          cs.start_time,
          cs.end_time,

          COALESCE(
            month_finance.expected_amount,
            0
          ) AS expected_amount,

          COALESCE(
            month_finance.paid_amount,
            0
          ) AS paid_amount,

          COALESCE(
            month_finance.payment_count,
            0
          ) AS payment_count,

          month_finance.last_payment_date,

          month_finance.fee_period_id,
          month_finance.fee_period_month_id,
          month_finance.month_days,
          month_finance.covered_days,
          month_finance.period_from_date,
          month_finance.period_to_date

        FROM class_slots cs

        INNER JOIN student_enrollments se
          ON se.class_slot_id = cs.id
         AND se.is_active = TRUE

        INNER JOIN students s
          ON s.id = se.student_id

        LEFT JOIN subjects sub
          ON sub.id = cs.subject_id

        LEFT JOIN LATERAL
        (
          SELECT
            SUM(
              COALESCE(
                fpm.calculated_amount,
                fpm.monthly_amount,
                0
              )
            ) AS expected_amount,

            SUM(
              COALESCE(
                payment_totals.paid_amount,
                0
              )
            ) AS paid_amount,

            SUM(
              COALESCE(
                payment_totals.payment_count,
                0
              )
            ) AS payment_count,

            MAX(payment_totals.last_payment_date)
              AS last_payment_date,

            MIN(fp.id) AS fee_period_id,
            MIN(fpm.id) AS fee_period_month_id,
            MAX(fpm.month_days) AS month_days,
            SUM(fpm.covered_days) AS covered_days,
            MIN(fp.from_date) AS period_from_date,
            MAX(fp.to_date) AS period_to_date

          FROM fee_periods fp

          INNER JOIN fee_period_months fpm
            ON fpm.fee_period_id = fp.id

          LEFT JOIN LATERAL
          (
            SELECT
              SUM(fpa.allocated_amount) AS paid_amount,
              COUNT(DISTINCT fpa.fee_payment_id)::int
                AS payment_count,
              MAX(fpmt.payment_date) AS last_payment_date

            FROM fee_payment_allocations fpa

            INNER JOIN fee_payments fpmt
              ON fpmt.id = fpa.fee_payment_id

            WHERE fpa.fee_period_month_id = fpm.id
          ) payment_totals
            ON TRUE

          WHERE fp.enrollment_id = se.id
            AND fpm.solar_year = $2
            AND fpm.solar_month = $3
        ) month_finance
          ON TRUE

        WHERE cs.teacher_id = $1
          AND cs.is_active = TRUE

        ORDER BY
          s.full_name,
          s.id,
          cs.id

        LIMIT $4
        OFFSET $5
      `,
      [teacherId, solarYear, solarMonth, pagination.limit, pagination.offset],
    );

    const students = result.rows.map((row) => {
      const expectedAmount = roundMoney(row.expected_amount);
      const paidAmount = roundMoney(row.paid_amount);

      let status = "no_period";

      if (expectedAmount > 0) {
        if (paidAmount >= expectedAmount) {
          status = "paid";
        } else if (paidAmount > 0) {
          status = "partial";
        } else {
          status = "unpaid";
        }
      }

      return {
        student_id: Number(row.student_id),
        student_name: row.student_name || "Unknown",
        roll_number: row.roll_number || null,

        enrollment_id: Number(row.enrollment_id),
        enrolled_on: row.enrolled_on,

        class_id: Number(row.class_id),
        level: row.level || null,
        academic_year: row.academic_year || null,

        subject_id: row.subject_id ? Number(row.subject_id) : null,

        subject_name: row.subject_name || null,
        subject_code: row.subject_code || null,

        start_time: row.start_time,
        end_time: row.end_time,

        fee_period_id: row.fee_period_id ? Number(row.fee_period_id) : null,

        fee_period_month_id: row.fee_period_month_id
          ? Number(row.fee_period_month_id)
          : null,

        period_from_date: row.period_from_date || null,
        period_to_date: row.period_to_date || null,

        month_days: row.month_days !== null ? Number(row.month_days) : null,

        covered_days:
          row.covered_days !== null ? Number(row.covered_days) : null,

        expected_amount: expectedAmount,
        paid_amount: paidAmount,

        outstanding_amount:
          expectedAmount > paidAmount
            ? roundMoney(expectedAmount - paidAmount)
            : 0,

        payment_count: Number(row.payment_count || 0),

        last_payment_date: row.last_payment_date || null,

        last_payment_solar_date: toSolarDateValue(row.last_payment_date),

        status,
      };
    });

    /*
      Full summary across ALL matching allocations.

      This is independent of pagination.
    */
    const totalsResult = await query(
      `
        WITH enrollment_months AS
        (
          SELECT
            se.id AS enrollment_id,
            SUM(
              COALESCE(
                fpm.calculated_amount,
                fpm.monthly_amount,
                0
              )
            ) AS expected_amount,

            SUM(
              COALESCE(payment_totals.paid_amount, 0)
            ) AS paid_amount

          FROM class_slots cs

          INNER JOIN student_enrollments se
            ON se.class_slot_id = cs.id
           AND se.is_active = TRUE

          INNER JOIN fee_periods fp
            ON fp.enrollment_id = se.id

          INNER JOIN fee_period_months fpm
            ON fpm.fee_period_id = fp.id
           AND fpm.solar_year = $2
           AND fpm.solar_month = $3

          LEFT JOIN LATERAL
          (
            SELECT
              SUM(fpa.allocated_amount) AS paid_amount

            FROM fee_payment_allocations fpa

            WHERE fpa.fee_period_month_id = fpm.id
          ) payment_totals
            ON TRUE

          WHERE cs.teacher_id = $1
            AND cs.is_active = TRUE

          GROUP BY se.id
        )
        SELECT
          COALESCE(SUM(expected_amount), 0)
            AS expected_amount,

          COALESCE(SUM(paid_amount), 0)
            AS paid_amount,

          COUNT(
            CASE
              WHEN expected_amount > 0
               AND paid_amount >= expected_amount
              THEN 1
            END
          )::int AS paid_count,

          COUNT(
            CASE
              WHEN expected_amount > 0
               AND paid_amount > 0
               AND paid_amount < expected_amount
              THEN 1
            END
          )::int AS partial_count,

          COUNT(
            CASE
              WHEN expected_amount > 0
               AND paid_amount = 0
              THEN 1
            END
          )::int AS unpaid_count

        FROM enrollment_months
      `,
      [teacherId, solarYear, solarMonth],
    );

    const totalRow = totalsResult.rows[0];

    const expectedTotal = roundMoney(totalRow?.expected_amount);

    const paidTotal = roundMoney(totalRow?.paid_amount);

    const outstandingTotal = Math.max(roundMoney(expectedTotal - paidTotal), 0);

    /*
      Historical teacher share rate is determined from actual payment
      creation timestamps for the selected Solar month.
    */
    const rateResult = await query(
      `
        SELECT
          fsr.id,
          fsr.percentage,
          fsr.effective_at
        FROM finance_share_rates fsr
        WHERE fsr.effective_at <= COALESCE(
          (
            SELECT MAX(fpmt.created_at)
            FROM fee_payment_allocations fpa

            INNER JOIN fee_payments fpmt
              ON fpmt.id = fpa.fee_payment_id

            INNER JOIN fee_period_months fpm
              ON fpm.id = fpa.fee_period_month_id

            INNER JOIN fee_periods fp
              ON fp.id = fpm.fee_period_id

            INNER JOIN student_enrollments se
              ON se.id = fp.enrollment_id

            INNER JOIN class_slots cs
              ON cs.id = se.class_slot_id

            WHERE cs.teacher_id = $1
              AND fpm.solar_year = $2
              AND fpm.solar_month = $3
          ),
          NOW()
        )

        ORDER BY
          fsr.effective_at DESC,
          fsr.id DESC

        LIMIT 1
      `,
      [teacherId, solarYear, solarMonth],
    );

    const sharePercent = Number(
      rateResult.rows[0]?.percentage ?? DEFAULT_SHARE_PERCENT,
    );

    /*
      The actual teacher amount is based on paid allocated money,
      not expected/unpaid money.
    */
    const teacherShareAmount = roundMoney((paidTotal * sharePercent) / 100);

    /*
      Ensure a persistent settlement exists for this teacher/month.

      We update the expected amount, but we NEVER reset a paid settlement
      back to pending.
    */
    const settlementResult = await query(
      `
        INSERT INTO finance_teacher_settlements
        (
          teacher_id,
          solar_year,
          solar_month,
          expected_amount
        )
        VALUES
        (
          $1,
          $2,
          $3,
          $4
        )
        ON CONFLICT
        (
          teacher_id,
          solar_year,
          solar_month
        )
        DO UPDATE SET
          expected_amount = EXCLUDED.expected_amount,
          updated_at = NOW()

        RETURNING
          id,
          teacher_id,
          solar_year,
          solar_month,
          expected_amount,
          status,
          paid_at,
          paid_by_user_id,
          created_at,
          updated_at
      `,
      [teacherId, solarYear, solarMonth, teacherShareAmount],
    );

    const settlement = settlementResult.rows[0];

    let paidBy = null;

    if (settlement?.paid_by_user_id) {
      const paidByResult = await query(
        `
          SELECT
            id,
            full_name,
            email,
            role
          FROM users
          WHERE id = $1
          LIMIT 1
        `,
        [settlement.paid_by_user_id],
      );

      paidBy = normalizeUser(paidByResult.rows[0]);
    }

    res.json({
      teacher: {
        teacher_id: Number(teacherResult.rows[0].id),
        teacher_name: teacherResult.rows[0].full_name || "Unknown",
      },

      month: {
        solar_year: solarYear,
        solar_month: solarMonth,
        month_name: monthName(solarMonth),
        month_days: solarMonthDays(solarYear, solarMonth),
      },

      summary: {
        student_count: totalStudents,

        paid_students: Number(totalRow?.paid_count || 0),

        partial_students: Number(totalRow?.partial_count || 0),

        unpaid_students: Number(totalRow?.unpaid_count || 0),

        expected_amount: expectedTotal,
        paid_amount: paidTotal,
        outstanding_amount: outstandingTotal,

        share_percent: sharePercent,
        teacher_share_amount: teacherShareAmount,
      },

      settlement: {
        id: Number(settlement.id),

        expected_amount: roundMoney(settlement.expected_amount),

        status: settlement.status,

        paid_at: settlement.paid_at || null,

        paid_at_solar_date: toSolarDateValue(settlement.paid_at),

        paid_by_user_id: settlement.paid_by_user_id
          ? Number(settlement.paid_by_user_id)
          : null,

        paid_by: paidBy,

        created_at: settlement.created_at,
        updated_at: settlement.updated_at,
      },

      students,

      pagination: buildPagination(
        pagination.page,
        pagination.limit,
        totalStudents,
      ),
    });
  }),
);

/* ==========================================================================
   TEACHER HISTORY
========================================================================== */

router.get(
  "/teacher-history",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const teacherId = Number(req.query.teacher_id);

    if (!Number.isInteger(teacherId) || teacherId < 1) {
      return res.status(400).json({
        error: "A valid teacher is required.",
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
          fpm.solar_year,
          fpm.solar_month,

          COUNT(DISTINCT fp.id)::int AS payment_count,

          COALESCE(
            SUM(fpa.allocated_amount),
            0
          ) AS collected_amount,

          COALESCE(
            SUM(
              fpa.allocated_amount
              *
              COALESCE(
                share_rate.percentage,
                $3
              )
              / 100
            ),
            0
          ) AS teacher_share_amount,

          COALESCE(
            MAX(share_rate.percentage),
            $3
          ) AS share_percent

        FROM fee_payment_allocations fpa

        INNER JOIN fee_payments fp
          ON fp.id = fpa.fee_payment_id

        INNER JOIN fee_period_months fpm
          ON fpm.id = fpa.fee_period_month_id

        INNER JOIN fee_periods fper
          ON fper.id = fpm.fee_period_id

        INNER JOIN student_enrollments se
          ON se.id = fper.enrollment_id

        INNER JOIN class_slots cs
          ON cs.id = se.class_slot_id

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
          cs.teacher_id = $1

          AND
          (
            $2::date IS NULL
            OR fp.payment_date >= $2::date
          )

          AND
          (
            $4::date IS NULL
            OR fp.payment_date <= $4::date
          )

        GROUP BY
          fpm.solar_year,
          fpm.solar_month

        ORDER BY
          fpm.solar_year DESC,
          fpm.solar_month DESC
      `,
      [teacherId, fromDate, DEFAULT_SHARE_PERCENT, toDate],
    );

    const months = [];

    for (const row of result.rows) {
      const year = Number(row.solar_year);
      const month = Number(row.solar_month);

      /*
        Load the persistent settlement if one exists.
      */
      const settlementResult = await query(
        `
          SELECT
            fts.id,
            fts.expected_amount,
            fts.status,
            fts.paid_at,
            fts.paid_by_user_id,
            fts.created_at,
            fts.updated_at,

            u.full_name AS paid_by_name,
            u.email AS paid_by_email,
            u.role AS paid_by_role

          FROM finance_teacher_settlements fts

          LEFT JOIN users u
            ON u.id = fts.paid_by_user_id

          WHERE fts.teacher_id = $1
            AND fts.solar_year = $2
            AND fts.solar_month = $3

          LIMIT 1
        `,
        [teacherId, year, month],
      );

      const settlement = settlementResult.rows[0] || null;

      months.push({
        solar_year: year,
        solar_month: month,
        month_name: monthName(month),

        payment_count: Number(row.payment_count || 0),

        collected_amount: roundMoney(row.collected_amount),

        share_percent: Number(row.share_percent ?? DEFAULT_SHARE_PERCENT),

        teacher_share_amount: roundMoney(row.teacher_share_amount),

        settlement: settlement
          ? {
              id: Number(settlement.id),

              expected_amount: roundMoney(settlement.expected_amount),

              status: settlement.status,

              paid_at: settlement.paid_at || null,

              paid_at_solar_date: toSolarDateValue(settlement.paid_at),

              paid_by_user_id: settlement.paid_by_user_id
                ? Number(settlement.paid_by_user_id)
                : null,

              paid_by: settlement.paid_by_user_id
                ? {
                    id: Number(settlement.paid_by_user_id),
                    full_name: settlement.paid_by_name || null,
                    email: settlement.paid_by_email || null,
                    role: settlement.paid_by_role || null,
                  }
                : null,

              created_at: settlement.created_at,
              updated_at: settlement.updated_at,
            }
          : {
              id: null,
              expected_amount: roundMoney(row.teacher_share_amount),
              status: "pending",
              paid_at: null,
              paid_at_solar_date: null,
              paid_by_user_id: null,
              paid_by: null,
              created_at: null,
              updated_at: null,
            },
      });
    }

    res.json({
      teacher_id: teacherId,

      from_solar_date: req.query.from_solar_date || null,

      to_solar_date: req.query.to_solar_date || null,

      months,
    });
  }),
);

/* ==========================================================================
   MARK TEACHER SETTLEMENT AS PAID
========================================================================== */

router.put(
  "/teacher-settlements/:id/pay",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const settlementId = Number(req.params.id);

    if (!Number.isInteger(settlementId) || settlementId < 1) {
      return res.status(400).json({
        error: "Invalid teacher settlement ID.",
      });
    }

    const verificationToken = req.body?.verification_token;

    if (!verifyFinanceVerificationToken(req, verificationToken)) {
      return res.status(403).json({
        error:
          "A valid administrator password verification is required before marking a teacher settlement as paid.",
        code: "FINANCE_PASSWORD_VERIFICATION_REQUIRED",
      });
    }

    const existing = await query(
      `
        SELECT
          fts.*,
          t.full_name AS teacher_name

        FROM finance_teacher_settlements fts

        INNER JOIN teachers t
          ON t.id = fts.teacher_id

        WHERE fts.id = $1
        LIMIT 1
      `,
      [settlementId],
    );

    if (!existing.rows.length) {
      return res.status(404).json({
        error: "Teacher settlement not found.",
      });
    }

    const current = existing.rows[0];

    if (current.status === "paid") {
      return res.json({
        message: "This teacher settlement has already been marked as paid.",

        settlement: {
          id: Number(current.id),
          teacher_id: Number(current.teacher_id),
          teacher_name: current.teacher_name || "Unknown",

          solar_year: Number(current.solar_year),

          solar_month: Number(current.solar_month),

          expected_amount: roundMoney(current.expected_amount),

          status: current.status,

          paid_at: current.paid_at,
          paid_by_user_id: current.paid_by_user_id
            ? Number(current.paid_by_user_id)
            : null,
        },
      });
    }

    const result = await query(
      `
        UPDATE finance_teacher_settlements

        SET
          status = 'paid',
          paid_at = NOW(),
          paid_by_user_id = $1,
          updated_at = NOW()

        WHERE id = $2

        RETURNING *
      `,
      [req.user.id, settlementId],
    );

    const row = result.rows[0];

    const userResult = await query(
      `
        SELECT
          id,
          full_name,
          email,
          role
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [row.paid_by_user_id],
    );

    res.json({
      message: "Teacher settlement marked as paid successfully.",

      settlement: {
        id: Number(row.id),

        teacher_id: Number(row.teacher_id),

        teacher_name: current.teacher_name || "Unknown",

        solar_year: Number(row.solar_year),
        solar_month: Number(row.solar_month),

        month_name: monthName(Number(row.solar_month)),

        expected_amount: roundMoney(row.expected_amount),

        status: row.status,

        paid_at: row.paid_at,

        paid_at_solar_date: toSolarDateValue(row.paid_at),

        paid_by_user_id: row.paid_by_user_id
          ? Number(row.paid_by_user_id)
          : null,

        paid_by: normalizeUser(userResult.rows[0]),

        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    });
  }),
);

/* ==========================================================================
   TEACHER SETTLEMENT LIST
========================================================================== */

router.get(
  "/teacher-settlements",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const teacherId = req.query.teacher_id
      ? Number(req.query.teacher_id)
      : null;

    const solarYear = parseSolarYear(req.query.solar_year);

    const solarMonth = parseSolarMonth(req.query.solar_month);

    if (teacherId !== null && (!Number.isInteger(teacherId) || teacherId < 1)) {
      return res.status(400).json({
        error: "Invalid teacher ID.",
      });
    }

    const pagination = getPagination(req, {
      page: 1,
      limit: 25,
      maxLimit: 100,
    });

    const countResult = await query(
      `
        SELECT COUNT(*)::int AS total

        FROM finance_teacher_settlements fts

        WHERE
          (
            $1::integer IS NULL
            OR fts.teacher_id = $1
          )

          AND
          (
            $2::integer IS NULL
            OR fts.solar_year = $2
          )

          AND
          (
            $3::integer IS NULL
            OR fts.solar_month = $3
          )
      `,
      [teacherId, solarYear, solarMonth],
    );

    const totalItems = Number(countResult.rows[0]?.total || 0);

    const result = await query(
      `
        SELECT
          fts.id,
          fts.teacher_id,
          t.full_name AS teacher_name,

          fts.solar_year,
          fts.solar_month,

          fts.expected_amount,
          fts.status,

          fts.paid_at,
          fts.paid_by_user_id,

          paid_by.full_name AS paid_by_name,
          paid_by.email AS paid_by_email,
          paid_by.role AS paid_by_role,

          fts.created_at,
          fts.updated_at

        FROM finance_teacher_settlements fts

        INNER JOIN teachers t
          ON t.id = fts.teacher_id

        LEFT JOIN users paid_by
          ON paid_by.id = fts.paid_by_user_id

        WHERE
          (
            $1::integer IS NULL
            OR fts.teacher_id = $1
          )

          AND
          (
            $2::integer IS NULL
            OR fts.solar_year = $2
          )

          AND
          (
            $3::integer IS NULL
            OR fts.solar_month = $3
          )

        ORDER BY
          fts.solar_year DESC,
          fts.solar_month DESC,
          t.full_name ASC,
          fts.id DESC

        LIMIT $4
        OFFSET $5
      `,
      [teacherId, solarYear, solarMonth, pagination.limit, pagination.offset],
    );

    res.json({
      settlements: result.rows.map((row) => ({
        id: Number(row.id),

        teacher_id: Number(row.teacher_id),

        teacher_name: row.teacher_name || "Unknown",

        solar_year: Number(row.solar_year),
        solar_month: Number(row.solar_month),

        month_name: monthName(Number(row.solar_month)),

        expected_amount: roundMoney(row.expected_amount),

        status: row.status,

        paid_at: row.paid_at || null,

        paid_at_solar_date: toSolarDateValue(row.paid_at),

        paid_by_user_id: row.paid_by_user_id
          ? Number(row.paid_by_user_id)
          : null,

        paid_by: row.paid_by_user_id
          ? {
              id: Number(row.paid_by_user_id),
              full_name: row.paid_by_name || null,
              email: row.paid_by_email || null,
              role: row.paid_by_role || null,
            }
          : null,

        created_at: row.created_at,
        updated_at: row.updated_at,
      })),

      pagination: buildPagination(
        pagination.page,
        pagination.limit,
        totalItems,
      ),
    });
  }),
);

/* ==========================================================================
   TEACHER PAYMENT ALLOCATIONS / TRANSACTION HISTORY
========================================================================== */

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

    const pagination = getPagination(req, {
      page: 1,
      limit: 50,
      maxLimit: 200,
    });

    const teacherId = req.query.teacher_id
      ? Number(req.query.teacher_id)
      : null;

    if (teacherId !== null && (!Number.isInteger(teacherId) || teacherId < 1)) {
      return res.status(400).json({
        error: "Invalid teacher ID.",
      });
    }

    const countResult = await query(
      `
        SELECT COUNT(*)::int AS total

        FROM fee_payment_allocations fpa

        INNER JOIN fee_payments fp
          ON fp.id = fpa.fee_payment_id

        INNER JOIN fee_period_months fpm
          ON fpm.id = fpa.fee_period_month_id

        INNER JOIN fee_periods fper
          ON fper.id = fpm.fee_period_id

        INNER JOIN student_enrollments se
          ON se.id = fper.enrollment_id

        INNER JOIN class_slots cs
          ON cs.id = se.class_slot_id

        WHERE
          ($1::date IS NULL
            OR fp.payment_date >= $1::date)

          AND
          ($2::date IS NULL
            OR fp.payment_date <= $2::date)

          AND
          ($3::integer IS NULL
            OR cs.teacher_id = $3)
      `,
      [fromDate, toDate, teacherId],
    );

    const totalItems = Number(countResult.rows[0]?.total || 0);

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
          fp.recorded_by,

          collector.full_name AS collector_name,
          collector.role AS collector_role,

          recorder.full_name AS recorder_name,
          recorder.role AS recorder_role,

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

          fpm.solar_year,
          fpm.solar_month,

          COALESCE(
            share_rate.percentage,
            $6
          ) AS share_percent

        FROM fee_payment_allocations fpa

        INNER JOIN fee_payments fp
          ON fp.id = fpa.fee_payment_id

        INNER JOIN fee_period_months fpm
          ON fpm.id = fpa.fee_period_month_id

        INNER JOIN fee_periods fper
          ON fper.id = fpm.fee_period_id

        INNER JOIN student_enrollments se
          ON se.id = fper.enrollment_id

        INNER JOIN students s
          ON s.id = se.student_id

        INNER JOIN class_slots cs
          ON cs.id = se.class_slot_id

        INNER JOIN teachers t
          ON t.id = cs.teacher_id

        LEFT JOIN subjects sub
          ON sub.id = cs.subject_id

        LEFT JOIN users collector
          ON collector.id = fp.collected_by_user_id

        LEFT JOIN users recorder
          ON recorder.id = fp.recorded_by

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
          ($1::date IS NULL
            OR fp.payment_date >= $1::date)

          AND
          ($2::date IS NULL
            OR fp.payment_date <= $2::date)

          AND
          ($3::integer IS NULL
            OR cs.teacher_id = $3)

        ORDER BY
          fp.payment_date DESC,
          fp.id DESC,
          fpa.id ASC

        LIMIT $4
        OFFSET $5
      `,
      [
        fromDate,
        toDate,
        teacherId,
        pagination.limit,
        pagination.offset,
        DEFAULT_SHARE_PERCENT,
      ],
    );

    const payments = result.rows.map((row) => {
      const allocatedAmount = roundMoney(row.allocated_amount);

      const sharePercent = Number(row.share_percent || DEFAULT_SHARE_PERCENT);

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

        allocation_id: row.allocation_id ? Number(row.allocation_id) : null,

        solar_year: row.solar_year !== null ? Number(row.solar_year) : null,

        solar_month: row.solar_month !== null ? Number(row.solar_month) : null,

        covered_days:
          row.covered_days !== null ? Number(row.covered_days) : null,

        allocated_amount:
          row.allocated_amount !== null ? allocatedAmount : null,

        coverage_from_date: row.coverage_from_date || null,

        coverage_from_solar_date: toSolarDateValue(row.coverage_from_date),

        coverage_to_date: row.coverage_to_date || null,

        coverage_to_solar_date: toSolarDateValue(row.coverage_to_date),

        share_percent: sharePercent,

        teacher_share_amount: row.teacher_id
          ? roundMoney((allocatedAmount * sharePercent) / 100)
          : 0,

        collected_by_user_id: row.collected_by_user_id
          ? Number(row.collected_by_user_id)
          : null,

        collector_name: row.collector_name || null,

        collector_role: row.collector_role || null,

        recorded_by: row.recorded_by ? Number(row.recorded_by) : null,

        recorder_name: row.recorder_name || null,

        recorder_role: row.recorder_role || null,
      };
    });

    res.json({
      filters: {
        from_solar_date: req.query.from_solar_date || null,

        to_solar_date: req.query.to_solar_date || null,

        teacher_id: teacherId,
      },

      payments,

      pagination: buildPagination(
        pagination.page,
        pagination.limit,
        totalItems,
      ),
    });
  }),
);

/* ==========================================================================
   STAFF / COLLECTORS
========================================================================== */

router.get(
  "/collectors",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    /*
      Finance recognizes staff accounts by the application's staff role.

      Admin is also included because an admin can be the person who records
      a payment.

      We do NOT modify the users role constraint here.
    */
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
        user_id: Number(row.id),
        full_name: row.full_name || "Unknown",
        email: row.email || null,
        role: row.role || null,
      })),
    );
  }),
);

/* ==========================================================================
   STAFF SUMMARY
========================================================================== */

router.get(
  "/staff-summary",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const solarYear = parseSolarYear(req.query.solar_year);

    const solarMonth = parseSolarMonth(req.query.solar_month);

    if (!solarYear || !solarMonth) {
      return res.status(400).json({
        error: "Solar year and Solar month are required.",
      });
    }

    const pagination = getPagination(req, {
      page: 1,
      limit: 25,
      maxLimit: 100,
    });

    /*
      Staff expected amount is the total amount of payments that the
      particular collector recorded/collected during the selected
      Solar month.

      The payment itself remains untouched.
    */
    const countResult = await query(`
      SELECT COUNT(*)::int AS total
      FROM users u
      WHERE
        u.role IN ('admin', 'staff')
        AND u.is_active = TRUE
    `);

    const totalItems = Number(countResult.rows[0]?.total || 0);

    const result = await query(
      `
        SELECT
          u.id,
          u.full_name,
          u.email,
          u.role,

          COUNT(fp.id)::int AS payment_count,

          COALESCE(
            SUM(fp.amount),
            0
          ) AS total_amount,

          MAX(fp.payment_date)
            AS last_payment_date,

          COALESCE(
            settlement.status,
            'pending'
          ) AS settlement_status,

          settlement.id AS settlement_id,

          settlement.expected_amount
            AS settlement_expected_amount,

          settlement.received_at,

          settlement.received_by_user_id,

          received_by.full_name
            AS received_by_name,

          received_by.email
            AS received_by_email,

          received_by.role
            AS received_by_role

        FROM users u

        LEFT JOIN fee_payments fp
          ON fp.collected_by_user_id = u.id

        LEFT JOIN LATERAL
        (
          SELECT
            fss.id,
            fss.expected_amount,
            fss.status,
            fss.received_at,
            fss.received_by_user_id

          FROM finance_staff_settlements fss

          WHERE fss.staff_user_id = u.id
            AND fss.solar_year = $1
            AND fss.solar_month = $2

          LIMIT 1
        ) settlement
          ON TRUE

        LEFT JOIN users received_by
          ON received_by.id =
             settlement.received_by_user_id

        WHERE
          u.role IN ('admin', 'staff')
          AND u.is_active = TRUE

        GROUP BY
          u.id,
          u.full_name,
          u.email,
          u.role,

          settlement.id,
          settlement.expected_amount,
          settlement.status,
          settlement.received_at,
          settlement.received_by_user_id,

          received_by.full_name,
          received_by.email,
          received_by.role

        ORDER BY
          u.full_name,
          u.id

        LIMIT $3
        OFFSET $4
      `,
      [solarYear, solarMonth, pagination.limit, pagination.offset],
    );

    const staff = [];

    for (const row of result.rows) {
      const totalAmount = roundMoney(row.total_amount);

      /*
        Ensure a persistent settlement record exists.

        If the row already exists and is received, its status remains
        received.
      */
      const settlementResult = await query(
        `
          INSERT INTO finance_staff_settlements
          (
            staff_user_id,
            solar_year,
            solar_month,
            expected_amount
          )
          VALUES
          (
            $1,
            $2,
            $3,
            $4
          )

          ON CONFLICT
          (
            staff_user_id,
            solar_year,
            solar_month
          )

          DO UPDATE SET
            expected_amount = EXCLUDED.expected_amount,
            updated_at = NOW()

          RETURNING
            id,
            staff_user_id,
            solar_year,
            solar_month,
            expected_amount,
            status,
            received_at,
            received_by_user_id,
            created_at,
            updated_at
        `,
        [Number(row.id), solarYear, solarMonth, totalAmount],
      );

      const settlement = settlementResult.rows[0];

      let receivedBy = null;

      if (settlement?.received_by_user_id) {
        const receivedByResult = await query(
          `
              SELECT
                id,
                full_name,
                email,
                role
              FROM users
              WHERE id = $1
              LIMIT 1
            `,
          [settlement.received_by_user_id],
        );

        receivedBy = normalizeUser(receivedByResult.rows[0]);
      }

      staff.push({
        user_id: Number(row.id),

        full_name: row.full_name || "Unknown",

        email: row.email || null,

        role: row.role || null,

        payment_count: Number(row.payment_count || 0),

        total_amount: totalAmount,

        last_payment_date: row.last_payment_date || null,

        last_payment_solar_date: toSolarDateValue(row.last_payment_date),

        settlement: {
          id: Number(settlement.id),

          expected_amount: roundMoney(settlement.expected_amount),

          status: settlement.status,

          received_at: settlement.received_at || null,

          received_at_solar_date: toSolarDateValue(settlement.received_at),

          received_by_user_id: settlement.received_by_user_id
            ? Number(settlement.received_by_user_id)
            : null,

          received_by: receivedBy,

          created_at: settlement.created_at,

          updated_at: settlement.updated_at,
        },
      });
    }

    res.json({
      solar_year: solarYear,
      solar_month: solarMonth,
      month_name: monthName(solarMonth),

      staff,

      pagination: buildPagination(
        pagination.page,
        pagination.limit,
        totalItems,
      ),
    });
  }),
);

/* ==========================================================================
   STAFF PAYMENTS
========================================================================== */

router.get(
  "/staff-payments",
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

    const pagination = getPagination(req, {
      page: 1,
      limit: 25,
      maxLimit: 100,
    });

    const countResult = await query(
      `
        SELECT COUNT(*)::int AS total

        FROM fee_payments fp

        WHERE
          (
            $1::integer IS NULL
            OR fp.collected_by_user_id = $1
          )

          AND
          (
            $2::date IS NULL
            OR fp.payment_date >= $2
          )

          AND
          (
            $3::date IS NULL
            OR fp.payment_date <= $3
          )
      `,
      [collectorUserId, fromDate, toDate],
    );

    const totalItems = Number(countResult.rows[0]?.total || 0);

    const result = await query(
      `
        SELECT
          fp.id AS payment_id,
          fp.amount,
          fp.payment_date,
          fp.receipt_number,
          fp.comment,
          fp.created_at,

          fp.collected_by_user_id,

          collector.full_name
            AS collector_name,

          collector.role
            AS collector_role,

          fp.recorded_by,

          recorder.full_name
            AS recorder_name,

          recorder.role
            AS recorder_role,

          s.id AS student_id,
          s.full_name AS student_name,
          s.roll_number,

          fpa.id AS allocation_id,
          fpa.allocated_amount,
          fpa.covered_days,
          fpa.from_date,
          fpa.to_date,

          fpm.solar_year,
          fpm.solar_month

        FROM fee_payments fp

        INNER JOIN fees f
          ON f.id = fp.fee_id

        INNER JOIN students s
          ON s.id = f.student_id

        LEFT JOIN users collector
          ON collector.id =
             fp.collected_by_user_id

        LEFT JOIN users recorder
          ON recorder.id =
             fp.recorded_by

        LEFT JOIN fee_payment_allocations fpa
          ON fpa.fee_payment_id = fp.id

        LEFT JOIN fee_period_months fpm
          ON fpm.id =
             fpa.fee_period_month_id

        WHERE
          (
            $1::integer IS NULL
            OR fp.collected_by_user_id = $1
          )

          AND
          (
            $2::date IS NULL
            OR fp.payment_date >= $2
          )

          AND
          (
            $3::date IS NULL
            OR fp.payment_date <= $3
          )

        ORDER BY
          fp.payment_date DESC,
          fp.id DESC,
          fpa.id ASC

        LIMIT $4
        OFFSET $5
      `,
      [collectorUserId, fromDate, toDate, pagination.limit, pagination.offset],
    );

    const payments = result.rows.map((row) => ({
      payment_id: Number(row.payment_id),

      amount: roundMoney(row.amount),

      payment_date: row.payment_date,

      payment_solar_date: toSolarDateValue(row.payment_date),

      receipt_number: row.receipt_number || null,

      comment: row.comment || null,

      created_at: row.created_at,

      student_id: Number(row.student_id),

      student_name: row.student_name || "Unknown",

      roll_number: row.roll_number || null,

      collected_by_user_id: row.collected_by_user_id
        ? Number(row.collected_by_user_id)
        : null,

      collector_name: row.collector_name || null,

      collector_role: row.collector_role || null,

      recorded_by: row.recorded_by ? Number(row.recorded_by) : null,

      recorder_name: row.recorder_name || null,

      recorder_role: row.recorder_role || null,

      allocation_id: row.allocation_id ? Number(row.allocation_id) : null,

      allocated_amount:
        row.allocated_amount !== null ? roundMoney(row.allocated_amount) : null,

      covered_days: row.covered_days !== null ? Number(row.covered_days) : null,

      month:
        row.solar_year !== null && row.solar_month !== null
          ? {
              solar_year: Number(row.solar_year),
              solar_month: Number(row.solar_month),
              month_name: monthName(Number(row.solar_month)),
            }
          : null,

      coverage_from_date: row.from_date || null,

      coverage_from_solar_date: toSolarDateValue(row.from_date),

      coverage_to_date: row.to_date || null,

      coverage_to_solar_date: toSolarDateValue(row.to_date),
    }));

    /*
      The frontend gets totals for the selected page's actual payment
      records without duplicating a payment because of allocations.
    */
    const totalAmountResult = await query(
      `
        SELECT
          COUNT(*)::int AS payment_count,

          COALESCE(
            SUM(fp.amount),
            0
          ) AS amount

        FROM fee_payments fp

        WHERE
          (
            $1::integer IS NULL
            OR fp.collected_by_user_id = $1
          )

          AND
          (
            $2::date IS NULL
            OR fp.payment_date >= $2
          )

          AND
          (
            $3::date IS NULL
            OR fp.payment_date <= $3
          )
      `,
      [collectorUserId, fromDate, toDate],
    );

    res.json({
      filters: {
        collector_user_id: collectorUserId,

        from_solar_date: req.query.from_solar_date || null,

        to_solar_date: req.query.to_solar_date || null,
      },

      totals: {
        payment_count: Number(totalAmountResult.rows[0]?.payment_count || 0),

        amount: roundMoney(totalAmountResult.rows[0]?.amount),
      },

      payments,

      pagination: buildPagination(
        pagination.page,
        pagination.limit,
        totalItems,
      ),
    });
  }),
);

/* ==========================================================================
   STAFF SETTLEMENT LIST
========================================================================== */

router.get(
  "/staff-settlements",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const staffUserId = req.query.staff_user_id
      ? Number(req.query.staff_user_id)
      : null;

    const solarYear = parseSolarYear(req.query.solar_year);

    const solarMonth = parseSolarMonth(req.query.solar_month);

    if (
      staffUserId !== null &&
      (!Number.isInteger(staffUserId) || staffUserId < 1)
    ) {
      return res.status(400).json({
        error: "Invalid staff user ID.",
      });
    }

    const pagination = getPagination(req, {
      page: 1,
      limit: 25,
      maxLimit: 100,
    });

    const countResult = await query(
      `
        SELECT COUNT(*)::int AS total

        FROM finance_staff_settlements fss

        WHERE
          (
            $1::integer IS NULL
            OR fss.staff_user_id = $1
          )

          AND
          (
            $2::integer IS NULL
            OR fss.solar_year = $2
          )

          AND
          (
            $3::integer IS NULL
            OR fss.solar_month = $3
          )
      `,
      [staffUserId, solarYear, solarMonth],
    );

    const totalItems = Number(countResult.rows[0]?.total || 0);

    const result = await query(
      `
        SELECT
          fss.id,

          fss.staff_user_id,

          u.full_name AS staff_name,
          u.email AS staff_email,
          u.role AS staff_role,

          fss.solar_year,
          fss.solar_month,

          fss.expected_amount,
          fss.status,

          fss.received_at,
          fss.received_by_user_id,

          received_by.full_name
            AS received_by_name,

          received_by.email
            AS received_by_email,

          received_by.role
            AS received_by_role,

          fss.created_at,
          fss.updated_at

        FROM finance_staff_settlements fss

        INNER JOIN users u
          ON u.id = fss.staff_user_id

        LEFT JOIN users received_by
          ON received_by.id =
             fss.received_by_user_id

        WHERE
          (
            $1::integer IS NULL
            OR fss.staff_user_id = $1
          )

          AND
          (
            $2::integer IS NULL
            OR fss.solar_year = $2
          )

          AND
          (
            $3::integer IS NULL
            OR fss.solar_month = $3
          )

        ORDER BY
          fss.solar_year DESC,
          fss.solar_month DESC,
          u.full_name ASC,
          fss.id DESC

        LIMIT $4
        OFFSET $5
      `,
      [staffUserId, solarYear, solarMonth, pagination.limit, pagination.offset],
    );

    res.json({
      settlements: result.rows.map((row) => ({
        id: Number(row.id),

        staff_user_id: Number(row.staff_user_id),

        staff_name: row.staff_name || "Unknown",

        staff_email: row.staff_email || null,

        staff_role: row.staff_role || null,

        solar_year: Number(row.solar_year),

        solar_month: Number(row.solar_month),

        month_name: monthName(Number(row.solar_month)),

        expected_amount: roundMoney(row.expected_amount),

        status: row.status,

        received_at: row.received_at || null,

        received_at_solar_date: toSolarDateValue(row.received_at),

        received_by_user_id: row.received_by_user_id
          ? Number(row.received_by_user_id)
          : null,

        received_by: row.received_by_user_id
          ? {
              id: Number(row.received_by_user_id),
              full_name: row.received_by_name || null,
              email: row.received_by_email || null,
              role: row.received_by_role || null,
            }
          : null,

        created_at: row.created_at,

        updated_at: row.updated_at,
      })),

      pagination: buildPagination(
        pagination.page,
        pagination.limit,
        totalItems,
      ),
    });
  }),
);

/* ==========================================================================
   MARK STAFF SETTLEMENT AS RECEIVED
========================================================================== */

router.put(
  "/staff-settlements/:id/receive",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const settlementId = Number(req.params.id);

    if (!Number.isInteger(settlementId) || settlementId < 1) {
      return res.status(400).json({
        error: "Invalid staff settlement ID.",
      });
    }

    const verificationToken = req.body?.verification_token;

    if (!verifyFinanceVerificationToken(req, verificationToken)) {
      return res.status(403).json({
        error:
          "A valid administrator password verification is required before marking a staff settlement as received.",
        code: "FINANCE_PASSWORD_VERIFICATION_REQUIRED",
      });
    }

    const existing = await query(
      `
        SELECT
          fss.*,

          u.full_name AS staff_name,
          u.email AS staff_email,
          u.role AS staff_role

        FROM finance_staff_settlements fss

        INNER JOIN users u
          ON u.id = fss.staff_user_id

        WHERE fss.id = $1

        LIMIT 1
      `,
      [settlementId],
    );

    if (!existing.rows.length) {
      return res.status(404).json({
        error: "Staff settlement not found.",
      });
    }

    const current = existing.rows[0];

    if (current.status === "received") {
      return res.json({
        message: "This staff settlement has already been marked as received.",

        settlement: {
          id: Number(current.id),

          staff_user_id: Number(current.staff_user_id),

          staff_name: current.staff_name || "Unknown",

          solar_year: Number(current.solar_year),

          solar_month: Number(current.solar_month),

          expected_amount: roundMoney(current.expected_amount),

          status: current.status,

          received_at: current.received_at,

          received_by_user_id: current.received_by_user_id
            ? Number(current.received_by_user_id)
            : null,
        },
      });
    }

    const result = await query(
      `
        UPDATE finance_staff_settlements

        SET
          status = 'received',
          received_at = NOW(),
          received_by_user_id = $1,
          updated_at = NOW()

        WHERE id = $2

        RETURNING *
      `,
      [req.user.id, settlementId],
    );

    const row = result.rows[0];

    const receivedByResult = await query(
      `
          SELECT
            id,
            full_name,
            email,
            role

          FROM users

          WHERE id = $1

          LIMIT 1
        `,
      [row.received_by_user_id],
    );

    res.json({
      message: "Staff settlement marked as received successfully.",

      settlement: {
        id: Number(row.id),

        staff_user_id: Number(row.staff_user_id),

        staff_name: current.staff_name || "Unknown",

        staff_email: current.staff_email || null,

        staff_role: current.staff_role || null,

        solar_year: Number(row.solar_year),

        solar_month: Number(row.solar_month),

        month_name: monthName(Number(row.solar_month)),

        expected_amount: roundMoney(row.expected_amount),

        status: row.status,

        received_at: row.received_at,

        received_at_solar_date: toSolarDateValue(row.received_at),

        received_by_user_id: row.received_by_user_id
          ? Number(row.received_by_user_id)
          : null,

        received_by: normalizeUser(receivedByResult.rows[0]),

        created_at: row.created_at,

        updated_at: row.updated_at,
      },
    });
  }),
);

/* ==========================================================================
   STAFF ACTIVITY / PAYMENT AUDIT
========================================================================== */

router.get(
  "/staff-activity",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const userId = req.query.user_id ? Number(req.query.user_id) : null;

    if (userId !== null && (!Number.isInteger(userId) || userId < 1)) {
      return res.status(400).json({
        error: "Invalid user ID.",
      });
    }

    const pagination = getPagination(req, {
      page: 1,
      limit: 25,
      maxLimit: 100,
    });

    const countResult = await query(
      `
        SELECT COUNT(*)::int AS total

        FROM fee_payment_audit a

        WHERE
          $1::integer IS NULL
          OR a.performed_by = $1
      `,
      [userId],
    );

    const totalItems = Number(countResult.rows[0]?.total || 0);

    const result = await query(
      `
        SELECT
          a.id,
          a.fee_payment_id,
          a.receipt_number,
          a.action,

          a.performed_by,
          a.performed_by_name,
          a.performed_by_role,
          a.performed_at,

          a.old_data,
          a.new_data,

          fp.amount,
          fp.payment_date,

          s.id AS student_id,
          s.full_name AS student_name,
          s.roll_number

        FROM fee_payment_audit a

        LEFT JOIN fee_payments fp
          ON fp.id = a.fee_payment_id

        LEFT JOIN fees f
          ON f.id = fp.fee_id

        LEFT JOIN students s
          ON s.id = f.student_id

        WHERE
          $1::integer IS NULL
          OR a.performed_by = $1

        ORDER BY
          a.performed_at DESC,
          a.id DESC

        LIMIT $2
        OFFSET $3
      `,
      [userId, pagination.limit, pagination.offset],
    );

    res.json({
      user_id: userId,

      activity: result.rows.map((row) => ({
        id: Number(row.id),

        fee_payment_id: row.fee_payment_id ? Number(row.fee_payment_id) : null,

        receipt_number: row.receipt_number || null,

        action: row.action,

        performed_by: row.performed_by ? Number(row.performed_by) : null,

        performed_by_name: row.performed_by_name || null,

        performed_by_role: row.performed_by_role || null,

        performed_at: row.performed_at,

        amount: row.amount !== null ? roundMoney(row.amount) : null,

        payment_date: row.payment_date || null,

        payment_solar_date: toSolarDateValue(row.payment_date),

        student_id: row.student_id ? Number(row.student_id) : null,

        student_name: row.student_name || null,

        roll_number: row.roll_number || null,

        old_data: row.old_data || null,

        new_data: row.new_data || null,
      })),

      pagination: buildPagination(
        pagination.page,
        pagination.limit,
        totalItems,
      ),
    });
  }),
);

/* ==========================================================================
   EXPORT
========================================================================== */

module.exports = router;
