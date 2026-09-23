import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  History,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  Users,
  Wallet,
  X,
} from "lucide-react";

import api from "../lib/api";
import PasswordConfirmModal from "../components/PasswordConfirmModal";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/Toast";

/* ==========================================================================
   SOLAR HIJRI
========================================================================== */

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

const STAFF_HANDOVER_ENDPOINT = "/finance/staff-transactions/handover";
const TEACHER_STUDENT_SETTLE_ENDPOINT = "/finance/teacher-students/settle";

const PAGE_SIZE = 25;

/* ==========================================================================
   HELPERS
========================================================================== */

function pad2(value) {
  return String(value).padStart(2, "0");
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
        formatted: `${year}/${pad2(month)}/${pad2(day)}`,
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

function solarMonthDays(year, month) {
  const y = Number(year);
  const m = Number(month);

  if (m >= 1 && m <= 6) return 31;
  if (m >= 7 && m <= 11) return 30;

  if (m === 12) {
    try {
      const formatter = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {
        timeZone: "Asia/Kabul",
        year: "numeric",
        month: "numeric",
        day: "numeric",
      });

      const start = new Date(Date.UTC(2027, 2, 20, 12));

      for (let i = 0; i <= 2; i += 1) {
        const date = new Date(start.getTime() + i * 86400000);

        const parts = formatter.formatToParts(date);

        const jy = Number(parts.find((part) => part.type === "year")?.value);
        const jm = Number(parts.find((part) => part.type === "month")?.value);
        const jd = Number(parts.find((part) => part.type === "day")?.value);

        if (jy === y && jm === 12 && jd === 30) {
          return 30;
        }
      }
    } catch {
      // Backend remains authoritative.
    }

    return y % 4 === 3 ? 30 : 29;
  }

  return 30;
}

function solarMonthStart(year, month) {
  return `${year}-${pad2(month)}-01`;
}

function solarMonthEnd(year, month) {
  return `${year}-${pad2(month)}-${pad2(solarMonthDays(year, month))}`;
}

function formatMoney(value) {
  const number = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(number);
}

function formatSolarDate(value) {
  if (!value) return "—";

  const text = String(value);

  const match = text.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);

  if (match) {
    return `${match[1]}/${pad2(match[2])}/${pad2(match[3])}`;
  }

  return text;
}

function formatPaymentDate(row) {
  return formatSolarDate(
    row?.payment_solar_date ||
      row?.solar_payment_date ||
      row?.payment_date ||
      row?.created_at,
  );
}

function monthName(month) {
  return SOLAR_MONTHS[Number(month) - 1] || `Month ${Number(month) || ""}`;
}

function monthLabel(year, month) {
  return `${monthName(month)} ${year}`;
}

function normalizeStatus(value) {
  const status = String(value || "").toLowerCase();

  if (
    status === "paid" ||
    status === "settled" ||
    status === "handed_over" ||
    status === "received" ||
    status === "complete"
  ) {
    return "paid";
  }

  if (status === "partial" || status === "partially_paid") {
    return "partial";
  }

  if (status === "pending" || status === "unpaid" || status === "due") {
    return "pending";
  }

  return status || "pending";
}

function teacherStudentKey(student) {
  return String(
    student?.enrollment_id ??
      student?.student_enrollment_id ??
      `${student?.student_id || ""}-${student?.class_slot_id || ""}`,
  );
}

function getTeacherStudentSettlementStatus(student) {
  return String(
    student?.teacher_settlement_status ||
      student?.teacher_payment_status ||
      student?.settlement_status ||
      "pending",
  ).toLowerCase();
}

function isTeacherStudentSettled(student) {
  const status = getTeacherStudentSettlementStatus(student);

  return ["paid", "settled", "handed_over", "complete"].includes(status);
}

function getStaffTransactionStatus(transaction) {
  return String(
    transaction?.handover_status ||
      transaction?.staff_handover_status ||
      transaction?.cash_handover_status ||
      "pending",
  ).toLowerCase();
}

function isStaffTransactionHandedOver(transaction) {
  return [
    "handed_over",
    "received",
    "settled",
    "reconciled",
    "paid",
    "complete",
  ].includes(getStaffTransactionStatus(transaction));
}

function normalizePage(data, fallbackPage = 1) {
  return {
    page: Number(data?.pagination?.page || fallbackPage),
    limit: Number(data?.pagination?.limit || PAGE_SIZE),
    totalItems: Number(
      data?.pagination?.total_items || data?.pagination?.total || 0,
    ),
    totalPages: Number(data?.pagination?.total_pages || 0),
  };
}

/* ==========================================================================
   SMALL UI
========================================================================== */

function StatusBadge({ status }) {
  const normalized = normalizeStatus(status);

  const config = {
    paid: {
      label: "Paid",
      dot: "bg-emerald-400",
      className: "border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-300",
    },
    partial: {
      label: "Partial",
      dot: "bg-amber-400",
      className: "border-amber-400/15 bg-amber-400/[0.06] text-amber-300",
    },
    pending: {
      label: "Pending",
      dot: "bg-red-400",
      className: "border-red-400/15 bg-red-400/[0.06] text-red-300",
    },
  };

  const meta = config[normalized] || {
    label: String(status || "Pending")
      .replaceAll("_", " ")
      .replace(/\b\w/g, (x) => x.toUpperCase()),
    dot: "bg-slate-500",
    className: "border-white/[0.06] bg-white/[0.02] text-slate-400",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[8px] font-semibold ${meta.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function HandoverBadge({ handedOver }) {
  if (handedOver) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] px-2 py-1 text-[8px] font-semibold text-emerald-300">
        <CheckCircle2 className="h-3 w-3" />
        Handed Over
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/15 bg-amber-400/[0.06] px-2 py-1 text-[8px] font-semibold text-amber-300">
      <Clock3 className="h-3 w-3" />
      Pending Handover
    </span>
  );
}

function StatCard({ icon: Icon, label, value, sublabel }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#121519] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[8px] uppercase tracking-[0.15em] text-slate-600">
            {label}
          </p>

          <p className="mt-1.5 text-lg font-bold text-white">{value}</p>

          {sublabel && (
            <p className="mt-1 text-[8px] text-slate-600">{sublabel}</p>
          )}
        </div>

        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/[0.06] bg-white/[0.025]">
          <Icon className="h-3.5 w-3.5 text-slate-500" />
        </div>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon = Wallet, title, description }) {
  return (
    <div className="rounded-xl border border-dashed border-white/[0.07] px-5 py-12 text-center">
      <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <Icon className="h-4.5 w-4.5 text-slate-600" />
      </div>

      <p className="mt-3 text-xs font-semibold text-slate-400">{title}</p>

      {description && (
        <p className="mx-auto mt-1 max-w-sm text-[9px] leading-relaxed text-slate-700">
          {description}
        </p>
      )}
    </div>
  );
}

function Pagination({ page, totalPages, onPrevious, onNext }) {
  if (!totalPages || totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between border-t border-white/[0.05] px-3 py-2.5">
      <p className="text-[8px] text-slate-600">
        Page {page} of {totalPages}
      </p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onPrevious}
          disabled={page <= 1}
          className="grid h-7 w-7 place-items-center rounded-lg border border-white/[0.06] bg-white/[0.02] text-slate-500 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={page >= totalPages}
          className="grid h-7 w-7 place-items-center rounded-lg border border-white/[0.06] bg-white/[0.02] text-slate-500 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  disabled = false,
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onChange}
      className={`grid h-4 w-4 shrink-0 place-items-center rounded border transition ${
        checked || indeterminate
          ? "border-[#f2bd19] bg-[#f2bd19] text-black"
          : "border-white/[0.14] bg-white/[0.025] text-transparent hover:border-white/25"
      } disabled:cursor-not-allowed disabled:opacity-40`}
      aria-pressed={checked}
    >
      {indeterminate ? (
        <span className="h-0.5 w-2 rounded-full bg-black" />
      ) : checked ? (
        <Check className="h-3 w-3" strokeWidth={3} />
      ) : null}
    </button>
  );
}

/* ==========================================================================
   MAIN
========================================================================== */

