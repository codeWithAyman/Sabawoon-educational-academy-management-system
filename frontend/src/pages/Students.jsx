import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import PasswordConfirmModal from "../components/PasswordConfirmModal";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/Toast";
import { toJalaali } from "jalaali-js";
import SolarDateField, { toIsoDate } from "../components/SolarDateField";
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
  Phone,
  BookOpen,
  ChevronDown,
  Clock3,
  UserPlus,
  Check,
  AlertCircle,
} from "lucide-react";

const EMPTY_STUDENT = {
  full_name: "",
  father_name: "",
  phone: "",
  age: "",
  gender: "",
  admission_date: "",
  guardian_name: "",
  guardian_phone: "",
  address: "",
};

/* ============================================================
   DATA HELPERS
============================================================ */

function formatTime(value) {
  if (!value) return "—";
  return String(value).slice(0, 5);
}

function getAfghanistanDateParts(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kabul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);

  const result = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      result[part.type] = part.value;
    }
  }

  return result;
}

function today() {
  const parts = getAfghanistanDateParts();

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatDate(value) {
  if (!value) return "—";

  const valueString = String(value);
  const raw = valueString.slice(0, 10);

  // Handle PostgreSQL DATE values such as:
  // 2026-09-21
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-").map(Number);

    try {
      const result = toJalaali(year, month, day);

      return `${String(result.jy).padStart(4, "0")}/${String(
        result.jm,
      ).padStart(2, "0")}/${String(result.jd).padStart(2, "0")}`;
    } catch {
      return raw;
    }
  }

  // Handle timestamps such as:
  // 2026-09-21T00:00:00.000Z
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  try {
    const result = toJalaali(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
    );

    return `${String(result.jy).padStart(4, "0")}/${String(result.jm).padStart(
      2,
      "0",
    )}/${String(result.jd).padStart(2, "0")}`;
  } catch {
    return String(value);
  }
}

function formatAge(value) {
  if (value === null || value === undefined || value === "") return "—";

  const age = Number(value);

  if (!Number.isFinite(age)) return "—";

  return `${age} yr`;
}

function getSubjectId(value) {
  return Number(
    value?.subject_id ?? value?.subjectId ?? value?.subject?.id ?? 0,
  );
}

function getSubjectName(subjects, subjectId) {
  const subject = subjects.find(
    (item) => Number(item.id) === Number(subjectId),
  );

  return subject?.name || "Unknown subject";
}

function getTeacherName(slot) {
  return (
    slot?.teacher_name ||
    slot?.teacherName ||
    slot?.teacher?.full_name ||
    "No teacher"
  );
}

function getSectionIds(slot) {
  const ids = [];

  if (Array.isArray(slot?.book_ids)) {
    ids.push(...slot.book_ids);
  }

  if (Array.isArray(slot?.bookIds)) {
    ids.push(...slot.bookIds);
  }

  if (Array.isArray(slot?.books)) {
    ids.push(...slot.books.map((book) => book?.id));
  }

  if (Array.isArray(slot?.sections)) {
    ids.push(...slot.sections.map((section) => section?.id));
  }

  if (slot?.book_id !== undefined && slot?.book_id !== null) {
    ids.push(slot.book_id);
  }

  if (slot?.section_id !== undefined && slot?.section_id !== null) {
    ids.push(slot.section_id);
  }

  return [
    ...new Set(ids.map(Number).filter((id) => Number.isFinite(id) && id > 0)),
  ];
}

function getSectionNames(slot) {
  if (Array.isArray(slot?.book_names)) {
    return slot.book_names.filter(Boolean);
  }

  if (Array.isArray(slot?.bookNames)) {
    return slot.bookNames.filter(Boolean);
  }

  if (Array.isArray(slot?.books)) {
    return slot.books.map((book) => book?.name).filter(Boolean);
  }

  if (Array.isArray(slot?.sections)) {
    return slot.sections.map((section) => section?.name).filter(Boolean);
  }

  if (slot?.book_name) {
    return [slot.book_name];
  }

  if (slot?.section_name) {
    return [slot.section_name];
  }

  return [];
}

function classLabel(slot, subjects) {
  const subject =
    slot?.subject_name || getSubjectName(subjects, getSubjectId(slot));

  const sections = getSectionNames(slot);

  if (sections.length) {
    return `${subject} • ${sections.join(", ")}`;
  }

  return subject;
}

function getStudentEnrollments(student) {
  if (Array.isArray(student?.enrolled_classes)) {
    return student.enrolled_classes;
  }

  if (Array.isArray(student?.class_slots)) {
    return student.class_slots;
  }

  if (Array.isArray(student?.enrollments)) {
    return student.enrollments;
  }

  if (Array.isArray(student?.classes)) {
    return student.classes;
  }

  return [];
}

function getEnrollmentClassId(item) {
  return Number(
    item?.class_slot_id ??
      item?.classSlotId ??
      item?.class_id ??
      item?.classId ??
      item?.id ??
      0,
  );
}

