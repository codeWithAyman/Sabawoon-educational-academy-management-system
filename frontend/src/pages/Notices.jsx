import { useEffect, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/Toast";
import {
  Plus,
  Loader2,
  Megaphone,
  Trash2,
  X,
  Send,
  AlertTriangle,
  Clock3,
  Users,
  CheckCircle2,
} from "lucide-react";

const initialForm = {
  title: "",
  description: "",
  priority: "normal",
  target_role: "all",
};

export default function Notices() {
  const { user } = useAuth();
  const toast = useToast();

  const [rows, setRows] = useState(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [form, setForm] = useState(initialForm);

  const canPost = user?.role === "admin";

  async function load() {
    try {
      const { data } = await api.get("/notices");
      setRows(data);
    } catch {
      setRows([]);
      toast.error("Unable to load notices");
    }
  }

  useEffect(() => {
    load();
  }, []);

  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function add(e) {
    e.preventDefault();

    if (!form.title.trim() || !form.description.trim()) {
      toast.error("Please complete the notice");
      return;
    }

    try {
      setSaving(true);

      await api.post("/notices", {
        ...form,
        title: form.title.trim(),
        description: form.description.trim(),
      });

      toast.success("Notice posted successfully");
      setAdding(false);
      setForm(initialForm);
      await load();
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to post notice");
    } finally {
      setSaving(false);
    }
  }

  async function del(id) {
    const confirmed = window.confirm(
      "Delete this notice?\n\nThis action cannot be undone.",
    );

    if (!confirmed) return;

    try {
      setDeleting(id);

      await api.delete(`/notices/${id}`);

      toast.success("Notice deleted successfully");
      await load();
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to delete notice");
    } finally {
      setDeleting(null);
    }
  }

  function cancelAdd() {
    setAdding(false);
    setForm(initialForm);
  }

  function getPriorityConfig(priority) {
    if (priority === "urgent") {
      return {
        label: "Urgent",
        icon: AlertTriangle,
        badge: "border-red-400/20 bg-red-400/[0.08] text-red-300",
        iconBox: "border-red-400/20 bg-red-400/[0.08] text-red-400",
        glow: "shadow-[0_0_35px_rgba(239,68,68,0.08)]",
      };
    }

    if (priority === "high") {
      return {
        label: "High",
        icon: AlertTriangle,
        badge: "border-amber-400/20 bg-amber-400/[0.08] text-amber-300",
        iconBox: "border-amber-400/20 bg-amber-400/[0.08] text-amber-400",
        glow: "shadow-[0_0_35px_rgba(245,158,11,0.06)]",
      };
    }

    return {
      label: "Normal",
      icon: Megaphone,
      badge: "border-white/[0.08] bg-white/[0.035] text-slate-400",
      iconBox: "border-[#f2bd19]/15 bg-[#f2bd19]/[0.06] text-[#f2bd19]",
      glow: "",
    };
  }

  function getTargetLabel(target) {
    if (target === "student") return "Students";
    if (target === "teacher") return "Teachers";
    if (target === "staff") return "Staff";
    return "Everyone";
  }

  return (
    <div className="space-y-6 text-white">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#f2bd19]/15 bg-[#f2bd19]/[0.06] text-[#f2bd19]">
              <Megaphone className="h-5 w-5" />
            </div>

            <div>
              <h2 className="text-xl font-semibold tracking-tight text-white">
                Notices
              </h2>

              <p className="mt-0.5 text-xs text-slate-500">
                System announcements and important updates
              </p>
            </div>
          </div>
        </div>

        {canPost && (
          <button
            type="button"
            onClick={() => setAdding((value) => !value)}
            className="ml-auto inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#f2bd19]/30 bg-[#f2bd19] px-4 text-xs font-semibold text-[#0b0d10] shadow-[0_8px_30px_rgba(242,189,25,0.12)] transition-all duration-200 hover:bg-[#ffd34d] hover:shadow-[0_10px_35px_rgba(242,189,25,0.2)] active:scale-[0.98]"
          >
            {adding ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}

            {adding ? "Close" : "New notice"}
          </button>
        )}
      </div>

      {adding && (
        <form
          onSubmit={add}
          className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#121519] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.22)]"
        >
          <div className="pointer-events-none absolute right-[-80px] top-[-80px] h-48 w-48 rounded-full bg-[#f2bd19]/[0.035] blur-3xl" />

          <div className="relative mb-5 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#f2bd19]/15 bg-[#f2bd19]/[0.06] text-[#f2bd19]">
              <Send className="h-4 w-4" />
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white">
                Create notice
              </h3>

              <p className="mt-0.5 text-[11px] text-slate-500">
                Publish an announcement to the selected audience
              </p>
            </div>
          </div>

          <div className="relative grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Title
              </label>

              <input
                required
                value={form.title}
                onChange={(e) => updateForm("title", e.target.value)}
                placeholder="Enter notice title"
                className="h-11 w-full rounded-xl border border-white/[0.08] bg-[#0d1013] px-3.5 text-sm text-white outline-none transition-all placeholder:text-slate-700 focus:border-[#f2bd19]/40 focus:ring-2 focus:ring-[#f2bd19]/[0.06]"
              />
            </div>

            <div>
              <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Priority
              </label>

              <select
                value={form.priority}
                onChange={(e) => updateForm("priority", e.target.value)}
                className="h-11 w-full appearance-none rounded-xl border border-white/[0.08] bg-[#0d1013] px-3.5 text-sm text-white outline-none transition-all focus:border-[#f2bd19]/40 focus:ring-2 focus:ring-[#f2bd19]/[0.06]"
              >
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div className="relative mt-4">
            <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Description
            </label>

            <textarea
              required
              rows={5}
              value={form.description}
              onChange={(e) => updateForm("description", e.target.value)}
              placeholder="Write your announcement..."
              className="w-full resize-none rounded-xl border border-white/[0.08] bg-[#0d1013] px-3.5 py-3 text-sm leading-6 text-white outline-none transition-all placeholder:text-slate-700 focus:border-[#f2bd19]/40 focus:ring-2 focus:ring-[#f2bd19]/[0.06]"
            />
          </div>

          <div className="relative mt-4">
            <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Audience
            </label>

            <div className="relative">
              <Users className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />

              <select
                value={form.target_role}
                onChange={(e) => updateForm("target_role", e.target.value)}
                className="h-11 w-full appearance-none rounded-xl border border-white/[0.08] bg-[#0d1013] pl-10 pr-3.5 text-sm text-white outline-none transition-all focus:border-[#f2bd19]/40 focus:ring-2 focus:ring-[#f2bd19]/[0.06]"
              >
                <option value="all">Everyone</option>
                <option value="student">Students</option>
                <option value="teacher">Teachers</option>
                <option value="staff">Staff</option>
              </select>
            </div>
          </div>

          <div className="relative mt-5 flex justify-end gap-2 border-t border-white/[0.06] pt-4">
            <button
              type="button"
              onClick={cancelAdd}
              className="h-10 rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 text-xs font-medium text-slate-400 transition hover:bg-white/[0.05] hover:text-white"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#f2bd19] px-5 text-xs font-semibold text-[#0b0d10] transition hover:bg-[#ffd34d] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Publishing...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Post notice
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {!rows ? (
        <div className="rounded-2xl border border-white/[0.07] bg-[#121519] p-16 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#f2bd19]" />
          <p className="mt-3 text-xs text-slate-600">Loading notices...</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.07] bg-[#121519] p-16 text-center shadow-[0_20px_70px_rgba(0,0,0,0.15)]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.025]">
            <Megaphone className="h-6 w-6 text-slate-600" />
          </div>

          <h3 className="mt-4 text-sm font-semibold text-slate-400">
            No notices yet
          </h3>

          <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-600">
            Important announcements and system updates will appear here.
          </p>

          {canPost && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="mt-5 inline-flex items-center gap-2 rounded-lg border border-[#f2bd19]/20 bg-[#f2bd19]/[0.06] px-4 py-2 text-xs font-medium text-[#f2bd19] transition hover:bg-[#f2bd19]/[0.1]"
            >
              <Plus className="h-3.5 w-3.5" />
              Create first notice
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((notice) => {
            const priority = getPriorityConfig(notice.priority);
            const PriorityIcon = priority.icon;

            return (
              <div
                key={notice.id}
                className={`group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#121519] p-5 transition-all duration-300 hover:border-white/[0.11] hover:bg-[#14181c] ${priority.glow}`}
              >
                <div className="pointer-events-none absolute left-0 top-0 h-full w-px bg-gradient-to-b from-[#f2bd19]/30 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${priority.iconBox}`}
                  >
                    <PriorityIcon className="h-5 w-5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-white">
                        {notice.title}
                      </h3>

                      <span
                        className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${priority.badge}`}
                      >
                        {priority.label}
                      </span>

                      <span className="inline-flex items-center gap-1 rounded-full border border-[#f2bd19]/10 bg-[#f2bd19]/[0.045] px-2 py-0.5 text-[9px] font-medium text-[#f2bd19]/70">
                        <Users className="h-2.5 w-2.5" />
                        {getTargetLabel(notice.target_role)}
                      </span>
                    </div>

                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-400">
                      {notice.description}
                    </p>

                    <div className="mt-4 flex flex-wrap items-center gap-3 text-[10px] text-slate-600">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 className="h-3 w-3" />
                        {new Date(notice.created_at).toLocaleString()}
                      </span>

                      <span className="text-slate-800">•</span>

                      <span>{notice.author_name || "System"}</span>
                    </div>
                  </div>

                  {canPost && (
                    <button
                      type="button"
                      onClick={() => del(notice.id)}
                      disabled={deleting === notice.id}
                      title="Delete notice"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-transparent text-slate-700 transition hover:border-red-400/10 hover:bg-red-400/[0.06] hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {deleting === notice.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-center gap-2 pt-2 text-[9px] uppercase tracking-[0.25em] text-slate-700">
        <CheckCircle2 className="h-3 w-3 text-[#f2bd19]/30" />
        Administrative announcement system
      </div>
    </div>
  );
}
