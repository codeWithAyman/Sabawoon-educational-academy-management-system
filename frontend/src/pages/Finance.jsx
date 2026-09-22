import { useEffect, useMemo, useState } from "react";

import {
  AlertTriangle,
  Banknote,
  CalendarRange,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Save,
  ShieldCheck,
  Users,
  WalletCards,
  XCircle,
} from "lucide-react";

import api from "../lib/api";
import { useAuth } from "../context/AuthContext";

/* ==========================================================================
   CONSTANTS
========================================================================== */

const EMPTY_TEACHER_DATA = {
  current_share_rate: 30,

  totals: {
    total_payment_amount: 0,
    attributable_amount: 0,
    teacher_share_amount: 0,
    unattributed_amount: 0,
    payment_count: 0,
    teacher_count: 0,
  },

  teachers: [],
  payments: [],
};

const SOLAR_PLACEHOLDER = "1405-06-01";

/* ==========================================================================
   HELPERS
========================================================================== */

function money(value) {
  return `${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} AFN`;
}

function normalDate(value) {
  if (!value) {
    return "—";
  }

  return String(value).slice(0, 10);
}

function statusLabel(status) {
  switch (status) {
    case "matched":
      return "Matched";

    case "short":
      return "Short";

    case "over":
      return "Over";

    case "pending":
      return "Pending";

    default:
      return status || "Unknown";
  }
}

function statusClasses(status) {
  switch (status) {
    case "matched":
      return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";

    case "short":
      return "border-red-400/20 bg-red-400/10 text-red-300";

    case "over":
      return "border-amber-400/20 bg-amber-400/10 text-amber-300";

    default:
      return "border-white/10 bg-white/[0.04] text-slate-300";
  }
}

function inputClassName() {
  return [
    "w-full",
    "rounded-xl",
    "border",
    "border-white/[0.08]",
    "bg-[#0d1014]",
    "px-3",
    "py-2.5",
    "text-sm",
    "text-white",
    "outline-none",
    "transition",
    "placeholder:text-slate-600",
    "focus:border-[#f2bd19]/50",
    "focus:ring-2",
    "focus:ring-[#f2bd19]/10",
  ].join(" ");
}

function buttonClassName(extra = "") {
  return [
    "inline-flex",
    "items-center",
    "justify-center",
    "gap-2",
    "rounded-xl",
    "px-3.5",
    "py-2.5",
    "text-sm",
    "font-semibold",
    "transition",
    "disabled:cursor-not-allowed",
    "disabled:opacity-50",
    extra,
  ].join(" ");
}

/* ==========================================================================
   SMALL UI
========================================================================== */

