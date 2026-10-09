import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/Toast";
import SolarDateField, {
  gregorianToSolarInput,
  toIsoDate,
} from "../components/SolarDateField";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  BookOpen,
  Users,
  UserRound,
  Clock3,
  GraduationCap,
  ChevronRight,
  Layers3,
  RefreshCw,
  Check,
  AlertTriangle,
} from "lucide-react";

const GOLD = "#f2bd19";

/* =========================================================
   DEADLINE RULES

   The deadline itself always comes from the backend. Only the
   "how close are we" comparison lives here, because it depends
   on the current date rather than on stored data.
============================================================= */

const DEADLINE_WARNING_DAYS = 7;

/* =========================================================
   HELPERS
========================================================= */

function formatTime(value) {
  if (!value) return "-";

  const [hourString, minuteString] = String(value).split(":");
  let hour = Number(hourString);

  if (Number.isNaN(hour)) return value;

  const minute = minuteString || "00";
  const suffix = hour >= 12 ? "PM" : "AM";

  hour = hour % 12;
  if (hour === 0) hour = 12;

  return `${hour}:${minute} ${suffix}`;
}

function getKabulToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kabul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const result = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      result[part.type] = part.value;
    }
  }

  return `${result.year}-${result.month}-${result.day}`;
}

/* =========================================================
   DEADLINE STATUS
============================================================= */

