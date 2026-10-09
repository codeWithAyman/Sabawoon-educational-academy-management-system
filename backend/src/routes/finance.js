const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const { query, pool } = require("../db/pool");
const { authRequired, requireRoles } = require("../middleware/auth");
const { asyncH } = require("../utils/helpers");

const {
  parseSolarDate,
  dateToJalaali,
  formatSolarDate,
  jalaaliToDate,
  getJalaaliMonthDays,
} = require("../utils/solarDate");

const router = express.Router();

/* ==========================================================================
   CONSTANTS / HELPERS
========================================================================== */

const DEFAULT_SHARE_PERCENT = 30;

function cleanOptionalText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();

  return text || null;
}

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

/*
  Gregorian [from, to] range covering one whole Solar Hijri month.

  Used to attribute a real payment to the Solar month it was actually
  paid in, instead of guessing from fee allocation coverage.
*/
function solarMonthGregorianRange(solarYear, solarMonth) {
  const year = Number(solarYear);
  const month = Number(solarMonth);

  if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
  if (month < 1 || month > 12) return null;

  let days;

  try {
    days = getJalaaliMonthDays(year, month);
  } catch {
    days = solarMonthDays(year, month);
  }

  try {
    const from = jalaaliToDate(year, month, 1);
    const to = jalaaliToDate(year, month, days);

    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    };
  } catch {
    return null;
  }
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

          INNER JOIN students s
            ON s.id = se.student_id

          WHERE cs.teacher_id = $1
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

          COALESCE(
            month_finance.teacher_share_amount,
            0
          ) AS teacher_share_amount,

          COALESCE(
            month_finance.allocation_ids,
            ARRAY[]::integer[]
          ) AS allocation_ids,

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

            SUM(COALESCE(payment_totals.teacher_share_amount, 0)) AS teacher_share_amount,

            COALESCE(
              (
                SELECT array_agg(DISTINCT fpa_allocation.id)

                FROM fee_payment_allocations fpa_allocation

                INNER JOIN fee_period_months fpm_allocation
                  ON fpm_allocation.id = fpa_allocation.fee_period_month_id

                INNER JOIN fee_periods fp_allocation
                  ON fp_allocation.id = fpm_allocation.fee_period_id

                WHERE fp_allocation.enrollment_id = se.id
                  AND fpm_allocation.solar_year = $2
                  AND fpm_allocation.solar_month = $3
              ),
              ARRAY[]::integer[]
            ) AS allocation_ids,

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
              MAX(fpmt.payment_date) AS last_payment_date,
              SUM(ROUND(fpa.allocated_amount * COALESCE(rate.percentage, $4) / 100, 2)) AS teacher_share_amount,
              ARRAY_AGG(fpa.id)::integer[] AS allocation_ids

            FROM fee_payment_allocations fpa

            INNER JOIN fee_payments fpmt
              ON fpmt.id = fpa.fee_payment_id

            LEFT JOIN LATERAL (
              SELECT fsr.percentage
              FROM finance_share_rates fsr
              WHERE fsr.effective_at <= fpmt.created_at
              ORDER BY fsr.effective_at DESC, fsr.id DESC
              LIMIT 1
            ) rate ON TRUE

            WHERE fpa.fee_period_month_id = fpm.id
          ) payment_totals
            ON TRUE

          WHERE fp.enrollment_id = se.id
            AND fpm.solar_year = $2
            AND fpm.solar_month = $3
        ) month_finance
          ON TRUE

        WHERE cs.teacher_id = $1

        ORDER BY
          s.full_name,
          s.id,
          cs.id

        LIMIT $5
        OFFSET $6
      `,
      [teacherId, solarYear, solarMonth, DEFAULT_SHARE_PERCENT, pagination.limit, pagination.offset],
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

        teacher_share_amount: roundMoney(row.teacher_share_amount),

        allocation_ids: Array.isArray(row.allocation_ids)
          ? row.allocation_ids.map(Number)
          : [],

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

    /* Apply the rate effective at each payment's creation time. */
    const shareResult = await query(
      `
        SELECT
          COALESCE(SUM(fpa.allocated_amount), 0) AS allocated_amount,
          COALESCE(SUM(ROUND(fpa.allocated_amount * COALESCE(rate.percentage, $4) / 100, 2)), 0) AS share_amount
        FROM fee_payment_allocations fpa
        INNER JOIN fee_payments fp ON fp.id = fpa.fee_payment_id
        INNER JOIN fee_period_months fpm ON fpm.id = fpa.fee_period_month_id
        INNER JOIN fee_periods fper ON fper.id = fpm.fee_period_id
        INNER JOIN student_enrollments se ON se.id = fper.enrollment_id
        INNER JOIN class_slots cs ON cs.id = se.class_slot_id
        LEFT JOIN LATERAL (
          SELECT fsr.percentage
          FROM finance_share_rates fsr
          WHERE fsr.effective_at <= fp.created_at
          ORDER BY fsr.effective_at DESC, fsr.id DESC
          LIMIT 1
        ) rate ON TRUE
        WHERE cs.teacher_id = $1
          AND fpm.solar_year = $2
          AND fpm.solar_month = $3
      `,
      [teacherId, solarYear, solarMonth, DEFAULT_SHARE_PERCENT],
    );
    const sharePercent = Number(shareResult.rows[0]?.allocated_amount || 0) > 0
      ? roundMoney(Number(shareResult.rows[0].share_amount) * 100 / Number(shareResult.rows[0].allocated_amount))
      : DEFAULT_SHARE_PERCENT;
    const teacherShareAmount = roundMoney(shareResult.rows[0]?.share_amount || 0);

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
          expected_amount = CASE
            WHEN finance_teacher_settlements.status = 'pending'
            THEN EXCLUDED.expected_amount
            ELSE finance_teacher_settlements.expected_amount
          END,
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

    const payoutHistoryResult = await query(
      `SELECT id, amount, share_calculation_snapshot, paid_by_user_id,
              paid_by_name_snapshot, paid_at, created_at
       FROM finance_teacher_settlement_payments
       WHERE teacher_settlement_id = $1
       ORDER BY paid_at DESC, id DESC`,
      [settlement.id],
    );

    /*
      Only the teacher share that is still awaiting payment may be
      selected for settlement.

      This walks the teacher's allocations for the month in the exact
      same order that PUT /teacher-settlements/:id/pay settles them and
      excludes anything already recorded as paid (including a legacy
      settlement that was paid before payout history existed). That way
      the amount shown in the Finance selection equals the amount that
      will actually be processed when Admin confirms the payment.
    */
    const allocationResult = await query(
      `
        SELECT
          fpa.id AS allocation_id,
          ROUND(fpa.allocated_amount * COALESCE(rate.percentage, $4) / 100, 2)
            AS share_amount

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
          SELECT fsr.percentage
          FROM finance_share_rates fsr
          WHERE fsr.effective_at <= fp.created_at
          ORDER BY fsr.effective_at DESC, fsr.id DESC
          LIMIT 1
        ) rate
          ON TRUE

        WHERE cs.teacher_id = $1
          AND fpm.solar_year = $2
          AND fpm.solar_month = $3

        ORDER BY fp.created_at, fp.id, fpa.id
      `,
      [teacherId, solarYear, solarMonth, DEFAULT_SHARE_PERCENT],
    );

    const paidAllocationIds = new Set(
      payoutHistoryResult.rows
        .flatMap(
          (payment) => payment.share_calculation_snapshot?.allocations || [],
        )
        .map((allocation) => Number(allocation.allocation_id)),
    );

    let pendingCredit =
      payoutHistoryResult.rows.length === 0 && settlement.status === "paid"
        ? roundMoney(settlement.expected_amount)
        : 0;

    const pendingShareByAllocation = new Map();

    for (const allocationRow of allocationResult.rows) {
      const allocationId = Number(allocationRow.allocation_id);
      const shareAmount = roundMoney(allocationRow.share_amount);

      if (paidAllocationIds.has(allocationId)) {
        pendingShareByAllocation.set(allocationId, 0);
        continue;
      }

      if (pendingCredit >= shareAmount) {
        pendingCredit = roundMoney(pendingCredit - shareAmount);
        pendingShareByAllocation.set(allocationId, 0);
        continue;
      }

      const pendingShare = roundMoney(shareAmount - pendingCredit);
      pendingCredit = 0;
      pendingShareByAllocation.set(allocationId, pendingShare);
    }

    for (const student of students) {
      const studentAllocationIds = Array.isArray(student.allocation_ids)
        ? student.allocation_ids
        : [];

      const pendingAllocationIds = studentAllocationIds.filter(
        (allocationId) =>
          (pendingShareByAllocation.get(Number(allocationId)) || 0) > 0,
      );

      student.teacher_share_amount = roundMoney(
        pendingAllocationIds.reduce(
          (sum, allocationId) =>
            sum + (pendingShareByAllocation.get(Number(allocationId)) || 0),
          0,
        ),
      );

      student.allocation_ids = pendingAllocationIds;
    }

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
        amount_due: roundMoney(Math.max(
          teacherShareAmount - (settlement.status === "paid" ? Number(settlement.expected_amount) : 0),
          0,
        )),
        payout_history: payoutHistoryResult.rows.map((payment) => ({
          id: Number(payment.id),
          amount: roundMoney(payment.amount),
          paid_by_user_id: payment.paid_by_user_id ? Number(payment.paid_by_user_id) : null,
          paid_by_name: payment.paid_by_name_snapshot,
          paid_at: payment.paid_at,
          paid_at_solar_date: toSolarDateValue(payment.paid_at),
          calculation: payment.share_calculation_snapshot,
        })),
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
              ROUND(
                fpa.allocated_amount
                * COALESCE(share_rate.percentage, $3)
                / 100,
                2
              )
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
      const payoutHistoryResult = settlement
        ? await query(
            `SELECT id, amount, share_calculation_snapshot, paid_by_user_id,
                    paid_by_name_snapshot, paid_at
             FROM finance_teacher_settlement_payments
             WHERE teacher_settlement_id = $1
             ORDER BY paid_at DESC, id DESC`,
            [settlement.id],
          )
        : { rows: [] };

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
              payout_history: payoutHistoryResult.rows.map((payment) => ({
                id: Number(payment.id),
                amount: roundMoney(payment.amount),
                paid_by_user_id: payment.paid_by_user_id ? Number(payment.paid_by_user_id) : null,
                paid_by_name: payment.paid_by_name_snapshot,
                paid_at: payment.paid_at,
                paid_at_solar_date: toSolarDateValue(payment.paid_at),
                calculation: payment.share_calculation_snapshot,
              })),
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
    const rawAllocationIds = req.body?.allocation_ids;
    const allocationIds = rawAllocationIds === undefined
      ? null
      : Array.isArray(rawAllocationIds)
        ? [...new Set(rawAllocationIds.map(Number))]
        : [];

    if (allocationIds && (allocationIds.length === 0 || allocationIds.some((id) => !Number.isInteger(id) || id < 1))) {
      return res.status(400).json({ error: "Valid teacher allocation IDs are required.", code: "INVALID_ALLOCATION_IDS" });
    }

    if (!verifyFinanceVerificationToken(req, verificationToken)) {
      return res.status(403).json({
        error:
          "A valid administrator password verification is required before marking a teacher settlement as paid.",
        code: "FINANCE_PASSWORD_VERIFICATION_REQUIRED",
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const settlementResult = await client.query(
        `SELECT fts.*, t.full_name AS teacher_name
         FROM finance_teacher_settlements fts
         INNER JOIN teachers t ON t.id = fts.teacher_id
         WHERE fts.id = $1 FOR UPDATE OF fts`,
        [settlementId],
      );
      if (!settlementResult.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Teacher settlement not found." });
      }
      const current = settlementResult.rows[0];

      // Prevent paying an already-paid settlement
      if (current.status === "paid") {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "This salary has already been paid.", code: "TEACHER_SETTLEMENT_ALREADY_PAID" });
      }

      const allocations = await client.query(
        `SELECT fpa.id AS allocation_id, fp.id AS payment_id, fp.created_at AS payment_created_at,
                fpm.solar_year, fpm.solar_month, fpa.allocated_amount,
                rate.id AS share_rate_id, COALESCE(rate.percentage, $4) AS share_percent,
                ROUND(fpa.allocated_amount * COALESCE(rate.percentage, $4) / 100, 2) AS share_amount
         FROM fee_payment_allocations fpa
         INNER JOIN fee_payments fp ON fp.id = fpa.fee_payment_id
         INNER JOIN fee_period_months fpm ON fpm.id = fpa.fee_period_month_id
         INNER JOIN fee_periods fper ON fper.id = fpm.fee_period_id
         INNER JOIN student_enrollments se ON se.id = fper.enrollment_id
         INNER JOIN class_slots cs ON cs.id = se.class_slot_id
         LEFT JOIN LATERAL (
           SELECT fsr.id, fsr.percentage FROM finance_share_rates fsr
           WHERE fsr.effective_at <= fp.created_at
           ORDER BY fsr.effective_at DESC, fsr.id DESC LIMIT 1
         ) rate ON TRUE
         WHERE cs.teacher_id = $1 AND fpm.solar_year = $2 AND fpm.solar_month = $3
         ORDER BY fp.created_at, fp.id, fpa.id`,
        [current.teacher_id, current.solar_year, current.solar_month, DEFAULT_SHARE_PERCENT],
      );
      const eligibleAllocationIds = new Set(
        allocations.rows.map((row) => Number(row.allocation_id)),
      );
      if (allocationIds && allocationIds.some((id) => !eligibleAllocationIds.has(id))) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "One or more selected teacher allocations are no longer eligible. Refresh and select the current amounts again.", code: "TEACHER_ALLOCATIONS_CHANGED" });
      }
      const shareRows = allocations.rows.map((row) => ({
        allocation_id: Number(row.allocation_id),
        payment_id: Number(row.payment_id),
        payment_created_at: row.payment_created_at,
        solar_year: Number(row.solar_year),
        solar_month: Number(row.solar_month),
        allocated_amount: roundMoney(row.allocated_amount),
        share_rate_id: row.share_rate_id ? Number(row.share_rate_id) : null,
        share_percent: Number(row.share_percent),
        share_amount: roundMoney(row.share_amount),
      }));
      const priorHistory = await client.query(
        `SELECT share_calculation_snapshot
         FROM finance_teacher_settlement_payments
         WHERE teacher_settlement_id = $1`,
        [settlementId],
      );
      const paidAllocationIds = new Set(
        priorHistory.rows.flatMap((row) => row.share_calculation_snapshot?.allocations || [])
          .map((row) => Number(row.allocation_id)),
      );
      const unpaidShareRows = shareRows.filter((row) => !paidAllocationIds.has(row.allocation_id));
      const currentEarned = roundMoney(unpaidShareRows.reduce((sum, row) => sum + row.share_amount, 0));
      const previouslyPaid = priorHistory.rows.length === 0 && current.status === "paid"
        ? roundMoney(current.expected_amount)
        : 0;
      let credit = previouslyPaid;
      const payoutAllocations = [];
      for (const allocation of unpaidShareRows) {
        if (credit >= allocation.share_amount) {
          credit = roundMoney(credit - allocation.share_amount);
          continue;
        }
        const payableShare = roundMoney(allocation.share_amount - credit);
        credit = 0;
        if (payableShare > 0) payoutAllocations.push({ ...allocation, payout_share_amount: payableShare });
      }
      /*
        The credit above is applied over the teacher's full set of
        allocations for the month, so each allocation's payable share is
        resolved consistently whether or not it was selected. Only the
        allocations the Admin actually selected are settled here.
      */
      const selectedAllocationIds = allocationIds
        ? new Set(allocationIds)
        : null;
      const payableAllocations = selectedAllocationIds
        ? payoutAllocations.filter((row) =>
            selectedAllocationIds.has(row.allocation_id),
          )
        : payoutAllocations;
      const payoutAmount = roundMoney(payableAllocations.reduce((sum, row) => sum + row.payout_share_amount, 0));
      if (payoutAmount <= 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "There is no unpaid teacher share for this period.", code: "TEACHER_SHARE_ALREADY_SETTLED" });
      }
      const requestedAmount = Number(req.body?.expected_amount);
      if (!Number.isFinite(requestedAmount) || roundMoney(requestedAmount) !== payoutAmount) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "The teacher share changed after it was selected. Refresh the Finance data and select the current amount again.", code: "TEACHER_SHARE_AMOUNT_CHANGED", expected_amount: payoutAmount });
      }

      const history = await client.query(
        `INSERT INTO finance_teacher_settlement_payments
           (teacher_settlement_id, amount, share_calculation_snapshot, paid_by_user_id, paid_by_name_snapshot)
         VALUES ($1, $2, $3::jsonb, $4, $5)
         RETURNING id, amount, paid_at`,
        [settlementId, payoutAmount, JSON.stringify({ teacher_id: Number(current.teacher_id), solar_year: Number(current.solar_year), solar_month: Number(current.solar_month), calculation_total: currentEarned, previously_paid_credit: previouslyPaid, allocations: payableAllocations }), req.user.id, req.user.full_name || "Administrator"],
      );
      const newCumulativePaid = roundMoney(previouslyPaid + payoutAmount);
      const updated = await client.query(
        `UPDATE finance_teacher_settlements
         SET status = 'paid', expected_amount = $1,
             paid_at = COALESCE(fts.paid_at, NOW()),
             paid_by_user_id = COALESCE(fts.paid_by_user_id, $2),
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [newCumulativePaid, req.user.id, settlementId],
      );
      await client.query("COMMIT");
      const row = updated.rows[0];
      return res.json({
        message: "Teacher share paid successfully.",
        payment: { id: Number(history.rows[0].id), amount: payoutAmount, paid_at: history.rows[0].paid_at, calculation: { current_earned: currentEarned, previously_paid: previouslyPaid, allocations: payableAllocations } },
        settlement: {
          id: Number(row.id), teacher_id: Number(row.teacher_id), teacher_name: current.teacher_name || "Unknown",
          solar_year: Number(row.solar_year), solar_month: Number(row.solar_month), month_name: monthName(Number(row.solar_month)),
          amount_paid_now: payoutAmount, expected_amount: roundMoney(row.expected_amount), status: row.status,
          paid_at: row.paid_at, paid_at_solar_date: toSolarDateValue(row.paid_at),
          paid_by_user_id: row.paid_by_user_id ? Number(row.paid_by_user_id) : null,
          paid_by: normalizeUser({ id: req.user.id, full_name: req.user.full_name, role: req.user.role }),
          created_at: row.created_at, updated_at: row.updated_at,
        },
      });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch (_) {}
      throw error;
    } finally {
      client.release();
    }
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

    const monthRange = solarMonthGregorianRange(solarYear, solarMonth);

    if (!monthRange) {
      return res.status(400).json({
        error: "The selected Solar month could not be resolved.",
      });
    }

    /*
      SOURCE OF TRUTH

        staff table            -> the actual Staff entities
        fee_payments           -> the actual payment transactions
        collected_by_staff_id  -> the actual collector identity

      Administrator accounts are NOT Staff. An admin may authorize a
      payment, but that does not make the admin a staff collector, so
      admin/attendance authentication accounts are excluded here.
    */
    const countResult = await query(`
      SELECT COUNT(*)::int AS total
      FROM staff s
      WHERE s.is_active = TRUE OR EXISTS (
        SELECT 1 FROM fee_payments fp
        WHERE fp.collected_by_staff_id = s.id
          AND fp.payment_date >= $1::date AND fp.payment_date <= $2::date
      )
    `, [monthRange.from, monthRange.to]);

    const totalItems = Number(countResult.rows[0]?.total || 0);

    const result = await query(
      `
        WITH staff_payments AS (
          SELECT
            fp.collected_by_staff_id AS staff_id,
            COUNT(*)::int AS payment_count,
            COALESCE(SUM(fp.amount), 0) AS total_amount,
            MAX(fp.payment_date) AS last_payment_date,
            COALESCE(SUM(fp.amount) FILTER (WHERE fsps.id IS NOT NULL), 0) AS handed_over_amount,
            COUNT(*) FILTER (WHERE fsps.id IS NOT NULL)::int AS handed_over_count
          FROM fee_payments fp
          LEFT JOIN finance_staff_payment_settlements fsps
            ON fsps.fee_payment_id = fp.id
          WHERE fp.payment_date >= $1::date AND fp.payment_date <= $2::date
            AND fp.collected_by_staff_id IS NOT NULL
          GROUP BY fp.collected_by_staff_id
        )
        SELECT
          s.id, s.full_name, s.email,
          COALESCE(sp.payment_count, 0)::int AS payment_count,
          COALESCE(sp.total_amount, 0) AS total_amount,
          COALESCE(sp.handed_over_amount, 0) AS handed_over_amount,
          GREATEST(COALESCE(sp.total_amount, 0) - COALESCE(sp.handed_over_amount, 0), 0) AS pending_amount,
          COALESCE(sp.handed_over_count, 0)::int AS handed_over_count,
          COALESCE(sp.payment_count, 0) - COALESCE(sp.handed_over_count, 0) AS pending_count,
          sp.last_payment_date
        FROM staff s
        LEFT JOIN staff_payments sp ON sp.staff_id = s.id
        WHERE s.is_active = TRUE OR sp.staff_id IS NOT NULL
        ORDER BY s.full_name, s.id
        LIMIT $3 OFFSET $4
      `,
      [monthRange.from, monthRange.to, pagination.limit, pagination.offset],
    );

    const staff = result.rows.map((row) => {
      const totalAmount = roundMoney(row.total_amount);
      const handedOverAmount = roundMoney(row.handed_over_amount);
      return {
        id: Number(row.id),
        collector_staff_id: Number(row.id),
        full_name: row.full_name || "Unknown",
        email: row.email || null,
        role: "staff",
        payment_count: Number(row.payment_count || 0),

        teacher_share_amount: roundMoney(row.teacher_share_amount),
        allocation_ids: Array.isArray(row.allocation_ids)
          ? row.allocation_ids.map(Number)
          : [],
        total_amount: totalAmount,
        handed_over_amount: handedOverAmount,
        pending_amount: roundMoney(row.pending_amount),
        handed_over_count: Number(row.handed_over_count || 0),
        pending_count: Number(row.pending_count || 0),
        last_payment_date: row.last_payment_date || null,
        last_payment_solar_date: toSolarDateValue(row.last_payment_date),
      };
    });

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
    /*
      Finance staff transactions are the REAL payment transactions.

      The collector is identified by `fee_payments.collected_by_staff_id`,
      which references the `staff` table. Filtering on
      `collected_by_user_id` instead would return nothing, because
      collectors are Staff entities rather than authentication users.

      `collector_user_id` is still accepted as a legacy fallback so an
      older client keeps working, but the Staff reference wins.
    */
    const collectorStaffId = req.query.collector_staff_id
      ? Number(req.query.collector_staff_id)
      : null;

    const legacyCollectorUserId = req.query.collector_user_id
      ? Number(req.query.collector_user_id)
      : null;

    const collectorId = collectorStaffId ?? legacyCollectorUserId;

    if (
      collectorId !== null &&
      (!Number.isInteger(collectorId) || collectorId < 1)
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
        (($1::integer IS NULL OR fp.collected_by_staff_id = $1)
          AND ($2::integer IS NULL OR fp.collected_by_user_id = $2))

        AND
        (
          $3::date IS NULL
          OR fp.payment_date >= $3
        )

        AND
        (
          $4::date IS NULL
          OR fp.payment_date <= $4
        )
      `,
      [collectorStaffId, collectorStaffId === null ? legacyCollectorUserId : null, fromDate, toDate],
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

          fp.collected_by_staff_id,
          fp.collected_by_user_id,

          fp.collected_by_name_snapshot,
          fp.collected_by_role_snapshot,

          collector.full_name
            AS collector_name,

          'staff'
            AS collector_role,

          fp.recorded_by,

          recorder.full_name
            AS recorder_name,

          recorder.role
            AS recorder_role,

          s.id AS student_id,
          s.full_name AS student_name,
          s.roll_number,

          allocation.allocation_id,
          allocation.allocated_amount,
          allocation.covered_days,
          allocation.from_date,
          allocation.to_date,
          allocation.solar_year,
          allocation.solar_month,
          (fsps.id IS NOT NULL) AS handed_over,
          fsps.id AS settlement_id,
          fsps.settled_at,
          fsps.settled_by_name_snapshot

        FROM fee_payments fp

        INNER JOIN fees f
          ON f.id = fp.fee_id

        INNER JOIN students s
          ON s.id = f.student_id

        LEFT JOIN staff collector
          ON collector.id =
             fp.collected_by_staff_id

        LEFT JOIN users recorder
          ON recorder.id =
             fp.recorded_by

        LEFT JOIN LATERAL (
          SELECT
            MIN(fpa.id) AS allocation_id,
            SUM(fpa.allocated_amount) AS allocated_amount,
            SUM(fpa.covered_days)::int AS covered_days,
            MIN(fpa.from_date) AS from_date,
            MAX(fpa.to_date) AS to_date,
            MIN(fpm.solar_year) AS solar_year,
            MIN(fpm.solar_month) AS solar_month
          FROM fee_payment_allocations fpa
          LEFT JOIN fee_period_months fpm ON fpm.id = fpa.fee_period_month_id
          WHERE fpa.fee_payment_id = fp.id
        ) allocation ON TRUE

        LEFT JOIN finance_staff_payment_settlements fsps
          ON fsps.fee_payment_id = fp.id

        WHERE
          (($1::integer IS NULL OR fp.collected_by_staff_id = $1)
            AND ($2::integer IS NULL OR fp.collected_by_user_id = $2))

          AND
          (
            $3::date IS NULL
            OR fp.payment_date >= $3
          )

          AND
          (
            $4::date IS NULL
            OR fp.payment_date <= $4
          )

        ORDER BY
          fp.payment_date DESC,
          fp.id DESC

        LIMIT $5
        OFFSET $6
      `,
      [collectorStaffId, collectorStaffId === null ? legacyCollectorUserId : null, fromDate, toDate, pagination.limit, pagination.offset],
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

      collected_by_staff_id: row.collected_by_staff_id
        ? Number(row.collected_by_staff_id)
        : null,

      collected_by_user_id: row.collected_by_user_id
        ? Number(row.collected_by_user_id)
        : null,

      collector_name:
        row.collector_name ||
        row.collected_by_name_snapshot ||
        null,

      collector_role:
        row.collected_by_role_snapshot || row.collector_role || null,

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
      handed_over: Boolean(row.handed_over),
      settlement_id: row.settlement_id ? Number(row.settlement_id) : null,
      settled_at: row.settled_at || null,
      settled_by_name: row.settled_by_name_snapshot || null,
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
        (($1::integer IS NULL OR fp.collected_by_staff_id = $1)
          AND ($2::integer IS NULL OR fp.collected_by_user_id = $2))

        AND
        (
          $3::date IS NULL
          OR fp.payment_date >= $3
        )

        AND
        (
          $4::date IS NULL
          OR fp.payment_date <= $4
        )
      `,
      [collectorStaffId, collectorStaffId === null ? legacyCollectorUserId : null, fromDate, toDate],
    );

    res.json({
      filters: {
        collector_staff_id: collectorStaffId,
        collector_user_id: legacyCollectorUserId,

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
    /*
      Settlements are keyed to real Staff records through
      `collector_staff_id`. Legacy rows created before that column
      existed still carry `staff_user_id`, so both are resolved here
      and the Staff reference takes precedence.
    */
    const staffUserId = req.query.collector_staff_id
      ? Number(req.query.collector_staff_id)
      : req.query.staff_user_id
        ? Number(req.query.staff_user_id)
        : null;

    const solarYear = parseSolarYear(req.query.solar_year);

    const solarMonth = parseSolarMonth(req.query.solar_month);

    if (
      staffUserId !== null &&
      (!Number.isInteger(staffUserId) || staffUserId < 1)
    ) {
      return res.status(400).json({
        error: "Invalid staff ID.",
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
            OR fss.collector_staff_id = $1
            OR (
              fss.collector_staff_id IS NULL
              AND fss.staff_user_id = $1
            )
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

          fss.collector_staff_id,

          COALESCE(
            s.full_name,
            u.full_name
          ) AS staff_name,

          COALESCE(
            s.email,
            u.email
          ) AS staff_email,

          COALESCE(
            'staff',
            u.role
          ) AS staff_role,

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

        LEFT JOIN staff s
          ON s.id = fss.collector_staff_id

        LEFT JOIN users u
          ON u.id = fss.staff_user_id

        LEFT JOIN users received_by
          ON received_by.id =
             fss.received_by_user_id

        WHERE
          (
            $1::integer IS NULL
            OR fss.collector_staff_id = $1
            OR (
              fss.collector_staff_id IS NULL
              AND fss.staff_user_id = $1
            )
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
          COALESCE(
            s.full_name,
            u.full_name
          ) ASC,
          fss.id DESC

        LIMIT $4
        OFFSET $5
      `,
      [staffUserId, solarYear, solarMonth, pagination.limit, pagination.offset],
    );

    res.json({
      settlements: result.rows.map((row) => ({
        id: Number(row.id),

        staff_user_id: row.staff_user_id
          ? Number(row.staff_user_id)
          : null,

        collector_staff_id: row.collector_staff_id
          ? Number(row.collector_staff_id)
          : null,

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
   LEGACY MONTHLY STAFF RECEIPT ROUTE

   Kept as an explicit gone response so old clients cannot create an
   aggregate receipt that conflicts with transaction-level handovers.
========================================================================== */

router.put(
  "/staff-settlements/:id/receive",
  authRequired,
  requireRoles("admin"),
  (req, res) => res.status(410).json({
    error: "Monthly staff receipts are no longer accepted. Select the real payment transactions and use the Staff handover workflow.",
    code: "LEGACY_STAFF_SETTLEMENT_DISABLED",
  }),
);

/* ==========================================================================
   STAFF CASH HANDOVER / SETTLEMENT

   Settles the CASH a staff member collected on behalf of the academy.

   This is NOT a teacher share.

   Settlement references the original fee_payments rows and never
   duplicates or modifies them. The unique index on
   finance_staff_payment_settlements(fee_payment_id) guarantees a
   payment cannot be settled twice, even across concurrent requests.
========================================================================== */

router.put(
  "/staff-transactions/handover",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const verificationToken = req.body?.verification_token;

    if (!verifyFinanceVerificationToken(req, verificationToken)) {
      return res.status(403).json({
        error:
          "A valid administrator password verification is required before settling staff-collected cash.",
        code: "FINANCE_PASSWORD_VERIFICATION_REQUIRED",
      });
    }

    const collectorStaffId = req.body?.collector_staff_id
      ? Number(req.body.collector_staff_id)
      : null;

    if (
      collectorStaffId === null &&
      req.body?.collector_user_id !== undefined
    ) {
      return res.status(400).json({
        error:
          "collector_staff_id is required. Staff collectors are identified by their Staff record, not an authentication account.",
        code: "INVALID_COLLECTOR",
      });
    }

    const rawPaymentIds = req.body?.payment_ids;
    if (!Array.isArray(rawPaymentIds) || rawPaymentIds.length === 0) {
      return res.status(400).json({
        error: "At least one payment transaction is required.",
        code: "INVALID_PAYMENT_IDS",
      });
    }

    const paymentIds = rawPaymentIds.map(Number);
    if (paymentIds.some((id) => !Number.isInteger(id) || id < 1) || new Set(paymentIds).size !== paymentIds.length) {
      return res.status(400).json({ error: "Payment IDs must be unique positive integers.", code: "INVALID_PAYMENT_IDS" });
    }
    if (!Number.isInteger(collectorStaffId) || collectorStaffId < 1) {
      return res.status(400).json({ error: "A valid staff collector is required.", code: "INVALID_COLLECTOR" });
    }

    const solarYear = parseSolarYear(req.body?.solar_year);
    const solarMonth = parseSolarMonth(req.body?.solar_month);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const staffResult = await client.query(
        "SELECT id, full_name FROM staff WHERE id = $1 AND is_active = TRUE FOR UPDATE",
        [collectorStaffId],
      );
      if (!staffResult.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Staff collector not found or inactive.", code: "COLLECTOR_NOT_FOUND" });
      }

      const paymentsResult = await client.query(
        `SELECT fp.id, fp.amount, fp.receipt_number, fp.payment_date,
                fp.collected_by_staff_id, fp.collected_by_name_snapshot
         FROM fee_payments fp WHERE fp.id = ANY($1::int[]) FOR UPDATE`,
        [paymentIds],
      );
      if (paymentsResult.rows.length !== paymentIds.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "One or more selected payment transactions were not found.", code: "PAYMENT_NOT_FOUND" });
      }
      const mismatched = paymentsResult.rows.filter((row) => Number(row.collected_by_staff_id) !== collectorStaffId);
      if (mismatched.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "One or more selected transactions were collected by a different staff member.", code: "COLLECTOR_MISMATCH", mismatched_payment_ids: mismatched.map((row) => Number(row.id)) });
      }
      const already = await client.query(
        "SELECT fee_payment_id FROM finance_staff_payment_settlements WHERE fee_payment_id = ANY($1::int[]) FOR UPDATE",
        [paymentIds],
      );
      if (already.rows.length) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "One or more selected payments have already been handed over. No transactions were changed.", code: "PAYMENT_ALREADY_SETTLED", payment_ids: already.rows.map((row) => Number(row.fee_payment_id)) });
      }

      const name = staffResult.rows[0].full_name || "Unknown";
      const values = [];
      const tuples = paymentsResult.rows.map((payment, index) => {
        const n = index * 5;
        values.push(Number(payment.id), collectorStaffId, name, req.user.id, req.user.full_name || "Administrator");
        return `($${n + 1}, $${n + 2}, NULL, $${n + 3}, 'staff', $${n + 4}, $${n + 5})`;
      });
      const inserted = await client.query(
        `INSERT INTO finance_staff_payment_settlements
           (fee_payment_id, collector_staff_id, collector_user_id, collector_name_snapshot,
            collector_role_snapshot, settled_by_user_id, settled_by_name_snapshot)
         VALUES ${tuples.join(",")}
         RETURNING id, fee_payment_id, collector_staff_id, collector_name_snapshot,
                   settled_at, settled_by_user_id, settled_by_name_snapshot`,
        values,
      );
      await client.query("COMMIT");
      const byId = new Map(paymentsResult.rows.map((row) => [Number(row.id), row]));
      const settlements = inserted.rows.map((row) => {
        const payment = byId.get(Number(row.fee_payment_id));
        return { ...row, id: Number(row.id), fee_payment_id: Number(row.fee_payment_id), amount: roundMoney(payment.amount), receipt_number: payment.receipt_number || null, payment_date: payment.payment_date, payment_solar_date: toSolarDateValue(payment.payment_date) };
      });
      return res.json({ message: "Staff-collected cash handed over successfully.", collector_staff_id: collectorStaffId, collector_name: name, solar_year: solarYear, solar_month: solarMonth, month_name: solarMonth ? monthName(solarMonth) : null, settled: settlements, settled_count: settlements.length });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch (_) {}
      throw error;
    } finally {
      client.release();
    }
  }),
);

