import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/Toast";
import {
  Plus,
  Search,
  Loader2,
  Wallet,
  Receipt,
  RefreshCw,
  UserRound,
  CheckCircle2,
  Clock3,
  AlertCircle,
  X,
  CreditCard,
  ArrowUpRight,
  CircleDollarSign,
} from "lucide-react";

/* =========================================================
   FEES / PAYMENTS PAGE
========================================================= */

export default function Fees() {
  const { user } = useAuth();
  const toast = useToast();

  const canEdit = ["admin", "staff"].includes(user?.role);

  const [rows, setRows] = useState(null);
  const [students, setStudents] = useState([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [loadingFees, setLoadingFees] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);

  const [error, setError] = useState("");

  const [modal, setModal] = useState(null);

  /* =======================================================
     LOAD FEES
  ======================================================= */

  async function loadFees() {
    try {
      setLoadingFees(true);
      setError("");

      const params = new URLSearchParams();

      if (statusFilter) {
        params.set("status", statusFilter);
      }

      const url = params.toString() ? `/fees?${params.toString()}` : "/fees";

      const { data } = await api.get(url);

      if (!Array.isArray(data)) {
        throw new Error("Invalid fees response");
      }

      setRows(data);
    } catch (err) {
      console.error("Failed to load fees:", err);

      setRows([]);
      setError(
        err.response?.data?.error ||
          "Unable to load payment records from the database.",
      );
    } finally {
      setLoadingFees(false);
    }
  }

  /* =======================================================
     LOAD STUDENTS
  ======================================================= */

  async function loadStudents() {
    if (!canEdit) return;

    try {
      setLoadingStudents(true);

      const { data } = await api.get("/students");

      if (!Array.isArray(data)) {
        throw new Error("Invalid students response");
      }

      setStudents(data);
    } catch (err) {
      console.error("Failed to load students:", err);

      setStudents([]);

      toast.error(err.response?.data?.error || "Unable to load students.");
    } finally {
      setLoadingStudents(false);
    }
  }

  /* =======================================================
     INITIAL LOAD
  ======================================================= */

  useEffect(() => {
    loadFees();

    if (canEdit) {
      loadStudents();
    }
  }, []);

  /* =======================================================
     STATUS FILTER
  ======================================================= */

  useEffect(() => {
    const timer = setTimeout(() => {
      loadFees();
    }, 200);

    return () => clearTimeout(timer);
  }, [statusFilter]);

  /* =======================================================
     SEARCH
  ======================================================= */

  const filteredRows = useMemo(() => {
    if (!Array.isArray(rows)) return [];

    const value = search.trim().toLowerCase();

    if (!value) return rows;

    return rows.filter((row) => {
      const fields = [
        row.student_name,
        row.roll_number,
        row.class_name,
        row.receipt_number,
        row.academic_year,
      ];

      return fields.some((field) =>
        String(field || "")
          .toLowerCase()
          .includes(value),
      );
    });
  }, [rows, search]);

  /* =======================================================
     SUMMARY
  ======================================================= */

  const summary = useMemo(() => {
    const data = Array.isArray(rows) ? rows : [];

    let total = 0;
    let paid = 0;
    let due = 0;

    data.forEach((row) => {
      total += Number(row.total_amount || 0);
      paid += Number(row.paid_amount || 0);
      due += Number(row.due_amount || 0);
    });

    return {
      total,
      paid,
      due,
      records: data.length,
    };
  }, [rows]);

  /* =======================================================
     CREATE FEE
  ======================================================= */

  async function createFee(form) {
    try {
      await api.post("/fees", form);

      toast.success("Fee record created successfully.");

      setModal(null);

      await loadFees();
    } catch (err) {
      console.error("Failed to create fee:", err);

      toast.error(err.response?.data?.error || "Unable to create fee record.");

      throw err;
    }
  }

  /* =======================================================
     RECORD PAYMENT
  ======================================================= */

  async function recordPayment(id, amount) {
    try {
      await api.post(`/fees/${id}/pay`, {
        amount,
      });

      toast.success("Payment recorded successfully.");

      setModal(null);

      await loadFees();
    } catch (err) {
      console.error("Failed to record payment:", err);

      toast.error(err.response?.data?.error || "Unable to record payment.");

      throw err;
    }
  }

  /* =======================================================
     FORMAT MONEY
  ======================================================= */

  function formatMoney(value) {
    const number = Number(value || 0);

    return number.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  /* =======================================================
     FORMAT DATE
  ======================================================= */

  function formatDate(value) {
    if (!value) return "-";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  const isStudent = user?.role === "student";

  return (
    <div className="relative min-h-full text-white">
      {/* =================================================
          AMBIENT BACKGROUND
      ================================================= */}

      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-260px] right-[-180px] w-[600px] h-[600px] rounded-full bg-[#f2bd19]/[0.025] blur-[140px]" />

        <div className="absolute bottom-[-300px] left-[-180px] w-[500px] h-[500px] rounded-full bg-white/[0.012] blur-[130px]" />
      </div>

      <div
        className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative z-10 space-y-5">
        {/* =================================================
            PAGE HEADER
        ================================================= */}

        <div className="relative bg-[#121519] border border-white/[0.08] rounded-xl overflow-hidden shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
          <div className="h-[2px] w-full bg-[#f2bd19]" />

          <div className="p-4">
            <div className="flex flex-col xl:flex-row xl:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="absolute inset-[-5px] rounded-xl border border-[#f2bd19]/10" />

                  <div className="relative w-10 h-10 rounded-lg bg-[#f2bd19]/10 border border-[#f2bd19]/15 text-[#f2bd19] flex items-center justify-center">
                    <Wallet className="w-5 h-5" />
                  </div>
                </div>

                <div>
                  <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-white">
                    {isStudent ? "My Fees" : "Fees & Payments"}
                  </h2>

                  <p className="text-[11px] text-slate-500 mt-1">
                    {isStudent
                      ? "View your fee records and payment status"
                      : "Manage student fees, payments and receipts"}
                  </p>
                </div>
              </div>

              <div className="xl:ml-auto flex flex-col sm:flex-row gap-2">
                {/* SEARCH */}

                {!isStudent && (
                  <div className="relative group">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-[#f2bd19] transition-colors pointer-events-none" />

                    <input
                      className="w-full sm:w-64 h-9 pl-9 pr-3 rounded-lg bg-[#0d1013] border border-white/[0.08] text-[12px] text-slate-200 placeholder:text-slate-600 outline-none transition-all focus:border-[#f2bd19]/50 focus:ring-2 focus:ring-[#f2bd19]/10 hover:border-white/[0.14]"
                      placeholder="Search student, roll, receipt"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                )}

                {/* STATUS */}

                <select
                  className="w-full sm:w-36 h-9 px-3 rounded-lg bg-[#0d1013] border border-white/[0.08] text-[12px] text-slate-300 outline-none focus:border-[#f2bd19]/50 focus:ring-2 focus:ring-[#f2bd19]/10"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{ colorScheme: "dark" }}
                >
                  <option value="">All Status</option>
                  <option value="paid">Paid</option>
                  <option value="partial">Partial</option>
                  <option value="pending">Pending</option>
                </select>

                {/* REFRESH */}

                <button
                  type="button"
                  onClick={loadFees}
                  disabled={loadingFees}
                  className="h-9 px-3 rounded-lg bg-[#0d1013] border border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.025] text-slate-400 hover:text-slate-200 flex items-center justify-center gap-2 text-[12px] transition-all disabled:opacity-50"
                  title="Refresh payment records"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${loadingFees ? "animate-spin" : ""}`}
                  />

                  <span className="hidden sm:inline">Refresh</span>
                </button>

                {/* ADD */}

                {canEdit && (
                  <button
                    type="button"
                    className="h-9 px-4 bg-[#f2bd19] hover:bg-[#e5ae08] active:bg-[#d9a912] text-[#111] rounded-lg text-[12px] font-bold flex items-center justify-center gap-2 transition-all shadow-[0_6px_20px_rgba(242,189,25,0.12)] hover:shadow-[0_8px_25px_rgba(242,189,25,0.2)]"
                    onClick={() =>
                      setModal({
                        mode: "create",
                      })
                    }
                  >
                    <Plus className="w-4 h-4" />
                    New Fee
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* =================================================
            SUMMARY CARDS
        ================================================= */}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard
            icon={Wallet}
            title="Total Fees"
            value={formatMoney(summary.total)}
            accent="gold"
          />

          <SummaryCard
            icon={CheckCircle2}
            title="Total Paid"
            value={formatMoney(summary.paid)}
            accent="green"
          />

          <SummaryCard
            icon={AlertCircle}
            title="Total Due"
            value={formatMoney(summary.due)}
            accent="red"
          />

          <SummaryCard
            icon={Receipt}
            title="Fee Records"
            value={summary.records}
            accent="blue"
          />
        </div>

        {/* =================================================
            ERROR
        ================================================= */}

        {error && (
          <div className="bg-[#151113] border border-red-500/20 rounded-xl px-4 py-3 text-[12px] text-red-300 flex items-center justify-between gap-3 shadow-[0_10px_30px_rgba(0,0,0,0.15)]">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />

              <span>{error}</span>
            </div>

            <button
              type="button"
              onClick={loadFees}
              className="shrink-0 px-3 py-1.5 bg-white/[0.03] border border-red-500/20 rounded-lg text-[11px] font-medium text-red-300 hover:bg-red-500/10 transition"
            >
              Try again
            </button>
          </div>
        )}

        {/* =================================================
            TABLE
        ================================================= */}

        <div className="bg-[#121519] border border-white/[0.08] rounded-xl shadow-[0_18px_50px_rgba(0,0,0,0.22)] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.07] flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#f2bd19] shadow-[0_0_8px_rgba(242,189,25,0.6)]" />

                <h3 className="font-semibold text-white text-[13px]">
                  Payment Records
                </h3>
              </div>

              <p className="text-[10px] text-slate-600 mt-1.5 ml-3.5">
                {isStudent
                  ? "Your fee and payment history"
                  : "Fee records loaded from the database"}
              </p>
            </div>

            {!loadingFees && (
              <span className="px-2 py-1 rounded-md bg-white/[0.025] border border-white/[0.06] text-[10px] text-slate-500">
                {filteredRows.length}{" "}
                {filteredRows.length === 1 ? "record" : "records"}
              </span>
            )}
          </div>

          {loadingFees ? (
            <div className="min-h-[320px] grid place-items-center text-slate-600">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#f2bd19]/[0.06] border border-[#f2bd19]/10 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-[#f2bd19] animate-spin" />
                </div>

                <span className="text-[11px] text-slate-600">
                  Loading payment records...
                </span>
              </div>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="min-h-[320px] grid place-items-center text-slate-600">
              <div className="text-center">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-white/[0.025] border border-white/[0.06] flex items-center justify-center">
                  <Wallet className="w-6 h-6 opacity-40" />
                </div>

                <div className="text-[13px] font-medium text-slate-400">
                  No payment records found
                </div>

                <div className="text-[11px] mt-1.5 text-slate-600">
                  {search || statusFilter
                    ? "Try changing your search or filter."
                    : "There are currently no fee records."}
                </div>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#0d1013] border-b border-white/[0.07]">
                    {!isStudent && (
                      <>
                        <th className="px-4 py-3 text-left text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                          Roll
                        </th>

                        <th className="px-4 py-3 text-left text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                          Student
                        </th>
                      </>
                    )}

                    <th className="px-4 py-3 text-left text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                      Total
                    </th>

                    <th className="px-4 py-3 text-left text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                      Paid
                    </th>

                    <th className="px-4 py-3 text-left text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                      Due
                    </th>

                    <th className="px-4 py-3 text-left text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                      Status
                    </th>

                    <th className="px-4 py-3 text-left text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                      Receipt
                    </th>

                    <th className="px-4 py-3 text-left text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                      Payment Date
                    </th>

                    {canEdit && (
                      <th className="px-4 py-3 text-right text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                        Action
                      </th>
                    )}
                  </tr>
                </thead>

                <tbody>
                  {filteredRows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-white/[0.045] hover:bg-white/[0.018] transition-colors"
                    >
                      {!isStudent && (
                        <>
                          {/* ROLL */}

                          <td className="px-4 py-3">
                            <span className="font-mono text-[10px] text-slate-500">
                              {row.roll_number || "-"}
                            </span>
                          </td>

                          {/* STUDENT */}

                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-[#f2bd19]/[0.08] border border-[#f2bd19]/10 text-[#f2bd19] flex items-center justify-center shrink-0">
                                <UserRound className="w-3.5 h-3.5" />
                              </div>

                              <div className="min-w-0">
                                <div className="text-[12px] font-semibold text-slate-300 truncate">
                                  {row.student_name || "-"}
                                </div>

                                <div className="text-[10px] text-slate-600 mt-0.5">
                                  {row.class_name || "Class not set"}
                                </div>
                              </div>
                            </div>
                          </td>
                        </>
                      )}

                      {/* TOTAL */}

                      <td className="px-4 py-3">
                        <span className="text-[11px] font-semibold text-slate-300">
                          {formatMoney(row.total_amount)}
                        </span>
                      </td>

                      {/* PAID */}

                      <td className="px-4 py-3">
                        <span className="text-[11px] font-semibold text-emerald-400">
                          {formatMoney(row.paid_amount)}
                        </span>
                      </td>

                      {/* DUE */}

                      <td className="px-4 py-3">
                        <span
                          className={`text-[11px] font-semibold ${
                            Number(row.due_amount) > 0
                              ? "text-red-400"
                              : "text-slate-600"
                          }`}
                        >
                          {formatMoney(row.due_amount)}
                        </span>
                      </td>

                      {/* STATUS */}

                      <td className="px-4 py-3">
                        <StatusBadge status={row.status} />
                      </td>

                      {/* RECEIPT */}

                      <td className="px-4 py-3">
                        <span className="text-[10px] font-mono text-slate-600">
                          {row.receipt_number || "-"}
                        </span>
                      </td>

                      {/* PAYMENT DATE */}

                      <td className="px-4 py-3">
                        <span className="text-[10px] text-slate-500">
                          {formatDate(row.payment_date)}
                        </span>
                      </td>

                      {/* ACTION */}

                      {canEdit && (
                        <td className="px-4 py-3 text-right">
                          {row.status !== "paid" ? (
                            <button
                              type="button"
                              onClick={() =>
                                setModal({
                                  mode: "payment",
                                  fee: row,
                                })
                              }
                              className="h-8 px-3 rounded-lg bg-[#f2bd19] hover:bg-[#e5ae08] active:bg-[#d9a912] text-[#111] text-[10px] font-bold flex items-center gap-1.5 ml-auto transition-all shadow-[0_5px_15px_rgba(242,189,25,0.08)]"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              Pay
                              <ArrowUpRight className="w-3 h-3 opacity-60" />
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                              <CheckCircle2 className="w-3 h-3" />
                              Completed
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* =====================================================
          CREATE FEE MODAL
      ===================================================== */}

      {modal?.mode === "create" && (
        <CreateFeeModal
          students={students}
          loadingStudents={loadingStudents}
          onClose={() => setModal(null)}
          onSave={createFee}
        />
      )}

      {/* =====================================================
          PAYMENT MODAL
      ===================================================== */}

      {modal?.mode === "payment" && (
        <PaymentModal
          fee={modal.fee}
          onClose={() => setModal(null)}
          onSave={recordPayment}
        />
      )}
    </div>
  );
}

/* =========================================================
   SUMMARY CARD
========================================================= */

function SummaryCard({ icon: Icon, title, value, accent }) {
  const styles = {
    gold: {
      box: "bg-[#f2bd19]/[0.07] border-[#f2bd19]/10",
      icon: "text-[#f2bd19]",
      glow: "shadow-[0_0_18px_rgba(242,189,25,0.06)]",
    },

    green: {
      box: "bg-emerald-500/[0.06] border-emerald-500/10",
      icon: "text-emerald-400",
      glow: "",
    },

    red: {
      box: "bg-red-500/[0.06] border-red-500/10",
      icon: "text-red-400",
      glow: "",
    },

    blue: {
      box: "bg-blue-500/[0.06] border-blue-500/10",
      icon: "text-blue-400",
      glow: "",
    },
  };

  const style = styles[accent] || styles.gold;

  return (
    <div className="relative bg-[#121519] border border-white/[0.08] rounded-xl px-4 py-3 shadow-[0_14px_40px_rgba(0,0,0,0.18)] overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-white/[0.035]" />

      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 ${style.box} ${style.glow}`}
        >
          <Icon className={`w-[18px] h-[18px] ${style.icon}`} />
        </div>

        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-[0.13em] text-slate-600">
            {title}
          </div>

          <div className="text-[13px] font-semibold text-slate-300 mt-1 truncate">
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   STATUS BADGE
========================================================= */

function StatusBadge({ status }) {
  const value = String(status || "").toLowerCase();

  if (value === "paid") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/[0.07] border border-emerald-500/10 text-emerald-400 text-[9px] font-semibold">
        <CheckCircle2 className="w-3 h-3" />
        Paid
      </span>
    );
  }

  if (value === "partial") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/[0.07] border border-amber-500/10 text-amber-400 text-[9px] font-semibold">
        <Clock3 className="w-3 h-3" />
        Partial
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-500/[0.07] border border-red-500/10 text-red-400 text-[9px] font-semibold">
      <AlertCircle className="w-3 h-3" />
      Pending
    </span>
  );
}

/* =========================================================
   CREATE FEE MODAL
========================================================= */

function CreateFeeModal({ students, loadingStudents, onClose, onSave }) {
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    student_id: "",
    total_amount: "",
    paid_amount: "0",
    academic_year: "",
    description: "",
  });

  function updateField(field, value) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  const total = Number(form.total_amount || 0);
  const paid = Number(form.paid_amount || 0);
  const due = Math.max(0, total - paid);

  async function submit(e) {
    e.preventDefault();

    if (saving) return;

    if (!form.student_id) return;

    if (total <= 0) return;

    if (paid < 0 || paid > total) return;

    const data = {
      student_id: Number(form.student_id),
      total_amount: Number(form.total_amount),
      paid_amount: Number(form.paid_amount || 0),
      academic_year: form.academic_year.trim() || null,
      description: form.description.trim() || null,
    };

    try {
      setSaving(true);
      await onSave(data);
    } catch {
      // Parent handles the error.
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="New Fee Record"
      subtitle="Create a fee record for a student"
      onClose={onClose}
      saving={saving}
    >
      <form onSubmit={submit}>
        <div className="p-5 space-y-4">
          {/* STUDENT */}

          <Field label="Student" required>
            <select
              required
              className="form-input"
              value={form.student_id}
              onChange={(e) => updateField("student_id", e.target.value)}
              disabled={loadingStudents}
              style={{ colorScheme: "dark" }}
            >
              <option value="">
                {loadingStudents ? "Loading students..." : "Select student"}
              </option>

              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.roll_number || "No roll"} - {student.full_name}
                </option>
              ))}
            </select>
          </Field>

          {/* AMOUNTS */}

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Total amount" required>
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                className="form-input"
                placeholder="0.00"
                value={form.total_amount}
                onChange={(e) => updateField("total_amount", e.target.value)}
              />
            </Field>

            <Field label="Initial payment">
              <input
                type="number"
                min="0"
                step="0.01"
                className="form-input"
                placeholder="0.00"
                value={form.paid_amount}
                onChange={(e) => updateField("paid_amount", e.target.value)}
              />
            </Field>
          </div>

          {/* LIVE BALANCE */}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-[#0d1013] border border-white/[0.07] px-3 py-3">
              <div className="text-[9px] uppercase tracking-[0.12em] text-slate-600">
                Total
              </div>

              <div className="text-[13px] font-semibold text-slate-300 mt-1">
                {formatAmount(total)}
              </div>
            </div>

            <div className="rounded-lg bg-red-500/[0.045] border border-red-500/10 px-3 py-3">
              <div className="text-[9px] uppercase tracking-[0.12em] text-red-400/70">
                Remaining Due
              </div>

              <div className="text-[13px] font-semibold text-red-400 mt-1">
                {formatAmount(due)}
              </div>
            </div>
          </div>

          {/* ACADEMIC YEAR */}

          <Field label="Academic year">
            <input
              className="form-input"
              placeholder="e.g. 2026-2027"
              value={form.academic_year}
              onChange={(e) => updateField("academic_year", e.target.value)}
            />
          </Field>

          {/* DESCRIPTION */}

          <Field label="Description">
            <textarea
              className="form-input min-h-[80px] resize-none"
              placeholder="Optional note about this fee..."
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
            />
          </Field>

          {paid > total && (
            <div className="rounded-lg bg-red-500/[0.06] border border-red-500/15 px-3 py-2.5 text-[11px] text-red-400">
              Initial payment cannot be greater than the total amount.
            </div>
          )}
        </div>

        <ModalFooter
          onClose={onClose}
          saving={saving}
          submitText="Create Fee Record"
        />
      </form>
    </ModalShell>
  );
}

