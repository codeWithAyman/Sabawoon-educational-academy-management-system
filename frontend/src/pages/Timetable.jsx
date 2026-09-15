import { useEffect, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/Toast";
import {
  Plus,
  Loader2,
  Trash2,
  Calendar,
  Clock3,
  MapPin,
  UserRound,
} from "lucide-react";

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export default function Timetable() {
  const { user } = useAuth();
  const toast = useToast();
  const canEdit = ["admin", "teacher"].includes(user.role);

  const [rows, setRows] = useState(null);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [classId, setClassId] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const [form, setForm] = useState({
    class_id: "",
    day_of_week: "Monday",
    period: 1,
    subject_id: "",
    teacher_id: "",
    start_time: "",
    end_time: "",
    room: "",
  });

  async function load() {
    try {
      const q = classId ? `?class_id=${classId}` : "";
      const { data } = await api.get("/timetable" + q);
      setRows(data);
    } catch {
      toast.error("Failed to load timetable");
      setRows([]);
    }
  }

  useEffect(() => {
    if (canEdit) {
      api
        .get("/classes")
        .then((r) => setClasses(r.data))
        .catch(() => toast.error("Failed to load classes"));

      api
        .get("/users?role=teacher")
        .then((r) => setTeachers(r.data))
        .catch(() => toast.error("Failed to load teachers"));
    }

    load();
  }, []);

  useEffect(() => {
    load();
  }, [classId]);

  useEffect(() => {
    if (!form.class_id) {
      setSubjects([]);
      return;
    }

    api
      .get(`/classes/${form.class_id}/subjects`)
      .then((r) => setSubjects(r.data))
      .catch(() => {
        setSubjects([]);
        toast.error("Failed to load subjects");
      });
  }, [form.class_id]);

  async function add(e) {
    e.preventDefault();

    try {
      await api.post("/timetable", form);
      toast.success("Timetable entry created");
      setAdding(false);
      setForm({
        class_id: "",
        day_of_week: "Monday",
        period: 1,
        subject_id: "",
        teacher_id: "",
        start_time: "",
        end_time: "",
        room: "",
      });
      load();
    } catch (e) {
      toast.error(
        e.response?.data?.error || "Failed to create timetable entry",
      );
    }
  }

  async function del(id) {
    if (!confirm("Delete this timetable entry?")) return;

    setDeleting(id);

    try {
      await api.delete(`/timetable/${id}`);
      toast.success("Timetable entry deleted");
      load();
    } catch (e) {
      toast.error(
        e.response?.data?.error || "Failed to delete timetable entry",
      );
    } finally {
      setDeleting(null);
    }
  }

  const grouped = {};

  (rows || []).forEach((r) => {
    (grouped[r.day_of_week] = grouped[r.day_of_week] || []).push(r);
  });

  return (
    <div className="min-h-full bg-[#0b0d10] text-slate-100 p-5 sm:p-6">
      <div className="max-w-[1600px] mx-auto space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#f2bd19]/10 border border-[#f2bd19]/20 grid place-items-center">
                <Calendar className="w-5 h-5 text-[#f2bd19]" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-white">
                  Timetable
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Manage weekly class schedules
                </p>
              </div>
            </div>
          </div>

          {canEdit && (
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                className="w-full sm:w-44 h-10 px-3 rounded-lg bg-[#121519] border border-white/10 text-sm text-slate-200 outline-none transition focus:border-[#f2bd19]/50"
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
              >
                <option value="">All classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <button
                className="h-10 px-4 rounded-lg bg-[#f2bd19] text-[#0b0d10] text-sm font-bold flex items-center justify-center gap-2 transition hover:bg-[#ffd34d] active:scale-[0.98]"
                onClick={() => setAdding(!adding)}
              >
                <Plus className="w-4 h-4" />
                New entry
              </button>
            </div>
          )}
        </div>

        {adding && canEdit && (
          <form
            onSubmit={add}
            className="rounded-xl bg-[#121519] border border-white/10 p-5 shadow-[0_10px_40px_rgba(0,0,0,0.25)]"
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Create timetable entry
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Add a class period to the weekly schedule
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Class
                </label>
                <select
                  required
                  className="w-full h-10 px-3 rounded-lg bg-[#0d1013] border border-white/10 text-sm text-slate-200 outline-none focus:border-[#f2bd19]/50"
                  value={form.class_id}
                  onChange={(e) =>
                    setForm({ ...form, class_id: e.target.value })
                  }
                >
                  <option value="">Select class</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Day
                </label>
                <select
                  className="w-full h-10 px-3 rounded-lg bg-[#0d1013] border border-white/10 text-sm text-slate-200 outline-none focus:border-[#f2bd19]/50"
                  value={form.day_of_week}
                  onChange={(e) =>
                    setForm({ ...form, day_of_week: e.target.value })
                  }
                >
                  {DAYS.map((day) => (
                    <option key={day}>{day}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Period
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  className="w-full h-10 px-3 rounded-lg bg-[#0d1013] border border-white/10 text-sm text-slate-200 outline-none focus:border-[#f2bd19]/50"
                  value={form.period}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      period: parseInt(e.target.value) || 1,
                    })
                  }
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Subject
                </label>
                <select
                  className="w-full h-10 px-3 rounded-lg bg-[#0d1013] border border-white/10 text-sm text-slate-200 outline-none focus:border-[#f2bd19]/50 disabled:opacity-40"
                  value={form.subject_id}
                  onChange={(e) =>
                    setForm({ ...form, subject_id: e.target.value })
                  }
                  disabled={!form.class_id}
                >
                  <option value="">
                    {form.class_id ? "Select subject" : "Select class first"}
                  </option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Teacher
                </label>
                <select
                  className="w-full h-10 px-3 rounded-lg bg-[#0d1013] border border-white/10 text-sm text-slate-200 outline-none focus:border-[#f2bd19]/50"
                  value={form.teacher_id}
                  onChange={(e) =>
                    setForm({ ...form, teacher_id: e.target.value })
                  }
                >
                  <option value="">No teacher</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1.5">
                  <Clock3 className="w-3.5 h-3.5" />
                  Start time
                </label>
                <input
                  type="time"
                  className="w-full h-10 px-3 rounded-lg bg-[#0d1013] border border-white/10 text-sm text-slate-200 outline-none focus:border-[#f2bd19]/50"
                  value={form.start_time}
                  onChange={(e) =>
                    setForm({ ...form, start_time: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1.5">
                  <Clock3 className="w-3.5 h-3.5" />
                  End time
                </label>
                <input
                  type="time"
                  className="w-full h-10 px-3 rounded-lg bg-[#0d1013] border border-white/10 text-sm text-slate-200 outline-none focus:border-[#f2bd19]/50"
                  value={form.end_time}
                  onChange={(e) =>
                    setForm({ ...form, end_time: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  Room
                </label>
                <input
                  className="w-full h-10 px-3 rounded-lg bg-[#0d1013] border border-white/10 text-sm text-slate-200 outline-none focus:border-[#f2bd19]/50 placeholder:text-slate-600"
                  placeholder="e.g. Room 3"
                  value={form.room}
                  onChange={(e) => setForm({ ...form, room: e.target.value })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-white/5">
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="h-10 px-4 rounded-lg border border-white/10 bg-white/[0.02] text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.05] transition"
              >
                Cancel
              </button>

              <button
                type="submit"
                className="h-10 px-5 rounded-lg bg-[#f2bd19] text-[#0b0d10] text-sm font-bold hover:bg-[#ffd34d] transition"
              >
                Create entry
              </button>
            </div>
          </form>
        )}

        {!rows ? (
          <div className="rounded-xl bg-[#121519] border border-white/10 p-16 grid place-items-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 text-[#f2bd19] animate-spin" />
              <span className="text-xs text-slate-500">
                Loading timetable...
              </span>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl bg-[#121519] border border-white/10 p-16 text-center">
            <div className="w-14 h-14 mx-auto rounded-xl bg-[#f2bd19]/10 border border-[#f2bd19]/15 grid place-items-center mb-4">
              <Calendar className="w-7 h-7 text-[#f2bd19]/70" />
            </div>
            <h3 className="text-sm font-semibold text-slate-300">
              No timetable entries
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {canEdit
                ? "Create a new entry to build the weekly schedule."
                : "There are currently no scheduled classes."}
            </p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-4">
            {DAYS.filter((day) => grouped[day]).map((day) => (
              <div
                key={day}
                className="rounded-xl bg-[#121519] border border-white/10 overflow-hidden"
              >
                <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-[#f2bd19]/10 border border-[#f2bd19]/15 grid place-items-center">
                      <Calendar className="w-4 h-4 text-[#f2bd19]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        {day}
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        {grouped[day].length}{" "}
                        {grouped[day].length === 1 ? "period" : "periods"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-3 space-y-2">
                  {grouped[day].map((r) => (
                    <div
                      key={r.id}
                      className="group flex items-center gap-3 p-3 rounded-lg bg-[#0d1013] border border-white/5 hover:border-[#f2bd19]/20 transition"
                    >
                      <div className="w-11 h-11 shrink-0 rounded-lg bg-[#f2bd19]/10 border border-[#f2bd19]/15 grid place-items-center">
                        <span className="text-xs font-bold text-[#f2bd19]">
                          P{r.period}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-slate-200 truncate">
                          {r.subject_name || "—"}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-slate-500">
                          <span className="flex items-center gap-1">
                            <UserRound className="w-3 h-3" />
                            {r.teacher_name || "No teacher"}
                          </span>

                          {r.room && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {r.room}
                            </span>
                          )}

                          {r.start_time && (
                            <span className="flex items-center gap-1">
                              <Clock3 className="w-3 h-3" />
                              {r.start_time.slice(0, 5)}
                              {r.end_time && ` - ${r.end_time.slice(0, 5)}`}
                            </span>
                          )}
                        </div>
                      </div>

                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => del(r.id)}
                          disabled={deleting === r.id}
                          className="w-8 h-8 shrink-0 rounded-lg grid place-items-center text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition disabled:opacity-40"
                          title="Delete entry"
                        >
                          {deleting === r.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