function getDeadlineState(deadline) {
  const raw = toIsoDate(deadline);

  if (!raw) {
    return { status: "none", label: null, daysLeft: null };
  }

  const today = getKabulToday();

  const daysLeft = Math.round(
    (Date.parse(`${raw}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      86400000,
  );

  if (daysLeft < 0) {
    return { status: "reached", daysLeft, label: "Deadline reached" };
  }

  if (daysLeft === 0) {
    return { status: "today", daysLeft, label: "Deadline is today" };
  }

  if (daysLeft <= DEADLINE_WARNING_DAYS) {
    return {
      status: "warning",
      daysLeft,
      label: `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`,
    };
  }

  return {
    status: "upcoming",
    daysLeft,
    label: `${daysLeft} days left`,
  };
}

function emptySlotForm() {
  return {
    subject_id: "",
    teacher_id: "",
    start_time: "14:00",
    end_time: "15:00",
    deadline: "",
    class_type_id: "",
    book_ids: [],
  };
}

function emptySubjectForm() {
  return {
    name: "",
  };
}

function normalizeBooks(subject) {
  if (!subject) return [];

  if (Array.isArray(subject.books)) {
    return subject.books;
  }

  if (Array.isArray(subject.sections)) {
    return subject.sections;
  }

  if (Array.isArray(subject.levels)) {
    return subject.levels;
  }

  return [];
}

function getSlotBookIds(slot) {
  if (!slot) return [];

  if (Array.isArray(slot.book_ids)) {
    return slot.book_ids.map(Number);
  }

  if (Array.isArray(slot.books)) {
    return slot.books
      .map((book) => Number(book.id))
      .filter((id) => Number.isFinite(id));
  }

  if (Array.isArray(slot.sections)) {
    return slot.sections
      .map((book) => Number(book.id))
      .filter((id) => Number.isFinite(id));
  }

  if (Array.isArray(slot.levels)) {
    return slot.levels
      .map((book) => Number(book.id))
      .filter((id) => Number.isFinite(id));
  }

  return [];
}

function getTeacherName(slot) {
  if (slot?.teacher_name) return slot.teacher_name;
  if (slot?.teacher?.full_name) return slot.teacher.full_name;
  if (slot?.teacher?.name) return slot.teacher.name;

  return "Unassigned";
}

function getSubjectName(slot) {
  if (slot?.subject_name) return slot.subject_name;
  if (slot?.subject?.name) return slot.subject.name;

  return "Unknown subject";
}

function getSlotBooks(slot) {
  if (Array.isArray(slot?.books)) return slot.books;
  if (Array.isArray(slot?.sections)) return slot.sections;
  if (Array.isArray(slot?.levels)) return slot.levels;

  return [];
}

/* =========================================================
   MAIN PAGE
========================================================= */

export default function Classes() {
  const { user } = useAuth();
  const toast = useToast();

  const isAdmin = user?.role === "admin";

  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [classTypes, setClassTypes] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedClass, setSelectedClass] = useState(null);
  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  /* -------------------------------------------------------
     CLASS SLOT
  ------------------------------------------------------- */

  const [showSlotModal, setShowSlotModal] = useState(false);
  const [editingSlot, setEditingSlot] = useState(null);
  const [slotForm, setSlotForm] = useState(emptySlotForm());
  const [savingSlot, setSavingSlot] = useState(false);
  const [deletingSlot, setDeletingSlot] = useState(null);

  /* -------------------------------------------------------
     SUBJECT
  ------------------------------------------------------- */

  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [editingSubject, setEditingSubject] = useState(null);
  const [subjectForm, setSubjectForm] = useState(emptySubjectForm());
  const [savingSubject, setSavingSubject] = useState(false);
  const [deletingSubject, setDeletingSubject] = useState(null);

  /* -------------------------------------------------------
     SUBJECT BOOKS / SECTIONS / LEVELS
  ------------------------------------------------------- */

  const [subjectBooks, setSubjectBooks] = useState([]);
  const [loadingBooks, setLoadingBooks] = useState(false);

  const [newBookName, setNewBookName] = useState("");
  const [addingBook, setAddingBook] = useState(false);

  const [editingBookId, setEditingBookId] = useState(null);
  const [editingBookName, setEditingBookName] = useState("");

  const [savingBookId, setSavingBookId] = useState(null);
  const [deletingBookId, setDeletingBookId] = useState(null);

  const [expandedSubjectId, setExpandedSubjectId] = useState(null);

  /* =========================================================
     DERIVED DATA
  ========================================================= */

  const activeTeachers = useMemo(() => {
    return teachers.filter((teacher) => teacher.is_active !== false);
  }, [teachers]);

  const selectedSubject = useMemo(() => {
    if (!slotForm.subject_id) return null;

    return (
      subjects.find(
        (subject) => Number(subject.id) === Number(slotForm.subject_id),
      ) || null
    );
  }, [subjects, slotForm.subject_id]);

  const selectedSubjectBooks = useMemo(() => {
    return normalizeBooks(selectedSubject);
  }, [selectedSubject]);

  /* =========================================================
     LOAD DATA
  ========================================================= */

  async function loadClasses() {
    const { data } = await api.get("/classes");

    setClasses(Array.isArray(data) ? data : []);
  }

  async function loadSubjects() {
    const { data } = await api.get("/classes/subjects/all");

    setSubjects(Array.isArray(data) ? data : []);
  }

  /*
    IMPORTANT:
    Class types come directly from the backend so the list is
    never hardcoded here. Administrators can add more later.
  */
  async function loadClassTypes() {
    const { data } = await api.get("/classes/types");

    setClassTypes(Array.isArray(data) ? data : []);
  }

  async function loadTeachers() {
    if (!isAdmin) {
      setTeachers([]);
      return;
    }

    /*
      IMPORTANT:
      Teachers come directly from the backend.
      This is the same endpoint used by UsersPage.
    */
    const { data } = await api.get("/users/teachers");

    setTeachers(Array.isArray(data) ? data : []);
  }

  async function loadEverything(showSpinner = true) {
    if (showSpinner) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      await Promise.all([
        loadClasses(),
        loadSubjects(),
        loadTeachers(),
        loadClassTypes(),
      ]);
    } catch (error) {
      console.error("Failed to load classes and courses:", error);

      toast.error(
        error.response?.data?.error ||
          error.message ||
          "Unable to load classes and courses.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadEverything(true);
  }, []);

  /* =========================================================
     STUDENTS
  ========================================================= */

  async function loadStudents(classId) {
    if (!classId) {
      setStudents([]);
      return;
    }

    setLoadingStudents(true);

    try {
      const { data } = await api.get(`/classes/${classId}/students`);

      setStudents(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load enrolled students:", error);

      toast.error(
        error.response?.data?.error ||
          error.message ||
          "Unable to load enrolled students.",
      );

      setStudents([]);
    } finally {
      setLoadingStudents(false);
    }
  }

  async function selectClass(classItem) {
    setSelectedClass(classItem);

    await loadStudents(classItem.id);
  }

  /* =========================================================
     CLASS SLOT MODAL
  ========================================================= */

  function closeSlotModal() {
    if (savingSlot) return;

    setShowSlotModal(false);
    setEditingSlot(null);
    setSlotForm(emptySlotForm());
  }

  function openCreateSlot() {
    setEditingSlot(null);

    setSlotForm({
      ...emptySlotForm(),
      teacher_id:
        activeTeachers.length === 1 ? String(activeTeachers[0].id) : "",
    });

    setShowSlotModal(true);
  }

  async function openEditSlot(slot) {
    let currentSlot = slot;

    try {
      const { data } = await api.get(`/classes/${slot.id}`);

      if (data) {
        currentSlot = data;
      }
    } catch (error) {
      console.warn(
        "Could not load class details. Using existing row data.",
        error,
      );
    }

    setEditingSlot(currentSlot);

    setSlotForm({
      subject_id: String(
        currentSlot.subject_id ?? currentSlot.subject?.id ?? "",
      ),

      teacher_id: String(
        currentSlot.teacher_id ?? currentSlot.teacher?.id ?? "",
      ),

      start_time: String(currentSlot.start_time || "14:00").slice(0, 5),

      end_time: String(currentSlot.end_time || "15:00").slice(0, 5),

      deadline: toIsoDate(currentSlot.deadline),

      class_type_id:
        currentSlot.class_type_id !== null &&
        currentSlot.class_type_id !== undefined
          ? String(currentSlot.class_type_id)
          : "",

      book_ids: getSlotBookIds(currentSlot),
    });

    setShowSlotModal(true);
  }

  function toggleSlotBook(bookId) {
    const id = Number(bookId);

    setSlotForm((current) => {
      const exists = current.book_ids.includes(id);

      return {
        ...current,

        book_ids: exists
          ? current.book_ids.filter((value) => value !== id)
          : [...current.book_ids, id],
      };
    });
  }

  async function saveSlot(event) {
    event.preventDefault();

    if (!isAdmin) return;

    const subjectId = Number(slotForm.subject_id);
    const teacherId = Number(slotForm.teacher_id);

    if (!subjectId) {
      toast.error("Please select a subject.");
      return;
    }

    if (!teacherId) {
      toast.error("Please select a teacher.");
      return;
    }

    if (!slotForm.start_time || !slotForm.end_time) {
      toast.error("Please select the class start and end time.");
      return;
    }

    if (slotForm.start_time >= slotForm.end_time) {
      toast.error("End time must be later than start time.");
      return;
    }

    if (slotForm.book_ids.length === 0) {
      toast.error("Select at least one section or level.");
      return;
    }

    const deadline = slotForm.deadline ? String(slotForm.deadline) : "";

    if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
      toast.error("Please enter a valid Solar Hijri deadline.");
      return;
    }

    setSavingSlot(true);

    const payload = {
      subject_id: subjectId,
      teacher_id: teacherId,
      start_time: slotForm.start_time,
      end_time: slotForm.end_time,
      deadline: deadline || null,
      class_type_id: slotForm.class_type_id
        ? Number(slotForm.class_type_id)
        : null,
      book_ids: slotForm.book_ids.map(Number),
    };

    try {
      if (editingSlot) {
        await api.put(`/classes/${editingSlot.id}`, payload);

        toast.success("Class time slot updated successfully.");
      } else {
        await api.post("/classes", payload);

        toast.success("Class time slot created successfully.");
      }

      closeSlotModal();

      await loadEverything(false);

      if (selectedClass?.id) {
        const { data } = await api.get("/classes");

        const updatedClass = Array.isArray(data)
          ? data.find((item) => Number(item.id) === Number(selectedClass.id))
          : null;

        if (updatedClass) {
          setSelectedClass(updatedClass);

          await loadStudents(updatedClass.id);
        }
      }
    } catch (error) {
      console.error("Failed to save class time slot:", error);

      toast.error(
        error.response?.data?.error ||
          error.message ||
          "Unable to save class time slot.",
      );
    } finally {
      setSavingSlot(false);
    }
  }

  async function deleteSlot(slot) {
    if (!isAdmin) return;

    const subjectName = getSubjectName(slot);

    const confirmed = window.confirm(
      `Delete the ${subjectName} class time slot?\n\nThis action cannot be undone.`,
    );

    if (!confirmed) return;

    setDeletingSlot(slot.id);

    try {
      await api.delete(`/classes/${slot.id}`);

      if (Number(selectedClass?.id) === Number(slot.id)) {
        setSelectedClass(null);
        setStudents([]);
      }

      toast.success("Class time slot deleted successfully.");

      await loadEverything(false);
    } catch (error) {
      console.error("Failed to delete class time slot:", error);

      toast.error(
        error.response?.data?.error ||
          error.message ||
          "Unable to delete class time slot.",
      );
    } finally {
      setDeletingSlot(null);
    }
  }

  /* =========================================================
     SUBJECT MODAL
  ========================================================= */

  function openCreateSubject() {
    setEditingSubject(null);
    setSubjectForm(emptySubjectForm());
    setSubjectBooks([]);
    setNewBookName("");
    setEditingBookId(null);
    setEditingBookName("");
    setExpandedSubjectId(null);

    setShowSubjectModal(true);
  }

  async function openEditSubject(subject) {
    setEditingSubject(subject);

    setSubjectForm({
      name: subject.name || "",
    });

    setSubjectBooks([]);
    setNewBookName("");
    setEditingBookId(null);
    setEditingBookName("");

    setShowSubjectModal(true);

    await loadSubjectBooks(subject.id);
  }

  function closeSubjectModal() {
    if (savingSubject || addingBook) return;

    setShowSubjectModal(false);
    setEditingSubject(null);
    setSubjectForm(emptySubjectForm());
    setSubjectBooks([]);
    setNewBookName("");
    setEditingBookId(null);
    setEditingBookName("");
  }

  async function loadSubjectBooks(subjectId) {
    if (!subjectId) {
      setSubjectBooks([]);
      return;
    }

    setLoadingBooks(true);

    try {
      const { data } = await api.get(`/classes/subjects/${subjectId}/books`);

      setSubjectBooks(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load sections and levels:", error);

      toast.error(
        error.response?.data?.error ||
          error.message ||
          "Unable to load sections and levels.",
      );

      setSubjectBooks([]);
    } finally {
      setLoadingBooks(false);
    }
  }

  async function saveSubject(event) {
    event.preventDefault();

    if (!isAdmin) return;

    const name = subjectForm.name.trim();

    if (!name) {
      toast.error("Subject name is required.");
      return;
    }

    setSavingSubject(true);

    try {
      let savedSubject;

      if (editingSubject) {
        const { data } = await api.put(
          `/classes/subjects/${editingSubject.id}`,
          { name },
        );

        savedSubject = data;

        toast.success("Subject updated successfully.");
      } else {
        const { data } = await api.post("/classes/subjects", { name });

        savedSubject = data;

        toast.success("Subject created successfully.");
      }

      await loadSubjects();

      if (editingSubject) {
        await loadSubjectBooks(editingSubject.id);
      } else if (savedSubject?.id) {
        setEditingSubject(savedSubject);

        await loadSubjectBooks(savedSubject.id);
      }
    } catch (error) {
      console.error("Failed to save subject:", error);

      toast.error(
        error.response?.data?.error ||
          error.message ||
          "Unable to save subject.",
      );
    } finally {
      setSavingSubject(false);
    }
  }

  async function deleteSubject(subject) {
    if (!isAdmin) return;

    const confirmed = window.confirm(
      `Delete "${subject.name}"?\n\nThis will also remove its sections/levels and associated class-slot links.\n\nThis action cannot be undone.`,
    );

    if (!confirmed) return;

    setDeletingSubject(subject.id);

    try {
      await api.delete(`/classes/subjects/${subject.id}`);

      if (Number(selectedClass?.subject_id) === Number(subject.id)) {
        setSelectedClass(null);
        setStudents([]);
      }

      if (Number(expandedSubjectId) === Number(subject.id)) {
        setExpandedSubjectId(null);
      }

      toast.success("Subject deleted successfully.");

      await loadEverything(false);
    } catch (error) {
      console.error("Failed to delete subject:", error);

      toast.error(
        error.response?.data?.error ||
          error.message ||
          "Unable to delete subject.",
      );
    } finally {
      setDeletingSubject(null);
    }
  }

  /* =========================================================
     SECTION / LEVEL CRUD
  ========================================================= */

  async function addBook(event) {
    event.preventDefault();

    if (!editingSubject) return;

    const name = newBookName.trim();

    if (!name) {
      toast.error("Enter a section or level name.");
      return;
    }

    setAddingBook(true);

    try {
      await api.post(`/classes/subjects/${editingSubject.id}/books`, { name });

      setNewBookName("");

      await loadSubjectBooks(editingSubject.id);

      await loadSubjects();

      toast.success("Section/level added successfully.");
    } catch (error) {
      console.error("Failed to add section/level:", error);

      toast.error(
        error.response?.data?.error ||
          error.message ||
          "Unable to add section/level.",
      );
    } finally {
      setAddingBook(false);
    }
  }

  function startEditBook(book) {
    setEditingBookId(book.id);
    setEditingBookName(book.name || "");
  }

  function cancelEditBook() {
    setEditingBookId(null);
    setEditingBookName("");
  }

  async function saveBook(book) {
    const name = editingBookName.trim();

    if (!name) {
      toast.error("Section/level name is required.");
      return;
    }

    setSavingBookId(book.id);

    try {
      await api.put(`/classes/books/${book.id}`, { name });

      cancelEditBook();

      await loadSubjectBooks(editingSubject.id);

      await loadSubjects();

      toast.success("Section/level updated successfully.");
    } catch (error) {
      console.error("Failed to update section/level:", error);

      toast.error(
        error.response?.data?.error ||
          error.message ||
          "Unable to update section/level.",
      );
    } finally {
      setSavingBookId(null);
    }
  }

  async function deleteBook(book) {
    const confirmed = window.confirm(
      `Delete "${book.name}"?\n\nThis action cannot be undone.`,
    );

    if (!confirmed) return;

    setDeletingBookId(book.id);

    try {
      await api.delete(`/classes/books/${book.id}`);

      toast.success("Section/level deleted successfully.");

      await loadSubjectBooks(editingSubject.id);

      await loadSubjects();
    } catch (error) {
      console.error("Failed to delete section/level:", error);

      toast.error(
        error.response?.data?.error ||
          error.message ||
          "Unable to delete section/level.",
      );
    } finally {
      setDeletingBookId(null);
    }
  }

  function toggleSubjectExpanded(subjectId) {
    setExpandedSubjectId((current) =>
      Number(current) === Number(subjectId) ? null : subjectId,
    );
  }

  function getSubjectBookCount(subject) {
    return normalizeBooks(subject).length;
  }

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className="w-full min-h-full px-4 sm:px-6 lg:px-8 py-5">
      {/* =====================================================
          HEADER
      ===================================================== */}

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/[0.025] border border-white/[0.07] flex items-center justify-center">
              <BookOpen className="w-[17px] h-[17px] text-[#f2bd19]" />
            </div>

            <div>
              <h1 className="text-lg font-semibold text-white">
                Classes & Courses
              </h1>

              <p className="text-[10px] text-slate-500 mt-0.5">
                Manage subjects, sections, class time slots, teachers, and
                enrolled students.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadEverything(false)}
            disabled={refreshing}
            className="h-[38px] px-3.5 rounded-lg bg-white/[0.025] border border-white/[0.08] text-[10px] font-semibold text-slate-400 hover:text-white hover:border-white/[0.15] inline-flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            <RefreshCw
              className={`w-[13px] h-[13px] ${
                refreshing ? "animate-spin" : ""
              }`}
            />
            Refresh
          </button>

          {isAdmin && (
            <>
              <button
                type="button"
                onClick={openCreateSubject}
                className="h-[38px] px-3.5 rounded-lg bg-white/[0.025] border border-white/[0.08] text-[10px] font-semibold text-slate-400 hover:text-white hover:border-white/[0.15] inline-flex items-center justify-center gap-2 transition-all"
              >
                <BookOpen className="w-[13px] h-[13px]" />
                New Subject
              </button>

              <button
                type="button"
                onClick={openCreateSlot}
                className="h-[38px] px-4 rounded-lg bg-[#f2bd19] hover:bg-[#e6b317] active:bg-[#d9a912] text-[#111] text-[10px] font-bold inline-flex items-center justify-center gap-2 transition-all shadow-[0_7px_22px_rgba(242,189,25,0.12)]"
              >
                <Plus className="w-[14px] h-[14px]" />
                New Class
              </button>
            </>
          )}
        </div>
      </div>

      {/* =====================================================
          SUMMARY
      ===================================================== */}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <SummaryCard icon={BookOpen} label="Subjects" value={subjects.length} />

        <SummaryCard
          icon={Clock3}
          label="Class Time Slots"
          value={classes.length}
        />

        <SummaryCard
          icon={UserRound}
          label="Teachers"
          value={isAdmin ? activeTeachers.length : "-"}
        />
      </div>

      {/* =====================================================
          LOADING
      ===================================================== */}

      {loading ? (
        <div className="rounded-xl border border-white/[0.07] bg-[#121519]">
          <LoadingState />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_0.75fr] gap-5">
          {/* =================================================
              CLASS TIME SLOTS
          ================================================= */}

          <section>
            <SectionHeading
              title="Class Time Slots"
              description="Active class schedules connecting subjects, sections, teachers, and times."
              count={classes.length}
              icon={Clock3}
              action={
                isAdmin ? (
                  <button
                    type="button"
                    onClick={openCreateSlot}
                    className="h-[36px] px-3.5 rounded-lg bg-[#f2bd19] hover:bg-[#e6b317] text-[#111] text-[10px] font-bold inline-flex items-center justify-center gap-2 transition-all shadow-[0_6px_18px_rgba(242,189,25,0.10)]"
                  >
                    <Plus className="w-[13px] h-[13px]" />
                    Add Class
                  </button>
                ) : null
              }
            />

            <div className="mt-4 rounded-xl border border-white/[0.07] bg-[#121519] overflow-hidden">
              {classes.length === 0 ? (
                <EmptyState
                  icon={Clock3}
                  title="No class time slots"
                  description="There are currently no class time slots."
                />
              ) : (
                <ClassTable
                  classes={classes}
                  selectedClass={selectedClass}
                  isAdmin={isAdmin}
                  deletingSlot={deletingSlot}
                  onSelect={selectClass}
                  onEdit={openEditSlot}
                  onDelete={deleteSlot}
                />
              )}
            </div>
          </section>

          {/* =================================================
              RIGHT SIDE
          ================================================= */}

          <div className="space-y-5">
            {/* SUBJECTS */}

            <section>
              <SectionHeading
                title="Subjects"
                description="Subjects and their sections or levels."
                count={subjects.length}
                icon={BookOpen}
                action={
                  isAdmin ? (
                    <button
                      type="button"
                      onClick={openCreateSubject}
                      className="h-[36px] px-3.5 rounded-lg bg-[#f2bd19] hover:bg-[#e6b317] text-[#111] text-[10px] font-bold inline-flex items-center justify-center gap-2 transition-all shadow-[0_6px_18px_rgba(242,189,25,0.10)]"
                    >
                      <Plus className="w-[13px] h-[13px]" />
                      Add Subject
                    </button>
                  ) : null
                }
              />

              <div className="mt-4 rounded-xl border border-white/[0.07] bg-[#121519] overflow-hidden">
                {subjects.length === 0 ? (
                  <EmptyState
                    icon={BookOpen}
                    title="No subjects found"
                    description="There are currently no subject records."
                  />
                ) : (
                  <SubjectList
                    subjects={subjects}
                    expandedSubjectId={expandedSubjectId}
                    isAdmin={isAdmin}
                    deletingSubject={deletingSubject}
                    onToggle={toggleSubjectExpanded}
                    onEdit={openEditSubject}
                    onDelete={deleteSubject}
                  />
                )}
              </div>
            </section>

            {/* SELECTED CLASS */}

            <section>
              <SectionHeading
                title="Selected Class"
                description="Students currently enrolled in the selected class."
                icon={Users}
              />

              <div className="mt-4 rounded-xl border border-white/[0.07] bg-[#121519] overflow-hidden">
                {!selectedClass ? (
                  <EmptyState
                    icon={GraduationCap}
                    title="No class selected"
                    description="Select a class time slot to view its enrolled students."
                  />
                ) : (
                  <SelectedClassPanel
                    selectedClass={selectedClass}
                    students={students}
                    loadingStudents={loadingStudents}
                    onClose={() => {
                      setSelectedClass(null);
                      setStudents([]);
                    }}
                  />
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* =====================================================
          CLASS MODAL
      ===================================================== */}

      {showSlotModal && (
        <ClassModal
          editingSlot={editingSlot}
          slotForm={slotForm}
          setSlotForm={setSlotForm}
          subjects={subjects}
          activeTeachers={activeTeachers}
          classTypes={classTypes}
          selectedSubjectBooks={selectedSubjectBooks}
          savingSlot={savingSlot}
          onClose={closeSlotModal}
          onSubmit={saveSlot}
          onToggleBook={toggleSlotBook}
        />
      )}

      {/* =====================================================
          SUBJECT MODAL
      ===================================================== */}

      {showSubjectModal && (
        <SubjectModal
          editingSubject={editingSubject}
          subjectForm={subjectForm}
          setSubjectForm={setSubjectForm}
          savingSubject={savingSubject}
          subjectBooks={subjectBooks}
          loadingBooks={loadingBooks}
          newBookName={newBookName}
          setNewBookName={setNewBookName}
          addingBook={addingBook}
          editingBookId={editingBookId}
          editingBookName={editingBookName}
          setEditingBookName={setEditingBookName}
          savingBookId={savingBookId}
          deletingBookId={deletingBookId}
          onClose={closeSubjectModal}
          onSubmit={saveSubject}
          onAddBook={addBook}
          onStartEditBook={startEditBook}
          onCancelEditBook={cancelEditBook}
          onSaveBook={saveBook}
          onDeleteBook={deleteBook}
        />
      )}
    </div>
  );
}

/* =========================================================
   SUMMARY CARD
========================================================= */

function SummaryCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#121519] px-4 py-3.5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.09em] text-slate-600">
            {label}
          </p>

          <p className="text-lg font-semibold text-slate-200 mt-1">{value}</p>
        </div>

        <div className="w-8 h-8 rounded-lg bg-white/[0.025] border border-white/[0.07] flex items-center justify-center">
          <Icon className="w-[14px] h-[14px] text-[#f2bd19]" />
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   SECTION HEADING
========================================================= */

function SectionHeading({ title, description, count, icon: Icon, action }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <Icon className="w-[14px] h-[14px] text-[#f2bd19]" />

          <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-slate-300">
            {title}
          </h2>

          {count !== undefined && (
            <span className="text-[9px] text-slate-600">({count})</span>
          )}
        </div>

        <p className="text-[9px] text-slate-600 mt-1">{description}</p>
      </div>

      {action}
    </div>
  );
}

/* =========================================================
   CLASS TABLE
========================================================= */

/* =========================================================
   DEADLINE BADGE
============================================================= */

function DeadlineBadge({ deadline }) {
  const isoDate = toIsoDate(deadline);

  const { status, label } = getDeadlineState(isoDate);

  if (status === "none") {
    return <span className="text-[9px] text-slate-600">-</span>;
  }

  const solarDate = gregorianToSolarInput(isoDate);

  const styles = {
    reached: "bg-red-500/10 border-red-500/35 text-red-300",
    today: "bg-amber-400/12 border-amber-400/40 text-amber-300",
    warning: "bg-amber-400/10 border-amber-400/30 text-amber-300",
    upcoming: "bg-white/[0.025] border-white/[0.07] text-slate-400",
  }[status];

  const Icon = status === "reached" || status === "today" ? AlertTriangle : null;

  return (
    <div className="flex flex-col items-start gap-1">
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[8px] font-medium whitespace-nowrap ${styles}`}
      >
        {Icon && <Icon className="w-[10px] h-[10px] shrink-0" />}

        {label}
      </span>

      <span className="text-[8px] text-slate-600">{solarDate}</span>
    </div>
  );
}

/* =========================================================
   CLASS TYPE BADGE
============================================================= */

function ClassTypeBadge({ slot }) {
  const name = slot.class_type;

  if (!name) {
    return <span className="text-[9px] text-slate-600">-</span>;
  }

  return (
    <span className="inline-flex items-center px-2 py-1 rounded-md border border-white/[0.07] bg-white/[0.025] text-[8px] font-medium text-slate-400 whitespace-nowrap">
      {name}
    </span>
  );
}

function ClassTable({
  classes,
  selectedClass,
  isAdmin,
  deletingSlot,
  onSelect,
  onEdit,
  onDelete,
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px]">
        <thead>
          <tr className="border-b border-white/[0.07] bg-white/[0.015]">
            <TableHeader>Subject</TableHeader>
            <TableHeader>Teacher</TableHeader>
            <TableHeader>Time</TableHeader>
            <TableHeader>Sections / Levels</TableHeader>
            <TableHeader>Students</TableHeader>
            <TableHeader>Class Type</TableHeader>
            <TableHeader>Deadline</TableHeader>
            <TableHeader>Actions</TableHeader>
          </tr>
        </thead>

        <tbody>
          {classes.map((slot) => {
            const isSelected = Number(selectedClass?.id) === Number(slot.id);

            const slotBooks = getSlotBooks(slot);

            return (
              <tr
                key={slot.id}
                onClick={() => onSelect(slot)}
                className={`
                  border-b border-white/[0.05]
                  last:border-b-0
                  cursor-pointer
                  transition-colors
                  ${
                    isSelected
                      ? "bg-[#f2bd19]/[0.035]"
                      : "hover:bg-white/[0.015]"
                  }
                `}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar icon={BookOpen} />

                    <div>
                      <p className="text-[11px] font-medium text-slate-200">
                        {getSubjectName(slot)}
                      </p>

                      <p className="text-[9px] text-slate-600">
                        Class #{slot.id}
                      </p>
                    </div>
                  </div>
                </TableCell>

                <TableCell>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <UserRound className="w-[13px] h-[13px] text-slate-600 shrink-0" />

                    <span>{getTeacherName(slot)}</span>
                  </div>
                </TableCell>

                <TableCell>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 whitespace-nowrap">
                    <Clock3 className="w-[13px] h-[13px] text-slate-600" />

                    <span>
                      {formatTime(slot.start_time)}
                      {" – "}
                      {formatTime(slot.end_time)}
                    </span>
                  </div>
                </TableCell>

                <TableCell>
                  {slotBooks.length === 0 ? (
                    <span className="text-[9px] text-slate-600">-</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 max-w-[220px]">
                      {slotBooks.map((book) => (
                        <span
                          key={book.id}
                          className="px-2 py-1 rounded-md bg-white/[0.025] border border-white/[0.07] text-[8px] font-medium text-slate-400"
                        >
                          {book.name}
                        </span>
                      ))}
                    </div>
                  )}
                </TableCell>

                <TableCell>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <Users className="w-[13px] h-[13px] text-slate-600" />

                    <span>{slot.student_count ?? 0}</span>
                  </div>
                </TableCell>

                <TableCell>
                  <ClassTypeBadge slot={slot} />
                </TableCell>

                <TableCell>
                  <DeadlineBadge deadline={slot.deadline} />
                </TableCell>

                <TableCell
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                >
                  {isAdmin && (
                    <div className="flex items-center gap-1.5">
                      <ActionButton
                        icon={Pencil}
                        label="Edit"
                        onClick={() => onEdit(slot)}
                      />

                      <ActionButton
                        icon={deletingSlot === slot.id ? Loader2 : Trash2}
                        label="Delete"
                        danger
                        loading={deletingSlot === slot.id}
                        onClick={() => onDelete(slot)}
                      />
                    </div>
                  )}
                </TableCell>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* =========================================================
   SUBJECT LIST
========================================================= */

function SubjectList({
  subjects,
  expandedSubjectId,
  isAdmin,
  deletingSubject,
  onToggle,
  onEdit,
  onDelete,
}) {
  return (
    <div className="divide-y divide-white/[0.05]">
      {subjects.map((subject) => {
        const expanded = Number(expandedSubjectId) === Number(subject.id);

        const books = normalizeBooks(subject);

        return (
          <div key={subject.id}>
            <div className="px-4 py-3.5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => onToggle(subject.id)}
                className="flex-1 min-w-0 flex items-center gap-3 text-left"
              >
                <Avatar icon={BookOpen} />

                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-slate-200 truncate">
                    {subject.name}
                  </p>

                  <p className="text-[9px] text-slate-600 mt-0.5">
                    {books.length}{" "}
                    {books.length === 1 ? "section/level" : "sections/levels"}
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onToggle(subject.id)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:text-white hover:bg-white/[0.05] transition-all"
              >
                <ChevronRight
                  className={`w-[14px] h-[14px] transition-transform ${
                    expanded ? "rotate-90" : ""
                  }`}
                />
              </button>

              {isAdmin && (
                <div className="flex items-center gap-1.5">
                  <ActionButton
                    icon={Pencil}
                    label="Edit"
                    onClick={() => onEdit(subject)}
                  />

                  <ActionButton
                    icon={deletingSubject === subject.id ? Loader2 : Trash2}
                    label="Delete"
                    danger
                    loading={deletingSubject === subject.id}
                    onClick={() => onDelete(subject)}
                  />
                </div>
              )}
            </div>

            {expanded && (
              <div className="px-4 pb-4 pl-[60px]">
                {books.length === 0 ? (
                  <div className="rounded-lg bg-[#0d1013] border border-white/[0.07] px-3 py-3">
                    <p className="text-[9px] text-slate-600">
                      No sections or levels have been added.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {books.map((book) => (
                      <span
                        key={book.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/[0.025] border border-white/[0.07] text-[9px] text-slate-400"
                      >
                        <Layers3 className="w-[11px] h-[11px] text-slate-600" />

                        {book.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* =========================================================
   SELECTED CLASS PANEL
========================================================= */

function SelectedClassPanel({
  selectedClass,
  students,
  loadingStudents,
  onClose,
}) {
  return (
    <div>
      <div className="px-4 py-4 border-b border-white/[0.07]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Avatar icon={BookOpen} />

            <div>
              <h3 className="text-[12px] font-semibold text-slate-200">
                {getSubjectName(selectedClass)}
              </h3>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                <span className="inline-flex items-center gap-1.5 text-[9px] text-slate-600">
                  <UserRound className="w-[11px] h-[11px]" />

                  {getTeacherName(selectedClass)}
                </span>

                <span className="inline-flex items-center gap-1.5 text-[9px] text-slate-600">
                  <Clock3 className="w-[11px] h-[11px]" />

                  {formatTime(selectedClass.start_time)}
                  {" – "}
                  {formatTime(selectedClass.end_time)}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:text-white hover:bg-white/[0.05] transition-all"
          >
            <X className="w-[14px] h-[14px]" />
          </button>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-white/[0.05] bg-white/[0.01]">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-600">
            Enrolled Students
          </span>

          <span className="text-[9px] text-slate-600">{students.length}</span>
        </div>
      </div>

      {loadingStudents ? (
        <LoadingState />
      ) : students.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No enrolled students"
          description="Students enrolled in this class will appear here."
        />
      ) : (
        <div className="max-h-[360px] overflow-y-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.07] bg-white/[0.015]">
                <TableHeader>#</TableHeader>
                <TableHeader>Student</TableHeader>
                <TableHeader>ID</TableHeader>
              </tr>
            </thead>

            <tbody>
              {students.map((student, index) => (
                <tr
                  key={student.id ?? student.student_id ?? index}
                  className="border-b border-white/[0.05] last:border-b-0"
                >
                  <TableCell>
                    <span className="text-[9px] text-slate-600">
                      {index + 1}
                    </span>
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar icon={UserRound} />

                      <div className="min-w-0">
                        <span className="block text-[10px] font-medium text-slate-300 truncate">
                          {student.full_name ||
                            student.name ||
                            student.roll_number ||
                            "Unnamed student"}
                        </span>

                        {student.full_name && student.roll_number && (
                          <span className="block text-[8px] text-slate-600">
                            {student.roll_number}
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    <span className="text-[9px] text-slate-500">
                      {student.student_id ?? student.id ?? "-"}
                    </span>
                  </TableCell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   CLASS MODAL
========================================================= */

function ClassModal({
  editingSlot,
  slotForm,
  setSlotForm,
  subjects,
  activeTeachers,
  classTypes,
  selectedSubjectBooks,
  savingSlot,
  onClose,
  onSubmit,
  onToggleBook,
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-xl max-h-[90vh] overflow-hidden rounded-xl border border-white/[0.08] bg-[#121519] shadow-2xl">
        <form onSubmit={onSubmit}>
          {/* HEADER */}

          <div className="px-5 sm:px-6 py-4 border-b border-white/[0.07] flex items-center justify-between">
            <div>
              <h2 className="text-[13px] font-semibold text-slate-200">
                {editingSlot
                  ? "Edit Class Time Slot"
                  : "Create Class Time Slot"}
              </h2>

              <p className="text-[9px] text-slate-600 mt-1">
                Assign a subject, sections, teacher, and class time.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={savingSlot}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/[0.05] transition-all disabled:opacity-40"
            >
              <X className="w-[15px] h-[15px]" />
            </button>
          </div>

          {/* BODY */}

          <div className="p-5 sm:p-6 overflow-y-auto max-h-[65vh]">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* SUBJECT */}

              <SelectField
                label="Subject"
                required
                value={slotForm.subject_id}
                onChange={(event) => {
                  setSlotForm((current) => ({
                    ...current,
                    subject_id: event.target.value,
                    book_ids: [],
                  }));
                }}
                options={subjects.map((subject) => ({
                  value: subject.id,
                  label: subject.name,
                }))}
                placeholder="Select subject"
              />

              {/* TEACHER */}

              <SelectField
                label="Teacher"
                required
                value={slotForm.teacher_id}
                onChange={(event) => {
                  setSlotForm((current) => ({
                    ...current,
                    teacher_id: event.target.value,
                  }));
                }}
                options={activeTeachers.map((teacher) => ({
                  value: teacher.id,
                  label:
                    teacher.full_name ||
                    teacher.name ||
                    `Teacher #${teacher.id}`,
                }))}
                placeholder="Select teacher"
              />
            </div>

            {/* CLASS TYPE */}

            <div className="mt-5">
              <SelectField
                label="Class Type"
                value={slotForm.class_type_id}
                onChange={(event) => {
                  setSlotForm((current) => ({
                    ...current,
                    class_type_id: event.target.value,
                  }));
                }}
                options={classTypes.map((classType) => ({
                  value: classType.id,
                  label: classType.name,
                }))}
                placeholder="No class type"
              />

              <p className="mt-2 text-[8px] text-slate-600">
                Who this class is for, such as Male, Female, Kids or Mixed.
              </p>
            </div>

            {/* DEADLINE — SOLAR HIJRI */}

            <div className="mt-5">
              <div className="max-w-[280px]">
                <SolarDateField
                  label="Deadline"
                  optional
                  value={slotForm.deadline}
                  onChange={(value) =>
                    setSlotForm((current) => ({
                      ...current,
                      deadline: value,
                    }))
                  }
                />
              </div>

              <p className="mt-2 text-[8px] text-slate-600">
                Leave empty if this class has no deadline. It turns yellow
                within {DEADLINE_WARNING_DAYS} days and red once it has passed.
              </p>
            </div>

            {/* SECTIONS / LEVELS */}

            <div className="mt-5">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-[10px] font-semibold uppercase tracking-[0.09em] text-slate-500">
                  Sections / Levels
                  <span className="text-[#f2bd19] ml-1">*</span>
                </label>

                <span className="text-[8px] text-slate-600">
                  Select one or more
                </span>
              </div>

              {!slotForm.subject_id ? (
                <div className="rounded-lg bg-[#0d1013] border border-white/[0.07] px-3.5 py-4">
                  <p className="text-[9px] text-slate-600">
                    Select a subject first.
                  </p>
                </div>
              ) : selectedSubjectBooks.length === 0 ? (
                <div className="rounded-lg bg-[#0d1013] border border-white/[0.07] px-3.5 py-4">
                  <div className="flex items-center gap-2">
                    <Layers3 className="w-[13px] h-[13px] text-slate-600" />

                    <p className="text-[9px] text-slate-500">
                      This subject has no sections or levels yet.
                    </p>
                  </div>

                  <p className="text-[8px] text-slate-700 mt-1 ml-5">
                    Edit the subject and add at least one.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedSubjectBooks.map((book) => {
                    const checked = slotForm.book_ids.includes(Number(book.id));

                    return (
                      <button
                        key={book.id}
                        type="button"
                        onClick={() => onToggleBook(book.id)}
                        className={`
                          h-[42px]
                          px-3
                          rounded-lg
                          border
                          flex
                          items-center
                          justify-between
                          text-left
                          transition-all
                          ${
                            checked
                              ? "bg-[#f2bd19]/[0.06] border-[#f2bd19]/[0.25]"
                              : "bg-[#0d1013] border-white/[0.07] hover:border-white/[0.14]"
                          }
                        `}
                      >
                        <span className="flex items-center gap-2">
                          <Layers3
                            className={`w-[13px] h-[13px] ${
                              checked ? "text-[#f2bd19]" : "text-slate-600"
                            }`}
                          />

                          <span
                            className={`text-[10px] ${
                              checked ? "text-slate-200" : "text-slate-500"
                            }`}
                          >
                            {book.name}
                          </span>
                        </span>

                        {checked && (
                          <Check className="w-[14px] h-[14px] text-[#f2bd19]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* TIME */}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
              <TimeField
                label="Start Time"
                value={slotForm.start_time}
                onChange={(event) =>
                  setSlotForm((current) => ({
                    ...current,
                    start_time: event.target.value,
                  }))
                }
              />

              <TimeField
                label="End Time"
                value={slotForm.end_time}
                onChange={(event) =>
                  setSlotForm((current) => ({
                    ...current,
                    end_time: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          {/* FOOTER */}

          <div className="px-5 sm:px-6 py-3.5 bg-[#121519]/95 border-t border-white/[0.07] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={savingSlot}
              className="h-[40px] px-4 rounded-lg bg-white/[0.025] border border-white/[0.08] text-[11px] font-semibold text-slate-400 hover:text-white hover:border-white/[0.15] transition-all disabled:opacity-40"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={
                savingSlot ||
                !slotForm.subject_id ||
                !slotForm.teacher_id ||
                slotForm.book_ids.length === 0
              }
              className="h-[40px] px-5 rounded-lg bg-[#f2bd19] hover:bg-[#e6b317] active:bg-[#d9a912] text-[#111] text-[11px] font-bold inline-flex items-center justify-center gap-2 transition-all shadow-[0_7px_22px_rgba(242,189,25,0.12)] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {savingSlot ? (
                <>
                  <Loader2 className="w-[14px] h-[14px] animate-spin" />
                  Saving...
                </>
              ) : editingSlot ? (
                <>
                  <Check className="w-[14px] h-[14px]" />
                  Save Changes
                </>
              ) : (
                <>
                  <Plus className="w-[14px] h-[14px]" />
                  Create
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* =========================================================
   SUBJECT MODAL
========================================================= */

function SubjectModal({
  editingSubject,
  subjectForm,
  setSubjectForm,
  savingSubject,
  subjectBooks,
  loadingBooks,
  newBookName,
  setNewBookName,
  addingBook,
  editingBookId,
  editingBookName,
  setEditingBookName,
  savingBookId,
  deletingBookId,
  onClose,
  onSubmit,
  onAddBook,
  onStartEditBook,
  onCancelEditBook,
  onSaveBook,
  onDeleteBook,
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-xl max-h-[90vh] overflow-hidden rounded-xl border border-white/[0.08] bg-[#121519] shadow-2xl">
        {/* HEADER */}

        <div className="px-5 sm:px-6 py-4 border-b border-white/[0.07] flex items-center justify-between">
          <div>
            <h2 className="text-[13px] font-semibold text-slate-200">
              {editingSubject ? "Edit Subject" : "Create Subject"}
            </h2>

            <p className="text-[9px] text-slate-600 mt-1">
              Manage the subject and its sections or levels.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={savingSubject || addingBook}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/[0.05] transition-all disabled:opacity-40"
          >
            <X className="w-[15px] h-[15px]" />
          </button>
        </div>

        {/* BODY */}

        <div className="overflow-y-auto max-h-[75vh]">
          <form onSubmit={onSubmit}>
            <div className="p-5 sm:p-6">
              <Field
                label="Subject Name"
                required
                icon={BookOpen}
                value={subjectForm.name}
                onChange={(event) =>
                  setSubjectForm({
                    name: event.target.value,
                  })
                }
                placeholder="Enter subject name"
              />

              {!editingSubject && (
                <div className="mt-4 rounded-lg bg-[#0d1013] border border-white/[0.07] p-3">
                  <div className="flex items-start gap-2.5">
                    <Layers3 className="w-[13px] h-[13px] text-slate-600 mt-0.5" />

                    <p className="text-[9px] text-slate-600 leading-relaxed">
                      After creating the subject, you can add its sections or
                      levels from the subject editor.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* FOOTER */}

            <div className="px-5 sm:px-6 py-3.5 bg-[#121519]/95 border-t border-white/[0.07] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={savingSubject}
                className="h-[40px] px-4 rounded-lg bg-white/[0.025] border border-white/[0.08] text-[11px] font-semibold text-slate-400 hover:text-white hover:border-white/[0.15] transition-all disabled:opacity-40"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={savingSubject}
                className="h-[40px] px-5 rounded-lg bg-[#f2bd19] hover:bg-[#e6b317] active:bg-[#d9a912] text-[#111] text-[11px] font-bold inline-flex items-center justify-center gap-2 transition-all shadow-[0_7px_22px_rgba(242,189,25,0.12)] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {savingSubject ? (
                  <>
                    <Loader2 className="w-[14px] h-[14px] animate-spin" />
                    Saving...
                  </>
                ) : editingSubject ? (
                  <>
                    <Check className="w-[14px] h-[14px]" />
                    Save Changes
                  </>
                ) : (
                  <>
                    <Plus className="w-[14px] h-[14px]" />
                    Create
                  </>
                )}
              </button>
            </div>
          </form>

          {/* SECTIONS / LEVELS */}

          {editingSubject && (
            <div className="border-t border-white/[0.07]">
              <div className="px-5 sm:px-6 py-4">
                <div className="flex items-center gap-2">
                  <Layers3 className="w-[14px] h-[14px] text-[#f2bd19]" />

                  <h3 className="text-[11px] font-semibold text-slate-300">
                    Sections / Levels
                  </h3>
                </div>

                <p className="text-[9px] text-slate-600 mt-1">
                  Manage the sections or levels belonging to{" "}
                  <span className="text-slate-400">{editingSubject.name}</span>.
                </p>
              </div>

              {/* ADD */}

              <form
                onSubmit={onAddBook}
                className="px-5 sm:px-6 pb-4 flex gap-2"
              >
                <input
                  type="text"
                  value={newBookName}
                  onChange={(event) => setNewBookName(event.target.value)}
                  placeholder="Enter section or level"
                  className="
                    w-full
                    h-[42px]
                    px-3.5
                    rounded-lg
                    bg-[#0d1013]
                    border
                    border-white/[0.09]
                    text-[11px]
                    text-slate-100
                    placeholder:text-slate-600
                    outline-none
                    transition-all
                    hover:border-white/[0.15]
                    focus:border-[#f2bd19]/55
                    focus:ring-2
                    focus:ring-[#f2bd19]/10
                  "
                />

                <button
                  type="submit"
                  disabled={addingBook}
                  className="h-[42px] w-[42px] shrink-0 rounded-lg bg-[#f2bd19] hover:bg-[#e6b317] text-[#111] flex items-center justify-center transition-all disabled:opacity-60"
                >
                  {addingBook ? (
                    <Loader2 className="w-[14px] h-[14px] animate-spin" />
                  ) : (
                    <Plus className="w-[15px] h-[15px]" />
                  )}
                </button>
              </form>

              {/* LIST */}

              <div className="border-t border-white/[0.05]">
                {loadingBooks ? (
                  <LoadingState />
                ) : subjectBooks.length === 0 ? (
                  <EmptyState
                    icon={Layers3}
                    title="No sections or levels"
                    description="Add the first section or level above."
                  />
                ) : (
                  <div className="divide-y divide-white/[0.05]">
                    {subjectBooks.map((book) => (
                      <div
                        key={book.id}
                        className="px-5 sm:px-6 py-3 flex items-center gap-3"
                      >
                        {editingBookId === book.id ? (
                          <>
                            <input
                              type="text"
                              value={editingBookName}
                              onChange={(event) =>
                                setEditingBookName(event.target.value)
                              }
                              className="
                                w-full
                                h-[38px]
                                px-3
                                rounded-lg
                                bg-[#0d1013]
                                border
                                border-white/[0.09]
                                text-[11px]
                                text-slate-100
                                outline-none
                                focus:border-[#f2bd19]/55
                                focus:ring-2
                                focus:ring-[#f2bd19]/10
                              "
                              autoFocus
                            />

                            <button
                              type="button"
                              onClick={() => onSaveBook(book)}
                              disabled={savingBookId === book.id}
                              className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-[#f2bd19] hover:bg-[#f2bd19]/[0.08] transition-all"
                            >
                              {savingBookId === book.id ? (
                                <Loader2 className="w-[14px] h-[14px] animate-spin" />
                              ) : (
                                <Check className="w-[14px] h-[14px]" />
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={onCancelEditBook}
                              disabled={savingBookId === book.id}
                              className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-slate-600 hover:text-white hover:bg-white/[0.05] transition-all"
                            >
                              <X className="w-[14px] h-[14px]" />
                            </button>
                          </>
                        ) : (
                          <>
                            <Avatar icon={Layers3} />

                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-medium text-slate-300 truncate">
                                {book.name}
                              </p>

                              <p className="text-[8px] text-slate-700 mt-0.5">
                                Section / Level #{book.id}
                              </p>
                            </div>

                            <ActionButton
                              icon={Pencil}
                              label="Edit"
                              onClick={() => onStartEditBook(book)}
                            />

                            <ActionButton
                              icon={
                                deletingBookId === book.id ? Loader2 : Trash2
                              }
                              label="Delete"
                              danger
                              loading={deletingBookId === book.id}
                              onClick={() => onDeleteBook(book)}
                            />
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   FIELD
========================================================= */

function Field({
  label,
  required = false,
  icon: Icon,
  value,
  onChange,
  placeholder,
  type = "text",
}) {
  return (
    <label className="block">
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
          required={required}
          autoComplete="off"
          className="
            w-full
            h-[44px]
            pl-10
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
          "
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
  value,
  onChange,
  options,
  placeholder,
}) {
  return (
    <label className="block">
      <span className="block text-[10px] font-semibold uppercase tracking-[0.09em] text-slate-500 mb-2">
        {label}

        {required && <span className="text-[#f2bd19] ml-1">*</span>}
      </span>

      <select
        value={value}
        onChange={onChange}
        required={required}
        className="
          w-full
          h-[44px]
          px-3.5
          rounded-lg
          bg-[#0d1013]
          border
          border-white/[0.09]
          text-[11px]
          text-slate-100
          outline-none
          transition-all
          hover:border-white/[0.15]
          focus:border-[#f2bd19]/55
          focus:ring-2
          focus:ring-[#f2bd19]/10
        "
      >
        <option value="">{placeholder}</option>

        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/* =========================================================
   TIME FIELD
========================================================= */

function TimeField({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-semibold uppercase tracking-[0.09em] text-slate-500 mb-2">
        {label}
        <span className="text-[#f2bd19] ml-1">*</span>
      </span>

      <div className="relative group">
        <Clock3 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[15px] h-[15px] text-slate-500 group-focus-within:text-[#f2bd19] transition-colors pointer-events-none" />

        <input
          type="time"
          value={value}
          onChange={onChange}
          required
          className="
            w-full
            h-[44px]
            pl-10
            pr-3.5
            rounded-lg
            bg-[#0d1013]
            border
            border-white/[0.09]
            text-[12px]
            text-slate-100
            outline-none
            transition-all
            hover:border-white/[0.15]
            focus:border-[#f2bd19]/55
            focus:ring-2
            focus:ring-[#f2bd19]/10
          "
        />
      </div>
    </label>
  );
}

/* =========================================================
   TABLE HELPERS
========================================================= */

function TableHeader({ children }) {
  return (
    <th className="px-4 py-3 text-left text-[9px] font-semibold uppercase tracking-[0.09em] text-slate-600 whitespace-nowrap">
      {children}
    </th>
  );
}

function TableCell({ children }) {
  return <td className="px-4 py-3.5 align-middle">{children}</td>;
}

/* =========================================================
   AVATAR
========================================================= */

function Avatar({ icon: Icon }) {
  return (
    <div className="w-8 h-8 rounded-lg bg-white/[0.025] border border-white/[0.07] flex items-center justify-center shrink-0">
      <Icon className="w-[14px] h-[14px] text-[#f2bd19]" />
    </div>
  );
}

/* =========================================================
   ACTION BUTTON
========================================================= */

function ActionButton({
  icon: Icon,
  label,
  onClick,
  danger = false,
  loading = false,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      disabled={loading}
      className={`
        h-8
        px-2.5
        rounded-lg
        border
        inline-flex
        items-center
        justify-center
        gap-1.5
        text-[9px]
        font-semibold
        transition-all
        disabled:opacity-50
        disabled:cursor-not-allowed
        ${
          danger
            ? "bg-red-400/[0.03] border-red-400/[0.10] text-red-400 hover:bg-red-400/[0.08] hover:border-red-400/[0.18]"
            : "bg-white/[0.025] border-white/[0.07] text-slate-500 hover:text-white hover:border-white/[0.15]"
        }
      `}
    >
      <Icon className={`w-[12px] h-[12px] ${loading ? "animate-spin" : ""}`} />

      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

/* =========================================================
   LOADING
========================================================= */

function LoadingState() {
  return (
    <div className="min-h-[180px] flex flex-col items-center justify-center gap-3">
      <Loader2 className="w-5 h-5 text-[#f2bd19] animate-spin" />

      <p className="text-[9px] text-slate-600">Loading...</p>
    </div>
  );
}

/* =========================================================
   EMPTY
========================================================= */

function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="min-h-[180px] flex flex-col items-center justify-center px-5 text-center">
      <div className="w-10 h-10 rounded-xl bg-white/[0.025] border border-white/[0.07] flex items-center justify-center mb-3">
        <Icon className="w-[16px] h-[16px] text-slate-600" />
      </div>

      <p className="text-[11px] font-medium text-slate-400">{title}</p>

      <p className="text-[9px] text-slate-600 mt-1 max-w-xs">{description}</p>
    </div>
  );
}
