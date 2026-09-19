const express = require("express");
const { query, pool } = require("../db/pool");
const { authRequired, requireRoles } = require("../middleware/auth");
const { asyncH } = require("../utils/helpers");
const {
  parseSolarDate,
  dateToJalaali,
  formatJalaali,
} = require("../utils/solarDate");

const router = express.Router();

/*
|--------------------------------------------------------------------------
| ACCESS
|--------------------------------------------------------------------------
*/

const attendanceRoles = requireRoles("admin", "attendance");

const VALID_STATUSES = ["present", "absent"];

/*
|--------------------------------------------------------------------------
| SOLAR MONTH NAMES
|--------------------------------------------------------------------------
*/

const SOLAR_MONTH_NAMES = {
  1: "حمل",
  2: "ثور",
  3: "جوزا",
  4: "سرطان",
  5: "اسد",
  6: "سنبله",
  7: "میزان",
  8: "عقرب",
  9: "قوس",
  10: "جدی",
  11: "دلو",
  12: "حوت",
};

/*
|--------------------------------------------------------------------------
| WEEKDAY NAMES
|--------------------------------------------------------------------------
*/

const WEEKDAY_NAMES = {
  0: "یکشنبه",
  1: "دوشنبه",
  2: "سه‌شنبه",
  3: "چهارشنبه",
  4: "پنجشنبه",
  5: "جمعه",
  6: "شنبه",
};

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function getSolarMonthName(month) {
  return SOLAR_MONTH_NAMES[Number(month)] || "";
}

function getWeekdayName(day) {
  return WEEKDAY_NAMES[Number(day)] || "";
}

function normalizeDateString(value) {
  if (!value) return null;

  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}

/*
|--------------------------------------------------------------------------
| KABUL DATE
|--------------------------------------------------------------------------
*/

function getKabulGregorianDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kabul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const getPart = (type) => parts.find((part) => part.type === type)?.value;

  return `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
}

function getKabulSolarToday() {
  const gregorianDate = getKabulGregorianDate();

  /*
   * Noon UTC avoids accidental day changes.
   */
  const date = new Date(`${gregorianDate}T12:00:00Z`);

  const { jy, jm, jd } = dateToJalaali(date);

  return {
    gregorian_date: gregorianDate,
    solar_date: formatJalaali(jy, jm, jd),
    solar_year: jy,
    solar_month: jm,
    solar_day: jd,
    solar_month_name: getSolarMonthName(jm),
  };
}

/*
|--------------------------------------------------------------------------
| GREGORIAN WEEKDAY
|--------------------------------------------------------------------------
*/

function isFridayFromGregorian(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return date.getUTCDay() === 5;
}

/*
|--------------------------------------------------------------------------
| GET ALL DAYS IN A SOLAR MONTH
|--------------------------------------------------------------------------
|
| Friday is intentionally excluded.
|
*/

function getSolarMonthDays(year, month) {
  const numericYear = Number(year);
  const numericMonth = Number(month);

  if (
    !Number.isInteger(numericYear) ||
    !Number.isInteger(numericMonth) ||
    numericMonth < 1 ||
    numericMonth > 12
  ) {
    const error = new Error("Invalid Solar Hijri year or month");

    error.status = 400;
    error.code = "INVALID_SOLAR_MONTH";

    throw error;
  }

  const maximumPossibleDays =
    numericMonth <= 6 ? 31 : numericMonth <= 11 ? 30 : 30;

  const days = [];

  for (let day = 1; day <= maximumPossibleDays; day += 1) {
    try {
      const parsed = parseSolarDate(`${numericYear}-${numericMonth}-${day}`);

      const gregorianDate = parsed.gregorianDate;
      const weekdayIndex = gregorianDate.getUTCDay();

      /*
       * Friday is always a holiday.
       */
      if (weekdayIndex === 5) {
        continue;
      }

      days.push({
        day,
        solar_date: formatJalaali(numericYear, numericMonth, day),
        gregorian_date: normalizeDateString(gregorianDate),
        weekday_index: weekdayIndex,
        weekday_name: getWeekdayName(weekdayIndex),
        is_friday: false,
      });
    } catch (_) {
      break;
    }
  }

  return days;
}

/*
|--------------------------------------------------------------------------
| GET CLASS SLOT
|--------------------------------------------------------------------------
*/

async function getClassSlot(classSlotId) {
  const result = await query(
    `
      SELECT
        cs.id,
        cs.subject_id,
        s.name AS subject_name,
        s.code AS subject_code,

        cs.teacher_id,
        t.full_name AS teacher_name,

        cs.start_time,
        cs.end_time,
        cs.is_active,
        cs.created_at,

        (
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'id', sb.id,
                'name', sb.name
              )
              ORDER BY sb.name
            ),
            '[]'::json
          )
          FROM class_slot_books csb
          INNER JOIN subject_books sb
            ON sb.id = csb.book_id
          WHERE csb.class_slot_id = cs.id
        ) AS books

      FROM class_slots cs

      INNER JOIN subjects s
        ON s.id = cs.subject_id

      INNER JOIN teachers t
        ON t.id = cs.teacher_id

      WHERE cs.id = $1
    `,
    [classSlotId],
  );

  return result.rows[0] || null;
}

/*
|--------------------------------------------------------------------------
| GET PAYMENT STATUS FOR ONE DATE
|--------------------------------------------------------------------------
*/

async function getPaymentStatus(enrollmentId, gregorianDate) {
  const result = await query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM fee_payment_allocations fpa

        INNER JOIN fee_period_months fpm
          ON fpm.id = fpa.fee_period_month_id

        INNER JOIN fee_periods fp
          ON fp.id = fpm.fee_period_id

        WHERE fp.enrollment_id = $1

          AND fpa.from_date <= $2::date
          AND fpa.to_date >= $2::date
      ) AS paid;
    `,
    [enrollmentId, gregorianDate],
  );

  return result.rows[0]?.paid ? "paid" : "unpaid";
}

