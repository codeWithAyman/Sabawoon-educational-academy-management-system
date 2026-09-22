const express = require("express");
const { query } = require("../db/pool");
const { authRequired, requireRoles } = require("../middleware/auth");
const { asyncH } = require("../utils/helpers");

const router = express.Router();

/*
  Dashboard data uses Kabul local time.
*/
const KABUL_TODAY = "(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kabul')::date";

const KABUL_MONTH_START = `
  (date_trunc('month', ${KABUL_TODAY}::timestamp))::date
`;

const KABUL_NEXT_MONTH_START = `
  ((date_trunc('month', ${KABUL_TODAY}::timestamp) + INTERVAL '1 month'))::date
`;

/*
  GET /api/dashboard/stats
*/
router.get(
  "/stats",
  authRequired,
  requireRoles("admin", "attendance"),
  asyncH(async (req, res) => {
    /*
      Every query is labelled so the backend terminal tells us
      exactly which dashboard section failed.
    */
    const run = async (label, sql) => {
      try {
        return await query(sql);
      } catch (error) {
        console.error(`\n[DASHBOARD] ${label} query failed:`);
        console.error(error.message);
        throw error;
      }
    };

    try {
      const [
        currentDateResult,

        /*
          OVERVIEW
        */
        totalStudentsResult,
        activeStudentsResult,
        activeEnrollmentsResult,
        totalClassesResult,
        totalTeachersResult,
        totalStaffResult,
        totalSubjectsResult,

        /*
          ATTENDANCE
        */
        todayAttendanceResult,
        monthAttendanceResult,
        attendanceTrendResult,

        /*
          FINANCE
        */
        monthlyPaymentsResult,
        monthlyFeesResult,
        outstandingFeesResult,
        allTimePaymentsResult,

        /*
          RECENT DATA
        */
        recentEnrollmentsResult,
        recentPaymentsResult,

        /*
          ANALYTICS
        */
        classCategoriesResult,
        studentDistributionResult,
      ] = await Promise.all([
        /*
          -------------------------------------------------------
          CURRENT KABUL DATE
          -------------------------------------------------------
        */
        run(
          "current date",
          `
            SELECT ${KABUL_TODAY} AS current_date
          `,
        ),

        /*
          -------------------------------------------------------
          TOTAL STUDENTS
          -------------------------------------------------------

          Lifetime student registrations.

          We intentionally count all rows rather than only
          is_active because the dashboard requirement is that
          Total Students represents registered students, while
          Active Students is calculated separately from enrollments.
        */
        run(
          "total students",
          `
            SELECT COUNT(*)::int AS total
            FROM students
          `,
        ),

        /*
          -------------------------------------------------------
          ACTIVE STUDENTS
          -------------------------------------------------------

          A student is active when they have at least one active
          enrollment in an active class slot.
        */
        run(
          "active students",
          `
            SELECT COUNT(DISTINCT se.student_id)::int AS total
            FROM student_enrollments se
            INNER JOIN class_slots cs
              ON cs.id = se.class_slot_id
            WHERE se.is_active = TRUE
              AND cs.is_active = TRUE
          `,
        ),

        /*
          -------------------------------------------------------
          ACTIVE ENROLLMENTS
          -------------------------------------------------------
        */
        run(
          "active enrollments",
          `
            SELECT COUNT(*)::int AS total
            FROM student_enrollments se
            INNER JOIN class_slots cs
              ON cs.id = se.class_slot_id
            WHERE se.is_active = TRUE
              AND cs.is_active = TRUE
          `,
        ),

        /*
          -------------------------------------------------------
          ACTIVE CLASSES
          -------------------------------------------------------

          A class means an active class slot.
        */
        run(
          "active classes",
          `
            SELECT COUNT(*)::int AS total
            FROM class_slots
            WHERE is_active = TRUE
          `,
        ),

        /*
          -------------------------------------------------------
          TOTAL TEACHERS
          -------------------------------------------------------

          teachers does not contain is_active, so we count the
          actual teacher records.
        */
        run(
          "total teachers",
          `
            SELECT COUNT(*)::int AS total
            FROM teachers
          `,
        ),

        /*
          -------------------------------------------------------
          ACTIVE STAFF
          -------------------------------------------------------

          Staff has is_active, so only active staff are counted.
        */
        run(
          "total staff",
          `
            SELECT COUNT(*)::int AS total
            FROM staff
            WHERE is_active = TRUE
          `,
        ),

        /*
          -------------------------------------------------------
          TOTAL SUBJECTS
          -------------------------------------------------------
        */
        run(
          "total subjects",
          `
            SELECT COUNT(*)::int AS total
            FROM subjects
          `,
        ),

        /*
          -------------------------------------------------------
          TODAY'S ATTENDANCE
          -------------------------------------------------------
        */
        run(
          "today attendance",
          `
            SELECT
              COUNT(*) FILTER (
                WHERE LOWER(COALESCE(status, '')) = 'present'
              )::int AS present,

              COUNT(*) FILTER (
                WHERE LOWER(COALESCE(status, '')) = 'absent'
              )::int AS absent,

              COUNT(*)::int AS total

            FROM attendance

            WHERE date = ${KABUL_TODAY}
          `,
        ),

        /*
          -------------------------------------------------------
          CURRENT MONTH ATTENDANCE
          -------------------------------------------------------
        */
        run(
          "monthly attendance",
          `
            SELECT
              COUNT(*) FILTER (
                WHERE LOWER(COALESCE(status, '')) = 'present'
              )::int AS present,

              COUNT(*) FILTER (
                WHERE LOWER(COALESCE(status, '')) = 'absent'
              )::int AS absent,

              COUNT(*)::int AS total

            FROM attendance

            WHERE date >= ${KABUL_MONTH_START}
              AND date < ${KABUL_NEXT_MONTH_START}
          `,
        ),

        /*
          -------------------------------------------------------
          LAST 7 DAYS ATTENDANCE
          -------------------------------------------------------

          Always returns seven dates, including dates with zero
          attendance records.
        */
        run(
          "attendance trend",
          `
            WITH days AS (
              SELECT
                generate_series(
                  ${KABUL_TODAY} - INTERVAL '6 days',
                  ${KABUL_TODAY},
                  INTERVAL '1 day'
                )::date AS date
            )

            SELECT
              d.date,

              COUNT(a.*) FILTER (
                WHERE LOWER(COALESCE(a.status, '')) = 'present'
              )::int AS present,

              COUNT(a.*) FILTER (
                WHERE LOWER(COALESCE(a.status, '')) = 'absent'
              )::int AS absent,

              COUNT(a.*)::int AS total

            FROM days d

            LEFT JOIN attendance a
              ON a.date = d.date

            GROUP BY d.date
            ORDER BY d.date ASC
          `,
        ),

        /*
          -------------------------------------------------------
          MONTHLY ACTUAL PAYMENTS
          -------------------------------------------------------

          IMPORTANT:

          This uses fee_payments because this table represents
          actual payment transactions.

          We do NOT use fees.paid_amount for collected money.
        */
        run(
          "monthly payments",
          `
            SELECT
              COALESCE(SUM(fp.amount), 0)::numeric AS collected,
              COUNT(*)::int AS transaction_count

            FROM fee_payments fp

            WHERE fp.payment_date >= ${KABUL_MONTH_START}
              AND fp.payment_date < ${KABUL_NEXT_MONTH_START}
          `,
        ),

        /*
          -------------------------------------------------------
          MONTHLY FEES
          -------------------------------------------------------

          fees represents the fee records/billed amounts.

          total_amount = original billed amount
          paid_amount  = current amount paid against that fee
          due_amount   = current outstanding amount
        */
        run(
          "monthly fees",
          `
            SELECT
              COALESCE(SUM(total_amount), 0)::numeric AS billed,

              COALESCE(SUM(paid_amount), 0)::numeric AS paid,

              COALESCE(SUM(due_amount), 0)::numeric AS due,

              COUNT(*)::int AS fee_count

            FROM fees

            WHERE payment_date >= ${KABUL_MONTH_START}
              AND payment_date < ${KABUL_NEXT_MONTH_START}
          `,
        ),

        /*
          -------------------------------------------------------
          TOTAL OUTSTANDING
          -------------------------------------------------------
        */
        run(
          "outstanding fees",
          `
            SELECT
              COALESCE(SUM(due_amount), 0)::numeric AS outstanding

            FROM fees

            WHERE due_amount > 0
          `,
        ),

        /*
          -------------------------------------------------------
          ALL-TIME ACTUAL PAYMENTS
          -------------------------------------------------------
        */
        run(
          "all time payments",
          `
            SELECT
              COALESCE(SUM(fp.amount), 0)::numeric AS collected,
              COUNT(*)::int AS transaction_count

            FROM fee_payments fp
          `,
        ),

        /*
          -------------------------------------------------------
          RECENT ENROLLMENTS
          -------------------------------------------------------
        */
        run(
          "recent enrollments",
          `
            SELECT
              se.id AS enrollment_id,
              se.student_id,
              se.enrolled_on,
              se.created_at,

              s.id AS student_record_id,
              s.full_name,
              s.roll_number,
              s.phone,

              subj.id AS subject_id,
              subj.name AS subject_name,
              subj.code AS subject_code,

              t.id AS teacher_id,
              t.full_name AS teacher_name,

              cs.id AS class_slot_id,
              cs.start_time,
              cs.end_time,
              cs.level,
              cs.academic_year

            FROM student_enrollments se

            INNER JOIN students s
              ON s.id = se.student_id

            INNER JOIN class_slots cs
              ON cs.id = se.class_slot_id

            INNER JOIN subjects subj
              ON subj.id = cs.subject_id

            LEFT JOIN teachers t
              ON t.id = cs.teacher_id

            ORDER BY
              se.created_at DESC NULLS LAST,
              se.id DESC

            LIMIT 8
          `,
        ),

        /*
          -------------------------------------------------------
          RECENT PAYMENTS
          -------------------------------------------------------

          This gives the dashboard real transaction activity
          directly from fee_payments.
        */
        run(
          "recent payments",
          `
            SELECT
              fp.id,
              fp.fee_id,
              fp.amount,
              fp.payment_date,
              fp.receipt_number,
              fp.created_at,
              fp.fee_period_id,
              fp.comment,
              fp.collected_by_user_id,
              fp.recorded_by,

              f.student_id,
              f.subject_id,
              f.academic_year,
              f.description,

              s.full_name AS student_name,
              s.roll_number,

              subj.name AS subject_name,
              subj.code AS subject_code

            FROM fee_payments fp

            INNER JOIN fees f
              ON f.id = fp.fee_id

            INNER JOIN students s
              ON s.id = f.student_id

            LEFT JOIN subjects subj
              ON subj.id = f.subject_id

            ORDER BY
              fp.payment_date DESC,
              fp.created_at DESC,
              fp.id DESC

            LIMIT 8
          `,
        ),

        /*
          -------------------------------------------------------
          ACTIVE CLASS DISTRIBUTION
          -------------------------------------------------------
        */
        run(
          "class categories",
          `
            SELECT
              subj.id,
              subj.name,
              COUNT(cs.id)::int AS classes

            FROM subjects subj

            INNER JOIN class_slots cs
              ON cs.subject_id = subj.id

            WHERE cs.is_active = TRUE

            GROUP BY
              subj.id,
              subj.name

            ORDER BY
              classes DESC,
              subj.name ASC
          `,
        ),

        /*
          -------------------------------------------------------
          ACTIVE STUDENT DISTRIBUTION
          -------------------------------------------------------

          DISTINCT students prevent one student from being counted
          multiple times for the same subject.
        */
        run(
          "student distribution",
          `
            SELECT
              subj.id,
              subj.name,
              COUNT(DISTINCT se.student_id)::int AS students

            FROM subjects subj

            INNER JOIN class_slots cs
              ON cs.subject_id = subj.id

            INNER JOIN student_enrollments se
              ON se.class_slot_id = cs.id

            WHERE cs.is_active = TRUE
              AND se.is_active = TRUE

            GROUP BY
              subj.id,
              subj.name

            ORDER BY
              students DESC,
              subj.name ASC
          `,
        ),
      ]);

      const first = (result) => result?.rows?.[0] || {};

      /*
        =========================================================
        BASIC COUNTS
        =========================================================
      */

      const totalStudents = Number(first(totalStudentsResult).total || 0);

      const activeStudents = Number(first(activeStudentsResult).total || 0);

      const activeEnrollments = Number(
        first(activeEnrollmentsResult).total || 0,
      );

      const totalClasses = Number(first(totalClassesResult).total || 0);

      const totalTeachers = Number(first(totalTeachersResult).total || 0);

      const totalStaff = Number(first(totalStaffResult).total || 0);

      const totalSubjects = Number(first(totalSubjectsResult).total || 0);

      /*
        =========================================================
        ATTENDANCE
        =========================================================
      */

      const todayAttendance = first(todayAttendanceResult);
      const monthAttendance = first(monthAttendanceResult);

      const todayPresent = Number(todayAttendance.present || 0);

      const todayAbsent = Number(todayAttendance.absent || 0);

      const todayTotal = Number(todayAttendance.total || 0);

      const monthPresent = Number(monthAttendance.present || 0);

      const monthAbsent = Number(monthAttendance.absent || 0);

      const monthAttendanceTotal = Number(monthAttendance.total || 0);

      const todayAttendanceRate =
        todayTotal > 0 ? (todayPresent / todayTotal) * 100 : 0;

      const monthlyAttendanceRate =
        monthAttendanceTotal > 0
          ? (monthPresent / monthAttendanceTotal) * 100
          : 0;

      /*
        =========================================================
        FINANCE
        =========================================================
      */

      /*
        Actual money collected this month comes from
        fee_payments.amount.
      */
      const monthlyPayments = first(monthlyPaymentsResult);

      const monthlyCollected = Number(monthlyPayments.collected || 0);

      const monthlyTransactionCount = Number(
        monthlyPayments.transaction_count || 0,
      );

      /*
        Fee/billing information comes from fees.
      */
      const monthlyFees = first(monthlyFeesResult);

      const monthlyBilled = Number(monthlyFees.billed || 0);

      const monthlyFeePaidState = Number(monthlyFees.paid || 0);

      const monthlyDue = Number(monthlyFees.due || 0);

      const monthlyFeeCount = Number(monthlyFees.fee_count || 0);

      /*
        Total outstanding balance comes from the current
        fee records.
      */
      const outstandingFees = first(outstandingFeesResult);

      const outstanding = Number(outstandingFees.outstanding || 0);

      /*
        All-time actual payments.
      */
      const allTimePayments = first(allTimePaymentsResult);

      const allTimeCollected = Number(allTimePayments.collected || 0);

      const allTimeTransactionCount = Number(
        allTimePayments.transaction_count || 0,
      );

      /*
        Collection rate is based on the month's billed fees.
      */
      const monthlyCollectionRate =
        monthlyBilled > 0
          ? Math.min(100, Math.max(0, (monthlyCollected / monthlyBilled) * 100))
          : 0;

      /*
        =========================================================
        ANALYTICS
        =========================================================
      */

      const activeStudentRate =
        totalStudents > 0 ? (activeStudents / totalStudents) * 100 : 0;

      const enrollmentLoad =
        totalClasses > 0 ? activeEnrollments / totalClasses : 0;

      /*
        =========================================================
        RECENT ENROLLMENTS
        =========================================================
      */

      const recentEnrollments = recentEnrollmentsResult.rows.map((row) => ({
        id: row.enrollment_id,

        enrollment_id: row.enrollment_id,

        student_id: row.student_id,

        student_name: row.full_name || "",

        roll_number: row.roll_number ?? null,

        phone: row.phone ?? null,

        subject_id: row.subject_id ?? null,

        subject_name: row.subject_name || "",

        subject_code: row.subject_code || null,

        teacher_id: row.teacher_id ?? null,

        teacher_name: row.teacher_name || "Unassigned",

        class_slot_id: row.class_slot_id ?? null,

        level: row.level || null,

        academic_year: row.academic_year || null,

        start_time: row.start_time || null,

        end_time: row.end_time || null,

        enrolled_on: row.enrolled_on || null,

        created_at: row.created_at || null,
      }));

      /*
        =========================================================
        RECENT PAYMENTS
        =========================================================
      */

      const recentPayments = recentPaymentsResult.rows.map((row) => ({
        id: row.id,

        fee_id: row.fee_id,

        student_id: row.student_id,

        student_name: row.student_name || "",

        roll_number: row.roll_number ?? null,

        subject_id: row.subject_id ?? null,

        subject_name: row.subject_name || null,

        subject_code: row.subject_code || null,

        amount: Number(row.amount || 0),

        payment_date: row.payment_date || null,

        receipt_number: row.receipt_number || null,

        fee_period_id: row.fee_period_id ?? null,

        comment: row.comment || null,

        collected_by_user_id: row.collected_by_user_id ?? null,

        recorded_by: row.recorded_by ?? null,

        created_at: row.created_at || null,

        academic_year: row.academic_year || null,

        description: row.description || null,
      }));

      /*
        =========================================================
        ATTENDANCE TREND
        =========================================================
      */

      const attendanceTrend = attendanceTrendResult.rows.map((row) => ({
        date: row.date,

        present: Number(row.present || 0),

        absent: Number(row.absent || 0),

        total: Number(row.total || 0),
      }));

      /*
        =========================================================
        RESPONSE
        =========================================================
      */

      res.json({
        success: true,

        period: {
          timezone: "Asia/Kabul",

          current_date: first(currentDateResult).current_date || null,
        },

        /*
          -------------------------------------------------------
          OVERVIEW
          -------------------------------------------------------
        */
        overview: {
          total_students: totalStudents,

          active_students: activeStudents,

          active_enrollments: activeEnrollments,

          total_classes: totalClasses,

          total_teachers: totalTeachers,

          total_staff: totalStaff,

          total_subjects: totalSubjects,
        },

        /*
          -------------------------------------------------------
          ATTENDANCE
          -------------------------------------------------------
        */
        attendance: {
          today: {
            present: todayPresent,

            absent: todayAbsent,

            total: todayTotal,

            rate: Number(todayAttendanceRate.toFixed(2)),
          },

          month: {
            present: monthPresent,

            absent: monthAbsent,

            total: monthAttendanceTotal,

            rate: Number(monthlyAttendanceRate.toFixed(2)),
          },

          trend: attendanceTrend,
        },

        /*
          -------------------------------------------------------
          FINANCE
          -------------------------------------------------------

          monthly_collected comes from fee_payments.

          monthly_billed and monthly_due come from fees.

          outstanding is the current outstanding balance
          across all fee records.
        */
        finance: {
          monthly_collected: monthlyCollected,

          monthly_billed: monthlyBilled,

          monthly_due: monthlyDue,

          monthly_collection_rate: Number(monthlyCollectionRate.toFixed(2)),

          outstanding,

          monthly_transaction_count: monthlyTransactionCount,

          monthly_fee_count: monthlyFeeCount,

          monthly_fee_paid_state: monthlyFeePaidState,

          all_time_collected: allTimeCollected,

          all_time_transaction_count: allTimeTransactionCount,

          recent_payments: recentPayments,
        },

        /*
          -------------------------------------------------------
          ANALYTICS
          -------------------------------------------------------
        */
        analytics: {
          active_student_rate: Number(activeStudentRate.toFixed(2)),

          enrollment_load: Number(enrollmentLoad.toFixed(2)),

          monthly_collection_rate: Number(monthlyCollectionRate.toFixed(2)),

          today_attendance_rate: Number(todayAttendanceRate.toFixed(2)),

          monthly_attendance_rate: Number(monthlyAttendanceRate.toFixed(2)),
        },

        /*
          -------------------------------------------------------
          RECENT ENROLLMENTS
          -------------------------------------------------------
        */
        recent_enrollments: recentEnrollments,

        /*
          -------------------------------------------------------
          CLASS DISTRIBUTION
          -------------------------------------------------------
        */
        class_categories: classCategoriesResult.rows.map((row) => ({
          id: row.id,

          name: row.name,

          classes: Number(row.classes || 0),
        })),

        /*
          -------------------------------------------------------
          STUDENT DISTRIBUTION
          -------------------------------------------------------
        */
        student_distribution: studentDistributionResult.rows.map((row) => ({
          id: row.id,

          name: row.name,

          students: Number(row.students || 0),
        })),

        /*
          -------------------------------------------------------
          SYSTEM
          -------------------------------------------------------
        */
        system: {
          status: "operational",

          auto_refresh_seconds: 60,
        },
      });
    } catch (error) {
      console.error("\n========================================");

      console.error("[DASHBOARD] Failed to load dashboard");

      console.error(error);

      console.error("========================================\n");

      res.status(500).json({
        success: false,

        message: "Unable to load dashboard data.",

        code: "DASHBOARD_LOAD_FAILED",
      });
    }
  }),
);

module.exports = router;
