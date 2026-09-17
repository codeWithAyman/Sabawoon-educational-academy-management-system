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
  Eye,
  Pencil,
  CalendarDays,
} from "lucide-react";

/* =========================================================
   FEES / PAYMENTS PAGE
========================================================= */

export default function Fees() {
  const { user } = useAuth();
  const toast = useToast();

  const canEdit = ["admin", "staff"].includes(user?.role);
  const isStudent = user?.role === "student";

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
  }, [canEdit]);

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
        row.guardian_name,
        row.guardian_phone,
        row.subject_name,
        row.receipt_number,
        row.academic_year,
        row.description,
        row.status,
        row.from_date,
        row.to_date,
        row.coverage_info?.label,
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

    return data.reduce(
      (result, row) => {
        result.total += Number(row.total_amount || 0);
        result.paid += Number(row.paid_amount || 0);
        result.due += Number(row.due_amount || 0);
        result.records += 1;

        return result;
      },
      {
        total: 0,
        paid: 0,
        due: 0,
        records: 0,
      },
    );
  }, [rows]);

  /* =======================================================
     CREATE FEE
  ======================================================= */

  async function createFee(form) {
    try {
      await api.post("/fees", form);

      toast.success("Fee period created successfully.");

      setModal(null);

      await loadFees();
    } catch (err) {
      console.error("Failed to create fee:", err);

      toast.error(err.response?.data?.error || "Unable to create fee period.");

      throw err;
    }
  }

  /* =======================================================
     PAYMENT
  ======================================================= */

  async function recordPayment(id, form) {
    try {
      await api.post(`/fees/${id}/payment`, form);

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
     MONEY
  ======================================================= */

  function formatMoney(value) {
    return Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className="relative min-h-full text-white">
      {/* BACKGROUND */}

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
            HEADER
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
                      : "Manage student fees, payments and coverage"}
                  </p>
                </div>
              </div>

              <div className="xl:ml-auto flex flex-col sm:flex-row gap-2">
                {!isStudent && (
                  <div className="relative group">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-[#f2bd19] pointer-events-none" />

                    <input
                      className="w-full sm:w-64 h-9 pl-9 pr-3 rounded-lg bg-[#0d1013] border border-white/[0.08] text-[12px] text-slate-200 placeholder:text-slate-600 outline-none focus:border-[#f2bd19]/50 focus:ring-2 focus:ring-[#f2bd19]/10"
                      placeholder="Search student, subject, receipt..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                )}

                <select
                  className="w-full sm:w-36 h-9 px-3 rounded-lg bg-[#0d1013] border border-white/[0.08] text-[12px] text-slate-300 outline-none focus:border-[#f2bd19]/50"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{ colorScheme: "dark" }}
                >
                  <option value="">All Status</option>
                  <option value="paid">Paid</option>
                  <option value="partial">Partial</option>
                  <option value="pending">Pending</option>
                  <option value="overdue">Overdue</option>
                </select>

                <button
                  type="button"
                  onClick={loadFees}
                  disabled={loadingFees}
                  className="h-9 px-3 rounded-lg bg-[#0d1013] border border-white/[0.08] hover:border-white/[0.15] text-slate-400 hover:text-slate-200 flex items-center justify-center gap-2 text-[12px] transition disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${loadingFees ? "animate-spin" : ""}`}
                  />

                  <span className="hidden sm:inline">Refresh</span>
                </button>

                {canEdit && (
                  <button
                    type="button"
                    onClick={() =>
                      setModal({
                        mode: "create",
                      })
                    }
                    className="h-9 px-4 bg-[#f2bd19] hover:bg-[#e5ae08] text-[#111] rounded-lg text-[12px] font-bold flex items-center justify-center gap-2 transition"
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
            SUMMARY
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
          <div className="bg-[#151113] border border-red-500/20 rounded-xl px-4 py-3 text-[12px] text-red-300 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />

              <span>{error}</span>
            </div>

            <button
              type="button"
              onClick={loadFees}
              className="px-3 py-1.5 bg-white/[0.03] border border-red-500/20 rounded-lg text-[11px] text-red-300"
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
                <div className="w-1.5 h-1.5 rounded-full bg-[#f2bd19]" />

                <h3 className="font-semibold text-white text-[13px]">
                  Payment Records
                </h3>
              </div>

              <p className="text-[10px] text-slate-600 mt-1.5 ml-3.5">
                Financial records and fee coverage from the database
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
            <EmptyState loading />
          ) : filteredRows.length === 0 ? (
            <EmptyState search={search} statusFilter={statusFilter} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px]">
                <thead>
                  <tr className="bg-[#0d1013] border-b border-white/[0.07]">
                    {!isStudent && (
                      <>
                        <TableHead>Roll</TableHead>
                        <TableHead>Student</TableHead>
                      </>
                    )}

                    <TableHead>Subject</TableHead>
                    <TableHead>Coverage</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Status</TableHead>

                    {canEdit && <TableHead right>Action</TableHead>}
                  </tr>
                </thead>

                <tbody>
                  {filteredRows.map((row) => (
                    <FeeRow
                      key={row.id}
                      row={row}
                      isStudent={isStudent}
                      canEdit={canEdit}
                      onView={() =>
                        setModal({
                          mode: "view",
                          fee: row,
                        })
                      }
                      onEdit={() =>
                        setModal({
                          mode: "edit",
                          fee: row,
                        })
                      }
                      onPay={() =>
                        setModal({
                          mode: "payment",
                          fee: row,
                        })
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ===================================================
          MODALS
      =================================================== */}

      {modal?.mode === "create" && (
        <CreateFeeModal
          students={students}
          loadingStudents={loadingStudents}
          onClose={() => setModal(null)}
          onSave={createFee}
        />
      )}

      {modal?.mode === "payment" && (
        <PaymentModal
          fee={modal.fee}
          onClose={() => setModal(null)}
          onSave={recordPayment}
        />
      )}

      {modal?.mode === "view" && (
        <ViewFeeModal fee={modal.fee} onClose={() => setModal(null)} />
      )}

      {modal?.mode === "edit" && (
        <EditFeeModal
          fee={modal.fee}
          onClose={() => setModal(null)}
          onSaved={loadFees}
          toast={toast}
        />
      )}
    </div>
  );
}

/* =========================================================
   TABLE
========================================================= */

function TableHead({ children, right = false }) {
  return (
    <th
      className={`px-4 py-3 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600 ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function FeeRow({ row, isStudent, canEdit, onView, onEdit, onPay }) {
  const isLegacy = row.is_period_based === false;

  return (
    <tr className="border-b border-white/[0.045] hover:bg-white/[0.018] transition-colors">
      {!isStudent && (
        <>
          <td className="px-4 py-3">
            <span className="font-mono text-[10px] text-slate-500">
              {row.roll_number || "-"}
            </span>
          </td>

          <td className="px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#f2bd19]/[0.08] border border-[#f2bd19]/10 text-[#f2bd19] flex items-center justify-center shrink-0">
                <UserRound className="w-3.5 h-3.5" />
              </div>

              <div className="min-w-0">
                <div className="text-[12px] font-semibold text-slate-300 truncate">
                  {row.student_name || "-"}
                </div>

                {row.guardian_name && (
                  <div className="text-[10px] text-slate-600 mt-0.5">
                    Guardian: {row.guardian_name}
                  </div>
                )}
              </div>
            </div>
          </td>
        </>
      )}

      {/* SUBJECT */}

      <td className="px-4 py-3">
        <div>
          <span className="text-[11px] font-medium text-slate-300">
            {row.subject_name || "-"}
          </span>

          {row.academic_year && (
            <div className="text-[9px] text-slate-600 mt-1">
              Academic year: {row.academic_year}
            </div>
          )}
        </div>
      </td>

      {/* COVERAGE */}

      <td className="px-4 py-3">
        {isLegacy ? (
          <div>
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.025] border border-white/[0.06] text-[9px] text-slate-600">
              Legacy record
            </span>

            <div className="text-[9px] text-slate-700 mt-1">
              No period coverage
            </div>
          </div>
        ) : (
          <div>
            {row.from_date && row.to_date ? (
              <>
                <div className="text-[10px] text-slate-300">
                  {formatDatabaseDate(row.from_date)}
                </div>

                <div className="text-[9px] text-slate-600 mt-0.5">
                  → {formatDatabaseDate(row.to_date)}
                </div>
              </>
            ) : (
              <span className="text-[10px] text-slate-600">
                Coverage recorded
              </span>
            )}

            <div className="text-[9px] text-[#f2bd19]/70 mt-1">
              {Number(row.covered_days || 0)}{" "}
              {Number(row.covered_days || 0) === 1 ? "day" : "days"}
            </div>
          </div>
        )}
      </td>

      {/* TOTAL */}

      <td className="px-4 py-3">
        <span className="text-[11px] font-semibold text-slate-300">
          {formatAmount(row.total_amount)}
        </span>
      </td>

      {/* PAID */}

      <td className="px-4 py-3">
        <span className="text-[11px] font-semibold text-emerald-400">
          {formatAmount(row.paid_amount)}
        </span>
      </td>

      {/* DUE */}

      <td className="px-4 py-3">
        <span
          className={`text-[11px] font-semibold ${
            Number(row.due_amount) > 0 ? "text-red-400" : "text-slate-600"
          }`}
        >
          {formatAmount(row.due_amount)}
        </span>
      </td>

      {/* STATUS */}

      <td className="px-4 py-3">
        <StatusBadge status={row.status} />
      </td>

      {/* ACTION */}

      {canEdit && (
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-1.5">
            <ActionButton icon={Eye} title="View" onClick={onView} />

            <ActionButton icon={Pencil} title="Edit" onClick={onEdit} />

            {Number(row.due_amount) > 0 && (
              <button
                type="button"
                onClick={onPay}
                className="h-8 px-3 rounded-lg bg-[#f2bd19] hover:bg-[#e5ae08] text-[#111] text-[10px] font-bold flex items-center gap-1.5 transition"
              >
                <CreditCard className="w-3.5 h-3.5" />
                Pay
              </button>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}

function ActionButton({ icon: Icon, title, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="w-8 h-8 rounded-lg bg-white/[0.025] border border-white/[0.07] text-slate-500 hover:text-slate-200 hover:border-white/[0.14] flex items-center justify-center transition"
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}

/* =========================================================
   CREATE FEE
========================================================= */

function CreateFeeModal({ students, loadingStudents, onClose, onSave }) {
  const [saving, setSaving] = useState(false);
  const [loadingEnrollments, setLoadingEnrollments] = useState(false);

  const [enrollments, setEnrollments] = useState([]);

  const currentYear = getCurrentSolarYear();

  const [form, setForm] = useState({
    student_id: "",
    enrollment_id: "",

    period_mode: "month",

    solar_year: String(currentYear),
    solar_month: String(getCurrentSolarMonth()),

    from_solar_date: "",
    to_solar_date: "",

    monthly_amounts: {},

    initial_paid_amount: "0",

    academic_year: "",
    description: "",
  });

  function updateField(field, value) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  async function loadEnrollments(studentId) {
    setEnrollments([]);

    updateField("enrollment_id", "");

    if (!studentId) return;

    try {
      setLoadingEnrollments(true);

      const { data } = await api.get(
        `/fees/enrollments?student_id=${encodeURIComponent(studentId)}`,
      );

      if (!Array.isArray(data)) {
        throw new Error("Invalid enrollment response");
      }

      setEnrollments(data);
    } catch (err) {
      console.error("Failed to load enrollments:", err);

      setEnrollments([]);

      toastEnrollmentError(
        err.response?.data?.error ||
          "Unable to load this student's enrollments.",
      );
    } finally {
      setLoadingEnrollments(false);
    }
  }

  function handleStudentChange(value) {
    updateField("student_id", value);
    loadEnrollments(value);
  }

  const selectedEnrollment = enrollments.find(
    (item) => String(item.id) === String(form.enrollment_id),
  );

  const period = buildPeriodPreview(form);

  const paid = Number(form.initial_paid_amount || 0);

  const due = Math.max(0, period.total_amount - paid);

  function setMonthlyAmount(key, value) {
    setForm((previous) => ({
      ...previous,
      monthly_amounts: {
        ...previous.monthly_amounts,
        [key]: value,
      },
    }));
  }

  function submit(e) {
    e.preventDefault();

    if (saving) return;

    if (!form.student_id) return;
    if (!form.enrollment_id) return;
    if (!period.valid) return;

    if (paid < 0 || paid > period.total_amount) {
      return;
    }

    const monthlyAmounts = period.months.map((month) => ({
      solar_year: month.year,
      solar_month: month.month,
      monthly_amount: Number(form.monthly_amounts[month.key] || 0),
    }));

    const invalidMonthlyAmount = monthlyAmounts.some(
      (item) =>
        !Number.isFinite(item.monthly_amount) || item.monthly_amount <= 0,
    );

    if (invalidMonthlyAmount) {
      return;
    }

    const data = {
      student_id: Number(form.student_id),
      enrollment_id: Number(form.enrollment_id),

      from_solar_date: period.from_solar_date,

      to_solar_date: period.to_solar_date,

      monthly_amounts: monthlyAmounts,

      initial_paid_amount: paid,

      academic_year: form.academic_year.trim() || null,

      description: form.description.trim() || null,
    };

    setSaving(true);

    onSave(data)
      .catch(() => {})
      .finally(() => setSaving(false));
  }

  return (
    <ModalShell
      title="New Fee Period"
      subtitle="Create fee coverage for an enrolled student"
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
              onChange={(e) => handleStudentChange(e.target.value)}
              disabled={loadingStudents}
              style={{ colorScheme: "dark" }}
            >
              <option value="">
                {loadingStudents ? "Loading students..." : "Select student"}
              </option>

              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.roll_number || "No roll"} — {student.full_name}
                </option>
              ))}
            </select>
          </Field>

          {/* ENROLLMENT */}

          <Field label="Enrolled subject / class" required>
            <select
              required
              className="form-input"
              value={form.enrollment_id}
              onChange={(e) => updateField("enrollment_id", e.target.value)}
              disabled={!form.student_id || loadingEnrollments}
              style={{ colorScheme: "dark" }}
            >
              <option value="">
                {!form.student_id
                  ? "Select a student first"
                  : loadingEnrollments
                    ? "Loading enrollments..."
                    : enrollments.length === 0
                      ? "No active enrollments"
                      : "Select enrollment"}
              </option>

              {enrollments.map((enrollment) => (
                <option key={enrollment.id} value={enrollment.id}>
                  {enrollment.subject_name} •{" "}
                  {enrollment.teacher_name || "Teacher"} •{" "}
                  {formatTime(enrollment.start_time)} -{" "}
                  {formatTime(enrollment.end_time)}
                </option>
              ))}
            </select>
          </Field>

          {/* SELECTED ENROLLMENT */}

          {selectedEnrollment && (
            <div className="rounded-lg bg-[#0d1013] border border-[#f2bd19]/10 px-3 py-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#f2bd19]/[0.07] border border-[#f2bd19]/10 text-[#f2bd19] flex items-center justify-center shrink-0">
                  <CalendarDays className="w-4 h-4" />
                </div>

                <div>
                  <div className="text-[12px] font-semibold text-slate-300">
                    {selectedEnrollment.subject_name}
                  </div>

                  <div className="text-[10px] text-slate-500 mt-1">
                    Teacher: {selectedEnrollment.teacher_name || "-"}
                  </div>

                  <div className="text-[10px] text-slate-600 mt-0.5">
                    Time: {formatTime(selectedEnrollment.start_time)} -{" "}
                    {formatTime(selectedEnrollment.end_time)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* COVERAGE TYPE */}

          <Field label="Coverage type" required>
            <div className="grid grid-cols-2 gap-2">
              <PeriodModeButton
                active={form.period_mode === "month"}
                onClick={() =>
                  setForm((previous) => ({
                    ...previous,
                    period_mode: "month",
                    from_solar_date: "",
                    to_solar_date: "",
                  }))
                }
              >
                Solar month
              </PeriodModeButton>

              <PeriodModeButton
                active={form.period_mode === "custom"}
                onClick={() =>
                  setForm((previous) => ({
                    ...previous,
                    period_mode: "custom",
                  }))
                }
              >
                Custom dates
              </PeriodModeButton>
            </div>
          </Field>

          {/* MONTH */}

          {form.period_mode === "month" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Solar year" required>
                <input
                  required
                  type="number"
                  min="1300"
                  max="1600"
                  className="form-input"
                  value={form.solar_year}
                  onChange={(e) => updateField("solar_year", e.target.value)}
                />
              </Field>

              <Field label="Solar month" required>
                <select
                  required
                  className="form-input"
                  value={form.solar_month}
                  onChange={(e) => updateField("solar_month", e.target.value)}
                  style={{ colorScheme: "dark" }}
                >
                  {SOLAR_MONTHS.map((month) => (
                    <option key={month.value} value={month.value}>
                      {month.value} — {month.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="From Solar Hijri" required>
                <input
                  required
                  type="text"
                  className="form-input"
                  placeholder="1405/06/01"
                  value={form.from_solar_date}
                  onChange={(e) =>
                    updateField("from_solar_date", e.target.value)
                  }
                />
              </Field>

              <Field label="To Solar Hijri" required>
                <input
                  required
                  type="text"
                  className="form-input"
                  placeholder="1405/06/30"
                  value={form.to_solar_date}
                  onChange={(e) => updateField("to_solar_date", e.target.value)}
                />
              </Field>
            </div>
          )}

          {/* MONTHLY FEES */}

          {period.months.length > 0 && (
            <div className="rounded-lg bg-[#0d1013] border border-white/[0.07] overflow-hidden">
              <div className="px-3 py-2.5 border-b border-white/[0.06]">
                <div className="text-[9px] uppercase tracking-[0.12em] text-slate-600">
                  Monthly fee
                </div>

                <div className="text-[10px] text-slate-500 mt-1">
                  Set the fee for each Solar Hijri month included in this
                  coverage period.
                </div>
              </div>

              <div className="divide-y divide-white/[0.045]">
                {period.months.map((month) => (
                  <div
                    key={month.key}
                    className="px-3 py-3 flex items-center gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] text-slate-300">
                        {month.year} / {String(month.month).padStart(2, "0")} —{" "}
                        {getSolarMonthName(month.month)}
                      </div>

                      <div className="text-[9px] text-slate-600 mt-0.5">
                        {month.covered_days} of {month.month_days} days covered
                      </div>
                    </div>

                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="Monthly fee"
                      className="form-input w-32"
                      value={form.monthly_amounts[month.key] || ""}
                      onChange={(e) =>
                        setMonthlyAmount(month.key, e.target.value)
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CALCULATION */}

          <div className="grid grid-cols-3 gap-2">
            <PreviewCard
              label="Covered days"
              value={period.valid ? String(period.covered_days) : "-"}
            />

            <PreviewCard
              label="Calculated fee"
              value={formatAmount(period.total_amount)}
            />

            <PreviewCard
              label="Remaining due"
              value={formatAmount(due)}
              danger={due > 0}
            />
          </div>

          {/* CALCULATION DETAILS */}

          {period.months.length > 0 && (
            <div className="rounded-lg bg-[#0d1013] border border-white/[0.07] overflow-hidden">
              <div className="px-3 py-2.5 border-b border-white/[0.06]">
                <div className="text-[9px] uppercase tracking-[0.12em] text-slate-600">
                  Fee calculation
                </div>
              </div>

              <div className="divide-y divide-white/[0.045]">
                {period.months.map((month) => (
                  <div
                    key={month.key}
                    className="px-3 py-2.5 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-[11px] text-slate-400">
                        {month.year} / {String(month.month).padStart(2, "0")} —{" "}
                        {getSolarMonthName(month.month)}
                      </div>

                      <div className="text-[9px] text-slate-600 mt-0.5">
                        {month.covered_days} / {month.month_days} days
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[10px] text-slate-600">
                        Monthly {formatAmount(month.monthly_amount)}
                      </div>

                      <div className="text-[11px] font-semibold text-slate-300 mt-0.5">
                        {formatAmount(month.calculated_amount)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* INITIAL PAYMENT */}

          <Field label="Initial payment">
            <input
              type="number"
              min="0"
              step="0.01"
              className="form-input"
              placeholder="0.00"
              value={form.initial_paid_amount}
              onChange={(e) =>
                updateField("initial_paid_amount", e.target.value)
              }
            />
          </Field>

          {paid > period.total_amount && (
            <div className="rounded-lg bg-red-500/[0.06] border border-red-500/15 px-3 py-2.5 text-[11px] text-red-400">
              Initial payment cannot be greater than the calculated fee.
            </div>
          )}

          {/* ACADEMIC YEAR */}

          <Field label="Academic year">
            <input
              className="form-input"
              placeholder="e.g. 1405-1406"
              value={form.academic_year}
              onChange={(e) => updateField("academic_year", e.target.value)}
            />
          </Field>

          {/* DESCRIPTION */}

          <Field label="Description">
            <textarea
              className="form-input min-h-[75px] resize-none"
              placeholder="Optional note..."
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
            />
          </Field>

          {/* NO ENROLLMENT */}

          {form.student_id &&
            !loadingEnrollments &&
            enrollments.length === 0 && (
              <div className="rounded-lg bg-amber-500/[0.06] border border-amber-500/15 px-3 py-2.5 text-[11px] text-amber-400">
                This student has no active enrollment. Create the real class
                enrollment first.
              </div>
            )}
        </div>

        <ModalFooter
          onClose={onClose}
          saving={saving}
          submitText="Create Fee Period"
          disabled={
            !form.student_id ||
            !form.enrollment_id ||
            !period.valid ||
            period.months.some(
              (month) => Number(form.monthly_amounts[month.key] || 0) <= 0,
            ) ||
            paid > period.total_amount
          }
        />
      </form>
    </ModalShell>
  );
}

/* =========================================================
   PAYMENT
========================================================= */

function PaymentModal({ fee, onClose, onSave }) {
  const [amount, setAmount] = useState("");
  const [paymentSolarDate, setPaymentSolarDate] = useState("");
  const [saving, setSaving] = useState(false);

  const due = Number(fee?.due_amount || 0);

  const payment = Number(amount || 0);

  const remaining = Math.max(0, due - payment);

  async function submit(e) {
    e.preventDefault();

    if (saving || payment <= 0 || payment > due || !paymentSolarDate) {
      return;
    }

    try {
      setSaving(true);

      await onSave(fee.id, {
        amount: payment,
        payment_solar_date: paymentSolarDate,
      });
    } catch {
      // Parent handles error.
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
          <FeeIdentity fee={fee} />

          <div className="grid grid-cols-2 gap-3">
            <PreviewCard
              label="Current Due"
              value={formatAmount(due)}
              danger={due > 0}
            />

            <PreviewCard
              label="After Payment"
              value={formatAmount(remaining)}
            />
          </div>

          <Field label="Payment Solar Hijri date" required>
            <input
              required
              type="text"
              className="form-input"
              placeholder="1405/06/26"
              value={paymentSolarDate}
              onChange={(e) => setPaymentSolarDate(e.target.value)}
            />

            <div className="text-[9px] text-slate-600 mt-1.5">
              Use YYYY/MM/DD.
            </div>
          </Field>

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
          disabled={payment <= 0 || payment > due || !paymentSolarDate}
        />
      </form>
    </ModalShell>
  );
}

/* =========================================================
   VIEW
========================================================= */

function ViewFeeModal({ fee, onClose }) {
  const [details, setDetails] = useState(null);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);

        const { data } = await api.get(`/fees/${fee.id}`);

        if (mounted) {
          setDetails(data);
        }
      } catch (err) {
        console.error("Failed to load fee details:", err);

        if (mounted) {
          setDetails(fee);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [fee.id]);

  const item = details || fee;

  return (
    <ModalShell
      title="Fee Details"
      subtitle="Complete financial record"
      onClose={onClose}
      saving={false}
    >
      {loading ? (
        <div className="p-10 flex justify-center">
          <Loader2 className="w-5 h-5 text-[#f2bd19] animate-spin" />
        </div>
      ) : (
        <div className="p-5 space-y-4">
          <FeeIdentity fee={item} />

          <div className="grid grid-cols-3 gap-2">
            <PreviewCard
              label="Total"
              value={formatAmount(item.total_amount)}
            />

            <PreviewCard label="Paid" value={formatAmount(item.paid_amount)} />

            <PreviewCard
              label="Due"
              value={formatAmount(item.due_amount)}
              danger={Number(item.due_amount) > 0}
            />
          </div>

          {/* COVERAGE */}

          <InfoBlock title="Coverage">
            {item.is_period_based && item.from_date && item.to_date ? (
              <>
                <div className="text-[12px] text-slate-300">
                  {formatDatabaseDate(item.from_date)} →{" "}
                  {formatDatabaseDate(item.to_date)}
                </div>

                <div className="text-[10px] text-slate-600 mt-1">
                  {Number(item.covered_days || 0)} covered days
                </div>
              </>
            ) : (
              <div className="text-[11px] text-slate-500">
                Legacy fee record — no period coverage is attached.
              </div>
            )}
          </InfoBlock>

          {/* MONTHLY BREAKDOWN */}

          {Array.isArray(item.months) && item.months.length > 0 && (
            <InfoBlock title="Monthly breakdown">
              <div className="divide-y divide-white/[0.05]">
                {item.months.map((month) => (
                  <div
                    key={`${month.solar_year}-${month.solar_month}`}
                    className="py-2.5 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-[11px] text-slate-300">
                        {month.solar_year} /{" "}
                        {String(month.solar_month).padStart(2, "0")} —{" "}
                        {getSolarMonthName(month.solar_month)}
                      </div>

                      <div className="text-[9px] text-slate-600 mt-0.5">
                        {month.covered_days} / {month.month_days} days
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[9px] text-slate-600">
                        Monthly {formatAmount(month.monthly_amount)}
                      </div>

                      <div className="text-[11px] text-slate-300 mt-0.5">
                        {formatAmount(month.calculated_amount)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </InfoBlock>
          )}

          {/* PAYMENT HISTORY */}

          {Array.isArray(item.payments) && item.payments.length > 0 && (
            <InfoBlock title="Payment history">
              <div className="divide-y divide-white/[0.05]">
                {item.payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="py-2.5 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-[11px] text-slate-300">
                        {payment.payment_solar_date ||
                          payment.payment_date ||
                          "-"}
                      </div>

                      {payment.receipt_number && (
                        <div className="text-[9px] text-slate-600 mt-0.5">
                          {payment.receipt_number}
                        </div>
                      )}
                    </div>

                    <div className="text-[11px] font-semibold text-emerald-400">
                      {formatAmount(payment.amount)}
                    </div>
                  </div>
                ))}
              </div>
            </InfoBlock>
          )}

          {/* RECEIPT */}

          {item.receipt_number && (
            <InfoBlock title="Receipt">
              <div className="text-[11px] text-slate-300 font-mono">
                {item.receipt_number}
              </div>
            </InfoBlock>
          )}

          {/* DESCRIPTION */}

          {item.description && (
            <InfoBlock title="Description">
              <div className="text-[11px] text-slate-400 whitespace-pre-wrap">
                {item.description}
              </div>
            </InfoBlock>
          )}
        </div>
      )}

      <ModalFooter
        onClose={onClose}
        saving={false}
        submitText="Close"
        disabled={false}
      />
    </ModalShell>
  );
}

/* =========================================================
   EDIT
========================================================= */

function EditFeeModal({ fee, onClose, onSaved, toast }) {
  const [academicYear, setAcademicYear] = useState(fee.academic_year || "");

  const [description, setDescription] = useState(fee.description || "");

  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();

    if (saving) return;

    try {
      setSaving(true);

      await api.put(`/fees/${fee.id}`, {
        academic_year: academicYear.trim() || null,

        description: description.trim() || null,
      });

      toast.success("Fee record updated successfully.");

      await onSaved();

      onClose();
    } catch (err) {
      console.error("Failed to edit fee:", err);

      toast.error(err.response?.data?.error || "Unable to update fee record.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="Edit Fee Record"
      subtitle="Update record information"
      onClose={onClose}
      saving={saving}
    >
      <form onSubmit={submit}>
        <div className="p-5 space-y-4">
          <FeeIdentity fee={fee} />

          <div className="rounded-lg bg-amber-500/[0.045] border border-amber-500/10 px-3 py-2.5 text-[10px] text-amber-400">
            Payment amounts and coverage are protected here. Only administrative
            information can be changed.
          </div>

          <Field label="Academic year">
            <input
              className="form-input"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              placeholder="e.g. 1405-1406"
            />
          </Field>

          <Field label="Description">
            <textarea
              className="form-input min-h-[100px] resize-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional note..."
            />
          </Field>
        </div>

        <ModalFooter
          onClose={onClose}
          saving={saving}
          submitText="Save Changes"
        />
      </form>
    </ModalShell>
  );
}

/* =========================================================
   SHARED COMPONENTS
========================================================= */

function FeeIdentity({ fee }) {
  return (
    <div className="rounded-lg bg-[#0d1013] border border-white/[0.07] p-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#f2bd19]/[0.08] border border-[#f2bd19]/10 text-[#f2bd19] flex items-center justify-center">
          <UserRound className="w-4 h-4" />
        </div>

        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-slate-300">
            {fee.student_name || "Student"}
          </div>

          <div className="text-[10px] text-slate-500 mt-0.5">
            {fee.subject_name || "Subject"}
          </div>

          {fee.roll_number && (
            <div className="text-[9px] text-slate-600 mt-0.5">
              Roll: {fee.roll_number}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoBlock({ title, children }) {
  return (
    <div className="rounded-lg bg-[#0d1013] border border-white/[0.07] overflow-hidden">
      <div className="px-3 py-2.5 border-b border-white/[0.06]">
        <div className="text-[9px] uppercase tracking-[0.12em] text-slate-600">
          {title}
        </div>
      </div>

      <div className="px-3 py-3">{children}</div>
    </div>
  );
}

function SummaryCard({ icon: Icon, title, value, accent }) {
  const styles = {
    gold: {
      box: "bg-[#f2bd19]/[0.07] border-[#f2bd19]/10",
      icon: "text-[#f2bd19]",
    },

    green: {
      box: "bg-emerald-500/[0.06] border-emerald-500/10",
      icon: "text-emerald-400",
    },

    red: {
      box: "bg-red-500/[0.06] border-red-500/10",
      icon: "text-red-400",
    },

    blue: {
      box: "bg-blue-500/[0.06] border-blue-500/10",
      icon: "text-blue-400",
    },
  };

  const style = styles[accent] || styles.gold;

  return (
    <div className="relative bg-[#121519] border border-white/[0.08] rounded-xl px-4 py-3 overflow-hidden">
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 ${style.box}`}
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

  if (value === "overdue") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-orange-500/[0.07] border border-orange-500/10 text-orange-400 text-[9px] font-semibold">
        <AlertCircle className="w-3 h-3" />
        Overdue
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

function PreviewCard({ label, value, danger = false }) {
  return (
    <div
      className={`rounded-lg px-3 py-3 border ${
        danger
          ? "bg-red-500/[0.045] border-red-500/10"
          : "bg-[#0d1013] border-white/[0.07]"
      }`}
    >
      <div
        className={`text-[8px] uppercase tracking-[0.1em] ${
          danger ? "text-red-400/70" : "text-slate-600"
        }`}
      >
        {label}
      </div>

      <div
        className={`text-[12px] font-semibold mt-1 ${
          danger ? "text-red-400" : "text-slate-300"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function PeriodModeButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 rounded-lg border text-[11px] font-medium transition ${
        active
          ? "bg-[#f2bd19]/10 border-[#f2bd19]/30 text-[#f2bd19]"
          : "bg-[#0d1013] border-white/[0.07] text-slate-500 hover:text-slate-300"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState({ loading = false, search = "", statusFilter = "" }) {
  if (loading) {
    return (
      <div className="min-h-[320px] grid place-items-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#f2bd19]/[0.06] border border-[#f2bd19]/10 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-[#f2bd19] animate-spin" />
          </div>

          <span className="text-[11px] text-slate-600">
            Loading payment records...
          </span>
        </div>
      </div>
    );
  }

  return (
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
  );
}

function ModalShell({ title, subtitle, onClose, saving, children }) {
  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onMouseDown={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className="relative bg-[#121519] border border-white/[0.09] rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-[0_30px_100px_rgba(0,0,0,0.55)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="h-[2px] w-full bg-[#f2bd19]" />

        <div className="px-5 py-4 border-b border-white/[0.07] flex items-center">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#f2bd19]" />

              <h3 className="font-semibold text-white text-[14px]">{title}</h3>
            </div>

            <p className="text-[10px] text-slate-600 mt-1 ml-3.5">{subtitle}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="ml-auto w-8 h-8 rounded-lg grid place-items-center text-slate-600 hover:text-slate-300 hover:bg-white/[0.04] disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

function ModalFooter({ onClose, saving, submitText, disabled = false }) {
  return (
    <div className="px-5 py-3 border-t border-white/[0.07] bg-[#0d1013] flex justify-end gap-2">
      <button
        type="button"
        className="h-9 px-4 border border-white/[0.08] rounded-lg bg-white/[0.025] text-[11px] font-medium text-slate-400 hover:text-slate-200 disabled:opacity-50"
        onClick={onClose}
        disabled={saving}
      >
        Cancel
      </button>

      <button
        type="submit"
        className="h-9 px-5 bg-[#f2bd19] hover:bg-[#e5ae08] text-[#111] rounded-lg text-[11px] font-bold flex items-center gap-2 disabled:opacity-40"
        disabled={saving || disabled}
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}

        {submitText}
      </button>
    </div>
  );
}

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
   PERIOD CALCULATION
========================================================= */

function buildPeriodPreview(form) {
  let from;
  let to;

  if (form.period_mode === "month") {
    const year = Number(form.solar_year);

    const month = Number(form.solar_month);

    if (!Number.isInteger(year) || month < 1 || month > 12) {
      return invalidPeriod();
    }

    const days = solarMonthDays(year, month);

    from = {
      year,
      month,
      day: 1,
    };

    to = {
      year,
      month,
      day: days,
    };
  } else {
    from = parseSolarInput(form.from_solar_date);

    to = parseSolarInput(form.to_solar_date);

    if (!from || !to) {
      return invalidPeriod();
    }
  }

  if (compareSolarDates(from, to) > 0) {
    return invalidPeriod();
  }

  const months = [];

  let year = from.year;
  let month = from.month;

  while (year < to.year || (year === to.year && month <= to.month)) {
    const monthDays = solarMonthDays(year, month);

    const rangeStart =
      year === from.year && month === from.month ? from.day : 1;

    const rangeEnd =
      year === to.year && month === to.month ? to.day : monthDays;

    const coveredDays = rangeEnd - rangeStart + 1;

    if (coveredDays > 0) {
      const key = `${year}-${month}`;

      const monthlyAmount = Number(form.monthly_amounts?.[key] || 0);

      const calculatedAmount =
        monthlyAmount > 0
          ? Number(((monthlyAmount / monthDays) * coveredDays).toFixed(2))
          : 0;

      months.push({
        key,
        year,
        month,
        month_days: monthDays,
        covered_days: coveredDays,
        monthly_amount: monthlyAmount,
        calculated_amount: calculatedAmount,
      });
    }

    month++;

    if (month > 12) {
      month = 1;
      year++;
    }
  }

  const coveredDays = months.reduce(
    (sum, month) => sum + month.covered_days,
    0,
  );

  const totalAmount = Number(
    months.reduce((sum, month) => sum + month.calculated_amount, 0).toFixed(2),
  );

  return {
    valid:
      months.length > 0 && months.every((month) => month.monthly_amount > 0),

    covered_days: coveredDays,

    total_amount: totalAmount,

    from_solar_date: formatSolarDate(from),

    to_solar_date: formatSolarDate(to),

    months,
  };
}

function invalidPeriod() {
  return {
    valid: false,
    covered_days: 0,
    total_amount: 0,
    from_solar_date: "",
    to_solar_date: "",
    months: [],
  };
}

/* =========================================================
   SOLAR DATE HELPERS
========================================================= */

function parseSolarInput(value) {
  const match = String(value || "")
    .trim()
    .match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);

  if (!match) return null;

  const year = Number(match[1]);

  const month = Number(match[2]);

  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > solarMonthDays(year, month)) {
    return null;
  }

  return {
    year,
    month,
    day,
  };
}

function formatSolarDate(date) {
  return `${date.year}/${String(date.month).padStart(2, "0")}/${String(
    date.day,
  ).padStart(2, "0")}`;
}

function compareSolarDates(a, b) {
  if (a.year !== b.year) {
    return a.year - b.year;
  }

  if (a.month !== b.month) {
    return a.month - b.month;
  }

  return a.day - b.day;
}

function solarMonthDays(year, month) {
  if (month >= 1 && month <= 6) {
    return 31;
  }

  if (month >= 7 && month <= 11) {
    return 30;
  }

  /*
    Solar Hijri month 12 can be
    29 or 30 depending on the year.

    The backend is authoritative.
    The frontend preview uses 29
    until the actual backend result
    is available.
  */

  return 29;
}

/* =========================================================
   DATABASE DATE DISPLAY
========================================================= */

function formatDatabaseDate(value) {
  if (!value) return "-";

  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  return String(value);
}

/* =========================================================
   CURRENT SOLAR DATE
========================================================= */

function getCurrentSolarYear() {
  /*
    Initial UI value only.
    Backend remains authoritative.
  */

  const now = new Date();

  return now.getFullYear() - 621;
}

function getCurrentSolarMonth() {
  const now = new Date();

  /*
    Current month around the
    September period in Afghanistan.
    This is only the initial UI value.
  */

  if (now.getMonth() >= 2 && now.getMonth() <= 8) {
    return 6;
  }

  return 1;
}

/* =========================================================
   SOLAR MONTH NAMES
========================================================= */

const SOLAR_MONTHS = [
  {
    value: 1,
    name: "Hamal",
  },
  {
    value: 2,
    name: "Sawr",
  },
  {
    value: 3,
    name: "Jawza",
  },
  {
    value: 4,
    name: "Saratan",
  },
  {
    value: 5,
    name: "Asad",
  },
  {
    value: 6,
    name: "Sunbula",
  },
  {
    value: 7,
    name: "Mizan",
  },
  {
    value: 8,
    name: "Aqrab",
  },
  {
    value: 9,
    name: "Qaws",
  },
  {
    value: 10,
    name: "Jadi",
  },
  {
    value: 11,
    name: "Dalw",
  },
  {
    value: 12,
    name: "Hut",
  },
];

function getSolarMonthName(month) {
  return (
    SOLAR_MONTHS.find((item) => item.value === Number(month))?.name ||
    `Month ${month}`
  );
}

/* =========================================================
   MONEY / TIME
========================================================= */

function formatAmount(value) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatTime(value) {
  if (!value) return "-";

  const match = String(value).match(/^(\d{1,2}):(\d{2})/);

  if (!match) {
    return String(value);
  }

  let hour = Number(match[1]);

  const minute = match[2];

  const suffix = hour >= 12 ? "PM" : "AM";

  hour %= 12;

  if (hour === 0) {
    hour = 12;
  }

  return `${hour}:${minute} ${suffix}`;
}

/* =========================================================
   SMALL ERROR HELPER
========================================================= */

function toastEnrollmentError(message) {
  /*
    Kept outside the toast context so
    the enrollment loader remains simple.
    The native alert is intentionally
    delayed so it does not interrupt the
    React state update.
  */

  window.setTimeout(() => {
    window.alert(message);
  }, 0);
}