export default function Finance() {
  const { user } = useAuth();
  const toast = useToast();

  const isAdmin = user?.role === "admin";

  const today = useMemo(() => getTodaySolar(), []);

  const [activeTab, setActiveTab] = useState("teacher");

  const [selectedYear, setSelectedYear] = useState(today.year);
  const [selectedMonth, setSelectedMonth] = useState(today.month);

  const selectedMonthLabel = useMemo(
    () => monthLabel(selectedYear, selectedMonth),
    [selectedYear, selectedMonth],
  );

  /* ==========================================================================
     FINANCE SECURITY
  ========================================================================== */

  const [financeUnlocked, setFinanceUnlocked] = useState(false);
  const [financeVerificationToken, setFinanceVerificationToken] = useState("");

  const [financePasswordOpen, setFinancePasswordOpen] = useState(false);

  const [actionPasswordOpen, setActionPasswordOpen] = useState(false);

  const [actionTarget, setActionTarget] = useState(null);

  /* ==========================================================================
     TEACHERS
  ========================================================================== */

  const [teachers, setTeachers] = useState([]);
  const [teacherSearch, setTeacherSearch] = useState("");
  const [selectedTeacherId, setSelectedTeacherId] = useState(null);

  const [teacherLoading, setTeacherLoading] = useState(false);
  const [teacherRefreshing, setTeacherRefreshing] = useState(false);

  const [teacherMonthly, setTeacherMonthly] = useState(null);

  const [teacherPage, setTeacherPage] = useState(1);
  const [teacherHistory, setTeacherHistory] = useState([]);

  const [shareRate, setShareRate] = useState(30);
  const [shareRateEditing, setShareRateEditing] = useState(false);
  const [shareRateInput, setShareRateInput] = useState("30");
  const [shareRateSaving, setShareRateSaving] = useState(false);

  const [selectedTeacherStudents, setSelectedTeacherStudents] = useState(
    new Set(),
  );

  const [teacherSettlementLoading, setTeacherSettlementLoading] =
    useState(false);

  /* ==========================================================================
     STAFF
  ========================================================================== */

  const [staff, setStaff] = useState([]);
  const [staffSearch, setStaffSearch] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState(null);

  const [staffLoading, setStaffLoading] = useState(false);
  const [staffSummary, setStaffSummary] = useState(null);

  const [staffPayments, setStaffPayments] = useState([]);
  const [staffPaymentsLoading, setStaffPaymentsLoading] = useState(false);

  const [staffPage, setStaffPage] = useState(1);
  const [staffPagination, setStaffPagination] = useState({
    page: 1,
    totalPages: 0,
    totalItems: 0,
  });

  const [selectedStaffTransactions, setSelectedStaffTransactions] = useState(
    new Set(),
  );

  const [staffActivity, setStaffActivity] = useState([]);
  const [staffActivityLoading, setStaffActivityLoading] = useState(false);

  const [staffActivityPage, setStaffActivityPage] = useState(1);

  const [staffActivityPagination, setStaffActivityPagination] = useState({
    page: 1,
    totalPages: 0,
    totalItems: 0,
  });

  /* ==========================================================================
     SECURITY
  ========================================================================== */

  useEffect(() => {
    if (!isAdmin) {
      setFinanceUnlocked(false);
      setFinanceVerificationToken("");
      return;
    }

    setFinancePasswordOpen(true);
  }, [isAdmin]);

  function handleFinancePasswordVerified(response) {
    const token = response?.verification_token;

    if (!token) {
      toast.error("Finance verification token was not returned.");
      return;
    }

    setFinanceVerificationToken(token);
    setFinanceUnlocked(true);
    setFinancePasswordOpen(false);
  }

  function lockFinance() {
    setFinanceUnlocked(false);
    setFinanceVerificationToken("");
    setFinancePasswordOpen(true);
  }

  /* ==========================================================================
     LOAD TEACHERS
  ========================================================================== */

  const loadTeachers = useCallback(async () => {
    if (!financeUnlocked) return;

    setTeacherLoading(true);

    try {
      const { data } = await api.get("/finance/teachers");

      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.teachers)
          ? data.teachers
          : [];

      setTeachers(list);

      if (selectedTeacherId === null && list.length > 0) {
        setSelectedTeacherId(Number(list[0].teacher_id ?? list[0].id));
      }
    } catch (error) {
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        lockFinance();
      }

      toast.error(error?.response?.data?.error || "Failed to load teachers.");
    } finally {
      setTeacherLoading(false);
    }
  }, [financeUnlocked, selectedTeacherId, toast]);

  /* ==========================================================================
     LOAD TEACHER MONTHLY
  ========================================================================== */

  const loadTeacherMonthly = useCallback(
    async (showSpinner = true) => {
      if (!financeUnlocked || !selectedTeacherId) {
        return;
      }

      if (showSpinner) {
        setTeacherLoading(true);
      } else {
        setTeacherRefreshing(true);
      }

      try {
        const params = new URLSearchParams();

        params.set("teacher_id", String(selectedTeacherId));
        params.set("solar_year", String(selectedYear));
        params.set("solar_month", String(selectedMonth));
        params.set("page", String(teacherPage));
        params.set("limit", String(PAGE_SIZE));

        const { data } = await api.get(
          `/finance/teacher-monthly?${params.toString()}`,
        );

        setTeacherMonthly(data || null);

        if (data?.summary?.share_percent !== undefined) {
          setShareRate(Number(data.summary.share_percent));
          setShareRateInput(String(data.summary.share_percent));
        }

        setSelectedTeacherStudents(new Set());
      } catch (error) {
        if (
          error?.response?.status === 401 ||
          error?.response?.status === 403
        ) {
          lockFinance();
        }

        toast.error(
          error?.response?.data?.error ||
            "Failed to load teacher financial data.",
        );
      } finally {
        setTeacherLoading(false);
        setTeacherRefreshing(false);
      }
    },
    [
      financeUnlocked,
      selectedTeacherId,
      selectedYear,
      selectedMonth,
      teacherPage,
      toast,
    ],
  );

  /* ==========================================================================
     LOAD TEACHER HISTORY
  ========================================================================== */

  const loadTeacherHistory = useCallback(async () => {
    if (!financeUnlocked || !selectedTeacherId) {
      return;
    }

    try {
      const { data } = await api.get(
        `/finance/teacher-history?teacher_id=${encodeURIComponent(
          selectedTeacherId,
        )}`,
      );

      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.history)
          ? data.history
          : [];

      setTeacherHistory(list);
    } catch (error) {
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        lockFinance();
      }

      setTeacherHistory([]);

      toast.error(
        error?.response?.data?.error ||
          "Failed to load teacher payment history.",
      );
    }
  }, [financeUnlocked, selectedTeacherId, toast]);

  /* ==========================================================================
     LOAD SHARE RATE
  ========================================================================== */

  const loadShareRate = useCallback(async () => {
    if (!financeUnlocked) return;

    try {
      const { data } = await api.get("/finance/teacher-share-rate");

      const current = data?.current;

      if (current?.percentage !== undefined) {
        const value = Number(current.percentage);

        setShareRate(value);
        setShareRateInput(String(value));
      }
    } catch (error) {
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        lockFinance();
      }
    }
  }, [financeUnlocked]);

  /* ==========================================================================
     LOAD STAFF
  ========================================================================== */

  const loadStaff = useCallback(async () => {
    if (!financeUnlocked) return;

    setStaffLoading(true);

    try {
      const { data } = await api.get(
        `/finance/staff-summary?solar_year=${selectedYear}&solar_month=${selectedMonth}&page=1&limit=100`,
      );

      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.staff)
          ? data.staff
          : Array.isArray(data?.collectors)
            ? data.collectors
            : [];

      setStaff(list);

      if (selectedStaffId === null && list.length > 0) {
        setSelectedStaffId(
          Number(list[0].staff_user_id ?? list[0].user_id ?? list[0].id),
        );
      }
    } catch (error) {
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        lockFinance();
      }

      toast.error(
        error?.response?.data?.error || "Failed to load staff financial data.",
      );
    } finally {
      setStaffLoading(false);
    }
  }, [financeUnlocked, selectedYear, selectedMonth, selectedStaffId, toast]);

  /* ==========================================================================
     LOAD SELECTED STAFF SUMMARY
  ========================================================================== */

  const loadSelectedStaffSummary = useCallback(async () => {
    if (!financeUnlocked || !selectedStaffId) {
      return;
    }

    try {
      const { data } = await api.get(
        `/finance/staff-summary?solar_year=${selectedYear}&solar_month=${selectedMonth}&page=1&limit=100`,
      );

      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.staff)
          ? data.staff
          : [];

      const match = list.find(
        (item) =>
          Number(item.staff_user_id ?? item.user_id ?? item.id) ===
          Number(selectedStaffId),
      );

      setStaffSummary(match || null);
    } catch (error) {
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        lockFinance();
      }
    }
  }, [financeUnlocked, selectedStaffId, selectedYear, selectedMonth]);

  /* ==========================================================================
     LOAD STAFF PAYMENTS
  ========================================================================== */

  const loadStaffPayments = useCallback(async () => {
    if (!financeUnlocked || !selectedStaffId) {
      return;
    }

    setStaffPaymentsLoading(true);

    try {
      const params = new URLSearchParams();

      params.set("collector_user_id", String(selectedStaffId));
      params.set(
        "from_solar_date",
        solarMonthStart(selectedYear, selectedMonth),
      );
      params.set("to_solar_date", solarMonthEnd(selectedYear, selectedMonth));
      params.set("page", String(staffPage));
      params.set("limit", String(PAGE_SIZE));

      const { data } = await api.get(
        `/finance/staff-payments?${params.toString()}`,
      );

      const rows = Array.isArray(data)
        ? data
        : Array.isArray(data?.payments)
          ? data.payments
          : [];

      /*
       * A payment can have multiple allocation rows.
       * The staff transaction queue must never duplicate
       * the same payment.
       */
      const unique = new Map();

      rows.forEach((row) => {
        const paymentId =
          row?.payment_id ??
          row?.id ??
          `${row?.receipt_number || ""}-${row?.payment_date || ""}-${row?.amount || ""}`;

        if (!unique.has(String(paymentId))) {
          unique.set(String(paymentId), {
            ...row,
            payment_id: row?.payment_id ?? row?.id,
          });
        }
      });

      const normalized = Array.from(unique.values());

      setStaffPayments(normalized);

      setStaffPagination(normalizePage(data, staffPage));

      setSelectedStaffTransactions(new Set());
    } catch (error) {
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        lockFinance();
      }

      toast.error(
        error?.response?.data?.error || "Failed to load staff transactions.",
      );
    } finally {
      setStaffPaymentsLoading(false);
    }
  }, [
    financeUnlocked,
    selectedStaffId,
    selectedYear,
    selectedMonth,
    staffPage,
    toast,
  ]);

  /* ==========================================================================
     LOAD STAFF ACTIVITY
  ========================================================================== */

  const loadStaffActivity = useCallback(async () => {
    if (!financeUnlocked || !selectedStaffId) {
      return;
    }

    setStaffActivityLoading(true);

    try {
      const params = new URLSearchParams();

      params.set("user_id", String(selectedStaffId));
      params.set("page", String(staffActivityPage));
      params.set("limit", String(PAGE_SIZE));

      const { data } = await api.get(
        `/finance/staff-activity?${params.toString()}`,
      );

      const rows = Array.isArray(data)
        ? data
        : Array.isArray(data?.activity)
          ? data.activity
          : [];

      setStaffActivity(rows);

      setStaffActivityPagination(normalizePage(data, staffActivityPage));
    } catch (error) {
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        lockFinance();
      }

      setStaffActivity([]);

      toast.error(
        error?.response?.data?.error || "Failed to load staff activity.",
      );
    } finally {
      setStaffActivityLoading(false);
    }
  }, [financeUnlocked, selectedStaffId, staffActivityPage, toast]);

  /* ==========================================================================
     EFFECTS
  ========================================================================== */

  useEffect(() => {
    if (!financeUnlocked) return;

    loadTeachers();
    loadStaff();
    loadShareRate();
  }, [financeUnlocked, selectedYear, selectedMonth]);

  useEffect(() => {
    if (!financeUnlocked) return;

    loadTeacherMonthly();
    loadTeacherHistory();
  }, [
    financeUnlocked,
    selectedTeacherId,
    selectedYear,
    selectedMonth,
    teacherPage,
  ]);

  useEffect(() => {
    if (!financeUnlocked) return;

    loadSelectedStaffSummary();
    loadStaffPayments();
    loadStaffActivity();
  }, [
    financeUnlocked,
    selectedStaffId,
    selectedYear,
    selectedMonth,
    staffPage,
    staffActivityPage,
  ]);

  /* ==========================================================================
     FILTERS
  ========================================================================== */

  const filteredTeachers = useMemo(() => {
    const query = teacherSearch.trim().toLowerCase();

    if (!query) return teachers;

    return teachers.filter((teacher) =>
      String(teacher.teacher_name ?? teacher.full_name ?? "")
        .toLowerCase()
        .includes(query),
    );
  }, [teachers, teacherSearch]);

  const filteredStaff = useMemo(() => {
    const query = staffSearch.trim().toLowerCase();

    if (!query) return staff;

    return staff.filter((member) =>
      String(
        member.staff_name ?? member.full_name ?? member.collector_name ?? "",
      )
        .toLowerCase()
        .includes(query),
    );
  }, [staff, staffSearch]);

  const selectedTeacher = useMemo(
    () =>
      teachers.find(
        (teacher) =>
          Number(teacher.teacher_id ?? teacher.id) ===
          Number(selectedTeacherId),
      ) || null,
    [teachers, selectedTeacherId],
  );

  const selectedStaff = useMemo(
    () =>
      staff.find(
        (member) =>
          Number(member.staff_user_id ?? member.user_id ?? member.id) ===
          Number(selectedStaffId),
      ) ||
      staffSummary ||
      null,
    [staff, selectedStaffId, staffSummary],
  );

  /* ==========================================================================
     TEACHER STUDENTS
  ========================================================================== */

  const teacherStudents = useMemo(() => {
    const list = Array.isArray(teacherMonthly?.students)
      ? teacherMonthly.students
      : [];

    /*
     * The queue contains only the teacher share
     * that is still awaiting Admin settlement.
     *
     * Once the backend reports the specific student/
     * enrollment as settled, it disappears from this
     * pending queue.
     */
    const pending = list.filter((student) => !isTeacherStudentSettled(student));

    /*
     * Protect the UI from duplicated enrollment rows.
     */
    const unique = new Map();

    pending.forEach((student) => {
      const key = teacherStudentKey(student);

      if (!unique.has(key)) {
        unique.set(key, student);
      }
    });

    return Array.from(unique.values());
  }, [teacherMonthly]);

  const selectedTeacherStudentRows = useMemo(
    () =>
      teacherStudents.filter((student) =>
        selectedTeacherStudents.has(teacherStudentKey(student)),
      ),
    [teacherStudents, selectedTeacherStudents],
  );

  const allTeacherStudentsSelected =
    teacherStudents.length > 0 &&
    teacherStudents.every((student) =>
      selectedTeacherStudents.has(teacherStudentKey(student)),
    );

  const someTeacherStudentsSelected = selectedTeacherStudents.size > 0;

  function toggleTeacherStudent(student) {
    const key = teacherStudentKey(student);

    setSelectedTeacherStudents((current) => {
      const next = new Set(current);

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  }

  function toggleAllTeacherStudents() {
    if (allTeacherStudentsSelected) {
      setSelectedTeacherStudents(new Set());
      return;
    }

    setSelectedTeacherStudents(new Set(teacherStudents.map(teacherStudentKey)));
  }

  const selectedTeacherAmount = useMemo(
    () =>
      selectedTeacherStudentRows.reduce(
        (sum, student) =>
          sum +
          Number(
            student.teacher_share_amount ??
              student.share_amount ??
              student.owed_teacher_share ??
              0,
          ),
        0,
      ),
    [selectedTeacherStudentRows],
  );

  /* ==========================================================================
     STAFF TRANSACTIONS
  ========================================================================== */

  const pendingStaffTransactions = useMemo(
    () =>
      staffPayments.filter(
        (transaction) => !isStaffTransactionHandedOver(transaction),
      ),
    [staffPayments],
  );

  const selectedStaffTransactionRows = useMemo(
    () =>
      staffPayments.filter((transaction) =>
        selectedStaffTransactions.has(
          String(transaction.payment_id ?? transaction.id),
        ),
      ),
    [staffPayments, selectedStaffTransactions],
  );

  const allVisibleStaffSelected =
    pendingStaffTransactions.length > 0 &&
    pendingStaffTransactions.every((transaction) =>
      selectedStaffTransactions.has(
        String(transaction.payment_id ?? transaction.id),
      ),
    );

  const selectedStaffAmount = useMemo(
    () =>
      selectedStaffTransactionRows.reduce(
        (sum, transaction) =>
          sum +
          Number(
            transaction.amount ??
              transaction.payment_amount ??
              transaction.paid_amount ??
              0,
          ),
        0,
      ),
    [selectedStaffTransactionRows],
  );

  function toggleStaffTransaction(transaction) {
    if (isStaffTransactionHandedOver(transaction)) {
      return;
    }

    const key = String(transaction.payment_id ?? transaction.id);

    setSelectedStaffTransactions((current) => {
      const next = new Set(current);

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  }

  function toggleAllStaffTransactions() {
    if (allVisibleStaffSelected) {
      setSelectedStaffTransactions(new Set());
      return;
    }

    setSelectedStaffTransactions(
      new Set(
        pendingStaffTransactions.map((transaction) =>
          String(transaction.payment_id ?? transaction.id),
        ),
      ),
    );
  }

  /* ==========================================================================
     SAVE SHARE RATE
  ========================================================================== */

  async function saveShareRate() {
    const percentage = Number(shareRateInput);

    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      toast.error("Teacher share percentage must be between 0 and 100.");
      return;
    }

    setShareRateSaving(true);

    try {
      await api.put("/finance/teacher-share-rate", {
        percentage,
      });

      setShareRate(percentage);
      setShareRateInput(String(percentage));
      setShareRateEditing(false);

      toast.success("Teacher share rate updated.");

      await Promise.all([loadTeacherMonthly(false), loadTeacherHistory()]);
    } catch (error) {
      toast.error(
        error?.response?.data?.error || "Failed to update teacher share rate.",
      );
    } finally {
      setShareRateSaving(false);
    }
  }

  /* ==========================================================================
     TEACHER STUDENT CLEAR / SETTLE
  ========================================================================== */

  function requestTeacherStudentSettlement() {
    if (selectedTeacherStudentRows.length === 0) {
      toast.error("Select at least one student first.");
      return;
    }

    setActionTarget({
      type: "teacher_students",
      rows: selectedTeacherStudentRows,
      name: selectedTeacher?.teacher_name || "this teacher",
      amount: selectedTeacherAmount,
    });

    setActionPasswordOpen(true);
  }

  async function settleSelectedTeacherStudents(verification) {
    const token = verification?.verification_token;

    if (!token) {
      toast.error("Administrator verification token was not returned.");
      return;
    }

    if (!actionTarget || actionTarget.type !== "teacher_students") {
      return;
    }

    setTeacherSettlementLoading(true);

    try {
      /*
       * Individual enrollment IDs are sent rather than
       * student IDs because one student can have multiple
       * class enrollments.
       */
      const enrollmentIds = actionTarget.rows
        .map((student) =>
          Number(student.enrollment_id ?? student.student_enrollment_id),
        )
        .filter((id) => Number.isInteger(id) && id > 0);

      if (enrollmentIds.length === 0) {
        toast.error(
          "The selected students do not contain valid enrollment records.",
        );
        return;
      }

      await api.post(TEACHER_STUDENT_SETTLE_ENDPOINT, {
        teacher_id: Number(selectedTeacherId),
        solar_year: Number(selectedYear),
        solar_month: Number(selectedMonth),
        enrollment_ids: enrollmentIds,
        verification_token: token,
      });

      toast.success(
        `${enrollmentIds.length} teacher student balance${
          enrollmentIds.length === 1 ? "" : "s"
        } settled.`,
      );

      setActionPasswordOpen(false);
      setActionTarget(null);
      setSelectedTeacherStudents(new Set());

      await Promise.all([loadTeacherMonthly(false), loadTeacherHistory()]);
    } catch (error) {
      toast.error(
        error?.response?.data?.error ||
          error?.message ||
          "Failed to settle the selected teacher balances.",
      );
    } finally {
      setTeacherSettlementLoading(false);
    }
  }

  /* ==========================================================================
     STAFF HANDOVER
  ========================================================================== */

  function requestStaffHandover() {
    if (selectedStaffTransactionRows.length === 0) {
      toast.error("Select at least one pending transaction first.");
      return;
    }

    setActionTarget({
      type: "staff_handover",
      rows: selectedStaffTransactionRows,
      name:
        selectedStaff?.staff_name ||
        selectedStaff?.full_name ||
        selectedStaff?.collector_name ||
        "this staff member",
      amount: selectedStaffAmount,
    });

    setActionPasswordOpen(true);
  }

  async function handoverSelectedStaffTransactions(verification) {
    const token = verification?.verification_token;

    if (!token) {
      toast.error("Administrator verification token was not returned.");
      return;
    }

    if (!actionTarget || actionTarget.type !== "staff_handover") {
      return;
    }

    try {
      const paymentIds = actionTarget.rows
        .map((transaction) => Number(transaction.payment_id ?? transaction.id))
        .filter((id) => Number.isInteger(id) && id > 0);

      if (paymentIds.length === 0) {
        toast.error(
          "The selected transactions do not contain valid payment IDs.",
        );
        return;
      }

      await api.put(STAFF_HANDOVER_ENDPOINT, {
        payment_ids: paymentIds,
        collector_user_id: Number(selectedStaffId),
        solar_year: Number(selectedYear),
        solar_month: Number(selectedMonth),
        verification_token: token,
      });

      toast.success(
        `${paymentIds.length} transaction${
          paymentIds.length === 1 ? "" : "s"
        } marked as handed over.`,
      );

      setActionPasswordOpen(false);
      setActionTarget(null);
      setSelectedStaffTransactions(new Set());

      await Promise.all([
        loadStaff(),
        loadSelectedStaffSummary(),
        loadStaffPayments(),
        loadStaffActivity(),
      ]);
    } catch (error) {
      toast.error(
        error?.response?.data?.error ||
          error?.message ||
          "Failed to mark the selected transactions as handed over.",
      );
    }
  }

  async function handleActionPasswordVerified(verification) {
    if (!actionTarget) return;

    if (actionTarget.type === "teacher_students") {
      await settleSelectedTeacherStudents(verification);
      return;
    }

    if (actionTarget.type === "staff_handover") {
      await handoverSelectedStaffTransactions(verification);
    }
  }

  /* ==========================================================================
     MONTH NAVIGATION
  ========================================================================== */

  function goToPreviousMonth() {
    let year = Number(selectedYear);
    let month = Number(selectedMonth) - 1;

    if (month < 1) {
      month = 12;
      year -= 1;
    }

    setSelectedYear(year);
    setSelectedMonth(month);
    setTeacherPage(1);
    setStaffPage(1);
    setStaffActivityPage(1);
    setSelectedTeacherStudents(new Set());
    setSelectedStaffTransactions(new Set());
  }

  function goToNextMonth() {
    let year = Number(selectedYear);
    let month = Number(selectedMonth) + 1;

    if (month > 12) {
      month = 1;
      year += 1;
    }

    setSelectedYear(year);
    setSelectedMonth(month);
    setTeacherPage(1);
    setStaffPage(1);
    setStaffActivityPage(1);
    setSelectedTeacherStudents(new Set());
    setSelectedStaffTransactions(new Set());
  }

  function goToToday() {
    setSelectedYear(today.year);
    setSelectedMonth(today.month);
    setTeacherPage(1);
    setStaffPage(1);
    setStaffActivityPage(1);
  }

  async function refreshFinance() {
    if (!financeUnlocked) {
      setFinancePasswordOpen(true);
      return;
    }

    if (activeTab === "teacher") {
      await Promise.all([
        loadTeachers(),
        loadTeacherMonthly(false),
        loadTeacherHistory(),
        loadShareRate(),
      ]);
    } else {
      await Promise.all([
        loadStaff(),
        loadSelectedStaffSummary(),
        loadStaffPayments(),
        loadStaffActivity(),
      ]);
    }
  }

  /* ==========================================================================
     LOCKED SCREEN
  ========================================================================== */

  if (!isAdmin) {
    return (
      <div className="min-h-[70vh] grid place-items-center p-5">
        <div className="w-full max-w-sm rounded-2xl border border-white/[0.06] bg-[#121519] p-7 text-center">
          <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl border border-red-400/15 bg-red-400/[0.05]">
            <Lock className="h-5 w-5 text-red-300" />
          </div>

          <h2 className="mt-4 text-sm font-bold text-white">
            Finance is restricted
          </h2>

          <p className="mt-2 text-[10px] leading-relaxed text-slate-600">
            Finance is available only to active administrators. Staff passwords
            cannot unlock this page.
          </p>
        </div>
      </div>
    );
  }

  if (!financeUnlocked) {
    return (
      <>
        <div className="min-h-[70vh] grid place-items-center p-5">
          <div className="w-full max-w-sm rounded-2xl border border-white/[0.06] bg-[#121519] p-7 text-center">
            <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl border border-[#f2bd19]/15 bg-[#f2bd19]/[0.05]">
              <ShieldCheck className="h-5 w-5 text-[#f2bd19]" />
            </div>

            <h2 className="mt-4 text-sm font-bold text-white">
              Administrator verification required
            </h2>

            <p className="mt-2 text-[10px] leading-relaxed text-slate-600">
              Enter the administrator password to access Finance.
            </p>

            <button
              type="button"
              onClick={() => setFinancePasswordOpen(true)}
              className="mt-5 h-9 rounded-lg bg-[#f2bd19] px-4 text-[10px] font-bold text-black transition hover:bg-[#ffd34d]"
            >
              Verify Administrator
            </button>
          </div>
        </div>

        <PasswordConfirmModal
          open={financePasswordOpen}
          title="Unlock Finance"
          description="Enter your administrator password to access Finance."
          endpoint="/finance/verify-admin-password"
          onCancel={() => setFinancePasswordOpen(false)}
          onVerified={handleFinancePasswordVerified}
        />
      </>
    );
  }

  /* ==========================================================================
     TEACHER TAB
  ========================================================================== */

  function renderTeacherTab() {
    const summary = teacherMonthly?.summary || {};

    const settlement = teacherMonthly?.settlement || {};

    const teacherShare = Number(
      summary.teacher_share_amount ?? summary.share_amount ?? 0,
    );

    const settlementPaid = Boolean(
      settlement.paid_at ||
      settlement.status === "paid" ||
      settlement.status === "settled",
    );

    const teacherPagination = normalizePage(teacherMonthly, teacherPage);

    return (
      <div className="grid gap-3 xl:grid-cols-[245px_minmax(0,1fr)]">
        {/* TEACHER SIDEBAR */}

        <aside className="rounded-2xl border border-white/[0.06] bg-[#121519] p-2.5">
          <div className="p-1.5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-700" />

              <input
                value={teacherSearch}
                onChange={(event) => setTeacherSearch(event.target.value)}
                placeholder="Search teacher..."
                className="h-9 w-full rounded-lg border border-white/[0.06] bg-[#0d1013] pl-9 pr-3 text-[10px] text-white outline-none placeholder:text-slate-700 focus:border-[#f2bd19]/30"
              />
            </div>
          </div>

          <div className="mt-2 space-y-1">
            {teacherLoading && teachers.length === 0 ? (
              <div className="grid place-items-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-[#f2bd19]" />
              </div>
            ) : filteredTeachers.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <p className="text-[10px] text-slate-600">No teachers found.</p>
              </div>
            ) : (
              filteredTeachers.map((teacher) => {
                const id = Number(teacher.teacher_id ?? teacher.id);

                const selected = id === Number(selectedTeacherId);

                return (
                  <button
                    type="button"
                    key={id}
                    onClick={() => {
                      setSelectedTeacherId(id);
                      setTeacherPage(1);
                      setSelectedTeacherStudents(new Set());
                    }}
                    className={`w-full rounded-xl border p-2.5 text-left transition ${
                      selected
                        ? "border-[#f2bd19]/15 bg-[#f2bd19]/[0.06]"
                        : "border-transparent hover:border-white/[0.05] hover:bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${
                          selected
                            ? "border-[#f2bd19]/15 bg-[#f2bd19]/[0.08]"
                            : "border-white/[0.06] bg-white/[0.025]"
                        }`}
                      >
                        <UserRound
                          className={`h-3.5 w-3.5 ${
                            selected ? "text-[#f2bd19]" : "text-slate-600"
                          }`}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-[10px] font-semibold ${
                            selected ? "text-white" : "text-slate-400"
                          }`}
                        >
                          {teacher.teacher_name ??
                            teacher.full_name ??
                            "Unnamed teacher"}
                        </p>

                        <p className="mt-0.5 text-[8px] text-slate-700">
                          {Number(
                            teacher.class_count ?? teacher.classes_count ?? 0,
                          )}{" "}
                          classes ·{" "}
                          {Number(
                            teacher.student_count ??
                              teacher.students_count ??
                              0,
                          )}{" "}
                          students
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* TEACHER CONTENT */}

        <main className="min-w-0 space-y-3">
          <section className="rounded-2xl border border-white/[0.06] bg-[#121519] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-sm font-bold text-white">
                    {selectedTeacher?.teacher_name ??
                      selectedTeacher?.full_name ??
                      teacherMonthly?.teacher?.full_name ??
                      "Teacher"}
                  </h2>

                  <span className="rounded-full border border-emerald-400/15 bg-emerald-400/[0.05] px-2 py-1 text-[7px] font-semibold text-emerald-300">
                    Admin settlement
                  </span>
                </div>

                <p className="mt-1 text-[9px] text-slate-600">
                  {selectedMonthLabel} · Teacher financial record
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-[#0d1013] p-1">
                  <button
                    type="button"
                    onClick={goToPreviousMonth}
                    className="grid h-7 w-7 place-items-center rounded-md text-slate-600 transition hover:bg-white/[0.04] hover:text-white"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>

                  <div className="min-w-[100px] text-center">
                    <p className="text-[9px] font-semibold text-slate-300">
                      {monthName(selectedMonth)}
                    </p>

                    <p className="text-[7px] text-slate-700">{selectedYear}</p>
                  </div>

                  <button
                    type="button"
                    onClick={goToNextMonth}
                    className="grid h-7 w-7 place-items-center rounded-md text-slate-600 transition hover:bg-white/[0.04] hover:text-white"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={goToToday}
                  className="h-9 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 text-[9px] text-slate-500 transition hover:text-white"
                >
                  Today
                </button>

                <button
                  type="button"
                  onClick={refreshFinance}
                  disabled={teacherRefreshing || teacherLoading}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-white/[0.06] bg-white/[0.02] text-slate-500 transition hover:text-white disabled:opacity-40"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${
                      teacherRefreshing ? "animate-spin" : ""
                    }`}
                  />
                </button>
              </div>
            </div>
          </section>

          {/* SHARE RATE */}

          <section className="rounded-xl border border-white/[0.06] bg-[#121519] p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-lg border border-[#f2bd19]/10 bg-[#f2bd19]/[0.05]">
                  <Wallet className="h-3.5 w-3.5 text-[#f2bd19]" />
                </div>

                <div>
                  <p className="text-[10px] font-semibold text-white">
                    Teacher share rate
                  </p>

                  <p className="mt-0.5 text-[8px] text-slate-600">
                    Historical payment attribution remains tied to its
                    applicable rate.
                  </p>
                </div>
              </div>

              {shareRateEditing ? (
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={shareRateInput}
                      onChange={(event) =>
                        setShareRateInput(event.target.value)
                      }
                      className="h-8 w-24 rounded-lg border border-[#f2bd19]/25 bg-[#0d1013] px-3 pr-7 text-[10px] text-white outline-none focus:border-[#f2bd19]/50"
                    />

                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-600">
                      %
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={saveShareRate}
                    disabled={shareRateSaving}
                    className="grid h-8 w-8 place-items-center rounded-lg bg-[#f2bd19] text-black disabled:opacity-40"
                  >
                    {shareRateSaving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShareRateEditing(false);
                      setShareRateInput(String(shareRate));
                    }}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.06] text-slate-600 hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShareRateEditing(true)}
                  className="rounded-lg border border-[#f2bd19]/15 bg-[#f2bd19]/[0.05] px-3 py-2 text-[10px] font-bold text-[#f2bd19]"
                >
                  {Number(summary.share_percent ?? shareRate ?? 30).toFixed(2)}%
                </button>
              )}
            </div>
          </section>

          {/* STATS */}

          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={Users}
              label="Students"
              value={summary.student_count ?? teacherStudents.length}
              sublabel={selectedMonthLabel}
            />

            <StatCard
              icon={CheckCircle2}
              label="Paid"
              value={summary.paid_students ?? 0}
              sublabel={`AFN ${formatMoney(summary.paid_amount)}`}
            />

            <StatCard
              icon={Clock3}
              label="Partial / Unpaid"
              value={`${Number(summary.partial_students ?? 0)} / ${Number(
                summary.unpaid_students ?? 0,
              )}`}
              sublabel={`Outstanding AFN ${formatMoney(
                summary.outstanding_amount,
              )}`}
            />

            <StatCard
              icon={Banknote}
              label="Teacher Share"
              value={`AFN ${formatMoney(teacherShare)}`}
              sublabel={`${Number(
                summary.share_percent ?? shareRate ?? 30,
              ).toFixed(2)}% applicable`}
            />
          </div>

          {/* TEACHER SETTLEMENT */}

          <section className="rounded-xl border border-white/[0.06] bg-[#121519] p-3.5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[8px] uppercase tracking-[0.14em] text-slate-600">
                  Teacher settlement
                </p>

                <p className="mt-1 text-base font-bold text-white">
                  AFN {formatMoney(teacherShare)}
                </p>

                {settlementPaid ? (
                  <p className="mt-1 text-[8px] text-emerald-300">
                    Paid {formatSolarDate(settlement.paid_at)} ·{" "}
                    {settlement.paid_by?.full_name ||
                      settlement.paid_by_name ||
                      "Administrator"}
                  </p>
                ) : (
                  <p className="mt-1 text-[8px] text-amber-300">
                    Waiting for Admin settlement
                  </p>
                )}
              </div>

              {settlementPaid ? (
                <span className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.06] px-3 py-2 text-[9px] font-semibold text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Settled
                </span>
              ) : (
                <span className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-amber-400/15 bg-amber-400/[0.05] px-3 py-2 text-[9px] font-semibold text-amber-300">
                  <Clock3 className="h-3.5 w-3.5" />
                  Pending
                </span>
              )}
            </div>
          </section>

          {/* STUDENT PAYMENT STATUS */}

          <section className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#121519]">
            <div className="flex flex-col gap-3 border-b border-white/[0.06] p-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold text-white">
                  Student payment status
                </p>

                <p className="mt-1 text-[9px] text-slate-600">
                  Only teacher-share balances that have not yet been settled by
                  Admin remain here.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {someTeacherStudentsSelected && (
                  <span className="text-[8px] text-slate-600">
                    {selectedTeacherStudents.size} selected
                    {selectedTeacherAmount > 0
                      ? ` · AFN ${formatMoney(selectedTeacherAmount)}`
                      : ""}
                  </span>
                )}

                <button
                  type="button"
                  onClick={toggleAllTeacherStudents}
                  disabled={teacherStudents.length === 0}
                  className="h-8 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 text-[8px] font-semibold text-slate-500 transition hover:text-white disabled:opacity-30"
                >
                  {allTeacherStudentsSelected ? "Unselect all" : "Select all"}
                </button>

                <button
                  type="button"
                  onClick={requestTeacherStudentSettlement}
                  disabled={
                    selectedTeacherStudents.size === 0 ||
                    teacherSettlementLoading
                  }
                  className="flex h-8 items-center gap-1.5 rounded-lg bg-[#f2bd19] px-3 text-[8px] font-bold text-black transition hover:bg-[#ffd34d] disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {teacherSettlementLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Clear selected
                </button>
              </div>
            </div>

            {teacherLoading && !teacherMonthly ? (
              <div className="grid place-items-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-[#f2bd19]" />
              </div>
            ) : teacherStudents.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="No pending teacher balances"
                description="Every teacher-share balance returned by the backend for this period has already been settled."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px]">
                  <thead>
                    <tr className="border-b border-white/[0.05] bg-[#0e1114]">
                      <th className="w-10 px-3 py-2.5 text-left">
                        <Checkbox
                          checked={allTeacherStudentsSelected}
                          indeterminate={
                            someTeacherStudentsSelected &&
                            !allTeacherStudentsSelected
                          }
                          onChange={toggleAllTeacherStudents}
                        />
                      </th>

                      <th className="px-3 py-2.5 text-left text-[8px] uppercase tracking-wider text-slate-600">
                        Student
                      </th>

                      <th className="px-3 py-2.5 text-left text-[8px] uppercase tracking-wider text-slate-600">
                        Class
                      </th>

                      <th className="px-3 py-2.5 text-right text-[8px] uppercase tracking-wider text-slate-600">
                        Expected
                      </th>

                      <th className="px-3 py-2.5 text-right text-[8px] uppercase tracking-wider text-slate-600">
                        Paid
                      </th>

                      <th className="px-3 py-2.5 text-right text-[8px] uppercase tracking-wider text-slate-600">
                        Outstanding
                      </th>

                      <th className="px-3 py-2.5 text-left text-[8px] uppercase tracking-wider text-slate-600">
                        Status
                      </th>

                      <th className="px-3 py-2.5 text-right text-[8px] uppercase tracking-wider text-slate-600">
                        Last payment
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {teacherStudents.map((student) => {
                      const key = teacherStudentKey(student);

                      const selected = selectedTeacherStudents.has(key);

                      const expected = Number(
                        student.expected_amount ??
                          student.calculated_amount ??
                          student.expected ??
                          0,
                      );

                      const paid = Number(
                        student.paid_amount ?? student.paid ?? 0,
                      );

                      const outstanding = Number(
                        student.outstanding_amount ??
                          student.outstanding ??
                          Math.max(expected - paid, 0),
                      );

                      const className =
                        student.subject_name ??
                        student.class_name ??
                        student.class ??
                        "—";

                      const teacherShareAmount = Number(
                        student.teacher_share_amount ??
                          student.share_amount ??
                          student.owed_teacher_share ??
                          0,
                      );

                      return (
                        <tr
                          key={key}
                          className={`border-b border-white/[0.035] transition last:border-0 ${
                            selected
                              ? "bg-[#f2bd19]/[0.035]"
                              : "hover:bg-white/[0.015]"
                          }`}
                        >
                          <td className="px-3 py-3">
                            <Checkbox
                              checked={selected}
                              onChange={() => toggleTeacherStudent(student)}
                            />
                          </td>

                          <td className="px-3 py-3">
                            <div>
                              <p className="text-[10px] font-semibold text-white">
                                {student.student_name ??
                                  student.full_name ??
                                  "Unnamed student"}
                              </p>

                              <p className="mt-0.5 text-[8px] text-slate-700">
                                Teacher share: AFN{" "}
                                {formatMoney(teacherShareAmount)}
                              </p>
                            </div>
                          </td>

                          <td className="px-3 py-3">
                            <div>
                              <p className="text-[9px] text-slate-300">
                                {className}
                              </p>

                              {(student.level || student.book_name) && (
                                <p className="mt-0.5 text-[8px] text-slate-700">
                                  {student.level || student.book_name}
                                </p>
                              )}
                            </div>
                          </td>

                          <td className="px-3 py-3 text-right text-[9px] text-slate-400">
                            AFN {formatMoney(expected)}
                          </td>

                          <td className="px-3 py-3 text-right text-[9px] font-semibold text-white">
                            AFN {formatMoney(paid)}
                          </td>

                          <td className="px-3 py-3 text-right text-[9px] font-semibold">
                            <span
                              className={
                                outstanding > 0
                                  ? "text-red-300"
                                  : "text-emerald-300"
                              }
                            >
                              AFN {formatMoney(outstanding)}
                            </span>
                          </td>

                          <td className="px-3 py-3">
                            <StatusBadge
                              status={
                                student.status ??
                                student.payment_status ??
                                (outstanding > 0 ? "partial" : "paid")
                              }
                            />
                          </td>

                          <td className="px-3 py-3 text-right text-[8px] text-slate-600">
                            {formatSolarDate(
                              student.last_payment_solar_date ??
                                student.last_payment_date,
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <Pagination
              page={teacherPagination.page}
              totalPages={teacherPagination.totalPages}
              onPrevious={() => setTeacherPage((page) => Math.max(1, page - 1))}
              onNext={() => setTeacherPage((page) => page + 1)}
            />
          </section>

          {/* ASSIGNED CLASSES */}

          <section className="rounded-xl border border-white/[0.06] bg-[#121519] p-3.5">
            <div className="mb-3 flex items-center gap-2">
              <BookOpen className="h-3.5 w-3.5 text-slate-600" />

              <div>
                <p className="text-[10px] font-semibold text-white">
                  Assigned classes
                </p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {(
                selectedTeacher?.classes ||
                teacherMonthly?.teacher?.classes ||
                []
              ).length === 0 ? (
                <p className="text-[9px] text-slate-700">
                  No assigned classes.
                </p>
              ) : (
                (
                  selectedTeacher?.classes ||
                  teacherMonthly?.teacher?.classes ||
                  []
                ).map((classItem, index) => (
                  <div
                    key={classItem.id ?? classItem.class_slot_id ?? index}
                    className="rounded-lg border border-white/[0.05] bg-[#0d1013] p-3"
                  >
                    <p className="text-[10px] font-semibold text-white">
                      {classItem.subject_name ?? classItem.name ?? "Class"}
                    </p>

                    <p className="mt-1 text-[8px] text-slate-600">
                      {classItem.start_time && classItem.end_time
                        ? `${String(classItem.start_time).slice(
                            0,
                            5,
                          )} – ${String(classItem.end_time).slice(0, 5)}`
                        : "Time not set"}
                    </p>

                    <p className="mt-1.5 text-[8px] text-slate-700">
                      {Number(classItem.student_count ?? 0)} students
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* HISTORY */}

          <section className="rounded-xl border border-white/[0.06] bg-[#121519] p-3.5">
            <div className="mb-3 flex items-center gap-2">
              <History className="h-3.5 w-3.5 text-slate-600" />

              <div>
                <p className="text-[10px] font-semibold text-white">
                  Teacher payment history
                </p>

                <p className="mt-0.5 text-[8px] text-slate-700">
                  Historical monthly teacher earnings.
                </p>
              </div>
            </div>

            {teacherHistory.length === 0 ? (
              <p className="py-5 text-center text-[9px] text-slate-700">
                No historical teacher settlements.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {teacherHistory.map((item, index) => {
                  const year = Number(item.solar_year);
                  const month = Number(item.solar_month);

                  return (
                    <button
                      type="button"
                      key={item.id ?? `${year}-${month}-${index}`}
                      onClick={() => {
                        if (Number.isInteger(year) && Number.isInteger(month)) {
                          setSelectedYear(year);
                          setSelectedMonth(month);
                          setTeacherPage(1);
                        }
                      }}
                      className="rounded-lg border border-white/[0.05] bg-[#0d1013] p-3 text-left transition hover:border-[#f2bd19]/15 hover:bg-[#f2bd19]/[0.02]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[10px] font-semibold text-white">
                            {monthName(month)} {year}
                          </p>

                          <p className="mt-1 text-[8px] text-slate-700">
                            {Number(item.payment_count ?? 0)} payments ·{" "}
                            {Number(item.share_percent ?? shareRate).toFixed(2)}
                            % share
                          </p>
                        </div>

                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/70" />
                      </div>

                      <p className="mt-3 text-[8px] uppercase tracking-wider text-slate-700">
                        Teacher share
                      </p>

                      <p className="mt-0.5 text-sm font-bold text-[#f2bd19]">
                        AFN{" "}
                        {formatMoney(
                          item.teacher_share_amount ?? item.share_amount ?? 0,
                        )}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </main>
      </div>
    );
  }

  /* ==========================================================================
     STAFF TAB
  ========================================================================== */

  function renderStaffTab() {
    const staffSettlement =
      staffSummary?.settlement || staffSummary?.staff_settlement || {};

    const received = Boolean(
      staffSettlement.received_at ||
      staffSettlement.status === "received" ||
      staffSettlement.status === "settled",
    );

    const totalCollected = Number(
      staffSummary?.total_amount ?? staffSummary?.collected_amount ?? 0,
    );

    const transactionCount = Number(
      staffSummary?.payment_count ?? staffSummary?.transaction_count ?? 0,
    );

    const handedOverAmount =
      staffSummary?.handed_over_amount !== undefined
        ? Number(staffSummary.handed_over_amount)
        : received
          ? totalCollected
          : 0;

    const pendingAmount = Math.max(totalCollected - handedOverAmount, 0);

    return (
      <div className="grid gap-3 xl:grid-cols-[245px_minmax(0,1fr)]">
        {/* STAFF SIDEBAR */}

        <aside className="rounded-2xl border border-white/[0.06] bg-[#121519] p-2.5">
          <div className="p-1.5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-700" />

              <input
                value={staffSearch}
                onChange={(event) => setStaffSearch(event.target.value)}
                placeholder="Search staff..."
                className="h-9 w-full rounded-lg border border-white/[0.06] bg-[#0d1013] pl-9 pr-3 text-[10px] text-white outline-none placeholder:text-slate-700 focus:border-[#f2bd19]/30"
              />
            </div>
          </div>

          <div className="mt-2 space-y-1">
            {staffLoading && staff.length === 0 ? (
              <div className="grid place-items-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-[#f2bd19]" />
              </div>
            ) : filteredStaff.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <p className="text-[10px] text-slate-600">No staff found.</p>
              </div>
            ) : (
              filteredStaff.map((member) => {
                const id = Number(
                  member.staff_user_id ?? member.user_id ?? member.id,
                );

                const selected = id === Number(selectedStaffId);

                const memberTotal = Number(
                  member.total_amount ?? member.collected_amount ?? 0,
                );

                const memberSettlement =
                  member.settlement || member.staff_settlement || {};

                const memberReceived = Boolean(
                  member.handover_status === "handed_over" ||
                  memberReceivedStatus(memberSettlement),
                );

                return (
                  <button
                    type="button"
                    key={id}
                    onClick={() => {
                      setSelectedStaffId(id);
                      setStaffPage(1);
                      setStaffActivityPage(1);
                      setSelectedStaffTransactions(new Set());
                    }}
                    className={`w-full rounded-xl border p-2.5 text-left transition ${
                      selected
                        ? "border-[#f2bd19]/15 bg-[#f2bd19]/[0.06]"
                        : "border-transparent hover:border-white/[0.05] hover:bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${
                          selected
                            ? "border-[#f2bd19]/15 bg-[#f2bd19]/[0.08]"
                            : "border-white/[0.06] bg-white/[0.025]"
                        }`}
                      >
                        <UserRound
                          className={`h-3.5 w-3.5 ${
                            selected ? "text-[#f2bd19]" : "text-slate-600"
                          }`}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-[10px] font-semibold ${
                            selected ? "text-white" : "text-slate-400"
                          }`}
                        >
                          {member.staff_name ??
                            member.full_name ??
                            member.collector_name ??
                            "Unnamed staff"}
                        </p>

                        <div className="mt-1 flex items-center gap-1.5">
                          <span className="text-[7px] uppercase text-slate-700">
                            {member.role || "staff"}
                          </span>

                          <span className="text-[7px] text-slate-800">·</span>

                          <span
                            className={
                              memberReceived
                                ? "text-[7px] text-emerald-400"
                                : memberTotal > 0
                                  ? "text-[7px] text-amber-400"
                                  : "text-[7px] text-slate-700"
                            }
                          >
                            {memberReceived
                              ? "Handed Over"
                              : memberTotal > 0
                                ? "Pending"
                                : "No Collections"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* STAFF CONTENT */}

        <main className="min-w-0 space-y-3">
          <section className="rounded-2xl border border-white/[0.06] bg-[#121519] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-white">
                    {selectedStaff?.staff_name ??
                      selectedStaff?.full_name ??
                      selectedStaff?.collector_name ??
                      "Staff member"}
                  </h2>

                  <span className="rounded-full border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[7px] font-semibold uppercase text-slate-500">
                    {selectedStaff?.role || "staff"}
                  </span>
                </div>

                <p className="mt-1 text-[9px] text-slate-600">
                  {selectedMonthLabel} · Cash collected by this staff member
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-[#0d1013] p-1">
                  <button
                    type="button"
                    onClick={goToPreviousMonth}
                    className="grid h-7 w-7 place-items-center rounded-md text-slate-600 hover:bg-white/[0.04] hover:text-white"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>

                  <div className="min-w-[100px] text-center">
                    <p className="text-[9px] font-semibold text-slate-300">
                      {monthName(selectedMonth)}
                    </p>

                    <p className="text-[7px] text-slate-700">{selectedYear}</p>
                  </div>

                  <button
                    type="button"
                    onClick={goToNextMonth}
                    className="grid h-7 w-7 place-items-center rounded-md text-slate-600 hover:bg-white/[0.04] hover:text-white"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={goToToday}
                  className="h-9 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 text-[9px] text-slate-500 hover:text-white"
                >
                  Today
                </button>

                <button
                  type="button"
                  onClick={refreshFinance}
                  disabled={staffLoading}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-white/[0.06] bg-white/[0.02] text-slate-500 hover:text-white disabled:opacity-40"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${
                      staffLoading ? "animate-spin" : ""
                    }`}
                  />
                </button>
              </div>
            </div>
          </section>

          {/* STAFF STATS */}

          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={CreditCard}
              label="Transactions"
              value={transactionCount}
              sublabel={selectedMonthLabel}
            />

            <StatCard
              icon={Banknote}
              label="Collected"
              value={`AFN ${formatMoney(totalCollected)}`}
              sublabel="Recorded by this staff member"
            />

            <StatCard
              icon={CheckCircle2}
              label="Handed Over"
              value={`AFN ${formatMoney(handedOverAmount)}`}
              sublabel={received ? "Admin received" : "Awaiting Admin"}
            />

            <StatCard
              icon={Clock3}
              label="Pending Handover"
              value={`AFN ${formatMoney(pendingAmount)}`}
              sublabel={
                pendingAmount > 0 ? "Still with staff" : "Nothing pending"
              }
            />
          </div>

          {/* STAFF HANDOVER SUMMARY */}

          <section className="rounded-xl border border-white/[0.06] bg-[#121519] p-3.5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[8px] uppercase tracking-[0.14em] text-slate-600">
                  Cash handover
                </p>

                <p className="mt-1 text-[10px] text-slate-400">
                  Select the actual payment transactions this staff member is
                  handing to Admin.
                </p>
              </div>

              {received && pendingStaffTransactions.length === 0 ? (
                <span className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.06] px-3 py-2 text-[9px] font-semibold text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Handed Over
                </span>
              ) : (
                <span className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-amber-400/15 bg-amber-400/[0.05] px-3 py-2 text-[9px] font-semibold text-amber-300">
                  <Clock3 className="h-3.5 w-3.5" />
                  Pending Handover
                </span>
              )}
            </div>
          </section>

          {/* TRANSACTIONS */}

          <section className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#121519]">
            <div className="flex flex-col gap-3 border-b border-white/[0.06] p-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold text-white">Transactions</p>

                <p className="mt-1 text-[9px] text-slate-600">
                  Payments recorded by{" "}
                  {selectedStaff?.staff_name ??
                    selectedStaff?.full_name ??
                    "this staff member"}{" "}
                  for {selectedMonthLabel}.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {selectedStaffTransactions.size > 0 && (
                  <span className="text-[8px] text-slate-600">
                    {selectedStaffTransactions.size} selected
                    {" · "}
                    AFN {formatMoney(selectedStaffAmount)}
                  </span>
                )}

                <button
                  type="button"
                  onClick={toggleAllStaffTransactions}
                  disabled={pendingStaffTransactions.length === 0}
                  className="h-8 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 text-[8px] font-semibold text-slate-500 hover:text-white disabled:opacity-30"
                >
                  {allVisibleStaffSelected ? "Unselect all" : "Select all"}
                </button>

                <button
                  type="button"
                  onClick={requestStaffHandover}
                  disabled={selectedStaffTransactions.size === 0}
                  className="flex h-8 items-center gap-1.5 rounded-lg bg-[#f2bd19] px-3 text-[8px] font-bold text-black transition hover:bg-[#ffd34d] disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Check className="h-3.5 w-3.5" />
                  Mark as Handed Over
                </button>
              </div>
            </div>

            {staffPaymentsLoading ? (
              <div className="grid place-items-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-[#f2bd19]" />
              </div>
            ) : staffPayments.length === 0 ? (
              <EmptyState
                icon={Banknote}
                title="No transactions"
                description="This staff member has no payment transactions recorded for the selected Solar month."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px]">
                  <thead>
                    <tr className="border-b border-white/[0.05] bg-[#0e1114]">
                      <th className="w-10 px-3 py-2.5 text-left">
                        <Checkbox
                          checked={allVisibleStaffSelected}
                          indeterminate={
                            selectedStaffTransactions.size > 0 &&
                            !allVisibleStaffSelected
                          }
                          onChange={toggleAllStaffTransactions}
                        />
                      </th>

                      <th className="px-3 py-2.5 text-left text-[8px] uppercase tracking-wider text-slate-600">
                        Transaction
                      </th>

                      <th className="px-3 py-2.5 text-left text-[8px] uppercase tracking-wider text-slate-600">
                        Payment date
                      </th>

                      <th className="px-3 py-2.5 text-left text-[8px] uppercase tracking-wider text-slate-600">
                        Paid for
                      </th>

                      <th className="px-3 py-2.5 text-right text-[8px] uppercase tracking-wider text-slate-600">
                        Amount
                      </th>

                      <th className="px-3 py-2.5 text-left text-[8px] uppercase tracking-wider text-slate-600">
                        Recorded by
                      </th>

                      <th className="px-3 py-2.5 text-left text-[8px] uppercase tracking-wider text-slate-600">
                        Status
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {staffPayments.map((transaction) => {
                      const paymentId = String(
                        transaction.payment_id ?? transaction.id,
                      );

                      const handedOver =
                        isStaffTransactionHandedOver(transaction);

                      const selected = selectedStaffTransactions.has(paymentId);

                      const amount = Number(
                        transaction.amount ??
                          transaction.payment_amount ??
                          transaction.paid_amount ??
                          0,
                      );

                      return (
                        <tr
                          key={paymentId}
                          className={`border-b border-white/[0.035] last:border-0 ${
                            selected
                              ? "bg-[#f2bd19]/[0.035]"
                              : "hover:bg-white/[0.015]"
                          }`}
                        >
                          <td className="px-3 py-3">
                            <Checkbox
                              checked={selected}
                              disabled={handedOver}
                              onChange={() =>
                                toggleStaffTransaction(transaction)
                              }
                            />
                          </td>

                          <td className="px-3 py-3">
                            <div>
                              <p className="text-[10px] font-semibold text-white">
                                {transaction.receipt_number
                                  ? `Receipt ${transaction.receipt_number}`
                                  : `Payment #${paymentId}`}
                              </p>

                              <p className="mt-0.5 text-[8px] text-slate-700">
                                {transaction.student_name
                                  ? `Student: ${transaction.student_name}`
                                  : "Student payment"}
                              </p>
                            </div>
                          </td>

                          <td className="px-3 py-3 text-[9px] text-slate-400">
                            {formatPaymentDate(transaction)}
                          </td>

                          <td className="px-3 py-3">
                            <div>
                              <p className="text-[9px] font-semibold text-slate-300">
                                {formatPaymentForStaff(transaction)}
                              </p>

                              {transaction.subject_name && (
                                <p className="mt-0.5 text-[8px] text-slate-700">
                                  {transaction.subject_name}
                                </p>
                              )}
                            </div>
                          </td>

                          <td className="px-3 py-3 text-right text-[10px] font-bold text-white">
                            AFN {formatMoney(amount)}
                          </td>

                          <td className="px-3 py-3">
                            <div>
                              <p className="text-[9px] font-semibold text-slate-300">
                                {selectedStaff?.staff_name ??
                                  selectedStaff?.full_name ??
                                  transaction.collector_name ??
                                  transaction.recorded_by_name ??
                                  "—"}
                              </p>

                              <p className="mt-0.5 text-[8px] text-slate-700">
                                staff
                              </p>
                            </div>
                          </td>

                          <td className="px-3 py-3">
                            <HandoverBadge handedOver={handedOver} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <Pagination
              page={staffPagination.page}
              totalPages={staffPagination.totalPages}
              onPrevious={() => setStaffPage((page) => Math.max(1, page - 1))}
              onNext={() => setStaffPage((page) => page + 1)}
            />
          </section>

          {/* STAFF AUDIT */}

          <section className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#121519]">
            <div className="border-b border-white/[0.06] p-3.5">
              <div className="flex items-center gap-2">
                <History className="h-3.5 w-3.5 text-slate-600" />

                <div>
                  <p className="text-[10px] font-semibold text-white">
                    Staff activity
                  </p>

                  <p className="mt-0.5 text-[8px] text-slate-700">
                    Actions performed by this staff member.
                  </p>
                </div>
              </div>
            </div>

            {staffActivityLoading ? (
              <div className="grid place-items-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-[#f2bd19]" />
              </div>
            ) : staffActivity.length === 0 ? (
              <EmptyState
                icon={History}
                title="No activity recorded"
                description="There is no financial activity recorded for this staff member."
              />
            ) : (
              <div className="divide-y divide-white/[0.035]">
                {staffActivity.map((activity, index) => (
                  <div
                    key={activity.id ?? `${activity.payment_id}-${index}`}
                    className="flex flex-col gap-2 p-3.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold text-white">
                          {formatActivityAction(activity)}
                        </span>

                        <span className="rounded-full border border-white/[0.05] bg-white/[0.02] px-1.5 py-0.5 text-[7px] text-slate-600">
                          staff
                        </span>
                      </div>

                      <p className="mt-1 text-[8px] text-slate-600">
                        Performed by{" "}
                        <span className="text-slate-400">
                          {selectedStaff?.staff_name ??
                            selectedStaff?.full_name ??
                            activity.performed_by_name ??
                            activity.user_name ??
                            "this staff member"}
                        </span>
                      </p>

                      {activity.student_name && (
                        <p className="mt-0.5 text-[8px] text-slate-700">
                          Student: {activity.student_name}
                        </p>
                      )}
                    </div>

                    <div className="shrink-0 text-left sm:text-right">
                      {activity.amount !== undefined && (
                        <p className="text-[10px] font-bold text-white">
                          AFN {formatMoney(activity.amount)}
                        </p>
                      )}

                      <p className="mt-1 text-[8px] text-slate-700">
                        {formatSolarDate(
                          activity.performed_at_solar_date ??
                            activity.solar_date ??
                            activity.created_at,
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Pagination
              page={staffActivityPagination.page}
              totalPages={staffActivityPagination.totalPages}
              onPrevious={() =>
                setStaffActivityPage((page) => Math.max(1, page - 1))
              }
              onNext={() => setStaffActivityPage((page) => page + 1)}
            />
          </section>
        </main>
      </div>
    );
  }

  /* ==========================================================================
     MAIN RENDER
  ========================================================================== */

  return (
    <>
      <div className="space-y-3">
        {/* HEADER */}

        <section className="rounded-2xl border border-white/[0.06] bg-[#101317] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white">Finance</h1>

                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/15 bg-emerald-400/[0.05] px-2 py-1 text-[7px] font-semibold text-emerald-300">
                  <ShieldCheck className="h-3 w-3" />
                  Admin verified
                </span>
              </div>

              <p className="mt-1 text-[9px] text-slate-600">
                Teacher compensation and staff cash reconciliation
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-[#0d1013] p-1">
                <button
                  type="button"
                  onClick={goToPreviousMonth}
                  className="grid h-7 w-7 place-items-center rounded-md text-slate-600 hover:bg-white/[0.04] hover:text-white"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>

                <div className="min-w-[105px] text-center">
                  <p className="text-[9px] font-semibold text-slate-300">
                    {monthName(selectedMonth)} {selectedYear}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={goToNextMonth}
                  className="grid h-7 w-7 place-items-center rounded-md text-slate-600 hover:bg-white/[0.04] hover:text-white"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              <button
                type="button"
                onClick={goToToday}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 text-[9px] text-slate-500 hover:text-white"
              >
                <CalendarDays className="h-3.5 w-3.5" />
                Today
              </button>

              <button
                type="button"
                onClick={refreshFinance}
                className="grid h-9 w-9 place-items-center rounded-lg border border-white/[0.06] bg-white/[0.02] text-slate-500 hover:text-white"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </section>

        {/* TABS */}

        <div className="flex items-center gap-5 border-b border-white/[0.06] px-1">
          <button
            type="button"
            onClick={() => setActiveTab("teacher")}
            className={`relative pb-2.5 text-[10px] font-semibold transition ${
              activeTab === "teacher"
                ? "text-[#f2bd19]"
                : "text-slate-600 hover:text-slate-300"
            }`}
          >
            Teachers
            {activeTab === "teacher" && (
              <span className="absolute bottom-0 left-0 right-0 h-px bg-[#f2bd19]" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("staff")}
            className={`relative pb-2.5 text-[10px] font-semibold transition ${
              activeTab === "staff"
                ? "text-[#f2bd19]"
                : "text-slate-600 hover:text-slate-300"
            }`}
          >
            Staff
            {activeTab === "staff" && (
              <span className="absolute bottom-0 left-0 right-0 h-px bg-[#f2bd19]" />
            )}
          </button>
        </div>

        {activeTab === "teacher" ? renderTeacherTab() : renderStaffTab()}
      </div>

      {/* FINANCE UNLOCK */}

      <PasswordConfirmModal
        open={financePasswordOpen}
        title="Unlock Finance"
        description="Enter your administrator password to access Finance."
        endpoint="/finance/verify-admin-password"
        onCancel={() => setFinancePasswordOpen(false)}
        onVerified={handleFinancePasswordVerified}
      />

      {/* ACTION PASSWORD */}

      <PasswordConfirmModal
        open={actionPasswordOpen}
        title={
          actionTarget?.type === "staff_handover"
            ? "Confirm Cash Handover"
            : "Confirm Teacher Settlement"
        }
        description={
          actionTarget?.type === "staff_handover"
            ? `Enter the administrator password to receive ${actionTarget?.rows?.length || 0} selected transaction${
                actionTarget?.rows?.length === 1 ? "" : "s"
              } from ${actionTarget?.name || "this staff member"}.`
            : `Enter the administrator password to settle the selected teacher-share balances for ${actionTarget?.name || "this teacher"}.`
        }
        endpoint="/finance/verify-admin-password"
        onCancel={() => {
          setActionPasswordOpen(false);
          setActionTarget(null);
        }}
        onVerified={handleActionPasswordVerified}
      />
    </>
  );
}

/* ==========================================================================
   STAFF HELPERS
========================================================================== */

function memberReceivedStatus(settlement) {
  return Boolean(
    settlement?.received_at ||
    settlement?.status === "received" ||
    settlement?.status === "settled",
  );
}

function formatPaymentForStaff(payment) {
  if (!payment) return "—";

  if (Array.isArray(payment.payment_for_months)) {
    const months = payment.payment_for_months
      .map((value) => String(value).trim())
      .filter(Boolean)
      .map((value) => {
        const match = value.match(/^(\d{4})[/-](\d{1,2})$/);

        if (!match) return value;

        return `${match[1]}/${pad2(match[2])}`;
      });

    if (months.length) {
      return [...new Set(months)].join(", ");
    }
  }

  if (payment.payment_for) {
    const value = String(payment.payment_for).trim();

    const match = value.match(/^(\d{4})[/-](\d{1,2})$/);

    if (match) {
      return `${match[1]}/${pad2(match[2])}`;
    }

    return value;
  }

  if (payment.payment_for_solar_year && payment.payment_for_solar_month) {
    return `${Number(payment.payment_for_solar_year)}/${pad2(
      payment.payment_for_solar_month,
    )}`;
  }

  if (payment.solar_year && payment.solar_month) {
    return `${Number(payment.solar_year)}/${pad2(payment.solar_month)}`;
  }

  if (payment.payment_solar_year && payment.payment_solar_month) {
    return `${Number(payment.payment_solar_year)}/${pad2(
      payment.payment_solar_month,
    )}`;
  }

  return "—";
}

function formatActivityAction(activity) {
  if (!activity) return "Activity";

  if (activity.action_label) {
    return activity.action_label;
  }

  if (activity.action) {
    return String(activity.action)
      .replaceAll("_", " ")
      .replace(/\b\w/g, (x) => x.toUpperCase());
  }

  if (activity.event_type) {
    return String(activity.event_type)
      .replaceAll("_", " ")
      .replace(/\b\w/g, (x) => x.toUpperCase());
  }

  return "Payment activity";
}
