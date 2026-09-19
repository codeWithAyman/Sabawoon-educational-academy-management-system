import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  BookOpen,
  CalendarDays,
  Check,
  Clock3,
  Edit3,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Save,
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

const DAY_ORDER = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

const DAY_NAMES = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

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
    comments: typeof row.comments === "string" ? row.comments.trim() : "",
    books: Array.isArray(row.books) ? row.books : [],
  };
}

function getStartTime(row) {
  return row.timetable_start_time || row.class_start_time || "";
}

function getEndTime(row) {
  return row.timetable_end_time || row.class_end_time || "";
}

function formatTime(time) {
  if (!time) return "—";

  const match = String(time).match(/^(\d{1,2}):(\d{2})/);

  if (!match) return String(time);

  let hour = Number(match[1]);
  const minute = match[2];

  const suffix = hour >= 12 ? "PM" : "AM";

  hour = hour % 12;

  if (hour === 0) hour = 12;

  return `${hour}:${minute} ${suffix}`;
}

function formatTimeRange(row) {
  const start = getStartTime(row);
  const end = getEndTime(row);

  if (!start && !end) return "—";

  if (!end) return formatTime(start);

  return `${formatTime(start)} – ${formatTime(end)}`;
}

function getDayName(value) {
  if (!value) return "Unscheduled";

  const normalized = String(value).toLowerCase();

  return DAY_NAMES[normalized] || value;
}

function getDaySort(value) {
  return DAY_ORDER[String(value || "").toLowerCase()] || 99;
}

function colorForSubject(index) {
  return SUBJECT_COLORS[index % SUBJECT_COLORS.length];
}

function mergeClassAndTimetable(classes, timetable) {
  const timetableByClass = new Map();

  timetable.forEach((entry) => {
    const classSlotId = Number(entry.id);

    if (!timetableByClass.has(classSlotId)) {
      timetableByClass.set(classSlotId, []);
    }

    timetableByClass.get(classSlotId).push(entry);
  });

  const merged = [];

  classes.forEach((classRow) => {
    const entries = timetableByClass.get(Number(classRow.id)) || [];

    if (!entries.length) {
      merged.push(
        normalizeClassRow({
          ...classRow,
          timetable_id: null,
          day_of_week: null,
          timetable_start_time: classRow.start_time,
          timetable_end_time: classRow.end_time,
          room: null,
          books: classRow.books || [],
          student_count: classRow.student_count || 0,
        }),
      );

      return;
    }

    entries.forEach((entry) => {
      merged.push(
        normalizeClassRow({
          ...classRow,
          ...entry,
          id: classRow.id,
          subject_id: classRow.subject_id,
          subject_name: classRow.subject_name,
          subject_code: classRow.subject_code,
          teacher_id: classRow.teacher_id,
          teacher_name: classRow.teacher_name,
          class_start_time: classRow.start_time,
          class_end_time: classRow.end_time,
          comments: classRow.comments,
          books: classRow.books || [],
          student_count: classRow.student_count || 0,
        }),
      );
    });
  });

  return merged;
}

function ClassItem({ row, onComment }) {
  const hasComment = Boolean(row.comments && row.comments.trim());

  const bookNames = Array.isArray(row.books)
    ? row.books
        .map((book) => book?.name)
        .filter(Boolean)
        .join(", ")
    : "";

  return (
    <div
      className="
        grid min-w-0
        grid-cols-[minmax(0,1.1fr)_minmax(88px,0.9fr)_minmax(0,1.05fr)_minmax(48px,0.45fr)_minmax(0,1.4fr)]
        items-center
        gap-3
        border-t border-white/[0.055]
        px-4 py-3
        transition-colors
        hover:bg-white/[0.018]
      "
    >
      {/* TEACHER */}
      <div className="min-w-0">
        <div className="truncate text-[12px] font-medium text-gray-200">
          {row.teacher_name || "—"}
        </div>

        <div className="mt-0.5 truncate text-[9px] uppercase tracking-[0.08em] text-gray-700">
          Teacher
        </div>
      </div>

      {/* TIME */}
      <div className="flex min-w-0 items-center gap-2">
        <Clock3 size={13} className="shrink-0 text-gray-600" />

        <span
          className="truncate text-[11px] text-gray-400"
          title={formatTimeRange(row)}
        >
          {formatTimeRange(row)}
        </span>
      </div>

      {/* LEVEL / BOOK */}
      <div className="min-w-0">
        <div
          className={[
            "truncate text-[10px]",
            bookNames ? "text-gray-400" : "text-gray-700",
          ].join(" ")}
          title={bookNames || "No level / book"}
        >
          {bookNames || "No level / book"}
        </div>

        <div className="mt-0.5 truncate text-[9px] uppercase tracking-[0.08em] text-gray-700">
          Level / Book
        </div>
      </div>

      {/* STUDENTS */}
      <div className="flex min-w-0 items-center gap-1.5">
        <Users size={13} className="shrink-0 text-gray-600" />

        <span className="truncate text-[11px] text-gray-400">
          {row.student_count}
        </span>
      </div>

      {/* COMMENTS */}
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={[
            "min-w-0 flex-1 truncate text-[10px]",
            hasComment ? "text-gray-400" : "text-gray-700",
          ].join(" ")}
          title={hasComment ? row.comments : "No comments"}
        >
          {hasComment ? row.comments : "No comments"}
        </span>

        <button
          type="button"
          onClick={() => onComment(row)}
          className={[
            "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[9px] font-medium transition",
            hasComment
              ? "border-white/10 bg-white/[0.035] text-gray-300 hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
              : "border-white/[0.07] text-gray-600 hover:border-[#f2bd19]/25 hover:bg-[#f2bd19]/[0.04] hover:text-[#f2bd19]",
          ].join(" ")}
        >
          {hasComment ? <Edit3 size={10} /> : <MessageSquareText size={10} />}

          <span className="whitespace-nowrap">
            {hasComment ? "Edit note" : "Add note"}
          </span>
        </button>
      </div>
    </div>
  );
}