function getStudentClassIds(student) {
  return [
    ...new Set(
      getStudentEnrollments(student)
        .map(getEnrollmentClassId)
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  ];
}

function normalizeArrayResponse(data) {
  if (Array.isArray(data)) return data;

  if (Array.isArray(data?.students)) return data.students;
  if (Array.isArray(data?.classes)) return data.classes;
  if (Array.isArray(data?.subjects)) return data.subjects;
  if (Array.isArray(data?.books)) return data.books;
  if (Array.isArray(data?.data)) return data.data;

  return [];
}

/* ============================================================
   MAIN PAGE
============================================================ */

export default function Students() {
  const { user } = useAuth();
  const toast = useToast();

  const canEdit = ["admin", "staff"].includes(user?.role);
  const canDelete = user?.role === "admin";

  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);

  const [showStudentModal, setShowStudentModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);

  const [passwordConfirmOpen, setPasswordConfirmOpen] = useState(false);
  const [studentPendingDelete, setStudentPendingDelete] = useState(null);

  const [showEnrollmentModal, setShowEnrollmentModal] = useState(false);
  const [enrollmentStudent, setEnrollmentStudent] = useState(null);

  async function loadData(showSpinner = true) {
    if (showSpinner) {
      setLoading(true);
    }

    try {
      const [studentsRes, classesRes, subjectsRes] = await Promise.all([
        api.get("/students"),
        api.get("/classes"),
        api.get("/classes/subjects/all"),
      ]);

      setStudents(normalizeArrayResponse(studentsRes.data));
      setClasses(normalizeArrayResponse(classesRes.data));
      setSubjects(normalizeArrayResponse(subjectsRes.data));
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to load student data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function refresh() {
    setRefreshing(true);

    try {
      await loadData(false);
    } finally {
      setRefreshing(false);
    }
  }

  const filteredStudents = useMemo(() => {
    const term = search.trim().toLowerCase();

    return students.filter((student) => {
      const fatherName = student?.father_name || student?.guardian_name || "";

      const matchesSearch =
        !term ||
        String(student?.id ?? "")
          .toLowerCase()
          .includes(term) ||
        String(student?.full_name || "")
          .toLowerCase()
          .includes(term) ||
        String(fatherName).toLowerCase().includes(term) ||
        String(student?.phone || "")
          .toLowerCase()
          .includes(term);

      if (!matchesSearch) {
        return false;
      }

      if (!classFilter) {
        return true;
      }

      return getStudentClassIds(student).includes(Number(classFilter));
    });
  }, [students, search, classFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));

  const paginatedStudents = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;

    return filteredStudents.slice(startIndex, startIndex + pageSize);
  }, [filteredStudents, currentPage, pageSize]);

  const pageStart =
    filteredStudents.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;

  const pageEnd = Math.min(currentPage * pageSize, filteredStudents.length);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, classFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const enrolledCount = students.filter(
    (student) => getStudentClassIds(student).length > 0,
  ).length;

  const notEnrolledCount = students.length - enrolledCount;

  function openCreate() {
    setEditingStudent(null);
    setShowStudentModal(true);
  }

  function openEdit(student) {
    setEditingStudent(student);
    setShowStudentModal(true);
  }

  function openEnrollment(student) {
    setEnrollmentStudent(student);
    setShowEnrollmentModal(true);
  }

  function deleteStudent(student) {
    if (!canDelete) return;

    const confirmed = window.confirm(
      `Delete ${student.full_name}?\n\nThis action cannot be undone.`,
    );

    if (!confirmed) return;

    setStudentPendingDelete(student);
    setPasswordConfirmOpen(true);
  }

  async function confirmStudentDelete() {
    const student = studentPendingDelete;

    if (!student) return;

    try {
      await api.delete(`/students/${student.id}`);

      toast.success("Student deleted successfully");

      setPasswordConfirmOpen(false);
      setStudentPendingDelete(null);

      await loadData(false);
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to delete student");
    }
  }

  return (
    <div className="min-h-full bg-[#0b0d10] text-slate-100 px-3 py-4 sm:px-5 sm:py-5 lg:px-6">
      <div className="max-w-[1600px] mx-auto space-y-4 sm:space-y-5">
        {/* ============================================================
            PAGE HEADER
        ============================================================ */}

        <div className="rounded-xl border border-white/[0.07] bg-[#121519] overflow-hidden shadow-[0_14px_45px_rgba(0,0,0,0.14)]">
          <div className="px-4 py-4 sm:px-5 sm:py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 sm:w-11 sm:h-11 shrink-0 rounded-xl bg-[#f2bd19]/10 border border-[#f2bd19]/20 grid place-items-center">
                  <GraduationCap className="w-5 h-5 sm:w-[21px] sm:h-[21px] text-[#f2bd19]" />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white truncate">
                      Students
                    </h2>

                    <span className="hidden sm:inline-flex items-center h-5 px-2 rounded-md border border-white/[0.07] bg-white/[0.025] text-[8px] uppercase tracking-[0.12em] text-slate-600">
                      Records
                    </span>
                  </div>

                  <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 truncate">
                    Manage student records, classes and enrollment
                  </p>
                </div>
              </div>

              {canEdit && (
                <div className="grid grid-cols-2 sm:flex gap-2 w-full lg:w-auto">
                  <button
                    type="button"
                    onClick={refresh}
                    disabled={refreshing}
                    className="h-10 px-3 sm:px-4 rounded-lg border border-white/[0.08] bg-[#0d1013] text-slate-400 hover:text-white hover:bg-white/[0.04] hover:border-white/[0.14] transition flex items-center justify-center gap-2 text-xs sm:text-sm"
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
                    />
                    Refresh
                  </button>

                  <button
                    type="button"
                    onClick={openCreate}
                    className="h-10 px-4 sm:px-5 rounded-lg bg-[#f2bd19] text-[#0b0d10] text-xs sm:text-sm font-bold flex items-center justify-center gap-2 hover:bg-[#ffd34d] transition shadow-[0_8px_28px_rgba(242,189,25,0.10)]"
                  >
                    <Plus className="w-4 h-4" />
                    Add Student
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="px-4 sm:px-5 py-2.5 border-t border-white/[0.05] bg-[#101317] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#f2bd19]" />

              <span className="text-[8px] uppercase tracking-[0.14em] text-slate-600">
                Student management
              </span>
            </div>

            <span className="text-[9px] text-slate-700">
              {students.length} total records
            </span>
          </div>
        </div>

        <PasswordConfirmModal
          open={passwordConfirmOpen}
          title="Confirm student deletion"
          description={
            studentPendingDelete
              ? `Enter your password to permanently delete ${studentPendingDelete.full_name}.`
              : "Enter your password to continue."
          }
          confirmLabel="Verify & Delete"
          onVerified={confirmStudentDelete}
          onCancel={() => {
            setPasswordConfirmOpen(false);
            setStudentPendingDelete(null);
          }}
        />

        {/* ============================================================
            SUMMARY
        ============================================================ */}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
          <SummaryCard
            icon={Users}
            label="Total Students"
            value={students.length}
            detail="All registered students"
          />

          <SummaryCard
            icon={UserPlus}
            label="Enrolled"
            value={enrolledCount}
            detail="Currently assigned to classes"
          />

          <SummaryCard
            icon={AlertCircle}
            label="Not Enrolled"
            value={notEnrolledCount}
            detail="No active class assignment"
          />
        </div>

        {/* ============================================================
            FILTER PANEL
        ============================================================ */}

        <section className="rounded-xl border border-white/[0.07] bg-[#121519] shadow-[0_12px_40px_rgba(0,0,0,0.12)] overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-white/[0.05] bg-[#101317]">
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-[#f2bd19]/70" />

              <div>
                <p className="text-[10px] font-semibold text-slate-300">
                  Find Students
                </p>

                <p className="text-[8px] text-slate-700 mt-0.5">
                  Search records or filter by class
                </p>
              </div>
            </div>
          </div>

          <div className="p-3 sm:p-4">
            <div className="flex flex-col lg:flex-row gap-2.5">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none" />

                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by student, ID, father name or phone..."
                  className="w-full h-10 sm:h-11 pl-10 pr-3 rounded-lg bg-[#0d1013] border border-white/[0.08] text-xs sm:text-sm text-slate-200 outline-none focus:border-[#f2bd19]/45 focus:bg-[#0c0f12] placeholder:text-slate-700 transition"
                />
              </div>

              <div className="relative w-full lg:w-[310px]">
                <select
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  className="w-full h-10 sm:h-11 px-3 pr-9 rounded-lg bg-[#0d1013] border border-white/[0.08] text-xs sm:text-sm text-slate-300 outline-none focus:border-[#f2bd19]/45 transition appearance-none"
                >
                  <option value="">All classes</option>

                  {classes.map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      {classLabel(slot, subjects)}
                      {" — "}
                      {formatTime(slot.start_time)}-{formatTime(slot.end_time)}
                    </option>
                  ))}
                </select>

                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-700 pointer-events-none" />
              </div>
            </div>

            {(search || classFilter) && (
              <div className="flex items-center justify-between gap-3 px-1 pt-2.5">
                <p className="text-[9px] text-slate-600">
                  {filteredStudents.length} matching{" "}
                  {filteredStudents.length === 1 ? "student" : "students"}
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setClassFilter("");
                  }}
                  className="text-[9px] text-slate-600 hover:text-[#f2bd19] transition"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        </section>

        {/* ============================================================
            STUDENT RECORDS PANEL
        ============================================================ */}

        <section className="rounded-xl border border-white/[0.07] bg-[#121519] overflow-hidden shadow-[0_16px_55px_rgba(0,0,0,0.16)]">
          <div className="px-4 sm:px-5 py-3 border-b border-white/[0.05] bg-[#101317] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#f2bd19]/10 border border-[#f2bd19]/15 grid place-items-center">
                <Users className="w-3.5 h-3.5 text-[#f2bd19]" />
              </div>

              <div>
                <p className="text-[10px] sm:text-[11px] font-semibold text-slate-300">
                  Student Records
                </p>

                <p className="text-[8px] sm:text-[9px] text-slate-700 mt-0.5">
                  {filteredStudents.length}{" "}
                  {filteredStudents.length === 1 ? "record" : "records"}
                </p>
              </div>
            </div>

            {filteredStudents.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />

                <span className="hidden sm:inline text-[8px] uppercase tracking-[0.12em] text-slate-700">
                  Current records
                </span>
              </div>
            )}
          </div>

          {/* ============================================================
              DESKTOP / TABLET TABLE
          ============================================================ */}

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-white/[0.05] bg-[#0f1215]">
                  <th className="px-4 sm:px-5 py-2.5 text-left text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-700">
                    Student
                  </th>

                  <th className="px-4 py-2.5 text-left text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-700">
                    Father
                  </th>

                  <th className="px-4 py-2.5 text-left text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-700">
                    Classes
                  </th>

                  <th className="px-4 py-2.5 text-left text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-700">
                    Phone
                  </th>

                  <th className="px-4 py-2.5 text-left text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-700">
                    Age
                  </th>

                  <th className="px-4 py-2.5 text-right text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-700">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/[0.035]">
                {loading ? (
                  <tr>
                    <td colSpan={6}>
                      <LoadingState />
                    </td>
                  </tr>
                ) : filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState search={search} classFilter={classFilter} />
                    </td>
                  </tr>
                ) : (
                  paginatedStudents.map((student) => {
                    const studentEnrollments = getStudentEnrollments(student);

                    return (
                      <StudentTableRow
                        key={student.id}
                        student={student}
                        studentEnrollments={studentEnrollments}
                        subjects={subjects}
                        canEdit={canEdit}
                        canDelete={canDelete}
                        openEnrollment={openEnrollment}
                        openEdit={openEdit}
                        deleteStudent={deleteStudent}
                      />
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ============================================================
              MOBILE RECORDS
          ============================================================ */}

          <div className="md:hidden">
            {loading ? (
              <LoadingState />
            ) : filteredStudents.length === 0 ? (
              <EmptyState search={search} classFilter={classFilter} />
            ) : (
              <div className="divide-y divide-white/[0.045]">
                {paginatedStudents.map((student) => {
                  const studentEnrollments = getStudentEnrollments(student);

                  return (
                    <MobileStudentRow
                      key={student.id}
                      student={student}
                      studentEnrollments={studentEnrollments}
                      subjects={subjects}
                      canEdit={canEdit}
                      canDelete={canDelete}
                      openEnrollment={openEnrollment}
                      openEdit={openEdit}
                      deleteStudent={deleteStudent}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* ============================================================
              PAGINATION
          ============================================================ */}

          {!loading && filteredStudents.length > 0 && (
            <div className="border-t border-white/[0.06] bg-[#101317] px-4 sm:px-5 py-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2 text-[10px] text-slate-600">
                  <span>
                    Showing{" "}
                    <span className="text-slate-400 font-semibold">
                      {pageStart}-{pageEnd}
                    </span>{" "}
                    of{" "}
                    <span className="text-slate-400 font-semibold">
                      {filteredStudents.length}
                    </span>{" "}
                    students
                  </span>

                  {totalPages > 1 && (
                    <span className="hidden sm:inline text-slate-800">•</span>
                  )}

                  {totalPages > 1 && (
                    <span className="hidden sm:inline text-slate-600">
                      Page {currentPage} of {totalPages}
                    </span>
                  )}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={currentPage === 1}
                      onClick={() =>
                        setCurrentPage((page) => Math.max(1, page - 1))
                      }
                      className="h-8 px-3 rounded-lg border border-white/[0.08] bg-[#0d1013] text-[10px] font-medium text-slate-500 hover:text-white hover:bg-white/[0.04] hover:border-white/[0.14] transition disabled:opacity-25 disabled:pointer-events-none"
                    >
                      Previous
                    </button>

                    <div className="h-8 min-w-8 px-2 rounded-lg border border-[#f2bd19]/20 bg-[#f2bd19]/[0.07] flex items-center justify-center text-[10px] font-semibold text-[#f2bd19]">
                      {currentPage}
                    </div>

                    <span className="text-[10px] text-slate-800 px-0.5">/</span>

                    <div className="text-[10px] text-slate-500 min-w-4 text-center">
                      {totalPages}
                    </div>

                    <button
                      type="button"
                      disabled={currentPage === totalPages}
                      onClick={() =>
                        setCurrentPage((page) => Math.min(totalPages, page + 1))
                      }
                      className="h-8 px-3 rounded-lg border border-white/[0.08] bg-[#0d1013] text-[10px] font-medium text-slate-500 hover:text-white hover:bg-white/[0.04] hover:border-white/[0.14] transition disabled:opacity-25 disabled:pointer-events-none"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {showStudentModal && (
        <StudentModal
          student={editingStudent}
          classes={classes}
          subjects={subjects}
          toast={toast}
          onClose={() => {
            setShowStudentModal(false);
            setEditingStudent(null);
          }}
          onSaved={async () => {
            setShowStudentModal(false);
            setEditingStudent(null);
            await loadData(false);
          }}
        />
      )}

      {showEnrollmentModal && enrollmentStudent && (
        <EnrollmentModal
          student={enrollmentStudent}
          classes={classes}
          subjects={subjects}
          toast={toast}
          onClose={() => {
            setShowEnrollmentModal(false);
            setEnrollmentStudent(null);
          }}
          onSaved={async () => {
            setShowEnrollmentModal(false);
            setEnrollmentStudent(null);
            await loadData(false);
          }}
        />
      )}
    </div>
  );
}

/* ============================================================
   DESKTOP STUDENT ROW
============================================================ */

function StudentTableRow({
  student,
  studentEnrollments,
  subjects,
  canEdit,
  canDelete,
  openEnrollment,
  openEdit,
  deleteStudent,
}) {
  return (
    <tr className="group hover:bg-white/[0.018] transition-colors">
      {/* STUDENT */}

      <td className="px-4 sm:px-5 py-3.5">
        <div className="flex items-center gap-3">
          <StudentAvatar
            student={student}
            enrolled={studentEnrollments.length > 0}
          />

          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-slate-300 truncate max-w-[180px]">
              {student.full_name || "—"}
            </p>

            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[9px] font-semibold text-[#f2bd19]/70">
                #{student.id}
              </span>

              <span className="w-0.5 h-0.5 rounded-full bg-slate-800" />

              <span className="text-[8px] uppercase tracking-[0.1em] text-slate-700">
                Student
              </span>
            </div>
          </div>
        </div>
      </td>

      {/* FATHER */}

      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2">
          <UserRound className="w-3 h-3 text-slate-700 shrink-0" />

          <span className="text-[10px] text-slate-500 truncate max-w-[130px]">
            {student.father_name || student.guardian_name || "—"}
          </span>
        </div>
      </td>

      {/* CLASSES */}

      <td className="px-4 py-3.5">
        <StudentClasses
          student={student}
          studentEnrollments={studentEnrollments}
          subjects={subjects}
          openEnrollment={openEnrollment}
        />
      </td>

      {/* PHONE */}

      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2">
          <Phone className="w-3 h-3 text-slate-700 shrink-0" />

          <span className="text-[10px] text-slate-500">
            {student.phone || "—"}
          </span>
        </div>
      </td>

      {/* AGE */}

      <td className="px-4 py-3.5">
        <span className="text-[10px] text-slate-500">
          {formatAge(student.age)}
        </span>
      </td>

      {/* ACTIONS */}

      <td className="px-4 py-3.5">
        <StudentActions
          student={student}
          canEdit={canEdit}
          canDelete={canDelete}
          openEnrollment={openEnrollment}
          openEdit={openEdit}
          deleteStudent={deleteStudent}
        />
      </td>
    </tr>
  );
}

/* ============================================================
   MOBILE STUDENT ROW
============================================================ */

function MobileStudentRow({
  student,
  studentEnrollments,
  subjects,
  canEdit,
  canDelete,
  openEnrollment,
  openEdit,
  deleteStudent,
}) {
  return (
    <div className="p-3.5">
      <div className="flex items-start gap-3">
        <StudentAvatar
          student={student}
          enrolled={studentEnrollments.length > 0}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-slate-300 truncate">
                {student.full_name || "—"}
              </p>

              <div className="flex items-center gap-2 mt-1">
                <span className="text-[9px] font-semibold text-[#f2bd19]/70">
                  #{student.id}
                </span>

                <span className="w-0.5 h-0.5 rounded-full bg-slate-800" />

                <span className="text-[8px] uppercase tracking-[0.1em] text-slate-700">
                  Student
                </span>
              </div>
            </div>

            <StudentActions
              student={student}
              canEdit={canEdit}
              canDelete={canDelete}
              openEnrollment={openEnrollment}
              openEdit={openEdit}
              deleteStudent={deleteStudent}
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-white/[0.05] bg-[#0d1013] px-2.5 py-2">
              <div className="flex items-center gap-1.5 mb-1">
                <UserRound className="w-3 h-3 text-slate-700" />

                <span className="text-[8px] uppercase tracking-[0.1em] text-slate-700">
                  Father
                </span>
              </div>

              <p className="text-[9px] text-slate-500 truncate">
                {student.father_name || student.guardian_name || "—"}
              </p>
            </div>

            <div className="rounded-lg border border-white/[0.05] bg-[#0d1013] px-2.5 py-2">
              <div className="flex items-center gap-1.5 mb-1">
                <Phone className="w-3 h-3 text-slate-700" />

                <span className="text-[8px] uppercase tracking-[0.1em] text-slate-700">
                  Phone
                </span>
              </div>

              <p className="text-[9px] text-slate-500 truncate">
                {student.phone || "—"}
              </p>
            </div>
          </div>

          <div className="mt-2 rounded-lg border border-white/[0.05] bg-[#0d1013] px-2.5 py-2.5">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                <BookOpen className="w-3 h-3 text-[#f2bd19]/60" />

                <span className="text-[8px] uppercase tracking-[0.1em] text-slate-700">
                  Classes
                </span>
              </div>

              <span className="text-[8px] text-slate-700">
                Age:{" "}
                <span className="text-slate-500">
                  {formatAge(student.age)}
                </span>
              </span>
            </div>

            <StudentClasses
              student={student}
              studentEnrollments={studentEnrollments}
              subjects={subjects}
              openEnrollment={openEnrollment}
              mobile
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   STUDENT AVATAR
============================================================ */

function StudentAvatar({ student, enrolled }) {
  return (
    <div className="relative w-9 h-9 shrink-0 rounded-lg border border-white/[0.07] bg-[#0d1013] grid place-items-center text-[10px] font-bold text-[#f2bd19]">
      {student.full_name
        ?.split(" ")
        .map((x) => x[0])
        .slice(0, 2)
        .join("")
        .toUpperCase() || "?"}

      <span
        className={`absolute -right-0.5 -bottom-0.5 w-2 h-2 rounded-full border-2 border-[#121519] ${
          enrolled ? "bg-emerald-400" : "bg-slate-700"
        }`}
      />
    </div>
  );
}

/* ============================================================
   STUDENT CLASSES
============================================================ */

function StudentClasses({
  student,
  studentEnrollments,
  subjects,
  openEnrollment,
  mobile = false,
}) {
  if (studentEnrollments.length === 0) {
    return (
      <button
        type="button"
        onClick={() => openEnrollment(student)}
        className="group/not flex items-center gap-2 text-[10px] text-slate-600 hover:text-[#f2bd19] transition"
      >
        <span className="w-5 h-5 rounded-md border border-dashed border-white/[0.08] grid place-items-center group-hover/not:border-[#f2bd19]/25">
          <Plus className="w-3 h-3" />
        </span>
        Not enrolled
      </button>
    );
  }

  return (
    <div className={`space-y-1.5 ${mobile ? "" : "max-w-[430px]"}`}>
      {studentEnrollments.slice(0, 3).map((slot, index) => (
        <button
          type="button"
          key={slot.enrollment_id || slot.class_slot_id || slot.id || index}
          onClick={() => openEnrollment(student)}
          className="block w-full text-left"
        >
          <div className="flex items-center gap-2.5 group/class">
            <div className="w-5 h-5 shrink-0 rounded-md bg-[#f2bd19]/[0.06] border border-[#f2bd19]/10 grid place-items-center">
              <BookOpen className="w-2.5 h-2.5 text-[#f2bd19]/60 group-hover/class:text-[#f2bd19]" />
            </div>

            <span className="text-[10px] font-medium text-slate-400 truncate group-hover/class:text-slate-300">
              {classLabel(slot, subjects)}
            </span>

            <span className="text-[9px] text-slate-700 shrink-0">
              {formatTime(slot.start_time)}-{formatTime(slot.end_time)}
            </span>
          </div>
        </button>
      ))}

      {studentEnrollments.length > 3 && (
        <button
          type="button"
          onClick={() => openEnrollment(student)}
          className="ml-7 text-[9px] text-[#f2bd19]/65 hover:text-[#f2bd19]"
        >
          +{studentEnrollments.length - 3} more classes
        </button>
      )}
    </div>
  );
}

/* ============================================================
   STUDENT ACTIONS
============================================================ */

function StudentActions({
  student,
  canEdit,
  canDelete,
  openEnrollment,
  openEdit,
  deleteStudent,
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={() => openEnrollment(student)}
        className="w-8 h-8 rounded-lg grid place-items-center text-slate-600 hover:text-[#f2bd19] hover:bg-[#f2bd19]/10 transition"
        title="Manage classes"
      >
        <BookOpen className="w-3.5 h-3.5" />
      </button>

      {canEdit && (
        <button
          type="button"
          onClick={() => openEdit(student)}
          className="w-8 h-8 rounded-lg grid place-items-center text-slate-600 hover:text-white hover:bg-white/[0.05] transition"
          title="Edit student"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}

      {canDelete && (
        <button
          type="button"
          onClick={() => deleteStudent(student)}
          className="w-8 h-8 rounded-lg grid place-items-center text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition"
          title="Delete student"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

/* ============================================================
   LOADING STATE
============================================================ */

function LoadingState() {
  return (
    <div className="py-20 flex flex-col items-center gap-3">
      <div className="w-10 h-10 rounded-xl border border-[#f2bd19]/15 bg-[#f2bd19]/[0.04] grid place-items-center">
        <Loader2 className="w-5 h-5 text-[#f2bd19] animate-spin" />
      </div>

      <div className="text-center">
        <p className="text-xs font-medium text-slate-500">Loading students</p>

        <p className="text-[9px] text-slate-700 mt-1">
          Retrieving current student records...
        </p>
      </div>
    </div>
  );
}

/* ============================================================
   EMPTY STATE
============================================================ */

function EmptyState({ search, classFilter }) {
  return (
    <div className="py-20 px-5 text-center">
      <div className="w-11 h-11 mx-auto rounded-xl border border-white/[0.06] bg-[#0d1013] grid place-items-center mb-3">
        <Users className="w-5 h-5 text-slate-700" />
      </div>

      <h3 className="text-sm font-semibold text-slate-300">
        No students found
      </h3>

      <p className="text-[10px] text-slate-600 mt-1.5">
        {search || classFilter
          ? "Try changing your search or class filter."
          : "Add a student to begin building your records."}
      </p>
    </div>
  );
}

/* ============================================================
   SUMMARY CARD
============================================================ */

function SummaryCard({ icon: Icon, label, value, detail }) {
  return (
    <div className="group rounded-xl border border-white/[0.07] bg-[#121519] overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.10)] hover:border-white/[0.12] transition-colors">
      <div className="p-3.5 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[8px] sm:text-[9px] uppercase tracking-[0.15em] text-slate-700">
              {label}
            </p>

            <p className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-white">
              {value}
            </p>

            <p className="text-[8px] text-slate-700 mt-1 truncate">{detail}</p>
          </div>

          <div className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-lg bg-[#f2bd19]/10 border border-[#f2bd19]/15 grid place-items-center group-hover:bg-[#f2bd19]/[0.13] transition-colors">
            <Icon className="w-4 h-4 text-[#f2bd19]" />
          </div>
        </div>
      </div>

      <div className="h-px bg-gradient-to-r from-transparent via-[#f2bd19]/10 to-transparent" />
    </div>
  );
}

/* ============================================================
   STUDENT MODAL
============================================================ */

function StudentModal({ student, classes, subjects, toast, onClose, onSaved }) {
  const editing = Boolean(student);

  const [form, setForm] = useState({
    full_name: student?.full_name || "",
    father_name: student?.father_name || student?.guardian_name || "",
    phone: student?.phone || "",
    age:
      student?.age !== null && student?.age !== undefined
        ? String(student.age)
        : "",
    gender: student?.gender || "",
    admission_date: toIsoDate(student?.admission_date) || today(),
    guardian_name: student?.guardian_name || "",
    guardian_phone: student?.guardian_phone || "",
    address: student?.address || "",
  });

  const [saving, setSaving] = useState(false);
  const [passwordConfirmOpen, setPasswordConfirmOpen] = useState(false);

  const [selectedClassIds, setSelectedClassIds] = useState(new Set());

  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [sectionOptions, setSectionOptions] = useState([]);
  const [loadingSections, setLoadingSections] = useState(false);

  useEffect(() => {
    if (!student) {
      setSelectedClassIds(new Set());
      return;
    }

    setSelectedClassIds(new Set(getStudentClassIds(student)));
  }, [student]);

  useEffect(() => {
    let cancelled = false;

    async function loadSections() {
      if (!selectedSubject) {
        setSectionOptions([]);
        setSelectedSection("");
        return;
      }

      setLoadingSections(true);

      try {
        const { data } = await api.get(
          `/classes/subjects/${selectedSubject}/books`,
        );

        if (!cancelled) {
          setSectionOptions(normalizeArrayResponse(data));
        }
      } catch (error) {
        if (!cancelled) {
          setSectionOptions([]);

          toast.error(error.response?.data?.error || "Failed to load sections");
        }
      } finally {
        if (!cancelled) {
          setLoadingSections(false);
        }
      }
    }

    loadSections();

    return () => {
      cancelled = true;
    };
  }, [selectedSubject]);

  const availableClasses = useMemo(() => {
    if (!selectedSubject) return [];

    return classes.filter((slot) => {
      if (getSubjectId(slot) !== Number(selectedSubject)) {
        return false;
      }

      if (!selectedSection) {
        return true;
      }

      return getSectionIds(slot).includes(Number(selectedSection));
    });
  }, [classes, selectedSubject, selectedSection]);

  const selectedClasses = useMemo(() => {
    return classes.filter((slot) => selectedClassIds.has(Number(slot.id)));
  }, [classes, selectedClassIds]);

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function toggleClass(id) {
    setSelectedClassIds((current) => {
      const next = new Set(current);
      const numberId = Number(id);

      if (next.has(numberId)) {
        next.delete(numberId);
      } else {
        next.add(numberId);
      }

      return next;
    });
  }

  function handleSave(event) {
    event.preventDefault();

    if (saving) return;

    if (!form.full_name.trim()) {
      toast.error("Please enter the student's full name.");
      return;
    }

    if (!form.father_name.trim()) {
      toast.error("Please enter the father's name.");
      return;
    }

    if (form.age !== "" && form.age !== null && form.age !== undefined) {
      const age = Number(form.age);

      if (!Number.isInteger(age) || age < 0 || age > 120) {
        toast.error("Please enter a valid age between 0 and 120.");
        return;
      }
    }

    if (!editing && selectedClasses.length === 0) {
      toast.error("Please select at least one class.");
      return;
    }

    setPasswordConfirmOpen(true);
  }

  async function saveStudent() {
    if (saving) return;

    setSaving(true);

    try {
      const studentPayload = {
        full_name: form.full_name.trim(),
        guardian_name: form.father_name.trim(),
        phone: form.phone?.trim() || null,
        age: form.age === "" ? null : Number(form.age),
        gender: form.gender || null,
        admission_date: form.admission_date || today(),
        guardian_phone: form.guardian_phone?.trim() || null,
        address: form.address?.trim() || null,
      };

      if (editing) {
        await api.put(`/students/${student.id}`, studentPayload);

        toast.success("Student updated successfully.");

        setPasswordConfirmOpen(false);

        await onSaved();

        return;
      }

      const studentResponse = await api.post("/students", studentPayload);

      const createdStudent =
        studentResponse.data?.student || studentResponse.data;

      const studentId = Number(createdStudent?.id);

      if (!studentId) {
        throw new Error(
          "Student was created, but the backend did not return the student ID.",
        );
      }

      for (const classId of selectedClassIds) {
        await api.post(`/students/${studentId}/classes`, {
          class_slot_id: Number(classId),
        });
      }

      toast.success("Student saved successfully.");

      setPasswordConfirmOpen(false);

      await onSaved();
    } catch (error) {
      console.error("SAVE STUDENT ERROR:", error);

      toast.error(
        error.response?.data?.error ||
          error.response?.data?.message ||
          error.message ||
          "Failed to save student.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title={editing ? "Edit Student" : "Add New Student"}
      subtitle={
        editing
          ? "Update the student's record information"
          : "Create a student record and assign class time slots"
      }
      onClose={saving ? undefined : onClose}
      wide
    >
      <form onSubmit={handleSave} className="flex flex-col min-h-0 flex-1">
        <div className="min-h-0 flex-1 overflow-y-auto pr-1 space-y-4 sm:space-y-5">
          <Section
            icon={UserRound}
            title="Student Information"
            subtitle="Personal and contact information"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field
                label="Full Name"
                required
                value={form.full_name}
                onChange={(value) => updateField("full_name", value)}
                placeholder="Enter full name"
              />

              <Field
                label="Father Name"
                required
                value={form.father_name}
                onChange={(value) => updateField("father_name", value)}
                placeholder="Enter father name"
              />

              <Field
                label="Phone"
                value={form.phone}
                onChange={(value) => updateField("phone", value)}
                placeholder="Phone number"
              />

              <Field
                label="Age"
                type="number"
                min={0}
                max={120}
                value={form.age}
                onChange={(value) => updateField("age", value)}
                placeholder="Enter age in years"
              />

              <SelectField
                label="Gender"
                value={form.gender}
                onChange={(value) => updateField("gender", value)}
                options={[
                  ["", "Select gender"],
                  ["male", "Male"],
                  ["female", "Female"],
                ]}
              />

              {/* ======================================================
                  ADMISSION DATE — SOLAR HIJRI
              ====================================================== */}

              <SolarDateField
                label="Admission Date"
                value={form.admission_date}
                onChange={(value) => updateField("admission_date", value)}
              />

              <Field
                label="Guardian Name"
                value={form.guardian_name}
                onChange={(value) => updateField("guardian_name", value)}
                placeholder="Guardian name"
              />

              <Field
                label="Guardian Phone"
                value={form.guardian_phone}
                onChange={(value) => updateField("guardian_phone", value)}
                placeholder="Guardian phone"
              />

              <div className="md:col-span-2">
                <Field
                  label="Address"
                  value={form.address}
                  onChange={(value) => updateField("address", value)}
                  placeholder="Student address"
                />
              </div>
            </div>
          </Section>

          {!editing && (
            <Section
              icon={BookOpen}
              title="Class Enrollment"
              subtitle="Select subjects and available class time slots"
              right={
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#f2bd19]" />

                  <span className="text-[9px] font-medium text-[#f2bd19]">
                    {selectedClassIds.size} selected
                  </span>
                </div>
              }
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <SelectField
                  label="Subject"
                  value={selectedSubject}
                  onChange={(value) => {
                    setSelectedSubject(value);
                    setSelectedSection("");
                  }}
                  options={[
                    ["", "Select subject"],
                    ...subjects.map((subject) => [subject.id, subject.name]),
                  ]}
                />

                <SelectField
                  label="Section / Level"
                  value={selectedSection}
                  onChange={setSelectedSection}
                  disabled={!selectedSubject || loadingSections}
                  options={[
                    [
                      "",
                      !selectedSubject
                        ? "Select subject first"
                        : loadingSections
                          ? "Loading..."
                          : "All sections",
                    ],
                    ...sectionOptions.map((section) => [
                      section.id,
                      section.name,
                    ]),
                  ]}
                />
              </div>

              <div className="mt-4 space-y-2">
                {!selectedSubject ? (
                  <div className="py-10 text-center rounded-lg border border-dashed border-white/[0.07] bg-[#0b0d10]">
                    <div className="w-9 h-9 mx-auto rounded-lg bg-white/[0.025] border border-white/[0.05] grid place-items-center mb-2">
                      <BookOpen className="w-4 h-4 text-slate-700" />
                    </div>

                    <p className="text-xs text-slate-600">
                      Select a subject first.
                    </p>
                  </div>
                ) : availableClasses.length === 0 ? (
                  <div className="py-10 text-center rounded-lg border border-dashed border-white/[0.07] bg-[#0b0d10]">
                    <div className="w-9 h-9 mx-auto rounded-lg bg-white/[0.025] border border-white/[0.05] grid place-items-center mb-2">
                      <Clock3 className="w-4 h-4 text-slate-700" />
                    </div>

                    <p className="text-xs text-slate-600">
                      No class time slots available.
                    </p>
                  </div>
                ) : (
                  availableClasses.map((slot) => {
                    const selected = selectedClassIds.has(Number(slot.id));

                    return (
                      <button
                        type="button"
                        key={slot.id}
                        onClick={() => toggleClass(slot.id)}
                        className={`w-full text-left p-3 rounded-lg border transition ${
                          selected
                            ? "border-[#f2bd19]/40 bg-[#f2bd19]/[0.06] shadow-[0_0_24px_rgba(242,189,25,0.035)]"
                            : "border-white/[0.06] bg-[#0b0d10] hover:border-[#f2bd19]/20 hover:bg-[#f2bd19]/[0.025]"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-lg grid place-items-center border shrink-0 ${
                              selected
                                ? "border-[#f2bd19]/30 bg-[#f2bd19]/10"
                                : "border-white/[0.06] bg-white/[0.015]"
                            }`}
                          >
                            {selected ? (
                              <Check className="w-4 h-4 text-[#f2bd19]" />
                            ) : (
                              <Clock3 className="w-4 h-4 text-slate-700" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-semibold text-slate-300 truncate">
                              {classLabel(slot, subjects)}
                            </p>

                            <div className="flex flex-wrap gap-3 mt-1">
                              <span className="text-[9px] text-slate-600">
                                {formatTime(slot.start_time)} -{" "}
                                {formatTime(slot.end_time)}
                              </span>

                              <span className="text-[9px] text-slate-600">
                                {getTeacherName(slot)}
                              </span>
                            </div>
                          </div>

                          {selected && (
                            <span className="hidden sm:inline-flex text-[8px] uppercase tracking-[0.12em] text-[#f2bd19]/70">
                              Selected
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {selectedClasses.length > 0 && (
                <div className="mt-4 p-3 rounded-lg border border-[#f2bd19]/10 bg-[#f2bd19]/[0.025]">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <p className="text-[9px] uppercase tracking-[0.12em] text-slate-600">
                      Selected Classes
                    </p>

                    <span className="text-[9px] text-[#f2bd19]/70">
                      {selectedClasses.length}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {selectedClasses.map((slot) => (
                      <div
                        key={slot.id}
                        className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-[#0b0d10] border border-white/[0.05]"
                      >
                        <div className="min-w-0">
                          <p className="text-[10px] text-slate-400 truncate">
                            {classLabel(slot, subjects)}
                          </p>

                          <p className="text-[8px] text-slate-700 mt-0.5">
                            {getTeacherName(slot)} •{" "}
                            {formatTime(slot.start_time)}-
                            {formatTime(slot.end_time)}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleClass(slot.id)}
                          className="w-7 h-7 shrink-0 rounded-md grid place-items-center text-slate-700 hover:text-red-400 hover:bg-red-500/10 transition"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Section>
          )}
        </div>

        <div className="shrink-0 mt-4 pt-4 border-t border-white/[0.08] bg-[#121519] flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-10 sm:h-11 px-5 rounded-lg border border-white/10 bg-[#0d1013] text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] transition disabled:opacity-40"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={saving}
            className="h-10 sm:h-11 px-6 rounded-lg bg-[#f2bd19] text-[#0b0d10] text-sm font-bold hover:bg-[#ffd34d] transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-[#f2bd19]/10"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving Student...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                {editing ? "SAVE CHANGES" : "SAVE STUDENT"}
              </>
            )}
          </button>
        </div>
      </form>

      <PasswordConfirmModal
        open={passwordConfirmOpen}
        title={
          editing ? "Confirm student edit" : "Confirm student registration"
        }
        description={
          editing
            ? `Enter your password to save changes to ${student?.full_name}.`
            : "Enter your password to create this student."
        }
        confirmLabel={editing ? "Verify & Save" : "Verify & Register"}
        onVerified={saveStudent}
        onCancel={() => {
          if (!saving) {
            setPasswordConfirmOpen(false);
          }
        }}
      />
    </ModalShell>
  );
}

/* ============================================================
   ENROLLMENT MODAL
============================================================ */

function EnrollmentModal({
  student,
  classes,
  subjects,
  toast,
  onClose,
  onSaved,
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedSection, setSelectedSection] = useState("");

  const [sections, setSections] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const [passwordConfirmOpen, setPasswordConfirmOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      try {
        const { data } = await api.get(`/students/${student.id}/classes`);

        if (!cancelled) {
          const ids = normalizeArrayResponse(data).map(getEnrollmentClassId);

          setSelectedIds(
            new Set(ids.filter((id) => Number.isFinite(id) && id > 0)),
          );
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(
            error.response?.data?.error || "Failed to load student classes",
          );

          setSelectedIds(new Set(getStudentClassIds(student)));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [student.id]);

  useEffect(() => {
    let cancelled = false;

    async function loadSections() {
      if (!selectedSubject) {
        setSections([]);
        setSelectedSection("");
        return;
      }

      try {
        const { data } = await api.get(
          `/classes/subjects/${selectedSubject}/books`,
        );

        if (!cancelled) {
          setSections(normalizeArrayResponse(data));
        }
      } catch (error) {
        if (!cancelled) {
          setSections([]);

          toast.error(error.response?.data?.error || "Failed to load sections");
        }
      }
    }

    loadSections();

    return () => {
      cancelled = true;
    };
  }, [selectedSubject]);

  const availableClasses = useMemo(() => {
    if (!selectedSubject) return [];

    return classes.filter((slot) => {
      if (getSubjectId(slot) !== Number(selectedSubject)) {
        return false;
      }

      if (!selectedSection) {
        return true;
      }

      return getSectionIds(slot).includes(Number(selectedSection));
    });
  }, [classes, selectedSubject, selectedSection]);

  function toggle(id) {
    setSelectedIds((current) => {
      const next = new Set(current);
      const numberId = Number(id);

      if (next.has(numberId)) {
        next.delete(numberId);
      } else {
        next.add(numberId);
      }

      return next;
    });
  }

  function save() {
    if (saving) return;

    setPasswordConfirmOpen(true);
  }

  async function confirmSave() {
    if (saving) return;

    setSaving(true);

    try {
      const currentResponse = await api.get(`/students/${student.id}/classes`);

      const currentIds = new Set(
        normalizeArrayResponse(currentResponse.data)
          .map(getEnrollmentClassId)
          .filter((id) => Number.isFinite(id) && id > 0),
      );

      for (const id of selectedIds) {
        if (!currentIds.has(Number(id))) {
          await api.post(`/students/${student.id}/classes`, {
            class_slot_id: Number(id),
          });
        }
      }

      for (const id of currentIds) {
        if (!selectedIds.has(Number(id))) {
          await api.delete(`/students/${student.id}/classes/${id}`);
        }
      }

      toast.success("Student classes updated successfully");

      setPasswordConfirmOpen(false);

      await onSaved();
    } catch (error) {
      toast.error(
        error.response?.data?.error || "Failed to update student classes",
      );
    } finally {
      setSaving(false);
    }
  }

  const selectedClasses = classes.filter((slot) =>
    selectedIds.has(Number(slot.id)),
  );

  return (
    <ModalShell
      title="Student Classes"
      subtitle={`${student.full_name} • select multiple class time slots`}
      onClose={saving ? undefined : onClose}
      wide
    >
      {loading ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <LoadingState />
        </div>
      ) : (
        <div className="min-h-0 flex flex-col flex-1">
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <Section
              icon={BookOpen}
              title="Class Enrollment"
              subtitle="Choose the student's subjects and class time slots"
              right={
                <span className="text-[9px] text-[#f2bd19]">
                  {selectedClasses.length}{" "}
                  {selectedClasses.length === 1 ? "class" : "classes"}
                </span>
              }
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <SelectField
                  label="Subject"
                  value={selectedSubject}
                  onChange={(value) => {
                    setSelectedSubject(value);
                    setSelectedSection("");
                  }}
                  options={[
                    ["", "Select subject"],
                    ...subjects.map((subject) => [subject.id, subject.name]),
                  ]}
                />

                <SelectField
                  label="Section / Level"
                  value={selectedSection}
                  onChange={setSelectedSection}
                  disabled={!selectedSubject}
                  options={[
                    ["", "All sections"],
                    ...sections.map((section) => [section.id, section.name]),
                  ]}
                />
              </div>

              <div className="mt-4">
                {!selectedSubject ? (
                  <div className="rounded-lg border border-dashed border-white/[0.07] bg-[#0d1013] py-12 text-center">
                    <div className="w-9 h-9 mx-auto rounded-lg bg-white/[0.025] border border-white/[0.05] grid place-items-center mb-2">
                      <BookOpen className="w-4 h-4 text-slate-700" />
                    </div>

                    <p className="text-xs text-slate-600">
                      Select a subject to see its sections and available
                      classes.
                    </p>
                  </div>
                ) : availableClasses.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-white/[0.07] bg-[#0d1013] px-4 py-10 text-center">
                    <div className="w-9 h-9 mx-auto rounded-lg bg-white/[0.025] border border-white/[0.05] grid place-items-center mb-2">
                      <Clock3 className="w-4 h-4 text-slate-700" />
                    </div>

                    <p className="text-xs text-slate-600">
                      No class time slots found.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {availableClasses.map((slot) => {
                      const selected = selectedIds.has(Number(slot.id));

                      return (
                        <button
                          type="button"
                          key={slot.id}
                          onClick={() => toggle(slot.id)}
                          className={`w-full text-left rounded-lg border p-3 transition ${
                            selected
                              ? "border-[#f2bd19]/40 bg-[#f2bd19]/[0.06] shadow-[0_0_24px_rgba(242,189,25,0.035)]"
                              : "border-white/[0.06] bg-[#0d1013] hover:border-[#f2bd19]/20 hover:bg-[#f2bd19]/[0.025]"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-8 h-8 rounded-lg grid place-items-center border shrink-0 ${
                                selected
                                  ? "bg-[#f2bd19]/10 border-[#f2bd19]/25"
                                  : "bg-white/[0.02] border-white/[0.06]"
                              }`}
                            >
                              {selected ? (
                                <Check className="w-4 h-4 text-[#f2bd19]" />
                              ) : (
                                <Clock3 className="w-4 h-4 text-slate-700" />
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-semibold text-slate-300 truncate">
                                {classLabel(slot, subjects)}
                              </p>

                              <div className="flex flex-wrap gap-3 mt-1">
                                <span className="text-[9px] text-slate-600">
                                  {formatTime(slot.start_time)}-
                                  {formatTime(slot.end_time)}
                                </span>

                                <span className="text-[9px] text-slate-600">
                                  {getTeacherName(slot)}
                                </span>
                              </div>
                            </div>

                            {selected && (
                              <span className="hidden sm:inline-flex text-[8px] uppercase tracking-[0.12em] text-[#f2bd19]/70">
                                Selected
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {selectedClasses.length > 0 && (
                <div className="mt-4 rounded-lg border border-[#f2bd19]/10 bg-[#f2bd19]/[0.025] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[9px] uppercase tracking-[0.12em] text-slate-600">
                      Current Selection
                    </p>

                    <span className="text-[9px] text-[#f2bd19]">
                      {selectedClasses.length}{" "}
                      {selectedClasses.length === 1 ? "class" : "classes"}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {selectedClasses.map((slot) => (
                      <div
                        key={slot.id}
                        className="flex justify-between gap-3 rounded-md bg-[#0d1013] border border-white/[0.05] px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-[10px] text-slate-400 truncate">
                            {classLabel(slot, subjects)}
                          </p>

                          <p className="text-[8px] text-slate-700 mt-0.5">
                            {getTeacherName(slot)} •{" "}
                            {formatTime(slot.start_time)}-
                            {formatTime(slot.end_time)}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggle(slot.id)}
                          className="w-7 h-7 shrink-0 rounded-md grid place-items-center text-slate-700 hover:text-red-400 hover:bg-red-500/10 transition"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Section>
          </div>

          <div className="shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-4 pt-4 border-t border-white/[0.06] bg-[#121519]">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="h-10 px-4 rounded-lg border border-white/10 bg-white/[0.02] text-sm text-slate-500 hover:text-white hover:bg-white/[0.04] transition disabled:opacity-40"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="h-10 px-5 rounded-lg bg-[#f2bd19] text-[#0b0d10] text-sm font-bold hover:bg-[#ffd34d] transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Save Classes
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <PasswordConfirmModal
        open={passwordConfirmOpen}
        title="Confirm class changes"
        description={`Enter your password to update ${student.full_name}'s classes.`}
        confirmLabel="Verify & Save"
        onVerified={confirmSave}
        onCancel={() => {
          if (!saving) {
            setPasswordConfirmOpen(false);
          }
        }}
      />
    </ModalShell>
  );
}

/* ============================================================
   MODAL SHELL
============================================================ */

function ModalShell({ title, subtitle, children, onClose, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4">
      <div
        className={`w-full ${
          wide ? "max-w-5xl" : "max-w-2xl"
        } h-auto max-h-[96vh] rounded-xl sm:rounded-2xl bg-[#121519] border border-white/[0.09] shadow-[0_20px_90px_rgba(0,0,0,0.60)] overflow-hidden flex flex-col`}
      >
        <div className="shrink-0 px-4 sm:px-5 py-3.5 sm:py-4 border-b border-white/[0.06] flex items-center justify-between gap-3 bg-[#101317]">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#f2bd19] shrink-0" />

              <h3 className="text-sm font-semibold text-white truncate">
                {title}
              </h3>
            </div>

            <p className="text-[9px] sm:text-[10px] text-slate-600 mt-1 ml-3.5 truncate">
              {subtitle}
            </p>
          </div>

          <button
            type="button"
            disabled={!onClose}
            onClick={onClose}
            className="w-8 h-8 shrink-0 rounded-lg grid place-items-center text-slate-600 hover:text-white hover:bg-white/[0.05] transition disabled:opacity-30"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 p-3.5 sm:p-5 overflow-hidden flex flex-col">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   SECTION
============================================================ */

function Section({ icon: Icon, title, subtitle, right, children }) {
  return (
    <section className="rounded-xl border border-white/[0.06] bg-[#0d1013] overflow-hidden">
      <div className="px-3.5 sm:px-4 py-3 border-b border-white/[0.05] bg-[#101317] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 shrink-0 rounded-lg bg-[#f2bd19]/10 border border-[#f2bd19]/15 grid place-items-center">
            <Icon className="w-4 h-4 text-[#f2bd19]" />
          </div>

          <div className="min-w-0">
            <h4 className="text-[11px] font-semibold text-slate-300">
              {title}
            </h4>

            <p className="text-[9px] text-slate-700 mt-0.5 truncate">
              {subtitle}
            </p>
          </div>
        </div>

        {right}
      </div>

      <div className="p-3.5 sm:p-4">{children}</div>
    </section>
  );
}

/* ============================================================
   FIELD
============================================================ */

function Field({
  label,
  required,
  value,
  onChange,
  placeholder,
  type = "text",
  min,
  max,
  step,
}) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-slate-500 mb-1.5">
        {label}

        {required && <span className="text-[#f2bd19] ml-1">*</span>}
      </label>

      <input
        type={type}
        min={min}
        max={max}
        step={step}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 px-3 rounded-lg bg-[#0b0d10] border border-white/10 text-sm text-slate-300 outline-none focus:border-[#f2bd19]/50 focus:bg-[#0c0f12] placeholder:text-slate-700 transition"
      />
    </div>
  );
}

/* ============================================================
   SELECT
============================================================ */

function SelectField({ label, value, onChange, options, disabled = false }) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-slate-500 mb-1.5">
        {label}
      </label>

      <div className="relative">
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full h-10 px-3 pr-8 rounded-lg bg-[#0b0d10] border border-white/10 text-sm text-slate-300 outline-none focus:border-[#f2bd19]/50 disabled:opacity-40 appearance-none transition"
        >
          {options.map(([optionValue, optionLabel]) => (
            <option key={String(optionValue)} value={optionValue}>
              {optionLabel}
            </option>
          ))}
        </select>

        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-700 pointer-events-none" />
      </div>
    </div>
  );
}