/*
|--------------------------------------------------------------------------
| GET PAYMENT STATUS FOR ENTIRE SOLAR MONTH
|--------------------------------------------------------------------------
*/

async function getMonthlyPaymentStatuses(enrollmentIds, monthDays) {
  const statuses = new Map();

  for (const enrollmentId of enrollmentIds) {
    statuses.set(enrollmentId, {
      paidDays: 0,
      totalDays: monthDays.length,
    });
  }

  if (!enrollmentIds.length || !monthDays.length) {
    return statuses;
  }

  const firstDate = monthDays[0].gregorian_date;
  const lastDate = monthDays[monthDays.length - 1].gregorian_date;

  const result = await query(
    `
      SELECT
        fp.enrollment_id,
        fpa.from_date,
        fpa.to_date

      FROM fee_payment_allocations fpa

      INNER JOIN fee_period_months fpm
        ON fpm.id = fpa.fee_period_month_id

      INNER JOIN fee_periods fp
        ON fp.id = fpm.fee_period_id

      WHERE fp.enrollment_id = ANY($1::int[])

        AND fpa.from_date <= $2::date
        AND fpa.to_date >= $3::date

      ORDER BY
        fp.enrollment_id,
        fpa.from_date
    `,
    [enrollmentIds, lastDate, firstDate],
  );

  const allocationsByEnrollment = new Map();

  for (const row of result.rows) {
    const enrollmentId = Number(row.enrollment_id);

    if (!allocationsByEnrollment.has(enrollmentId)) {
      allocationsByEnrollment.set(enrollmentId, []);
    }

    allocationsByEnrollment.get(enrollmentId).push({
      from_date: normalizeDateString(row.from_date),
      to_date: normalizeDateString(row.to_date),
    });
  }

  for (const enrollmentId of enrollmentIds) {
    const allocations = allocationsByEnrollment.get(enrollmentId) || [];

    let paidDays = 0;

    for (const monthDay of monthDays) {
      const covered = allocations.some(
        (allocation) =>
          allocation.from_date <= monthDay.gregorian_date &&
          allocation.to_date >= monthDay.gregorian_date,
      );

      if (covered) {
        paidDays += 1;
      }
    }

    statuses.set(enrollmentId, {
      paidDays,
      totalDays: monthDays.length,
    });
  }

  return statuses;
}

function getMonthlyPaymentLabel(paymentInfo) {
  if (!paymentInfo || paymentInfo.paidDays === 0) {
    return "unpaid";
  }

  if (paymentInfo.paidDays >= paymentInfo.totalDays) {
    return "paid";
  }

  return "partial";
}

