import { useEffect, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/Toast";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  Users,
  UserRound,
  Phone,
  Mail,
  LockKeyhole,
  ShieldCheck,
  RefreshCw,
  Check,
} from "lucide-react";

export default function UsersPage() {
  const { user } = useAuth();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState("teachers");

  const [teachers, setTeachers] = useState([]);
  const [staff, setStaff] = useState([]);

  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  const canManage = user?.role === "admin";

  async function loadData() {
    try {
      setLoading(true);

      const [teachersResponse, staffResponse] = await Promise.all([
        api.get("/users/teachers"),
        api.get("/users/staff"),
      ]);

      setTeachers(
        Array.isArray(teachersResponse.data) ? teachersResponse.data : [],
      );

      setStaff(Array.isArray(staffResponse.data) ? staffResponse.data : []);
    } catch (error) {
      console.error("Failed to load teachers and staff:", error);

      toast.error(
        error.response?.data?.error ||
          error.message ||
          "Unable to load teachers and staff.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function deleteTeacher(teacher) {
    const name = teacher?.full_name || "this teacher";

    const confirmed = window.confirm(
      `Delete ${name}?\n\nThis permanently deletes the teacher record. This action cannot be undone.`,
    );

    if (!confirmed) return;

    try {
      await api.delete(`/users/teachers/${teacher.id}`);

      toast.success("Teacher deleted successfully.");

      await loadData();
    } catch (error) {
      console.error("Failed to delete teacher:", error);

      toast.error(
        error.response?.data?.error ||
          error.message ||
          "Unable to delete teacher.",
      );
    }
  }

  async function deleteStaffMember(member) {
    const name = member?.full_name || "this staff member";

    const confirmed = window.confirm(
      `Delete ${name}?\n\nThis permanently deletes the staff record. This action cannot be undone.`,
    );

    if (!confirmed) return;

    const adminPassword = window.prompt(
      "Administrator password required.\n\nEnter your current administrator password to delete this staff member:",
    );

    if (adminPassword === null) {
      return;
    }

    if (!adminPassword.trim()) {
      toast.error("Administrator password is required.");
      return;
    }

    try {
      await api.post("/auth/verify-password", {
        password: adminPassword,
      });

      await api.delete(`/users/staff/${member.id}`);

      toast.success("Staff member deleted successfully.");

      await loadData();
    } catch (error) {
      console.error("Failed to delete staff member:", error);

      toast.error(
        error.response?.data?.error ||
          error.message ||
          "Unable to delete staff member.",
      );
    }
  }

  return (
    <div className="w-full min-h-full px-4 sm:px-6 lg:px-8 py-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/[0.025] border border-white/[0.07] flex items-center justify-center">
              <Users className="w-[17px] h-[17px] text-[#f2bd19]" />
            </div>

            <div>
              <h1 className="text-lg font-semibold text-white">
                Teachers & Staff
              </h1>

              <p className="text-[10px] text-slate-500 mt-0.5">
                Manage teachers and staff members.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="h-[38px] px-3.5 rounded-lg bg-white/[0.025] border border-white/[0.08] text-[10px] font-semibold text-slate-400 hover:text-white hover:border-white/[0.15] inline-flex items-center justify-center gap-2 transition-all disabled:opacity-50"
        >
          <RefreshCw
            className={`w-[13px] h-[13px] ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/[0.07] mb-5 overflow-x-auto">
        <TabButton
          active={activeTab === "teachers"}
          onClick={() => setActiveTab("teachers")}
          icon={UserRound}
          label="Teachers"
        />

        <TabButton
          active={activeTab === "staff"}
          onClick={() => setActiveTab("staff")}
          icon={Users}
          label="Staff"
        />
      </div>

      {/* Teachers */}
      {activeTab === "teachers" && (
        <section>
          <Toolbar
            title="Teachers"
            description="Teacher records used for class and timetable assignments."
            buttonLabel="Add Teacher"
            onAdd={() => setModal({ type: "teacher" })}
            disabled={!canManage}
          />

          <div className="mt-4 rounded-xl border border-white/[0.07] bg-[#121519] overflow-hidden">
            {loading ? (
              <LoadingState />
            ) : teachers.length === 0 ? (
              <EmptyState
                icon={UserRound}
                title="No teachers found"
                description="There are currently no teacher records."
              />
            ) : (
              <TeacherTable
                teachers={teachers}
                canManage={canManage}
                onEdit={(teacher) =>
                  setModal({ type: "teacher", record: teacher })
                }
                onDelete={deleteTeacher}
              />
            )}
          </div>
        </section>
      )}

      {/* Staff */}
      {activeTab === "staff" && (
        <section>
          <Toolbar
            title="Staff"
            description="Staff records used for administrative operations and verification."
            buttonLabel="Add Staff"
            onAdd={() => setModal({ type: "staff" })}
            disabled={!canManage}
          />

          <div className="mt-4 rounded-xl border border-white/[0.07] bg-[#121519] overflow-hidden">
            {loading ? (
              <LoadingState />
            ) : staff.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No staff found"
                description="There are currently no staff records."
              />
            ) : (
              <StaffTable
                staff={staff}
                canManage={canManage}
                onEdit={(member) => setModal({ type: "staff", record: member })}
                onDelete={deleteStaffMember}
              />
            )}
          </div>
        </section>
      )}

      {modal && (
        <UserModal
          modal={modal}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await loadData();
          }}
        />
      )}
    </div>
  );
}

/* =========================================================
   TAB BUTTON
========================================================= */

function TabButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        h-[42px]
        px-4
        inline-flex
        items-center
        gap-2
        border-b-2
        text-[10px]
        font-semibold
        whitespace-nowrap
        transition-all
        ${
          active
            ? "border-[#f2bd19] text-[#f2bd19]"
            : "border-transparent text-slate-500 hover:text-slate-300"
        }
      `}
    >
      <Icon className="w-[14px] h-[14px]" />
      {label}
    </button>
  );
}

/* =========================================================
   TOOLBAR
========================================================= */

function Toolbar({ title, description, buttonLabel, onAdd, disabled }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
      <div>
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-slate-300">
          {title}
        </h2>

        <p className="text-[9px] text-slate-600 mt-1">{description}</p>
      </div>

      <button
        type="button"
        onClick={onAdd}
        disabled={disabled}
        className="h-[38px] px-4 rounded-lg bg-[#f2bd19] hover:bg-[#e6b317] active:bg-[#d9a912] text-[#111] text-[10px] font-bold inline-flex items-center justify-center gap-2 transition-all shadow-[0_7px_22px_rgba(242,189,25,0.12)] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Plus className="w-[14px] h-[14px]" />
        {buttonLabel}
      </button>
    </div>
  );
}

/* =========================================================
   TEACHER TABLE
========================================================= */

function TeacherTable({ teachers, canManage, onEdit, onDelete }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[650px]">
        <thead>
          <tr className="border-b border-white/[0.07] bg-white/[0.015]">
            <TableHeader>Name</TableHeader>
            <TableHeader>Email</TableHeader>
            <TableHeader>Phone</TableHeader>
            <TableHeader>Actions</TableHeader>
          </tr>
        </thead>

        <tbody>
          {teachers.map((teacher) => (
            <tr
              key={teacher.id}
              className="border-b border-white/[0.05] last:border-b-0 hover:bg-white/[0.015] transition-colors"
            >
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar icon={UserRound} />

                  <div>
                    <p className="text-[11px] font-medium text-slate-200">
                      {teacher.full_name || "-"}
                    </p>

                    <p className="text-[9px] text-slate-600">
                      Teacher #{teacher.id}
                    </p>
                  </div>
                </div>
              </TableCell>

              <TableCell>
                <ContactValue icon={Mail} value={teacher.email} />
              </TableCell>

              <TableCell>
                <ContactValue icon={Phone} value={teacher.phone} />
              </TableCell>

              <TableCell>
                {canManage && (
                  <div className="flex items-center gap-1.5">
                    <ActionButton
                      icon={Pencil}
                      label="Edit"
                      onClick={() => onEdit(teacher)}
                    />

                    <ActionButton
                      icon={Trash2}
                      label="Delete"
                      danger
                      onClick={() => onDelete(teacher)}
                    />
                  </div>
                )}
              </TableCell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* =========================================================
   STAFF TABLE
========================================================= */

function StaffTable({ staff, canManage, onEdit, onDelete }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[650px]">
        <thead>
          <tr className="border-b border-white/[0.07] bg-white/[0.015]">
            <TableHeader>Name</TableHeader>
            <TableHeader>Email</TableHeader>
            <TableHeader>Phone</TableHeader>
            <TableHeader>Status</TableHeader>
            <TableHeader>Actions</TableHeader>
          </tr>
        </thead>

        <tbody>
          {staff.map((member) => (
            <tr
              key={member.id}
              className="border-b border-white/[0.05] last:border-b-0 hover:bg-white/[0.015] transition-colors"
            >
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar icon={Users} />

                  <div>
                    <p className="text-[11px] font-medium text-slate-200">
                      {member.full_name || "-"}
                    </p>

                    <p className="text-[9px] text-slate-600">
                      Staff #{member.id}
                    </p>
                  </div>
                </div>
              </TableCell>

              <TableCell>
                <ContactValue icon={Mail} value={member.email} />
              </TableCell>

              <TableCell>
                <ContactValue icon={Phone} value={member.phone} />
              </TableCell>

              <TableCell>
                <StatusBadge active={member.is_active} />
              </TableCell>

              <TableCell>
                {canManage && (
                  <div className="flex items-center gap-1.5">
                    <ActionButton
                      icon={Pencil}
                      label="Edit"
                      onClick={() => onEdit(member)}
                    />

                    <ActionButton
                      icon={Trash2}
                      label="Delete"
                      danger
                      onClick={() => onDelete(member)}
                    />
                  </div>
                )}
              </TableCell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* =========================================================
   MODAL
========================================================= */

function UserModal({ modal, onClose, onSaved }) {
  const isEdit = Boolean(modal.record?.id);
  const type = modal.type;

  const [saving, setSaving] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [verifyingAdminPassword, setVerifyingAdminPassword] = useState(false);
  const [adminPasswordError, setAdminPasswordError] = useState("");

  const [form, setForm] = useState({
    full_name: modal.record?.full_name || "",
    email: modal.record?.email || "",
    phone: modal.record?.phone || "",
    password: "",
    is_active:
      modal.record?.is_active === undefined
        ? true
        : Boolean(modal.record.is_active),
  });

  /*
    Every Staff creation/edit requires administrator verification.

    Teachers are completely unchanged.
  */
  const staffRequiresAdminPassword = type === "staff";

  const passwordChanging =
    isEdit && type === "staff" && form.password.trim().length > 0;

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    if (field === "password" && !value) {
      setAdminPassword("");
      setAdminPasswordError("");
    }
  }

  async function submit(event) {
    event.preventDefault();

    if (!form.full_name.trim()) {
      toastError("Full name is required.");
      return;
    }

    if (!form.email.trim() && type !== "teacher") {
      toastError("Email is required.");
      return;
    }

    if (!isEdit && type === "staff" && !form.password) {
      toastError("Staff verification password/PIN is required.");
      return;
    }

    if (staffRequiresAdminPassword && !adminPassword.trim()) {
      toastError(
        "Enter the administrator password before creating or editing staff.",
      );
      return;
    }

    try {
      setSaving(true);
      setAdminPasswordError("");

      /*
       * Verify the password belonging to the currently authenticated
       * administrator before allowing any Staff create/edit operation.
       */
      if (staffRequiresAdminPassword) {
        setVerifyingAdminPassword(true);

        try {
          await api.post("/auth/verify-password", {
            password: adminPassword,
          });
        } catch (verificationError) {
          setAdminPasswordError(
            verificationError.response?.data?.error ||
              "Administrator password is incorrect.",
          );

          return;
        } finally {
          setVerifyingAdminPassword(false);
        }
      }

      const payload = {
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
      };

      if (type === "staff") {
        payload.is_active = form.is_active;
      }

      if (form.password.trim()) {
        payload.password = form.password.trim();
      }

      /*
       * Preserve the existing backend behavior when changing a Staff
       * password: pass the administrator password as admin_password too.
       */
      if (passwordChanging) {
        payload.admin_password = adminPassword;
      }

      if (isEdit) {
        const endpoint = type === "teacher" ? "teachers" : type;

        await api.put(`/users/${endpoint}/${modal.record.id}`, payload);
      } else {
        const endpoint = type === "teacher" ? "teachers" : type;

        await api.post(`/users/${endpoint}`, payload);
      }

      toastSuccess(
        type === "teacher"
          ? isEdit
            ? "Teacher updated successfully."
            : "Teacher added successfully."
          : isEdit
            ? passwordChanging
              ? "Staff member and password updated successfully."
              : "Staff member updated successfully."
            : "Staff member added successfully.",
      );

      setAdminPassword("");
      onSaved();
    } catch (error) {
      console.error("Failed to save user record:", error);

      toastError(
        error.response?.data?.error ||
          error.message ||
          "Unable to save record.",
      );
    } finally {
      setSaving(false);
      setVerifyingAdminPassword(false);
    }
  }

  function toastError(message) {
    if (typeof window !== "undefined") {
      alert(message);
    }
  }

  function toastSuccess(message) {
    if (typeof window !== "undefined") {
      // Parent page reload will refresh the data.
      console.log(message);
    }
  }

  const title =
    type === "teacher"
      ? isEdit
        ? "Edit Teacher"
        : "Add Teacher"
      : isEdit
        ? "Edit Staff Member"
        : "Add Staff Member";

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-xl max-h-[90vh] overflow-hidden rounded-xl border border-white/[0.08] bg-[#121519] shadow-2xl">
        <form onSubmit={submit}>
          {/* Header */}
          <div className="px-5 sm:px-6 py-4 border-b border-white/[0.07] flex items-center justify-between">
            <div>
              <h2 className="text-[13px] font-semibold text-slate-200">
                {title}
              </h2>

              <p className="text-[9px] text-slate-600 mt-1">
                {type === "teacher"
                  ? "Manage the teacher's basic contact information."
                  : "Manage staff information and verification credentials."}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/[0.05] transition-all disabled:opacity-40"
            >
              <X className="w-[15px] h-[15px]" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 sm:p-6 overflow-y-auto max-h-[65vh]">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Full Name"
                required
                icon={UserRound}
                value={form.full_name}
                onChange={(e) => updateField("full_name", e.target.value)}
                placeholder="Enter full name"
              />

              <Field
                label="Email"
                required={type !== "teacher"}
                icon={Mail}
                type="email"
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                placeholder="Enter email address"
              />

              <Field
                label="Phone"
                icon={Phone}
                value={form.phone}
                onChange={(e) => updateField("phone", e.target.value)}
                placeholder="Enter phone number"
              />

              {/* Teachers NEVER get a password field */}
              {type === "staff" && (
                <Field
                  label="Password / PIN"
                  required={!isEdit}
                  icon={LockKeyhole}
                  type="password"
                  value={form.password}
                  onChange={(e) => updateField("password", e.target.value)}
                  placeholder={
                    isEdit ? "Leave blank to keep current" : "Enter password"
                  }
                />
              )}
            </div>

            {/* Administrator confirmation is required for EVERY
                Staff create/edit action. */}
            {staffRequiresAdminPassword && (
              <div className="mt-5 rounded-xl border border-[#f2bd19]/20 bg-[#f2bd19]/[0.04] p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#f2bd19]/[0.08] border border-[#f2bd19]/[0.15] flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-[15px] h-[15px] text-[#f2bd19]" />
                  </div>

                  <div className="flex-1">
                    <p className="text-[10px] font-semibold text-slate-200">
                      Administrator verification required
                    </p>

                    <p className="text-[9px] text-slate-500 mt-1 leading-relaxed">
                      {isEdit
                        ? "Editing this staff member requires the current administrator password."
                        : "Creating a staff member requires the current administrator password."}
                    </p>

                    <div className="mt-3">
                      <Field
                        label="Administrator Password"
                        required
                        icon={LockKeyhole}
                        type="password"
                        value={adminPassword}
                        onChange={(e) => {
                          setAdminPassword(e.target.value);
                          setAdminPasswordError("");
                        }}
                        placeholder="Enter administrator password"
                      />
                    </div>

                    {adminPasswordError && (
                      <div className="mt-3 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-[9px] text-red-300">
                        {adminPasswordError}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {type === "staff" && (
              <label className="flex items-center gap-3 mt-5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => updateField("is_active", e.target.checked)}
                  className="w-4 h-4 accent-[#f2bd19]"
                />

                <div>
                  <p className="text-[10px] font-semibold text-slate-300">
                    Active
                  </p>

                  <p className="text-[9px] text-slate-600">
                    Allows this staff member to perform verification.
                  </p>
                </div>
              </label>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 sm:px-6 py-3.5 bg-[#121519]/95 border-t border-white/[0.07] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="h-[40px] px-4 rounded-lg bg-white/[0.025] border border-white/[0.08] text-[11px] font-semibold text-slate-400 hover:text-white hover:border-white/[0.15] transition-all disabled:opacity-40"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving || verifyingAdminPassword}
              className="h-[40px] px-5 rounded-lg bg-[#f2bd19] hover:bg-[#e6b317] active:bg-[#d9a912] text-[#111] text-[11px] font-bold inline-flex items-center justify-center gap-2 transition-all shadow-[0_7px_22px_rgba(242,189,25,0.12)] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving || verifyingAdminPassword ? (
                <>
                  <Loader2 className="w-[14px] h-[14px] animate-spin" />
                  {verifyingAdminPassword ? "Verifying..." : "Saving..."}
                </>
              ) : isEdit ? (
                <>
                  <Check className="w-[14px] h-[14px]" />
                  Save Changes
                </>
              ) : (
                <>
                  <Plus className="w-[14px] h-[14px]" />
                  Create
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* =========================================================
   FIELD
========================================================= */

function Field({
  label,
  required = false,
  icon: Icon,
  value,
  onChange,
  placeholder,
  type = "text",
}) {
  return (
    <label className="block">
      <span className="block text-[10px] font-semibold uppercase tracking-[0.09em] text-slate-500 mb-2">
        {label}

        {required && <span className="text-[#f2bd19] ml-1">*</span>}
      </span>

      <div className="relative group">
        <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[15px] h-[15px] text-slate-500 group-focus-within:text-[#f2bd19] transition-colors pointer-events-none" />

        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          autoComplete="off"
          className="
            w-full
            h-[44px]
            pl-10
            pr-3.5
            rounded-lg
            bg-[#0d1013]
            border
            border-white/[0.09]
            text-[12px]
            text-slate-100
            placeholder:text-slate-600
            outline-none
            transition-all
            hover:border-white/[0.15]
            focus:border-[#f2bd19]/55
            focus:ring-2
            focus:ring-[#f2bd19]/10
          "
        />
      </div>
    </label>
  );
}

/* =========================================================
   TABLE HELPERS
========================================================= */

function TableHeader({ children }) {
  return (
    <th className="px-4 py-3 text-left text-[9px] font-semibold uppercase tracking-[0.09em] text-slate-600 whitespace-nowrap">
      {children}
    </th>
  );
}

function TableCell({ children }) {
  return <td className="px-4 py-3.5 align-middle">{children}</td>;
}

function Avatar({ icon: Icon }) {
  return (
    <div className="w-8 h-8 rounded-lg bg-white/[0.025] border border-white/[0.07] flex items-center justify-center shrink-0">
      <Icon className="w-[14px] h-[14px] text-[#f2bd19]" />
    </div>
  );
}

function ContactValue({ icon: Icon, value }) {
  return (
    <div className="flex items-center gap-2 text-[10px] text-slate-400">
      <Icon className="w-[13px] h-[13px] text-slate-600 shrink-0" />
      <span>{value || "-"}</span>
    </div>
  );
}

function StatusBadge({ active }) {
  return (
    <span
      className={`
        inline-flex
        items-center
        gap-1.5
        px-2
        py-1
        rounded-md
        text-[8px]
        font-semibold
        uppercase
        tracking-[0.06em]
        border
        ${
          active
            ? "text-emerald-400 bg-emerald-400/[0.06] border-emerald-400/[0.12]"
            : "text-slate-500 bg-white/[0.025] border-white/[0.07]"
        }
      `}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          active ? "bg-emerald-400" : "bg-slate-600"
        }`}
      />

      {active ? "Active" : "Inactive"}
    </span>
  );
}

function ActionButton({ icon: Icon, label, onClick, danger = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`
        h-8
        px-2.5
        rounded-lg
        border
        inline-flex
        items-center
        justify-center
        gap-1.5
        text-[9px]
        font-semibold
        transition-all
        ${
          danger
            ? "bg-red-400/[0.03] border-red-400/[0.10] text-red-400 hover:bg-red-400/[0.08] hover:border-red-400/[0.18]"
            : "bg-white/[0.025] border-white/[0.07] text-slate-500 hover:text-white hover:border-white/[0.15]"
        }
      `}
    >
      <Icon className="w-[12px] h-[12px]" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function InfoCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg bg-[#0d1013] border border-white/[0.07] p-3">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-[13px] h-[13px] text-slate-600" />

        <span className="text-[8px] font-semibold uppercase tracking-[0.08em] text-slate-600">
          {label}
        </span>
      </div>

      <p className="text-[10px] text-slate-300 break-all">{value}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="min-h-[180px] flex flex-col items-center justify-center gap-3">
      <Loader2 className="w-5 h-5 text-[#f2bd19] animate-spin" />

      <p className="text-[9px] text-slate-600">Loading...</p>
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="min-h-[180px] flex flex-col items-center justify-center px-5 text-center">
      <div className="w-10 h-10 rounded-xl bg-white/[0.025] border border-white/[0.07] flex items-center justify-center mb-3">
        <Icon className="w-[16px] h-[16px] text-slate-600" />
      </div>

      <p className="text-[11px] font-medium text-slate-400">{title}</p>

      <p className="text-[9px] text-slate-600 mt-1 max-w-xs">{description}</p>
    </div>
  );
}