/* ==========================================================================
   STAFF TRANSACTION SETTLEMENT STATUS
========================================================================== */

router.get(
  "/staff-transactions/settlement-status",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const collectorStaffId = req.query.collector_staff_id
      ? Number(req.query.collector_staff_id)
      : null;

    if (
      collectorStaffId !== null &&
      (!Number.isInteger(collectorStaffId) || collectorStaffId < 1)
    ) {
      return res.status(400).json({
        error: "Invalid collector.",
      });
    }

    const result = await query(
      `
        SELECT
          fsps.fee_payment_id,
          fsps.collector_staff_id,
          fsps.collector_name_snapshot,
          fsps.settled_at,
          fsps.settled_by_user_id,
          fsps.settled_by_name_snapshot
        FROM finance_staff_payment_settlements fsps
        WHERE
          (
            $1::integer IS NULL
            OR fsps.collector_staff_id = $1
          )
        ORDER BY
          fsps.settled_at DESC,
          fsps.id DESC
      `,
      [collectorStaffId],
    );

    res.json({
      settlements: result.rows.map((row) => ({
        payment_id: Number(row.fee_payment_id),
        collector_staff_id: row.collector_staff_id
          ? Number(row.collector_staff_id)
          : null,
        collector_name: row.collector_name_snapshot || null,
        settled_at: row.settled_at,
        settled_at_solar_date: toSolarDateValue(row.settled_at),
        settled_by_user_id: row.settled_by_user_id
          ? Number(row.settled_by_user_id)
          : null,
        settled_by_name: row.settled_by_name_snapshot || null,
      })),
    });
  }),
);

