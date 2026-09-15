import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/Toast";
import {
  Loader2,
  ClipboardCheck,
  Save,
  CalendarDays,
  Users,
  CheckCircle2,
  Clock3,
  XCircle,
  CalendarOff,
} from "lucide-react";

const statusConfig = {
  present: {
    label: "Present",
    active:
      "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 shadow-[0_0_18px_rgba(52,211,153,0.08)]",
    icon: CheckCircle2,
  },
  absent: {
    label: "Absent",
    active:
      "bg-red-500/15 text-red-400 border border-red-500/25 shadow-[0_0_18px_rgba(248,113,113,0.08)]",
    icon: XCircle,
  },
  late: {
    label: "Late",
    active:
      "bg-amber-500/15 text-amber-400 border border-amber-500/25 shadow-[0_0_18px_rgba(251,191,36,0.08)]",
    icon: Clock3,
  },
  leave: {
    label: "Leave",
    active: "bg-slate-500/15 text-slate-300 border border-slate-500/25",
    icon: CalendarOff,
  },
};

function PageShell({ children }) {
  return (
    <div className="relative min-h-full">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-48 left-1/2 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-[#f2bd19]/[0.025] blur-[130px]" />

        <div className="absolute -bottom-48 -right-48 h-[500px] w-[500px] rounded-full bg-[#f2bd19]/[0.018] blur-[120px]" />
      </div>

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.018]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.35) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative z-10">{children}</div>
    </div>
  );
}