function SubjectColumn({ subject, rows, color, onComment }) {
  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const dayDifference =
        getDaySort(a.day_of_week) - getDaySort(b.day_of_week);

      if (dayDifference !== 0) return dayDifference;

      const aTime = getStartTime(a) || "99:99";
      const bTime = getStartTime(b) || "99:99";

      if (aTime !== bTime) {
        return aTime.localeCompare(bTime);
      }

      return String(a.teacher_name || "").localeCompare(
        String(b.teacher_name || ""),
      );
    });
  }, [rows]);

  return (
    <div
      className={[
        "min-w-0 overflow-hidden rounded-xl border",
        color.border,
        color.bg,
      ].join(" ")}
    >
      {/* SUBJECT HEADER */}
      <div className="flex min-w-0 items-center justify-between gap-3 border-b border-white/[0.055] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className={["h-7 w-1 shrink-0 rounded-full", color.accent].join(
              " ",
            )}
          />

          <div className="min-w-0">
            <div
              className={[
                "truncate text-[13px] font-semibold",
                color.text,
              ].join(" ")}
              title={subject.name}
            >
              {subject.name}
            </div>

            {subject.code && (
              <div className="mt-0.5 truncate text-[9px] uppercase tracking-[0.08em] text-gray-700">
                {subject.code}
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 text-[9px] text-gray-600">
          <BookOpen size={11} />
          <span>
            {rows.length} {rows.length === 1 ? "class" : "classes"}
          </span>
        </div>
      </div>

      {/* TABLE HEADER */}
      <div
        className="
          grid min-w-0
          grid-cols-[minmax(0,1.1fr)_minmax(88px,0.9fr)_minmax(0,1.05fr)_minmax(48px,0.45fr)_minmax(0,1.4fr)]
          items-center
          gap-3
          px-4 py-2
          text-[8px]
          font-semibold
          uppercase
          tracking-[0.11em]
          text-gray-700
        "
      >
        <span>Teacher</span>
        <span>Time</span>
        <span>Level / Book</span>
        <span>Students</span>
        <span>Comments</span>
      </div>

      {sortedRows.map((row, index) => (
        <ClassItem
          key={`${row.id}-${row.timetable_id || "none"}-${index}`}
          row={row}
          onComment={onComment}
        />
      ))}
    </div>
  );
}