/* ==========================================================================
   RECONCILIATION

   Expected money versus money that was actually handed over.

   Both sides come from real collected payments:

     expected   the sum of every real payment the collector took
     handed over the sum of those same payments once they have been
                 settled through a handover

   A collector can never hand over money that was never collected,
   because handovers operate on existing payment IDs.

   Status is derived, never stored as a guess:

     Pending  money collected but nothing handed over yet
     Matched  handed over exactly what was collected
     Short    less was handed over than was collected
     Over     more was handed over than was collected, which happens
              when a payment is voided or edited after its handover
========================================================================== */

const RECONCILIATION_STATUSES = ["Pending", "Matched", "Short", "Over"];

function classifyReconciliation(expected, handedOver) {
  const expectedAmount = Number(expected || 0);
  const handedOverAmount = Number(handedOver || 0);

  const difference = roundMoney(handedOverAmount - expectedAmount);

  // Sub-cent rounding must not be treated as a real difference.
  if (Math.abs(difference) < 0.005) {
    return { status: "Matched", difference: 0 };
  }

  if (difference > 0) {
    return { status: "Over", difference };
  }

  if (handedOverAmount > 0) {
    return { status: "Short", difference };
  }

  return { status: "Pending", difference };
}

/*
  Reads the real collected payments for the period, grouped by
  collector, and pairs them with the handovers already recorded.
*/
async function buildReconciliationRows({
  collectorStaffId = null,
  fromDate = null,
  toDate = null,
}) {
  const result = await query(
    `
      SELECT
        fp.collected_by_staff_id,
        collector.full_name AS collector_name,

        COALESCE(SUM(fp.amount), 0)::NUMERIC AS expected_amount,
        COUNT(*)::INTEGER AS payment_count,

        COALESCE(
          SUM(fp.amount) FILTER (
            WHERE EXISTS (
              SELECT 1
              FROM finance_staff_payment_settlements fsps
              WHERE fsps.fee_payment_id = fp.id
            )
          ),
          0
        )::NUMERIC AS handed_over_amount,

        COUNT(*) FILTER (
          WHERE EXISTS (
            SELECT 1
            FROM finance_staff_payment_settlements fsps
            WHERE fsps.fee_payment_id = fp.id
          )
        )::INTEGER AS handed_over_count

      FROM fee_payments fp

      LEFT JOIN staff collector
        ON collector.id = fp.collected_by_staff_id

      WHERE
        (
          $1::integer IS NULL
          OR fp.collected_by_staff_id = $1
        )

        AND ($2::date IS NULL OR fp.payment_date >= $2)
        AND ($3::date IS NULL OR fp.payment_date <= $3)

      GROUP BY
        fp.collected_by_staff_id,
        collector.full_name

      ORDER BY
        collector.full_name ASC NULLS LAST,
        fp.collected_by_staff_id ASC NULLS LAST
    `,
    [collectorStaffId, fromDate, toDate],
  );

  const rows = result.rows.map((row) => {
    const { status, difference } = classifyReconciliation(
      row.expected_amount,
      row.handed_over_amount,
    );

    return {
      collector_staff_id: row.collected_by_staff_id
        ? Number(row.collected_by_staff_id)
        : null,
      collector_name: row.collector_name || "Unassigned collector",

      expected_amount: roundMoney(row.expected_amount),
      handed_over_amount: roundMoney(row.handed_over_amount),
      difference,

      payment_count: Number(row.payment_count || 0),
      handed_over_count: Number(row.handed_over_count || 0),
      outstanding_count:
        Number(row.payment_count || 0) - Number(row.handed_over_count || 0),

      status,
    };
  });

  const totals = rows.reduce(
    (accumulator, row) => ({
      expected_amount: roundMoney(
        accumulator.expected_amount + row.expected_amount,
      ),
      handed_over_amount: roundMoney(
        accumulator.handed_over_amount + row.handed_over_amount,
      ),
      payment_count: accumulator.payment_count + row.payment_count,
      handed_over_count:
        accumulator.handed_over_count + row.handed_over_count,
    }),
    {
      expected_amount: 0,
      handed_over_amount: 0,
      payment_count: 0,
      handed_over_count: 0,
    },
  );

  const classification = classifyReconciliation(
    totals.expected_amount,
    totals.handed_over_amount,
  );

  return {
    rows,
    totals: {
      ...totals,
      difference: classification.difference,
      status: classification.status,
      outstanding_count:
        totals.payment_count - totals.handed_over_count,
    },
  };
}

