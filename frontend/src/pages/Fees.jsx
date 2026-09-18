import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import PasswordConfirmModal from "../components/PasswordConfirmModal";
import { useToast } from "../components/Toast";

import {
  AlertCircle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CreditCard,
  Loader2,
  RefreshCw,
  Search,
  UserRound,
  Wallet,
  X,
} from "lucide-react";

/* ============================================================
   SOLAR HIJRI
============================================================ */

const SOLAR_MONTHS = [
  "Hamal",
  "Saur",
  "Jawza",
  "Saratan",
  "Asad",
  "Sunbula",
  "Mizan",
  "Aqrab",
  "Qaws",
  "Jadi",
  "Dalw",
  "Hoot",
];

const MONTH_SHORT = [
  "Ham",
  "Sau",
  "Jaw",
  "Sar",
  "Asa",
  "Sun",
  "Miz",
  "Aqr",
  "Qaw",
  "Jad",
  "Dal",
  "Hoo",
];

/* ============================================================
   HELPERS
============================================================ */

function formatTime(value) {
  if (!value) return "—";

  const [hourString, minuteString] = String(value).slice(0, 5).split(":");

  let hour = Number(hourString);
  const minute = minuteString || "00";

  if (!Number.isFinite(hour)) {
    return String(value).slice(0, 5);
  }

  const suffix = hour >= 12 ? "PM" : "AM";

  if (hour === 0) hour = 12;
  if (hour > 12) hour -= 12;

  return `${hour}:${minute} ${suffix}`;
}

function formatMoney(value) {
  const number = Number(value || 0);

  return `AFN ${number.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function monthKey(year, month) {
  return `${Number(year)}-${Number(month)}`;
}

function parseSolarDate(value) {
  if (!value) return null;

  const match = String(value)
    .trim()
    .match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);

  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function formatSolarDate(year, month, day) {
  return `${String(year).padStart(4, "0")}/${String(month).padStart(
    2,
    "0",
  )}/${String(day).padStart(2, "0")}`;
}

function getTodaySolar() {
  try {
    const formatter = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {
      timeZone: "Asia/Kabul",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });

    const parts = formatter.formatToParts(new Date());

    const year = Number(parts.find((part) => part.type === "year")?.value);
    const month = Number(parts.find((part) => part.type === "month")?.value);
    const day = Number(parts.find((part) => part.type === "day")?.value);

    if (
      Number.isInteger(year) &&
      Number.isInteger(month) &&
      Number.isInteger(day)
    ) {
      return {
        year,
        month,
        day,
        formatted: formatSolarDate(year, month, day),
      };
    }
  } catch {
    // Backend remains authoritative.
  }

  return {
    year: 1405,
    month: 1,
    day: 1,
    formatted: "1405/01/01",
  };
}

function getSolarMonthDays(year, month) {
  if (month >= 1 && month <= 6) return 31;
  if (month >= 7 && month <= 11) return 30;

  if (month === 12) {
    try {
      const formatter = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {
        timeZone: "Asia/Kabul",
        year: "numeric",
        month: "numeric",
        day: "numeric",
      });

      const start = new Date(Date.UTC(2027, 2, 20, 12, 0, 0));

      for (let offset = 0; offset <= 2; offset++) {
        const testDate = new Date(
          start.getTime() + offset * 24 * 60 * 60 * 1000,
        );

        const parts = formatter.formatToParts(testDate);

        const jy = Number(parts.find((part) => part.type === "year")?.value);
        const jm = Number(parts.find((part) => part.type === "month")?.value);
        const jd = Number(parts.find((part) => part.type === "day")?.value);

        if (jy === year && jm === 12 && jd === 30) {
          return 30;
        }
      }
    } catch {
      // Backend remains authoritative.
    }

    return year % 4 === 3 ? 30 : 29;
  }

  return 30;
}

function monthName(month) {
  return SOLAR_MONTHS[Number(month) - 1] || `Month ${month}`;
}

function statusForMonth({
  year,
  month,
  currentYear,
  currentMonth,
  paidMonth,
  enrolledSolar,
}) {
  const isBeforeEnrollment =
    enrolledSolar &&
    (year < enrolledSolar.year ||
      (year === enrolledSolar.year && month < enrolledSolar.month));

  if (isBeforeEnrollment) {
    return "not_started";
  }

  if (paidMonth) {
    const paid = Number(paidMonth.paid_amount || 0);
    const calculated = Number(paidMonth.calculated_amount || 0);

    const feeStatus = String(paidMonth.fee_status || "").toLowerCase();

    if (feeStatus === "paid" || (calculated > 0 && paid >= calculated)) {
      return "paid";
    }

    if (paid > 0 || feeStatus === "partial") {
      return "partial";
    }
  }

  if (year > currentYear || (year === currentYear && month > currentMonth)) {
    return "upcoming";
  }

  return "due";
}

function getClassBooks(classItem) {
  if (!classItem) return [];

  if (Array.isArray(classItem.books)) {
    return classItem.books;
  }

  if (Array.isArray(classItem.sections)) {
    return classItem.sections;
  }

  if (Array.isArray(classItem.levels)) {
    return classItem.levels;
  }

  return [];
}

function formatBooks(books) {
  if (!Array.isArray(books) || books.length === 0) {
    return "—";
  }

  return books
    .map((book) => {
      if (typeof book === "string") return book;
      return book?.name || "";
    })
    .filter(Boolean)
    .join(" • ");
}

/* ============================================================
   MONTH STATUS CARD
============================================================ */

function MonthStatusCard({ month, status, selected, onClick }) {
  const clickable =
    status === "due" || status === "partial" || status === "upcoming";

  const styles = {
    paid: {
      box: "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300",
      dot: "bg-emerald-400",
      label: "Paid",
    },

    partial: {
      box: "border-amber-400/25 bg-amber-400/[0.07] text-amber-300",
      dot: "bg-amber-400",
      label: "Partial",
    },

    due: {
      box: "border-red-400/25 bg-red-400/[0.06] text-red-300",
      dot: "bg-red-400",
      label: "Payment Due",
    },

    upcoming: {
      box: "border-blue-400/15 bg-blue-400/[0.035] text-blue-300",
      dot: "bg-blue-400",
      label: "Upcoming",
    },

    not_started: {
      box: "border-white/[0.045] bg-white/[0.01] text-slate-700",
      dot: "bg-slate-800",
      label: "Not Started",
    },
  };

  const style = styles[status] || styles.upcoming;

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => clickable && onClick(month)}
      className={`
        group relative min-h-[86px] w-full rounded-xl border p-3
        text-left transition-all
        ${style.box}
        ${
          clickable
            ? "cursor-pointer hover:-translate-y-0.5 hover:border-[#f2bd19]/35"
            : "cursor-default"
        }
        ${selected ? "ring-2 ring-[#f2bd19]/50 border-[#f2bd19]/50" : ""}
      `}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.16em] font-semibold opacity-70">
            {MONTH_SHORT[month.solar_month - 1]}
          </p>

          <p className="mt-1 text-sm font-bold text-white truncate">
            {monthName(month.solar_month)}
          </p>
        </div>

        <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${style.dot}`} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[9px] font-medium truncate">{style.label}</span>

        {Number(month.paid_amount || 0) > 0 && (
          <span className="text-[9px] opacity-70 whitespace-nowrap">
            {formatMoney(month.paid_amount)}
          </span>
        )}
      </div>
    </button>
  );
}

