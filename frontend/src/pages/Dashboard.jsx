import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

import {
  Users,
  UserCheck,
  BookOpen,
  CalendarCheck,
  DollarSign,
  Wallet,
  UserPlus,
  Award,
  BarChart3,
  Search,
  GraduationCap,
  Loader2,
  Zap,
  PieChart as PieChartIcon,
  UserRoundPlus,
  LibraryBig,
} from "lucide-react";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

/* =========================================================
   PREMIUM THEME
========================================================= */

const GOLD = "#f2bd19";

const categoryColors = ["#2f6fd6", "#f2bd19", "#45a854", "#8650b8", "#d83d3d"];

/* =========================================================
   PREMIUM STAT CARD
========================================================= */

function StatCard({ icon: Icon, value, title, subtitle, iconClass }) {
  return (
    <div className="group relative overflow-hidden bg-[#121519] border border-white/[0.08] rounded-xl min-h-[116px] px-4 py-3 shadow-[0_12px_35px_rgba(0,0,0,0.22)] transition-all duration-200 hover:border-[#f2bd19]/20 hover:shadow-[0_16px_42px_rgba(0,0,0,0.30)]">
      {/* Subtle top accent */}
      <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

      {/* Hover glow */}
      <div className="absolute -top-16 -right-16 w-32 h-32 rounded-full bg-[#f2bd19]/[0.025] blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

      <div className="relative flex items-center gap-3 h-full">
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border border-white/[0.06] ${iconClass}`}
        >
          <Icon className="w-[21px] h-[21px]" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-[25px] leading-none font-semibold tracking-[-0.025em] text-white">
            {value}
          </div>

          <div className="text-[12px] font-semibold text-slate-200 mt-2 truncate">
            {title}
          </div>

          <div className="text-[10px] text-slate-500 mt-1 truncate">
            {subtitle}
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   PREMIUM SECTION CARD
========================================================= */

function SectionCard({ title, icon: Icon, children, className = "" }) {
  return (
    <div
      className={`relative bg-[#121519] border border-white/[0.08] rounded-xl shadow-[0_18px_50px_rgba(0,0,0,0.24)] overflow-hidden ${className}`}
    >
      {/* Gold ambient edge */}
      <div className="absolute -top-px left-10 right-10 h-px bg-gradient-to-r from-transparent via-[#f2bd19]/20 to-transparent pointer-events-none" />

      <div className="px-4 pt-3">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-100">
          {Icon && (
            <div className="w-7 h-7 rounded-lg bg-[#f2bd19]/[0.08] border border-[#f2bd19]/[0.12] flex items-center justify-center shrink-0">
              <Icon className="w-[15px] h-[15px] text-[#f2bd19]" />
            </div>
          )}

          <span>{title}</span>
        </div>

        <div className="h-px mt-3 mb-3 bg-gradient-to-r from-[#f2bd19]/40 via-[#f2bd19]/10 to-transparent" />
      </div>

      {children}
    </div>
  );
}

/* =========================================================
   PREMIUM QUICK ACTION
========================================================= */

function QuickAction({ icon: Icon, label, iconClass, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative h-[75px] bg-[#0d1013] border border-white/[0.08] rounded-lg hover:bg-[#15191d] hover:border-[#f2bd19]/25 hover:shadow-[0_8px_25px_rgba(0,0,0,0.22)] transition-all duration-200 flex flex-col items-center justify-center gap-1.5 overflow-hidden"
    >
      {/* Hover accent */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 group-hover:w-10 h-px bg-[#f2bd19]/60 transition-all duration-200" />

      <Icon
        className={`w-[21px] h-[21px] transition-transform duration-200 group-hover:-translate-y-0.5 ${iconClass}`}
      />

      <span className="text-[10px] text-slate-400 group-hover:text-slate-200 font-medium transition-colors">
        {label}
      </span>
    </button>
  );
}

/* =========================================================
   DARK PIE TOOLTIP
========================================================= */

function PremiumTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) {
    return null;
  }

  return (
    <div className="bg-[#0d1013] border border-white/[0.10] rounded-lg px-3 py-2 shadow-[0_15px_40px_rgba(0,0,0,0.45)]">
      <div className="text-[10px] text-slate-400">{payload[0]?.name}</div>

      <div className="text-[13px] font-semibold text-white mt-0.5">
        {payload[0]?.value}
      </div>
    </div>
  );
}

/* =========================================================
   MAIN DASHBOARD
========================================================= */

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      try {
        setLoading(true);
        setError("");

        const response = await api.get("/dashboard/stats");

        if (!mounted) return;

        setStats(response.data || {});
      } catch (err) {
        console.error("Dashboard loading failed:", err);

        if (!mounted) return;

        setStats({});
        setError(
          err?.response?.data?.error || "Unable to load dashboard data.",
        );
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      mounted = false;
    };
  }, []);

  /*
   * =======================================================
   * ADMIN / STAFF DASHBOARD
   * =======================================================
   */

  const categories = useMemo(() => {
    if (!Array.isArray(stats?.class_categories)) {
      return [];
    }

    return stats.class_categories
      .map((item) => ({
        name: item.name,
        value: Number(item.value || 0),
      }))
      .filter((item) => item.value > 0);
  }, [stats]);

  const recentEnrollments = useMemo(() => {
    if (!Array.isArray(stats?.recent_enrollments)) {
      return [];
    }

    return stats.recent_enrollments;
  }, [stats]);

  const classCategories = useMemo(() => {
    if (!Array.isArray(stats?.class_category_summary)) {
      return [];
    }

    return stats.class_category_summary;
  }, [stats]);

  /*
   * =======================================================
   * FEES
   * =======================================================
   */

  const totalFeesCollected = Number(stats?.total_fees_collected || 0);

  const outstandingFees = Number(stats?.outstanding_fees || 0);

  const totalFees = totalFeesCollected + outstandingFees;

  /*
   * =======================================================
   * ATTENDANCE
   * =======================================================
   */

  const present = Number(stats?.attendance_month?.present || 0);

  const absent = Number(stats?.attendance_month?.absent || 0);

  const late = Number(stats?.attendance_month?.late || 0);

  const attendanceTotal = present + absent + late;

  const presentPercent =
    attendanceTotal > 0 ? Math.round((present / attendanceTotal) * 100) : 0;

  const absentPercent =
    attendanceTotal > 0 ? Math.round((absent / attendanceTotal) * 100) : 0;

  const latePercent =
    attendanceTotal > 0 ? Math.round((late / attendanceTotal) * 100) : 0;

  /*
   * =======================================================
   * LOADING
   * =======================================================
   */

  if (loading) {
    return (
      <div className="min-h-[70vh] bg-[#0b0d10] flex items-center justify-center relative overflow-hidden">
        <div className="absolute top-[-220px] left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-[#f2bd19]/[0.035] blur-[120px]" />

        <div className="relative flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#121519] border border-white/[0.08] flex items-center justify-center shadow-[0_15px_45px_rgba(0,0,0,0.35)]">
            <Loader2 className="w-[18px] h-[18px] animate-spin text-[#f2bd19]" />
          </div>

          <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
            Loading workspace
          </span>
        </div>
      </div>
    );
  }

  /*
   * =======================================================
   * ERROR
   * =======================================================
   */

  if (error && !stats) {
    return (
      <div className="min-h-[70vh] bg-[#0b0d10] flex items-center justify-center relative overflow-hidden">
        <div className="absolute top-[-250px] left-1/2 -translate-x-1/2 w-[550px] h-[550px] rounded-full bg-[#f2bd19]/[0.025] blur-[130px]" />

        <div className="relative text-center max-w-sm px-6">
          <div className="w-12 h-12 mx-auto rounded-xl bg-[#121519] border border-white/[0.08] flex items-center justify-center shadow-[0_15px_45px_rgba(0,0,0,0.35)]">
            <BarChart3 className="w-5 h-5 text-[#f2bd19]" />
          </div>

          <div className="text-sm font-semibold text-white mt-4">
            Dashboard could not be loaded
          </div>

          <div className="text-xs text-slate-500 mt-1">{error}</div>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 px-4 py-2 rounded-lg bg-[#f2bd19] hover:bg-[#e6b317] text-[#111] text-[11px] font-bold transition-all shadow-[0_8px_25px_rgba(242,189,25,0.12)]"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  /*
   * =======================================================
   * TEACHER DASHBOARD
   * =======================================================
   */

  if (user?.role === "teacher") {
    return (
      <div className="min-h-full bg-[#0b0d10] -m-4 lg:-m-8 relative overflow-hidden">
        {/* Ambient background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[-280px] left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-[#f2bd19]/[0.035] blur-[140px]" />

          <div className="absolute top-1/2 right-[-300px] w-[500px] h-[500px] rounded-full bg-white/[0.012] blur-[120px]" />
        </div>

        {/* Grid */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.025]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.35) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        <div className="relative px-3 sm:px-4 lg:px-5 py-4">
          <div className="mb-5">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#f2bd19] shadow-[0_0_10px_rgba(242,189,25,0.8)]" />

              <span className="text-[10px] uppercase tracking-[0.2em] font-semibold text-slate-500">
                Administration Workspace
              </span>
            </div>

            <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-white mt-2">
              Teacher Overview
            </h1>

            <p className="text-[11px] text-slate-500 mt-1">
              Your current classes, students, assignments and notices.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            <StatCard
              icon={BookOpen}
              value={stats?.my_classes || 0}
              title="My Classes"
              subtitle="Assigned Classes"
              iconClass="bg-[#2f6fd6]/10 text-[#4f88e8]"
            />

            <StatCard
              icon={Users}
              value={stats?.my_students || 0}
              title="My Students"
              subtitle="Students in My Classes"
              iconClass="bg-[#f2bd19]/10 text-[#f2bd19]"
            />

            <StatCard
              icon={GraduationCap}
              value={stats?.my_assignments || 0}
              title="My Assignments"
              subtitle="Created Assignments"
              iconClass="bg-[#45a854]/10 text-[#55bc64]"
            />

            <StatCard
              icon={BarChart3}
              value={stats?.my_notices || 0}
              title="My Notices"
              subtitle="Created Notices"
              iconClass="bg-[#8650b8]/10 text-[#9a63ca]"
            />
          </div>
        </div>
      </div>
    );
  }

  /*
   * =======================================================
   * STUDENT DASHBOARD
   * =======================================================
   */

  if (user?.role === "student") {
    return (
      <div className="min-h-full bg-[#0b0d10] -m-4 lg:-m-8 relative overflow-hidden">
        {/* Ambient background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[-280px] left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-[#f2bd19]/[0.035] blur-[140px]" />

          <div className="absolute bottom-[-350px] right-[-200px] w-[650px] h-[650px] rounded-full bg-[#f2bd19]/[0.018] blur-[130px]" />
        </div>

        {/* Grid */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.025]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.35) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        <div className="relative px-3 sm:px-4 lg:px-5 py-4">
          <div className="mb-5">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#f2bd19] shadow-[0_0_10px_rgba(242,189,25,0.8)]" />

              <span className="text-[10px] uppercase tracking-[0.2em] font-semibold text-slate-500">
                Administration Workspace
              </span>
            </div>

            <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-white mt-2">
              Overview
            </h1>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            <StatCard
              icon={CalendarCheck}
              value={`${stats?.attendance_percentage || 0}%`}
              title="Attendance"
              subtitle="Overall Attendance"
              iconClass="bg-[#45a854]/10 text-[#55bc64]"
            />

            <StatCard
              icon={Wallet}
              value={`$ ${Number(stats?.fees_due || 0).toLocaleString()}`}
              title="Fees Due"
              subtitle="Outstanding Balance"
              iconClass="bg-[#d83d3d]/10 text-[#e45656]"
            />

            <StatCard
              icon={DollarSign}
              value={`$ ${Number(stats?.fees_paid || 0).toLocaleString()}`}
              title="Fees Paid"
              subtitle="Total Payments"
              iconClass="bg-[#f2bd19]/10 text-[#f2bd19]"
            />

            <StatCard
              icon={BookOpen}
              value={stats?.total_assignments || 0}
              title="Assignments"
              subtitle="Available Assignments"
              iconClass="bg-[#2f6fd6]/10 text-[#4f88e8]"
            />
          </div>
        </div>
      </div>
    );
  }

  /*
   * =======================================================
   * ADMIN / STAFF DASHBOARD
   * =======================================================
   */

  return (
    <div className="min-h-full bg-[#0b0d10] -m-4 lg:-m-8 relative overflow-hidden">
      {/* =====================================================
          BACKGROUND AMBIENCE
      ===================================================== */}

      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-300px] left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full bg-[#f2bd19]/[0.04] blur-[150px]" />

        <div className="absolute bottom-[-400px] right-[-250px] w-[700px] h-[700px] rounded-full bg-[#f2bd19]/[0.018] blur-[140px]" />

        <div className="absolute top-1/2 left-[-350px] w-[550px] h-[550px] rounded-full bg-white/[0.012] blur-[130px]" />
      </div>

      {/* Fine grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.35) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative px-3 sm:px-4 lg:px-5 py-4">
        {/* ===================================================
            HEADER
        =================================================== */}

        <div className="flex items-end justify-between mb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#f2bd19] shadow-[0_0_10px_rgba(242,189,25,0.8)]" />

              <span className="text-[10px] uppercase tracking-[0.22em] font-semibold text-slate-500">
                Administrator Portal
              </span>
            </div>

            <h1 className="text-[22px] sm:text-[24px] leading-tight font-semibold tracking-[-0.025em] text-white mt-2">
              Dashboard
            </h1>

            <p className="text-[11px] text-slate-500 mt-1">
              Overview of your administration workspace.
            </p>
          </div>

          <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg bg-[#121519] border border-white/[0.07]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#45a854] shadow-[0_0_8px_rgba(69,168,84,0.6)]" />

            <span className="text-[10px] text-slate-500">
              System operational
            </span>
          </div>
        </div>

        {/* ===================================================
            SIX STATISTICS
        =================================================== */}

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-3">
          <StatCard
            icon={Users}
            value={Number(stats?.total_students || 0)}
            title="Total Students"
            subtitle="View all students"
            iconClass="bg-[#f2bd19]/10 text-[#f2bd19]"
          />

          <StatCard
            icon={UserCheck}
            value={Number(stats?.active_students || 0)}
            title="Active Students"
            subtitle="Currently Enrolled"
            iconClass="bg-[#45a854]/10 text-[#55bc64]"
          />

          <StatCard
            icon={BookOpen}
            value={Number(stats?.total_classes || 0)}
            title="Total Classes"
            subtitle="All Classes"
            iconClass="bg-[#2f6fd6]/10 text-[#4f88e8]"
          />

          <StatCard
            icon={CalendarCheck}
            value={Number(stats?.today_attendance || 0)}
            title="Today's Attendance"
            subtitle="Present Today"
            iconClass="bg-[#8650b8]/10 text-[#9a63ca]"
          />

          <StatCard
            icon={DollarSign}
            value={`${totalFeesCollected.toLocaleString()} AFG`}
            title="Total Fees Collected"
            subtitle="This Month"
            iconClass="lucide-banknote bg-[#45a854]/10 text-[#55bc64]"
          />

          <StatCard
            icon={Wallet}
            value={` ${outstandingFees.toLocaleString()} AFG`}
            title="Outstanding Fees"
            subtitle="Pending Payments"
            iconClass="lucide-banknote bg-[#45a854]/10 text-[#55bc64]"
          />
        </div>

        {/* ===================================================
            MIDDLE ROW
        =================================================== */}

        <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr_1.05fr] gap-3 mb-3">
          {/* =================================================
              QUICK ACTIONS
          ================================================= */}

          <SectionCard title="Quick Actions" icon={Zap}>
            <div className="grid grid-cols-3 gap-2 px-3 pb-3">
              <QuickAction
                icon={UserPlus}
                label="Add New Student"
                iconClass="text-[#f2bd19]"
                onClick={() => navigate("/app/students")}
              />

              <QuickAction
                icon={BookOpen}
                label="Add New Class"
                iconClass="text-[#4f88e8]"
                onClick={() => navigate("/app/classes")}
              />

              <QuickAction
                icon={UserRoundPlus}
                label="Enroll Student"
                iconClass="text-[#55bc64]"
                onClick={() => navigate("/app/students")}
              />

              <QuickAction
                icon={DollarSign}
                label="Record Payment"
                iconClass="text-[#55bc64]"
                onClick={() => navigate("/app/fees")}
              />

              <QuickAction
                icon={CalendarCheck}
                label="Take Attendance"
                iconClass="text-[#9a63ca]"
                onClick={() => navigate("/app/attendance")}
              />

              <QuickAction
                icon={GraduationCap}
                label="Add Teacher"
                iconClass="text-[#f2bd19]"
                onClick={() => navigate("/app/users")}
              />

              <QuickAction
                icon={Award}
                label="Issue Certificate"
                iconClass="text-[#4f88e8]"
                onClick={() => navigate("/app/exams")}
              />

              <QuickAction
                icon={BarChart3}
                label="View Reports"
                iconClass="text-[#e45656]"
                onClick={() => navigate("/app/exams")}
              />

              <QuickAction
                icon={Search}
                label="Search Records"
                iconClass="text-[#45b5b5]"
                onClick={() => navigate("/app/students")}
              />
            </div>
          </SectionCard>

          {/* =================================================
              STUDENTS BY CLASS CATEGORY
          ================================================= */}

          <SectionCard title="Students by Class Category" icon={PieChartIcon}>
            {categories.length > 0 ? (
              <>
                <div className="h-[220px] px-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categories}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="45%"
                        innerRadius={38}
                        outerRadius={82}
                        paddingAngle={2}
                        label={({ value }) => value}
                        labelLine={false}
                        stroke="#121519"
                        strokeWidth={2}
                      >
                        {categories.map((entry, index) => (
                          <Cell
                            key={`category-${index}`}
                            fill={categoryColors[index % categoryColors.length]}
                          />
                        ))}
                      </Pie>

                      <Tooltip content={<PremiumTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-5 pb-4">
                  {categories.map((item, index) => (
                    <div
                      key={item.name}
                      className="flex items-center gap-2 text-[10px] text-slate-500"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-[3px] shrink-0 shadow-[0_0_8px_rgba(255,255,255,0.04)]"
                        style={{
                          backgroundColor:
                            categoryColors[index % categoryColors.length],
                        }}
                      />

                      <span className="truncate">{item.name}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-[264px] flex items-center justify-center px-4 text-center">
                <div>
                  <div className="w-9 h-9 mx-auto rounded-lg bg-[#0d1013] border border-white/[0.07] flex items-center justify-center mb-3">
                    <PieChartIcon className="w-4 h-4 text-slate-600" />
                  </div>

                  <div className="text-sm font-medium text-slate-400">
                    No class data
                  </div>

                  <div className="text-[11px] text-slate-600 mt-1 max-w-[230px]">
                    Student class information will appear here when it exists in
                    the database.
                  </div>
                </div>
              </div>
            )}
          </SectionCard>

          {/* =================================================
              RECENT ENROLLMENTS
          ================================================= */}

          <SectionCard title="Recent Enrollments" icon={UserPlus}>
            <div className="px-3 pb-3">
              <div className="grid grid-cols-[1.1fr_1.3fr_0.65fr] px-2 py-2 text-[9px] uppercase tracking-[0.06em] font-semibold text-slate-500 border-b border-white/[0.07]">
                <span>Student Name</span>
                <span>Class</span>
                <span className="text-right">Date</span>
              </div>

              <div>
                {recentEnrollments.length > 0 ? (
                  recentEnrollments.slice(0, 5).map((student) => (
                    <div
                      key={student.id}
                      className="grid grid-cols-[1.1fr_1.3fr_0.65fr] px-2 py-[8px] text-[10px] text-slate-400 border-b border-white/[0.045] hover:bg-white/[0.015] transition-colors"
                    >
                      <span className="truncate">{student.name || "-"}</span>

                      <span className="truncate text-slate-500">
                        {student.class_name || "-"}
                      </span>

                      <span className="text-right text-slate-600">
                        {student.date || "-"}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center text-[11px] text-slate-600">
                    No student enrollments found.
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => navigate("/app/students")}
                className="block mx-auto mt-3 px-5 py-1.5 border border-white/[0.09] rounded-lg text-[10px] font-medium bg-[#0d1013] text-slate-400 hover:text-white hover:border-[#f2bd19]/25 hover:bg-[#15191d] transition-all"
              >
                View All Enrollments
              </button>
            </div>
          </SectionCard>
        </div>

        {/* ===================================================
            BOTTOM ROW
        =================================================== */}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* =================================================
              FEE COLLECTION
          ================================================= */}

          <SectionCard
            title="Fee Collection Overview (This Month)"
            icon={DollarSign}
          >
            <div className="px-4 pb-4">
              <div className="grid grid-cols-[70px_1fr_75px] items-center gap-2 py-2">
                <span className="text-[10px] font-medium text-slate-500">
                  Collected
                </span>

                <div className="h-[7px] bg-[#0d1013] border border-white/[0.05] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#45a854] shadow-[0_0_10px_rgba(69,168,84,0.25)]"
                    style={{
                      width:
                        totalFees > 0
                          ? `${Math.min(
                              100,
                              (totalFeesCollected / totalFees) * 100,
                            )}%`
                          : "0%",
                    }}
                  />
                </div>

                <span className="text-[10px] text-right font-medium text-slate-300">
                  $ {totalFeesCollected.toLocaleString()}
                </span>
              </div>

              <div className="grid grid-cols-[70px_1fr_75px] items-center gap-2 py-2">
                <span className="text-[10px] font-medium text-slate-500">
                  Outstanding
                </span>

                <div className="h-[7px] bg-[#0d1013] border border-white/[0.05] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#d83d3d] shadow-[0_0_10px_rgba(216,61,61,0.22)]"
                    style={{
                      width:
                        totalFees > 0
                          ? `${Math.min(
                              100,
                              (outstandingFees / totalFees) * 100,
                            )}%`
                          : "0%",
                    }}
                  />
                </div>

                <span className="text-[10px] text-right font-medium text-slate-300">
                  $ {outstandingFees.toLocaleString()}
                </span>
              </div>

              <div className="border-t border-white/[0.07] mt-2 pt-3 grid grid-cols-[70px_1fr_75px]">
                <span className="text-[10px] font-semibold text-slate-300">
                  Total
                </span>

                <span />

                <span className="text-[10px] text-right font-semibold text-white">
                  $ {totalFees.toLocaleString()}
                </span>
              </div>
            </div>
          </SectionCard>

          {/* =================================================
              ATTENDANCE
          ================================================= */}

          <SectionCard
            title="Attendance Overview (This Month)"
            icon={CalendarCheck}
          >
            <div className="grid grid-cols-3 gap-2 px-3 pb-4">
              <div className="group border border-[#45a854]/15 bg-[#0d1013] rounded-lg text-center py-5 hover:border-[#45a854]/30 transition-colors">
                <div className="text-[10px] text-[#55bc64] font-semibold uppercase tracking-[0.04em]">
                  Present
                </div>

                <div className="text-[21px] font-semibold text-white mt-2">
                  {present}
                </div>

                <div className="text-[13px] font-medium text-[#55bc64] mt-1">
                  {presentPercent}%
                </div>
              </div>

              <div className="group border border-[#d83d3d]/15 bg-[#0d1013] rounded-lg text-center py-5 hover:border-[#d83d3d]/30 transition-colors">
                <div className="text-[10px] text-[#e45656] font-semibold uppercase tracking-[0.04em]">
                  Absent
                </div>

                <div className="text-[21px] font-semibold text-white mt-2">
                  {absent}
                </div>

                <div className="text-[13px] font-medium text-[#e45656] mt-1">
                  {absentPercent}%
                </div>
              </div>

              <div className="group border border-[#f2bd19]/15 bg-[#0d1013] rounded-lg text-center py-5 hover:border-[#f2bd19]/30 transition-colors">
                <div className="text-[10px] text-[#f2bd19] font-semibold uppercase tracking-[0.04em]">
                  Late
                </div>

                <div className="text-[21px] font-semibold text-white mt-2">
                  {late}
                </div>

                <div className="text-[13px] font-medium text-[#f2bd19] mt-1">
                  {latePercent}%
                </div>
              </div>
            </div>
          </SectionCard>

          {/* =================================================
              CLASS CATEGORIES
          ================================================= */}

          <SectionCard title="Class Categories" icon={LibraryBig}>
            <div className="px-4 pb-3">
              {classCategories.length > 0 ? (
                classCategories.map((item, index) => (
                  <div
                    key={`${item.name}-${index}`}
                    className="flex justify-between items-center py-[6px] text-[10px] border-b border-white/[0.045] last:border-0"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            categoryColors[index % categoryColors.length],
                        }}
                      />

                      <span className="text-slate-400 truncate pr-3">
                        {item.name}
                      </span>
                    </div>

                    <span className="text-slate-600 shrink-0">
                      {Number(item.classes || 0)}{" "}
                      {Number(item.classes || 0) === 1 ? "Class" : "Classes"}
                    </span>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-[11px] text-slate-600">
                  No classes found.
                </div>
              )}

              <button
                type="button"
                onClick={() => navigate("/app/classes")}
                className="block mx-auto mt-3 mb-1 px-6 py-1.5 border border-white/[0.09] rounded-lg text-[10px] font-medium bg-[#0d1013] text-slate-400 hover:text-white hover:border-[#f2bd19]/25 hover:bg-[#15191d] transition-all"
              >
                Manage Classes
              </button>
            </div>
          </SectionCard>
        </div>

        {/* ===================================================
            FOOTER
        =================================================== */}

        <div className="text-center pt-7 pb-2">
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="h-px w-10 bg-white/[0.07]" />

            <div className="w-1 h-1 rounded-full bg-[#f2bd19]/60 shadow-[0_0_7px_rgba(242,189,25,0.35)]" />

            <div className="h-px w-10 bg-white/[0.07]" />
          </div>

          <p className="text-[10px] text-slate-600">
            © 2026 — All rights reserved.
          </p>

          <p className="text-[11px] text-slate-500 mt-1.5">
            Made by{" "}
            <span className="font-semibold text-slate-400">
              Teacher Ayman Najman
            </span>{" "}
            <span className="text-[#f2bd19]/80">“Batman”</span>{" "}
            <span className="opacity-80">🦇</span>
          </p>
        </div>
      </div>
    </div>
  );
}
