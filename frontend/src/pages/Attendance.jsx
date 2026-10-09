import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  CalendarDays,
  CalendarOff,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  Lock,
  RefreshCw,
  Save,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from "lucide-react";

import api from "../lib/api";
import LeaveCommentDialog from "../components/LeaveCommentDialog";
import SummaryTooltip from "../components/SummaryTooltip";

const SOLAR_MONTH_NAMES = {
  1: "Hamal",
  2: "Sawr",
  3: "Jawza",
  4: "Saratan",
  5: "Asad",
  6: "Sunbula",
  7: "Mizan",
  8: "Aqrab",
  9: "Qaws",
  10: "Jadi",
  11: "Dalwa",
  12: "Hoot",
};

const STATUS = {
  PRESENT: "present",
  ABSENT: "absent",
  LEAVE: "leave",
};

/*
  Attendance cycle applied on every click:

    unmarked -> Present -> Absent -> Leave -> Present -> ...

  'leave' must cycle forward to 'present' so the user is never stuck on it.
*/
const STATUS_CYCLE = [STATUS.PRESENT, STATUS.ABSENT, STATUS.LEAVE];

/*
  A leave cell waits this long before cycling back to present, so a
  fast double click can be treated as "ask for the leave reason"
  instead of two ordinary clicks.
*/
const DOUBLE_CLICK_DELAY = 260;

function getNextStatus(current) {
  const index = STATUS_CYCLE.indexOf(current);

  if (index === -1) return STATUS.PRESENT;

  return STATUS_CYCLE[(index + 1) % STATUS_CYCLE.length];
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? "");
  return number.toLocaleString("en-US");
}

function getErrorMessage(error) {
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.response?.data?.error) return error.response.data.error;
  if (error?.message) return error.message;
  return "Something went wrong. Please try again.";
}

function normalizeDay(day) {
  if (typeof day === "object" && day !== null) {
    return {
      day: Number(day.day),
      date: day.date || day.solar_date || null,
      gregorian_date: day.gregorian_date || null,
      is_today: Boolean(day.is_today),
      weekday: day.weekday ?? day.weekday_name ?? null,
      weekday_index:
        day.weekday_index === undefined ? null : Number(day.weekday_index),
    };
  }

  return {
    day: Number(day),
    date: null,
    gregorian_date: null,
    is_today: false,
    weekday: null,
    weekday_index: null,
  };
}

function getWeekdayLabel(day) {
  const value = String(day?.weekday || "").trim();
  return value ? value.slice(0, 3).toUpperCase() : "";
}

function isFridayDay(day) {
  const weekday = String(day?.weekday || "")
    .trim()
    .toLowerCase();

  return weekday === "friday" || weekday === "fri" || weekday === "جمعه";
}

function buildDisplayDays(days) {
  const normalized = Array.isArray(days)
    ? days
        .map(normalizeDay)
        .filter((day) => Number.isInteger(day.day) && day.day > 0)
        .sort((a, b) => a.day - b.day)
    : [];

  if (!normalized.length) return [];

  const byDay = new Map(normalized.map((day) => [day.day, day]));
  const result = [];

  for (let index = 0; index < normalized.length; index += 1) {
    const current = normalized[index];
    const previous = normalized[index - 1];
    const next = normalized[index + 1];

    if (
      index === 0 &&
      current.day > 1 &&
      ["saturday", "sat", "شنبه"].includes(
        String(current.weekday || "").toLowerCase(),
      )
    ) {
      const dayNumber = current.day - 1;

      if (!byDay.has(dayNumber)) {
        result.push({
          day: dayNumber,
          date: null,
          gregorian_date: null,
          is_today: false,
          weekday: "Friday",
          weekday_index: 5,
          is_friday: true,
        });
      }
    }

    if (previous && current.day - previous.day > 1) {
      for (
        let dayNumber = previous.day + 1;
        dayNumber < current.day;
        dayNumber += 1
      ) {
        if (!byDay.has(dayNumber)) {
          result.push({
            day: dayNumber,
            date: null,
            gregorian_date: null,
            is_today: false,
            weekday: "Friday",
            weekday_index: 5,
            is_friday: true,
          });
        }
      }
    }

    result.push(current);

    if (
      next &&
      next.day - current.day > 1 &&
      String(current.weekday || "").toLowerCase() === "thursday"
    ) {
      const dayNumber = current.day + 1;

      if (!byDay.has(dayNumber)) {
        result.push({
          day: dayNumber,
          date: null,
          gregorian_date: null,
          is_today: false,
          weekday: "Friday",
          weekday_index: 5,
          is_friday: true,
        });
      }
    }

    if (!next && String(current.weekday || "").toLowerCase() === "thursday") {
      const dayNumber = current.day + 1;

      if (!byDay.has(dayNumber)) {
        result.push({
          day: dayNumber,
          date: null,
          gregorian_date: null,
          is_today: false,
          weekday: "Friday",
          weekday_index: 5,
          is_friday: true,
        });
      }
    }
  }

  return result
    .map((day) => ({
      ...day,
      is_friday: Boolean(day.is_friday) || isFridayDay(day),
    }))
    .sort((a, b) => a.day - b.day);
}

function getPaymentData(student) {
  const rawStatus =
    student?.payment_status ?? student?.status ?? student?.fee_status ?? "";

  const value = String(
    typeof rawStatus === "object" && rawStatus !== null
      ? (rawStatus.status ??
          rawStatus.payment_status ??
          rawStatus.fee_status ??
          "")
      : rawStatus || "",
  ).toLowerCase();

  const dueAmount = Number(
    student?.payment_due_amount ??
      (typeof rawStatus === "object" && rawStatus !== null
        ? (rawStatus.payment_due_amount ??
          rawStatus.due_amount ??
          rawStatus.due)
        : 0),
  );

  const paidAmount = Number(
    student?.payment_paid_amount ??
      (typeof rawStatus === "object" && rawStatus !== null
        ? (rawStatus.payment_paid_amount ??
          rawStatus.paid_amount ??
          rawStatus.paid)
        : 0),
  );

  if (
    value.includes("paid") &&
    !value.includes("unpaid") &&
    !value.includes("partial")
  ) {
    return {
      label: "Paid",
      amount: null,
      className:
        "border-emerald-400/25 bg-emerald-400/10 text-emerald-300 text-xs font-semibold",
    };
  }

  if (value.includes("partial")) {
    return {
      label:
        Number.isFinite(dueAmount) && dueAmount > 0
          ? `AFN ${formatNumber(dueAmount)} due`
          : "Due",
      amount: null,
      className:
        "border-amber-400/25 bg-amber-400/10 text-amber-300 text-xs font-semibold",
    };
  }

  if (
    value.includes("unpaid") ||
    value.includes("pending") ||
    value.includes("due")
  ) {
    return {
      label:
        Number.isFinite(dueAmount) && dueAmount > 0
          ? `AFN ${formatNumber(dueAmount)} due`
          : "DUE",
      amount: null,
      className:
        "border-red-400/30 bg-red-400/10 text-red-300 text-xs font-bold",
    };
  }

  if (value.includes("no_fee") || value.includes("no fee")) {
    return {
      label: "DUE",
      amount: null,
      className:
        "border-red-400/30 bg-red-400/10 text-red-300 text-xs font-bold",
    };
  }

  return {
    label: rawStatus ? String(rawStatus) : "DUE",
    amount: null,
    className: "border-red-400/30 bg-red-400/10 text-red-300 text-xs font-bold",
  };
}