router.get(
  "/reconciliation",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const collectorStaffId = req.query.collector_staff_id
      ? Number(req.query.collector_staff_id)
      : null;

    if (
      collectorStaffId !== null &&
      (!Number.isInteger(collectorStaffId) || collectorStaffId < 1)
    ) {
      return res.status(400).json({ error: "Invalid collector." });
    }

    let fromDate = null;
    let toDate = null;

    try {
      fromDate = parseOptionalSolarDate(req.query.from_solar_date);
      toDate = parseOptionalSolarDate(req.query.to_solar_date);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    if (fromDate && toDate && fromDate > toDate) {
      return res.status(400).json({
        error: "From date cannot be after to date.",
      });
    }

    const reconciliation = await buildReconciliationRows({
      collectorStaffId,
      fromDate,
      toDate,
    });

    // Outstanding payments are the real money still to be handed over.
    const outstanding = await query(
      `
        SELECT
          fp.id AS payment_id,
          fp.amount,
          fp.payment_date,
          fp.receipt_number,
          collector.full_name AS collector_name,
          st.full_name AS student_name,
          st.roll_number AS student_roll_number

        FROM fee_payments fp

        LEFT JOIN staff collector
          ON collector.id = fp.collected_by_staff_id

        LEFT JOIN fees f
          ON f.id = fp.fee_id

        LEFT JOIN students st
          ON st.id = f.student_id

        WHERE
          NOT EXISTS (
            SELECT 1
            FROM finance_staff_payment_settlements fsps
            WHERE fsps.fee_payment_id = fp.id
          )

          AND ($1::integer IS NULL OR fp.collected_by_staff_id = $1)
          AND ($2::date IS NULL OR fp.payment_date >= $2)
          AND ($3::date IS NULL OR fp.payment_date <= $3)

        ORDER BY fp.payment_date ASC, fp.id ASC

        LIMIT 200
      `,
      [collectorStaffId, fromDate, toDate],
    );

    const history = await query(
      `
        SELECT
          cr.id,
          cr.collector_staff_id,
          collector.full_name AS collector_name,
          cr.from_date,
          cr.to_date,
          cr.expected_amount,
          cr.handed_over_amount,
          cr.difference,
          cr.status,
          cr.payment_count,
          cr.notes,
          cr.verification_date,
          cr.created_at,
          u.full_name AS verified_by_name
        FROM cash_reconciliations cr

        LEFT JOIN staff collector
          ON collector.id = cr.collector_staff_id

        LEFT JOIN users u
          ON u.id = cr.verified_by_user_id

        ORDER BY cr.created_at DESC
        LIMIT 50
      `,
    );

    res.json({
      period: {
        from_date: fromDate,
        to_date: toDate,
        collector_staff_id: collectorStaffId,
      },

      totals: reconciliation.totals,

      collectors: reconciliation.rows,

      outstanding_payments: outstanding.rows.map((row) => ({
        payment_id: Number(row.payment_id),
        amount: roundMoney(row.amount),
        payment_date: row.payment_date,
        receipt_number: row.receipt_number || null,
        collector_name: row.collector_name || "Unassigned collector",
        student_name: row.student_name || null,
        student_roll_number: row.student_roll_number || null,
      })),

      statuses: RECONCILIATION_STATUSES,

      history: history.rows.map((row) => ({
        id: Number(row.id),
        collector_staff_id: row.collector_staff_id
          ? Number(row.collector_staff_id)
          : null,
        collector_name: row.collector_name || "Unassigned collector",
        from_date: row.from_date,
        to_date: row.to_date,
        expected_amount: roundMoney(row.expected_amount),
        handed_over_amount: roundMoney(row.handed_over_amount),
        difference: roundMoney(row.difference),
        status: row.status,
        payment_count: Number(row.payment_count || 0),
        notes: row.notes || null,
        verification_date: row.verification_date,
        verified_by_name: row.verified_by_name || null,
        created_at: row.created_at,
      })),
    });
  }),
);

