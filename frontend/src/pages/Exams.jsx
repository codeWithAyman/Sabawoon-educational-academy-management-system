import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  BookOpen,
  CalendarDays,
  Edit3,
  FileText,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Users,
  X,
} from "lucide-react";

import api from "../lib/api";

const SUBJECT_COLORS = [
  {
    bg: "bg-blue-500/[0.045]",
    border: "border-blue-400/10",
    text: "text-blue-300",
    accent: "bg-blue-400",
  },
  {
    bg: "bg-violet-500/[0.045]",
    border: "border-violet-400/10",
    text: "text-violet-300",
    accent: "bg-violet-400",
  },
  {
    bg: "bg-emerald-500/[0.045]",
    border: "border-emerald-400/10",
    text: "text-emerald-300",
    accent: "bg-emerald-400",
  },
  {
    bg: "bg-amber-500/[0.045]",
    border: "border-amber-400/10",
    text: "text-amber-300",
    accent: "bg-amber-400",
  },
  {
    bg: "bg-rose-500/[0.045]",
    border: "border-rose-400/10",
    text: "text-rose-300",
    accent: "bg-rose-400",
  },
  {
    bg: "bg-cyan-500/[0.045]",
    border: "border-cyan-400/10",
    text: "text-cyan-300",
    accent: "bg-cyan-400",
  },
  {
    bg: "bg-fuchsia-500/[0.045]",
    border: "border-fuchsia-400/10",
    text: "text-fuchsia-300",
    accent: "bg-fuchsia-400",
  },
  {
    bg: "bg-lime-500/[0.045]",
    border: "border-lime-400/10",
    text: "text-lime-300",
    accent: "bg-lime-400",
  },
];

function colorForSubject(index) {
  return SUBJECT_COLORS[index % SUBJECT_COLORS.length];
}

function formatTime(time) {
  if (!time) return "—";

  const match = String(time).match(/^(\d{1,2}):(\d{2})/);

  if (!match) return String(time);

  let hour = Number(match[1]);
  const minute = match[2];

  const suffix = hour >= 12 ? "PM" : "AM";

  hour %= 12;

  if (hour === 0) hour = 12;

  return `${hour}:${minute} ${suffix}`;
}

