const express = require("express");
const { query } = require("../db/pool");
const { authRequired, requireRoles } = require("../middleware/auth");
const { asyncH } = require("../utils/helpers");

const router = express.Router();

router.get(
  "/stats",
  authRequired,
  requireRoles("admin", "attendance"),
  asyncH(async (req, res) => {
    const [
      studentsResult,
      teachersResult,
      staffResult,
      subjectsResult,
      classSlotsResult,
      todayAttendanceResult,
      monthlyFeesResult,
      outstandingFeesResult,
      attendanceMonthResult,
      attendanceTrendResult,
      recentStudentsResult,
      recentPaymentsResult,
      upcomingExamsResult,
      assignmentsResult,
      totalAssignmentsResult,
    ] = await Promise.all([
      query(`
        SELECT COUNT(*)::int AS total
        FROM students
      `),

      query(`
        SELECT COUNT(*)::int AS total
        FROM teachers
      `),

      query(`
        SELECT COUNT(*)::int AS total
        FROM staff
        WHERE is_active = TRUE
      `),

      query(`
        SELECT COUNT(*)::int AS total
        FROM subjects
      `),

      query(`
        SELECT COUNT(*)::int AS total
        FROM class_slots
        WHERE is_active = TRUE
      `),

      query(`
        SELECT COUNT(*)::int AS total
        FROM attendance
        WHERE date = CURRENT_DATE
          AND status = 'present'
      `),

      query(`
        SELECT COALESCE(SUM(paid_amount), 0)::numeric AS total
        FROM fees
        WHERE payment_date >= DATE_TRUNC('month', CURRENT_DATE)::date
          AND payment_date < (
            DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
          )::date
          AND paid_amount > 0
      `),

      query(`
        SELECT
          COALESCE(SUM(due_amount), 0)::numeric AS total,
          COUNT(*) FILTER (WHERE due_amount > 0)::int AS count
        FROM fees
        WHERE due_amount > 0
      `),

      query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'present')::int AS present,
          COUNT(*) FILTER (WHERE status = 'absent')::int AS absent,
          COUNT(*) FILTER (WHERE status = 'late')::int AS late,
          COUNT(*) FILTER (WHERE status = 'leave')::int AS leave
        FROM attendance
        WHERE date >= DATE_TRUNC('month', CURRENT_DATE)::date
          AND date < (
            DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
          )::date
      `),

      query(`
        SELECT
          date,
          COUNT(*) FILTER (WHERE status = 'present')::int AS present,
          COUNT(*) FILTER (WHERE status = 'absent')::int AS absent,
          COUNT(*) FILTER (WHERE status = 'late')::int AS late,
          COUNT(*) FILTER (WHERE status = 'leave')::int AS leave
        FROM attendance
        WHERE date >= CURRENT_DATE - INTERVAL '6 days'
          AND date <= CURRENT_DATE
        GROUP BY date
        ORDER BY date
      `),

      query(`
        SELECT
          id,
          roll_number,
          guardian_name,
          guardian_phone,
          admission_date
        FROM students
        ORDER BY admission_date DESC NULLS LAST, id DESC
        LIMIT 5
      `),

      query(`
        SELECT
          f.id,
          f.receipt_number,
          f.student_id,
          s.roll_number,
          f.total_amount,
          f.paid_amount,
          f.due_amount,
          f.status,
          f.payment_date,
          f.description
        FROM fees f
        INNER JOIN students s
          ON s.id = f.student_id
        WHERE f.paid_amount > 0
        ORDER BY f.payment_date DESC NULLS LAST, f.id DESC
        LIMIT 5
      `),

      query(`
        SELECT
          e.id,
          e.name,
          e.exam_date,
          e.total_marks,
          e.academic_year,
          cs.id AS class_slot_id,
          s.name AS subject_name,
          t.full_name AS teacher_name
        FROM exams e
        INNER JOIN class_slots cs
          ON cs.id = e.class_slot_id
        INNER JOIN subjects s
          ON s.id = cs.subject_id
        INNER JOIN teachers t
          ON t.id = cs.teacher_id
        WHERE e.exam_date >= CURRENT_DATE
        ORDER BY e.exam_date ASC, e.id ASC
        LIMIT 5
      `),

      query(`
        SELECT
          a.id,
          a.title,
          a.description,
          a.due_date,
          a.created_at,
          s.name AS subject_name,
          t.full_name AS teacher_name
        FROM assignments a
        LEFT JOIN class_slots cs
          ON cs.id = a.class_slot_id
        LEFT JOIN subjects s
          ON s.id = cs.subject_id
        LEFT JOIN teachers t
          ON t.id = a.teacher_id
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT 5
      `),

      query(`
        SELECT COUNT(*)::int AS total
        FROM assignments
      `),
    ]);

    const attendanceMonth = attendanceMonthResult.rows[0] || {};
    const outstanding = outstandingFeesResult.rows[0] || {};

    return res.json({
      total_students: Number(studentsResult.rows[0]?.total || 0),

      total_teachers: Number(teachersResult.rows[0]?.total || 0),

      total_staff: Number(staffResult.rows[0]?.total || 0),

      total_subjects: Number(subjectsResult.rows[0]?.total || 0),

      total_classes: Number(classSlotsResult.rows[0]?.total || 0),

      active_class_slots: Number(classSlotsResult.rows[0]?.total || 0),

      today_attendance: Number(todayAttendanceResult.rows[0]?.total || 0),

      total_fees_collected: Number(monthlyFeesResult.rows[0]?.total || 0),

      fees_collected: Number(monthlyFeesResult.rows[0]?.total || 0),

      outstanding_fees: Number(outstanding.total || 0),

      pending_fees_total: Number(outstanding.total || 0),

      pending_fees_count: Number(outstanding.count || 0),

      attendance_month: {
        present: Number(attendanceMonth.present || 0),
        absent: Number(attendanceMonth.absent || 0),
        late: Number(attendanceMonth.late || 0),
        leave: Number(attendanceMonth.leave || 0),
      },

      attendance_trend: attendanceTrendResult.rows.map((row) => ({
        date: row.date,
        present: Number(row.present || 0),
        absent: Number(row.absent || 0),
        late: Number(row.late || 0),
        leave: Number(row.leave || 0),
      })),

      recent_students: recentStudentsResult.rows,

      recent_enrollments: recentStudentsResult.rows,

      recent_payments: recentPaymentsResult.rows,

      upcoming_exams: upcomingExamsResult.rows,

      recent_assignments: assignmentsResult.rows,

      total_assignments: Number(totalAssignmentsResult.rows[0]?.total || 0),
    });
  }),
);

module.exports = router;
