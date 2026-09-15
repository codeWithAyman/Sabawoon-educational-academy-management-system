import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/Toast";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  Loader2,
  GraduationCap,
  RefreshCw,
  UserRound,
  Users,
  UserCheck,
  Phone,
  Hash,
  BookOpen,
  CalendarDays,
  MapPin,
  UserRoundCheck,
  ChevronDown,
  Clock3,
  UserPlus,
  Check,
  AlertCircle,
  Mail,
} from "lucide-react";

export default function Students() {
  const { user } = useAuth();
  const toast = useToast();

  const canEdit = ["admin", "staff"].includes(user?.role);
  const canDelete = user?.role === "admin";

  const [students, setStudents] = useState([]);
  const [classSlots, setClassSlots] = useState([]);

  const [search, setSearch] = useState("");
  const [slotFilter, setSlotFilter] = useState("");

  const [loadingStudents, setLoadingStudents] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(true);

  const [studentsError, setStudentsError] = useState("");
  const [modal, setModal] = useState(null);

  async function loadStudents(searchValue = search) {
    try {
      setLoadingStudents(true);
      setStudentsError("");

      const trimmedSearch = String(searchValue || "").trim();

      const response = await api.get("/students", {
        params: trimmedSearch ? { search: trimmedSearch } : {},
      });

      if (!Array.isArray(response.data)) {
        throw new Error("Invalid students response from server.");
      }

      setStudents(response.data);
    } catch (error) {
      console.error("Failed to load students:", error);

      setStudents([]);

      setStudentsError(
        error.response?.data?.error ||
          error.message ||
          "Unable to load students from the database.",
      );
    } finally {
      setLoadingStudents(false);
    }
  }

  async function loadClassSlots() {
    try {
      setLoadingSlots(true);

      const response = await api.get("/classes");

      if (!Array.isArray(response.data)) {
        throw new Error("Invalid class slots response from server.");
      }

      setClassSlots(response.data);
    } catch (error) {
      console.error("Failed to load class slots:", error);

      setClassSlots([]);

      toast.error(
        error.response?.data?.error ||
          error.message ||
          "Unable to load subjects and class slots.",
      );
    } finally {
      setLoadingSlots(false);
    }
  }

  useEffect(() => {
    loadClassSlots();
    loadStudents("");
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadStudents(search);
    }, 350);

    return () => clearTimeout(timer);
  }, [search]);

  async function saveStudent(form, enrollmentIds, originalEnrollmentIds) {
    try {
      let studentId;

      if (modal?.id) {
        const response = await api.put(`/students/${modal.id}`, form);

        studentId =
          response.data?.id ||
          response.data?.student?.id ||
          response.data?.student_id ||
          modal.id;
      } else {
        const response = await api.post("/students", form);

        studentId =
          response.data?.id ||
          response.data?.student?.id ||
          response.data?.student_id;
      }

      if (!studentId) {
        throw new Error(
          "Student was saved, but the server did not return the student ID.",
        );
      }

      const original = new Set([...originalEnrollmentIds].map(String));

      const current = new Set([...enrollmentIds].map(String));

      const additions = [...current].filter((id) => !original.has(id));

      const removals = [...original].filter((id) => !current.has(id));

      for (const classSlotId of additions) {
        await api.post(`/students/${studentId}/classes`, {
          class_slot_id: Number(classSlotId),
        });
      }

      for (const classSlotId of removals) {
        await api.delete(`/students/${studentId}/classes/${classSlotId}`);
      }

      if (modal?.id) {
        toast.success("Student updated successfully.");
      } else {
        toast.success("Student created successfully.");
      }

      setModal(null);
      await loadStudents();

      return studentId;
    } catch (error) {
      console.error("Failed to save student:", error);

      toast.error(
        error.response?.data?.error ||
          error.message ||
          "Unable to save student.",
      );

      throw error;
    }
  }

  async function deleteStudent(student) {
    const name = student?.full_name || student?.roll_number || "this student";

    const confirmed = window.confirm(
      `Delete ${name}?\n\nThis will also remove the student's enrollments and related records. This action cannot be undone.`,
    );

    if (!confirmed) return;

    try {
      await api.delete(`/students/${student.id}`);

      toast.success("Student deleted successfully.");

      await loadStudents();
    } catch (error) {
      console.error("Failed to delete student:", error);

      toast.error(
        error.response?.data?.error ||
          error.message ||
          "Unable to delete student.",
      );
    }
  }

  function formatDate(value) {
    if (!value) return "-";

    const raw = String(value).slice(0, 10);

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [year, month, day] = raw.split("-").map(Number);
      const date = new Date(year, month - 1, day);

      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
      }
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "-";

    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function formatTime(value) {
    if (!value) return "-";

    const text = String(value).slice(0, 5);
    const [hourString, minute = "00"] = text.split(":");

    const hour = Number(hourString);

    if (Number.isNaN(hour)) return text;

    const suffix = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;

    return `${displayHour}:${minute} ${suffix}`;
  }

  function slotLabel(slot) {
    const subject = slot?.subject_name || "Unknown Subject";

    const start = formatTime(slot?.start_time);
    const end = formatTime(slot?.end_time);

    return `${subject} • ${start}–${end}`;
  }

  const selectedFilterSlot = useMemo(() => {
    return classSlots.find((item) => String(item.id) === String(slotFilter));
  }, [classSlots, slotFilter]);

  const filteredStudents = useMemo(() => {
    if (!slotFilter) return students;

    return students.filter((student) => {
      const enrollments = Array.isArray(student.enrolled_classes)
        ? student.enrolled_classes
        : Array.isArray(student.enrolled_slots)
          ? student.enrolled_slots
          : Array.isArray(student.class_slots)
            ? student.class_slots
            : [];

      return enrollments.some(
        (item) =>
          String(item.id) === String(slotFilter) ||
          String(item.class_slot_id) === String(slotFilter),
      );
    });
  }, [students, slotFilter]);

  const totalStudents = filteredStudents.length;

  const activeStudents = filteredStudents.filter(
    (student) =>
      student.status === "active" ||
      student.is_active === true ||
      student.is_active === 1 ||
      student.status == null,
  ).length;

  const enrolledStudents = filteredStudents.filter((student) => {
    const enrollments = Array.isArray(student.enrolled_classes)
      ? student.enrolled_classes
      : Array.isArray(student.enrolled_slots)
        ? student.enrolled_slots
        : Array.isArray(student.class_slots)
          ? student.class_slots
          : [];

    return enrollments.length > 0;
  }).length;

  return (
    <div className="min-h-full bg-[#0b0d10] text-white -m-4 lg:-m-6 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-220px] right-[5%] w-[500px] h-[500px] rounded-full bg-[#f2bd19]/[0.035] blur-[130px]" />

        <div className="absolute bottom-[-280px] left-[-150px] w-[500px] h-[500px] rounded-full bg-white/[0.012] blur-[120px]" />

        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.35) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      <div className="relative z-10 px-4 sm:px-5 lg:px-6 py-5 space-y-5">
        {/* Header */}
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-[#f2bd19]/10 border border-[#f2bd19]/15 flex items-center justify-center">
                <Users className="w-[14px] h-[14px] text-[#f2bd19]" />
              </div>

              <span className="text-[10px] uppercase tracking-[0.22em] font-semibold text-slate-500">
                Administration
              </span>
            </div>

            <h1 className="text-[25px] sm:text-[28px] font-semibold tracking-[-0.025em] text-white">
              Students
            </h1>

            <p className="text-[12px] text-slate-500 mt-1.5">
              Manage student records and subject-based enrollment.
            </p>
          </div>

          {canEdit && (
            <button
              onClick={() => setModal({})}
              className="h-[43px] px-4 rounded-lg bg-[#f2bd19] hover:bg-[#e6b317] active:bg-[#d9a912] text-[#111] text-[12px] font-bold inline-flex items-center justify-center gap-2 transition-all shadow-[0_8px_25px_rgba(242,189,25,0.12)] hover:shadow-[0_10px_30px_rgba(242,189,25,0.2)]"
            >
              <Plus className="w-[16px] h-[16px]" />
              Add Student
            </button>
          )}
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SummaryCard
            icon={Users}
            title="Total Students"
            value={totalStudents}
            accent="#f2bd19"
          />

          <SummaryCard
            icon={UserCheck}
            title="Active Records"
            value={activeStudents}
            accent="#45a854"
          />

          <SummaryCard
            icon={GraduationCap}
            title="Enrolled Students"
            value={enrolledStudents}
            accent="#2f6fd6"
          />
        </div>

        {/* Filters */}
        <div className="relative bg-[#121519] border border-white/[0.08] rounded-xl shadow-[0_18px_50px_rgba(0,0,0,0.22)] overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#f2bd19]/35 to-transparent" />

          <div className="p-3.5 sm:p-4">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px_auto] gap-3">
              <div className="relative group">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[16px] h-[16px] text-slate-500 group-focus-within:text-[#f2bd19] transition-colors pointer-events-none" />

                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, phone, or roll number..."
                  className="w-full h-[44px] pl-10 pr-4 rounded-lg bg-[#0d1013] border border-white/[0.09] text-[12px] text-slate-100 placeholder:text-slate-600 outline-none transition-all hover:border-white/[0.15] focus:border-[#f2bd19]/55 focus:ring-2 focus:ring-[#f2bd19]/10"
                />
              </div>

              <div className="relative">
                <BookOpen className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[15px] h-[15px] text-slate-500 pointer-events-none z-10" />

                <select
                  value={slotFilter}
                  onChange={(e) => setSlotFilter(e.target.value)}
                  disabled={loadingSlots}
                  className="w-full h-[44px] pl-10 pr-9 rounded-lg bg-[#0d1013] border border-white/[0.09] text-[12px] text-slate-300 outline-none appearance-none cursor-pointer transition-all hover:border-white/[0.15] focus:border-[#f2bd19]/55 focus:ring-2 focus:ring-[#f2bd19]/10 disabled:opacity-50"
                >
                  <option value="" className="bg-[#121519]">
                    All subjects & time slots
                  </option>

                  {classSlots.map((slot) => (
                    <option
                      key={slot.id}
                      value={slot.id}
                      className="bg-[#121519]"
                    >
                      {slotLabel(slot)}
                    </option>
                  ))}
                </select>

                <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-[14px] h-[14px] text-slate-500 pointer-events-none" />
              </div>

              <button
                onClick={() => {
                  setSearch("");
                  setSlotFilter("");
                }}
                className="h-[44px] px-4 rounded-lg bg-[#0d1013] border border-white/[0.09] text-slate-400 hover:text-white hover:border-white/[0.16] text-[12px] font-medium inline-flex items-center justify-center gap-2 transition-all"
              >
                <RefreshCw className="w-[14px] h-[14px]" />
                Reset
              </button>
            </div>

            {(search || slotFilter) && (
              <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-white/[0.06]">
                <span className="text-[10px] text-slate-600 uppercase tracking-wider">
                  Filter
                </span>

                {search && (
                  <span className="px-2.5 py-1 rounded-md bg-[#f2bd19]/[0.08] border border-[#f2bd19]/15 text-[10px] text-[#f2bd19]">
                    “{search}”
                  </span>
                )}

                {selectedFilterSlot && (
                  <span className="px-2.5 py-1 rounded-md bg-white/[0.035] border border-white/[0.07] text-[10px] text-slate-400">
                    {slotLabel(selectedFilterSlot)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Error */}
        {studentsError && (
          <div className="bg-[#d83d3d]/[0.07] border border-[#d83d3d]/20 rounded-xl px-4 py-3 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-red-300 shrink-0 mt-0.5" />

            <div>
              <p className="text-[12px] text-red-300">{studentsError}</p>

              <button
                onClick={() => loadStudents()}
                className="text-[10px] text-red-200 underline mt-1"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Directory */}
        <div className="bg-[#121519] border border-white/[0.08] rounded-xl shadow-[0_18px_50px_rgba(0,0,0,0.22)] overflow-hidden">
          <div className="h-[2px] w-full bg-[#f2bd19]" />

          <div className="px-4 sm:px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
            <div>
              <h2 className="text-[13px] font-semibold text-white">
                Student Directory
              </h2>

              <p className="text-[10px] text-slate-600 mt-1">
                {loadingStudents
                  ? "Loading student records..."
                  : `${filteredStudents.length} student${
                      filteredStudents.length === 1 ? "" : "s"
                    } found`}
              </p>
            </div>

            {loadingStudents && (
              <Loader2 className="w-4 h-4 text-[#f2bd19] animate-spin" />
            )}
          </div>

          {loadingStudents ? (
            <div className="py-16 flex flex-col items-center justify-center">
              <div className="w-10 h-10 rounded-xl bg-[#f2bd19]/[0.07] border border-[#f2bd19]/15 flex items-center justify-center mb-3">
                <Loader2 className="w-5 h-5 text-[#f2bd19] animate-spin" />
              </div>

              <p className="text-[12px] text-slate-500">Loading students...</p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center px-5">
              <div className="w-12 h-12 rounded-xl bg-white/[0.025] border border-white/[0.07] flex items-center justify-center mb-4">
                <UserRound className="w-5 h-5 text-slate-600" />
              </div>

              <p className="text-[13px] font-medium text-slate-300">
                No students found
              </p>

              <p className="text-[11px] text-slate-600 mt-1 text-center max-w-[320px]">
                Try changing your search or subject/time-slot filter.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-[#0d1013]/60">
                    <th className="px-5 py-3 text-left text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                      Student
                    </th>

                    <th className="px-4 py-3 text-left text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                      Roll Number
                    </th>

                    <th className="px-4 py-3 text-left text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                      Subjects / Time Slots
                    </th>

                    <th className="px-4 py-3 text-left text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                      Phone
                    </th>

                    <th className="px-4 py-3 text-left text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                      Date of Birth
                    </th>

                    {(canEdit || canDelete) && (
                      <th className="px-5 py-3 text-right text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>

                <tbody>
                  {filteredStudents.map((student) => {
                    const enrollments = Array.isArray(student.enrolled_classes)
                      ? student.enrolled_classes
                      : Array.isArray(student.enrolled_slots)
                        ? student.enrolled_slots
                        : Array.isArray(student.class_slots)
                          ? student.class_slots
                          : [];

                    const displayName =
                      student.full_name ||
                      student.roll_number ||
                      "Unnamed Student";

                    return (
                      <tr
                        key={student.id}
                        className="border-b border-white/[0.045] last:border-b-0 hover:bg-white/[0.018] transition-colors"
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-[#f2bd19]/[0.08] border border-[#f2bd19]/15 flex items-center justify-center shrink-0">
                              <span className="text-[12px] font-bold text-[#f2bd19]">
                                {displayName.trim().charAt(0).toUpperCase()}
                              </span>
                            </div>

                            <div className="min-w-0">
                              <p className="text-[12px] font-semibold text-slate-200 truncate">
                                {displayName}
                              </p>

                              {student.gender && (
                                <p className="text-[10px] text-slate-600 mt-0.5 capitalize">
                                  {student.gender}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          <span className="text-[11px] text-slate-400">
                            {student.roll_number || "-"}
                          </span>
                        </td>

                        <td className="px-4 py-3.5">
                          {enrollments.length === 0 ? (
                            <span className="text-[10px] text-slate-600">
                              No enrollment
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5 max-w-[360px]">
                              {enrollments.slice(0, 3).map((item, index) => {
                                const subject =
                                  item.subject_name || item.name || "Subject";

                                const start =
                                  item.start_time || item.class_start_time;

                                const end =
                                  item.end_time || item.class_end_time;

                                return (
                                  <span
                                    key={
                                      item.id ||
                                      item.class_slot_id ||
                                      `${subject}-${index}`
                                    }
                                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#f2bd19]/[0.055] border border-[#f2bd19]/10 text-[9px] text-slate-400"
                                  >
                                    <BookOpen className="w-3 h-3 text-[#f2bd19]" />

                                    <span className="text-slate-300">
                                      {subject}
                                    </span>

                                    {start && end && (
                                      <span className="text-slate-600">
                                        {formatTime(start)}–{formatTime(end)}
                                      </span>
                                    )}
                                  </span>
                                );
                              })}

                              {enrollments.length > 3 && (
                                <span className="px-2 py-1 rounded-md bg-white/[0.025] border border-white/[0.06] text-[9px] text-slate-600">
                                  +{enrollments.length - 3} more
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3.5">
                          <span className="text-[11px] text-slate-400">
                            {student.phone || "-"}
                          </span>
                        </td>

                        <td className="px-4 py-3.5">
                          <span className="text-[11px] text-slate-500">
                            {formatDate(student.dob)}
                          </span>
                        </td>

                        {(canEdit || canDelete) && (
                          <td className="px-5 py-3.5">
                            <div className="flex items-center justify-end gap-1.5">
                              {canEdit && (
                                <button
                                  onClick={() => setModal(student)}
                                  className="w-8 h-8 rounded-lg bg-white/[0.025] border border-white/[0.07] text-slate-500 hover:text-[#f2bd19] hover:border-[#f2bd19]/25 hover:bg-[#f2bd19]/[0.05] inline-flex items-center justify-center transition-all"
                                  title="Edit student and enrollment"
                                >
                                  <Pencil className="w-[13px] h-[13px]" />
                                </button>
                              )}

                              {canDelete && (
                                <button
                                  onClick={() => deleteStudent(student)}
                                  className="w-8 h-8 rounded-lg bg-white/[0.025] border border-white/[0.07] text-slate-500 hover:text-[#d83d3d] hover:border-[#d83d3d]/25 hover:bg-[#d83d3d]/[0.05] inline-flex items-center justify-center transition-all"
                                  title="Delete student"
                                >
                                  <Trash2 className="w-[13px] h-[13px]" />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {modal && (
        <StudentModal
          classSlots={classSlots}
          initial={modal}
          onClose={() => setModal(null)}
          onSave={saveStudent}
          canEdit={canEdit}
          formatTime={formatTime}
        />
      )}
    </div>
  );
}

/* =========================================================
   SUMMARY CARD
========================================================= */

function SummaryCard({ icon: Icon, title, value, accent }) {
  return (
    <div className="relative bg-[#121519] border border-white/[0.08] rounded-xl p-4 overflow-hidden shadow-[0_15px_40px_rgba(0,0,0,0.18)]">
      <div
        className="absolute top-0 left-0 w-[2px] h-full opacity-70"
        style={{ backgroundColor: accent }}
      />

      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] uppercase tracking-[0.13em] font-semibold text-slate-600">
            {title}
          </p>

          <p className="text-[24px] leading-none font-semibold text-white mt-2">
            {value}
          </p>
        </div>

        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center border"
          style={{
            backgroundColor: `${accent}10`,
            borderColor: `${accent}20`,
          }}
        >
          <Icon className="w-[16px] h-[16px]" style={{ color: accent }} />
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   STUDENT MODAL
========================================================= */

function StudentModal({
  classSlots,
  initial,
  onClose,
  onSave,
  canEdit,
  formatTime,
}) {
  const isEdit = Boolean(initial?.id);

  const toast = useToast();

  const [saving, setSaving] = useState(false);
  const [loadingEnrollments, setLoadingEnrollments] = useState(false);

  const [f, setF] = useState({
    full_name: initial?.full_name || "",
    phone: initial?.phone || "",
    roll_number: initial?.roll_number || "",
    dob: initial?.dob ? String(initial.dob).slice(0, 10) : "",
    gender: initial?.gender || "",
    blood_group: initial?.blood_group || "",
    address: initial?.address || "",
    guardian_name: initial?.guardian_name || "",
    guardian_phone: initial?.guardian_phone || "",
    guardian_email: initial?.guardian_email || "",
    admission_date: initial?.admission_date
      ? String(initial.admission_date).slice(0, 10)
      : "",
  });

  const [enrolledIds, setEnrolledIds] = useState(new Set());

  const [enrollmentError, setEnrollmentError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadEnrollments() {
      if (!isEdit || !initial?.id) return;

      try {
        setLoadingEnrollments(true);
        setEnrollmentError("");

        const response = await api.get(`/students/${initial.id}/classes`);

        if (cancelled) return;

        const rows = Array.isArray(response.data)
          ? response.data
          : response.data?.classes ||
            response.data?.class_slots ||
            response.data?.enrollments ||
            [];

        const ids = rows
          .map((item) => item.class_slot_id ?? item.classSlotId ?? item.id)
          .filter((id) => id !== null && id !== undefined && id !== "")
          .map(String);

        setEnrolledIds(new Set(ids));
      } catch (error) {
        if (cancelled) return;

        console.error("Failed to load student enrollments:", error);

        setEnrollmentError(
          error.response?.data?.error ||
            error.message ||
            "Unable to load this student's enrollments.",
        );
      } finally {
        if (!cancelled) {
          setLoadingEnrollments(false);
        }
      }
    }

    loadEnrollments();

    return () => {
      cancelled = true;
    };
  }, [initial?.id, isEdit]);

  const sortedSlots = useMemo(() => {
    return [...classSlots].sort((a, b) => {
      const subjectA = String(a.subject_name || "").toLowerCase();

      const subjectB = String(b.subject_name || "").toLowerCase();

      if (subjectA !== subjectB) {
        return subjectA.localeCompare(subjectB);
      }

      return String(a.start_time || "").localeCompare(
        String(b.start_time || ""),
      );
    });
  }, [classSlots]);

  function updateField(field, value) {
    setF((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  function toggleEnrollment(slotId) {
    if (!canEdit || saving) return;

    const key = String(slotId);

    setEnrolledIds((previous) => {
      const next = new Set(previous);

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  }

  async function submit(e) {
    e.preventDefault();

    if (saving) return;

    const fullName = f.full_name.trim();
    const rollNumber = f.roll_number.trim();

    if (!fullName) {
      toast.error("Full name is required.");
      return;
    }

    if (!rollNumber) {
      toast.error("Roll number is required.");
      return;
    }

    if (isEdit && enrollmentError) {
      toast.error(
        "Student enrollments could not be loaded. Please try again before saving.",
      );
      return;
    }

    const data = {
      full_name: fullName,
      phone: f.phone.trim(),
      roll_number: rollNumber,
      dob: f.dob || null,
      gender: f.gender || null,
      blood_group: f.blood_group || null,
      address: f.address.trim(),
      guardian_name: f.guardian_name.trim(),
      guardian_phone: f.guardian_phone.trim(),
      guardian_email: f.guardian_email.trim(),
      admission_date: f.admission_date || null,
    };

    const originalIds = new Set(enrolledIds);
    const currentIds = new Set(enrolledIds);

    try {
      setSaving(true);
      setEnrollmentError("");

      await onSave(data, currentIds, originalIds);
    } catch (error) {
      console.error("Failed to save student:", error);

      setEnrollmentError(
        error.response?.data?.error ||
          error.message ||
          "Unable to save student.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-[4px]"
        onClick={saving ? undefined : onClose}
      />

      <div className="relative w-full max-w-[860px] max-h-[94vh] bg-[#121519] border border-white/[0.09] rounded-2xl shadow-[0_35px_100px_rgba(0,0,0,0.65)] overflow-hidden flex flex-col">
        <div className="h-[2px] w-full bg-[#f2bd19] shrink-0" />

        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-white/[0.07] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#f2bd19]/[0.08] border border-[#f2bd19]/15 flex items-center justify-center">
              <UserRound className="w-[18px] h-[18px] text-[#f2bd19]" />
            </div>

            <div>
              <h2 className="text-[15px] font-semibold text-white">
                {isEdit ? "Edit Student" : "Add Student"}
              </h2>

              <p className="text-[10px] text-slate-600 mt-1">
                {isEdit
                  ? "Update student information and subject enrollment."
                  : "Create a student record and assign subjects."}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="w-8 h-8 rounded-lg bg-white/[0.025] border border-white/[0.07] text-slate-500 hover:text-white hover:border-white/[0.14] inline-flex items-center justify-center transition-all disabled:opacity-40"
          >
            <X className="w-[15px] h-[15px]" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={submit} className="overflow-y-auto custom-scrollbar">
          <div className="p-5 sm:p-6 space-y-6">
            {/* Basic Information */}
            <div>
              <SectionTitle
                icon={UserRound}
                title="Basic Information"
                description="Student identity and contact details"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4 mt-4">
                <Field
                  label="Full name"
                  required
                  icon={UserRound}
                  value={f.full_name}
                  onChange={(e) => updateField("full_name", e.target.value)}
                  placeholder="Enter student's full name"
                  className="sm:col-span-2"
                />

                <Field
                  label="Phone number"
                  icon={Phone}
                  value={f.phone}
                  onChange={(e) => updateField("phone", e.target.value)}
                  placeholder="Enter phone number"
                  type="tel"
                />

                <Field
                  label="Roll number"
                  required
                  icon={Hash}
                  value={f.roll_number}
                  onChange={(e) => updateField("roll_number", e.target.value)}
                  placeholder="Enter roll number"
                />

                <Field
                  label="Date of birth"
                  icon={CalendarDays}
                  value={f.dob}
                  onChange={(e) => updateField("dob", e.target.value)}
                  type="date"
                />

                <SelectField
                  label="Gender"
                  icon={UserRoundCheck}
                  value={f.gender}
                  onChange={(e) => updateField("gender", e.target.value)}
                  options={[
                    {
                      value: "",
                      label: "Select gender",
                    },
                    {
                      value: "male",
                      label: "Male",
                    },
                    {
                      value: "female",
                      label: "Female",
                    },
                  ]}
                />

                {/* <Field
                  label="Blood group"
                  icon={UserRoundCheck}
                  value={f.blood_group}
                  onChange={(e) => updateField("blood_group", e.target.value)}
                  placeholder="e.g. A+, B+, O+"
                /> */}

                <Field
                  label="Admission date"
                  icon={CalendarDays}
                  value={f.admission_date}
                  onChange={(e) =>
                    updateField("admission_date", e.target.value)
                  }
                  type="date"
                />
              </div>
            </div>

            {/* Enrollment */}
            <div>
              <SectionTitle
                icon={GraduationCap}
                title="Subject Enrollment"
                description="Assign this student to one or more subject time slots"
              />

              <div className="mt-4">
                {loadingEnrollments ? (
                  <div className="rounded-xl border border-white/[0.07] bg-[#0d1013] py-10 flex flex-col items-center justify-center">
                    <Loader2 className="w-5 h-5 text-[#f2bd19] animate-spin mb-2" />

                    <p className="text-[11px] text-slate-500">
                      Loading enrollments...
                    </p>
                  </div>
                ) : sortedSlots.length === 0 ? (
                  <div className="rounded-xl border border-white/[0.07] bg-[#0d1013] py-10 px-5 flex flex-col items-center justify-center text-center">
                    <BookOpen className="w-5 h-5 text-slate-600 mb-2" />

                    <p className="text-[12px] text-slate-400">
                      No class slots available
                    </p>

                    <p className="text-[10px] text-slate-600 mt-1 max-w-[360px]">
                      Create a subject and class time slot from Classes /
                      Courses first.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {sortedSlots.map((slot) => {
                      const selected = enrolledIds.has(String(slot.id));

                      return (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => toggleEnrollment(slot.id)}
                          disabled={!canEdit || saving}
                          className={`text-left rounded-xl border p-3 transition-all ${
                            selected
                              ? "bg-[#f2bd19]/[0.055] border-[#f2bd19]/30 shadow-[0_8px_25px_rgba(242,189,25,0.05)]"
                              : "bg-[#0d1013] border-white/[0.07] hover:border-white/[0.14] hover:bg-white/[0.018]"
                          } disabled:opacity-60 disabled:cursor-not-allowed`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <div
                                  className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${
                                    selected
                                      ? "bg-[#f2bd19]/10 border-[#f2bd19]/25"
                                      : "bg-white/[0.025] border-white/[0.07]"
                                  }`}
                                >
                                  <BookOpen
                                    className={`w-[13px] h-[13px] ${
                                      selected
                                        ? "text-[#f2bd19]"
                                        : "text-slate-500"
                                    }`}
                                  />
                                </div>

                                <div className="min-w-0">
                                  <p
                                    className={`text-[11px] font-semibold truncate ${
                                      selected
                                        ? "text-[#f2bd19]"
                                        : "text-slate-300"
                                    }`}
                                  >
                                    {slot.subject_name || "Unknown Subject"}
                                  </p>

                                  {slot.subject_code && (
                                    <p className="text-[8px] text-slate-600 mt-0.5 uppercase">
                                      {slot.subject_code}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="mt-2.5 space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <Clock3 className="w-3 h-3 text-slate-600" />

                                  <span className="text-[9px] text-slate-400">
                                    {formatTime(slot.start_time)}–
                                    {formatTime(slot.end_time)}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5">
                                  <CalendarDays className="w-3 h-3 text-slate-600" />

                                  <span className="text-[9px] text-slate-500">
                                    {slot.days || "Days not set"}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5">
                                  <UserRound className="w-3 h-3 text-slate-600" />

                                  <span className="text-[9px] text-slate-500 truncate">
                                    {slot.teacher_name ||
                                      "Teacher not assigned"}
                                  </span>
                                </div>

                                {slot.room && (
                                  <div className="flex items-center gap-1.5">
                                    <MapPin className="w-3 h-3 text-slate-600" />

                                    <span className="text-[9px] text-slate-600">
                                      {slot.room}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div
                              className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 ${
                                selected
                                  ? "bg-[#f2bd19] border-[#f2bd19]"
                                  : "bg-white/[0.02] border-white/[0.09]"
                              }`}
                            >
                              {selected && (
                                <Check className="w-[13px] h-[13px] text-[#111]" />
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="mt-3 px-3 py-2.5 rounded-lg bg-[#f2bd19]/[0.035] border border-[#f2bd19]/10">
                  <div className="flex items-start gap-2">
                    <UserPlus className="w-3.5 h-3.5 text-[#f2bd19] shrink-0 mt-0.5" />

                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      A student can be enrolled in multiple subjects and
                      different time slots. Select every subject/time slot this
                      student attends.
                    </p>
                  </div>
                </div>

                {enrollmentError && (
                  <div className="mt-3 rounded-lg bg-[#d83d3d]/[0.07] border border-[#d83d3d]/20 px-3 py-2.5">
                    <p className="text-[10px] text-red-300">
                      {enrollmentError}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Guardian */}
            <div>
              <SectionTitle
                icon={UserCheck}
                title="Guardian Information"
                description="Parent or guardian contact details"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4 mt-4">
                <Field
                  label="Guardian name"
                  icon={UserRound}
                  value={f.guardian_name}
                  onChange={(e) => updateField("guardian_name", e.target.value)}
                  placeholder="Enter guardian's name"
                />

                <Field
                  label="Guardian phone"
                  icon={Phone}
                  value={f.guardian_phone}
                  onChange={(e) =>
                    updateField("guardian_phone", e.target.value)
                  }
                  placeholder="Enter guardian phone"
                  type="tel"
                />

                {/* <Field
                  label="Guardian email"
                  icon={Mail}
                  value={f.guardian_email}
                  onChange={(e) =>
                    updateField("guardian_email", e.target.value)
                  }
                  placeholder="Enter guardian email"
                  type="email"
                  className="sm:col-span-2"
                /> */}
              </div>
            </div>

            {/* Address */}
            <div>
              <SectionTitle
                icon={MapPin}
                title="Address"
                description="Current residential address"
              />

              <div className="mt-4">
                <label className="block">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.09em] text-slate-500 mb-2">
                    Address
                  </span>

                  <div className="relative group">
                    <MapPin className="absolute left-3.5 top-3.5 w-[15px] h-[15px] text-slate-500 group-focus-within:text-[#f2bd19] transition-colors pointer-events-none" />

                    <textarea
                      value={f.address}
                      onChange={(e) => updateField("address", e.target.value)}
                      placeholder="Enter residential address"
                      rows={3}
                      className="w-full min-h-[90px] resize-none pl-10 pr-4 py-3 rounded-lg bg-[#0d1013] border border-white/[0.09] text-[12px] leading-relaxed text-slate-100 placeholder:text-slate-600 outline-none transition-all hover:border-white/[0.15] focus:border-[#f2bd19]/55 focus:ring-2 focus:ring-[#f2bd19]/10"
                    />
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 px-5 sm:px-6 py-3.5 bg-[#121519]/95 backdrop-blur-md border-t border-white/[0.07] flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-[9px] text-slate-600">
              Fields marked <span className="text-[#f2bd19]">*</span> are
              required.
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="h-[40px] px-4 rounded-lg bg-white/[0.025] border border-white/[0.08] text-[11px] font-semibold text-slate-400 hover:text-white hover:border-white/[0.15] transition-all disabled:opacity-40"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={
                  saving || loadingEnrollments || Boolean(enrollmentError)
                }
                className="h-[40px] px-5 rounded-lg bg-[#f2bd19] hover:bg-[#e6b317] active:bg-[#d9a912] text-[#111] text-[11px] font-bold inline-flex items-center justify-center gap-2 transition-all shadow-[0_7px_22px_rgba(242,189,25,0.12)] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-[14px] h-[14px] animate-spin" />
                    Saving...
                  </>
                ) : isEdit ? (
                  <>
                    <Pencil className="w-[13px] h-[13px]" />
                    Save Changes
                  </>
                ) : (
                  <>
                    <Plus className="w-[14px] h-[14px]" />
                    Create Student
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

/* =========================================================
   SECTION TITLE
========================================================= */

function SectionTitle({ icon: Icon, title, description }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-7 h-7 rounded-lg bg-white/[0.025] border border-white/[0.07] flex items-center justify-center shrink-0">
        <Icon className="w-[13px] h-[13px] text-[#f2bd19]" />
      </div>

      <div>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-300">
          {title}
        </h3>

        <p className="text-[9px] text-slate-600 mt-0.5">{description}</p>
      </div>
    </div>
  );
}

/* =========================================================
   INPUT FIELD
========================================================= */

function Field({
  label,
  required = false,
  icon: Icon,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled = false,
  className = "",
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[10px] font-semibold uppercase tracking-[0.09em] text-slate-500 mb-2">
        {label}

        {required && <span className="text-[#f2bd19] ml-1">*</span>}
      </span>

      <div className="relative group">
        {Icon && (
          <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[15px] h-[15px] text-slate-500 group-focus-within:text-[#f2bd19] transition-colors pointer-events-none" />
        )}

        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          autoComplete="off"
          className={`
            w-full
            h-[44px]
            ${Icon ? "pl-10" : "pl-3.5"}
            pr-3.5
            rounded-lg
            bg-[#0d1013]
            border
            border-white/[0.09]
            text-[12px]
            text-slate-100
            placeholder:text-slate-600
            outline-none
            transition-all
            hover:border-white/[0.15]
            focus:border-[#f2bd19]/55
            focus:ring-2
            focus:ring-[#f2bd19]/10
            disabled:opacity-45
            disabled:cursor-not-allowed
          `}
          style={type === "date" ? { colorScheme: "dark" } : undefined}
        />
      </div>
    </label>
  );
}

/* =========================================================
   SELECT FIELD
========================================================= */

function SelectField({
  label,
  required = false,
  icon: Icon,
  value,
  onChange,
  options,
  disabled = false,
}) {
  return (
    <label className="block">
      <span className="block text-[10px] font-semibold uppercase tracking-[0.09em] text-slate-500 mb-2">
        {label}

        {required && <span className="text-[#f2bd19] ml-1">*</span>}
      </span>

      <div className="relative group">
        {Icon && (
          <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[15px] h-[15px] text-slate-500 group-focus-within:text-[#f2bd19] transition-colors pointer-events-none z-10" />
        )}

        <select
          value={value}
          onChange={onChange}
          disabled={disabled}
          required={required}
          className={`
            w-full
            h-[44px]
            ${Icon ? "pl-10" : "pl-3.5"}
            pr-9
            rounded-lg
            bg-[#0d1013]
            border
            border-white/[0.09]
            text-[12px]
            text-slate-300
            outline-none
            appearance-none
            cursor-pointer
            transition-all
            hover:border-white/[0.15]
            focus:border-[#f2bd19]/55
            focus:ring-2
            focus:ring-[#f2bd19]/10
            disabled:opacity-45
            disabled:cursor-not-allowed
          `}
        >
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              className="bg-[#121519] text-slate-200"
            >
              {option.label}
            </option>
          ))}
        </select>

        <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-[14px] h-[14px] text-slate-500 pointer-events-none group-focus-within:text-[#f2bd19] transition-colors" />
      </div>
    </label>
  );
}