/*
|--------------------------------------------------------------------------
| GET KABUL TODAY
|--------------------------------------------------------------------------
*/

router.get(
  "/today",
  authRequired,
  attendanceRoles,
  asyncH(async (req, res) => {
    res.json(getKabulSolarToday());
  }),
);

/*
|--------------------------------------------------------------------------
| GET ALL ATTENDANCE RECORDS
|--------------------------------------------------------------------------
*/

router.get(
  "/",
  authRequired,
  attendanceRoles,
  asyncH(async (req, res) => {
    const { date, class_slot_id, student_id } = req.query;

    let parsedDate = null;

    if (date) {
      parsedDate = parseSolarDate(String(date));
    }

    const conditions = [];
    const values = [];

    if (parsedDate) {
      values.push(normalizeDateString(parsedDate.gregorianDate));

      conditions.push(`a.date = $${values.length}`);
    }

    if (class_slot_id) {
      values.push(Number(class_slot_id));

      conditions.push(`a.class_slot_id = $${values.length}`);
    }

    if (student_id) {
      values.push(Number(student_id));

      conditions.push(`a.student_id = $${values.length}`);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const result = await query(
      `
        SELECT
          a.id,
          a.student_id,
          s.full_name AS student_name,
          s.roll_number,
          s.guardian_name AS father_name,

          a.class_slot_id,

          cs.subject_id,
          sub.name AS subject_name,

          cs.teacher_id,
          t.full_name AS teacher_name,

          cs.start_time,
          cs.end_time,

          a.date,
          a.status,
          a.remarks,
          a.marked_by,

          u.full_name AS marked_by_name

        FROM attendance a

        INNER JOIN students s
          ON s.id = a.student_id

        INNER JOIN class_slots cs
          ON cs.id = a.class_slot_id

        INNER JOIN subjects sub
          ON sub.id = cs.subject_id

        INNER JOIN teachers t
          ON t.id = cs.teacher_id

        LEFT JOIN users u
          ON u.id = a.marked_by

        ${whereClause}

        ORDER BY
          a.date DESC,
          s.roll_number,
          s.id
      `,
      values,
    );

    res.json(
      result.rows.map((row) => {
        if (!row.date) {
          return {
            ...row,
            solar_date: null,
          };
        }

        const jalaali = dateToJalaali(
          new Date(`${normalizeDateString(row.date)}T12:00:00Z`),
        );

        return {
          ...row,
          solar_date: formatJalaali(jalaali.jy, jalaali.jm, jalaali.jd),
        };
      }),
    );
  }),
);

/*
|--------------------------------------------------------------------------
| GET ACTIVE CLASSES
|--------------------------------------------------------------------------
*/

router.get(
  "/classes",
  authRequired,
  attendanceRoles,
  asyncH(async (req, res) => {
    const result = await query(
      `
        SELECT
          cs.id,
          cs.subject_id,
          s.name AS subject_name,
          s.code AS subject_code,

          cs.teacher_id,
          t.full_name AS teacher_name,

          cs.start_time,
          cs.end_time,
          cs.is_active,
          cs.created_at,

          (
            SELECT COALESCE(
              json_agg(
                json_build_object(
                  'id', sb.id,
                  'name', sb.name
                )
                ORDER BY sb.name
              ),
              '[]'::json
            )
            FROM class_slot_books csb
            INNER JOIN subject_books sb
              ON sb.id = csb.book_id
            WHERE csb.class_slot_id = cs.id
          ) AS books,

          (
            SELECT COUNT(*)::int
            FROM student_enrollments se
            WHERE se.class_slot_id = cs.id
              AND se.is_active = TRUE
          ) AS student_count

        FROM class_slots cs

        INNER JOIN subjects s
          ON s.id = cs.subject_id

        INNER JOIN teachers t
          ON t.id = cs.teacher_id

        WHERE cs.is_active = TRUE

        ORDER BY
          s.name,
          cs.start_time,
          t.full_name
      `,
    );

    res.json(result.rows);
  }),
);

/*
|--------------------------------------------------------------------------
| GET STUDENTS IN CLASS
|--------------------------------------------------------------------------
*/

router.get(
  "/class/:classSlotId/students",
  authRequired,
  attendanceRoles,
  asyncH(async (req, res) => {
    const classSlotId = Number(req.params.classSlotId);

    if (!Number.isInteger(classSlotId) || classSlotId <= 0) {
      return res.status(400).json({
        error: "Invalid class slot",
      });
    }

    const classSlot = await getClassSlot(classSlotId);

    if (!classSlot) {
      return res.status(404).json({
        error: "Class slot not found",
      });
    }

    const result = await query(
      `
        SELECT
          se.id AS enrollment_id,

          st.id AS student_id,
          st.full_name,
          st.roll_number,
          st.guardian_name AS father_name,
          st.guardian_phone,

          se.enrolled_on,
          se.is_active

        FROM student_enrollments se

        INNER JOIN students st
          ON st.id = se.student_id

        WHERE se.class_slot_id = $1
          AND se.is_active = TRUE

        ORDER BY
          st.roll_number,
          st.id
      `,
      [classSlotId],
    );

    res.json(result.rows);
  }),
);

/*
|--------------------------------------------------------------------------
| GET DAILY STUDENTS + ATTENDANCE
|--------------------------------------------------------------------------
*/

router.get(
  "/class/:classSlotId/date/:date/students",
  authRequired,
  attendanceRoles,
  asyncH(async (req, res) => {
    const classSlotId = Number(req.params.classSlotId);

    if (!Number.isInteger(classSlotId) || classSlotId <= 0) {
      return res.status(400).json({
        error: "Invalid class slot",
      });
    }

    const parsed = parseSolarDate(String(req.params.date));

    const gregorianDate = normalizeDateString(parsed.gregorianDate);

    const solarDate = formatJalaali(parsed.year, parsed.month, parsed.day);

    const isFriday = isFridayFromGregorian(parsed.gregorianDate);

    const classSlot = await getClassSlot(classSlotId);

    if (!classSlot) {
      return res.status(404).json({
        error: "Class slot not found",
      });
    }

    const studentsResult = await query(
      `
        SELECT
          se.id AS enrollment_id,

          st.id AS student_id,
          st.full_name,
          st.roll_number,
          st.guardian_name AS father_name,

          se.enrolled_on

        FROM student_enrollments se

        INNER JOIN students st
          ON st.id = se.student_id

        WHERE se.class_slot_id = $1
          AND se.is_active = TRUE

        ORDER BY
          st.roll_number,
          st.id
      `,
      [classSlotId],
    );

    const attendanceResult = await query(
      `
        SELECT
          a.id,
          a.student_id,
          a.status,
          a.marked_by,
          u.full_name AS marked_by_name

        FROM attendance a

        LEFT JOIN users u
          ON u.id = a.marked_by

        WHERE a.class_slot_id = $1
          AND a.date = $2::date
      `,
      [classSlotId, gregorianDate],
    );

    const attendanceByStudent = new Map();

    for (const row of attendanceResult.rows) {
      attendanceByStudent.set(Number(row.student_id), row);
    }

    const students = [];

    for (const student of studentsResult.rows) {
      const attendance = attendanceByStudent.get(Number(student.student_id));

      const paymentStatus = await getPaymentStatus(
        student.enrollment_id,
        gregorianDate,
      );

      students.push({
        enrollment_id: student.enrollment_id,
        student_id: student.student_id,
        full_name: student.full_name,
        roll_number: student.roll_number,
        father_name: student.father_name,
        enrolled_on: student.enrolled_on,

        payment_status: paymentStatus,

        attendance_id: attendance?.id || null,
        status: attendance?.status || null,
        marked_by: attendance?.marked_by || null,
        marked_by_name: attendance?.marked_by_name || null,
      });
    }

    res.json({
      class_slot: classSlot,
      solar_date: solarDate,
      gregorian_date: gregorianDate,
      is_friday: isFriday,
      students,
    });
  }),
);

/*
|--------------------------------------------------------------------------
| GET MONTHLY ATTENDANCE REGISTER
|--------------------------------------------------------------------------
*/

router.get(
  "/month/:classSlotId/:year/:month",
  authRequired,
  attendanceRoles,
  asyncH(async (req, res) => {
    const classSlotId = Number(req.params.classSlotId);
    const year = Number(req.params.year);
    const month = Number(req.params.month);

    if (!Number.isInteger(classSlotId) || classSlotId <= 0) {
      return res.status(400).json({
        error: "Invalid class slot",
      });
    }

    const classSlot = await getClassSlot(classSlotId);

    if (!classSlot) {
      return res.status(404).json({
        error: "Class slot not found",
      });
    }

    if (!classSlot.is_active) {
      return res.status(400).json({
        error: "This class slot is inactive",
      });
    }

    const monthDays = getSolarMonthDays(year, month);

    if (!monthDays.length) {
      return res.status(400).json({
        error: "No valid days found for this Solar Hijri month",
      });
    }

    const firstGregorianDate = monthDays[0].gregorian_date;

    const lastGregorianDate = monthDays[monthDays.length - 1].gregorian_date;

    const studentsResult = await query(
      `
        SELECT
          se.id AS enrollment_id,

          st.id AS student_id,
          st.full_name,
          st.roll_number,
          st.guardian_name AS father_name,

          se.enrolled_on

        FROM student_enrollments se

        INNER JOIN students st
          ON st.id = se.student_id

        WHERE se.class_slot_id = $1
          AND se.is_active = TRUE

        ORDER BY
          st.roll_number,
          st.id
      `,
      [classSlotId],
    );

    const students = studentsResult.rows;

    const enrollmentIds = students.map((student) =>
      Number(student.enrollment_id),
    );

    const attendanceResult = await query(
      `
        SELECT
          a.id,
          a.student_id,
          a.date,
          a.status,
          a.marked_by,

          u.full_name AS marked_by_name

        FROM attendance a

        LEFT JOIN users u
          ON u.id = a.marked_by

        WHERE a.class_slot_id = $1

          AND a.date >= $2::date
          AND a.date <= $3::date

        ORDER BY
          a.date,
          a.student_id
      `,
      [classSlotId, firstGregorianDate, lastGregorianDate],
    );

    const attendanceByStudentAndDay = new Map();

    for (const row of attendanceResult.rows) {
      const dateString = normalizeDateString(row.date);

      const dateObject = new Date(`${dateString}T12:00:00Z`);

      const jalaali = dateToJalaali(dateObject);

      const key = `${Number(row.student_id)}:${jalaali.jd}`;

      attendanceByStudentAndDay.set(key, {
        id: row.id,
        status: row.status,
        marked_by: row.marked_by,
        marked_by_name: row.marked_by_name,
      });
    }

    const paymentStatuses = await getMonthlyPaymentStatuses(
      enrollmentIds,
      monthDays,
    );

    const registerStudents = students.map((student) => {
      const paymentInfo = paymentStatuses.get(Number(student.enrollment_id));

      const attendance = {};

      for (const monthDay of monthDays) {
        const key = `${Number(student.student_id)}:${monthDay.day}`;

        const record = attendanceByStudentAndDay.get(key);

        attendance[monthDay.day] = record
          ? {
              status: record.status,
              attendance_id: record.id,
              marked_by: record.marked_by,
              marked_by_name: record.marked_by_name,
            }
          : {
              status: null,
              attendance_id: null,
              marked_by: null,
              marked_by_name: null,
            };
      }

      return {
        enrollment_id: student.enrollment_id,
        student_id: student.student_id,
        full_name: student.full_name,
        roll_number: student.roll_number,
        father_name: student.father_name,
        enrolled_on: student.enrolled_on,

        payment_status: getMonthlyPaymentLabel(paymentInfo),

        payment_paid_days: paymentInfo?.paidDays || 0,

        payment_total_days: paymentInfo?.totalDays || monthDays.length,

        attendance,
      };
    });

    const today = getKabulSolarToday();

    res.json({
      class_slot: classSlot,

      solar_year: year,
      solar_month: month,
      solar_month_name: getSolarMonthName(month),

      today_solar_year: today.solar_year,
      today_solar_month: today.solar_month,
      today_solar_day: today.solar_day,

      days: monthDays,
      students: registerStudents,
    });
  }),
);

/*
|--------------------------------------------------------------------------
| SAVE MONTHLY ATTENDANCE REGISTER
|--------------------------------------------------------------------------
*/

router.post(
  "/month",
  authRequired,
  attendanceRoles,
  asyncH(async (req, res) => {
    const { class_slot_id, year, month, records } = req.body;

    const classSlotId = Number(class_slot_id);
    const solarYear = Number(year);
    const solarMonth = Number(month);

    if (!Number.isInteger(classSlotId) || classSlotId <= 0) {
      return res.status(400).json({
        error: "Invalid class slot",
      });
    }

    if (
      !Number.isInteger(solarYear) ||
      !Number.isInteger(solarMonth) ||
      solarMonth < 1 ||
      solarMonth > 12
    ) {
      return res.status(400).json({
        error: "Invalid Solar Hijri month",
      });
    }

    if (!Array.isArray(records)) {
      return res.status(400).json({
        error: "records must be an array",
      });
    }

    const classSlot = await getClassSlot(classSlotId);

    if (!classSlot) {
      return res.status(404).json({
        error: "Class slot not found",
      });
    }

    if (!classSlot.is_active) {
      return res.status(400).json({
        error: "This class slot is inactive",
      });
    }

    const monthDays = getSolarMonthDays(solarYear, solarMonth);

    const dayMap = new Map();

    for (const monthDay of monthDays) {
      dayMap.set(monthDay.day, monthDay);
    }

    /*
     * Get all active enrollments for this class.
     */
    const enrollmentsResult = await query(
      `
        SELECT
          se.id AS enrollment_id,
          se.student_id

        FROM student_enrollments se

        WHERE se.class_slot_id = $1
          AND se.is_active = TRUE
      `,
      [classSlotId],
    );

    const enrollmentByStudent = new Map();

    for (const row of enrollmentsResult.rows) {
      enrollmentByStudent.set(
        Number(row.student_id),
        Number(row.enrollment_id),
      );
    }

    /*
     * Validate every record before opening the transaction.
     */
    for (const record of records) {
      const studentId = Number(record.student_id);
      const day = Number(record.day);
      const status = record.status;

      if (!Number.isInteger(studentId) || studentId <= 0) {
        return res.status(400).json({
          error: "Invalid student ID in attendance records",
        });
      }

      if (!Number.isInteger(day) || !dayMap.has(day)) {
        return res.status(400).json({
          error: `Invalid attendance day: ${day}`,
        });
      }

      if (status !== null && !VALID_STATUSES.includes(status)) {
        return res.status(400).json({
          error: "Attendance status must be present, absent, or null",
        });
      }

      if (!enrollmentByStudent.has(studentId)) {
        return res.status(400).json({
          error: "One or more students are not actively enrolled in this class",
        });
      }
    }

    /*
     * IMPORTANT:
     *
     * Normalize the incoming records first.
     *
     * If the frontend somehow sends the same student/day
     * more than once, the LAST value wins.
     *
     * This makes the request deterministic and guarantees
     * that the final state of every clicked cell is what gets
     * written to PostgreSQL.
     */
    const normalizedRecords = new Map();

    for (const record of records) {
      const studentId = Number(record.student_id);
      const day = Number(record.day);
      const status = record.status;

      const key = `${studentId}:${day}`;

      normalizedRecords.set(key, {
        studentId,
        day,
        status,
      });
    }

    /*
     * Convert Map back to an array.
     */
    const recordsToSave = Array.from(normalizedRecords.values());

    /*
     * Resolve every Solar day to its Gregorian date BEFORE
     * starting the transaction.
     *
     * This means all date conversion is finished before any
     * database write begins.
     */
    const preparedRecords = [];

    for (const record of recordsToSave) {
      const parsed = parseSolarDate(`${solarYear}-${solarMonth}-${record.day}`);

      if (isFridayFromGregorian(parsed.gregorianDate)) {
        return res.status(400).json({
          error: "Friday is a holiday and attendance cannot be recorded.",
          code: "FRIDAY_ATTENDANCE_NOT_ALLOWED",
        });
      }

      preparedRecords.push({
        studentId: record.studentId,
        day: record.day,
        status: record.status,
        gregorianDate: normalizeDateString(parsed.gregorianDate),
      });
    }

    const client = await pool.connect();

    let savedCount = 0;
    let clearedCount = 0;

    try {
      await client.query("BEGIN");

      /*
       * Save every changed cell sequentially.
       *
       * Do NOT use forEach(async ...).
       *
       * Each query is awaited before moving to the next one.
       */
      for (const record of preparedRecords) {
        if (record.status === null) {
          const deleted = await client.query(
            `
              DELETE FROM attendance

              WHERE student_id = $1
                AND class_slot_id = $2
                AND date = $3::date

              RETURNING id
            `,
            [record.studentId, classSlotId, record.gregorianDate],
          );

          if (deleted.rows.length > 0) {
            clearedCount += 1;
          }

          continue;
        }

        await client.query(
          `
            INSERT INTO attendance (
              student_id,
              class_slot_id,
              date,
              status,
              remarks,
              marked_by
            )

            VALUES (
              $1,
              $2,
              $3::date,
              $4,
              NULL,
              $5
            )

            ON CONFLICT (
              student_id,
              class_slot_id,
              date
            )

            DO UPDATE SET
              status = EXCLUDED.status,
              marked_by = EXCLUDED.marked_by
          `,
          [
            record.studentId,
            classSlotId,
            record.gregorianDate,
            record.status,
            req.user.id,
          ],
        );

        savedCount += 1;
      }

      /*
       * Commit only after EVERY record has successfully
       * completed.
       */
      await client.query("COMMIT");

      res.json({
        ok: true,
        saved_count: savedCount,
        cleared_count: clearedCount,
        received_count: records.length,
        processed_count: preparedRecords.length,
        class_slot_id: classSlotId,
        solar_year: solarYear,
        solar_month: solarMonth,
        solar_month_name: getSolarMonthName(solarMonth),
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
|--------------------------------------------------------------------------
| SAVE ONE DAILY ATTENDANCE RECORD
|--------------------------------------------------------------------------
*/

router.post(
  "/mark",
  authRequired,
  attendanceRoles,
  asyncH(async (req, res) => {
    const { class_slot_id, date, records } = req.body;

    const classSlotId = Number(class_slot_id);

    if (!Number.isInteger(classSlotId) || classSlotId <= 0) {
      return res.status(400).json({
        error: "Invalid class slot",
      });
    }

    if (!date) {
      return res.status(400).json({
        error: "Attendance date is required",
      });
    }

    if (!Array.isArray(records)) {
      return res.status(400).json({
        error: "records must be an array",
      });
    }

    const parsed = parseSolarDate(String(date));

    if (isFridayFromGregorian(parsed.gregorianDate)) {
      return res.status(400).json({
        error: "Friday is a holiday and attendance cannot be recorded.",
        code: "FRIDAY_ATTENDANCE_NOT_ALLOWED",
      });
    }

    const gregorianDate = normalizeDateString(parsed.gregorianDate);

    const classSlot = await getClassSlot(classSlotId);

    if (!classSlot) {
      return res.status(404).json({
        error: "Class slot not found",
      });
    }

    if (!classSlot.is_active) {
      return res.status(400).json({
        error: "This class slot is inactive",
      });
    }

    const enrollmentsResult = await query(
      `
        SELECT
          student_id

        FROM student_enrollments

        WHERE class_slot_id = $1
          AND is_active = TRUE
      `,
      [classSlotId],
    );

    const activeStudents = new Set(
      enrollmentsResult.rows.map((row) => Number(row.student_id)),
    );

    for (const record of records) {
      const studentId = Number(record.student_id);

      if (!Number.isInteger(studentId) || studentId <= 0) {
        return res.status(400).json({
          error: "Invalid student ID",
        });
      }

      if (!VALID_STATUSES.includes(record.status)) {
        return res.status(400).json({
          error: "Attendance status must be present or absent",
        });
      }

      if (!activeStudents.has(studentId)) {
        return res.status(400).json({
          error: "Student is not actively enrolled in this class",
        });
      }
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      for (const record of records) {
        await client.query(
          `
            INSERT INTO attendance (
              student_id,
              class_slot_id,
              date,
              status,
              remarks,
              marked_by
            )

            VALUES (
              $1,
              $2,
              $3::date,
              $4,
              NULL,
              $5
            )

            ON CONFLICT (
              student_id,
              class_slot_id,
              date
            )

            DO UPDATE SET
              status = EXCLUDED.status,
              marked_by = EXCLUDED.marked_by
          `,
          [
            Number(record.student_id),
            classSlotId,
            gregorianDate,
            record.status,
            req.user.id,
          ],
        );
      }

      await client.query("COMMIT");

      res.json({
        ok: true,
        count: records.length,
        solar_date: formatJalaali(parsed.year, parsed.month, parsed.day),
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
|--------------------------------------------------------------------------
| CREATE ONE ATTENDANCE RECORD
|--------------------------------------------------------------------------
*/

router.post(
  "/",
  authRequired,
  attendanceRoles,
  asyncH(async (req, res) => {
    const { student_id, class_slot_id, date, status, remarks } = req.body;

    const studentId = Number(student_id);
    const classSlotId = Number(class_slot_id);

    if (!Number.isInteger(studentId) || studentId <= 0) {
      return res.status(400).json({
        error: "Invalid student",
      });
    }

    if (!Number.isInteger(classSlotId) || classSlotId <= 0) {
      return res.status(400).json({
        error: "Invalid class slot",
      });
    }

    if (!date) {
      return res.status(400).json({
        error: "Date is required",
      });
    }

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        error: "Attendance status must be present or absent",
      });
    }

    const parsed = parseSolarDate(String(date));

    if (isFridayFromGregorian(parsed.gregorianDate)) {
      return res.status(400).json({
        error: "Friday is a holiday and attendance cannot be recorded.",
      });
    }

    const classSlot = await getClassSlot(classSlotId);

    if (!classSlot) {
      return res.status(404).json({
        error: "Class slot not found",
      });
    }

    if (!classSlot.is_active) {
      return res.status(400).json({
        error: "This class slot is inactive",
      });
    }

    const enrollment = await query(
      `
        SELECT id
        FROM student_enrollments
        WHERE student_id = $1
          AND class_slot_id = $2
          AND is_active = TRUE
      `,
      [studentId, classSlotId],
    );

    if (!enrollment.rows.length) {
      return res.status(400).json({
        error: "Student is not actively enrolled in this class",
      });
    }

    const gregorianDate = normalizeDateString(parsed.gregorianDate);

    const result = await query(
      `
        INSERT INTO attendance (
          student_id,
          class_slot_id,
          date,
          status,
          remarks,
          marked_by
        )

        VALUES (
          $1,
          $2,
          $3::date,
          $4,
          $5,
          $6
        )

        ON CONFLICT (
          student_id,
          class_slot_id,
          date
        )

        DO UPDATE SET
          status = EXCLUDED.status,
          remarks = EXCLUDED.remarks,
          marked_by = EXCLUDED.marked_by

        RETURNING *
      `,
      [
        studentId,
        classSlotId,
        gregorianDate,
        status,
        remarks || null,
        req.user.id,
      ],
    );

    res.status(201).json(result.rows[0]);
  }),
);

/*
|--------------------------------------------------------------------------
| UPDATE ONE ATTENDANCE RECORD
|--------------------------------------------------------------------------
*/

router.put(
  "/:id",
  authRequired,
  attendanceRoles,
  asyncH(async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: "Invalid attendance ID",
      });
    }

    const { status, remarks } = req.body;

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        error: "Attendance status must be present or absent",
      });
    }

    const result = await query(
      `
        UPDATE attendance

        SET
          status = $1,
          remarks = $2,
          marked_by = $3

        WHERE id = $4

        RETURNING *
      `,
      [status, remarks || null, req.user.id, id],
    );

    if (!result.rows.length) {
      return res.status(404).json({
        error: "Attendance record not found",
      });
    }

    res.json(result.rows[0]);
  }),
);

/*
|--------------------------------------------------------------------------
| DELETE ATTENDANCE
|--------------------------------------------------------------------------
|
| Admin only.
|
*/

router.delete(
  "/:id",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: "Invalid attendance ID",
      });
    }

    const result = await query(
      `
        DELETE FROM attendance
        WHERE id = $1
        RETURNING id
      `,
      [id],
    );

    if (!result.rows.length) {
      return res.status(404).json({
        error: "Attendance record not found",
      });
    }

    res.json({
      ok: true,
    });
  }),
);

module.exports = router;
