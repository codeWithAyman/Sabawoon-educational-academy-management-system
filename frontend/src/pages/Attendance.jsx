import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  CalendarDays,
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
};

function formatNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return String(value ?? "");
  }

  return number.toLocaleString("en-US");
}

function getErrorMessage(error) {
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }

  if (error?.response?.data?.error) {
    return error.response.data.error;
  }

  if (error?.message) {
    return error.message;
  }

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
  if (!value) return "";
  return value.slice(0, 3).toUpperCase();
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

  if (normalized.length === 0) return [];

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
      className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    };
  }

  if (value.includes("partial")) {
    return {
      label:
        Number.isFinite(dueAmount) && dueAmount > 0
          ? `AFN ${formatNumber(dueAmount)} due`
          : "Due",
      amount: null,
      className: "border-amber-400/20 bg-amber-400/10 text-amber-300",
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
          : "Unpaid",
      amount: null,
      className: "border-red-400/20 bg-red-400/10 text-red-300",
    };
  }

  if (value.includes("no_fee") || value.includes("no fee")) {
    return {
      label: "No Fee",
      amount: null,
      className: "border-white/10 bg-white/[0.04] text-slate-400",
    };
  }

  return {
    label: rawStatus ? String(rawStatus) : "No Fee",
    amount: null,
    className: "border-white/10 bg-white/[0.04] text-slate-400",
  };
}

