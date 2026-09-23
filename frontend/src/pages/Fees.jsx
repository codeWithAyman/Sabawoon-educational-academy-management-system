import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import PasswordConfirmModal from "../components/PasswordConfirmModal";
import { useToast } from "../components/Toast";

import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CreditCard,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
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

function roundMoney(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.round(number / 10) * 10;
}

function isMultipleOfTen(value) {
  const number = Number(value);

  return (
    Number.isFinite(number) &&
    number > 0 &&
    Number.isInteger(number) &&
    number % 10 === 0
  );
}

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

function normalizeSolarDate(value) {
  const parsed = parseSolarDate(value);

  if (!parsed) return null;

  return formatSolarDate(parsed.year, parsed.month, parsed.day);
}

function formatPaymentFor(payment) {
  if (!payment) return "—";

  if (Array.isArray(payment.payment_for_months)) {
    const months = payment.payment_for_months
      .map((value) => String(value).trim())
      .filter(Boolean)
      .map((value) => {
        const match = value.match(/^(\d{4})[/-](\d{1,2})$/);

        if (!match) return value;

        return `${match[1]}/${Number(match[2])}`;
      });

    if (months.length > 0) {
      return [...new Set(months)].join(", ");
    }
  }

  if (payment.payment_for) {
    const value = String(payment.payment_for).trim();

    if (/^\d{4}[/-]\d{1,2}$/.test(value)) {
      const [year, month] = value.split(/[/-]/);

      return `${year}/${Number(month)}`;
    }

    return value;
  }

  if (payment.payment_for_solar_year && payment.payment_for_solar_month) {
    return `${Number(payment.payment_for_solar_year)}/${Number(
      payment.payment_for_solar_month,
    )}`;
  }

  if (payment.solar_year && payment.solar_month) {
    return `${Number(payment.solar_year)}/${Number(payment.solar_month)}`;
  }

  if (payment.payment_solar_year && payment.payment_solar_month) {
    return `${Number(payment.payment_solar_year)}/${Number(
      payment.payment_solar_month,
    )}`;
  }

  return "—";
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

      for (let offset = 0; offset <= 2; offset += 1) {
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
    const calculated = Number(
      paidMonth.calculated_amount || paidMonth.monthly_amount || 0,
    );

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
   PAYMENT STATUS
============================================================ */

function PaymentStatusBadge({ status, loading = false }) {
  const styles = {
    paid: {
      dot: "bg-emerald-400",
      text: "text-emerald-300",
      bg: "bg-emerald-400/[0.07]",
      border: "border-emerald-400/15",
      label: "Paid",
    },

    partial: {
      dot: "bg-amber-400",
      text: "text-amber-300",
      bg: "bg-amber-400/[0.07]",
      border: "border-amber-400/15",
      label: "Partial",
    },

    due: {
      dot: "bg-red-400",
      text: "text-red-300",
      bg: "bg-red-400/[0.07]",
      border: "border-red-400/15",
      label: "Due",
    },

    upcoming: {
      dot: "bg-blue-400",
      text: "text-blue-300",
      bg: "bg-blue-400/[0.06]",
      border: "border-blue-400/15",
      label: "Upcoming",
    },

    not_started: {
      dot: "bg-slate-700",
      text: "text-slate-600",
      bg: "bg-white/[0.01]",
      border: "border-white/[0.04]",
      label: "Not started",
    },

    unknown: {
      dot: "bg-slate-600",
      text: "text-slate-500",
      bg: "bg-white/[0.01]",
      border: "border-white/[0.04]",
      label: "—",
    },
  };

  const style = styles[status] || styles.unknown;

  return (
    <span
      className={`
        inline-flex items-center gap-1.5
        rounded-full border
        px-2 py-1
        text-[9px] font-semibold
        ${style.text}
        ${style.bg}
        ${style.border}
      `}
    >
      {loading ? (
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
      ) : (
        <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      )}

      {loading ? "Loading" : style.label}
    </span>
  );
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

  const monthlyFee = roundMoney(month.monthly_amount);
  const paid = roundMoney(month.paid_amount);
  const owing = Math.max(monthlyFee - paid, 0);

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => clickable && onClick(month)}
      className={`
        group relative min-h-[118px] w-full rounded-xl border p-3
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

      <div className="mt-3 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[8px] text-slate-600">Monthly</span>

          <span className="text-[9px] font-semibold text-slate-300">
            {monthlyFee > 0 ? formatMoney(monthlyFee) : "—"}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-[8px] text-slate-600">Paid</span>

          <span className="text-[9px] font-semibold text-slate-300">
            {paid > 0 ? formatMoney(paid) : "AFN 0"}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-[8px] text-slate-600">Owing</span>

          <span
            className={`text-[9px] font-bold ${
              owing > 0 ? "text-red-300" : "text-emerald-300"
            }`}
          >
            {monthlyFee > 0 ? formatMoney(owing) : "—"}
          </span>
        </div>
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
  const [paymentSolarDate, setPaymentSolarDate] = useState("");
  const [comment, setComment] = useState("");

  const todaySolar = useMemo(() => getTodaySolar(), []);

  useEffect(() => {
    if (!open) return;

    const existingMonthly = Number(
      month?.monthly_amount || month?.calculated_amount || 0,
    );

    setMonthlyAmount(existingMonthly > 0 ? String(existingMonthly) : "");

    setPaymentAmount("");

    setPaymentSolarDate(todaySolar.formatted);

    setComment("");
  }, [open, month, todaySolar.formatted]);

  if (!open || !enrollment || !month) {
    return null;
  }

  const feeAmount = roundMoney(monthlyAmount);
  const amount = roundMoney(paymentAmount);

  const existingPaid = roundMoney(month.paid_amount);

  const existingCalculated = roundMoney(
    month.calculated_amount || month.monthly_amount || feeAmount,
  );

  const existingDue = Math.max(existingCalculated - existingPaid, 0);

  const suggestedFullPayment = existingDue > 0 ? existingDue : feeAmount;

  const isPartial =
    amount > 0 && suggestedFullPayment > 0 && amount < suggestedFullPayment;

  const validDate = Boolean(parseSolarDate(paymentSolarDate));

  const validAmount =
    isMultipleOfTen(amount) && amount <= suggestedFullPayment && amount > 0;

  const valid = feeAmount > 0 && validAmount && validDate;

  function submit(e) {
    e.preventDefault();

    if (!valid || saving) return;

    onSubmit({
      solarYear: Number(month.solar_year),
      solarMonth: Number(month.solar_month),
      monthlyAmount: feeAmount,
      paymentAmount: amount,
      paymentSolarDate: normalizeSolarDate(paymentSolarDate),
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
        <div
          className="
            shrink-0 flex items-start justify-between gap-3
            px-4 sm:px-5 py-4
            border-b border-white/[0.06]
          "
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <div
                className="
                  h-8 w-8 shrink-0 rounded-lg
                  bg-[#f2bd19]/10
                  border border-[#f2bd19]/20
                  grid place-items-center
                "
              >
                <CreditCard className="h-4 w-4 text-[#f2bd19]" />
              </div>

              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white">Record Payment</h3>

                <p className="text-[10px] text-slate-600 mt-0.5">
                  Record the exact money received for this month.
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

        <form onSubmit={submit} className="min-h-0 flex flex-col">
          <div className="flex-1 overflow-y-auto overscroll-contain">
            <div className="p-4 sm:p-5 space-y-4">
              <div
                className="
                  rounded-xl
                  border border-white/[0.06]
                  bg-[#0d1013]
                  p-3.5 sm:p-4
                "
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="
                      h-10 w-10 shrink-0 rounded-xl
                      bg-white/[0.04]
                      border border-white/[0.06]
                      grid place-items-center
                    "
                  >
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
                    value={`${formatTime(enrollment.start_time)}–${formatTime(
                      enrollment.end_time,
                    )}`}
                  />
                </div>
              </div>

              <div
                className="
                  rounded-xl
                  border border-[#f2bd19]/15
                  bg-[#f2bd19]/[0.04]
                  p-3.5 sm:p-4
                "
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[8px] uppercase tracking-[0.15em] text-[#f2bd19]/60">
                      Payment For
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

                <div className="mt-3 pt-3 border-t border-white/[0.05]">
                  <p className="text-[8px] text-slate-600">
                    This is the month the money is being applied to. It is
                    separate from the date the money was actually received.
                  </p>
                </div>
              </div>

              <div>
                <label className="text-[9px] uppercase tracking-[0.14em] text-slate-600">
                  Payment Date
                </label>

                <div className="mt-1 relative">
                  <CalendarDays
                    className="
                      absolute left-3 top-1/2
                      -translate-y-1/2
                      h-4 w-4
                      text-[#f2bd19]/70
                      pointer-events-none
                    "
                  />

                  <input
                    type="text"
                    value={paymentSolarDate}
                    onChange={(e) => setPaymentSolarDate(e.target.value)}
                    placeholder="1405/06/26"
                    inputMode="numeric"
                    maxLength={10}
                    className={`
                      h-11 w-full rounded-lg
                      border
                      bg-[#0d1013]
                      pl-10 pr-3
                      text-sm text-white
                      outline-none
                      ${validDate ? "border-white/[0.07]" : "border-red-400/30"}
                      focus:border-[#f2bd19]/50
                    `}
                  />
                </div>

                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-[8px] text-slate-700">
                    Afghanistan Solar Hijri date
                  </p>

                  <button
                    type="button"
                    onClick={() => setPaymentSolarDate(todaySolar.formatted)}
                    className="
                      text-[8px]
                      text-[#f2bd19]
                      hover:text-[#ffd34d]
                    "
                  >
                    Use today ({todaySolar.formatted})
                  </button>
                </div>

                {!validDate && paymentSolarDate && (
                  <p className="text-[8px] text-red-300 mt-1">
                    Enter the date as YYYY/MM/DD.
                  </p>
                )}
              </div>

              <div>
                <label className="text-[9px] uppercase tracking-[0.14em] text-slate-600">
                  Full Monthly Fee
                </label>

                <div className="mt-1 relative">
                  <span
                    className="
                      absolute left-3 top-1/2
                      -translate-y-1/2
                      text-slate-500
                      text-[10px] font-semibold
                    "
                  >
                    AFN
                  </span>

                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={monthlyAmount}
                    onChange={(e) => setMonthlyAmount(e.target.value)}
                    placeholder="Enter full monthly fee"
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

                <p className="text-[8px] text-slate-700 mt-1">
                  The monthly fee is the full amount. It is not prorated by
                  days.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <BalanceBox
                  label="Full Monthly Fee"
                  value={formatMoney(existingCalculated || feeAmount)}
                />

                <BalanceBox
                  label="Already Paid"
                  value={formatMoney(existingPaid)}
                />

                <BalanceBox
                  label="Currently Owing"
                  value={formatMoney(existingDue)}
                  danger={existingDue > 0}
                />
              </div>

              <div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
                  <label className="text-[9px] uppercase tracking-[0.14em] text-slate-600">
                    Payment Amount
                  </label>

                  {suggestedFullPayment > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setPaymentAmount(String(suggestedFullPayment))
                      }
                      className="
                        text-left sm:text-right
                        text-[9px]
                        text-[#f2bd19]
                        hover:text-[#ffd34d]
                      "
                    >
                      Pay remaining {formatMoney(suggestedFullPayment)}
                    </button>
                  )}
                </div>

                <div className="mt-1 relative">
                  <span
                    className="
                      absolute left-3 top-1/2
                      -translate-y-1/2
                      text-slate-500
                      text-[10px] font-semibold
                    "
                  >
                    AFN
                  </span>

                  <input
                    type="number"
                    min="10"
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

                {paymentAmount && !isMultipleOfTen(Number(paymentAmount)) && (
                  <p className="text-[9px] text-red-300 mt-2">
                    Payment amounts must be positive multiples of AFN 10.
                  </p>
                )}

                {existingPaid > 0 && (
                  <p className="text-[9px] text-amber-400 mt-2 leading-relaxed">
                    Already paid: {formatMoney(existingPaid)}
                    {" • "}
                    Owing: {formatMoney(existingDue)}
                  </p>
                )}
              </div>

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

              {isPartial && (
                <div
                  className="
                    rounded-lg
                    border border-amber-400/15
                    bg-amber-400/[0.04]
                    p-3 flex gap-2
                  "
                >
                  <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />

                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold text-amber-300">
                      Partial payment
                    </p>

                    <p className="text-[9px] text-slate-600 mt-0.5 leading-relaxed">
                      The money received will be applied to this month. The
                      remaining balance stays due.
                    </p>
                  </div>
                </div>
              )}

              {amount > 0 &&
                suggestedFullPayment > 0 &&
                amount === suggestedFullPayment && (
                  <div
                    className="
                      rounded-lg
                      border border-emerald-400/15
                      bg-emerald-400/[0.04]
                      p-3 flex gap-2
                    "
                  >
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

          <div
            className="
              shrink-0
              px-4 sm:px-5 py-3 sm:py-4
              border-t border-white/[0.06]
              flex flex-col-reverse sm:flex-row
              sm:justify-end gap-2
              bg-[#121519]
            "
          >
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
   EDIT PAYMENT MODAL
============================================================ */

function EditPaymentModal({ open, payment, onClose, onSubmit, saving }) {
  const [amount, setAmount] = useState("");
  const [paymentSolarDate, setPaymentSolarDate] = useState("");
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (!open || !payment) return;

    setAmount(payment.amount ? String(Number(payment.amount)) : "");

    setPaymentSolarDate(
      normalizeSolarDate(payment.payment_solar_date || payment.payment_date) ||
        getTodaySolar().formatted,
    );

    setComment(payment.comment || "");
  }, [open, payment]);

  if (!open || !payment) {
    return null;
  }

  const numericAmount = roundMoney(amount);

  const valid =
    isMultipleOfTen(numericAmount) && Boolean(parseSolarDate(paymentSolarDate));

  function submit(e) {
    e.preventDefault();

    if (!valid || saving) return;

    onSubmit({
      paymentId: payment.payment_id,
      amount: numericAmount,
      paymentSolarDate: normalizeSolarDate(paymentSolarDate),
      comment: comment.trim(),
    });
  }

  return (
    <div
      className="
        fixed inset-0 z-[8500]
        bg-black/75 backdrop-blur-sm
        flex items-start sm:items-center justify-center
        p-2 sm:p-4
        overflow-y-auto
      "
    >
      <div
        className="
          w-full max-w-md
          rounded-2xl
          border border-white/10
          bg-[#121519]
          shadow-[0_25px_100px_rgba(0,0,0,0.65)]
          overflow-hidden
          my-auto
        "
      >
        <div
          className="
            px-4 sm:px-5 py-4
            border-b border-white/[0.06]
            flex items-start justify-between gap-3
          "
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="
                h-8 w-8 shrink-0 rounded-lg
                bg-[#f2bd19]/10
                border border-[#f2bd19]/20
                grid place-items-center
              "
            >
              <Pencil className="h-4 w-4 text-[#f2bd19]" />
            </div>

            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white">Edit Transaction</h3>

              <p className="text-[10px] text-slate-600 mt-0.5 truncate">
                {payment.receipt_number || "Payment"}
              </p>
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

        <form onSubmit={submit}>
          <div className="p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <TransactionInfo
                label="Receipt"
                value={payment.receipt_number || "—"}
              />

              <TransactionInfo
                label="Payment For"
                value={formatPaymentFor(payment)}
              />

              <TransactionInfo
                label="Recorded By"
                value={
                  payment.recorded_by_name
                    ? `${payment.recorded_by_name}${
                        payment.recorded_by_role
                          ? ` (${payment.recorded_by_role})`
                          : ""
                      }`
                    : "—"
                }
              />

              <TransactionInfo
                label="Current Amount"
                value={formatMoney(payment.amount)}
              />
            </div>

            <div>
              <label className="text-[9px] uppercase tracking-[0.14em] text-slate-600">
                Payment Date
              </label>

              <div className="mt-1 relative">
                <CalendarDays
                  className="
                    absolute left-3 top-1/2
                    -translate-y-1/2
                    h-4 w-4
                    text-[#f2bd19]/70
                    pointer-events-none
                  "
                />

                <input
                  type="text"
                  value={paymentSolarDate}
                  onChange={(e) => setPaymentSolarDate(e.target.value)}
                  placeholder="1405/06/26"
                  inputMode="numeric"
                  maxLength={10}
                  className="
                    h-11 w-full rounded-lg
                    border border-white/[0.07]
                    bg-[#0d1013]
                    pl-10 pr-3
                    text-sm text-white
                    outline-none
                    focus:border-[#f2bd19]/50
                  "
                />
              </div>

              <p className="text-[8px] text-slate-700 mt-1">
                Solar Hijri date when the payment was received.
              </p>
            </div>

            <div>
              <label className="text-[9px] uppercase tracking-[0.14em] text-slate-600">
                Payment Amount
              </label>

              <div className="mt-1 relative">
                <span
                  className="
                    absolute left-3 top-1/2
                    -translate-y-1/2
                    text-slate-500
                    text-[10px] font-semibold
                  "
                >
                  AFN
                </span>

                <input
                  type="number"
                  min="10"
                  step="10"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
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

              {amount && !isMultipleOfTen(Number(amount)) && (
                <p className="text-[9px] text-red-300 mt-1">
                  Payment amounts must be positive multiples of AFN 10.
                </p>
              )}
            </div>

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
            </div>

            <div
              className="
                rounded-lg
                border border-amber-400/15
                bg-amber-400/[0.035]
                p-3
              "
            >
              <p className="text-[9px] text-amber-300 font-semibold">
                Sensitive transaction
              </p>

              <p className="text-[9px] text-slate-600 mt-1 leading-relaxed">
                Editing this payment will rebuild its monthly money allocation
                and will be recorded in the transaction audit history.
              </p>
            </div>
          </div>

          <div
            className="
              px-4 sm:px-5 py-3 sm:py-4
              border-t border-white/[0.06]
              flex flex-col-reverse sm:flex-row
              sm:justify-end gap-2
            "
          >
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
                  Saving...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Save Changes
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
   BALANCE BOX
============================================================ */

function BalanceBox({ label, value, danger = false }) {
  return (
    <div
      className="
        rounded-lg
        border border-white/[0.05]
        bg-[#0d1013]
        p-3
      "
    >
      <p className="text-[8px] uppercase tracking-wider text-slate-700">
        {label}
      </p>

      <p
        className={`
          text-[11px]
          font-bold
          mt-1
          ${danger ? "text-red-300" : "text-slate-300"}
        `}
      >
        {value}
      </p>
    </div>
  );
}

/* ============================================================
   INFO BOX
============================================================ */

function InfoBox({ label, value }) {
  return (
    <div
      className="
        min-w-0 rounded-lg
        border border-white/[0.05]
        bg-white/[0.02]
        p-2.5
      "
    >
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
   TRANSACTION INFO
============================================================ */

function TransactionInfo({ label, value, danger = false }) {
  return (
    <div
      className="
        rounded-lg
        border border-white/[0.04]
        bg-white/[0.015]
        p-2.5
      "
    >
      <p className="text-[8px] uppercase tracking-wider text-slate-700">
        {label}
      </p>

      <p
        className={`
          text-[10px] mt-1
          ${danger ? "text-red-300 font-semibold" : "text-slate-400"}
        `}
      >
        {value || "—"}
      </p>
    </div>
  );
}

/* ============================================================
   STUDENT PAYMENT STATUS
============================================================ */

function StudentPaymentStatus({
  status,
  loading,
  monthLabel,
  monthlyFee,
  paid,
  owing,
}) {
  return (
    <div className="min-w-[220px]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[8px] uppercase tracking-[0.13em] text-slate-700">
          {monthLabel}
        </span>

        <PaymentStatusBadge status={status} loading={loading} />
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <div>
          <p className="text-[7px] uppercase tracking-wider text-slate-700">
            Full
          </p>

          <p className="text-[9px] font-semibold text-slate-400 mt-0.5">
            {monthlyFee > 0 ? formatMoney(monthlyFee) : "—"}
          </p>
        </div>

        <div>
          <p className="text-[7px] uppercase tracking-wider text-slate-700">
            Paid
          </p>

          <p className="text-[9px] font-semibold text-slate-400 mt-0.5">
            {formatMoney(paid || 0)}
          </p>
        </div>

        <div>
          <p className="text-[7px] uppercase tracking-wider text-slate-700">
            Owing
          </p>

          <p
            className={`
              text-[9px]
              font-semibold
              mt-0.5
              ${Number(owing || 0) > 0 ? "text-red-300" : "text-emerald-300"}
            `}
          >
            {monthlyFee > 0 ? formatMoney(owing || 0) : "—"}
          </p>
        </div>
      </div>
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

        <ChevronDown
          className="
            pointer-events-none
            absolute right-3 top-1/2
            -translate-y-1/2
            h-3.5 w-3.5
            text-slate-700
          "
        />
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

  const [studentSearch, setStudentSearch] = useState("");

  const [studentPaymentStatuses, setStudentPaymentStatuses] = useState({});

  const [loadingStudentStatuses, setLoadingStudentStatuses] = useState(false);

  const [studentStatusRefreshKey, setStudentStatusRefreshKey] = useState(0);

  const [loading, setLoading] = useState(true);

  const [loadingHistory, setLoadingHistory] = useState(false);

  const [savingPayment, setSavingPayment] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  const [subjectFilter, setSubjectFilter] = useState("all");

  const [teacherFilter, setTeacherFilter] = useState("all");

  const [timeFilter, setTimeFilter] = useState("all");

  const [search, setSearch] = useState("");

  /* ==========================================================
     CLASS PAGINATION
  ========================================================== */

  const classesPerPage = 10;

  const [classPage, setClassPage] = useState(1);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  const [paymentMonth, setPaymentMonth] = useState(null);

  const [passwordConfirmOpen, setPasswordConfirmOpen] = useState(false);

  const [pendingPayment, setPendingPayment] = useState(null);

  const [editingPayment, setEditingPayment] = useState(null);

  const [editPaymentModalOpen, setEditPaymentModalOpen] = useState(false);

  const [pendingEdit, setPendingEdit] = useState(null);

  const [deletePaymentTarget, setDeletePaymentTarget] = useState(null);

  const [deletePasswordConfirmOpen, setDeletePasswordConfirmOpen] =
    useState(false);

  const [savingTransaction, setSavingTransaction] = useState(false);

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
     CLASS PAGINATION
  ========================================================== */

  const totalClassPages = Math.max(
    1,
    Math.ceil(filteredClasses.length / classesPerPage),
  );

  const paginatedClasses = useMemo(() => {
    const start = (classPage - 1) * classesPerPage;

    return filteredClasses.slice(start, start + classesPerPage);
  }, [filteredClasses, classPage]);

  useEffect(() => {
    setClassPage(1);
  }, [subjectFilter, teacherFilter, timeFilter, search]);

  useEffect(() => {
    if (classPage > totalClassPages) {
      setClassPage(totalClassPages);
    }
  }, [classPage, totalClassPages]);

  /* ==========================================================
     CLASS NAVIGATION
  ========================================================== */

  function openClass(classId) {
    const key = String(classId);

    setSelectedClassId(key);
    setSelectedEnrollment(null);
    setHistory(null);
    setStudentSearch("");
  }

  function backToClasses() {
    setSelectedClassId("");
    setSelectedEnrollment(null);
    setHistory(null);
    setStudentSearch("");
  }

  const selectedClass = useMemo(
    () =>
      activeClasses.find(
        (item) => String(item.id) === String(selectedClassId),
      ) || null,
    [activeClasses, selectedClassId],
  );

  /* ==========================================================
     CLASS STUDENTS
  ========================================================== */

  const allClassStudents = useMemo(() => {
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

  const classStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();

    if (!q) return allClassStudents;

    return allClassStudents.filter((student) => {
      const haystack = [
        student.student_name,
        student.student_id,
        student.father_name,
        student.roll_number,
        student.phone,
      ]
        .filter((value) => value !== null && value !== undefined)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [allClassStudents, studentSearch]);

  const classStudentIds = useMemo(
    () => allClassStudents.map((student) => student.enrollment_id).join(","),
    [allClassStudents],
  );

  const currentSolar = getTodaySolar();

  /* ==========================================================
     LOAD CURRENT MONTH STATUS
  ========================================================== */

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentMonthStatuses() {
      if (!selectedClassId || allClassStudents.length === 0) {
        setStudentPaymentStatuses({});
        setLoadingStudentStatuses(false);
        return;
      }

      setLoadingStudentStatuses(true);

      const today = getTodaySolar();

      try {
        const results = await Promise.all(
          allClassStudents.map(async (student) => {
            try {
              const { data } = await api.get(
                `/fees/enrollments/${student.enrollment_id}/history`,
              );

              const enrolledSolar =
                parseSolarDate(data?.enrollment?.enrolled_on_solar) ||
                parseSolarDate(data?.enrollment?.enrolled_on);

              const paidMonth = (data?.months || []).find(
                (month) =>
                  Number(month.solar_year) === today.year &&
                  Number(month.solar_month) === today.month,
              );

              const status = statusForMonth({
                year: today.year,
                month: today.month,
                currentYear: today.year,
                currentMonth: today.month,
                paidMonth,
                enrolledSolar,
              });

              const monthlyFee = roundMoney(
                paidMonth?.monthly_amount || paidMonth?.calculated_amount || 0,
              );

              const paid = roundMoney(paidMonth?.paid_amount || 0);

              const owing = Math.max(monthlyFee - paid, 0);

              return [
                student.enrollment_id,
                {
                  status,
                  month: paidMonth || null,
                  monthlyFee,
                  paid,
                  owing,
                },
              ];
            } catch {
              return [
                student.enrollment_id,
                {
                  status: "unknown",
                  month: null,
                  monthlyFee: 0,
                  paid: 0,
                  owing: 0,
                },
              ];
            }
          }),
        );

        if (!cancelled) {
          setStudentPaymentStatuses(Object.fromEntries(results));
        }
      } finally {
        if (!cancelled) {
          setLoadingStudentStatuses(false);
        }
      }
    }

    loadCurrentMonthStatuses();

    return () => {
      cancelled = true;
    };
  }, [selectedClassId, classStudentIds, studentStatusRefreshKey]);

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

        /*
         * Payment allocation is now money-based.
         * Attendance/covered days are deliberately not used
         * to calculate financial balances.
         */
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

    if (!payable) return;

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

  async function confirmPayment(verification) {
    if (!selectedEnrollment || !pendingPayment) {
      return;
    }

    const {
      solarYear,
      solarMonth,
      monthlyAmount,
      paymentAmount,
      paymentSolarDate,
      comment,
    } = pendingPayment;

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

      if (!isMultipleOfTen(paymentAmount)) {
        throw new Error(
          "Payment amount must be a positive multiple of AFN 10.",
        );
      }

      const normalizedPaymentDate = normalizeSolarDate(paymentSolarDate);

      if (!normalizedPaymentDate) {
        throw new Error("A valid Solar payment date is required.");
      }

      /*
       * No fee exists for this month yet.
       *
       * Creating the fee period with one complete month
       * creates the full monthly obligation. The initial payment
       * is then allocated by exact money amount on the backend.
       */
      if (!selectedMonth.fee_id) {
        const monthDays =
          selectedMonth.month_days || getSolarMonthDays(solarYear, solarMonth);

        const fromSolarDate = formatSolarDate(solarYear, solarMonth, 1);

        const toSolarDate = formatSolarDate(solarYear, solarMonth, monthDays);

        await api.post("/fees", {
          verification_token: verification?.verification_token,

          student_id: selectedEnrollment.student_id,

          enrollment_id: selectedEnrollment.enrollment_id,

          from_solar_date: fromSolarDate,

          to_solar_date: toSolarDate,

          monthly_amounts: [
            {
              solar_year: solarYear,
              solar_month: solarMonth,
              monthly_amount: roundMoney(monthlyAmount),
            },
          ],

          initial_paid_amount: roundMoney(paymentAmount),

          /*
           * This is the actual date money was received.
           * It is NOT the month being paid for.
           */
          initial_payment_solar_date: normalizedPaymentDate,

          initial_payment_comment: comment || null,

          academic_year: null,
          description: null,
        });
      } else {
        /*
         * Existing fee period.
         *
         * The backend determines the exact monthly allocation
         * from the amount. No covered-days or date-range
         * information is sent because attendance is separate.
         */
        await api.post(`/fees/${selectedMonth.fee_id}/payment`, {
          verification_token: verification?.verification_token,

          amount: roundMoney(paymentAmount),

          payment_solar_date: normalizedPaymentDate,

          comment: comment || null,
        });
      }

      toast.success("Payment recorded successfully");

      setPasswordConfirmOpen(false);
      setPaymentModalOpen(false);
      setPendingPayment(null);
      setPaymentMonth(null);

      await loadData(false);

      setStudentStatusRefreshKey((value) => value + 1);

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
     EDIT TRANSACTION
  ========================================================== */

  function requestEditPayment(payment) {
    setEditingPayment(payment);
    setEditPaymentModalOpen(true);
  }

  function submitEditPayment(payment) {
    setPendingEdit(payment);
    setEditPaymentModalOpen(false);
    setPasswordConfirmOpen(true);
  }

  async function confirmEditPayment(verification) {
    if (!pendingEdit) return;

    setSavingTransaction(true);

    try {
      await api.put(`/fees/payments/${pendingEdit.paymentId}`, {
        verification_token: verification?.verification_token,

        amount: roundMoney(pendingEdit.amount),

        payment_solar_date: normalizeSolarDate(pendingEdit.paymentSolarDate),

        comment: pendingEdit.comment || null,
      });

      toast.success("Transaction updated successfully");

      setPasswordConfirmOpen(false);
      setPendingEdit(null);
      setEditingPayment(null);

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

      setStudentStatusRefreshKey((value) => value + 1);
    } catch (error) {
      toast.error(
        error.response?.data?.error ||
          error.message ||
          "Failed to update transaction",
      );
    } finally {
      setSavingTransaction(false);
    }
  }

  /* ==========================================================
     DELETE TRANSACTION
  ========================================================== */

  function requestDeletePayment(payment) {
    setDeletePaymentTarget(payment);
    setDeletePasswordConfirmOpen(true);
  }

  async function confirmDeletePayment(verification) {
    if (!deletePaymentTarget) return;

    setSavingTransaction(true);

    try {
      await api.delete(`/fees/payments/${deletePaymentTarget.payment_id}`, {
        data: {
          verification_token: verification?.verification_token,
        },
      });

      toast.success("Transaction deleted successfully");

      setDeletePasswordConfirmOpen(false);
      setDeletePaymentTarget(null);

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

      setStudentStatusRefreshKey((value) => value + 1);
    } catch (error) {
      toast.error(
        error.response?.data?.error ||
          error.message ||
          "Failed to delete transaction",
      );
    } finally {
      setSavingTransaction(false);
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
     PAGINATION BUTTONS
  ========================================================== */

  function renderPagination() {
    if (totalClassPages <= 1) {
      return null;
    }

    const pages = [];

    for (let page = 1; page <= totalClassPages; page += 1) {
      pages.push(page);
    }

    return (
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
        <p className="text-[9px] text-slate-700">
          Page <span className="text-slate-400 font-semibold">{classPage}</span>{" "}
          of{" "}
          <span className="text-slate-400 font-semibold">
            {totalClassPages}
          </span>
        </p>

        <div className="flex items-center justify-center sm:justify-end gap-1.5 flex-wrap">
          <button
            type="button"
            disabled={classPage === 1}
            onClick={() => setClassPage((page) => Math.max(1, page - 1))}
            className="
              h-8 px-2.5 rounded-lg
              border border-white/[0.07]
              bg-white/[0.02]
              text-[9px] text-slate-600
              hover:text-white hover:bg-white/[0.04]
              disabled:opacity-30 disabled:cursor-not-allowed
              transition
            "
          >
            Previous
          </button>

          {pages.map((page) => (
            <button
              type="button"
              key={page}
              onClick={() => setClassPage(page)}
              className={`
                h-8 min-w-8 px-2 rounded-lg
                border
                text-[9px] font-semibold
                transition
                ${
                  page === classPage
                    ? "border-[#f2bd19]/30 bg-[#f2bd19]/10 text-[#f2bd19]"
                    : "border-white/[0.07] bg-white/[0.02] text-slate-600 hover:text-white hover:bg-white/[0.04]"
                }
              `}
            >
              {page}
            </button>
          ))}

          <button
            type="button"
            disabled={classPage === totalClassPages}
            onClick={() =>
              setClassPage((page) => Math.min(totalClassPages, page + 1))
            }
            className="
              h-8 px-2.5 rounded-lg
              border border-white/[0.07]
              bg-white/[0.02]
              text-[9px] text-slate-600
              hover:text-white hover:bg-white/[0.04]
              disabled:opacity-30 disabled:cursor-not-allowed
              transition
            "
          >
            Next
          </button>
        </div>
      </div>
    );
  }

  /* ============================================================
     RENDER
  ============================================================ */

  return (
    <div className="min-h-full bg-[#0b0d10] text-slate-100 p-3 sm:p-5 lg:p-6">
      <div className="max-w-[1600px] mx-auto space-y-4 sm:space-y-5">
        {/* ==================================================
            HEADER
        ================================================== */}

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div
                className="
                  h-10 w-10 shrink-0 rounded-xl
                  bg-[#f2bd19]/10
                  border border-[#f2bd19]/20
                  grid place-items-center
                "
              >
                <Wallet className="h-5 w-5 text-[#f2bd19]" />
              </div>

              <div className="min-w-0">
                <h2 className="text-xl font-bold tracking-tight text-white">
                  Fees & Payments
                </h2>

                <p className="text-xs text-slate-500 mt-0.5">Live records</p>
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

        {/* ==================================================
            CLASS LIST / CLASS DETAILS
        ================================================== */}

        {!selectedClass ? (
          <section
            className="
              rounded-2xl
              border border-white/[0.06]
              bg-[#121519]
              overflow-hidden
            "
          >
            <div
              className="
                px-4 sm:px-5 py-4
                border-b border-white/[0.06]
              "
            >
              <div className="flex items-start gap-3">
                <span
                  className="
                    h-7 w-7 shrink-0 rounded-lg
                    bg-[#f2bd19]/10
                    text-[#f2bd19]
                    grid place-items-center
                    text-[10px] font-bold
                  "
                >
                  01
                </span>

                <div>
                  <h3 className="text-sm font-bold text-white">Classes</h3>

                  <p className="text-[10px] text-slate-600 mt-1">
                    Select a class to view its payment records and enrolled
                    students.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
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
                    <Search
                      className="
                        absolute left-3 top-1/2
                        -translate-y-1/2
                        h-3.5 w-3.5
                        text-slate-700
                      "
                    />

                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Subject, teacher or level"
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
                    {filteredClasses.length === 0
                      ? 0
                      : (classPage - 1) * classesPerPage + 1}
                    {filteredClasses.length > 0 && (
                      <>
                        {"–"}
                        {Math.min(
                          classPage * classesPerPage,
                          filteredClasses.length,
                        )}
                      </>
                    )}
                  </span>{" "}
                  of{" "}
                  <span className="text-slate-400 font-semibold">
                    {filteredClasses.length}
                  </span>
                </p>

                <p className="text-[10px] text-slate-700">
                  {activeClasses.length} active classes
                </p>
              </div>

              {loading ? (
                <div className="py-16 grid place-items-center">
                  <Loader2 className="h-6 w-6 text-[#f2bd19] animate-spin" />
                </div>
              ) : filteredClasses.length === 0 ? (
                <div
                  className="
                    rounded-xl
                    border border-dashed
                    border-white/[0.07]
                    py-12 text-center
                  "
                >
                  <p className="text-xs text-slate-500">
                    No matching classes found.
                  </p>
                </div>
              ) : (
                <>
                  <div className="overflow-hidden rounded-xl border border-white/[0.05]">
                    <div
                      className="
                        hidden lg:grid
                        grid-cols-[28px_minmax(180px,1.5fr)_minmax(150px,1fr)_minmax(120px,1fr)_120px_100px_90px]
                        gap-3
                        px-4 py-2.5
                        bg-white/[0.015]
                        border-b border-white/[0.05]
                      "
                    >
                      <span />

                      <span className="text-[8px] uppercase tracking-[0.14em] text-slate-700">
                        Class
                      </span>

                      <span className="text-[8px] uppercase tracking-[0.14em] text-slate-700">
                        Teacher
                      </span>

                      <span className="text-[8px] uppercase tracking-[0.14em] text-slate-700">
                        Level / Book
                      </span>

                      <span className="text-[8px] uppercase tracking-[0.14em] text-slate-700">
                        Time
                      </span>

                      <span className="text-[8px] uppercase tracking-[0.14em] text-slate-700">
                        Students
                      </span>

                      <span className="text-[8px] uppercase tracking-[0.14em] text-slate-700 text-right">
                        Status
                      </span>
                    </div>

                    <div className="divide-y divide-white/[0.045]">
                      {paginatedClasses.map((item) => (
                        <div key={item.id} className="bg-[#0d1013]">
                          <button
                            type="button"
                            onClick={() => openClass(item.id)}
                            className="
                                w-full text-left
                                px-3 sm:px-4 py-3
                                transition-colors
                                hover:bg-white/[0.02]
                              "
                          >
                            <div
                              className="
                                  hidden lg:grid
                                  grid-cols-[28px_minmax(180px,1.5fr)_minmax(150px,1fr)_minmax(120px,1fr)_120px_100px_90px]
                                  gap-3
                                  items-center
                                "
                            >
                              <div>
                                <ArrowLeft className="h-4 w-4 rotate-180 text-slate-600" />
                              </div>

                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-white truncate">
                                  {item.subject_name || "Unknown Subject"}
                                </p>

                                {item.subject_code && (
                                  <p className="text-[8px] text-slate-700 mt-1 truncate">
                                    {item.subject_code}
                                  </p>
                                )}
                              </div>

                              <div className="min-w-0">
                                <p className="text-[10px] text-slate-400 truncate">
                                  {item.teacher_name || "Unknown Teacher"}
                                </p>
                              </div>

                              <div className="min-w-0">
                                <p className="text-[10px] text-slate-400 truncate">
                                  {formatBooks(item.books)}
                                </p>
                              </div>

                              <div className="flex items-center gap-1.5 min-w-0">
                                <Clock3 className="h-3.5 w-3.5 text-slate-700 shrink-0" />

                                <span className="text-[10px] text-slate-400 truncate">
                                  {formatTime(item.start_time)}–
                                  {formatTime(item.end_time)}
                                </span>
                              </div>

                              <div>
                                <span
                                  className="
                                      inline-flex
                                      rounded-full
                                      border border-white/[0.06]
                                      bg-white/[0.02]
                                      px-2 py-1
                                      text-[9px]
                                      text-slate-500
                                    "
                                >
                                  {item.enrolled_count || 0}
                                </span>
                              </div>

                              <div className="text-right">
                                <span
                                  className="
                                      inline-flex
                                      rounded-full
                                      border
                                      px-2 py-1
                                      text-[8px]
                                      font-semibold
                                      border-emerald-400/15
                                      bg-emerald-400/[0.05]
                                      text-emerald-400
                                    "
                                >
                                  Active
                                </span>
                              </div>
                            </div>

                            <div className="lg:hidden flex items-center gap-3">
                              <ArrowLeft className="h-4 w-4 rotate-180 shrink-0 text-slate-600" />

                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-white truncate">
                                  {item.subject_name || "Unknown Subject"}
                                </p>

                                <p className="text-[9px] text-slate-600 mt-1 truncate">
                                  {item.teacher_name || "Unknown Teacher"}
                                  {" • "}
                                  {formatTime(item.start_time)}–
                                  {formatTime(item.end_time)}
                                </p>

                                <p className="text-[9px] text-slate-700 mt-1 truncate">
                                  {formatBooks(item.books)}
                                </p>
                              </div>

                              <span className="shrink-0 rounded-full border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[8px] text-slate-500">
                                {item.enrolled_count || 0}
                              </span>
                            </div>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {renderPagination()}
                </>
              )}
            </div>
          </section>
        ) : (
          <section
            className="
              rounded-2xl
              border border-white/[0.06]
              bg-[#121519]
              overflow-hidden
            "
          >
            <div
              className="
                px-4 sm:px-5 py-4
                border-b border-white/[0.06]
                flex flex-col sm:flex-row
                sm:items-center
                sm:justify-between
                gap-3
              "
            >
              <div className="min-w-0 flex items-center gap-3">
                <button
                  type="button"
                  onClick={backToClasses}
                  className="
                    h-8 px-2.5
                    rounded-lg
                    border border-white/[0.07]
                    bg-white/[0.02]
                    text-slate-500
                    hover:text-white
                    hover:bg-white/[0.04]
                    transition
                    flex items-center gap-1.5
                    text-[10px]
                    font-medium
                    shrink-0
                  "
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back
                </button>

                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white truncate">
                    {selectedClass.subject_name || "Class Details"}
                  </h3>

                  <p className="text-[10px] text-slate-600 mt-1">
                    Class information and enrolled students.
                  </p>
                </div>
              </div>

              <span
                className="
                  inline-flex
                  self-start sm:self-auto
                  rounded-full
                  border border-emerald-400/15
                  bg-emerald-400/[0.05]
                  px-2 py-1
                  text-[8px]
                  font-semibold
                  text-emerald-400
                "
              >
                Active
              </span>
            </div>

            <div className="p-4 sm:p-5">
              <div
                className="
                  grid
                  grid-cols-2
                  md:grid-cols-3
                  xl:grid-cols-6
                  gap-2
                  mb-5
                "
              >
                <InfoBox label="Subject" value={selectedClass.subject_name} />

                <InfoBox label="Teacher" value={selectedClass.teacher_name} />

                <InfoBox
                  label="Level / Book"
                  value={formatBooks(selectedClass.books)}
                />

                <InfoBox
                  label="Time"
                  value={`${formatTime(selectedClass.start_time)}–${formatTime(
                    selectedClass.end_time,
                  )}`}
                />

                <InfoBox label="Room" value={selectedClass.room || "—"} />

                <InfoBox
                  label="Enrolled"
                  value={`${selectedClass.enrolled_count || 0} students`}
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                <div>
                  <p className="text-[10px] font-semibold text-slate-400">
                    Class Students
                  </p>

                  <p className="text-[8px] text-slate-700 mt-1">
                    Current payment status is shown for{" "}
                    {monthName(currentSolar.month)} {currentSolar.year}.
                  </p>
                </div>

                <div className="relative w-full sm:w-[320px]">
                  <Search
                    className="
                      absolute left-3
                      top-1/2
                      -translate-y-1/2
                      h-3.5 w-3.5
                      text-slate-700
                    "
                  />

                  <input
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Search student, ID, father, roll or phone..."
                    className="
                      h-9 w-full
                      rounded-lg
                      border border-white/[0.07]
                      bg-[#0d1013]
                      pl-9 pr-3
                      text-[10px]
                      text-white
                      placeholder:text-slate-700
                      outline-none
                      focus:border-[#f2bd19]/50
                    "
                  />
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-white/[0.05]">
                <div
                  className="
                    hidden md:grid
                    grid-cols-[minmax(180px,1.4fr)_minmax(130px,1fr)_100px_minmax(230px,1.5fr)_28px]
                    gap-3
                    px-3 sm:px-4 py-2.5
                    bg-white/[0.015]
                    border-b border-white/[0.05]
                  "
                >
                  <span className="text-[8px] uppercase tracking-[0.14em] text-slate-700">
                    Student
                  </span>

                  <span className="text-[8px] uppercase tracking-[0.14em] text-slate-700">
                    Father / Contact
                  </span>

                  <span className="text-[8px] uppercase tracking-[0.14em] text-slate-700">
                    ID / Roll
                  </span>

                  <span className="text-[8px] uppercase tracking-[0.14em] text-slate-700">
                    Current Month
                  </span>

                  <span />
                </div>

                <div className="divide-y divide-white/[0.045]">
                  {classStudents.length === 0 ? (
                    <div className="py-8 text-center">
                      <p className="text-[10px] text-slate-600">
                        No students found in this class.
                      </p>
                    </div>
                  ) : (
                    classStudents.map((student) => {
                      const paymentStatus =
                        studentPaymentStatuses[student.enrollment_id];

                      const studentSelected =
                        selectedEnrollment?.enrollment_id ===
                        student.enrollment_id;

                      return (
                        <button
                          type="button"
                          key={student.enrollment_id}
                          onClick={() =>
                            selectStudent({
                              ...student,
                              books: selectedClass.books || [],
                            })
                          }
                          className={`
                              w-full
                              text-left
                              px-3 sm:px-4
                              py-3
                              transition-colors
                              ${
                                studentSelected
                                  ? "bg-[#f2bd19]/[0.045]"
                                  : "hover:bg-white/[0.02]"
                              }
                            `}
                        >
                          <div className="hidden md:grid grid-cols-[minmax(180px,1.4fr)_minmax(130px,1fr)_100px_minmax(230px,1.5fr)_28px] gap-3 items-center">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-white truncate">
                                {student.student_name}
                              </p>
                            </div>

                            <div className="min-w-0">
                              <p className="text-[10px] text-slate-500 truncate">
                                {student.father_name || "—"}
                              </p>

                              <p className="text-[9px] text-slate-700 mt-1 truncate">
                                {student.phone || "Phone —"}
                              </p>
                            </div>

                            <div>
                              <p className="text-[9px] text-slate-500">
                                #{student.student_id ?? "—"}
                              </p>

                              {student.roll_number && (
                                <p className="text-[8px] text-slate-700 mt-1">
                                  Roll {student.roll_number}
                                </p>
                              )}
                            </div>

                            <StudentPaymentStatus
                              status={paymentStatus?.status}
                              loading={loadingStudentStatuses && !paymentStatus}
                              monthLabel={`${MONTH_SHORT[currentSolar.month - 1]} ${currentSolar.year}`}
                              monthlyFee={paymentStatus?.monthlyFee || 0}
                              paid={paymentStatus?.paid || 0}
                              owing={paymentStatus?.owing || 0}
                            />

                            <div className="flex justify-end">
                              <span className="text-slate-700 text-sm">›</span>
                            </div>
                          </div>

                          <div className="md:hidden">
                            <div className="flex items-start gap-3">
                              <div
                                className="
                                    h-8 w-8
                                    shrink-0
                                    rounded-lg
                                    bg-white/[0.035]
                                    border border-white/[0.05]
                                    grid place-items-center
                                  "
                              >
                                <UserRound className="h-3.5 w-3.5 text-slate-600" />
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-white truncate">
                                      {student.student_name}
                                    </p>

                                    <p className="text-[9px] text-slate-600 mt-1 truncate">
                                      Father: {student.father_name || "—"}
                                    </p>
                                  </div>

                                  <span className="text-slate-700">›</span>
                                </div>

                                <div className="mt-2">
                                  <StudentPaymentStatus
                                    status={paymentStatus?.status}
                                    loading={
                                      loadingStudentStatuses && !paymentStatus
                                    }
                                    monthLabel={`${MONTH_SHORT[currentSolar.month - 1]} ${currentSolar.year}`}
                                    monthlyFee={paymentStatus?.monthlyFee || 0}
                                    paid={paymentStatus?.paid || 0}
                                    owing={paymentStatus?.owing || 0}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ==================================================
            PAYMENT HISTORY
        ================================================== */}

        {selectedEnrollment && (
          <section
            className="
              rounded-2xl
              border border-white/[0.06]
              bg-[#121519]
              overflow-hidden
            "
          >
            <div
              className="
                px-4 sm:px-5 py-4
                border-b border-white/[0.06]
                flex items-start justify-between gap-4
              "
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEnrollment(null);
                      setHistory(null);
                    }}
                    className="
                      h-8 px-2.5
                      rounded-lg
                      border border-white/[0.07]
                      bg-white/[0.02]
                      text-slate-500
                      hover:text-white
                      hover:bg-white/[0.04]
                      transition
                      flex items-center gap-1.5
                      text-[10px]
                      font-medium
                    "
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back
                  </button>

                  <h3 className="text-sm font-bold text-white">
                    Payment History
                  </h3>
                </div>

                <p className="text-[10px] text-slate-600 mt-1">
                  Solar Hijri payment transactions
                </p>
              </div>

              <button
                type="button"
                onClick={refreshHistory}
                disabled={loadingHistory}
                className="
                  h-8 w-8 shrink-0
                  rounded-lg
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
                  <div
                    className="
                      rounded-xl
                      border border-white/[0.06]
                      bg-[#0d1013]
                      p-4
                    "
                  >
                    <div
                      className="
                        flex flex-col
                        md:flex-row
                        md:items-center
                        md:justify-between
                        gap-4
                      "
                    >
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

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <LegendItem dot="bg-emerald-400" label="Paid" />

                    <LegendItem dot="bg-amber-400" label="Partial" />

                    <LegendItem dot="bg-red-400" label="Payment Due" />

                    <LegendItem dot="bg-blue-400" label="Upcoming" />

                    <LegendItem dot="bg-slate-800" label="Not Started" />
                  </div>

                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {monthCards.map((month) => (
                      <MonthStatusCard
                        key={`${month.solar_year}-${month.solar_month}`}
                        month={month}
                        status={month.status}
                        selected={
                          paymentMonth &&
                          Number(paymentMonth.solar_month) ===
                            Number(month.solar_month) &&
                          Number(paymentMonth.solar_year) ===
                            Number(month.solar_year)
                        }
                        onClick={openPayment}
                      />
                    ))}
                  </div>

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
                      <div
                        className="
                          rounded-xl
                          border border-dashed
                          border-white/[0.06]
                          py-8 text-center
                        "
                      >
                        <p className="text-xs text-slate-700">
                          No payment transactions yet.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {history.payments.map((payment) => {
                          const paymentAmount = roundMoney(payment.amount);

                          return (
                            <div
                              key={payment.payment_id}
                              className="
                                  rounded-xl
                                  border border-white/[0.05]
                                  bg-[#0d1013]
                                  px-3 sm:px-4 py-3
                                "
                            >
                              <div
                                className="
                                    flex flex-col
                                    sm:flex-row
                                    sm:items-center
                                    sm:justify-between
                                    gap-3
                                  "
                              >
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-white">
                                    {formatMoney(paymentAmount)}
                                  </p>

                                  <p className="text-[9px] text-slate-600 mt-1 truncate">
                                    {payment.receipt_number || "Payment"}
                                  </p>
                                </div>

                                <div className="flex items-center gap-2 sm:justify-end">
                                  <div className="sm:text-right">
                                    <p className="text-[10px] text-slate-400">
                                      {payment.payment_solar_date ||
                                        payment.payment_date ||
                                        "—"}
                                    </p>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();

                                      requestEditPayment(payment);
                                    }}
                                    disabled={savingTransaction}
                                    className="
                                        h-8 w-8 shrink-0 rounded-lg
                                        border border-white/[0.06]
                                        bg-white/[0.02]
                                        grid place-items-center
                                        text-slate-600
                                        hover:text-[#f2bd19]
                                        hover:border-[#f2bd19]/20
                                        transition
                                        disabled:opacity-40
                                      "
                                    title="Edit transaction"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();

                                      requestDeletePayment(payment);
                                    }}
                                    disabled={savingTransaction}
                                    className="
                                        h-8 w-8 shrink-0 rounded-lg
                                        border border-white/[0.06]
                                        bg-white/[0.02]
                                        grid place-items-center
                                        text-slate-600
                                        hover:text-red-300
                                        hover:border-red-400/20
                                        transition
                                        disabled:opacity-40
                                      "
                                    title="Delete transaction"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>

                              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                                <TransactionInfo
                                  label="Payment Amount"
                                  value={formatMoney(paymentAmount)}
                                />

                                <TransactionInfo
                                  label="Payment Date"
                                  value={
                                    payment.payment_solar_date ||
                                    payment.payment_date ||
                                    "—"
                                  }
                                />

                                <TransactionInfo
                                  label="Payment For"
                                  value={formatPaymentFor(payment)}
                                />

                                <TransactionInfo
                                  label="Recorded By"
                                  value={
                                    payment.recorded_by_name
                                      ? `${payment.recorded_by_name}${
                                          payment.recorded_by_role
                                            ? ` (${payment.recorded_by_role})`
                                            : ""
                                        }`
                                      : "—"
                                  }
                                />
                              </div>

                              {payment.comment ? (
                                <div
                                  className="
                                      mt-2
                                      rounded-lg
                                      border border-[#f2bd19]/10
                                      bg-[#f2bd19]/[0.025]
                                      px-3 py-2
                                    "
                                >
                                  <p className="text-[8px] uppercase tracking-wider text-slate-700">
                                    Comment
                                  </p>

                                  <p className="text-[10px] text-slate-400 mt-1 whitespace-pre-wrap break-words">
                                    {payment.comment}
                                  </p>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>
        )}
      </div>

      {/* ======================================================
          PAYMENT MODAL
      ====================================================== */}

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

      {/* ======================================================
          EDIT TRANSACTION MODAL
      ====================================================== */}

      <EditPaymentModal
        open={editPaymentModalOpen}
        payment={editingPayment}
        saving={savingTransaction}
        onClose={() => {
          if (savingTransaction) return;

          setEditPaymentModalOpen(false);
          setEditingPayment(null);
        }}
        onSubmit={submitEditPayment}
      />

      {/* ======================================================
          PASSWORD CONFIRMATION — CREATE / EDIT
      ====================================================== */}

      <div className="fixed inset-0 z-[9999] pointer-events-none">
        <div className="pointer-events-auto">
          <PasswordConfirmModal
            open={passwordConfirmOpen && Boolean(pendingPayment || pendingEdit)}
            title={pendingEdit ? "Confirm transaction edit" : "Confirm payment"}
            description={
              pendingEdit
                ? `Enter your password to update transaction ${
                    editingPayment?.receipt_number || ""
                  }.`
                : pendingPayment
                  ? `Enter your password to record ${formatMoney(
                      pendingPayment.paymentAmount,
                    )} for ${monthName(pendingPayment.solarMonth)}.`
                  : "Enter your password to continue."
            }
            confirmLabel={
              pendingEdit ? "Verify & Save Changes" : "Verify & Record Payment"
            }
            onVerified={pendingEdit ? confirmEditPayment : confirmPayment}
            onCancel={() => {
              if (savingPayment || savingTransaction) {
                return;
              }

              setPasswordConfirmOpen(false);
              setPendingPayment(null);
              setPendingEdit(null);
              setEditingPayment(null);
            }}
          />
        </div>
      </div>

      {/* ======================================================
          DELETE PASSWORD CONFIRMATION
      ====================================================== */}

      <div className="fixed inset-0 z-[10000] pointer-events-none">
        <div className="pointer-events-auto">
          <PasswordConfirmModal
            open={deletePasswordConfirmOpen && Boolean(deletePaymentTarget)}
            title="Confirm transaction deletion"
            description={
              deletePaymentTarget
                ? `Enter your password to permanently delete ${
                    deletePaymentTarget.receipt_number || "this transaction"
                  } (${formatMoney(deletePaymentTarget.amount)}).`
                : "Enter your password to continue."
            }
            confirmLabel="Verify & Delete Transaction"
            onVerified={confirmDeletePayment}
            onCancel={() => {
              if (savingTransaction) {
                return;
              }

              setDeletePasswordConfirmOpen(false);
              setDeletePaymentTarget(null);
            }}
          />
        </div>
      </div>
    </div>
  );
}