/* =========================================================
   PAYMENT MODAL
========================================================= */

function PaymentModal({ fee, onClose, onSave }) {
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const due = Number(fee?.due_amount || 0);
  const payment = Number(amount || 0);

  const remaining = Math.max(0, due - payment);

  async function submit(e) {
    e.preventDefault();

    if (saving) return;

    if (payment <= 0) return;

    if (payment > due) return;

    try {
      setSaving(true);
      await onSave(fee.id, payment);
    } catch {
      // Parent handles the error.
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="Record Payment"
      subtitle="Record a payment against this fee"
      onClose={onClose}
      saving={saving}
    >
      <form onSubmit={submit}>
        <div className="p-5 space-y-4">
          {/* STUDENT INFO */}

          <div className="rounded-lg bg-[#0d1013] border border-white/[0.07] p-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#f2bd19]/[0.08] border border-[#f2bd19]/10 text-[#f2bd19] flex items-center justify-center">
                <UserRound className="w-4 h-4" />
              </div>

              <div>
                <div className="text-[13px] font-semibold text-slate-300">
                  {fee.student_name || "Student"}
                </div>

                <div className="text-[10px] text-slate-600 mt-0.5">
                  {fee.roll_number || "No roll number"}
                  {fee.class_name ? ` • ${fee.class_name}` : ""}
                </div>
              </div>
            </div>
          </div>

          {/* CURRENT BALANCE */}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-red-500/[0.045] border border-red-500/10 px-3 py-3">
              <div className="text-[9px] uppercase tracking-[0.12em] text-red-400/70">
                Current Due
              </div>

              <div className="text-[15px] font-semibold text-red-400 mt-1">
                {formatAmount(due)}
              </div>
            </div>

            <div className="rounded-lg bg-emerald-500/[0.045] border border-emerald-500/10 px-3 py-3">
              <div className="text-[9px] uppercase tracking-[0.12em] text-emerald-400/70">
                After Payment
              </div>

              <div className="text-[15px] font-semibold text-emerald-400 mt-1">
                {formatAmount(remaining)}
              </div>
            </div>
          </div>

          {/* PAYMENT */}

          <Field label="Payment amount" required>
            <input
              required
              autoFocus
              type="number"
              min="0.01"
              max={due}
              step="0.01"
              className="form-input"
              placeholder="Enter amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>

          {payment > due && (
            <div className="rounded-lg bg-red-500/[0.06] border border-red-500/15 px-3 py-2.5 text-[11px] text-red-400">
              Payment cannot be greater than the remaining balance.
            </div>
          )}
        </div>

        <ModalFooter
          onClose={onClose}
          saving={saving}
          submitText="Record Payment"
        />
      </form>
    </ModalShell>
  );
}

/* =========================================================
   MODAL SHELL
========================================================= */

function ModalShell({ title, subtitle, onClose, saving, children }) {
  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onMouseDown={onClose}
    >
      <div
        className="relative bg-[#121519] border border-white/[0.09] rounded-2xl w-full max-w-xl shadow-[0_30px_100px_rgba(0,0,0,0.55)] overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* GOLD TOP LINE */}

        <div className="h-[2px] w-full bg-[#f2bd19]" />

        {/* HEADER */}

        <div className="px-5 py-4 border-b border-white/[0.07] flex items-center">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#f2bd19] shadow-[0_0_8px_rgba(242,189,25,0.7)]" />

              <h3 className="font-semibold text-white text-[14px]">{title}</h3>
            </div>

            <p className="text-[10px] text-slate-600 mt-1 ml-3.5">{subtitle}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="ml-auto w-8 h-8 rounded-lg grid place-items-center text-slate-600 hover:text-slate-300 hover:bg-white/[0.04] border border-transparent hover:border-white/[0.06] disabled:opacity-50 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

/* =========================================================
   MODAL FOOTER
========================================================= */

function ModalFooter({ onClose, saving, submitText }) {
  return (
    <div className="px-5 py-3 border-t border-white/[0.07] bg-[#0d1013] flex justify-end gap-2">
      <button
        type="button"
        className="h-9 px-4 border border-white/[0.08] rounded-lg bg-white/[0.025] text-[11px] font-medium text-slate-400 hover:text-slate-200 hover:bg-white/[0.045] transition disabled:opacity-50"
        onClick={onClose}
        disabled={saving}
      >
        Cancel
      </button>

      <button
        type="submit"
        className="h-9 px-5 bg-[#f2bd19] hover:bg-[#e5ae08] active:bg-[#d9a912] text-[#111] rounded-lg text-[11px] font-bold flex items-center gap-2 shadow-[0_6px_20px_rgba(242,189,25,0.12)] transition disabled:opacity-60"
        disabled={saving}
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}

        {submitText}
      </button>
    </div>
  );
}

/* =========================================================
   FORM FIELD
========================================================= */

function Field({ label, required = false, children }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 mb-2">
        {label}

        {required && <span className="text-[#f2bd19] ml-1">*</span>}
      </label>

      {children}
    </div>
  );
}

/* =========================================================
   FORM INPUT STYLES
========================================================= */

const formInputClass = `
  w-full
  h-10
  px-3
  rounded-lg
  bg-[#0d1013]
  border
  border-white/[0.08]
  text-[12px]
  text-slate-200
  placeholder:text-slate-600
  outline-none
  transition-all
  focus:border-[#f2bd19]/50
  focus:ring-2
  focus:ring-[#f2bd19]/10
  hover:border-white/[0.14]
`;

/*
 * Global utility-style class name used by the modal fields.
 * Tailwind will process this through the JSX className strings
 * below because the actual styles are applied by the helper.
 */

/* =========================================================
   HELPERS
========================================================= */

function formatAmount(value) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