function AttendanceStatusButton({ status, onClick, disabled }) {
  if (status === STATUS.PRESENT) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title="Present — click to change"
        className="
          flex h-6 w-6 items-center justify-center rounded-md
          border border-emerald-400/30
          bg-emerald-400/10
          text-emerald-300
          transition
          hover:border-emerald-300/50
          hover:bg-emerald-400/20
          disabled:cursor-not-allowed
          disabled:opacity-50
        "
      >
        <Check size={12} strokeWidth={2.5} />
      </button>
    );
  }

  if (status === STATUS.ABSENT) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title="Absent — click to clear"
        className="
          flex h-6 w-6 items-center justify-center rounded-md
          border border-red-400/30
          bg-red-400/10
          text-red-300
          transition
          hover:border-red-300/50
          hover:bg-red-400/20
          disabled:cursor-not-allowed
          disabled:opacity-50
        "
      >
        <X size={12} strokeWidth={2.5} />
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
        flex h-6 w-6 items-center justify-center rounded-md
        border border-white/10
        bg-white/[0.025]
        text-slate-600
        transition
        hover:border-white/20
        hover:bg-white/[0.07]
        hover:text-slate-300
        disabled:cursor-not-allowed
        disabled:opacity-50
      "
    >
      <span className="text-[11px]">•</span>
    </button>
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

  const currentUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("hm_user") || "null");
    } catch {
      return null;
    }
  }, []);

  const isAdmin = currentUser?.role === "admin";

  useEffect(() => {
    if (isAdmin) {
      setLocked(false);
    }
  }, [isAdmin]);

  /*
   * ------------------------------------------------------------
   * LOAD CLASSES
   * ------------------------------------------------------------
   */

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

        return data.length > 0 ? String(data[0].id) : "";
      });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoadingClasses(false);
    }
  }, []);

  /*
   * ------------------------------------------------------------
   * LOAD KABUL TODAY
   * ------------------------------------------------------------
   *
   * This MUST finish before a monthly register request can happen.
   */

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
    if (initialLoadDone.current) {
      return;
    }

    initialLoadDone.current = true;

    loadClasses();
    loadToday();
  }, [loadClasses, loadToday]);

  /*
   * ------------------------------------------------------------
   * SELECTED CLASS
   * ------------------------------------------------------------
   */

  const selectedClass = useMemo(() => {
    return classes.find((item) => String(item.id) === String(classId));
  }, [classes, classId]);

  /*
   * ------------------------------------------------------------
   * VALID MONTH CHECK
   * ------------------------------------------------------------
   */

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

  /*
   * ------------------------------------------------------------
   * INITIALIZE MARKS FROM BACKEND
   * ------------------------------------------------------------
   */

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

        if (typeof value === "object" && value !== null) {
          nextMarks[studentId][dayNumber] = value.status ?? null;
        } else {
          nextMarks[studentId][dayNumber] = value ?? null;
        }
      }
    }

    return nextMarks;
  }, []);

  /*
   * ------------------------------------------------------------
   * LOAD MONTHLY REGISTER
   * ------------------------------------------------------------
   */

  const loadSheet = useCallback(
    async ({ preserveMessages = false } = {}) => {
      const numericClassId = Number(classId);
      const numericYear = Number(solarYear);
      const numericMonth = Number(solarMonth);

      /*
       * HARD GUARD:
       *
       * Nothing can call /attendance/month until all three
       * values are valid.
       *
       * This prevents requests such as:
       * /month/19/1/1
       * /month/19/1/2
       * etc.
       */

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

        /*
         * If another request started after this one,
         * do not let an older response overwrite the screen.
         */
        if (currentRequestId !== requestIdRef.current) {
          return false;
        }

        const data = response.data || {};

        const normalizedDays = buildDisplayDays(data.days);

        const normalizedStudents = Array.isArray(data.students)
          ? data.students
          : [];

        const normalizedSheet = {
          ...data,
          days: normalizedDays,
          students: normalizedStudents,
        };

        setSheet(normalizedSheet);
        setMarks(initializeMarks(normalizedStudents));
        setChangedCells({});

        /*
         * The backend is authoritative after loading.
         */
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
    [classId, solarYear, solarMonth, initializeMarks],
  );

  /*
   * ------------------------------------------------------------
   * LOAD REGISTER WHEN VALID SELECTION EXISTS
   * ------------------------------------------------------------
   */

  useEffect(() => {
    if (locked) {
      return;
    }

    if (loadingClasses || loadingToday) {
      return;
    }

    if (!classId) {
      return;
    }

    if (!validSolarMonth) {
      return;
    }

    loadSheet();
  }, [
    locked,
    loadingClasses,
    loadingToday,
    classId,
    validSolarMonth,
    loadSheet,
  ]);

  /*
   * ------------------------------------------------------------
   * CYCLE:
   *
   * null -> present -> absent -> null
   * ------------------------------------------------------------
   */

  const cycleAttendance = useCallback(
    (studentId, dayNumber) => {
      if (locked || saving) {
        return;
      }

      setSuccess("");
      setError("");

      setMarks((previous) => {
        const current = previous[studentId]?.[dayNumber] ?? null;

        let next;

        if (current === null) {
          next = STATUS.PRESENT;
        } else if (current === STATUS.PRESENT) {
          next = STATUS.ABSENT;
        } else {
          next = null;
        }

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
    },
    [locked, saving],
  );

  /*
   * ------------------------------------------------------------
   * SAVE MONTH
   * ------------------------------------------------------------
   */

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

    if (days.length === 0) {
      setError("No valid attendance days were returned by the backend.");
      return;
    }

    if (students.length === 0) {
      setError("No students were returned for this class.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const records = [];

      /*
       * Only send cells the user actually changed.
       *
       * The backend treats status === null as an explicit DELETE.
       * Sending every untouched cell as null would erase existing
       * attendance that the user never touched.
       */
      for (const key of Object.keys(changedCells)) {
        const separatorIndex = key.indexOf(":");

        if (separatorIndex <= 0) {
          continue;
        }

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
        });
      }

      if (records.length === 0) {
        throw new Error("There are no attendance records to save.");
      }

      await api.post("/attendance/month", {
        class_slot_id: numericClassId,
        year: numericYear,
        month: numericMonth,
        records,
      });

      /*
       * Always verify against the database after saving.
       */
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

  /*
   * ------------------------------------------------------------
   * PASSWORD VERIFICATION
   * ------------------------------------------------------------
   */

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

  /*
   * ------------------------------------------------------------
   * MONTH NAVIGATION
   * ------------------------------------------------------------
   */

  const confirmMonthChange = useCallback(() => {
    if (!dirty) {
      return true;
    }

    return window.confirm(
      "You have unsaved attendance changes. Change the month without saving?",
    );
  }, [dirty]);

  const goToPreviousMonth = () => {
    if (!validSolarMonth) {
      return;
    }

    if (!confirmMonthChange()) {
      return;
    }

    let year = Number(solarYear);
    let month = Number(solarMonth);

    month -= 1;

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
    if (!validSolarMonth) {
      return;
    }

    if (!confirmMonthChange()) {
      return;
    }

    let year = Number(solarYear);
    let month = Number(solarMonth);

    month += 1;

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
    if (!confirmMonthChange()) {
      return;
    }

    if (!today?.year || !today?.month) {
      return;
    }

    setSuccess("");
    setError("");

    setSolarYear(Number(today.year));
    setSolarMonth(Number(today.month));
  };

  /*
   * ------------------------------------------------------------
   * SUMMARY
   * ------------------------------------------------------------
   */

  const summary = useMemo(() => {
    let present = 0;
    let absent = 0;
    let marked = 0;

    for (const student of sheet?.students || []) {
      const studentId = Number(student.student_id);

      for (const rawDay of sheet?.days || []) {
        const dayNumber = Number(
          typeof rawDay === "object" ? rawDay.day : rawDay,
        );

        const status = marks[studentId]?.[dayNumber] ?? null;

        if (status === STATUS.PRESENT) {
          present += 1;
          marked += 1;
        } else if (status === STATUS.ABSENT) {
          absent += 1;
          marked += 1;
        }
      }
    }

    return {
      present,
      absent,
      marked,
    };
  }, [sheet, marks]);

  const monthName =
    SOLAR_MONTH_NAMES[Number(solarMonth)] ||
    sheet?.solar_month_name ||
    "Solar Hijri Month";

  const calendarDays = sheet?.days || [];
  const totalDays = calendarDays.filter(
    (day) => !isFridayDay(normalizeDay(day)) && !normalizeDay(day).is_friday,
  ).length;

  const totalStudents = sheet?.students?.length || 0;

  const totalCells = totalDays * totalStudents;

  const markedPercentage =
    totalCells > 0 ? Math.round((summary.marked / totalCells) * 100) : 0;

  const selectedClassLabel = useMemo(() => {
    if (!selectedClass) {
      return "Select a class";
    }

    const subject = selectedClass.subject_name || selectedClass.name || "Class";

    const teacher =
      selectedClass.teacher_name || selectedClass.teacher_full_name || "";

    const start = selectedClass.start_time || selectedClass.start || "";

    const end = selectedClass.end_time || selectedClass.end || "";

    const time = start && end ? `${start} - ${end}` : "";

    return [subject, teacher, time].filter(Boolean).join(" • ");
  }, [selectedClass]);

  /*
   * ------------------------------------------------------------
   * LOCK SCREEN
   * ------------------------------------------------------------
   */

  if (locked && !isAdmin) {
    return (
      <div className="min-h-screen bg-[#0b0d10] p-4 text-slate-100 md:p-6">
        <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-xl items-center justify-center">
          <div className="w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-[#101318]/95 shadow-2xl shadow-black/30 backdrop-blur-xl">
            <div className="border-b border-white/10 px-6 py-5">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-[#f2bd19]">
                <Lock size={22} />
              </div>

              <h1 className="text-xl font-semibold">Attendance Verification</h1>

              <p className="mt-1 text-sm text-slate-400">
                Enter your password to access the attendance register.
              </p>
            </div>

            <form onSubmit={verifyPassword} className="space-y-5 p-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  Password
                </label>

                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoFocus
                  className="
                    w-full rounded-xl border border-white/10
                    bg-black/20 px-4 py-3
                    text-slate-100 outline-none
                    transition
                    placeholder:text-slate-600
                    focus:border-[#f2bd19]/50
                    focus:ring-2
                    focus:ring-[#f2bd19]/10
                  "
                  placeholder="Enter your password"
                />
              </div>

              {passwordError && (
                <div className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300">
                  {passwordError}
                </div>
              )}

              <button
                type="submit"
                disabled={verifyingPassword}
                className="
                  flex w-full items-center justify-center gap-2
                  rounded-xl bg-[#f2bd19]
                  px-4 py-3
                  font-semibold text-black
                  transition
                  hover:bg-[#ffd34f]
                  disabled:cursor-not-allowed
                  disabled:opacity-60
                "
              >
                {verifyingPassword ? (
                  <>
                    <Loader2 size={17} className="animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <ShieldCheck size={17} />
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

  /*
   * ------------------------------------------------------------
   * MAIN PAGE
   * ------------------------------------------------------------
   */

  return (
    <div className="min-h-screen bg-[#080a0d] text-slate-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-[#f2bd19]/[0.045] blur-3xl" />
        <div className="absolute right-[-10rem] top-1/3 h-[32rem] w-[32rem] rounded-full bg-cyan-400/[0.025] blur-3xl" />
      </div>
      <div className="relative mx-auto max-w-[1800px] p-4 md:p-6 lg:p-8">
        {/* HEADER */}

        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#f2bd19]/25 bg-gradient-to-br from-[#f2bd19]/15 to-[#f2bd19]/5 text-[#f2bd19] shadow-lg shadow-[#f2bd19]/5">
                <CalendarDays size={21} />
              </div>

              <div>
                <h1 className="text-2xl font-semibold tracking-[-0.02em] text-white">
                  Attendance
                </h1>

                <p className="text-sm text-slate-500">
                  Monthly Solar Hijri attendance register
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs text-slate-400">
                {monthName} {validSolarMonth ? formatNumber(solarYear) : ""}
              </span>

              {dirty ? (
                <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-300">
                  Unsaved changes
                </span>
              ) : (
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-300">
                  Saved
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={goToPreviousMonth}
              disabled={sheetLoading || saving || !validSolarMonth}
              className="
                flex h-11 items-center justify-center gap-2
                rounded-xl border border-white/10
                bg-[#121519] px-4
                text-sm font-medium text-slate-300
                transition
                hover:border-white/20
                hover:bg-white/[0.05]
                disabled:cursor-not-allowed
                disabled:opacity-50
              "
            >
              <ChevronLeft size={17} />
              Previous
            </button>

            <button
              type="button"
              onClick={goToToday}
              disabled={sheetLoading || saving || !today?.year || !today?.month}
              className="
                flex h-11 items-center justify-center gap-2
                rounded-xl border border-white/10
                bg-[#121519] px-4
                text-sm font-medium text-slate-300
                transition
                hover:border-white/20
                hover:bg-white/[0.05]
                disabled:cursor-not-allowed
                disabled:opacity-50
              "
            >
              <CalendarDays size={17} />
              Today
            </button>

            <button
              type="button"
              onClick={goToNextMonth}
              disabled={sheetLoading || saving || !validSolarMonth}
              className="
                flex h-11 items-center justify-center gap-2
                rounded-xl border border-white/10
                bg-[#121519] px-4
                text-sm font-medium text-slate-300
                transition
                hover:border-white/20
                hover:bg-white/[0.05]
                disabled:cursor-not-allowed
                disabled:opacity-50
              "
            >
              Next
              <ChevronRight size={17} />
            </button>

            <button
              type="button"
              onClick={saveAttendance}
              disabled={saving || sheetLoading || !sheet || !dirty}
              className="
                flex h-11 items-center justify-center gap-2
                rounded-xl
                bg-gradient-to-r from-[#f2bd19] to-[#ffd34f]
                px-5
                text-sm font-bold
                text-black
                shadow-xl
                shadow-[#f2bd19]/15
                transition
                hover:-translate-y-0.5
                 hover:shadow-[#f2bd19]/20
                disabled:cursor-not-allowed
                disabled:bg-[#f2bd19]/30
                disabled:text-black/50
                disabled:shadow-none
              "
            >
              {saving ? (
                <>
                  <Loader2 size={17} className="animate-spin" />
                  Saving...
                </>
              ) : dirty ? (
                <>
                  <Save size={17} />
                  Save Attendance
                </>
              ) : (
                <>
                  <Check size={17} />
                  Saved
                </>
              )}
            </button>
          </div>
        </div>

        {/* MESSAGES */}

        {error && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300">
            <X size={18} className="mt-0.5 shrink-0" />

            <div className="flex-1">
              <p className="font-medium">Attendance error</p>

              <p className="mt-0.5 text-red-300/80">{error}</p>
            </div>
          </div>
        )}

        {success && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-300">
            <Check size={18} className="mt-0.5 shrink-0" />

            <div>
              <p className="font-medium">Attendance saved</p>

              <p className="mt-0.5 text-emerald-300/80">{success}</p>
            </div>
          </div>
        )}

        {/* CONTROLS */}

        <div className="mb-5 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
          <div className="grid gap-4 lg:grid-cols-[minmax(260px,1fr)_auto_auto] lg:items-end">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Class / Time Slot
              </label>

              <select
                value={classId}
                onChange={(event) => {
                  if (dirty) {
                    const confirmed = window.confirm(
                      "You have unsaved attendance changes. Change the class without saving?",
                    );

                    if (!confirmed) {
                      return;
                    }
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
                  h-11 w-full rounded-xl
                  border border-white/10
                  bg-[#0b0d10]
                  px-3
                  text-sm text-slate-200
                  outline-none
                  transition
                  focus:border-[#f2bd19]/50
                  disabled:cursor-not-allowed
                  disabled:opacity-50
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

            <div className="flex h-11 items-center justify-center rounded-xl border border-white/10 bg-[#0b0d10] px-4 text-sm text-slate-300">
              <CalendarDays size={16} className="mr-2 text-[#f2bd19]" />

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
                flex h-11 items-center justify-center gap-2
                rounded-xl border border-white/10
                bg-[#0b0d10]
                px-4
                text-sm font-medium text-slate-300
                transition
                hover:border-white/20
                hover:bg-white/[0.05]
                disabled:cursor-not-allowed
                disabled:opacity-50
              "
            >
              <RefreshCw
                size={16}
                className={sheetLoading ? "animate-spin" : ""}
              />
              Refresh
            </button>
          </div>
        </div>

        {/* CLASS INFORMATION */}

        {sheet && (
          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 shadow-lg shadow-black/10 backdrop-blur-xl">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Subject
                </span>

                <CalendarDays size={16} className="text-[#f2bd19]" />
              </div>

              <p className="truncate text-sm font-semibold text-slate-100">
                {sheet.class_slot?.subject_name ||
                  sheet.subject_name ||
                  selectedClass?.subject_name ||
                  "—"}
              </p>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 shadow-lg shadow-black/10 backdrop-blur-xl">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Book / Level
                </span>

                <Users size={16} className="text-[#f2bd19]" />
              </div>

              <p className="truncate text-sm font-semibold text-slate-100">
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

            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 shadow-lg shadow-black/10 backdrop-blur-xl">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Teacher
                </span>

                <UserCheck size={16} className="text-[#f2bd19]" />
              </div>

              <p className="truncate text-sm font-semibold text-slate-100">
                {sheet.class_slot?.teacher_name ||
                  sheet.teacher_name ||
                  selectedClass?.teacher_name ||
                  selectedClass?.teacher_full_name ||
                  "—"}
              </p>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 shadow-lg shadow-black/10 backdrop-blur-xl">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Time
                </span>

                <Clock3 size={16} className="text-[#f2bd19]" />
              </div>

              <p className="truncate text-sm font-semibold text-slate-100">
                {sheet.class_slot?.start_time && sheet.class_slot?.end_time
                  ? `${sheet.class_slot.start_time} - ${sheet.class_slot.end_time}`
                  : sheet.start_time && sheet.end_time
                    ? `${sheet.start_time} - ${sheet.end_time}`
                    : selectedClass?.start_time && selectedClass?.end_time
                      ? `${selectedClass.start_time} - ${selectedClass.end_time}`
                      : "—"}
              </p>
            </div>
          </div>
        )}

        {/* SUMMARY */}

        {sheet && (
          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 shadow-lg shadow-black/10 backdrop-blur-xl">
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Students
              </p>

              <p className="mt-2 text-2xl font-semibold">
                {formatNumber(totalStudents)}
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-400/10 bg-[#121519] p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Present
              </p>

              <p className="mt-2 text-2xl font-semibold text-emerald-300">
                {formatNumber(summary.present)}
              </p>
            </div>

            <div className="rounded-2xl border border-red-400/10 bg-[#121519] p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Absent
              </p>

              <p className="mt-2 text-2xl font-semibold text-red-300">
                {formatNumber(summary.absent)}
              </p>
            </div>

            <div className="rounded-2xl border border-[#f2bd19]/10 bg-[#121519] p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Marked
              </p>

              <p className="mt-2 text-2xl font-semibold text-[#f2bd19]">
                {formatNumber(summary.marked)}
              </p>

              <p className="mt-1 text-xs text-slate-600">
                {formatNumber(markedPercentage)}% of register
              </p>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 shadow-lg shadow-black/10 backdrop-blur-xl">
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Days
              </p>

              <p className="mt-2 text-2xl font-semibold">
                {formatNumber(totalDays)}
              </p>
            </div>
          </div>
        )}

        {/* LEGEND */}

        {sheet && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.025] px-4 py-3 shadow-lg shadow-black/10 backdrop-blur-xl">
            <span className="text-xs font-medium text-slate-500">
              Attendance:
            </span>

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="flex h-6 w-6 items-center justify-center rounded-md border border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
                <Check size={13} />
              </span>
              Present
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="flex h-6 w-6 items-center justify-center rounded-md border border-red-400/30 bg-red-400/10 text-red-300">
                <X size={13} />
              </span>
              Absent
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-white/[0.025] text-slate-600">
                •
              </span>
              Not marked
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="flex h-6 w-6 items-center justify-center rounded-md border border-white/[0.05] bg-white/[0.018] text-[10px] text-slate-700">
                —
              </span>
              Friday · Holiday
            </div>

            <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
              <span className="h-2 w-2 rounded-full bg-[#f2bd19]" />
              Current day
            </div>
          </div>
        )}

        {/* LOADING */}

        {(loadingToday || loadingClasses || sheetLoading) && (
          <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-white/10 bg-[#121519]">
            <div className="flex flex-col items-center gap-3 text-slate-400">
              <Loader2 size={28} className="animate-spin text-[#f2bd19]" />

              <p className="text-sm">
                {loadingToday
                  ? "Loading current Solar Hijri date..."
                  : loadingClasses
                    ? "Loading classes..."
                    : "Loading attendance register..."}
              </p>
            </div>
          </div>
        )}

        {/* EMPTY REGISTER */}

        {!loadingToday && !loadingClasses && !sheetLoading && !sheet && (
          <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-white/10 bg-[#121519]">
            <div className="max-w-md px-6 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-slate-500">
                <CalendarDays size={24} />
              </div>

              <h2 className="text-base font-semibold text-slate-200">
                No attendance register loaded
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Select a class and Solar Hijri month to load the attendance
                register.
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
            <div className="overflow-hidden rounded-[22px] border border-white/[0.075] bg-[#101318] shadow-[0_24px_80px_rgba(0,0,0,0.38)]">
              <div className="border-b border-white/[0.07] bg-white/[0.012] px-4 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-slate-200">
                      Attendance Register
                    </h2>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">
                      {selectedClassLabel}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-[11px] text-slate-500">
                    <span>{formatNumber(totalStudents)} students</span>
                    <span className="text-slate-700">•</span>
                    <span>{formatNumber(totalDays)} days</span>
                  </div>
                </div>
              </div>

              <div className="w-full overflow-hidden">
                <table className="w-full table-fixed border-collapse text-[10px]">
                  <colgroup>
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "10%" }} />
                    {calendarDays.map((rawDay) => (
                      <col
                        key={`col-${normalizeDay(rawDay).day}`}
                        style={{
                          width: `${62 / Math.max(calendarDays.length, 1)}%`,
                        }}
                      />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="border-b border-r border-white/[0.08] bg-[#0d1014] px-1 py-2 text-center text-[8px] font-semibold uppercase tracking-wider text-slate-600">
                        ID
                      </th>
                      <th className="border-b border-r border-white/[0.08] bg-[#0d1014] px-2 py-2 text-left text-[8px] font-semibold uppercase tracking-wider text-slate-600">
                        Student & Guardian
                      </th>
                      <th className="border-b border-r border-white/[0.08] bg-[#0d1014] px-1 py-2 text-center text-[8px] font-semibold uppercase tracking-wider text-slate-600">
                        Pay
                      </th>
                      {calendarDays.map((rawDay) => {
                        const day = normalizeDay(rawDay),
                          isFriday = Boolean(day.is_friday) || isFridayDay(day);
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
                            className={`border-b border-r px-0 py-1 text-center ${isFriday ? "border-white/[0.045] bg-[#090b0e]" : isToday ? "border-[#f2bd19]/25 bg-[#f2bd19]/[0.08]" : "border-white/[0.06] bg-[#0b0e12]"}`}
                          >
                            <div
                              className={`truncate text-[6px] font-semibold uppercase leading-none ${isFriday ? "text-slate-700" : isToday ? "text-[#f2bd19]" : "text-slate-600"}`}
                            >
                              {isFriday ? "FRI" : getWeekdayLabel(day) || "DAY"}
                            </div>
                            <div
                              className={`mx-auto mt-1 flex h-5 w-5 items-center justify-center rounded-md text-[8px] font-bold leading-none ${isFriday ? "border border-white/[0.05] bg-white/[0.018] text-slate-700" : isToday ? "border border-[#f2bd19]/40 bg-[#f2bd19]/10 text-[#f2bd19]" : "text-slate-300"}`}
                            >
                              {formatNumber(day.day)}
                            </div>
                            {isToday && (
                              <div className="mt-0.5 text-[5px] font-bold uppercase leading-none tracking-wider text-[#f2bd19]/80">
                                Today
                              </div>
                            )}
                            {isFriday && (
                              <div className="mt-0.5 text-[5px] font-semibold uppercase leading-none tracking-wider text-slate-700">
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
                      const studentId = Number(student.student_id),
                        payment = getPaymentData(student);
                      return (
                        <tr
                          key={studentId || student.id || index}
                          className="group border-b border-white/[0.055] last:border-b-0 hover:bg-white/[0.018]"
                        >
                          <td className="border-r border-white/[0.055] bg-[#121519] px-1 py-2 text-center text-[9px] font-semibold text-slate-500 group-hover:bg-[#171b20]">
                            {studentId || "—"}
                          </td>
                          <td className="border-r border-white/[0.055] bg-[#121519] px-2 py-1.5 group-hover:bg-[#171b20]">
                            <div className="min-w-0">
                              <div className="truncate text-[10px] font-semibold leading-tight text-slate-200">
                                {student.full_name ||
                                  student.student_name ||
                                  "—"}
                              </div>
                              <div className="mt-0.5 truncate text-[8px] leading-tight text-slate-500">
                                {student.father_name ||
                                  student.guardian_name ||
                                  student.father ||
                                  "—"}
                              </div>
                            </div>
                          </td>
                          <td className="border-r border-white/[0.055] bg-[#121519] px-1 py-1.5 text-center group-hover:bg-[#171b20]">
                            <span
                              title={
                                payment.amount
                                  ? `${payment.label} · ${payment.amount}`
                                  : payment.label
                              }
                              className={`inline-flex max-w-full items-center justify-center rounded-md border px-1 py-0.5 text-[6px] font-bold leading-tight ${payment.className}`}
                            >
                              <span className="truncate">{payment.label}</span>
                            </span>
                            {payment.amount && (
                              <div
                                className="mt-0.5 truncate text-[6px] font-medium leading-none text-amber-300/80"
                                title={payment.amount}
                              >
                                {payment.amount}
                              </div>
                            )}
                          </td>
                          {calendarDays.map((rawDay) => {
                            const day = normalizeDay(rawDay),
                              isFriday =
                                Boolean(day.is_friday) || isFridayDay(day),
                              status = marks[studentId]?.[day.day] ?? null;
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
                                className={`border-r px-0 py-1 text-center ${isFriday ? "border-white/[0.04] bg-white/[0.006]" : isToday ? "border-white/[0.055] bg-[#f2bd19]/[0.025]" : "border-white/[0.055]"}`}
                              >
                                {isFriday ? (
                                  <div
                                    className="mx-auto flex h-6 w-6 items-center justify-center rounded-md border border-white/[0.045] bg-white/[0.012] text-[8px] font-medium text-slate-700"
                                    title="Friday — holiday"
                                  >
                                    —
                                  </div>
                                ) : (
                                  <div className="flex justify-center">
                                    <AttendanceStatusButton
                                      status={status}
                                      disabled={locked || saving}
                                      onClick={() =>
                                        cycleAttendance(studentId, day.day)
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

              <div className="flex flex-col gap-1.5 border-t border-white/10 bg-[#0d1014]/95 px-3 py-2 text-[10px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  {monthName} {validSolarMonth ? formatNumber(solarYear) : ""}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {today?.year && today?.month && today?.day && (
                    <span>
                      Today: {formatNumber(today.year)}/
                      {formatNumber(today.month)}/{formatNumber(today.day)}
                    </span>
                  )}
                  <span className="text-slate-700">•</span>
                  <span>
                    {dirty ? "Changes not saved" : "All changes saved"}
                  </span>
                </div>
              </div>
            </div>
          )}

        {/* EMPTY STUDENTS */}

        {!loadingToday &&
          !loadingClasses &&
          !sheetLoading &&
          sheet &&
          (!sheet.students || sheet.students.length === 0) && (
            <div className="rounded-2xl border border-white/10 bg-[#121519] p-10 text-center">
              <Users size={28} className="mx-auto text-slate-600" />

              <h2 className="mt-4 text-base font-semibold text-slate-300">
                No students in this class
              </h2>

              <p className="mt-2 text-sm text-slate-500">
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
            <div className="rounded-2xl border border-white/10 bg-[#121519] p-10 text-center">
              <CalendarDays size={28} className="mx-auto text-slate-600" />

              <h2 className="mt-4 text-base font-semibold text-slate-300">
                No attendance days
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                The backend did not return any valid attendance days for this
                month.
              </p>
            </div>
          )}
      </div>
    </div>
  );
}