function formatTimeRange(row) {
  const start = row.start_time || "";
  const end = row.end_time || "";

  if (!start && !end) return "—";
  if (!end) return formatTime(start);

  return `${formatTime(start)} – ${formatTime(end)}`;
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getToday() {
  const now = new Date();

  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function getApiError(error, fallback) {
  return (
    error?.response?.data?.message || error?.response?.data?.error || fallback
  );
}

function normalizeBooks(books) {
  if (!Array.isArray(books)) return [];

  return books
    .map((book) => ({
      id: book?.id === null || book?.id === undefined ? null : Number(book.id),

      name: typeof book?.name === "string" ? book.name.trim() : "",
    }))
    .filter((book) => book.name);
}

function normalizeClassRow(row) {
  return {
    ...row,

    id: Number(row.id),

    subject_id:
      row.subject_id === null || row.subject_id === undefined
        ? null
        : Number(row.subject_id),

    teacher_id:
      row.teacher_id === null || row.teacher_id === undefined
        ? null
        : Number(row.teacher_id),

    student_count: Number(row.student_count || 0),

    level: typeof row.level === "string" ? row.level.trim() : (row.level ?? ""),

    books: normalizeBooks(row.books),

    subject_name: row.subject_name || "",

    subject_code: row.subject_code || "",

    teacher_name: row.teacher_name || "",
  };
}

function getLevelBookText(row) {
  const level =
    row.level === null || row.level === undefined
      ? ""
      : String(row.level).trim();

  const books = Array.isArray(row.books)
    ? row.books
        .map((book) => book?.name)
        .filter(Boolean)
        .join(", ")
    : "";

  return [level, books].filter(Boolean).join(" · ");
}

function normalizeAssessment(row) {
  return {
    ...row,

    id: Number(row.id),

    class_slot_id: Number(row.class_slot_id),

    total_marks: Number(row.total_marks || 0),

    score_count: Number(row.score_count || 0),

    books: normalizeBooks(row.books),
  };
}

function EmptyState({ message }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-white/[0.06] bg-[#121519]">
      <div className="text-center">
        <FileText size={22} className="mx-auto mb-3 text-gray-700" />

        <div className="text-sm font-medium text-gray-500">{message}</div>
      </div>
    </div>
  );
}

function ScoresModal({ assessment, row, onClose, onSaved }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const totalMarks = Number(assessment.total_marks || 0);

  useEffect(() => {
    let cancelled = false;

    async function loadScores() {
      setLoading(true);
      setError("");

      try {
        const response = await api.get(
          `/marks/assessments/${assessment.id}/scores`,
        );

        const data = response?.data || {};

        const incoming = Array.isArray(data.students) ? data.students : [];

        if (cancelled) return;

        /*
         * IMPORTANT:
         * The backend returns marks_obtained.
         * The database does NOT have a score column.
         */
        setStudents(
          incoming.map((student) => ({
            ...student,

            _studentId: Number(student.student_id),

            _marksObtained:
              student.marks_obtained === null ||
              student.marks_obtained === undefined
                ? ""
                : String(student.marks_obtained),
          })),
        );
      } catch (err) {
        if (!cancelled) {
          setError(getApiError(err, "Unable to load student scores."));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadScores();

    return () => {
      cancelled = true;
    };
  }, [assessment.id]);

  function updateMarks(studentId, value) {
    setStudents((current) =>
      current.map((student) =>
        Number(student._studentId) === Number(studentId)
          ? {
              ...student,
              _marksObtained: value,
            }
          : student,
      ),
    );
  }

  async function handleSave() {
    if (saving) return;

    setSaving(true);
    setError("");

    try {
      const scores = students.map((student) => ({
        student_id: Number(student._studentId),

        /*
         * IMPORTANT:
         * Send marks_obtained because that
         * is the actual database column.
         */
        marks_obtained:
          student._marksObtained === "" ? null : Number(student._marksObtained),
      }));

      for (const item of scores) {
        if (!Number.isInteger(item.student_id) || item.student_id < 0) {
          throw new Error("Invalid student ID.");
        }

        if (
          item.marks_obtained !== null &&
          (!Number.isFinite(item.marks_obtained) ||
            item.marks_obtained < 0 ||
            item.marks_obtained > totalMarks)
        ) {
          throw new Error(`Scores must be between 0 and ${totalMarks}.`);
        }
      }

      await api.put(`/marks/assessments/${assessment.id}/scores`, {
        scores,
      });

      onSaved();
      onClose();
    } catch (err) {
      setError(getApiError(err, err?.message || "Unable to save scores."));
    } finally {
      setSaving(false);
    }
  }

  const levelBookText = getLevelBookText(row);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) {
          onClose();
        }
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#121519] shadow-2xl">
        {/* HEADER */}
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Edit3 size={16} className="text-[#f2bd19]" />

              <h2 className="truncate text-sm font-semibold text-white">
                {assessment.name}
              </h2>
            </div>

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-600">
              <span>{row.subject_name}</span>

              <span>
                Teacher:{" "}
                <span className="text-gray-400">{row.teacher_name || "—"}</span>
              </span>

              <span>
                Time:{" "}
                <span className="text-gray-400">{formatTimeRange(row)}</span>
              </span>

              <span>
                Level / Book:{" "}
                <span className="text-gray-400">{levelBookText || "—"}</span>
              </span>

              <span>
                Total: <span className="text-gray-400">{totalMarks}</span>
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-1.5 text-gray-600 hover:bg-white/[0.05] hover:text-gray-300"
          >
            <X size={16} />
          </button>
        </div>

        {/* BODY */}
        <div className="min-h-0 flex-1 overflow-auto p-5">
          {loading ? (
            <div className="flex min-h-[250px] items-center justify-center">
              <div className="flex items-center gap-2 text-[11px] text-gray-600">
                <Loader2 size={15} className="animate-spin" />
                Loading students...
              </div>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-500/10 bg-red-500/[0.04] px-4 py-3 text-[10px] text-red-400">
              {error}
            </div>
          ) : students.length === 0 ? (
            <EmptyState message="No active students are enrolled in this class." />
          ) : (
            <div className="overflow-hidden rounded-xl border border-white/[0.06]">
              <div className="grid grid-cols-[minmax(0,1fr)_100px_140px_100px] gap-3 bg-[#0b0d10] px-4 py-2.5 text-[8px] font-semibold uppercase tracking-[0.11em] text-gray-700">
                <span>Student</span>
                <span>Roll</span>
                <span>Marks</span>
                <span>Percentage</span>
              </div>

              {students.map((student) => {
                const percentage =
                  student._marksObtained === "" || totalMarks <= 0
                    ? null
                    : (Number(student._marksObtained) / totalMarks) * 100;

                return (
                  <div
                    key={student._studentId}
                    className="grid grid-cols-[minmax(0,1fr)_100px_140px_100px] items-center gap-3 border-t border-white/[0.045] px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-medium text-gray-300">
                        {student.full_name || "Unnamed student"}
                      </div>

                      <div className="mt-0.5 text-[9px] text-gray-700">
                        ID {student._studentId}
                      </div>
                    </div>

                    <div className="text-[10px] text-gray-500">
                      {student.roll_number || "—"}
                    </div>

                    <input
                      type="number"
                      min="0"
                      max={totalMarks}
                      step="0.01"
                      value={student._marksObtained}
                      onChange={(event) =>
                        updateMarks(student._studentId, event.target.value)
                      }
                      placeholder="Marks"
                      className="w-full rounded-lg border border-white/[0.07] bg-[#0b0d10] px-3 py-2 text-[11px] text-gray-200 outline-none placeholder:text-gray-700 focus:border-[#f2bd19]/30"
                    />

                    <div className="text-[10px] text-gray-500">
                      {percentage === null ? "—" : `${percentage.toFixed(1)}%`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-4">
          <div className="text-[10px] text-red-400">{error}</div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-white/[0.07] px-3.5 py-2 text-[10px] text-gray-500 hover:bg-white/[0.04] hover:text-gray-300"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading || students.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-[#f2bd19] px-3.5 py-2 text-[10px] font-semibold text-black hover:bg-[#f7c52c] disabled:opacity-60"
            >
              {saving ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Save size={12} />
              )}

              {saving ? "Saving..." : "Save Scores"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| CLASS ROW
|--------------------------------------------------------------------------
*/
function ClassItem({ row, assessments, onOpen }) {
  const levelBookText = getLevelBookText(row);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1.1fr)_minmax(88px,0.9fr)_minmax(0,1.05fr)_minmax(48px,0.45fr)_minmax(100px,0.7fr)] items-center gap-3 border-t border-white/[0.055] px-4 py-3 hover:bg-white/[0.018]">
      <div className="min-w-0">
        <div className="truncate text-[12px] font-medium text-gray-200">
          {row.teacher_name || "—"}
        </div>

        <div className="mt-0.5 text-[9px] uppercase tracking-[0.08em] text-gray-700">
          Teacher
        </div>
      </div>

      <div className="truncate text-[11px] text-gray-400">
        {formatTimeRange(row)}
      </div>

      <div className="min-w-0">
        <div className="truncate text-[10px] text-gray-400">
          {levelBookText || "No level / book"}
        </div>

        <div className="mt-0.5 text-[9px] uppercase tracking-[0.08em] text-gray-700">
          Level / Book
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
        <Users size={13} className="text-gray-600" />

        {row.student_count}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => onOpen(row)}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.07] bg-white/[0.025] px-2.5 py-1.5 text-[9px] text-gray-500 hover:border-[#f2bd19]/25 hover:text-[#f2bd19]"
        >
          <FileText size={10} />
          {assessments.length}{" "}
          {assessments.length === 1 ? "assessment" : "assessments"}
        </button>
      </div>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| SUBJECT COLUMN
|--------------------------------------------------------------------------
*/
function SubjectColumn({ subject, rows, color, assessmentsByClass, onOpen }) {
  const sortedRows = useMemo(
    () =>
      [...rows].sort((a, b) =>
        String(a.start_time || "").localeCompare(String(b.start_time || "")),
      ),
    [rows],
  );

  return (
    <div
      className={`min-w-0 overflow-hidden rounded-xl border ${color.border} ${color.bg}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.055] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className={`h-7 w-1 shrink-0 rounded-full ${color.accent}`} />

          <div className="min-w-0">
            <div className={`truncate text-[13px] font-semibold ${color.text}`}>
              {subject.name}
            </div>

            {subject.code && (
              <div className="mt-0.5 text-[9px] uppercase tracking-[0.08em] text-gray-700">
                {subject.code}
              </div>
            )}
          </div>
        </div>

        <div className="text-[9px] text-gray-600">
          <BookOpen size={11} className="mr-1 inline" />
          {rows.length} {rows.length === 1 ? "class" : "classes"}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(88px,0.9fr)_minmax(0,1.05fr)_minmax(48px,0.45fr)_minmax(100px,0.7fr)] gap-3 px-4 py-2 text-[8px] font-semibold uppercase tracking-[0.11em] text-gray-700">
        <span>Teacher</span>
        <span>Time</span>
        <span>Level / Book</span>
        <span>Students</span>
        <span className="text-right">Assessments</span>
      </div>

      {sortedRows.map((row) => (
        <ClassItem
          key={row.id}
          row={row}
          assessments={assessmentsByClass.get(Number(row.id)) || []}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| CLASS WORKSPACE
|--------------------------------------------------------------------------
*/
function ClassWorkspace({
  row,
  assessments,
  onClose,
  onNewAssessment,
  onOpenAssessment,
}) {
  const levelBookText = getLevelBookText(row);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#121519]">
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <BookOpen size={16} className="text-[#f2bd19]" />

              <h2 className="truncate text-sm font-semibold text-white">
                {row.subject_name}
              </h2>
            </div>

            <div className="mt-2 flex flex-wrap gap-4 text-[10px] text-gray-600">
              <span>
                Teacher:{" "}
                <span className="text-gray-400">{row.teacher_name || "—"}</span>
              </span>

              <span>
                Time:{" "}
                <span className="text-gray-400">{formatTimeRange(row)}</span>
              </span>

              <span>
                Level / Book:{" "}
                <span className="text-gray-400">{levelBookText || "—"}</span>
              </span>

              <span>
                Students:{" "}
                <span className="text-gray-400">{row.student_count}</span>
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-600 hover:bg-white/[0.05] hover:text-gray-300"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
          <div>
            <div className="text-[11px] font-medium text-gray-300">
              Assessments
            </div>

            <div className="mt-0.5 text-[9px] text-gray-700">
              Assessments and scores for this class
            </div>
          </div>

          <button
            type="button"
            onClick={onNewAssessment}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#f2bd19] px-3 py-2 text-[10px] font-semibold text-black hover:bg-[#f7c52c]"
          >
            <FileText size={11} />
            New Assessment
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {assessments.length === 0 ? (
            <EmptyState message="No assessments yet." />
          ) : (
            <div className="space-y-2">
              {assessments.map((assessment) => (
                <div
                  key={assessment.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] bg-[#0b0d10] px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-medium text-gray-200">
                      {assessment.name}
                    </div>

                    <div className="mt-1 text-[9px] text-gray-600">
                      Date:{" "}
                      <span className="text-gray-400">
                        {formatDate(assessment.exam_date)}
                      </span>
                      <span className="mx-2">·</span>
                      Total:{" "}
                      <span className="text-gray-400">
                        {assessment.total_marks}
                      </span>
                      <span className="mx-2">·</span>
                      Scores:{" "}
                      <span className="text-gray-400">
                        {assessment.score_count}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenAssessment(assessment, row)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.07] px-3 py-2 text-[9px] text-gray-500 hover:border-[#f2bd19]/25 hover:text-[#f2bd19]"
                  >
                    <Edit3 size={10} />
                    Scores
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| NEW ASSESSMENT MODAL
|--------------------------------------------------------------------------
*/
function NewAssessmentModal({ row, onClose, onCreated }) {
  const [name, setName] = useState("");

  const [examDate, setExamDate] = useState(getToday());

  const [totalMarks, setTotalMarks] = useState("100");

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();

    if (saving) return;

    if (!name.trim()) {
      setError("Assessment name is required.");
      return;
    }

    const total = Number(totalMarks);

    if (!Number.isFinite(total) || total <= 0) {
      setError("Total marks must be greater than zero.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const response = await api.post("/marks/assessments", {
        name: name.trim(),
        class_slot_id: Number(row.id),
        exam_date: examDate,
        total_marks: total,
        is_published: false,
      });

      onCreated(normalizeAssessment(response.data));

      onClose();
    } catch (err) {
      setError(getApiError(err, "Unable to create assessment."));
    } finally {
      setSaving(false);
    }
  }

  const levelBookText = getLevelBookText(row);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#121519]"
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-[#f2bd19]" />

              <h2 className="text-sm font-semibold text-white">
                New Assessment
              </h2>
            </div>

            <p className="mt-1 text-[10px] text-gray-600">
              {row.subject_name} · {row.teacher_name}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-1.5 text-gray-600 hover:bg-white/[0.05] hover:text-gray-300"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-xl border border-white/[0.05] bg-[#0b0d10] px-3 py-3 text-[10px] text-gray-500">
            <div>
              Teacher:{" "}
              <span className="text-gray-300">{row.teacher_name || "—"}</span>
            </div>

            <div className="mt-1">
              Time:{" "}
              <span className="text-gray-300">{formatTimeRange(row)}</span>
            </div>

            <div className="mt-1">
              Level / Book:{" "}
              <span className="text-gray-300">{levelBookText || "—"}</span>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-[10px] uppercase tracking-[0.1em] text-gray-600">
              Assessment name
            </label>

            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Final Exam"
              className="w-full rounded-xl border border-white/[0.08] bg-[#0b0d10] px-3.5 py-3 text-[12px] text-gray-200 outline-none placeholder:text-gray-700 focus:border-[#f2bd19]/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-2 block text-[10px] uppercase tracking-[0.1em] text-gray-600">
                Date
              </label>

              <input
                type="date"
                value={examDate}
                onChange={(event) => setExamDate(event.target.value)}
                className="w-full rounded-xl border border-white/[0.08] bg-[#0b0d10] px-3 py-3 text-[11px] text-gray-300 outline-none"
              />
            </div>

            <div>
              <label className="mb-2 block text-[10px] uppercase tracking-[0.1em] text-gray-600">
                Total marks
              </label>

              <input
                type="number"
                min="1"
                step="0.01"
                value={totalMarks}
                onChange={(event) => setTotalMarks(event.target.value)}
                className="w-full rounded-xl border border-white/[0.08] bg-[#0b0d10] px-3 py-3 text-[11px] text-gray-300 outline-none"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/10 bg-red-500/[0.04] px-3 py-2 text-[10px] text-red-400">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-white/[0.06] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-white/[0.07] px-3.5 py-2 text-[10px] text-gray-500 hover:text-gray-300"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-[#f2bd19] px-3.5 py-2 text-[10px] font-semibold text-black disabled:opacity-60"
          >
            {saving ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Save size={12} />
            )}

            {saving ? "Creating..." : "Create Assessment"}
          </button>
        </div>
      </form>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| MAIN REPORTS PAGE
|--------------------------------------------------------------------------
*/
export default function Exams() {
  const [classes, setClasses] = useState([]);

  const [assessments, setAssessments] = useState([]);

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");

  const [search, setSearch] = useState("");

  const [selectedClass, setSelectedClass] = useState(null);

  const [newAssessmentClass, setNewAssessmentClass] = useState(null);

  const [selectedAssessment, setSelectedAssessment] = useState(null);

  const [selectedAssessmentClass, setSelectedAssessmentClass] = useState(null);

  const loadReports = useCallback(async (showRefresh = false) => {
    if (showRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      /*
       * EXACTLY like Timetable:
       * /classes is the source for class data.
       */
      const [classesResponse, assessmentsResponse] = await Promise.all([
        api.get("/classes"),
        api.get("/marks/assessments"),
      ]);

      const classData = Array.isArray(classesResponse.data)
        ? classesResponse.data
        : [];

      const assessmentData = Array.isArray(assessmentsResponse.data)
        ? assessmentsResponse.data
        : [];

      setClasses(
        classData
          .map(normalizeClassRow)
          .filter((row) => row.is_active !== false),
      );

      setAssessments(assessmentData.map(normalizeAssessment));
    } catch (err) {
      setError(getApiError(err, "Unable to load reports."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const assessmentsByClass = useMemo(() => {
    const map = new Map();

    assessments.forEach((assessment) => {
      const classId = Number(assessment.class_slot_id);

      if (!map.has(classId)) {
        map.set(classId, []);
      }

      map.get(classId).push(assessment);
    });

    return map;
  }, [assessments]);

  const filteredClasses = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return classes;
    }

    return classes.filter((row) => {
      const levelBook = getLevelBookText(row);

      const text = [
        row.subject_name,
        row.subject_code,
        row.teacher_name,
        row.level,
        levelBook,
        ...row.books.map((book) => book.name),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(term);
    });
  }, [classes, search]);

  const subjects = useMemo(() => {
    const map = new Map();

    filteredClasses.forEach((row) => {
      const key =
        row.subject_id !== null
          ? String(row.subject_id)
          : `name:${row.subject_name}`;

      if (!map.has(key)) {
        map.set(key, {
          id: key,
          name: row.subject_name || "Unnamed subject",
          code: row.subject_code || "",
          rows: [],
        });
      }

      map.get(key).rows.push(row);
    });

    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [filteredClasses]);

  const subjectPairs = useMemo(() => {
    const result = [];

    for (let i = 0; i < subjects.length; i += 2) {
      result.push(subjects.slice(i, i + 2));
    }

    return result;
  }, [subjects]);

  function openAssessment(assessment, row) {
    setSelectedAssessment(assessment);

    setSelectedAssessmentClass(row);
  }

  function handleCreated(assessment) {
    setAssessments((current) => [...current, assessment]);

    loadReports(true);
  }

  return (
    <div className="min-w-0 w-full">
      {/* HEADER */}
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <FileText size={18} className="text-[#f2bd19]" />

            <h1 className="text-lg font-semibold text-white">Reports</h1>
          </div>

          <p className="mt-1 text-[11px] text-gray-600">
            Assessments and student results by subject
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadReports(true)}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-[10px] text-gray-500 hover:text-gray-300 disabled:opacity-50"
        >
          <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* SEARCH */}
      <div className="mb-5">
        <div className="relative max-w-md">
          <Search
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-700"
          />

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search subject, teacher, level or book..."
            className="w-full rounded-lg border border-white/[0.07] bg-[#121519] py-2.5 pl-9 pr-3 text-[10px] text-gray-300 outline-none placeholder:text-gray-700"
          />
        </div>
      </div>

      {/* ERROR */}
      {error && (
        <div className="mb-5 rounded-xl border border-red-500/10 bg-red-500/[0.04] px-4 py-3 text-[10px] text-red-400">
          {error}
        </div>
      )}

      {/* CONTENT */}
      {loading ? (
        <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-white/[0.06] bg-[#121519]">
          <div className="flex items-center gap-2 text-[11px] text-gray-600">
            <Loader2 size={15} className="animate-spin" />
            Loading reports...
          </div>
        </div>
      ) : subjects.length === 0 ? (
        <EmptyState message="No active classes found." />
      ) : (
        <div className="space-y-4">
          {subjectPairs.map((pair, pairIndex) => (
            <div
              key={pairIndex}
              className="grid grid-cols-1 gap-4 lg:grid-cols-2"
            >
              {pair.map((subject, subjectIndex) => (
                <SubjectColumn
                  key={subject.id}
                  subject={subject}
                  rows={subject.rows}
                  color={colorForSubject(pairIndex * 2 + subjectIndex)}
                  assessmentsByClass={assessmentsByClass}
                  onOpen={setSelectedClass}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* CLASS WORKSPACE */}
      {selectedClass && (
        <ClassWorkspace
          row={selectedClass}
          assessments={assessmentsByClass.get(Number(selectedClass.id)) || []}
          onClose={() => setSelectedClass(null)}
          onNewAssessment={() => setNewAssessmentClass(selectedClass)}
          onOpenAssessment={openAssessment}
        />
      )}

      {/* NEW ASSESSMENT */}
      {newAssessmentClass && (
        <NewAssessmentModal
          row={newAssessmentClass}
          onClose={() => setNewAssessmentClass(null)}
          onCreated={handleCreated}
        />
      )}

      {/* SCORES */}
      {selectedAssessment && selectedAssessmentClass && (
        <ScoresModal
          assessment={selectedAssessment}
          row={selectedAssessmentClass}
          onClose={() => {
            setSelectedAssessment(null);

            setSelectedAssessmentClass(null);
          }}
          onSaved={() => loadReports(true)}
        />
      )}
    </div>
  );
}