/* ============================================================
   RECORD PAYMENT MODAL
============================================================ */

function PaymentModal({ open, enrollment, month, onClose, onSubmit, saving }) {
  const [monthlyAmount, setMonthlyAmount] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [comment, setComment] = useState("");

  const todaySolar = useMemo(() => getTodaySolar(), []);

  useEffect(() => {
    if (!open) return;

    setMonthlyAmount(
      month?.monthly_amount ? String(Number(month.monthly_amount)) : "",
    );

    setPaymentAmount("");
    setComment("");
  }, [open, month]);

  if (!open || !enrollment || !month) {
    return null;
  }

  const feeAmount = Number(monthlyAmount || 0);
  const amount = Number(paymentAmount || 0);

  const existingPaid = Number(month.paid_amount || 0);
  const existingCalculated = Number(month.calculated_amount || feeAmount || 0);

  const existingDue = Math.max(existingCalculated - existingPaid, 0);

  const suggestedFullPayment = existingDue > 0 ? existingDue : feeAmount;

  const isPartial =
    amount > 0 && suggestedFullPayment > 0 && amount < suggestedFullPayment;

  const valid = feeAmount > 0 && amount > 0 && amount <= suggestedFullPayment;

  function submit(e) {
    e.preventDefault();

    if (!valid || saving) return;

    onSubmit({
      solarYear: Number(month.solar_year),
      solarMonth: Number(month.solar_month),
      monthlyAmount: feeAmount,
      paymentAmount: amount,
      comment: comment.trim(),
    });
  }

  const books = enrollment.books || [];

  return (
    <div
      className="
        fixed inset-0 z-[8000]
        bg-black/75 backdrop-blur-sm
        flex items-start sm:items-center justify-center
        p-2 sm:p-4
        overflow-y-auto
      "
    >
      <div
        className="
          w-full max-w-xl
          max-h-[calc(100vh-1rem)]
          sm:max-h-[calc(100vh-2rem)]
          rounded-2xl
          border border-white/10
          bg-[#121519]
          shadow-[0_25px_100px_rgba(0,0,0,0.65)]
          flex flex-col
          overflow-hidden
          my-auto
        "
      >
        {/* HEADER */}

        <div className="shrink-0 flex items-start justify-between gap-3 px-4 sm:px-5 py-4 border-b border-white/[0.06]">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 shrink-0 rounded-lg bg-[#f2bd19]/10 border border-[#f2bd19]/20 grid place-items-center">
                <CreditCard className="h-4 w-4 text-[#f2bd19]" />
              </div>

              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white">Record Payment</h3>

                <p className="text-[10px] text-slate-600 mt-0.5">
                  Payment date is automatically today
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="
              h-8 w-8 shrink-0 rounded-lg
              grid place-items-center
              text-slate-600
              hover:text-white hover:bg-white/[0.05]
              transition
            "
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* CONTENT */}

        <form onSubmit={submit} className="min-h-0 flex flex-col">
          <div className="flex-1 overflow-y-auto overscroll-contain">
            <div className="p-4 sm:p-5 space-y-4">
              {/* STUDENT */}

              <div className="rounded-xl border border-white/[0.06] bg-[#0d1013] p-3.5 sm:p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 shrink-0 rounded-xl bg-white/[0.04] border border-white/[0.06] grid place-items-center">
                    <UserRound className="h-4 w-4 text-slate-500" />
                  </div>

                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {enrollment.student_name}
                    </p>

                    <p className="text-[10px] text-slate-500 mt-1 truncate">
                      Father:{" "}
                      <span className="text-slate-300">
                        {enrollment.father_name || "—"}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <InfoBox label="Subject" value={enrollment.subject_name} />

                  <InfoBox label="Level / Book" value={formatBooks(books)} />

                  <InfoBox label="Teacher" value={enrollment.teacher_name} />

                  <InfoBox
                    label="Time"
                    value={`${formatTime(
                      enrollment.start_time,
                    )}–${formatTime(enrollment.end_time)}`}
                  />
                </div>
              </div>

              {/* PAYMENT PERIOD */}

              <div className="rounded-xl border border-[#f2bd19]/15 bg-[#f2bd19]/[0.04] p-3.5 sm:p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[8px] uppercase tracking-[0.15em] text-[#f2bd19]/60">
                      Payment Period
                    </p>

                    <p className="text-lg font-bold text-white mt-1">
                      {monthName(month.solar_month)}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-[8px] uppercase tracking-wider text-slate-600">
                      Solar Year
                    </p>

                    <p className="text-sm font-semibold text-slate-300 mt-1">
                      {month.solar_year}
                    </p>
                  </div>
                </div>

                <div className="mt-3 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
                  <p className="text-[9px] text-slate-600">Coverage</p>

                  <p className="text-[10px] text-slate-300 mt-1">
                    {formatSolarDate(
                      Number(month.solar_year),
                      Number(month.solar_month),
                      1,
                    )}
                    {" — "}
                    {formatSolarDate(
                      Number(month.solar_year),
                      Number(month.solar_month),
                      month.month_days ||
                        getSolarMonthDays(
                          Number(month.solar_year),
                          Number(month.solar_month),
                        ),
                    )}
                  </p>
                </div>
              </div>

              {/* PAYMENT DATE */}

              <div>
                <label className="text-[9px] uppercase tracking-[0.14em] text-slate-600">
                  Payment Date
                </label>

                <div className="mt-1 min-h-11 rounded-lg border border-white/[0.07] bg-[#0d1013] px-3 py-2 flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 shrink-0 text-[#f2bd19]/70" />

                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-white">
                      {todaySolar.formatted}
                    </p>

                    <p className="text-[8px] text-slate-700">
                      Afghanistan Solar Hijri date
                    </p>
                  </div>

                  <span className="ml-auto shrink-0 text-[8px] rounded-full border border-emerald-400/15 bg-emerald-400/[0.05] px-2 py-1 text-emerald-400">
                    Today
                  </span>
                </div>
              </div>

              {/* MONTHLY FEE */}

              <div>
                <label className="text-[9px] uppercase tracking-[0.14em] text-slate-600">
                  Monthly Fee
                </label>

                <div className="mt-1 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[10px] font-semibold">
                    AFN
                  </span>

                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={monthlyAmount}
                    onChange={(e) => setMonthlyAmount(e.target.value)}
                    placeholder="Enter monthly fee"
                    className="
                      h-11 w-full rounded-lg
                      border border-white/[0.07]
                      bg-[#0d1013]
                      pl-12 pr-3
                      text-sm text-white
                      outline-none
                      focus:border-[#f2bd19]/50
                    "
                  />
                </div>
              </div>

              {/* PAYMENT */}

              <div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
                  <label className="text-[9px] uppercase tracking-[0.14em] text-slate-600">
                    Payment Amount
                  </label>

                  {suggestedFullPayment > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setPaymentAmount(
                          String(Number(suggestedFullPayment.toFixed(2))),
                        )
                      }
                      className="text-left sm:text-right text-[9px] text-[#f2bd19] hover:text-[#ffd34d]"
                    >
                      Pay remaining {formatMoney(suggestedFullPayment)}
                    </button>
                  )}
                </div>

                <div className="mt-1 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[10px] font-semibold">
                    AFN
                  </span>

                  <input
                    type="number"
                    min="0"
                    max={suggestedFullPayment || undefined}
                    step="10"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder="Enter amount paid"
                    className="
                      h-12 w-full rounded-lg
                      border border-[#f2bd19]/20
                      bg-[#0d1013]
                      pl-12 pr-3
                      text-base font-semibold text-white
                      outline-none
                      focus:border-[#f2bd19]/60
                    "
                  />
                </div>

                {existingPaid > 0 && (
                  <p className="text-[9px] text-amber-400 mt-2 leading-relaxed">
                    Already paid: {formatMoney(existingPaid)}
                    {" • "}
                    Remaining: {formatMoney(existingDue)}
                  </p>
                )}
              </div>

              {/* COMMENT */}

              <div>
                <label className="text-[9px] uppercase tracking-[0.14em] text-slate-600">
                  Comment
                </label>

                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Optional payment comment"
                  rows={3}
                  maxLength={1000}
                  className="
                    mt-1 w-full rounded-lg
                    border border-white/[0.07]
                    bg-[#0d1013]
                    px-3 py-2.5
                    text-[11px] text-white
                    placeholder:text-slate-700
                    outline-none
                    resize-none
                    focus:border-[#f2bd19]/50
                  "
                />

                <p className="text-[8px] text-slate-700 mt-1">
                  Optional. This comment will be saved with the payment.
                </p>
              </div>

              {/* PARTIAL */}

              {isPartial && (
                <div className="rounded-lg border border-amber-400/15 bg-amber-400/[0.04] p-3 flex gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />

                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold text-amber-300">
                      Partial payment
                    </p>

                    <p className="text-[9px] text-slate-600 mt-0.5 leading-relaxed">
                      This month will remain marked Partial until its remaining
                      balance is paid.
                    </p>
                  </div>
                </div>
              )}

              {/* FULL PAYMENT */}

              {amount > 0 &&
                suggestedFullPayment > 0 &&
                amount === suggestedFullPayment && (
                  <div className="rounded-lg border border-emerald-400/15 bg-emerald-400/[0.04] p-3 flex gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />

                    <div>
                      <p className="text-[10px] font-semibold text-emerald-300">
                        Full payment
                      </p>

                      <p className="text-[9px] text-slate-600 mt-0.5">
                        This payment will clear the remaining balance for this
                        month.
                      </p>
                    </div>
                  </div>
                )}
            </div>
          </div>

          {/* FOOTER */}

          <div className="shrink-0 px-4 sm:px-5 py-3 sm:py-4 border-t border-white/[0.06] flex flex-col-reverse sm:flex-row sm:justify-end gap-2 bg-[#121519]">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="
                h-10 px-4 rounded-lg
                border border-white/10
                bg-white/[0.02]
                text-xs text-slate-500
                hover:text-white
                transition
              "
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={!valid || saving}
              className="
                h-10 px-5 rounded-lg
                bg-[#f2bd19]
                text-[#0b0d10]
                text-xs font-bold
                flex items-center justify-center gap-2
                hover:bg-[#ffd34d]
                disabled:opacity-40
                disabled:cursor-not-allowed
                transition
              "
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Recording...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Record Payment
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ============================================================
   INFO BOX
============================================================ */

function InfoBox({ label, value }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/[0.05] bg-white/[0.02] p-2.5">
      <p className="text-[8px] uppercase tracking-wider text-slate-700">
        {label}
      </p>

      <p className="text-[10px] text-slate-300 mt-1 break-words">
        {value || "—"}
      </p>
    </div>
  );
}

/* ============================================================
   MAIN PAGE
============================================================ */

export default function Fees() {
  const toast = useToast();

  const [classes, setClasses] = useState([]);
  const [enrollments, setEnrollments] = useState([]);

  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedEnrollment, setSelectedEnrollment] = useState(null);

  const [history, setHistory] = useState(null);

  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [subjectFilter, setSubjectFilter] = useState("all");
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [timeFilter, setTimeFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentMonth, setPaymentMonth] = useState(null);

  const [passwordConfirmOpen, setPasswordConfirmOpen] = useState(false);
  const [pendingPayment, setPendingPayment] = useState(null);

  /* ==========================================================
     LOAD
  ========================================================== */

  async function loadData(showSpinner = true) {
    if (showSpinner) {
      setLoading(true);
    }

    try {
      const [classesResponse, enrollmentsResponse] = await Promise.all([
        api.get("/classes"),
        api.get("/fees/enrollments"),
      ]);

      setClasses(
        Array.isArray(classesResponse.data) ? classesResponse.data : [],
      );

      setEnrollments(
        Array.isArray(enrollmentsResponse.data) ? enrollmentsResponse.data : [],
      );
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to load payment data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  /* ==========================================================
     CLASS DATA
  ========================================================== */

  const activeClasses = useMemo(() => {
    return classes
      .filter((item) => item.is_active !== false)
      .map((item) => {
        const students = enrollments.filter(
          (enrollment) => Number(enrollment.class_slot_id) === Number(item.id),
        );

        return {
          ...item,
          books: getClassBooks(item),
          enrolled_count: students.length,
        };
      });
  }, [classes, enrollments]);

  const subjects = useMemo(() => {
    const map = new Map();

    activeClasses.forEach((item) => {
      if (item.subject_name) {
        map.set(item.subject_name, item.subject_name);
      }
    });

    return [...map.values()].sort();
  }, [activeClasses]);

  const teachers = useMemo(() => {
    const map = new Map();

    activeClasses.forEach((item) => {
      if (item.teacher_name) {
        map.set(item.teacher_name, item.teacher_name);
      }
    });

    return [...map.values()].sort();
  }, [activeClasses]);

  const times = useMemo(() => {
    const map = new Map();

    activeClasses.forEach((item) => {
      const key = `${formatTime(item.start_time)}–${formatTime(item.end_time)}`;

      map.set(key, key);
    });

    return [...map.values()].sort();
  }, [activeClasses]);

  const filteredClasses = useMemo(() => {
    const q = search.trim().toLowerCase();

    return activeClasses.filter((item) => {
      if (subjectFilter !== "all" && item.subject_name !== subjectFilter) {
        return false;
      }

      if (teacherFilter !== "all" && item.teacher_name !== teacherFilter) {
        return false;
      }

      const timeLabel = `${formatTime(
        item.start_time,
      )}–${formatTime(item.end_time)}`;

      if (timeFilter !== "all" && timeLabel !== timeFilter) {
        return false;
      }

      if (q) {
        const haystack = [
          item.subject_name,
          item.teacher_name,
          item.room,
          item.subject_code,
          formatBooks(item.books),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [activeClasses, subjectFilter, teacherFilter, timeFilter, search]);

  /* ==========================================================
     SELECT CLASS
  ========================================================== */

  function selectClass(classItem) {
    setSelectedClassId(String(classItem.id));
    setSelectedEnrollment(null);
    setHistory(null);
  }

  const selectedClass = useMemo(
    () =>
      activeClasses.find(
        (item) => String(item.id) === String(selectedClassId),
      ) || null,
    [activeClasses, selectedClassId],
  );

  const classStudents = useMemo(() => {
    if (!selectedClassId) return [];

    const selectedClassData = activeClasses.find(
      (item) => Number(item.id) === Number(selectedClassId),
    );

    const books = selectedClassData?.books || [];

    return enrollments
      .filter((item) => Number(item.class_slot_id) === Number(selectedClassId))
      .filter((item) => item.enrollment_active !== false)
      .map((item) => ({
        ...item,
        books,
      }))
      .sort((a, b) =>
        String(a.student_name || "").localeCompare(
          String(b.student_name || ""),
        ),
      );
  }, [enrollments, selectedClassId, activeClasses]);

  /* ==========================================================
     HISTORY
  ========================================================== */

  async function selectStudent(enrollment) {
    setSelectedEnrollment(enrollment);
    setHistory(null);
    setLoadingHistory(true);

    try {
      const { data } = await api.get(
        `/fees/enrollments/${enrollment.enrollment_id}/history`,
      );

      setHistory(data);
    } catch (error) {
      toast.error(
        error.response?.data?.error || "Failed to load payment history",
      );
    } finally {
      setLoadingHistory(false);
    }
  }

  async function refreshHistory() {
    if (!selectedEnrollment) return;

    await selectStudent(selectedEnrollment);
  }

  /* ==========================================================
     MONTH GRID
  ========================================================== */

  const monthCards = useMemo(() => {
    if (!history) return [];

    const today = getTodaySolar();

    const currentYear = Number(history.current_solar_year) || today.year;

    const currentMonth = Number(history.current_solar_month) || today.month;

    const enrolledSolar =
      parseSolarDate(history.enrollment?.enrolled_on_solar) ||
      parseSolarDate(history.enrollment?.enrolled_on);

    const existing = new Map();

    (history.months || []).forEach((month) => {
      existing.set(monthKey(month.solar_year, month.solar_month), month);
    });

    return Array.from({ length: 12 }, (_, index) => {
      const solarMonth = index + 1;

      const paidMonth = existing.get(monthKey(currentYear, solarMonth));

      const status = statusForMonth({
        year: currentYear,
        month: solarMonth,
        currentYear,
        currentMonth,
        paidMonth,
        enrolledSolar,
      });

      return {
        solar_year: currentYear,
        solar_month: solarMonth,

        month_days:
          paidMonth?.month_days || getSolarMonthDays(currentYear, solarMonth),

        covered_days: paidMonth?.covered_days || 0,

        monthly_amount: paidMonth?.monthly_amount || null,

        calculated_amount: paidMonth?.calculated_amount || null,

        paid_amount: paidMonth?.paid_amount || 0,

        paid_days: paidMonth?.paid_days || 0,

        fee_id: paidMonth?.fee_id || null,

        fee_status: paidMonth?.fee_status || null,

        fee_period_id: paidMonth?.fee_period_id || null,

        status,
      };
    });
  }, [history]);

  /* ==========================================================
     OPEN PAYMENT
  ========================================================== */

  function openPayment(month) {
    const payable =
      month.status === "due" ||
      month.status === "partial" ||
      month.status === "upcoming";

    if (!payable) {
      return;
    }

    if (!selectedEnrollment || !history) {
      return;
    }

    setPaymentMonth(month);
    setPaymentModalOpen(true);
  }

  /* ==========================================================
     SUBMIT PAYMENT
  ========================================================== */

  function requestPayment(payment) {
    if (!selectedEnrollment) return;

    setPendingPayment(payment);
    setPasswordConfirmOpen(true);
  }

  async function confirmPayment() {
    if (!selectedEnrollment || !pendingPayment) {
      return;
    }

    const { solarYear, solarMonth, monthlyAmount, paymentAmount, comment } =
      pendingPayment;

    setSavingPayment(true);

    try {
      const selectedMonth = monthCards.find(
        (month) =>
          Number(month.solar_year) === Number(solarYear) &&
          Number(month.solar_month) === Number(solarMonth),
      );

      if (!selectedMonth) {
        throw new Error("Selected payment month was not found");
      }

      /*
       * FIRST PAYMENT / NEW FEE
       */
      if (!selectedMonth.fee_id) {
        const monthDays =
          selectedMonth.month_days || getSolarMonthDays(solarYear, solarMonth);

        const fromSolarDate = formatSolarDate(solarYear, solarMonth, 1);

        const toSolarDate = formatSolarDate(solarYear, solarMonth, monthDays);

        await api.post("/fees", {
          student_id: selectedEnrollment.student_id,

          enrollment_id: selectedEnrollment.enrollment_id,

          from_solar_date: fromSolarDate,
          to_solar_date: toSolarDate,

          monthly_amounts: [
            {
              solar_year: solarYear,
              solar_month: solarMonth,
              monthly_amount: monthlyAmount,
            },
          ],

          initial_paid_amount: paymentAmount,

          initial_payment_solar_date: null,

          initial_payment_comment: comment || null,

          academic_year: null,
          description: null,
        });
      } else {
        /*
         * EXISTING FEE
         */
        await api.post(`/fees/${selectedMonth.fee_id}/payment`, {
          amount: paymentAmount,
          comment: comment || null,
        });
      }

      toast.success("Payment recorded successfully");

      setPasswordConfirmOpen(false);
      setPaymentModalOpen(false);
      setPendingPayment(null);
      setPaymentMonth(null);

      await loadData(false);

      if (selectedEnrollment) {
        setLoadingHistory(true);

        try {
          const { data } = await api.get(
            `/fees/enrollments/${selectedEnrollment.enrollment_id}/history`,
          );

          setHistory(data);
        } finally {
          setLoadingHistory(false);
        }
      }
    } catch (error) {
      toast.error(
        error.response?.data?.error ||
          error.message ||
          "Failed to record payment",
      );
    } finally {
      setSavingPayment(false);
    }
  }

  /* ==========================================================
     REFRESH
  ========================================================== */

  async function refresh() {
    setRefreshing(true);

    await loadData(false);

    if (selectedEnrollment) {
      await selectStudent(selectedEnrollment);
    }
  }

  /* ==========================================================
     RENDER
  ========================================================== */

  return (
    <div className="min-h-full bg-[#0b0d10] text-slate-100 p-3 sm:p-5 lg:p-6">
      <div className="max-w-[1600px] mx-auto space-y-4 sm:space-y-5">
        {/* HEADER */}

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 shrink-0 rounded-xl bg-[#f2bd19]/10 border border-[#f2bd19]/20 grid place-items-center">
                <Wallet className="h-5 w-5 text-[#f2bd19]" />
              </div>

              <div className="min-w-0">
                <h2 className="text-xl font-bold tracking-tight text-white">
                  Fees & Payments
                </h2>

                <p className="text-xs text-slate-500 mt-0.5">
                  Manage payments directly from classes, time slots, and
                  enrolled students
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="
              h-10 px-3 rounded-lg
              border border-white/10
              bg-[#121519]
              text-slate-400
              hover:text-white
              hover:bg-white/[0.04]
              transition
              flex items-center justify-center gap-2
              text-xs
              w-full sm:w-auto
            "
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>

        {/* STEP 01 */}

        <section className="rounded-2xl border border-white/[0.06] bg-[#121519] overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-white/[0.06]">
            <div className="flex items-start gap-3">
              <span className="h-7 w-7 shrink-0 rounded-lg bg-[#f2bd19]/10 text-[#f2bd19] grid place-items-center text-[10px] font-bold">
                01
              </span>

              <div>
                <h3 className="text-sm font-bold text-white">Choose Class</h3>

                <p className="text-[10px] text-slate-600 mt-1">
                  Select the exact subject, level/book, teacher, and time slot
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-4">
            {/* FILTERS */}

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              <FilterSelect
                label="Subject"
                value={subjectFilter}
                onChange={setSubjectFilter}
                options={subjects}
              />

              <FilterSelect
                label="Teacher"
                value={teacherFilter}
                onChange={setTeacherFilter}
                options={teachers}
              />

              <FilterSelect
                label="Time"
                value={timeFilter}
                onChange={setTimeFilter}
                options={times}
              />

              <div>
                <label className="text-[9px] uppercase tracking-[0.14em] text-slate-700">
                  Search
                </label>

                <div className="mt-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-700" />

                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Subject, teacher, level or room"
                    className="
                      h-10 w-full rounded-lg
                      border border-white/[0.07]
                      bg-[#0d1013]
                      pl-9 pr-3
                      text-[11px] text-white
                      outline-none
                      focus:border-[#f2bd19]/50
                    "
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <p className="text-[10px] text-slate-700">
                Showing{" "}
                <span className="text-slate-400 font-semibold">
                  {filteredClasses.length}
                </span>{" "}
                of{" "}
                <span className="text-slate-400 font-semibold">
                  {activeClasses.length}
                </span>
              </p>

              <p className="text-[10px] text-slate-700">
                {activeClasses.length} active classes
              </p>
            </div>

            {/* CLASS GRID */}

            {loading ? (
              <div className="py-16 grid place-items-center">
                <Loader2 className="h-6 w-6 text-[#f2bd19] animate-spin" />
              </div>
            ) : filteredClasses.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/[0.07] py-12 text-center">
                <p className="text-xs text-slate-500">
                  No matching classes found.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredClasses.map((item) => {
                  const selected = String(item.id) === String(selectedClassId);

                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => selectClass(item)}
                      className={`
                        rounded-xl border p-4 text-left
                        transition-all min-w-0
                        ${
                          selected
                            ? "border-[#f2bd19]/40 bg-[#f2bd19]/[0.06] ring-1 ring-[#f2bd19]/20"
                            : "border-white/[0.06] bg-[#0d1013] hover:border-white/[0.12] hover:bg-white/[0.02]"
                        }
                      `}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate">
                            {item.subject_name || "Unknown Subject"}
                          </p>

                          <p className="text-[10px] text-slate-500 mt-1 truncate">
                            {item.teacher_name || "Unknown Teacher"}
                          </p>
                        </div>

                        {selected && (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-[#f2bd19]" />
                        )}
                      </div>

                      <div className="mt-3 rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-2">
                        <p className="text-[8px] uppercase tracking-wider text-slate-700">
                          Level / Book
                        </p>

                        <p className="text-[10px] text-slate-300 mt-1 break-words">
                          {formatBooks(item.books)}
                        </p>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 min-w-0">
                          <Clock3 className="h-3.5 w-3.5 shrink-0" />

                          <span className="truncate">
                            {formatTime(item.start_time)}–
                            {formatTime(item.end_time)}
                          </span>
                        </div>

                        <span className="shrink-0 text-[9px] rounded-full border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-slate-600">
                          {item.enrolled_count || 0} enrolled
                        </span>
                      </div>

                      {item.room && (
                        <p className="text-[9px] text-slate-700 mt-3 truncate">
                          {item.room}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* STEP 02 */}

        <section className="rounded-2xl border border-white/[0.06] bg-[#121519] overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-white/[0.06]">
            <div className="flex items-start gap-3">
              <span className="h-7 w-7 shrink-0 rounded-lg bg-[#f2bd19]/10 text-[#f2bd19] grid place-items-center text-[10px] font-bold">
                02
              </span>

              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white">Students</h3>

                {selectedClass ? (
                  <>
                    <p className="text-[10px] text-slate-600 mt-1 truncate">
                      {selectedClass.subject_name}
                      {" • "}
                      {formatBooks(selectedClass.books)}
                      {" • "}
                      {selectedClass.teacher_name}
                      {" • "}
                      {formatTime(selectedClass.start_time)}–
                      {formatTime(selectedClass.end_time)}
                    </p>
                  </>
                ) : (
                  <p className="text-[10px] text-slate-600 mt-1">
                    Select a class above to view enrolled students
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-5">
            {!selectedClass ? (
              <div className="py-10 text-center">
                <UserRound className="h-7 w-7 text-slate-800 mx-auto" />

                <p className="text-xs text-slate-600 mt-3">
                  Select a class to see its students.
                </p>
              </div>
            ) : classStudents.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-xs text-slate-600">
                  No students are enrolled in this time slot.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] text-slate-600">
                    {classStudents.length}{" "}
                    {classStudents.length === 1 ? "student" : "students"}
                  </p>
                </div>

                {classStudents.map((student) => {
                  const selected =
                    selectedEnrollment?.enrollment_id === student.enrollment_id;

                  return (
                    <button
                      type="button"
                      key={student.enrollment_id}
                      onClick={() => selectStudent(student)}
                      className={`
                        w-full rounded-xl border p-3 sm:p-4
                        text-left transition-all
                        ${
                          selected
                            ? "border-[#f2bd19]/35 bg-[#f2bd19]/[0.05]"
                            : "border-white/[0.05] bg-[#0d1013] hover:border-white/[0.10]"
                        }
                      `}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 shrink-0 rounded-xl bg-white/[0.04] border border-white/[0.06] grid place-items-center">
                          <UserRound className="h-4 w-4 text-slate-600" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white truncate">
                            {student.student_name}
                          </p>

                          <p className="text-[10px] text-slate-600 mt-1 truncate">
                            Father:{" "}
                            <span className="text-slate-400">
                              {student.father_name || "—"}
                            </span>
                          </p>

                          {student.roll_number && (
                            <p className="text-[9px] text-slate-700 mt-0.5">
                              Roll: {student.roll_number}
                            </p>
                          )}
                        </div>

                        <div className="text-right shrink-0 hidden sm:block">
                          <p className="text-[10px] text-slate-500">
                            {student.subject_name}
                          </p>

                          <p className="text-[9px] text-slate-600 mt-1 max-w-[180px]">
                            {formatBooks(student.books)}
                          </p>

                          <p className="text-[9px] text-slate-700 mt-1">
                            {formatTime(student.start_time)}–
                            {formatTime(student.end_time)}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* PAYMENT HISTORY */}

        {selectedEnrollment && (
          <section className="rounded-2xl border border-white/[0.06] bg-[#121519] overflow-hidden">
            <div className="px-4 sm:px-5 py-4 border-b border-white/[0.06] flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white">
                  Payment History
                </h3>

                <p className="text-[10px] text-slate-600 mt-1">
                  Solar Hijri payment coverage
                </p>
              </div>

              <button
                type="button"
                onClick={refreshHistory}
                disabled={loadingHistory}
                className="
                  h-8 w-8 shrink-0 rounded-lg
                  border border-white/[0.06]
                  bg-white/[0.02]
                  grid place-items-center
                  text-slate-600
                  hover:text-white
                "
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${
                    loadingHistory ? "animate-spin" : ""
                  }`}
                />
              </button>
            </div>

            <div className="p-4 sm:p-5">
              {loadingHistory ? (
                <div className="py-14 grid place-items-center">
                  <Loader2 className="h-6 w-6 text-[#f2bd19] animate-spin" />
                </div>
              ) : !history ? (
                <div className="py-12 text-center">
                  <p className="text-xs text-slate-600">
                    Unable to load payment history.
                  </p>
                </div>
              ) : (
                <>
                  {/* STUDENT SUMMARY */}

                  <div className="rounded-xl border border-white/[0.06] bg-[#0d1013] p-4">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-base font-bold text-white truncate">
                          {history.enrollment.student_name}
                        </p>

                        <p className="text-[10px] text-slate-500 mt-1 truncate">
                          Father:{" "}
                          <span className="text-slate-300">
                            {history.enrollment.father_name || "—"}
                          </span>
                        </p>

                        <p className="text-[10px] text-slate-600 mt-1">
                          {history.enrollment.subject_name}
                          {" • "}
                          {formatBooks(selectedEnrollment.books || [])}
                          {" • "}
                          {history.enrollment.teacher_name}
                          {" • "}
                          {formatTime(history.enrollment.start_time)}–
                          {formatTime(history.enrollment.end_time)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const firstPayable = monthCards.find(
                            (month) =>
                              month.status === "partial" ||
                              month.status === "due" ||
                              month.status === "upcoming",
                          );

                          if (firstPayable) {
                            openPayment(firstPayable);
                          } else {
                            toast.error(
                              "There is no month available for payment.",
                            );
                          }
                        }}
                        className="
                          h-10 px-4 rounded-lg
                          bg-[#f2bd19]
                          text-[#0b0d10]
                          text-xs font-bold
                          flex items-center
                          justify-center gap-2
                          hover:bg-[#ffd34d]
                          w-full md:w-auto
                          shrink-0
                        "
                      >
                        <CreditCard className="h-4 w-4" />
                        Record Payment
                      </button>
                    </div>
                  </div>

                  {/* LEGEND */}

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <LegendItem dot="bg-emerald-400" label="Paid" />

                    <LegendItem dot="bg-amber-400" label="Partial" />

                    <LegendItem dot="bg-red-400" label="Payment Due" />

                    <LegendItem dot="bg-blue-400" label="Upcoming" />

                    <LegendItem dot="bg-slate-800" label="Not Started" />
                  </div>

                  {/* 12 MONTHS */}

                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {monthCards.map((month) => (
                      <MonthStatusCard
                        key={`${month.solar_year}-${month.solar_month}`}
                        month={month}
                        status={month.status}
                        selected={
                          paymentMonth &&
                          Number(paymentMonth.solar_month) ===
                            Number(month.solar_month)
                        }
                        onClick={openPayment}
                      />
                    ))}
                  </div>

                  {/* TRANSACTIONS */}

                  <div className="mt-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-3">
                      <p className="text-[9px] uppercase tracking-[0.15em] text-slate-700">
                        Transactions
                      </p>

                      <p className="text-[9px] text-slate-700">
                        {(history.payments || []).length} payments
                      </p>
                    </div>

                    {(history.payments || []).length === 0 ? (
                      <div className="rounded-xl border border-dashed border-white/[0.06] py-8 text-center">
                        <p className="text-xs text-slate-700">
                          No payment transactions yet.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {history.payments.map((payment) => (
                          <div
                            key={payment.payment_id}
                            className="
                              rounded-xl border
                              border-white/[0.05]
                              bg-[#0d1013]
                              px-3 sm:px-4 py-3
                            "
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-white">
                                  {formatMoney(payment.amount)}
                                </p>

                                <p className="text-[9px] text-slate-600 mt-1 truncate">
                                  {payment.receipt_number || "Payment"}
                                </p>
                              </div>

                              <div className="sm:text-right">
                                <p className="text-[10px] text-slate-400">
                                  {payment.payment_solar_date ||
                                    payment.payment_date ||
                                    "—"}
                                </p>

                                <p className="text-[9px] text-slate-700 mt-1">
                                  {payment.covered_days || 0} covered days
                                </p>
                              </div>
                            </div>

                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <TransactionInfo
                                label="Payment Amount"
                                value={formatMoney(payment.amount)}
                              />

                              <TransactionInfo
                                label="Allocated"
                                value={formatMoney(payment.allocated_amount)}
                              />

                              <TransactionInfo
                                label="Covered Days"
                                value={`${Number(
                                  payment.covered_days || 0,
                                )} days`}
                              />
                            </div>

                            {payment.from_solar_date ||
                            payment.to_solar_date ||
                            payment.coverage_from_solar_date ||
                            payment.coverage_to_solar_date ? (
                              <div className="mt-2 rounded-lg border border-white/[0.04] bg-white/[0.015] px-3 py-2">
                                <p className="text-[8px] uppercase tracking-wider text-slate-700">
                                  Coverage
                                </p>

                                <p className="text-[10px] text-slate-400 mt-1">
                                  {payment.from_solar_date ||
                                    payment.coverage_from_solar_date ||
                                    "—"}{" "}
                                  →{" "}
                                  {payment.to_solar_date ||
                                    payment.coverage_to_solar_date ||
                                    "—"}
                                </p>
                              </div>
                            ) : null}

                            {payment.comment ? (
                              <div className="mt-2 rounded-lg border border-[#f2bd19]/10 bg-[#f2bd19]/[0.025] px-3 py-2">
                                <p className="text-[8px] uppercase tracking-wider text-slate-700">
                                  Comment
                                </p>

                                <p className="text-[10px] text-slate-400 mt-1 whitespace-pre-wrap break-words">
                                  {payment.comment}
                                </p>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>
        )}
      </div>

      {/* PAYMENT MODAL */}

      <PaymentModal
        open={paymentModalOpen}
        enrollment={
          history
            ? {
                ...history.enrollment,
                books: selectedEnrollment?.books || [],
                current_solar_date: getTodaySolar().formatted,
              }
            : selectedEnrollment
        }
        month={paymentMonth}
        onClose={() => {
          if (savingPayment) return;

          setPaymentModalOpen(false);
          setPaymentMonth(null);
        }}
        onSubmit={requestPayment}
        saving={savingPayment}
      />

      {/* PASSWORD CONFIRMATION */}

      <div className="fixed inset-0 z-[9999] pointer-events-none">
        <div className="pointer-events-auto">
          <PasswordConfirmModal
            open={passwordConfirmOpen}
            title="Confirm payment"
            description={
              pendingPayment
                ? `Enter your password to record ${formatMoney(
                    pendingPayment.paymentAmount,
                  )} for ${monthName(pendingPayment.solarMonth)}.`
                : "Enter your password to continue."
            }
            confirmLabel="Verify & Record Payment"
            onVerified={confirmPayment}
            onCancel={() => {
              if (savingPayment) return;

              setPasswordConfirmOpen(false);
              setPendingPayment(null);
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   TRANSACTION INFO
============================================================ */

function TransactionInfo({ label, value }) {
  return (
    <div className="rounded-lg border border-white/[0.04] bg-white/[0.015] p-2.5">
      <p className="text-[8px] uppercase tracking-wider text-slate-700">
        {label}
      </p>

      <p className="text-[10px] text-slate-400 mt-1">{value || "—"}</p>
    </div>
  );
}

/* ============================================================
   FILTER SELECT
============================================================ */

function FilterSelect({ label, value, onChange, options }) {
  return (
    <div>
      <label className="text-[9px] uppercase tracking-[0.14em] text-slate-700">
        {label}
      </label>

      <div className="relative mt-1">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="
            h-10 w-full appearance-none
            rounded-lg
            border border-white/[0.07]
            bg-[#0d1013]
            px-3 pr-8
            text-[11px] text-slate-300
            outline-none
            focus:border-[#f2bd19]/50
          "
        >
          <option value="all">All {label.toLowerCase()}s</option>

          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-700" />
      </div>
    </div>
  );
}

/* ============================================================
   LEGEND
============================================================ */

function LegendItem({ dot, label }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />

      <span className="text-[9px] text-slate-600">{label}</span>
    </div>
  );
}