function CommentModal({ row, onClose, onSaved }) {
  const [value, setValue] = useState(row?.comments || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setValue(row?.comments || "");
    setError("");
  }, [row]);

  if (!row) return null;

  const hasComment = Boolean(row.comments && row.comments.trim());

  async function handleSave() {
    if (saving) return;

    setSaving(true);
    setError("");

    try {
      const response = await api.put(`/timetable/class/${row.id}/comments`, {
        comments: value,
      });

      const savedComments =
        typeof response?.data?.comments === "string"
          ? response.data.comments
          : value.trim();

      onSaved(row.id, savedComments);
      onClose();
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          "Unable to save the comment. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#121519] shadow-2xl">
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <MessageSquareText
                size={16}
                className="shrink-0 text-[#f2bd19]"
              />

              <h2 className="truncate text-sm font-semibold text-white">
                {hasComment ? "Edit class note" : "Add class note"}
              </h2>
            </div>

            <p className="mt-1 truncate text-[10px] text-gray-600">
              {row.subject_name || "Class"} · {row.teacher_name || "Teacher"}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-1.5 text-gray-600 transition hover:bg-white/[0.05] hover:text-gray-300 disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        {/* BODY */}
        <div className="p-5">
          <label className="mb-2 block text-[10px] font-medium uppercase tracking-[0.1em] text-gray-600">
            Comments
          </label>

          <textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            maxLength={5000}
            rows={6}
            autoFocus
            placeholder="Add a note about this class..."
            className="
              w-full
              resize-none
              rounded-xl
              border
              border-white/[0.08]
              bg-[#0b0d10]
              px-3.5
              py-3
              text-[12px]
              leading-5
              text-gray-200
              outline-none
              placeholder:text-gray-700
              focus:border-[#f2bd19]/30
              focus:ring-1
              focus:ring-[#f2bd19]/10
            "
          />

          <div className="mt-2 flex items-center justify-between">
            <span className="text-[9px] text-gray-700">
              {value.length}/5000
            </span>

            {error && (
              <span className="max-w-[75%] text-right text-[10px] text-red-400">
                {error}
              </span>
            )}
          </div>
        </div>

        {/* FOOTER */}
        <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-white/[0.07] px-3.5 py-2 text-[10px] font-medium text-gray-500 transition hover:bg-white/[0.04] hover:text-gray-300 disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-[#f2bd19] px-3.5 py-2 text-[10px] font-semibold text-black transition hover:bg-[#f7c52c] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Save size={12} />
            )}

            {saving ? "Saving..." : "Save note"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Timetable() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [selectedClass, setSelectedClass] = useState(null);

  const loadTimetable = useCallback(async (showRefresh = false) => {
    if (showRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const [classesResponse, timetableResponse] = await Promise.all([
        api.get("/classes"),
        api.get("/timetable"),
      ]);

      const classesData = Array.isArray(classesResponse.data)
        ? classesResponse.data
        : [];

      const timetableData = Array.isArray(timetableResponse.data)
        ? timetableResponse.data
        : [];

      const merged = mergeClassAndTimetable(classesData, timetableData);

      setRows(merged);
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          "Unable to load the timetable. Please try again.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadTimetable();
  }, [loadTimetable]);

  const subjects = useMemo(() => {
    const map = new Map();

    rows.forEach((row) => {
      const key =
        row.subject_id !== null && row.subject_id !== undefined
          ? String(row.subject_id)
          : `name:${row.subject_name || "unknown"}`;

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
  }, [rows]);

  const subjectPairs = useMemo(() => {
    const pairs = [];

    for (let i = 0; i < subjects.length; i += 2) {
      pairs.push(subjects.slice(i, i + 2));
    }

    return pairs;
  }, [subjects]);

  function handleCommentSaved(classSlotId, comments) {
    setRows((currentRows) =>
      currentRows.map((row) =>
        Number(row.id) === Number(classSlotId)
          ? {
              ...row,
              comments,
            }
          : row,
      ),
    );

    setSelectedClass((current) => {
      if (!current || Number(current.id) !== Number(classSlotId)) {
        return current;
      }

      return {
        ...current,
        comments,
      };
    });
  }

  return (
    <div className="min-w-0 w-full">
      {/* PAGE HEADER */}
      <div className="mb-5 flex min-w-0 items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <CalendarDays size={18} className="shrink-0 text-[#f2bd19]" />

            <h1 className="truncate text-lg font-semibold text-white">
              Timetable
            </h1>
          </div>

          <p className="mt-1 truncate text-[11px] text-gray-600">
            Weekly class schedule and class notes
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadTimetable(true)}
          disabled={loading || refreshing}
          className="
            inline-flex
            shrink-0
            items-center
            gap-2
            rounded-lg
            border
            border-white/[0.08]
            bg-white/[0.025]
            px-3
            py-2
            text-[10px]
            font-medium
            text-gray-500
            transition
            hover:border-white/[0.14]
            hover:bg-white/[0.045]
            hover:text-gray-300
            disabled:cursor-not-allowed
            disabled:opacity-50
          "
        >
          <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* ERROR */}
      {error && (
        <div className="mb-5 flex min-w-0 items-start gap-3 rounded-xl border border-red-500/10 bg-red-500/[0.04] px-4 py-3">
          <X size={14} className="mt-0.5 shrink-0 text-red-400" />

          <div className="min-w-0">
            <div className="text-[11px] font-medium text-red-300">
              Unable to load timetable
            </div>

            <div className="mt-0.5 break-words text-[10px] text-red-400/70">
              {error}
            </div>
          </div>
        </div>
      )}

      {/* LOADING */}
      {loading ? (
        <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-white/[0.06] bg-[#121519]">
          <div className="flex items-center gap-2.5 text-[11px] text-gray-600">
            <Loader2 size={15} className="animate-spin" />
            Loading timetable...
          </div>
        </div>
      ) : subjects.length === 0 ? (
        <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-white/[0.06] bg-[#121519] px-6 text-center">
          <Check size={22} className="mb-3 text-gray-700" />

          <div className="text-sm font-medium text-gray-500">
            No classes found
          </div>

          <div className="mt-1 text-[10px] text-gray-700">
            Active classes will appear here automatically.
          </div>
        </div>
      ) : (
        <div className="min-w-0 space-y-4">
          {subjectPairs.map((pair, pairIndex) => (
            <div
              key={pairIndex}
              className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2"
            >
              {pair.map((subject, subjectIndex) => (
                <SubjectColumn
                  key={subject.id}
                  subject={subject}
                  rows={subject.rows}
                  color={colorForSubject(pairIndex * 2 + subjectIndex)}
                  onComment={setSelectedClass}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      <CommentModal
        row={selectedClass}
        onClose={() => setSelectedClass(null)}
        onSaved={handleCommentSaved}
      />
    </div>
  );
}
