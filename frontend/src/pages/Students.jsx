import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import PasswordConfirmModal from "../components/PasswordConfirmModal";
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
  Phone,
  BookOpen,
  ChevronDown,
  Clock3,
  UserPlus,
  Check,
  AlertCircle,
  CreditCard,
  Wallet,
} from "lucide-react";

const EMPTY_STUDENT = {
  full_name: "",
  father_name: "",
  phone: "",
  dob: "",
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

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-");

    return `${month}/${day}/${String(year).slice(-2)}`;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kabul",
  }).format(date);
}

function normalizeArrayResponse(data) {
  if (Array.isArray(data)) return data;

  if (Array.isArray(data?.students)) return data.students;
  if (Array.isArray(data?.classes)) return data.classes;
  if (Array.isArray(data?.subjects)) return data.subjects;
  if (Array.isArray(data?.books)) return data.books;
  if (Array.isArray(data?.sections)) return data.sections;
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.class_slots)) return data.class_slots;
  if (Array.isArray(data?.enrolled_classes)) return data.enrolled_classes;

  return [];
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

function money(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "0";
  }

  return number.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
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
    <div className="min-h-full bg-[#0b0d10] text-slate-100 p-5 sm:p-6">
      <div className="max-w-[1600px] mx-auto space-y-5">
        {/* HEADER */}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#f2bd19]/10 border border-[#f2bd19]/20 grid place-items-center">
              <GraduationCap className="w-5 h-5 text-[#f2bd19]" />
            </div>

            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">
                Students
              </h2>

              <p className="text-xs text-slate-500 mt-0.5">
                Manage student records, classes and enrollment
              </p>
            </div>
          </div>

          {canEdit && (
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={refresh}
                disabled={refreshing}
                className="h-10 px-3 rounded-lg border border-white/10 bg-[#121519] text-slate-400 hover:text-white hover:bg-white/[0.04] transition flex items-center justify-center gap-2 text-sm"
              >
                <RefreshCw
                  className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
                />
                Refresh
              </button>

              <button
                type="button"
                onClick={openCreate}
                className="h-10 px-4 rounded-lg bg-[#f2bd19] text-[#0b0d10] text-sm font-bold flex items-center justify-center gap-2 hover:bg-[#ffd34d] transition"
              >
                <Plus className="w-4 h-4" />
                Add Student
              </button>
            </div>
          )}

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
        </div>

        {/* SUMMARY */}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SummaryCard
            icon={Users}
            label="Total Students"
            value={students.length}
          />

          <SummaryCard icon={UserPlus} label="Enrolled" value={enrolledCount} />

          <SummaryCard
            icon={AlertCircle}
            label="Not Enrolled"
            value={notEnrolledCount}
          />
        </div>

        {/* FILTERS */}

        <div className="rounded-xl bg-[#121519] border border-white/10 p-3">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by student, ID, father name or phone..."
                className="w-full h-10 pl-9 pr-3 rounded-lg bg-[#0d1013] border border-white/10 text-sm text-slate-200 outline-none focus:border-[#f2bd19]/50 placeholder:text-slate-700"
              />
            </div>

            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-[#0d1013] border border-white/10 text-sm text-slate-300 outline-none focus:border-[#f2bd19]/50"
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
          </div>
        </div>

        {/* TABLE */}

        <div className="rounded-xl bg-[#121519] border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="px-4 py-2.5 text-left text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-700">
                    Student
                  </th>

                  <th className="px-4 py-2.5 text-left text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-700">
                    Father
                  </th>

                  <th className="px-4 py-2.5 text-left text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-700">
                    Subjects / Classes
                  </th>

                  <th className="px-4 py-2.5 text-left text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-700">
                    Phone
                  </th>

                  <th className="px-4 py-2.5 text-left text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-700">
                    DOB
                  </th>

                  <th className="px-4 py-2.5 text-right text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-700">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/[0.04]">
                {loading ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="py-16 flex flex-col items-center gap-3">
                        <Loader2 className="w-6 h-6 text-[#f2bd19] animate-spin" />

                        <span className="text-xs text-slate-600">
                          Loading students...
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="py-16 text-center">
                        <Users className="w-7 h-7 mx-auto text-slate-700 mb-3" />

                        <h3 className="text-sm font-semibold text-slate-300">
                          No students found
                        </h3>

                        <p className="text-xs text-slate-600 mt-1">
                          Add a student or change your search.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((student) => {
                    const studentEnrollments = getStudentEnrollments(student);

                    return (
                      <tr
                        key={student.id}
                        className="group hover:bg-white/[0.016] transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 shrink-0 rounded-lg border border-white/[0.07] bg-[#0d1013] grid place-items-center text-[9px] font-bold text-[#f2bd19]">
                              {student.full_name
                                ?.split(" ")
                                .map((x) => x[0])
                                .slice(0, 2)
                                .join("")
                                .toUpperCase() || "?"}
                            </div>

                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold text-slate-300 truncate">
                                {student.full_name || "—"}
                              </p>

                              <p className="mt-1 inline-flex items-center rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-amber-400 shadow-sm">
                                Student ID #{student.id}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <span className="text-[10px] text-slate-500">
                            {student.father_name ||
                              student.guardian_name ||
                              "—"}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          {studentEnrollments.length === 0 ? (
                            <button
                              type="button"
                              onClick={() => openEnrollment(student)}
                              className="text-[10px] text-slate-600 hover:text-[#f2bd19] transition"
                            >
                              Not enrolled
                            </button>
                          ) : (
                            <div className="space-y-1.5 max-w-[430px]">
                              {studentEnrollments
                                .slice(0, 3)
                                .map((slot, index) => (
                                  <button
                                    type="button"
                                    key={
                                      slot.enrollment_id ||
                                      slot.class_slot_id ||
                                      slot.id ||
                                      index
                                    }
                                    onClick={() => openEnrollment(student)}
                                    className="block w-full text-left"
                                  >
                                    <div className="flex items-center gap-2">
                                      <BookOpen className="w-3 h-3 shrink-0 text-[#f2bd19]/60" />

                                      <span className="text-[10px] font-medium text-slate-400 truncate">
                                        {classLabel(slot, subjects)}
                                      </span>

                                      <span className="text-[9px] text-slate-700 shrink-0">
                                        {formatTime(slot.start_time)}-
                                        {formatTime(slot.end_time)}
                                      </span>
                                    </div>
                                  </button>
                                ))}

                              {studentEnrollments.length > 3 && (
                                <button
                                  type="button"
                                  onClick={() => openEnrollment(student)}
                                  className="text-[9px] text-[#f2bd19]/70 hover:text-[#f2bd19]"
                                >
                                  +{studentEnrollments.length - 3} more
                                </button>
                              )}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Phone className="w-3 h-3 text-slate-700" />

                            <span className="text-[10px] text-slate-500">
                              {student.phone || "—"}
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <span className="text-[10px] text-slate-500">
                            {formatDate(student.dob)}
                          </span>
                        </td>

                        <td className="px-4 py-3">
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
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
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
   SUMMARY CARD
============================================================ */

function SummaryCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl bg-[#121519] border border-white/10 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] uppercase tracking-[0.14em] text-slate-700">
            {label}
          </p>

          <p className="mt-1 text-xl font-bold text-white">{value}</p>
        </div>

        <div className="w-9 h-9 rounded-lg bg-[#f2bd19]/10 border border-[#f2bd19]/15 grid place-items-center">
          <Icon className="w-4 h-4 text-[#f2bd19]" />
        </div>
      </div>
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
    dob: student?.dob ? String(student.dob).slice(0, 10) : "",
    gender: student?.gender || "",
    admission_date: student?.admission_date
      ? String(student.admission_date).slice(0, 10)
      : today(),
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

  /*
   * Payment is now keyed by CLASS SLOT.
   *
   * This is important:
   *
   * English / Book 1 / Ahmad / 2-3
   *
   * and
   *
   * English / Book 2 / Ahmad / 2-3
   *
   * are separate fees.
   */
  const [payments, setPayments] = useState({});

  /* ============================================================
     LOAD EXISTING ENROLLMENTS WHEN EDITING
  ============================================================ */

  useEffect(() => {
    if (!student) {
      setSelectedClassIds(new Set());
      return;
    }

    setSelectedClassIds(new Set(getStudentClassIds(student)));
  }, [student]);

  /* ============================================================
     LOAD SECTIONS
  ============================================================ */

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

  /* ============================================================
     AVAILABLE CLASSES
  ============================================================ */

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

  /* ============================================================
     SELECTED CLASSES
  ============================================================ */

  const selectedClasses = useMemo(() => {
    return classes.filter((slot) => selectedClassIds.has(Number(slot.id)));
  }, [classes, selectedClassIds]);

  /* ============================================================
     PAYMENT STATE
  ============================================================ */

  useEffect(() => {
    if (editing) return;

    setPayments((current) => {
      const next = {};

      for (const slot of selectedClasses) {
        const classId = Number(slot.id);
        const existing = current[classId];

        next[classId] = {
          total_amount: existing?.total_amount ?? "",
          paid_amount: existing?.paid_amount ?? "",
          payment_date: existing?.payment_date || today(),
          comment: existing?.comment || "",
        };
      }

      return next;
    });
  }, [selectedClasses, editing]);

  /* ============================================================
     UPDATE FORM
  ============================================================ */

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  /* ============================================================
     TOGGLE CLASS
  ============================================================ */

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

  /* ============================================================
     UPDATE PAYMENT
  ============================================================ */

  function updatePayment(classSlotId, field, value) {
    setPayments((current) => ({
      ...current,

      [classSlotId]: {
        ...(current[classSlotId] || {}),
        [field]: value,
      },
    }));
  }

  /* ============================================================
     SAVE STUDENT
  ============================================================ */

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

    if (!editing && selectedClassIds.size === 0) {
      toast.error("Please select at least one class.");
      return;
    }

    if (!editing) {
      for (const slot of selectedClasses) {
        const payment = payments[Number(slot.id)] || {};

        const totalRaw = String(payment.total_amount ?? "").trim();

        const paidRaw = String(payment.paid_amount ?? "").trim();

        const label = classLabel(slot, subjects);

        if (!totalRaw) {
          toast.error(`Please enter the total fee for ${label}.`);
          return;
        }

        const total = Number(totalRaw);

        const paid = paidRaw === "" ? 0 : Number(paidRaw);

        if (!Number.isFinite(total) || total <= 0) {
          toast.error(`Invalid total fee for ${label}.`);
          return;
        }

        if (!Number.isFinite(paid) || paid < 0) {
          toast.error(`Invalid amount paid for ${label}.`);
          return;
        }

        if (paid > total) {
          toast.error(
            `Amount paid cannot be greater than the total fee for ${label}.`,
          );
          return;
        }

        if (paid > 0 && !payment.payment_date) {
          toast.error(`Please select a payment date for ${label}.`);
          return;
        }

        if (total % 10 !== 0 || (paid > 0 && paid % 10 !== 0)) {
          toast.error(`Fee amounts must be multiples of 10 for ${label}.`);
          return;
        }
      }
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

        dob: form.dob || null,

        gender: form.gender || null,

        admission_date: form.admission_date || today(),

        guardian_phone: form.guardian_phone?.trim() || null,

        address: form.address?.trim() || null,
      };

      /* ========================================================
         EDIT
      ======================================================== */

      if (editing) {
        await api.put(`/students/${student.id}`, studentPayload);

        toast.success("Student updated successfully.");

        setPasswordConfirmOpen(false);

        await onSaved();

        return;
      }

      /* ========================================================
         CREATE STUDENT
      ======================================================== */

      const studentResponse = await api.post("/students", studentPayload);

      const createdStudent =
        studentResponse.data?.student || studentResponse.data;

      const studentId = Number(createdStudent?.id);

      if (!studentId) {
        throw new Error(
          "Student was created, but the backend did not return the student ID.",
        );
      }

      /* ========================================================
         CREATE ENROLLMENTS + REMEMBER ENROLLMENT IDS
      ======================================================== */

      const enrollmentByClassId = new Map();

      for (const classId of selectedClassIds) {
        const enrollmentResponse = await api.post(
          `/students/${studentId}/classes`,
          {
            class_slot_id: Number(classId),
          },
        );

        const enrollment =
          enrollmentResponse.data?.enrollment || enrollmentResponse.data;

        const enrollmentId = Number(
          enrollment?.id || enrollment?.enrollment_id,
        );

        if (!enrollmentId) {
          throw new Error(
            `Enrollment for class ${classId} was created but no enrollment ID was returned.`,
          );
        }

        enrollmentByClassId.set(Number(classId), enrollmentId);
      }

      /* ========================================================
         CREATE PERIOD-BASED FEES
      ======================================================== */

      for (const slot of selectedClasses) {
        const classSlotId = Number(slot.id);

        const enrollmentId = enrollmentByClassId.get(classSlotId);

        if (!enrollmentId) {
          throw new Error(
            `Enrollment ID was not found for ${classLabel(slot, subjects)}.`,
          );
        }

        const payment = payments[classSlotId] || {};

        const monthlyAmount = Number(payment.total_amount);

        const paidAmount =
          payment.paid_amount === "" ||
          payment.paid_amount === undefined ||
          payment.paid_amount === null
            ? 0
            : Number(payment.paid_amount);

        /*
         * The visible payment date is Gregorian because
         * this is an HTML date input.
         *
         * The current fees API requires Solar Hijri,
         * so the backend conversion is handled by
         * /students/create-complete-compatible logic
         * through this request.
         *
         * We send the Gregorian date in the additional
         * field and the backend fees route receives the
         * Solar value generated below.
         */

        const paymentDate = payment.payment_date || today();

        const solarResponse = await api.post("/fees/solar-date", {
          gregorian_date: paymentDate,
        });

        const solarDate = solarResponse.data?.solar_date;

        if (!solarDate) {
          throw new Error(
            `Could not convert payment date for ${classLabel(slot, subjects)}.`,
          );
        }

        const [solarYear, solarMonth, solarDay] = String(solarDate)
          .split("/")
          .map(Number);

        const monthDays =
          solarMonth >= 1 && solarMonth <= 6
            ? 31
            : solarMonth >= 7 && solarMonth <= 11
              ? 30
              : solarDay;

        const feePayload = {
          student_id: studentId,

          enrollment_id: enrollmentId,

          from_solar_date: `${solarYear}/${String(solarMonth).padStart(
            2,
            "0",
          )}/01`,

          to_solar_date: `${solarYear}/${String(solarMonth).padStart(
            2,
            "0",
          )}/${String(monthDays).padStart(2, "0")}`,

          monthly_amounts: [
            {
              solar_year: solarYear,
              solar_month: solarMonth,
              monthly_amount: monthlyAmount,
            },
          ],

          initial_paid_amount: paidAmount,

          initial_payment_solar_date: solarDate,

          initial_payment_comment: payment.comment?.trim() || null,

          description: "Student enrollment",
        };

        await api.post("/fees", feePayload);
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
          ? "Update student information"
          : "Enter student information and enrollment details"
      }
      onClose={saving ? undefined : onClose}
      wide
    >
      <form onSubmit={handleSave} className="flex flex-col min-h-0 flex-1">
        <div className="min-h-0 flex-1 overflow-y-auto pr-1 space-y-5">
          <Section
            icon={UserRound}
            title="Student Information"
            subtitle="Basic student information"
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
                label="Date of Birth"
                type="date"
                value={form.dob}
                onChange={(value) => updateField("dob", value)}
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

              <Field
                label="Admission Date"
                type="date"
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

          {/* ====================================================
              CLASS ENROLLMENT
          ==================================================== */}

          {!editing && (
            <Section
              icon={BookOpen}
              title="Class Enrollment"
              subtitle="Select the student's subjects and class time slots"
              right={
                <span className="text-[9px] text-[#f2bd19]">
                  {selectedClassIds.size} selected
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
                  <div className="py-8 text-center rounded-lg border border-white/[0.06] bg-[#0b0d10]">
                    <BookOpen className="w-5 h-5 mx-auto text-slate-700 mb-2" />

                    <p className="text-xs text-slate-600">
                      Select a subject first.
                    </p>
                  </div>
                ) : availableClasses.length === 0 ? (
                  <div className="py-8 text-center rounded-lg border border-white/[0.06] bg-[#0b0d10]">
                    <Clock3 className="w-5 h-5 mx-auto text-slate-700 mb-2" />

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
                            ? "border-[#f2bd19]/40 bg-[#f2bd19]/[0.06]"
                            : "border-white/[0.06] bg-[#0b0d10] hover:border-[#f2bd19]/20"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-lg grid place-items-center border ${
                              selected
                                ? "border-[#f2bd19]/30 bg-[#f2bd19]/10"
                                : "border-white/[0.06]"
                            }`}
                          >
                            {selected ? (
                              <Check className="w-4 h-4 text-[#f2bd19]" />
                            ) : (
                              <Clock3 className="w-4 h-4 text-slate-700" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-semibold text-slate-300">
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
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {selectedClasses.length > 0 && (
                <div className="mt-4 p-3 rounded-lg border border-[#f2bd19]/10 bg-[#f2bd19]/[0.025]">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-slate-600 mb-2">
                    Selected Classes
                  </p>

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
                          className="w-6 h-6 shrink-0 rounded-md grid place-items-center text-slate-700 hover:text-red-400 hover:bg-red-500/10"
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

          {/* ====================================================
              PAYMENTS
          ==================================================== */}

          {!editing && (
            <Section
              icon={CreditCard}
              title="Subject Payments"
              subtitle="Enter the fee for each selected class"
            >
              {selectedClasses.length === 0 ? (
                <div className="py-8 text-center rounded-lg border border-white/[0.06] bg-[#0b0d10]">
                  <Wallet className="w-5 h-5 mx-auto text-slate-700 mb-2" />

                  <p className="text-xs text-slate-600">
                    Select class time slots first.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedClasses.map((slot) => {
                    const classSlotId = Number(slot.id);

                    const payment = payments[classSlotId] || {};

                    const total = Number(payment.total_amount || 0);

                    const paid = Number(payment.paid_amount || 0);

                    const remaining = Math.max(0, total - paid);

                    return (
                      <div
                        key={classSlotId}
                        className="p-4 rounded-xl border border-white/[0.06] bg-[#0b0d10]"
                      >
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-8 h-8 rounded-lg bg-[#f2bd19]/10 border border-[#f2bd19]/15 grid place-items-center">
                            <BookOpen className="w-4 h-4 text-[#f2bd19]" />
                          </div>

                          <div>
                            <p className="text-[11px] font-semibold text-slate-300">
                              {classLabel(slot, subjects)}
                            </p>

                            <p className="text-[8px] text-slate-700">
                              {getTeacherName(slot)} •{" "}
                              {formatTime(slot.start_time)}-
                              {formatTime(slot.end_time)}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <Field
                            label="Total Fee (AFN)"
                            required
                            type="number"
                            min="0"
                            step="10"
                            value={payment.total_amount || ""}
                            onChange={(value) =>
                              updatePayment(classSlotId, "total_amount", value)
                            }
                            placeholder="Monthly fee"
                          />

                          <Field
                            label="Amount Paid (AFN)"
                            type="number"
                            min="0"
                            step="10"
                            value={payment.paid_amount || ""}
                            onChange={(value) =>
                              updatePayment(classSlotId, "paid_amount", value)
                            }
                            placeholder="0"
                          />

                          <Field
                            label="Payment Date"
                            type="date"
                            value={payment.payment_date || ""}
                            onChange={(value) =>
                              updatePayment(classSlotId, "payment_date", value)
                            }
                          />
                        </div>

                        <div className="mt-3">
                          <Field
                            label="Comment"
                            value={payment.comment || ""}
                            onChange={(value) =>
                              updatePayment(classSlotId, "comment", value)
                            }
                            placeholder="Optional payment comment"
                          />
                        </div>

                        <div className="mt-3 px-3 py-2 rounded-lg bg-[#121519] border border-white/[0.05] flex items-center justify-between">
                          <span className="text-[9px] uppercase tracking-wider text-slate-700">
                            Remaining
                          </span>

                          <span className="text-sm font-semibold text-slate-300">
                            {money(remaining)} AFN
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>
          )}
        </div>

        {/* SAVE */}

        <div className="shrink-0 mt-4 pt-4 border-t border-white/[0.08] bg-[#121519] flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-11 px-5 rounded-lg border border-white/10 bg-[#0d1013] text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] transition disabled:opacity-40"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={saving}
            className="h-11 px-6 rounded-lg bg-[#f2bd19] text-[#0b0d10] text-sm font-bold hover:bg-[#ffd34d] transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-[#f2bd19]/10"
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
          <div className="py-16 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 text-[#f2bd19] animate-spin" />

            <span className="text-xs text-slate-600">
              Loading enrollment...
            </span>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex flex-col flex-1">
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
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
                <div className="rounded-lg border border-white/[0.06] bg-[#0d1013] py-10 text-center">
                  <BookOpen className="w-5 h-5 mx-auto text-slate-700 mb-2" />

                  <p className="text-xs text-slate-600">
                    Select a subject to see its sections and available classes.
                  </p>
                </div>
              ) : availableClasses.length === 0 ? (
                <div className="rounded-lg border border-white/[0.06] bg-[#0d1013] px-4 py-8 text-center">
                  <Clock3 className="w-5 h-5 mx-auto text-slate-700 mb-2" />

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
                            ? "border-[#f2bd19]/40 bg-[#f2bd19]/[0.06]"
                            : "border-white/[0.06] bg-[#0d1013] hover:border-[#f2bd19]/20"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-lg grid place-items-center border ${
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
                            <p className="text-[11px] font-semibold text-slate-300">
                              {classLabel(slot, subjects)}
                            </p>

                            <div className="flex gap-3 mt-1">
                              <span className="text-[9px] text-slate-600">
                                {formatTime(slot.start_time)}-
                                {formatTime(slot.end_time)}
                              </span>

                              <span className="text-[9px] text-slate-600">
                                {getTeacherName(slot)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedClasses.length > 0 && (
              <div className="mt-4 rounded-lg border border-[#f2bd19]/10 bg-[#f2bd19]/[0.025] p-3">
                <div className="flex justify-between mb-2">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-slate-600">
                    Current Selection
                  </p>

                  <span className="text-[9px] text-[#f2bd19]">
                    {selectedClasses.length} classes
                  </span>
                </div>

                <div className="space-y-1.5">
                  {selectedClasses.map((slot) => (
                    <div
                      key={slot.id}
                      className="flex justify-between gap-3 rounded-md bg-[#0d1013] border border-white/[0.05] px-3 py-2"
                    >
                      <div>
                        <p className="text-[10px] text-slate-400">
                          {classLabel(slot, subjects)}
                        </p>

                        <p className="text-[8px] text-slate-700 mt-0.5">
                          {getTeacherName(slot)} • {formatTime(slot.start_time)}
                          -{formatTime(slot.end_time)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggle(slot.id)}
                        className="w-6 h-6 rounded-md grid place-items-center text-slate-700 hover:text-red-400 hover:bg-red-500/10"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 flex justify-end gap-2 mt-4 pt-4 border-t border-white/[0.06] bg-[#121519]">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="h-10 px-4 rounded-lg border border-white/10 bg-white/[0.02] text-sm text-slate-500 hover:text-white transition disabled:opacity-40"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="h-10 px-5 rounded-lg bg-[#f2bd19] text-[#0b0d10] text-sm font-bold hover:bg-[#ffd34d] transition flex items-center gap-2 disabled:opacity-50"
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
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div
        className={`w-full ${
          wide ? "max-w-5xl" : "max-w-2xl"
        } h-auto max-h-[95vh] rounded-2xl bg-[#121519] border border-white/10 shadow-[0_20px_80px_rgba(0,0,0,0.55)] overflow-hidden flex flex-col`}
      >
        <div className="shrink-0 px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white">{title}</h3>

            <p className="text-[10px] text-slate-600 mt-1">{subtitle}</p>
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

        <div className="min-h-0 flex-1 p-5 overflow-hidden flex flex-col">
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
    <section className="rounded-xl border border-white/[0.06] bg-[#0d1013] p-4">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#f2bd19]/10 border border-[#f2bd19]/15 grid place-items-center">
            <Icon className="w-4 h-4 text-[#f2bd19]" />
          </div>

          <div>
            <h4 className="text-[11px] font-semibold text-slate-300">
              {title}
            </h4>

            <p className="text-[9px] text-slate-700 mt-0.5">{subtitle}</p>
          </div>
        </div>

        {right}
      </div>

      {children}
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
        className="w-full h-10 px-3 rounded-lg bg-[#0b0d10] border border-white/10 text-sm text-slate-300 outline-none focus:border-[#f2bd19]/50 placeholder:text-slate-700"
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
          className="w-full h-10 px-3 pr-8 rounded-lg bg-[#0b0d10] border border-white/10 text-sm text-slate-300 outline-none focus:border-[#f2bd19]/50 disabled:opacity-40 appearance-none"
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