function AttendanceStatusButton({
  status,
  onClick,
  onDoubleClick,
  hasComment,
  disabled,
}) {
  if (status === STATUS.PRESENT) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title="Present — click to change"
        className="
          flex h-7 w-7 items-center justify-center rounded-md
          border border-emerald-500/25 bg-emerald-500/10
          text-emerald-400 transition
          hover:bg-emerald-500/15
          disabled:cursor-not-allowed disabled:opacity-50
        "
      >
        <Check size={13} strokeWidth={2.5} />
      </button>
    );
  }

  if (status === STATUS.ABSENT) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title="Absent — click to change"
        className="
          flex h-7 w-7 items-center justify-center rounded-md
          border border-red-500/25 bg-red-500/10
          text-red-400 transition
          hover:bg-red-500/15
          disabled:cursor-not-allowed disabled:opacity-50
        "
      >
        <X size={13} strokeWidth={2.5} />
      </button>
    );
  }

  if (status === STATUS.LEAVE) {
    return (
      <button
        type="button"
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        disabled={disabled}
        title={
          hasComment
            ? "Leave — click to change, double click to edit the reason"
            : "Leave — click to change, double click to add a reason"
        }
        className="
          relative flex h-7 w-7 items-center justify-center rounded-md
          border border-amber-500/25 bg-amber-500/10
          text-amber-400 transition
          hover:bg-amber-500/15
          disabled:cursor-not-allowed disabled:opacity-50
        "
      >
        <CalendarOff size={13} strokeWidth={2.5} />

        {hasComment && (
          <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-amber-300" />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Not marked — click to mark present"
      className="
        flex h-7 w-7 items-center justify-center rounded-md
        border border-white/10 bg-white/[0.025]
        text-slate-600 transition
        hover:border-white/20 hover:bg-white/[0.05]
        hover:text-slate-300
        disabled:cursor-not-allowed disabled:opacity-50
      "
    >
      <span className="text-[11px]">•</span>
    </button>
  );
}

/* ============================================================
   MONTHLY SUMMARY

   Three tiny counters for the month: how many days the student
   was present, absent and on leave. Hovering the cell opens the
   detailed breakdown for that student.
============================================================ */

function SummaryCell({ summary }) {
  if (!summary) {
    return <span className="text-[8px] text-slate-700">—</span>;
  }

  const items = [
    { key: "present", value: summary.present, className: "text-emerald-400" },
    { key: "absent", value: summary.absent, className: "text-red-400" },
    { key: "leave", value: summary.leave, className: "text-amber-400" },
  ];

  return (
    <div className="flex items-center justify-center gap-1">
      {items.map((item) => (
        <span
          key={item.key}
          className={`
            min-w-[13px] rounded px-1 py-0.5 text-[7px] font-semibold leading-none
            ${item.className}
            ${item.value > 0 ? "bg-white/[0.04]" : "text-slate-700"}
          `}
        >
          {item.value}
        </span>
      ))}
    </div>
  );
}

function SummaryTooltipContent({ student, summary }) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold text-slate-200">
            {student?.full_name || "Student"}
          </p>

          <p className="truncate text-[9px] text-slate-600">
            {student?.roll_number || "—"} ·{" "}
            {student?.father_name || student?.guardian_name || "—"}
          </p>
        </div>

        {summary?.rate !== null && summary?.rate !== undefined && (
          <span className="shrink-0 rounded-md border border-white/[0.07] bg-white/[0.025] px-1.5 py-0.5 text-[8px] font-semibold text-slate-400">
            {summary.rate}%
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
        {[
          { label: "P", value: summary?.present ?? 0, className: "text-emerald-400" },
          { label: "A", value: summary?.absent ?? 0, className: "text-red-400" },
          { label: "L", value: summary?.leave ?? 0, className: "text-amber-400" },
          { label: "—", value: summary?.unmarked ?? 0, className: "text-slate-600" },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-md border border-white/[0.055] bg-white/[0.02] py-1"
          >
            <div className={`text-[11px] font-semibold ${item.className}`}>
              {item.value}
            </div>

            <div className="text-[7px] uppercase tracking-wide text-slate-600">
              {item.label}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-2 text-[9px] text-slate-600">
        {formatNumber(summary?.marked ?? 0)} of{" "}
        {formatNumber(summary?.total ?? 0)} school days marked
      </p>

      <div className="mt-2 border-t border-white/[0.06] pt-2">
        <p className="text-[8px] font-semibold uppercase tracking-wide text-slate-600">
          Leave reasons
        </p>

        {!summary?.leaveDays?.length ? (
          <p className="mt-1 text-[9px] text-slate-700">
            No leave recorded this month.
          </p>
        ) : (
          <ul className="mt-1 space-y-1">
            {summary.leaveDays.map((entry) => (
              <li key={entry.day} className="flex gap-2 text-[9px]">
                <span className="shrink-0 text-slate-600">
                  {getWeekdayLabel({ weekday: entry.weekday }) || "DAY"}{" "}
                  {formatNumber(entry.day)}
                </span>

                <span
                  className={
                    entry.remark ? "text-slate-400" : "text-slate-700 italic"
                  }
                >
                  {entry.remark || "No reason given"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export default function Attendance() {
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState("");
  const [solarYear, setSolarYear] = useState(null);
  const [solarMonth, setSolarMonth] = useState(null);
  const [today, setToday] = useState(null);

  const [sheet, setSheet] = useState(null);
  const [marks, setMarks] = useState({});

  /*
    Leave comments.

    Keyed by `${studentId}:${day}` exactly like changedCells, so a
    comment can be attached to a single day of a single student.
  */
  const [comments, setComments] = useState({});
  const [commentDialog, setCommentDialog] = useState(null);
  const [commentText, setCommentText] = useState("");
  const [summaryHover, setSummaryHover] = useState(null);
  const [summaryHoverVisible, setSummaryHoverVisible] = useState(false);

  /*
    A single click on a leave cell would cycle it back to present.

    To let a fast double click open the comment dialog instead, the
    cycle is deferred briefly. A second click inside that window
    cancels the pending cycle and opens the dialog.
  */
  const pendingCycleRef = useRef(null);
  const [changedCells, setChangedCells] = useState({});

  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingToday, setLoadingToday] = useState(true);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dirty, setDirty] = useState(false);

  const [locked, setLocked] = useState(true);
  const [password, setPassword] = useState("");
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const initialLoadDone = useRef(false);
  const requestIdRef = useRef(0);

  /*
    Hover timing.

    A short delay before showing keeps the panel from flickering as the
    pointer crosses the column, and a slightly longer delay before
    hiding lets it fade out cleanly instead of vanishing. Re-entering
    a row during either delay simply restarts the intent.
  */
  const summaryHoverTimer = useRef(null);

  const clearSummaryHoverTimer = useCallback(() => {
    if (summaryHoverTimer.current) {
      clearTimeout(summaryHoverTimer.current);
      summaryHoverTimer.current = null;
    }
  }, []);

  const openSummaryHover = useCallback(
    (studentId, student, event) => {
      if (locked || saving) return;

      clearSummaryHoverTimer();

      const cell = event?.currentTarget?.getBoundingClientRect?.();

      setSummaryHover({
        studentId,
        student,
        rect: cell
          ? {
              top: cell.top,
              left: cell.left,
              right: cell.right,
              height: cell.height,
            }
          : null,
      });

      summaryHoverTimer.current = setTimeout(() => {
        setSummaryHoverVisible(true);
        summaryHoverTimer.current = null;
      }, 90);
    },
    [clearSummaryHoverTimer, locked, saving],
  );

  const closeSummaryHover = useCallback(() => {
    clearSummaryHoverTimer();

    setSummaryHoverVisible(false);

    summaryHoverTimer.current = setTimeout(() => {
      setSummaryHover(null);
      summaryHoverTimer.current = null;
    }, 180);
  }, [clearSummaryHoverTimer]);

  useEffect(() => {
    return () => clearSummaryHoverTimer();
  }, [clearSummaryHoverTimer]);

  const currentUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("hm_user") || "null");
    } catch {
      return null;
    }
  }, []);

  const isAdmin = currentUser?.role === "admin";

  useEffect(() => {
    if (isAdmin) setLocked(false);
  }, [isAdmin]);

  const loadClasses = useCallback(async () => {
    setLoadingClasses(true);

    try {
      const response = await api.get("/attendance/classes");
      const data = Array.isArray(response.data) ? response.data : [];

      setClasses(data);

      setClassId((current) => {
        if (
          current &&
          data.some((item) => String(item.id) === String(current))
        ) {
          return current;
        }

        return data.length ? String(data[0].id) : "";
      });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoadingClasses(false);
    }
  }, []);

  const loadToday = useCallback(async () => {
    setLoadingToday(true);

    try {
      const response = await api.get("/attendance/today");
      const data = response.data || {};

      const year = Number(data.solar_year ?? data.year);
      const month = Number(data.solar_month ?? data.month);
      const day = Number(data.solar_day ?? data.day);

      const normalized = {
        ...data,
        year,
        month,
        day,
      };

      setToday(normalized);

      if (
        Number.isInteger(year) &&
        year >= 1300 &&
        Number.isInteger(month) &&
        month >= 1 &&
        month <= 12
      ) {
        setSolarYear(year);
        setSolarMonth(month);
      }
    } catch (err) {
      console.error("Failed to load attendance today:", err);
      setError(getErrorMessage(err));
    } finally {
      setLoadingToday(false);
    }
  }, []);

  useEffect(() => {
    if (initialLoadDone.current) return;

    initialLoadDone.current = true;

    loadClasses();
    loadToday();
  }, [loadClasses, loadToday]);

  const selectedClass = useMemo(
    () => classes.find((item) => String(item.id) === String(classId)),
    [classes, classId],
  );

  const validSolarMonth = useMemo(() => {
    const year = Number(solarYear);
    const month = Number(solarMonth);

    return (
      Number.isInteger(year) &&
      year >= 1300 &&
      Number.isInteger(month) &&
      month >= 1 &&
      month <= 12
    );
  }, [solarYear, solarMonth]);

  const initializeMarks = useCallback((students) => {
    const nextMarks = {};

    for (const student of students || []) {
      const studentId = Number(student.student_id);

      if (!Number.isInteger(studentId) || studentId <= 0) {
        continue;
      }

      nextMarks[studentId] = {};

      const attendance =
        student.attendance && typeof student.attendance === "object"
          ? student.attendance
          : {};

      for (const rawDay of Object.keys(attendance)) {
        const dayNumber = Number(rawDay);

        if (!Number.isInteger(dayNumber) || dayNumber <= 0) {
          continue;
        }

        const value = attendance[rawDay];

        nextMarks[studentId][dayNumber] =
          typeof value === "object" && value !== null
            ? (value.status ?? null)
            : (value ?? null);
      }
    }

    return nextMarks;
  }, []);

  const initializeComments = useCallback((students) => {
    const nextComments = {};

    for (const student of students || []) {
      const studentId = Number(student.student_id);

      if (!Number.isInteger(studentId) || studentId <= 0) {
        continue;
      }

      const attendance =
        student.attendance && typeof student.attendance === "object"
          ? student.attendance
          : {};

      for (const rawDay of Object.keys(attendance)) {
        const dayNumber = Number(rawDay);

        if (!Number.isInteger(dayNumber) || dayNumber <= 0) {
          continue;
        }

        const value = attendance[rawDay];

        const remark =
          value && typeof value === "object" ? value.remarks : null;

        if (remark !== null && remark !== undefined && String(remark).trim()) {
          nextComments[`${studentId}:${dayNumber}`] = String(remark);
        }
      }
    }

    return nextComments;
  }, []);

  const loadSheet = useCallback(
    async ({ preserveMessages = false } = {}) => {
      const numericClassId = Number(classId);
      const numericYear = Number(solarYear);
      const numericMonth = Number(solarMonth);

      if (
        !Number.isInteger(numericClassId) ||
        numericClassId <= 0 ||
        !Number.isInteger(numericYear) ||
        numericYear < 1300 ||
        !Number.isInteger(numericMonth) ||
        numericMonth < 1 ||
        numericMonth > 12
      ) {
        setSheet(null);
        setMarks({});
        setDirty(false);
        return false;
      }

      const currentRequestId = ++requestIdRef.current;

      setSheetLoading(true);

      if (!preserveMessages) {
        setError("");
        setSuccess("");
      }

      try {
        const response = await api.get(
          `/attendance/month/${numericClassId}/${numericYear}/${numericMonth}`,
        );

        if (currentRequestId !== requestIdRef.current) {
          return false;
        }

        const data = response.data || {};

        const normalizedDays = buildDisplayDays(data.days);

        const normalizedStudents = Array.isArray(data.students)
          ? data.students
          : [];

        setSheet({
          ...data,
          days: normalizedDays,
          students: normalizedStudents,
        });

        setMarks(initializeMarks(normalizedStudents));

        setComments(initializeComments(normalizedStudents));

        setChangedCells({});
        setDirty(false);

        return true;
      } catch (err) {
        if (currentRequestId !== requestIdRef.current) {
          return false;
        }

        setSheet(null);
        setMarks({});
        setChangedCells({});
        setDirty(false);
        setError(getErrorMessage(err));

        return false;
      } finally {
        if (currentRequestId === requestIdRef.current) {
          setSheetLoading(false);
        }
      }
    },
    [
      classId,
      solarYear,
      solarMonth,
      initializeMarks,
      initializeComments,
    ],
  );

  useEffect(() => {
    if (locked) return;
    if (loadingClasses || loadingToday) return;
    if (!classId) return;
    if (!validSolarMonth) return;

    loadSheet();
  }, [
    locked,
    loadingClasses,
    loadingToday,
    classId,
    validSolarMonth,
    loadSheet,
  ]);

  const applyCycle = useCallback((studentId, dayNumber) => {
    setMarks((previous) => {
      const current = previous[studentId]?.[dayNumber] ?? null;

      const next = getNextStatus(current);

      return {
        ...previous,
        [studentId]: {
          ...(previous[studentId] || {}),
          [dayNumber]: next,
        },
      };
    });

    setChangedCells((previous) => ({
      ...previous,
      [`${studentId}:${dayNumber}`]: true,
    }));

    setDirty(true);
  }, []);

  const cycleAttendance = useCallback(
    (studentId, dayNumber) => {
      if (locked || saving) return;

      setSuccess("");
      setError("");

      const status = marks[studentId]?.[dayNumber] ?? null;

      /*
        Only a leave cell needs the deferred behaviour. Every other
        status cycles immediately so the register stays as fast as
        before.
      */
      if (status !== STATUS.LEAVE) {
        applyCycle(studentId, dayNumber);
        return;
      }

      if (pendingCycleRef.current) {
        clearTimeout(pendingCycleRef.current.timer);
        pendingCycleRef.current = null;
      }

      pendingCycleRef.current = {
        studentId,
        dayNumber,
        timer: setTimeout(() => {
          applyCycle(studentId, dayNumber);
          pendingCycleRef.current = null;
        }, DOUBLE_CLICK_DELAY),
      };
    },
    [locked, saving, marks, applyCycle],
  );

  /*
    A fast double click on a leave cell cancels the pending cycle and
    asks why the student was absent instead.
  */
  const requestLeaveComment = useCallback(
    (studentId, dayNumber, event) => {
      if (locked || saving) return;

      if (pendingCycleRef.current) {
        clearTimeout(pendingCycleRef.current.timer);
        pendingCycleRef.current = null;
      }

      const key = `${studentId}:${dayNumber}`;

      /*
        Remember where the cell sits on screen so the dialog can open
        next to it instead of in the middle of the register.
      */
      const cell = event?.currentTarget?.getBoundingClientRect?.();

      setCommentDialog({
        studentId,
        day: dayNumber,
        key,
        rect: cell
          ? {
              top: cell.top,
              bottom: cell.bottom,
              left: cell.left,
              width: cell.width,
            }
          : null,
        studentName:
          sheet?.students?.find(
            (student) => Number(student.student_id) === Number(studentId),
          )?.full_name || "Student",
      });

      setCommentText(comments[key] || "");
    },
    [locked, saving, comments, sheet],
  );

  const saveLeaveComment = useCallback(() => {
    if (!commentDialog) return;

    const { studentId, dayNumber, key } = commentDialog;

    const trimmed = commentText.trim();

    setComments((previous) => {
      const next = { ...previous };

      if (!trimmed) {
        delete next[key];
      } else {
        next[key] = trimmed;
      }

      return next;
    });

    setChangedCells((previous) => ({
      ...previous,
      [key]: true,
    }));

    setDirty(true);

    setCommentDialog(null);
    setCommentText("");
  }, [commentDialog, commentText]);

  const removeLeaveComment = useCallback(() => {
    if (!commentDialog) return;

    setCommentText("");
    saveLeaveComment();
  }, [commentDialog, saveLeaveComment]);

  const cancelLeaveComment = useCallback(() => {
    setCommentDialog(null);
    setCommentText("");
  }, []);

  /*
    Monthly totals per student.

    Counted from the live marks so the summary reacts to clicks
    immediately, before the register is saved. Friday is a holiday
    and never counts towards anything.
  */
  const summaryByStudent = useMemo(() => {
    const result = new Map();

    const days = Array.isArray(sheet?.days) ? sheet.days : [];

    const openDays = days
      .map(normalizeDay)
      .filter((day) => !day.is_friday && !isFridayDay(day));

    for (const student of sheet?.students || []) {
      const studentId = Number(student.student_id);

      if (!Number.isInteger(studentId) || studentId <= 0) continue;

      let present = 0;
      let absent = 0;
      let leave = 0;
      let unmarked = 0;

      const leaveDays = [];

      for (const day of openDays) {
        const status = marks[studentId]?.[day.day] ?? null;

        if (status === STATUS.PRESENT) {
          present += 1;
        } else if (status === STATUS.ABSENT) {
          absent += 1;
        } else if (status === STATUS.LEAVE) {
          leave += 1;

          const remark = comments[`${studentId}:${day.day}`];

          leaveDays.push({
            day: day.day,
            weekday: day.weekday,
            remark: remark ? String(remark) : null,
          });
        } else {
          unmarked += 1;
        }
      }

      result.set(studentId, {
        present,
        absent,
        leave,
        unmarked,
        marked: present + absent + leave,
        total: openDays.length,
        rate:
          present + absent + leave > 0
            ? Math.round((present / (present + absent + leave)) * 100)
            : null,
        leaveDays,
      });
    }

    return result;
  }, [sheet, marks, comments]);

  const saveAttendance = useCallback(async () => {
    if (locked) {
      setError("Attendance is locked. Verify your password before saving.");
      return;
    }

    const numericClassId = Number(classId);
    const numericYear = Number(solarYear);
    const numericMonth = Number(solarMonth);

    if (!Number.isInteger(numericClassId) || numericClassId <= 0) {
      setError("Please select a class first.");
      return;
    }

    if (
      !Number.isInteger(numericYear) ||
      numericYear < 1300 ||
      !Number.isInteger(numericMonth) ||
      numericMonth < 1 ||
      numericMonth > 12
    ) {
      setError("Please wait for a valid Solar Hijri month to load.");
      return;
    }

    if (!sheet) {
      setError("The attendance register is not loaded yet.");
      return;
    }

    const days = Array.isArray(sheet.days) ? sheet.days : [];

    const students = Array.isArray(sheet.students) ? sheet.students : [];

    if (!days.length) {
      setError("No valid attendance days were returned by the backend.");
      return;
    }

    if (!students.length) {
      setError("No students were returned for this class.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const records = [];

      for (const key of Object.keys(changedCells)) {
        const separatorIndex = key.indexOf(":");

        if (separatorIndex <= 0) continue;

        const studentId = Number(key.slice(0, separatorIndex));

        const dayNumber = Number(key.slice(separatorIndex + 1));

        if (!Number.isInteger(studentId) || studentId <= 0) {
          continue;
        }

        if (!Number.isInteger(dayNumber) || dayNumber <= 0) {
          continue;
        }

        records.push({
          student_id: studentId,
          day: dayNumber,
          status: marks[studentId]?.[dayNumber] ?? null,
          remarks: comments[`${studentId}:${dayNumber}`] ?? null,
        });
      }

      if (!records.length) {
        throw new Error("There are no attendance records to save.");
      }

      await api.post("/attendance/month", {
        class_slot_id: numericClassId,
        year: numericYear,
        month: numericMonth,
        records,
      });

      const refreshed = await loadSheet({
        preserveMessages: true,
      });

      setDirty(false);

      if (refreshed) {
        setSuccess("Attendance register saved successfully.");
      } else {
        setSuccess(
          "Attendance was saved successfully, but the register could not be refreshed.",
        );
      }
    } catch (err) {
      console.error("Attendance save failed:", err);
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [
    locked,
    classId,
    solarYear,
    solarMonth,
    sheet,
    marks,
    changedCells,
    loadSheet,
  ]);

  const verifyPassword = async (event) => {
    event.preventDefault();

    if (!password.trim()) {
      setPasswordError("Please enter your password.");
      return;
    }

    setVerifyingPassword(true);
    setPasswordError("");

    try {
      await api.post("/auth/verify-password", {
        password,
      });

      setLocked(false);
      setPassword("");
      setPasswordError("");
    } catch (err) {
      setPasswordError(getErrorMessage(err));
    } finally {
      setVerifyingPassword(false);
    }
  };

  const confirmMonthChange = useCallback(() => {
    if (!dirty) return true;

    return window.confirm(
      "You have unsaved attendance changes. Change the month without saving?",
    );
  }, [dirty]);

  const goToPreviousMonth = () => {
    if (!validSolarMonth) return;
    if (!confirmMonthChange()) return;

    let year = Number(solarYear);
    let month = Number(solarMonth) - 1;

    if (month < 1) {
      month = 12;
      year -= 1;
    }

    setSuccess("");
    setError("");
    setSolarYear(year);
    setSolarMonth(month);
  };

  const goToNextMonth = () => {
    if (!validSolarMonth) return;
    if (!confirmMonthChange()) return;

    let year = Number(solarYear);
    let month = Number(solarMonth) + 1;

    if (month > 12) {
      month = 1;
      year += 1;
    }

    setSuccess("");
    setError("");
    setSolarYear(year);
    setSolarMonth(month);
  };

  const goToToday = () => {
    if (!confirmMonthChange()) return;
    if (!today?.year || !today?.month) return;

    setSuccess("");
    setError("");
    setSolarYear(Number(today.year));
    setSolarMonth(Number(today.month));
  };

  const summary = useMemo(() => {
    let present = 0;
    let absent = 0;
    let leave = 0;
    let marked = 0;

    for (const student of sheet?.students || []) {
      const studentId = Number(student.student_id);

      for (const rawDay of sheet?.days || []) {
        const day = normalizeDay(rawDay);

        if (isFridayDay(day) || day.is_friday) continue;

        const dayNumber = Number(day.day);

        const status = marks[studentId]?.[dayNumber] ?? null;

        if (status === STATUS.PRESENT) {
          present += 1;
          marked += 1;
        } else if (status === STATUS.ABSENT) {
          absent += 1;
          marked += 1;
        } else if (status === STATUS.LEAVE) {
          leave += 1;
          marked += 1;
        }
      }
    }

    return {
      present,
      absent,
      leave,
      marked,
    };
  }, [sheet, marks]);

  const monthName =
    SOLAR_MONTH_NAMES[Number(solarMonth)] ||
    sheet?.solar_month_name ||
    "Solar Hijri Month";

  const calendarDays = sheet?.days || [];

  const totalDays = calendarDays.filter((day) => {
    const normalized = normalizeDay(day);

    return !isFridayDay(normalized) && !normalized.is_friday;
  }).length;

  const totalStudents = sheet?.students?.length || 0;

  const totalCells = totalDays * totalStudents;

  const markedPercentage =
    totalCells > 0 ? Math.round((summary.marked / totalCells) * 100) : 0;

  const selectedClassLabel = useMemo(() => {
    if (!selectedClass) return "Select a class";

    const subject = selectedClass.subject_name || selectedClass.name || "Class";

    const teacher =
      selectedClass.teacher_name || selectedClass.teacher_full_name || "";

    const start = selectedClass.start_time || selectedClass.start || "";

    const end = selectedClass.end_time || selectedClass.end || "";

    const time = start && end ? `${start} - ${end}` : "";

    return [subject, teacher, time].filter(Boolean).join(" • ");
  }, [selectedClass]);

  if (locked && !isAdmin) {
    return (
      <div className="min-h-screen bg-[#0b0d10] px-4 text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-md items-center justify-center">
          <div className="w-full rounded-xl border border-white/10 bg-[#111419]">
            <div className="border-b border-white/10 px-6 py-5">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-[#f2bd19]/20 bg-[#f2bd19]/10 text-[#f2bd19]">
                <Lock size={19} />
              </div>

              <h1 className="text-lg font-semibold text-white">
                Attendance Verification
              </h1>

              <p className="mt-1 text-sm text-slate-500">
                Enter your password to access the attendance register.
              </p>
            </div>

            <form onSubmit={verifyPassword} className="space-y-4 p-6">
              <div>
                <label className="mb-2 block text-xs font-medium text-slate-400">
                  Password
                </label>

                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoFocus
                  className="
                    h-11 w-full rounded-lg
                    border border-white/10
                    bg-[#0b0d10]
                    px-3
                    text-sm text-slate-100
                    outline-none
                    placeholder:text-slate-600
                    focus:border-[#f2bd19]/40
                  "
                  placeholder="Enter your password"
                />
              </div>

              {passwordError && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
                  {passwordError}
                </div>
              )}

              <button
                type="submit"
                disabled={verifyingPassword}
                className="
                  flex h-11 w-full items-center justify-center gap-2
                  rounded-lg bg-[#f2bd19]
                  px-4 text-sm font-semibold text-black
                  transition hover:bg-[#ffd34f]
                  disabled:cursor-not-allowed disabled:opacity-50
                "
              >
                {verifyingPassword ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <ShieldCheck size={16} />
                    Unlock Attendance
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0d10] text-slate-100">
      <div className="mx-auto max-w-[1800px] p-4 md:p-6">
        {/* HEADER */}
        <header className="mb-5 flex flex-col gap-4 border-b border-white/10 pb-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#f2bd19]/20 bg-[#f2bd19]/10 text-[#f2bd19]">
                <CalendarDays size={19} />
              </div>

              <div>
                <h1 className="text-xl font-semibold tracking-tight text-white">
                  Attendance
                </h1>

                <p className="text-xs text-slate-500">
                  Monthly Solar Hijri attendance register
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-slate-400">
                {monthName} {validSolarMonth ? formatNumber(solarYear) : ""}
              </span>

              <span className="text-slate-700">·</span>

              <span
                className={
                  dirty ? "text-xs text-amber-400" : "text-xs text-emerald-400"
                }
              >
                {dirty ? "Unsaved changes" : "Saved"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={goToPreviousMonth}
              disabled={sheetLoading || saving || !validSolarMonth}
              className="
                flex h-9 items-center gap-1.5 rounded-lg
                border border-white/10 bg-[#111419]
                px-3 text-xs font-medium text-slate-400
                transition hover:border-white/20 hover:text-slate-200
                disabled:cursor-not-allowed disabled:opacity-40
              "
            >
              <ChevronLeft size={15} />
              Previous
            </button>

            <button
              type="button"
              onClick={goToToday}
              disabled={sheetLoading || saving || !today?.year || !today?.month}
              className="
                flex h-9 items-center gap-1.5 rounded-lg
                border border-white/10 bg-[#111419]
                px-3 text-xs font-medium text-slate-400
                transition hover:border-white/20 hover:text-slate-200
                disabled:cursor-not-allowed disabled:opacity-40
              "
            >
              <CalendarDays size={14} />
              Today
            </button>

            <button
              type="button"
              onClick={goToNextMonth}
              disabled={sheetLoading || saving || !validSolarMonth}
              className="
                flex h-9 items-center gap-1.5 rounded-lg
                border border-white/10 bg-[#111419]
                px-3 text-xs font-medium text-slate-400
                transition hover:border-white/20 hover:text-slate-200
                disabled:cursor-not-allowed disabled:opacity-40
              "
            >
              Next
              <ChevronRight size={15} />
            </button>

            <button
              type="button"
              onClick={saveAttendance}
              disabled={saving || sheetLoading || !sheet || !dirty}
              className="
                flex h-9 items-center gap-1.5 rounded-lg
                bg-[#f2bd19]
                px-4 text-xs font-semibold text-black
                transition hover:bg-[#ffd34f]
                disabled:cursor-not-allowed disabled:opacity-40
              "
            >
              {saving ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Saving
                </>
              ) : dirty ? (
                <>
                  <Save size={15} />
                  Save
                </>
              ) : (
                <>
                  <Check size={15} />
                  Saved
                </>
              )}
            </button>
          </div>
        </header>

        {/* MESSAGES */}
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
            <X size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Attendance error</p>
              <p className="mt-0.5 text-xs text-red-400/80">{error}</p>
            </div>
          </div>
        )}

        {success && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-400">
            <Check size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Attendance saved</p>
              <p className="mt-0.5 text-xs text-emerald-400/80">{success}</p>
            </div>
          </div>
        )}

        {/* CONTROLS */}
        <section className="mb-4 rounded-lg border border-white/10 bg-[#111419] p-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_auto_auto] lg:items-end">
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-slate-500">
                Class / Time Slot
              </label>

              <select
                value={classId}
                onChange={(event) => {
                  if (dirty) {
                    const confirmed = window.confirm(
                      "You have unsaved attendance changes. Change the class without saving?",
                    );

                    if (!confirmed) return;
                  }

                  requestIdRef.current += 1;
                  setSuccess("");
                  setError("");
                  setSheet(null);
                  setMarks({});
                  setDirty(false);
                  setClassId(event.target.value);
                }}
                disabled={
                  loadingClasses || loadingToday || sheetLoading || saving
                }
                className="
                  h-10 w-full rounded-lg
                  border border-white/10
                  bg-[#0b0d10]
                  px-3 text-sm text-slate-200
                  outline-none
                  focus:border-[#f2bd19]/40
                  disabled:cursor-not-allowed disabled:opacity-40
                "
              >
                <option value="">
                  {loadingClasses ? "Loading classes..." : "Select a class"}
                </option>

                {classes.map((item) => {
                  const subject =
                    item.subject_name || item.name || `Class ${item.id}`;

                  const teacher =
                    item.teacher_name || item.teacher_full_name || "";

                  const start = item.start_time || item.start || "";

                  const end = item.end_time || item.end || "";

                  const time = start && end ? `${start} - ${end}` : "";

                  const label = [subject, teacher, time]
                    .filter(Boolean)
                    .join(" • ");

                  return (
                    <option key={item.id} value={item.id}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-[#0b0d10] px-3 text-xs text-slate-400">
              <CalendarDays size={15} className="text-[#f2bd19]" />

              {validSolarMonth
                ? `${monthName} ${formatNumber(solarYear)}`
                : loadingToday
                  ? "Loading date..."
                  : "Solar Hijri Month"}
            </div>

            <button
              type="button"
              onClick={() => loadSheet()}
              disabled={sheetLoading || saving || !classId || !validSolarMonth}
              className="
                flex h-10 items-center justify-center gap-1.5
                rounded-lg border border-white/10
                bg-[#0b0d10] px-3
                text-xs font-medium text-slate-400
                transition hover:border-white/20 hover:text-slate-200
                disabled:cursor-not-allowed disabled:opacity-40
              "
            >
              <RefreshCw
                size={14}
                className={sheetLoading ? "animate-spin" : ""}
              />
              Refresh
            </button>
          </div>
        </section>

        {/* CLASS INFORMATION */}
        {sheet && (
          <section className="mb-4 grid gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 sm:grid-cols-2 xl:grid-cols-4">
            <div className="bg-[#111419] px-4 py-3">
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-600">
                Subject
              </span>

              <p className="mt-1 truncate text-sm font-medium text-slate-200">
                {sheet.class_slot?.subject_name ||
                  sheet.subject_name ||
                  selectedClass?.subject_name ||
                  "—"}
              </p>
            </div>

            <div className="bg-[#111419] px-4 py-3">
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-600">
                Book / Level
              </span>

              <p className="mt-1 truncate text-sm font-medium text-slate-200">
                {sheet.book_name ||
                  sheet.level_name ||
                  sheet.book ||
                  sheet.class_slot?.books
                    ?.map((book) => book.name)
                    .join(", ") ||
                  selectedClass?.book_name ||
                  selectedClass?.level_name ||
                  selectedClass?.books?.map((book) => book.name).join(", ") ||
                  "—"}
              </p>
            </div>

            <div className="bg-[#111419] px-4 py-3">
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-600">
                Teacher
              </span>

              <p className="mt-1 truncate text-sm font-medium text-slate-200">
                {sheet.class_slot?.teacher_name ||
                  sheet.teacher_name ||
                  selectedClass?.teacher_name ||
                  selectedClass?.teacher_full_name ||
                  "—"}
              </p>
            </div>

            <div className="bg-[#111419] px-4 py-3">
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-600">
                Time
              </span>

              <p className="mt-1 truncate text-sm font-medium text-slate-200">
                {sheet.class_slot?.start_time && sheet.class_slot?.end_time
                  ? `${sheet.class_slot.start_time} - ${sheet.class_slot.end_time}`
                  : sheet.start_time && sheet.end_time
                    ? `${sheet.start_time} - ${sheet.end_time}`
                    : selectedClass?.start_time && selectedClass?.end_time
                      ? `${selectedClass.start_time} - ${selectedClass.end_time}`
                      : "—"}
              </p>
            </div>
          </section>
        )}

        {/* SUMMARY */}
        {sheet && (
          <section className="mb-4 grid gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 sm:grid-cols-2 xl:grid-cols-6">
            <div className="bg-[#111419] px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-600">
                Students
              </p>
              <p className="mt-1 text-xl font-semibold text-slate-200">
                {formatNumber(totalStudents)}
              </p>
            </div>

            <div className="bg-[#111419] px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-600">
                Present
              </p>
              <p className="mt-1 text-xl font-semibold text-emerald-400">
                {formatNumber(summary.present)}
              </p>
            </div>

            <div className="bg-[#111419] px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-600">
                Absent
              </p>
              <p className="mt-1 text-xl font-semibold text-red-400">
                {formatNumber(summary.absent)}
              </p>
            </div>

            <div className="bg-[#111419] px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-600">
                Leave
              </p>
              <p className="mt-1 text-xl font-semibold text-amber-400">
                {formatNumber(summary.leave)}
              </p>
            </div>

            <div className="bg-[#111419] px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-600">
                Marked
              </p>
              <p className="mt-1 text-xl font-semibold text-[#f2bd19]">
                {formatNumber(summary.marked)}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-600">
                {formatNumber(markedPercentage)}%
              </p>
            </div>

            <div className="bg-[#111419] px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-600">
                Days
              </p>
              <p className="mt-1 text-xl font-semibold text-slate-200">
                {formatNumber(totalDays)}
              </p>
            </div>
          </section>
        )}

        {/* LEGEND */}
        {sheet && (
          <div className="mb-3 flex flex-wrap items-center gap-4 rounded-lg border border-white/10 bg-[#111419] px-3 py-2.5">
            <span className="text-[11px] font-medium text-slate-500">
              Attendance
            </span>

            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="flex h-6 w-6 items-center justify-center rounded-md border border-emerald-500/25 bg-emerald-500/10 text-emerald-400">
                <Check size={12} />
              </span>
              Present
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="flex h-6 w-6 items-center justify-center rounded-md border border-red-500/25 bg-red-500/10 text-red-400">
                <X size={12} />
              </span>
              Absent
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="flex h-6 w-6 items-center justify-center rounded-md border border-amber-500/25 bg-amber-500/10 text-amber-400">
                <CalendarOff size={12} />
              </span>
              Leave
            </div>

            <span className="text-slate-700">·</span>

            <span className="text-[11px] text-slate-500">
              Click cycles Present → Absent → Leave → Present
            </span>

            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-white/[0.025] text-slate-600">
                •
              </span>
              Not marked
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
              <span className="flex h-6 w-6 items-center justify-center rounded-md border border-white/5 bg-white/[0.015]">
                —
              </span>
              Friday
            </div>

            <div className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-[#f2bd19]" />
              Today
            </div>
          </div>
        )}

        {/* LOADING */}
        {(loadingToday || loadingClasses || sheetLoading) && (
          <div className="flex min-h-[280px] items-center justify-center rounded-lg border border-white/10 bg-[#111419]">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 size={18} className="animate-spin text-[#f2bd19]" />

              {loadingToday
                ? "Loading current Solar Hijri date..."
                : loadingClasses
                  ? "Loading classes..."
                  : "Loading attendance register..."}
            </div>
          </div>
        )}

        {/* EMPTY REGISTER */}
        {!loadingToday && !loadingClasses && !sheetLoading && !sheet && (
          <div className="flex min-h-[280px] items-center justify-center rounded-lg border border-white/10 bg-[#111419]">
            <div className="px-6 text-center">
              <CalendarDays size={24} className="mx-auto text-slate-700" />

              <h2 className="mt-3 text-sm font-semibold text-slate-300">
                No attendance register loaded
              </h2>

              <p className="mt-1.5 text-xs text-slate-600">
                Select a class and Solar Hijri month to load the register.
              </p>
            </div>
          </div>
        )}

        {/* REGISTER */}
        {!loadingToday &&
          !loadingClasses &&
          !sheetLoading &&
          sheet &&
          Array.isArray(sheet.students) &&
          sheet.students.length > 0 &&
          Array.isArray(sheet.days) &&
          sheet.days.length > 0 && (
            <section className="overflow-hidden rounded-lg border border-white/10 bg-[#111419]">
              <div className="flex flex-col gap-2 border-b border-white/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-slate-200">
                    Attendance Register
                  </h2>

                  <p className="mt-0.5 truncate text-[11px] text-slate-600">
                    {selectedClassLabel}
                  </p>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-slate-600">
                  <span>{formatNumber(totalStudents)} students</span>

                  <span>·</span>

                  <span>{formatNumber(totalDays)} days</span>
                </div>
              </div>

              <div className="w-full overflow-x-auto">
                <table className="w-full min-w-[850px] table-fixed border-collapse text-[10px]">
                  <colgroup>
                    <col style={{ width: "6%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "8%" }} />
                    <col style={{ width: "11%" }} />

                    {calendarDays.map((rawDay) => (
                      <col
                        key={`col-${normalizeDay(rawDay).day}`}
                        style={{
                          width: `${61 / Math.max(calendarDays.length, 1)}%`,
                        }}
                      />
                    ))}
                  </colgroup>

                  <thead>
                    <tr>
                      <th className="sticky left-0 z-20 border-b border-r border-white/10 bg-[#0e1115] px-1 py-2 text-center text-[8px] font-semibold uppercase tracking-wider text-slate-600">
                        ID
                      </th>

                      <th className="sticky left-[6%] z-20 border-b border-r border-white/10 bg-[#0e1115] px-2 py-2 text-left text-[8px] font-semibold uppercase tracking-wider text-slate-600">
                        Student
                      </th>

                      <th className="sticky left-[20%] z-20 border-b border-r border-white/10 bg-[#0e1115] px-1 py-2 text-center text-[8px] font-semibold uppercase tracking-wider text-slate-600">
                        Pay
                      </th>

                      <th className="sticky left-[28%] z-20 border-b border-r border-white/10 bg-[#0e1115] px-1 py-2 text-center text-[8px] font-semibold uppercase tracking-wider text-slate-600">
                        Summary
                      </th>

                      {calendarDays.map((rawDay) => {
                        const day = normalizeDay(rawDay);

                        const isFriday =
                          Boolean(day.is_friday) || isFridayDay(day);

                        const isToday =
                          !isFriday &&
                          (Boolean(day.is_today) ||
                            (today &&
                              Number(today.year) === Number(solarYear) &&
                              Number(today.month) === Number(solarMonth) &&
                              Number(today.day) === Number(day.day)));

                        return (
                          <th
                            key={`day-${day.day}`}
                            className={`
                              border-b border-r px-0 py-1 text-center
                              ${
                                isFriday
                                  ? "border-white/[0.04] bg-[#0b0d10]"
                                  : isToday
                                    ? "border-[#f2bd19]/20 bg-[#f2bd19]/[0.05]"
                                    : "border-white/[0.06] bg-[#0e1115]"
                              }
                            `}
                          >
                            <div
                              className={`
                                text-[6px] font-semibold uppercase
                                ${
                                  isFriday
                                    ? "text-slate-700"
                                    : isToday
                                      ? "text-[#f2bd19]"
                                      : "text-slate-600"
                                }
                              `}
                            >
                              {isFriday ? "FRI" : getWeekdayLabel(day) || "DAY"}
                            </div>

                            <div
                              className={`
                                mx-auto mt-1 flex h-5 w-5
                                items-center justify-center rounded
                                text-[8px] font-semibold
                                ${
                                  isFriday
                                    ? "border border-white/5 bg-white/[0.015] text-slate-700"
                                    : isToday
                                      ? "border border-[#f2bd19]/30 bg-[#f2bd19]/10 text-[#f2bd19]"
                                      : "text-slate-400"
                                }
                              `}
                            >
                              {formatNumber(day.day)}
                            </div>

                            {isToday && (
                              <div className="mt-0.5 text-[5px] font-semibold uppercase text-[#f2bd19]/80">
                                Today
                              </div>
                            )}

                            {isFriday && (
                              <div className="mt-0.5 text-[5px] font-semibold uppercase text-slate-700">
                                Off
                              </div>
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>

                  <tbody>
                    {sheet.students.map((student, index) => {
                      const studentId = Number(student.student_id);

                      const payment = getPaymentData(student);

                      const summary = summaryByStudent.get(studentId);

                      return (
                        <tr
                          key={studentId || student.id || index}
                          className="group border-b border-white/[0.055] last:border-b-0"
                        >
                          <td className="sticky left-0 z-10 border-r border-white/[0.055] bg-[#111419] px-1 py-2 text-center text-[9px] font-medium text-slate-500 group-hover:bg-[#15191e]">
                            {studentId || "—"}
                          </td>

                          <td className="sticky left-[6%] z-10 border-r border-white/[0.055] bg-[#111419] px-2 py-1.5 group-hover:bg-[#15191e]">
                            <div className="min-w-0">
                              <div className="truncate text-[10px] font-medium leading-tight text-slate-300">
                                {student.full_name ||
                                  student.student_name ||
                                  "—"}
                              </div>

                              <div className="mt-0.5 truncate text-[8px] text-slate-600">
                                {student.father_name ||
                                  student.guardian_name ||
                                  student.father ||
                                  "—"}
                              </div>
                            </div>
                          </td>

                          <td className="sticky left-[20%] z-10 border-r border-white/[0.055] bg-[#111419] px-1 py-1.5 text-center group-hover:bg-[#15191e]">
                            <span
                              title={
                                payment.amount
                                  ? `${payment.label} · ${payment.amount}`
                                  : payment.label
                              }
                              className={`
                                  inline-flex max-w-full items-center
                                  justify-center rounded border px-1.5
                                  py-0.5 text-[6px] font-semibold
                                  ${payment.className}
                                `}
                            >
                              <span className="truncate">{payment.label}</span>
                            </span>{payment.amount && (
                              <div className="mt-0.5 truncate text-[6px] text-amber-400/70" title={payment.amount}>
                                {payment.amount}
                              </div>
                            )}
                          </td>

                          <td
                            className="sticky left-[28%] z-10 border-r border-white/[0.055] bg-[#111419] px-1 py-1.5 text-center group-hover:bg-[#15191e]"
                            onMouseEnter={(event) =>
                              openSummaryHover(studentId, student, event)
                            }
                            onMouseLeave={closeSummaryHover}
                          >
                            <SummaryCell summary={summaryByStudent.get(studentId)} />
                          </td>

                          {calendarDays.map((rawDay) => {
                            const day = normalizeDay(rawDay);

                            const isFriday =
                              Boolean(day.is_friday) || isFridayDay(day);

                            const status = marks[studentId]?.[day.day] ?? null;

                            const isToday =
                              !isFriday &&
                              (Boolean(day.is_today) ||
                                (today &&
                                  Number(today.year) === Number(solarYear) &&
                                  Number(today.month) === Number(solarMonth) &&
                                  Number(today.day) === Number(day.day)));

                            return (
                              <td
                                key={`${studentId}-${day.day}`}
                                className={`
                                    border-r px-0 py-1 text-center
                                    ${
                                      isFriday
                                        ? "border-white/[0.035] bg-white/[0.005]"
                                        : isToday
                                          ? "border-white/[0.055] bg-[#f2bd19]/[0.02]"
                                          : "border-white/[0.055]"
                                    }
                                  `}
                              >
                                {isFriday ? (
                                  <div
                                    className="mx-auto flex h-7 w-7 items-center justify-center rounded border border-white/[0.04] text-[8px] text-slate-700"
                                    title="Friday — holiday"
                                  >
                                    —
                                  </div>
                                ) : (
                                  <div className="flex justify-center">
                                    <AttendanceStatusButton
                                      status={status}
                                      disabled={locked || saving}
                                      hasComment={Boolean(
                                        comments[`${studentId}:${day.day}`],
                                      )}
                                      onClick={() =>
                                        cycleAttendance(studentId, day.day)
                                      }
                                      onDoubleClick={(event) =>
                                        requestLeaveComment(
                                          studentId,
                                          day.day,
                                          event,
                                        )
                                      }
                                    />
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-1.5 border-t border-white/10 px-4 py-2.5 text-[10px] text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  {monthName} {validSolarMonth ? formatNumber(solarYear) : ""}
                </span>

                <div className="flex flex-wrap items-center gap-2">
                  {today?.year && today?.month && today?.day && (
                    <span>
                      Today: {formatNumber(today.year)}/
                      {formatNumber(today.month)}/{formatNumber(today.day)}
                    </span>
                  )}

                  <span>·</span>

                  <span>
                    {dirty ? "Changes not saved" : "All changes saved"}
                  </span>
                </div>
              </div>
            </section>
          )}

        {/* EMPTY STUDENTS */}
        {!loadingToday &&
          !loadingClasses &&
          !sheetLoading &&
          sheet &&
          (!sheet.students || sheet.students.length === 0) && (
            <div className="rounded-lg border border-white/10 bg-[#111419] p-10 text-center">
              <Users size={26} className="mx-auto text-slate-700" />

              <h2 className="mt-3 text-sm font-semibold text-slate-300">
                No students in this class
              </h2>

              <p className="mt-1.5 text-xs text-slate-600">
                The backend returned no active enrollments for this class.
              </p>
            </div>
          )}

        {/* EMPTY DAYS */}
        {!loadingToday &&
          !loadingClasses &&
          !sheetLoading &&
          sheet &&
          sheet.students?.length > 0 &&
          (!sheet.days || sheet.days.length === 0) && (
            <div className="rounded-lg border border-white/10 bg-[#111419] p-10 text-center">
              <CalendarDays size={26} className="mx-auto text-slate-700" />

              <h2 className="mt-3 text-sm font-semibold text-slate-300">
                No attendance days
              </h2>

              <p className="mt-1.5 text-xs text-slate-600">
                The backend did not return any valid attendance days for this
                month.
              </p>
            </div>
          )}
      </div>

      {summaryHover && (
        <SummaryTooltip
          hover={{
            ...summaryHover,
            summary: summaryByStudent.get(Number(summaryHover.studentId)),
          }}
          visible={summaryHoverVisible}
        >
          <SummaryTooltipContent
            student={summaryHover.student}
            summary={summaryByStudent.get(Number(summaryHover.studentId))}
          />
        </SummaryTooltip>
      )}

      <LeaveCommentDialog
        dialog={commentDialog}
        text={commentText}
        onChange={setCommentText}
        onSave={saveLeaveComment}
        onRemove={removeLeaveComment}
        onCancel={cancelLeaveComment}
        disabled={locked || saving}
      />
    </div>
  );
}