function StatCard({ icon: Icon, label, value, sublabel }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#121519] p-4 shadow-[0_16px_50px_rgba(0,0,0,0.18)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {label}
          </div>

          <div className="mt-2 text-xl font-bold tracking-tight text-white">
            {value}
          </div>

          {sublabel ? (
            <div className="mt-1 text-xs text-slate-500">
              {sublabel}
            </div>
          ) : null}
        </div>

        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#f2bd19]/15 bg-[#f2bd19]/10">
          <Icon className="h-5 w-5 text-[#f2bd19]" />
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ title, description, right }) {
  return (
    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h2 className="text-base font-bold text-white">
          {title}
        </h2>

        {description ? (
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
            {description}
          </p>
        ) : null}
      </div>

      {right}
    </div>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/[0.08] bg-[#0f1216] px-6 py-12 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.03]">
        <Banknote className="h-5 w-5 text-slate-500" />
      </div>

      <div className="mt-4 text-sm font-semibold text-slate-300">
        {title}
      </div>

      <div className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-600">
        {description}
      </div>
    </div>
  );
}

/* ==========================================================================
   PASSWORD LOCK
========================================================================== */

function FinanceLockScreen({
  password,
  setPassword,
  onUnlock,
  loading,
  error,
}) {
  return (
    <div className="min-h-full bg-[#0b0d10] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-120px)] max-w-xl items-center justify-center">
        <div className="w-full rounded-[28px] border border-white/[0.08] bg-[#121519] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.38)] sm:p-8">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-[#f2bd19]/20 bg-[#f2bd19]/10">
            <LockKeyhole className="h-7 w-7 text-[#f2bd19]" />
          </div>

          <div className="mt-6 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#f2bd19]">
              Admin Finance
            </div>

            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">
              Financial area locked
            </h1>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
              Enter your administrator password to open teacher
              compensation and cash reconciliation.
            </p>
          </div>

          <form
            className="mt-7 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              onUnlock();
            }}
          >
            <label className="block text-xs font-semibold text-slate-400">
              Administrator password
            </label>

            <input
              type="password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              placeholder="Enter your password"
              autoFocus
              className={inputClassName()}
            />

            {error ? (
              <div className="rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2.5 text-xs text-red-300">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading || !password}
              className={buttonClassName(
                "w-full bg-[#f2bd19] text-[#0b0d10] hover:bg-[#ffd449]",
              )}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}

              {loading
                ? "Verifying..."
                : "Unlock Finance"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   MAIN PAGE
========================================================================== */

export default function Finance() {
  const { user } = useAuth();

  const [locked, setLocked] = useState(true);
  const [password, setPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState("");

  const [tab, setTab] = useState("teacher");

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [teacherData, setTeacherData] =
    useState(EMPTY_TEACHER_DATA);

  const [shareRate, setShareRate] = useState(30);
  const [shareRateInput, setShareRateInput] = useState("30");
  const [shareRateSaving, setShareRateSaving] =
    useState(false);

  const [teacherFromDate, setTeacherFromDate] =
    useState("");
  const [teacherToDate, setTeacherToDate] =
    useState("");

  const [collectors, setCollectors] = useState([]);

  const [reconciliations, setReconciliations] =
    useState([]);

  const [
    reconciliationCollectorFilter,
    setReconciliationCollectorFilter,
  ] = useState("");

  const [
    reconciliationFromDate,
    setReconciliationFromDate,
  ] = useState("");

  const [
    reconciliationToDate,
    setReconciliationToDate,
  ] = useState("");

  const [reconciliationForm, setReconciliationForm] =
    useState({
      collector_user_id: "",
      from_solar_date: "",
      to_solar_date: "",
      handed_over_amount: "",
      notes: "",
    });

  const [expectedPreview, setExpectedPreview] =
    useState(null);

  const [expectedLoading, setExpectedLoading] =
    useState(false);

  const [
    reconciliationSaving,
    setReconciliationSaving,
  ] = useState(false);

  const [
    editingReconciliation,
    setEditingReconciliation,
  ] = useState(null);

  const [
    editReconciliationForm,
    setEditReconciliationForm,
  ] = useState({
    handed_over_amount: "",
    notes: "",
  });

  const [editSaving, setEditSaving] =
    useState(false);

  const isAdmin = user?.role === "admin";

  /* ========================================================================
     UNLOCK
  ======================================================================== */

  async function unlockFinance() {
    if (!password) {
      return;
    }

    setUnlocking(true);
    setUnlockError("");

    try {
      await api.post("/auth/verify-password", {
        password,
      });

      setPassword("");
      setLocked(false);
      setUnlockError("");
    } catch (requestError) {
      setUnlockError(
        requestError.response?.data?.error ||
          "Administrator password is incorrect.",
      );
    } finally {
      setUnlocking(false);
    }
  }

  /* ========================================================================
     DATA LOADERS
  ======================================================================== */

  async function loadTeacherData(showLoader = true) {
    if (showLoader) {
      setLoading(true);
    }

    try {
      const params = {};

      if (teacherFromDate.trim()) {
        params.from_solar_date =
          teacherFromDate.trim();
      }

      if (teacherToDate.trim()) {
        params.to_solar_date =
          teacherToDate.trim();
      }

      const response = await api.get(
        "/finance/teacher-shares",
        { params },
      );

      const data = {
        ...EMPTY_TEACHER_DATA,
        ...response.data,

        totals: {
          ...EMPTY_TEACHER_DATA.totals,
          ...(response.data?.totals || {}),
        },

        teachers: Array.isArray(response.data?.teachers)
          ? response.data.teachers
          : [],

        payments: Array.isArray(response.data?.payments)
          ? response.data.payments
          : [],
      };

      setTeacherData(data);

      const rate = Number(
        response.data?.current_share_rate ?? 30,
      );

      setShareRate(rate);
      setShareRateInput(String(rate));

      return response;
    } catch (requestError) {
      console.error(
        "Finance teacher-shares error:",
        requestError,
      );

      throw requestError;
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }

  async function loadCollectors() {
    try {
      const response = await api.get(
        "/finance/collectors",
      );

      setCollectors(
        Array.isArray(response.data)
          ? response.data
          : [],
      );

      return response;
    } catch (requestError) {
      console.error(
        "Finance collectors error:",
        requestError,
      );

      throw requestError;
    }
  }

  async function loadReconciliations(
    showLoader = true,
  ) {
    if (showLoader) {
      setLoading(true);
    }

    try {
      const params = {};

      if (reconciliationCollectorFilter) {
        params.collector_user_id =
          reconciliationCollectorFilter;
      }

      if (reconciliationFromDate.trim()) {
        params.from_solar_date =
          reconciliationFromDate.trim();
      }

      if (reconciliationToDate.trim()) {
        params.to_solar_date =
          reconciliationToDate.trim();
      }

      const response = await api.get(
        "/finance/cash-reconciliation",
        { params },
      );

      setReconciliations(
        Array.isArray(response.data)
          ? response.data
          : [],
      );

      return response;
    } catch (requestError) {
      console.error(
        "Finance reconciliation error:",
        requestError,
      );

      throw requestError;
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }

  /*
    We use Promise.allSettled so one endpoint does not prevent
    the other Finance sections from loading.

    The first failed endpoint is still surfaced clearly.
  */
  async function loadAll() {
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const results = await Promise.allSettled([
        loadTeacherData(false),
        loadCollectors(),
        loadReconciliations(false),
      ]);

      const failed = results.find(
        (result) => result.status === "rejected",
      );

      if (failed) {
        const requestError = failed.reason;

        const backendMessage =
          requestError?.response?.data?.error ||
          requestError?.response?.data?.message ||
          requestError?.message ||
          "Failed to load finance data.";

        console.error(
          "Finance load failure:",
          requestError,
        );

        setError(backendMessage);
      }
    } finally {
      setLoading(false);
    }
  }

  /* ========================================================================
     INITIAL LOAD AFTER UNLOCK
  ======================================================================== */

  useEffect(() => {
    if (locked || !isAdmin) {
      return;
    }

    loadAll();
  }, [locked, isAdmin]);

  /* ========================================================================
     RATE
  ======================================================================== */

  async function saveShareRate() {
    const value = Number(shareRateInput);

    if (
      !Number.isFinite(value) ||
      value < 0 ||
      value > 100
    ) {
      setError(
        "Teacher share percentage must be between 0 and 100.",
      );
      return;
    }

    setShareRateSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await api.put(
        "/finance/teacher-share-rate",
        {
          percentage: value,
        },
      );

      const nextRate = Number(
        response.data?.rate?.percentage ?? value,
      );

      setShareRate(nextRate);
      setShareRateInput(String(nextRate));

      setMessage(
        "Teacher share percentage updated successfully.",
      );

      await loadTeacherData(false);
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          "Failed to update teacher share percentage.",
      );
    } finally {
      setShareRateSaving(false);
    }
  }

  /* ========================================================================
     REFRESH
  ======================================================================== */

  async function refresh() {
    setRefreshing(true);
    setError("");
    setMessage("");

    try {
      await loadAll();

      setMessage("Finance data refreshed.");
    } finally {
      setRefreshing(false);
    }
  }

  /* ========================================================================
     EXPECTED CASH PREVIEW
  ======================================================================== */

  async function calculateExpectedCash() {
    if (
      !reconciliationForm.collector_user_id ||
      !reconciliationForm.from_solar_date ||
      !reconciliationForm.to_solar_date
    ) {
      setError(
        "Select a collector and enter both settlement dates.",
      );
      return;
    }

    setExpectedLoading(true);
    setError("");
    setMessage("");
    setExpectedPreview(null);

    try {
      const response = await api.get(
        "/finance/cash-reconciliation/expected",
        {
          params: {
            collector_user_id:
              reconciliationForm.collector_user_id,

            from_solar_date:
              reconciliationForm.from_solar_date.trim(),

            to_solar_date:
              reconciliationForm.to_solar_date.trim(),
          },
        },
      );

      setExpectedPreview(response.data);
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          "Could not calculate expected cash.",
      );
    } finally {
      setExpectedLoading(false);
    }
  }

  /* ========================================================================
     CREATE RECONCILIATION
  ======================================================================== */

  async function createReconciliation(event) {
    event.preventDefault();

    if (
      !reconciliationForm.collector_user_id ||
      !reconciliationForm.from_solar_date ||
      !reconciliationForm.to_solar_date
    ) {
      setError(
        "Collector, from date, and to date are required.",
      );
      return;
    }

    const handedAmount =
      reconciliationForm.handed_over_amount === ""
        ? null
        : Number(
            reconciliationForm.handed_over_amount,
          );

    if (
      handedAmount !== null &&
      (!Number.isFinite(handedAmount) ||
        handedAmount < 0)
    ) {
      setError(
        "Handed-over amount must be zero or greater.",
      );
      return;
    }

    setReconciliationSaving(true);
    setError("");
    setMessage("");

    try {
      await api.post(
        "/finance/cash-reconciliation",
        {
          collector_user_id: Number(
            reconciliationForm.collector_user_id,
          ),

          from_solar_date:
            reconciliationForm.from_solar_date.trim(),

          to_solar_date:
            reconciliationForm.to_solar_date.trim(),

          handed_over_amount: handedAmount,

          notes:
            reconciliationForm.notes.trim() || null,
        },
      );

      setReconciliationForm({
        collector_user_id: "",
        from_solar_date: "",
        to_solar_date: "",
        handed_over_amount: "",
        notes: "",
      });

      setExpectedPreview(null);

      setMessage(
        "Cash reconciliation created successfully.",
      );

      await loadReconciliations(false);
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          "Failed to create reconciliation.",
      );
    } finally {
      setReconciliationSaving(false);
    }
  }

  /* ========================================================================
     EDIT RECONCILIATION
  ======================================================================== */

  function openEditReconciliation(row) {
    setEditingReconciliation(row);

    setEditReconciliationForm({
      handed_over_amount:
        row.handed_over_amount === null ||
        row.handed_over_amount === undefined
          ? ""
          : String(row.handed_over_amount),

      notes: row.notes || "",
    });
  }

  async function saveReconciliationEdit(event) {
    event.preventDefault();

    if (!editingReconciliation) {
      return;
    }

    const handedAmount =
      editReconciliationForm.handed_over_amount === ""
        ? null
        : Number(
            editReconciliationForm.handed_over_amount,
          );

    if (
      handedAmount !== null &&
      (!Number.isFinite(handedAmount) ||
        handedAmount < 0)
    ) {
      setError(
        "Handed-over amount must be zero or greater.",
      );
      return;
    }

    setEditSaving(true);
    setError("");
    setMessage("");

    try {
      await api.put(
        `/finance/cash-reconciliation/${editingReconciliation.id}`,
        {
          handed_over_amount: handedAmount,
          notes:
            editReconciliationForm.notes.trim() ||
            null,
        },
      );

      setEditingReconciliation(null);

      setMessage(
        "Cash reconciliation updated successfully.",
      );

      await loadReconciliations(false);
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          "Failed to update reconciliation.",
      );
    } finally {
      setEditSaving(false);
    }
  }

  /* ========================================================================
     VERIFY RECONCILIATION
  ======================================================================== */

  async function verifyReconciliation(row) {
    if (
      row.handed_over_amount === null ||
      row.handed_over_amount === undefined
    ) {
      setError(
        "A handed-over amount is required before verification.",
      );
      return;
    }

    const confirmed = window.confirm(
      `Verify this cash reconciliation for ${row.collector_name} (${row.from_solar_date} → ${row.to_solar_date})?`,
    );

    if (!confirmed) {
      return;
    }

    setError("");
    setMessage("");

    try {
      await api.put(
        `/finance/cash-reconciliation/${row.id}`,
        {
          verify: true,
        },
      );

      setMessage(
        "Cash reconciliation verified.",
      );

      await loadReconciliations(false);
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          "Failed to verify reconciliation.",
      );
    }
  }

  /* ========================================================================
     DERIVED VALUES
  ======================================================================== */

  const reconciliationTotals = useMemo(() => {
    let expected = 0;
    let handed = 0;

    let matched = 0;
    let short = 0;
    let over = 0;
    let pending = 0;

    for (const row of reconciliations) {
      expected += Number(
        row.expected_amount || 0,
      );

      if (row.handed_over_amount !== null) {
        handed += Number(
          row.handed_over_amount || 0,
        );
      }

      if (row.status === "matched") {
        matched += 1;
      } else if (row.status === "short") {
        short += 1;
      } else if (row.status === "over") {
        over += 1;
      } else {
        pending += 1;
      }
    }

    return {
      expected,
      handed,
      difference: handed - expected,

      matched,
      short,
      over,
      pending,
    };
  }, [reconciliations]);

  /* ========================================================================
     ACCESS
  ======================================================================== */

  if (!isAdmin) {
    return (
      <div className="min-h-full bg-[#0b0d10] p-4 text-white sm:p-6">
        <div className="mx-auto max-w-xl rounded-2xl border border-red-400/20 bg-[#121519] p-6 text-center">
          <XCircle className="mx-auto h-8 w-8 text-red-300" />

          <h1 className="mt-4 text-lg font-bold">
            Finance is restricted
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Only administrators can access financial data.
          </p>
        </div>
      </div>
    );
  }

  if (locked) {
    return (
      <FinanceLockScreen
        password={password}
        setPassword={setPassword}
        onUnlock={unlockFinance}
        loading={unlocking}
        error={unlockError}
      />
    );
  }

  /* ========================================================================
     RENDER
  ======================================================================== */

  return (
    <div className="min-h-full bg-[#0b0d10] px-3 py-4 text-slate-100 sm:px-5 lg:px-6 lg:py-6">
      <div className="mx-auto max-w-[1700px] space-y-4 lg:space-y-5">

        {/* HEADER */}
        <div className="rounded-2xl border border-white/[0.07] bg-[#121519] p-4 shadow-[0_16px_50px_rgba(0,0,0,0.18)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#f2bd19]/15 bg-[#f2bd19]/10">
                  <Banknote className="h-5 w-5 text-[#f2bd19]" />
                </div>

                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#f2bd19]">
                    Administration
                  </div>

                  <h1 className="truncate text-xl font-bold tracking-tight text-white sm:text-2xl">
                    Finance
                  </h1>

                  <p className="mt-1 text-xs text-slate-500">
                    Teacher shares and cash reconciliation
                    built from real academy payment records.
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={refresh}
              disabled={refreshing || loading}
              className={buttonClassName(
                "border border-white/[0.08] bg-white/[0.03] text-slate-200 hover:bg-white/[0.06]",
              )}
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}

              Refresh
            </button>
          </div>

          {(message || error) && (
            <div className="mt-4 space-y-2">
              {message ? (
                <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2.5 text-xs text-emerald-300">
                  {message}
                </div>
              ) : null}

              {error ? (
                <div className="rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2.5 text-xs text-red-300">
                  {error}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* TABS */}
        <div className="flex rounded-xl border border-white/[0.07] bg-[#121519] p-1">
          <button
            type="button"
            onClick={() => setTab("teacher")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
              tab === "teacher"
                ? "bg-[#f2bd19] text-[#0b0d10]"
                : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
            }`}
          >
            <Users className="h-4 w-4" />
            Teacher Shares
          </button>

          <button
            type="button"
            onClick={() => setTab("cash")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
              tab === "cash"
                ? "bg-[#f2bd19] text-[#0b0d10]"
                : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
            }`}
          >
            <WalletCards className="h-4 w-4" />
            Cash Reconciliation
          </button>
        </div>

        {/* ==================================================================
            TEACHER TAB
        ================================================================== */}

        {tab === "teacher" ? (
          <div className="space-y-4 lg:space-y-5">

            {/* RATE + FILTER */}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">

              {/* RATE */}
              <div className="rounded-2xl border border-white/[0.07] bg-[#121519] p-4">
                <SectionHeader
                  title="Teacher share settings"
                  description="The rate is versioned. New rates take effect from the time they are changed, while previous payment calculations keep their original rate."
                />

                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="max-w-[260px] flex-1">
                    <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                      Current share percentage
                    </label>

                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={shareRateInput}
                        onChange={(event) =>
                          setShareRateInput(
                            event.target.value,
                          )
                        }
                        className={`${inputClassName()} pr-12`}
                      />

                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">
                        %
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={saveShareRate}
                    disabled={shareRateSaving}
                    className={buttonClassName(
                      "bg-[#f2bd19] text-[#0b0d10] hover:bg-[#ffd449]",
                    )}
                  >
                    {shareRateSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}

                    Save rate
                  </button>
                </div>

                <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
                  <ShieldCheck className="h-4 w-4 text-[#f2bd19]" />

                  Current backend rate:

                  <span className="font-semibold text-slate-300">
                    {shareRate}%
                  </span>
                </div>
              </div>

              {/* FILTER */}
              <div className="rounded-2xl border border-white/[0.07] bg-[#121519] p-4">
                <SectionHeader
                  title="Payment period"
                  description="Leave both blank to show all recorded payments."
                />

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                      From — Solar Hijri
                    </label>

                    <input
                      type="text"
                      value={teacherFromDate}
                      onChange={(event) =>
                        setTeacherFromDate(
                          event.target.value,
                        )
                      }
                      placeholder={SOLAR_PLACEHOLDER}
                      className={inputClassName()}
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                      To — Solar Hijri
                    </label>

                    <input
                      type="text"
                      value={teacherToDate}
                      onChange={(event) =>
                        setTeacherToDate(
                          event.target.value,
                        )
                      }
                      placeholder={SOLAR_PLACEHOLDER}
                      className={inputClassName()}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => loadTeacherData(true)}
                  disabled={loading}
                  className={buttonClassName(
                    "mt-3 w-full border border-white/[0.08] bg-white/[0.03] text-slate-200 hover:bg-white/[0.06]",
                  )}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CalendarRange className="h-4 w-4" />
                  )}

                  Apply period
                </button>
              </div>
            </div>

            {/* STATS */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard
                icon={Banknote}
                label="Recorded payments"
                value={money(
                  teacherData.totals
                    .total_payment_amount,
                )}
                sublabel={`${teacherData.totals.payment_count} payment records`}
              />

              <StatCard
                icon={CheckCircle2}
                label="Teacher attributable"
                value={money(
                  teacherData.totals
                    .attributable_amount,
                )}
                sublabel="Traceable payment allocations"
              />

              <StatCard
                icon={Users}
                label="Teacher share"
                value={money(
                  teacherData.totals
                    .teacher_share_amount,
                )}
                sublabel={`${shareRate}% current rate`}
              />

              <StatCard
                icon={AlertTriangle}
                label="Unattributed"
                value={money(
                  teacherData.totals
                    .unattributed_amount,
                )}
                sublabel="Not currently traceable to a teacher"
              />

              <StatCard
                icon={ShieldCheck}
                label="Teachers"
                value={
                  teacherData.totals.teacher_count
                }
                sublabel="Teachers with attributable payments"
              />
            </div>

            {/* TEACHER SUMMARY */}
            <div className="rounded-2xl border border-white/[0.07] bg-[#121519] p-4">
              <SectionHeader
                title="Teacher compensation summary"
                description="Each amount comes from actual payment allocations. The student's original payment amount remains untouched."
              />

              {teacherData.teachers.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left">
                    <thead>
                      <tr className="border-b border-white/[0.07] text-[11px] uppercase tracking-[0.14em] text-slate-600">
                        <th className="px-3 py-3 font-semibold">
                          Teacher
                        </th>

                        <th className="px-3 py-3 font-semibold">
                          Payments
                        </th>

                        <th className="px-3 py-3 font-semibold">
                          Attributable
                        </th>

                        <th className="px-3 py-3 font-semibold">
                          Share
                        </th>

                        <th className="px-3 py-3 font-semibold">
                          Effective rate
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {teacherData.teachers.map(
                        (teacher) => (
                          <tr
                            key={teacher.teacher_id}
                            className="border-b border-white/[0.05] last:border-b-0"
                          >
                            <td className="px-3 py-3">
                              <div className="font-semibold text-slate-200">
                                {teacher.teacher_name}
                              </div>
                            </td>

                            <td className="px-3 py-3 text-sm text-slate-400">
                              {teacher.payment_count}
                            </td>

                            <td className="px-3 py-3 text-sm font-semibold text-slate-300">
                              {money(
                                teacher.attributable_amount,
                              )}
                            </td>

                            <td className="px-3 py-3 text-sm font-bold text-[#f2bd19]">
                              {money(
                                teacher.teacher_share_amount,
                              )}
                            </td>

                            <td className="px-3 py-3 text-sm text-slate-400">
                              Preserved per payment
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  title="No attributable teacher payments"
                  description="There are currently no payment allocations connected to teachers for the selected period."
                />
              )}
            </div>

            {/* PAYMENT TRACE */}
            <div className="rounded-2xl border border-white/[0.07] bg-[#121519] p-4">
              <SectionHeader
                title="Payment attribution"
                description="This is the audit-friendly detail view showing exactly which real payment allocation produced the teacher share."
              />

              {teacherData.payments.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1250px] text-left">
                    <thead>
                      <tr className="border-b border-white/[0.07] text-[11px] uppercase tracking-[0.14em] text-slate-600">
                        <th className="px-3 py-3 font-semibold">
                          Date
                        </th>

                        <th className="px-3 py-3 font-semibold">
                          Student
                        </th>

                        <th className="px-3 py-3 font-semibold">
                          Payment
                        </th>

                        <th className="px-3 py-3 font-semibold">
                          Subject
                        </th>

                        <th className="px-3 py-3 font-semibold">
                          Teacher
                        </th>

                        <th className="px-3 py-3 font-semibold">
                          Attributable
                        </th>

                        <th className="px-3 py-3 font-semibold">
                          Rate
                        </th>

                        <th className="px-3 py-3 font-semibold">
                          Teacher share
                        </th>

                        <th className="px-3 py-3 font-semibold">
                          Collected by
                        </th>

                        <th className="px-3 py-3 font-semibold">
                          Receipt
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {teacherData.payments.map(
                        (payment) => (
                          <tr
                            key={`${payment.payment_id}-${payment.allocation_id || "unallocated"}`}
                            className="border-b border-white/[0.05] last:border-b-0"
                          >
                            {/* DATE */}
                            <td className="px-3 py-3 align-top">
                              <div className="text-sm font-semibold text-slate-300">
                                {payment.payment_solar_date ||
                                  normalDate(
                                    payment.payment_date,
                                  )}
                              </div>
                            </td>

                            {/* STUDENT */}
                            <td className="px-3 py-3 align-top">
                              <div className="font-semibold text-slate-200">
                                {payment.student_name ||
                                  "Unknown"}
                              </div>

                              <div className="mt-0.5 text-xs text-slate-600">
                                Roll:{" "}
                                {payment.roll_number ||
                                  "—"}
                              </div>
                            </td>

                            {/* PAYMENT */}
                            <td className="px-3 py-3 align-top">
                              <div className="font-bold text-slate-200">
                                {money(
                                  payment.payment_amount,
                                )}
                              </div>

                              <div className="mt-0.5 text-xs text-slate-600">
                                {payment.receipt_number ||
                                  "No receipt"}
                              </div>
                            </td>

                            {/* SUBJECT */}
                            <td className="px-3 py-3 align-top">
                              <div className="text-sm text-slate-300">
                                {payment.subject_name ||
                                  "Unattributed"}
                              </div>

                              {payment.subject_code ? (
                                <div className="mt-0.5 text-xs text-slate-600">
                                  {payment.subject_code}
                                </div>
                              ) : null}
                            </td>

                            {/* TEACHER */}
                            <td className="px-3 py-3 align-top">
                              {payment.teacher_name ? (
                                <>
                                  <div className="font-semibold text-slate-200">
                                    {payment.teacher_name}
                                  </div>

                                  {payment.covered_days !==
                                  null ? (
                                    <div className="mt-0.5 text-xs text-slate-600">
                                      {
                                        payment.covered_days
                                      }{" "}
                                      covered day
                                      {payment.covered_days ===
                                      1
                                        ? ""
                                        : "s"}
                                    </div>
                                  ) : null}
                                </>
                              ) : (
                                <span className="text-xs text-amber-300">
                                  Unattributed
                                </span>
                              )}
                            </td>

                            {/* ATTRIBUTABLE */}
                            <td className="px-3 py-3 align-top">
                              <span className="font-semibold text-slate-300">
                                {payment.allocated_amount !==
                                null
                                  ? money(
                                      payment.allocated_amount,
                                    )
                                  : "—"}
                              </span>
                            </td>

                            {/* RATE */}
                            <td className="px-3 py-3 align-top">
                              <span className="rounded-lg border border-[#f2bd19]/15 bg-[#f2bd19]/10 px-2 py-1 text-xs font-bold text-[#f2bd19]">
                                {payment.share_percent}%
                              </span>
                            </td>

                            {/* SHARE */}
                            <td className="px-3 py-3 align-top">
                              <span className="font-bold text-[#f2bd19]">
                                {payment.teacher_share_amount
                                  ? money(
                                      payment.teacher_share_amount,
                                    )
                                  : "—"}
                              </span>
                            </td>

                            {/* COLLECTOR */}
                            <td className="px-3 py-3 align-top">
                              <div className="text-sm text-slate-300">
                                {payment.collector_name ||
                                  "Unassigned"}
                              </div>

                              {payment.collector_role ? (
                                <div className="mt-0.5 text-xs uppercase tracking-wide text-slate-600">
                                  {
                                    payment.collector_role
                                  }
                                </div>
                              ) : null}
                            </td>

                            {/* RECEIPT */}
                            <td className="px-3 py-3 align-top">
                              <span className="text-xs text-slate-500">
                                {payment.receipt_number ||
                                  "—"}
                              </span>
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  title="No payment records"
                  description="No real payments were found for the selected period."
                />
              )}
            </div>
          </div>
        ) : null}

        {/* ==================================================================
            CASH TAB
        ================================================================== */}

        {tab === "cash" ? (
          <div className="space-y-4 lg:space-y-5">

            {/* CREATE */}
            <div className="rounded-2xl border border-white/[0.07] bg-[#121519] p-4">
              <SectionHeader
                title="New cash reconciliation"
                description="Choose one collector and one settlement period. Expected cash is calculated directly from payments that were recorded under that collector."
              />

              <form
                onSubmit={createReconciliation}
                className="grid gap-3 xl:grid-cols-6"
              >
                {/* COLLECTOR */}
                <div className="xl:col-span-1">
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                    Collector
                  </label>

                  <div className="relative">
                    <select
                      value={
                        reconciliationForm.collector_user_id
                      }
                      onChange={(event) => {
                        setReconciliationForm(
                          (current) => ({
                            ...current,
                            collector_user_id:
                              event.target.value,
                          }),
                        );

                        setExpectedPreview(null);
                      }}
                      className={`${inputClassName()} appearance-none pr-10`}
                    >
                      <option value="">
                        Select collector
                      </option>

                      {collectors.map(
                        (collector) => (
                          <option
                            key={collector.id}
                            value={collector.id}
                          >
                            {collector.full_name} —{" "}
                            {collector.role}
                          </option>
                        ),
                      )}
                    </select>

                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
                  </div>
                </div>

                {/* FROM */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                    From — Solar Hijri
                  </label>

                  <input
                    type="text"
                    value={
                      reconciliationForm.from_solar_date
                    }
                    onChange={(event) => {
                      setReconciliationForm(
                        (current) => ({
                          ...current,
                          from_solar_date:
                            event.target.value,
                        }),
                      );

                      setExpectedPreview(null);
                    }}
                    placeholder={SOLAR_PLACEHOLDER}
                    className={inputClassName()}
                  />
                </div>

                {/* TO */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                    To — Solar Hijri
                  </label>

                  <input
                    type="text"
                    value={
                      reconciliationForm.to_solar_date
                    }
                    onChange={(event) => {
                      setReconciliationForm(
                        (current) => ({
                          ...current,
                          to_solar_date:
                            event.target.value,
                        }),
                      );

                      setExpectedPreview(null);
                    }}
                    placeholder={SOLAR_PLACEHOLDER}
                    className={inputClassName()}
                  />
                </div>

                {/* HANDOVER */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                    Handed over
                  </label>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={
                      reconciliationForm.handed_over_amount
                    }
                    onChange={(event) =>
                      setReconciliationForm(
                        (current) => ({
                          ...current,
                          handed_over_amount:
                            event.target.value,
                        }),
                      )
                    }
                    placeholder="Optional"
                    className={inputClassName()}
                  />
                </div>

                {/* NOTES */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                    Notes
                  </label>

                  <input
                    type="text"
                    value={reconciliationForm.notes}
                    onChange={(event) =>
                      setReconciliationForm(
                        (current) => ({
                          ...current,
                          notes: event.target.value,
                        }),
                      )
                    }
                    placeholder="Optional notes"
                    className={inputClassName()}
                  />
                </div>

                {/* ACTIONS */}
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={
                      calculateExpectedCash
                    }
                    disabled={expectedLoading}
                    className={buttonClassName(
                      "flex-1 border border-white/[0.08] bg-white/[0.03] text-slate-200 hover:bg-white/[0.06]",
                    )}
                  >
                    {expectedLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Banknote className="h-4 w-4" />
                    )}

                    Calculate
                  </button>

                  <button
                    type="submit"
                    disabled={reconciliationSaving}
                    className={buttonClassName(
                      "flex-1 bg-[#f2bd19] text-[#0b0d10] hover:bg-[#ffd449]",
                    )}
                  >
                    {reconciliationSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}

                    Save
                  </button>
                </div>
              </form>

              {/* EXPECTED PREVIEW */}
              {expectedPreview ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/[0.07] bg-[#0f1216] p-3">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-slate-600">
                      Collector
                    </div>

                    <div className="mt-1 font-semibold text-slate-200">
                      {
                        expectedPreview.collector
                          ?.full_name
                      }
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/[0.07] bg-[#0f1216] p-3">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-slate-600">
                      Expected cash
                    </div>

                    <div className="mt-1 text-lg font-bold text-[#f2bd19]">
                      {money(
                        expectedPreview.expected_amount,
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/[0.07] bg-[#0f1216] p-3">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-slate-600">
                      Payment count
                    </div>

                    <div className="mt-1 text-lg font-bold text-white">
                      {
                        expectedPreview.payment_count
                      }
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* FILTERS */}
            <div className="rounded-2xl border border-white/[0.07] bg-[#121519] p-4">
              <SectionHeader
                title="Reconciliation history"
                description="Historical reconciliations are kept. Shortages and overages are never silently removed."
              />

              <div className="grid gap-3 md:grid-cols-4">

                {/* COLLECTOR */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                    Collector
                  </label>

                  <div className="relative">
                    <select
                      value={
                        reconciliationCollectorFilter
                      }
                      onChange={(event) =>
                        setReconciliationCollectorFilter(
                          event.target.value,
                        )
                      }
                      className={`${inputClassName()} appearance-none pr-10`}
                    >
                      <option value="">
                        All collectors
                      </option>

                      {collectors.map(
                        (collector) => (
                          <option
                            key={collector.id}
                            value={collector.id}
                          >
                            {collector.full_name}
                          </option>
                        ),
                      )}
                    </select>

                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
                  </div>
                </div>

                {/* FROM */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                    From — Solar Hijri
                  </label>

                  <input
                    type="text"
                    value={reconciliationFromDate}
                    onChange={(event) =>
                      setReconciliationFromDate(
                        event.target.value,
                      )
                    }
                    placeholder={SOLAR_PLACEHOLDER}
                    className={inputClassName()}
                  />
                </div>

                {/* TO */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                    To — Solar Hijri
                  </label>

                  <input
                    type="text"
                    value={reconciliationToDate}
                    onChange={(event) =>
                      setReconciliationToDate(
                        event.target.value,
                      )
                    }
                    placeholder={SOLAR_PLACEHOLDER}
                    className={inputClassName()}
                  />
                </div>

                {/* FILTER BUTTON */}
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() =>
                      loadReconciliations(true)
                    }
                    disabled={loading}
                    className={buttonClassName(
                      "w-full border border-white/[0.08] bg-white/[0.03] text-slate-200 hover:bg-white/[0.06]",
                    )}
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CalendarRange className="h-4 w-4" />
                    )}

                    Apply filters
                  </button>
                </div>
              </div>
            </div>

            {/* CASH STATS */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <StatCard
                icon={Banknote}
                label="Expected"
                value={money(
                  reconciliationTotals.expected,
                )}
                sublabel="Selected history"
              />

              <StatCard
                icon={WalletCards}
                label="Handed over"
                value={money(
                  reconciliationTotals.handed,
                )}
                sublabel="Recorded physical handovers"
              />

              <StatCard
                icon={AlertTriangle}
                label="Difference"
                value={money(
                  Math.abs(
                    reconciliationTotals.difference,
                  ),
                )}
                sublabel={
                  reconciliationTotals.difference === 0
                    ? "No net difference"
                    : reconciliationTotals.difference <
                        0
                      ? "Net short"
                      : "Net over"
                }
              />

              <StatCard
                icon={CheckCircle2}
                label="Matched"
                value={
                  reconciliationTotals.matched
                }
                sublabel="Zero-difference settlements"
              />

              <StatCard
                icon={XCircle}
                label="Short"
                value={reconciliationTotals.short}
                sublabel="Shortage settlements"
              />

              <StatCard
                icon={Clock3}
                label="Pending"
                value={
                  reconciliationTotals.pending
                }
                sublabel={`${reconciliationTotals.over} over settlement${
                  reconciliationTotals.over === 1
                    ? ""
                    : "s"
                }`}
              />
            </div>

            {/* TABLE */}
            <div className="rounded-2xl border border-white/[0.07] bg-[#121519] p-4">
              {reconciliations.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1200px] text-left">
                    <thead>
                      <tr className="border-b border-white/[0.07] text-[11px] uppercase tracking-[0.14em] text-slate-600">
                        <th className="px-3 py-3 font-semibold">
                          Collector
                        </th>

                        <th className="px-3 py-3 font-semibold">
                          Period
                        </th>

                        <th className="px-3 py-3 font-semibold">
                          Payments
                        </th>

                        <th className="px-3 py-3 font-semibold">
                          Expected
                        </th>

                        <th className="px-3 py-3 font-semibold">
                          Handed over
                        </th>

                        <th className="px-3 py-3 font-semibold">
                          Difference
                        </th>

                        <th className="px-3 py-3 font-semibold">
                          Status
                        </th>

                        <th className="px-3 py-3 font-semibold">
                          Verification
                        </th>

                        <th className="px-3 py-3 font-semibold">
                          Actions
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {reconciliations.map(
                        (row) => (
                          <tr
                            key={row.id}
                            className="border-b border-white/[0.05] last:border-b-0"
                          >
                            {/* COLLECTOR */}
                            <td className="px-3 py-3 align-top">
                              <div className="font-semibold text-slate-200">
                                {row.collector_name}
                              </div>

                              <div className="mt-0.5 text-xs uppercase tracking-wide text-slate-600">
                                {row.collector_role}
                              </div>
                            </td>

                            {/* PERIOD */}
                            <td className="px-3 py-3 align-top">
                              <div className="text-sm font-semibold text-slate-300">
                                {row.from_solar_date}
                              </div>

                              <div className="mt-0.5 text-xs text-slate-600">
                                to{" "}
                                {row.to_solar_date}
                              </div>
                            </td>

                            {/* PAYMENTS */}
                            <td className="px-3 py-3 align-top text-sm text-slate-400">
                              {row.payment_count}
                            </td>

                            {/* EXPECTED */}
                            <td className="px-3 py-3 align-top text-sm font-bold text-slate-200">
                              {money(
                                row.expected_amount,
                              )}
                            </td>

                            {/* HANDED */}
                            <td className="px-3 py-3 align-top text-sm font-semibold text-slate-300">
                              {row.handed_over_amount ===
                              null
                                ? "Not handed over"
                                : money(
                                    row.handed_over_amount,
                                  )}
                            </td>

                            {/* DIFFERENCE */}
                            <td className="px-3 py-3 align-top">
                              {row.difference ===
                              null ? (
                                <span className="text-xs text-slate-600">
                                  —
                                </span>
                              ) : (
                                <span
                                  className={
                                    row.difference ===
                                    0
                                      ? "font-bold text-emerald-300"
                                      : row.difference <
                                          0
                                        ? "font-bold text-red-300"
                                        : "font-bold text-amber-300"
                                  }
                                >
                                  {row.difference > 0
                                    ? "+"
                                    : ""}
                                  {money(
                                    row.difference,
                                  )}
                                </span>
                              )}
                            </td>

                            {/* STATUS */}
                            <td className="px-3 py-3 align-top">
                              <span
                                className={`inline-flex rounded-lg border px-2 py-1 text-xs font-semibold ${statusClasses(
                                  row.status,
                                )}`}
                              >
                                {statusLabel(
                                  row.status,
                                )}
                              </span>
                            </td>

                            {/* VERIFICATION */}
                            <td className="px-3 py-3 align-top">
                              {row.verification_date ? (
                                <div>
                                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    Verified
                                  </div>

                                  <div className="mt-1 text-xs text-slate-600">
                                    {
                                      row.verification_solar_date
                                    }
                                  </div>

                                  <div className="mt-0.5 text-xs text-slate-600">
                                    by{" "}
                                    {row.verified_by_name ||
                                      "Admin"}
                                  </div>
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                                  <Clock3 className="h-3.5 w-3.5" />
                                  Unverified
                                </span>
                              )}
                            </td>

                            {/* ACTIONS */}
                            <td className="px-3 py-3 align-top">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    openEditReconciliation(
                                      row,
                                    )
                                  }
                                  className={buttonClassName(
                                    "border border-white/[0.08] bg-white/[0.03] px-2.5 py-2 text-xs text-slate-300 hover:bg-white/[0.06]",
                                  )}
                                >
                                  Edit
                                </button>

                                {!row.verification_date &&
                                row.handed_over_amount !==
                                  null ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      verifyReconciliation(
                                        row,
                                      )
                                    }
                                    className={buttonClassName(
                                      "border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-2 text-xs text-emerald-300 hover:bg-emerald-400/15",
                                    )}
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                    Verify
                                  </button>
                                ) : null}
                              </div>

                              {row.notes ? (
                                <div className="mt-2 max-w-xs text-xs leading-5 text-slate-600">
                                  {row.notes}
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  title="No reconciliations"
                  description="No cash reconciliation records match the selected filters."
                />
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* ====================================================================
          EDIT MODAL
      ==================================================================== */}

      {editingReconciliation ? (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/[0.08] bg-[#121519] p-5 shadow-[0_30px_100px_rgba(0,0,0,0.5)]">

            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f2bd19]">
                  Cash reconciliation
                </div>

                <h3 className="mt-1 text-lg font-bold text-white">
                  Update handover
                </h3>

                <p className="mt-1 text-xs text-slate-500">
                  {editingReconciliation.collector_name} ·{" "}
                  {editingReconciliation.from_solar_date}{" "}
                  →{" "}
                  {editingReconciliation.to_solar_date}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setEditingReconciliation(null)
                }
                className="grid h-9 w-9 place-items-center rounded-lg border border-white/[0.08] text-slate-500 hover:bg-white/[0.04] hover:text-white"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 rounded-xl border border-white/[0.07] bg-[#0f1216] p-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.14em] text-slate-600">
                    Expected
                  </div>

                  <div className="mt-1 font-bold text-slate-200">
                    {money(
                      editingReconciliation.expected_amount,
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] uppercase tracking-[0.14em] text-slate-600">
                    Current handed
                  </div>

                  <div className="mt-1 font-bold text-slate-200">
                    {editingReconciliation.handed_over_amount ===
                    null
                      ? "—"
                      : money(
                          editingReconciliation.handed_over_amount,
                        )}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] uppercase tracking-[0.14em] text-slate-600">
                    Current status
                  </div>

                  <div className="mt-1">
                    <span
                      className={`inline-flex rounded-lg border px-2 py-1 text-xs font-semibold ${statusClasses(
                        editingReconciliation.status,
                      )}`}
                    >
                      {statusLabel(
                        editingReconciliation.status,
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <form
              onSubmit={saveReconciliationEdit}
              className="mt-5 space-y-4"
            >
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                  Handed-over amount
                </label>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={
                    editReconciliationForm.handed_over_amount
                  }
                  onChange={(event) =>
                    setEditReconciliationForm(
                      (current) => ({
                        ...current,
                        handed_over_amount:
                          event.target.value,
                      }),
                    )
                  }
                  className={inputClassName()}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                  Notes
                </label>

                <textarea
                  rows={4}
                  value={editReconciliationForm.notes}
                  onChange={(event) =>
                    setEditReconciliationForm(
                      (current) => ({
                        ...current,
                        notes: event.target.value,
                      }),
                    )
                  }
                  className={`${inputClassName()} resize-none`}
                />
              </div>

              <div className="rounded-xl border border-amber-400/15 bg-amber-400/5 px-3 py-2.5 text-xs leading-5 text-amber-200/80">
                Changing the handed-over amount automatically
                recalculates the difference and removes previous
                verification so the new figures must be verified again.
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setEditingReconciliation(null)
                  }
                  className={buttonClassName(
                    "flex-1 border border-white/[0.08] bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]",
                  )}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={editSaving}
                  className={buttonClassName(
                    "flex-1 bg-[#f2bd19] text-[#0b0d10] hover:bg-[#ffd449]",
                  )}
                >
                  {editSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}

                  Save changes
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