/*
  Records that an administrator verified a reconciliation. This only
  stores the confirmation; the amounts are always recomputed from the
  real payments at read time, so a stale record can never be
  mistaken for the current truth.
*/
router.post(
  "/reconciliation/verify",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const verificationToken = req.body?.verification_token;

    if (!verifyFinanceVerificationToken(req, verificationToken)) {
      return res.status(403).json({
        error:
          "A valid administrator password verification is required before confirming a reconciliation.",
        code: "FINANCE_PASSWORD_VERIFICATION_REQUIRED",
      });
    }

    const collectorStaffId = req.body?.collector_staff_id
      ? Number(req.body.collector_staff_id)
      : null;

    if (
      collectorStaffId !== null &&
      (!Number.isInteger(collectorStaffId) || collectorStaffId < 1)
    ) {
      return res.status(400).json({
        error: "Invalid collector.",
        code: "INVALID_COLLECTOR",
      });
    }

    let fromDate = null;
    let toDate = null;

    try {
      fromDate = parseOptionalSolarDate(req.body?.from_solar_date);
      toDate = parseOptionalSolarDate(req.body?.to_solar_date);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    if (!fromDate || !toDate) {
      return res.status(400).json({
        error: "A verified reconciliation needs a from and to date.",
        code: "PERIOD_REQUIRED",
      });
    }

    if (fromDate > toDate) {
      return res.status(400).json({
        error: "From date cannot be after to date.",
      });
    }

    const reconciliation = await buildReconciliationRows({
      collectorStaffId,
      fromDate,
      toDate,
    });

    const totals = reconciliation.totals;

    const result = await query(
      `
        INSERT INTO cash_reconciliations (
          collector_user_id,
          collector_staff_id,
          from_date,
          to_date,
          expected_amount,
          handed_over_amount,
          difference,
          status,
          payment_count,
          verification_date,
          verified_by_user_id,
          notes,
          created_by_user_id
        )
        VALUES (
          NULL,
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          NOW(),
          $9,
          $10,
          $9
        )
        RETURNING *
      `,
      [
        collectorStaffId,
        fromDate,
        toDate,
        totals.expected_amount,
        totals.handed_over_amount,
        totals.difference,
        totals.status.toLowerCase(),
        totals.payment_count,
        req.user.id,
        cleanOptionalText(req.body?.notes),
      ],
    );

    res.status(201).json({
      ok: true,

      reconciliation: {
        id: Number(result.rows[0].id),
        collector_staff_id: collectorStaffId,
        from_date: fromDate,
        to_date: toDate,
        expected_amount: totals.expected_amount,
        handed_over_amount: totals.handed_over_amount,
        difference: totals.difference,
        status: totals.status,
        payment_count: totals.payment_count,
        verification_date: result.rows[0].verification_date,
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
    const staffId = req.query.staff_id ? Number(req.query.staff_id) : null;
    if (staffId !== null && (!Number.isInteger(staffId) || staffId < 1)) {
      return res.status(400).json({
        error: "Invalid staff ID.",
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
        WHERE $1::integer IS NULL OR fp.collected_by_staff_id = $1
      `,
      [staffId],
    );

    const totalItems = Number(countResult.rows[0]?.total || 0);

    const result = await query(
      `
        SELECT
          fp.id,
          fp.id AS fee_payment_id,
          fp.receipt_number,
          'payment_collected' AS action,
          fp.collected_by_staff_id,
          fp.collected_by_name_snapshot AS performed_by_name,
          'staff' AS performed_by_role,
          fp.created_at AS performed_at,
          fp.amount,
          fp.payment_date,
          fp.comment,
          collector.full_name AS current_collector_name,

          s.id AS student_id,
          s.full_name AS student_name,
          s.roll_number

        FROM fee_payments fp
        LEFT JOIN staff collector ON collector.id = fp.collected_by_staff_id
        LEFT JOIN fees f
          ON f.id = fp.fee_id

        LEFT JOIN students s
          ON s.id = f.student_id

        WHERE
          $1::integer IS NULL
          OR fp.collected_by_staff_id = $1

        ORDER BY
          fp.created_at DESC,
          fp.id DESC

        LIMIT $2
        OFFSET $3
      `,
      [staffId, pagination.limit, pagination.offset],
    );

    res.json({
      staff_id: staffId,

      activity: result.rows.map((row) => ({
        id: Number(row.id),
        payment_id: Number(row.fee_payment_id),

        fee_payment_id: row.fee_payment_id ? Number(row.fee_payment_id) : null,

        receipt_number: row.receipt_number || null,

        action: row.action,

        performed_by: row.performed_by ? Number(row.performed_by) : null,

        performed_by_name: row.current_collector_name || row.performed_by_name || null,

        performed_by_role: row.performed_by_role || null,

        performed_at: row.performed_at,
        performed_at_solar_date: toSolarDateValue(row.performed_at),

        amount: row.amount !== null ? roundMoney(row.amount) : null,

        payment_date: row.payment_date || null,

        payment_solar_date: toSolarDateValue(row.payment_date),

        student_id: row.student_id ? Number(row.student_id) : null,

        student_name: row.student_name || null,

        roll_number: row.roll_number || null,

        comment: row.comment || null,
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