function SectionCard({ children, className = "" }) {
  return (
    <div
      className={`bg-[#121519] border border-white/[0.08] rounded-2xl shadow-[0_18px_55px_rgba(0,0,0,0.22)] ${className}`}
    >
      {children}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, iconClass }) {
  return (
    <SectionCard className="p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">
            {label}
          </div>

          <div className="text-[26px] leading-none font-semibold tracking-[-0.025em] text-white mt-3">
            {value}
          </div>
        </div>

        <div
          className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${iconClass}`}
        >
          <Icon className="w-[19px] h-[19px]" />
        </div>
      </div>
    </SectionCard>
  );
}

export default function Attendance() {
  const { user } = useAuth();
  const toast = useToast();

  const canMark = ["admin", "teacher", "staff"].includes(user.role);

  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [students, setStudents] = useState([]);
  const [marks, setMarks] = useState({});
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (canMark) {
      api.get("/classes").then((r) => setClasses(r.data));
    }
  }, []);

  async function loadStudents() {
    if (!classId) return;

    setLoading(true);

    try {
      const { data: studs } = await api.get(`/students?class_id=${classId}`);

      setStudents(studs);

      const { data: att } = await api.get(
        `/attendance?class_id=${classId}&date=${date}`,
      );

      const m = {};

      att.forEach((a) => {
        m[a.student_id] = {
          status: a.status,
          remarks: a.remarks || "",
        };
      });

      studs.forEach((s) => {
        if (!m[s.id]) {
          m[s.id] = {
            status: "present",
            remarks: "",
          };
        }
      });

      setMarks(m);
    } catch (e) {
      toast.error("Failed to load attendance");
      setStudents([]);
      setMarks({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (canMark && classId) {
      loadStudents();
    }
  }, [classId, date]);

  useEffect(() => {
    if (user.role === "student") {
      api.get("/attendance").then((r) => setRecords(r.data));
    }
  }, []);

  async function submit() {
    const recs = students.map((s) => ({
      student_id: s.id,
      status: marks[s.id]?.status || "present",
      remarks: marks[s.id]?.remarks || "",
    }));

    try {
      await api.post("/attendance/mark", {
        date,
        class_id: parseInt(classId),
        records: recs,
      });

      toast.success("Attendance saved");
    } catch (e) {
      toast.error("Failed");
    }
  }

  const stats = useMemo(() => {
    const total = records.length;

    const present = records.filter((r) => r.status === "present").length;

    return {
      total,
      present,
      percent: total ? Math.round((present * 100) / total) : 0,
    };
  }, [records]);

  /*
   * =========================================================
   * STUDENT VIEW
   * =========================================================
   */

  if (!canMark) {
    return (
      <PageShell>
        <div className="space-y-6">
          {/* Page heading */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute -inset-1 rounded-xl bg-[#f2bd19]/10 blur-md" />

              <div className="relative w-11 h-11 rounded-xl bg-[#121519] border border-[#f2bd19]/20 flex items-center justify-center">
                <ClipboardCheck className="w-[19px] h-[19px] text-[#f2bd19]" />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#f2bd19] shadow-[0_0_10px_rgba(242,189,25,0.7)]" />

                <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-slate-500">
                  Attendance
                </span>
              </div>

              <h2 className="text-[23px] leading-tight font-semibold tracking-[-0.02em] text-white mt-1">
                My attendance
              </h2>

              <p className="text-[12px] text-slate-500 mt-1">
                View your attendance history and overall record
              </p>
            </div>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              label="Total days"
              value={stats.total}
              icon={CalendarDays}
              iconClass="bg-white/[0.035] border-white/[0.07] text-slate-400"
            />

            <StatCard
              label="Present"
              value={stats.present}
              icon={ClipboardCheck}
              iconClass="bg-emerald-500/10 border-emerald-500/15 text-emerald-400"
            />

            <StatCard
              label="Percentage"
              value={`${stats.percent}%`}
              icon={Users}
              iconClass="bg-[#f2bd19]/10 border-[#f2bd19]/15 text-[#f2bd19]"
            />
          </div>

          {/* History */}
          <SectionCard className="overflow-hidden">
            <div className="px-5 sm:px-6 py-5 border-b border-white/[0.07]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-white/[0.035] border border-white/[0.07] flex items-center justify-center">
                  <CalendarDays className="w-[16px] h-[16px] text-slate-400" />
                </div>

                <div>
                  <h3 className="text-[13px] font-semibold text-white">
                    Attendance history
                  </h3>

                  <p className="text-[11px] text-slate-500 mt-1">
                    Your recorded attendance
                  </p>
                </div>
              </div>
            </div>

            {records.length === 0 ? (
              <div className="p-14 text-center">
                <div className="w-12 h-12 rounded-xl bg-white/[0.035] border border-white/[0.07] text-slate-600 grid place-items-center mx-auto mb-4">
                  <ClipboardCheck className="w-5 h-5" />
                </div>

                <p className="text-[13px] font-medium text-slate-400">
                  No attendance recorded yet
                </p>

                <p className="text-[11px] text-slate-600 mt-1.5">
                  Your attendance records will appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="px-5 py-3.5 text-left text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500">
                        Date
                      </th>

                      <th className="px-5 py-3.5 text-left text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500">
                        Status
                      </th>

                      <th className="px-5 py-3.5 text-left text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500">
                        Remarks
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {records.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-white/[0.045] last:border-0 hover:bg-white/[0.018] transition-colors"
                      >
                        <td className="px-5 py-4 text-[12px] text-slate-300">
                          {new Date(r.date).toLocaleDateString()}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide ${
                              r.status === "present"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15"
                                : r.status === "absent"
                                  ? "bg-red-500/10 text-red-400 border border-red-500/15"
                                  : r.status === "late"
                                    ? "bg-amber-500/10 text-amber-400 border border-amber-500/15"
                                    : "bg-white/[0.04] text-slate-400 border border-white/[0.07]"
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-[12px] text-slate-500">
                          {r.remarks || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      </PageShell>
    );
  }

  /*
   * =========================================================
   * ADMIN / STAFF / TEACHER VIEW
   * =========================================================
   */

  return (
    <PageShell>
      <div className="space-y-6">
        {/* Page heading */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="absolute -inset-1 rounded-xl bg-[#f2bd19]/10 blur-md" />

            <div className="relative w-11 h-11 rounded-xl bg-[#121519] border border-[#f2bd19]/20 flex items-center justify-center">
              <ClipboardCheck className="w-[19px] h-[19px] text-[#f2bd19]" />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#f2bd19] shadow-[0_0_10px_rgba(242,189,25,0.7)]" />

              <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-slate-500">
                Daily records
              </span>
            </div>

            <h2 className="text-[23px] leading-tight font-semibold tracking-[-0.02em] text-white mt-1">
              Mark attendance
            </h2>

            <p className="text-[12px] text-slate-500 mt-1">
              Record daily attendance for your classes
            </p>
          </div>
        </div>

        {/* Controls */}
        <SectionCard className="relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#f2bd19]/50 to-transparent" />

          <div className="p-5">
            <div className="flex flex-col lg:flex-row lg:items-end gap-4">
              {/* Class */}
              <div className="flex-1 min-w-0">
                <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 mb-2">
                  Class
                </label>

                <div className="relative">
                  <select
                    className="w-full h-[45px] px-3.5 rounded-lg bg-[#0d1013] border border-white/[0.09] text-[12px] text-slate-200 outline-none appearance-none transition-all hover:border-white/[0.15] focus:border-[#f2bd19]/55 focus:ring-2 focus:ring-[#f2bd19]/10 cursor-pointer"
                    value={classId}
                    onChange={(e) => setClassId(e.target.value)}
                    data-testid="att-class"
                  >
                    <option value="">Select class</option>

                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>

                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-600">
                    <svg
                      className="w-4 h-4"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.51a.75.75 0 01-1.08 1.04l-4.25-4.51a.75.75 0 01.02-1.06z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Date */}
              <div className="w-full lg:w-[190px]">
                <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 mb-2">
                  Date
                </label>

                <div className="relative">
                  <CalendarDays className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[15px] h-[15px] text-slate-500 pointer-events-none" />

                  <input
                    type="date"
                    className="w-full h-[45px] pl-10 pr-3 rounded-lg bg-[#0d1013] border border-white/[0.09] text-[12px] text-slate-200 outline-none transition-all hover:border-white/[0.15] focus:border-[#f2bd19]/55 focus:ring-2 focus:ring-[#f2bd19]/10"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    data-testid="att-date"
                  />
                </div>
              </div>

              {/* Save */}
              <button
                className="group h-[45px] px-5 rounded-lg bg-[#f2bd19] hover:bg-[#e6b317] active:bg-[#d9a912] text-[#111] text-[12px] font-bold inline-flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_8px_25px_rgba(242,189,25,0.12)] hover:shadow-[0_10px_30px_rgba(242,189,25,0.2)]"
                onClick={submit}
                disabled={!classId || loading}
                data-testid="att-save"
              >
                <Save className="w-[15px] h-[15px]" />

                <span>Save attendance</span>
              </button>
            </div>
          </div>
        </SectionCard>

        {/* Attendance table */}
        <SectionCard className="overflow-hidden">
          <div className="px-5 sm:px-6 py-5 border-b border-white/[0.07] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/[0.035] border border-white/[0.07] flex items-center justify-center">
                  <Users className="w-[15px] h-[15px] text-slate-400" />
                </div>

                <h3 className="text-[13px] font-semibold text-white">
                  Student attendance
                </h3>
              </div>

              <p className="text-[11px] text-slate-500 mt-2 ml-[42px]">
                {classId
                  ? `${students.length} student${
                      students.length === 1 ? "" : "s"
                    }`
                  : "Select a class to begin"}
              </p>
            </div>

            {classId && !loading && students.length > 0 && (
              <div className="inline-flex items-center gap-2 self-start sm:self-auto px-2.5 py-1.5 rounded-md bg-white/[0.025] border border-white/[0.06] text-[10px] font-semibold text-slate-500">
                <Users className="w-[13px] h-[13px]" />
                {students.length} students
              </div>
            )}
          </div>

          {loading ? (
            <div className="p-16 grid place-items-center">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-[#f2bd19]" />

                <span className="text-[11px] text-slate-600">
                  Loading students...
                </span>
              </div>
            </div>
          ) : !classId ? (
            <div className="p-16 text-center">
              <div className="w-12 h-12 rounded-xl bg-white/[0.035] border border-white/[0.07] text-slate-600 grid place-items-center mx-auto mb-4">
                <ClipboardCheck className="w-5 h-5" />
              </div>

              <p className="text-[13px] font-medium text-slate-400">
                Select a class to start marking attendance
              </p>

              <p className="text-[11px] text-slate-600 mt-1.5">
                Choose a class and date above.
              </p>
            </div>
          ) : students.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-12 h-12 rounded-xl bg-white/[0.035] border border-white/[0.07] text-slate-600 grid place-items-center mx-auto mb-4">
                <Users className="w-5 h-5" />
              </div>

              <p className="text-[13px] font-medium text-slate-400">
                No students in this class
              </p>

              <p className="text-[11px] text-slate-600 mt-1.5">
                There are no students available for this class.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="px-5 py-3.5 text-left text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500 whitespace-nowrap">
                      Roll
                    </th>

                    <th className="px-5 py-3.5 text-left text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500 whitespace-nowrap">
                      Name
                    </th>

                    <th className="px-5 py-3.5 text-left text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500 whitespace-nowrap">
                      Status
                    </th>

                    <th className="px-5 py-3.5 text-left text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500 whitespace-nowrap">
                      Remarks
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {students.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-white/[0.045] last:border-0 hover:bg-white/[0.018] transition-colors"
                    >
                      {/* Roll */}
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center px-2 py-1 rounded-md bg-white/[0.025] border border-white/[0.06] font-mono text-[10px] text-slate-500">
                          {s.roll_number}
                        </span>
                      </td>

                      {/* Name */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-[#f2bd19]/[0.07] border border-[#f2bd19]/10 flex items-center justify-center text-[10px] font-bold text-[#f2bd19] shrink-0">
                            {s.full_name
                              ?.split(" ")
                              .map((n) => n[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>

                          <span className="text-[12px] font-medium text-slate-200">
                            {s.full_name}
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-1.5">
                          {["present", "absent", "late", "leave"].map((st) => {
                            const config = statusConfig[st];
                            const Icon = config.icon;
                            const active = marks[s.id]?.status === st;

                            return (
                              <button
                                key={st}
                                type="button"
                                onClick={() =>
                                  setMarks({
                                    ...marks,
                                    [s.id]: {
                                      ...marks[s.id],
                                      status: st,
                                    },
                                  })
                                }
                                className={`h-8 px-2.5 rounded-lg text-[10px] font-bold inline-flex items-center gap-1.5 transition-all duration-150 border ${
                                  active
                                    ? config.active
                                    : "bg-white/[0.025] border-white/[0.06] text-slate-600 hover:bg-white/[0.05] hover:text-slate-400 hover:border-white/[0.1]"
                                }`}
                              >
                                <Icon className="w-[12px] h-[12px]" />

                                {config.label}
                              </button>
                            );
                          })}
                        </div>
                      </td>

                      {/* Remarks */}
                      <td className="px-5 py-4 min-w-[230px]">
                        <input
                          className="w-full h-9 px-3 rounded-lg bg-[#0d1013] border border-white/[0.08] text-[11px] text-slate-200 placeholder:text-slate-600 outline-none transition-all hover:border-white/[0.13] focus:border-[#f2bd19]/50 focus:ring-2 focus:ring-[#f2bd19]/10"
                          placeholder="Optional"
                          value={marks[s.id]?.remarks || ""}
                          onChange={(e) =>
                            setMarks({
                              ...marks,
                              [s.id]: {
                                ...marks[s.id],
                                remarks: e.target.value,
                              },
                            })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </PageShell>
  );
}
