import { useEffect, useMemo, useState } from "react";
import {
  Award,
  Plus,
  Search,
  Trash2,
  ChevronRight,
  ArrowLeft,
  Save,
  Loader2,
  Clock3,
  UserRound,
  BookOpen,
} from "lucide-react";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/Toast";

function formatTime(value) {
  if (!value) return "";

  const parts = String(value).split(":");
  const hour = Number(parts[0]);
  const minute = parts[1] || "00";

  if (!Number.isFinite(hour)) return value;

  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${minute} ${suffix}`;
}

function formatDate(value) {
  if (!value) return "—";

  const text = String(value).slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return value;
  }

  const [year, month, day] = text.split("-");
  return `${day}/${month}/${year}`;
}

function slotLabel(slot) {
  const time = `${formatTime(slot.start_time)} – ${formatTime(slot.end_time)}`;

  const room = slot.room ? ` · ${slot.room}` : "";
  const days = slot.days ? ` · ${slot.days}` : "";

  return `${slot.subject_name} · ${time}${days}${room}`;
}

export default function Exams() {
  const { user } = useAuth();
  const toast = useToast();

  const isAdmin = user?.role === "admin";
  const isTeacher = user?.role === "teacher";

  const [slots, setSlots] = useState([]);
  const [assessments, setAssessments] = useState([]);

  const [selectedSlot, setSelectedSlot] = useState("");
  const [search, setSearch] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [selectedAssessment, setSelectedAssessment] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scoresLoading, setScoresLoading] = useState(false);

  const [scores, setScores] = useState([]);

  const [form, setForm] = useState({
    name: "",
    class_slot_id: "",
    exam_date: "",
    total_marks: "100",
    academic_year: "",
  });

  const loadData = async () => {
    try {
      setLoading(true);

      const [slotResponse, assessmentResponse] = await Promise.all([
        api.get("/marks/assignments"),
        api.get("/marks/assessments"),
      ]);

      setSlots(slotResponse.data || []);
      setAssessments(assessmentResponse.data || []);
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to load reports");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredSlots = useMemo(() => {
    return slots.filter((slot) => {
      if (!search.trim()) return true;

      const value = search.toLowerCase();

      return (
        String(slot.subject_name || "")
          .toLowerCase()
          .includes(value) ||
        String(slot.teacher_name || "")
          .toLowerCase()
          .includes(value) ||
        String(slot.room || "")
          .toLowerCase()
          .includes(value) ||
        String(slot.days || "")
          .toLowerCase()
          .includes(value)
      );
    });
  }, [slots, search]);

  const filteredAssessments = useMemo(() => {
    return assessments.filter((assessment) => {
      if (
        selectedSlot &&
        String(assessment.class_slot_id) !== String(selectedSlot)
      ) {
        return false;
      }

      if (!search.trim()) return true;

      const value = search.toLowerCase();

      return (
        String(assessment.name || "")
          .toLowerCase()
          .includes(value) ||
        String(assessment.subject_name || "")
          .toLowerCase()
          .includes(value) ||
        String(assessment.teacher_name || "")
          .toLowerCase()
          .includes(value)
      );
    });
  }, [assessments, selectedSlot, search]);

  const selectedFormSlot = useMemo(() => {
    return slots.find(
      (slot) =>
        String(slot.id || slot.class_slot_id) === String(form.class_slot_id),
    );
  }, [slots, form.class_slot_id]);

  const resetForm = () => {
    setForm({
      name: "",
      class_slot_id: "",
      exam_date: "",
      total_marks: "100",
      academic_year: "",
    });
  };

  const startCreate = () => {
    resetForm();
    setShowCreate(true);
  };

  const handleCreate = async (event) => {
    event.preventDefault();

    if (
      !form.name.trim() ||
      !form.class_slot_id ||
      !form.exam_date ||
      !form.total_marks
    ) {
      toast.error("Please complete all required fields");
      return;
    }

    const totalMarks = Number(form.total_marks);

    if (!Number.isFinite(totalMarks) || totalMarks <= 0) {
      toast.error("Maximum marks must be greater than zero");
      return;
    }

    try {
      setSaving(true);

      await api.post("/marks/assessments", {
        name: form.name.trim(),
        class_slot_id: Number(form.class_slot_id),
        exam_date: form.exam_date,
        total_marks: totalMarks,
        academic_year: form.academic_year.trim() || null,
        is_published: false,
      });

      toast.success("Assessment created successfully");

      setShowCreate(false);
      resetForm();

      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to create assessment");
    } finally {
      setSaving(false);
    }
  };

  const openAssessment = async (assessment) => {
    try {
      setSelectedAssessment(assessment);
      setScoresLoading(true);

      const response = await api.get(
        `/marks/assessments/${assessment.id}/scores`,
      );

      setScores(response.data?.students || []);
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to load assessment");

      setSelectedAssessment(null);
      setScores([]);
    } finally {
      setScoresLoading(false);
    }
  };

  const updateScore = (studentId, value) => {
    setScores((current) =>
      current.map((student) =>
        Number(student.student_id) === Number(studentId)
          ? {
              ...student,
              marks_obtained: value,
            }
          : student,
      ),
    );
  };

  const updateGrade = (studentId, value) => {
    setScores((current) =>
      current.map((student) =>
        Number(student.student_id) === Number(studentId)
          ? {
              ...student,
              grade: value,
            }
          : student,
      ),
    );
  };

  const updateRemarks = (studentId, value) => {
    setScores((current) =>
      current.map((student) =>
        Number(student.student_id) === Number(studentId)
          ? {
              ...student,
              remarks: value,
            }
          : student,
      ),
    );
  };

  const saveScores = async () => {
    if (!selectedAssessment) return;

    try {
      setSaving(true);

      const total = Number(selectedAssessment.total_marks);

      const payload = scores
        .filter(
          (student) =>
            student.marks_obtained !== null &&
            student.marks_obtained !== undefined &&
            student.marks_obtained !== "",
        )
        .map((student) => ({
          student_id: Number(student.student_id),
          marks_obtained: Number(student.marks_obtained),
          grade: student.grade || null,
          remarks: student.remarks || null,
        }));

      const invalid = payload.find(
        (score) =>
          !Number.isFinite(score.marks_obtained) ||
          score.marks_obtained < 0 ||
          score.marks_obtained > total,
      );

      if (invalid) {
        toast.error(`Scores must be between 0 and ${total}`);
        return;
      }

      await api.put(`/marks/assessments/${selectedAssessment.id}/scores`, {
        scores: payload,
      });

      toast.success("Scores saved successfully");

      await openAssessment(selectedAssessment);
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to save scores");
    } finally {
      setSaving(false);
    }
  };

  const deleteAssessment = async (assessment) => {
    if (
      !window.confirm(
        `Delete "${assessment.name}"? This will also delete its scores.`,
      )
    ) {
      return;
    }

    try {
      setSaving(true);

      await api.delete(`/marks/assessments/${assessment.id}`);

      toast.success("Assessment deleted successfully");

      if (selectedAssessment?.id === assessment.id) {
        setSelectedAssessment(null);
        setScores([]);
      }

      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to delete assessment");
    } finally {
      setSaving(false);
    }
  };

  if (selectedAssessment) {
    const totalMarks = Number(selectedAssessment.total_marks);

    return (
      <div className="relative min-h-full overflow-hidden">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-[-220px] h-[500px] w-[500px] -translate-x-1/2 -translate-y-0 rounded-full bg-[#f2bd19]/[0.035] blur-[130px]" />
        </div>

        <div className="relative space-y-6">
          <button
            onClick={() => {
              setSelectedAssessment(null);
              setScores([]);
            }}
            className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
          >
            <ArrowLeft size={16} />
            Back to Reports
          </button>

          <div className="rounded-xl border border-white/[0.07] bg-[#121519] p-5 shadow-xl">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[#f2bd19]">
                  <Award size={14} />
                  Academic Report
                </div>

                <h1 className="text-2xl font-semibold text-white">
                  {selectedAssessment.name}
                </h1>

                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-400">
                  <span className="inline-flex items-center gap-2">
                    <BookOpen size={14} />
                    {selectedAssessment.subject_name}
                  </span>

                  <span className="inline-flex items-center gap-2">
                    <Clock3 size={14} />
                    {formatTime(selectedAssessment.start_time)} –{" "}
                    {formatTime(selectedAssessment.end_time)}
                  </span>

                  <span className="inline-flex items-center gap-2">
                    <UserRound size={14} />
                    {selectedAssessment.teacher_name}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-sm">
                <div className="rounded-lg border border-white/[0.06] bg-[#0d1013] px-4 py-2 text-slate-300">
                  Max marks:{" "}
                  <span className="font-semibold text-white">
                    {selectedAssessment.total_marks}
                  </span>
                </div>

                <div className="rounded-lg border border-white/[0.06] bg-[#0d1013] px-4 py-2 text-slate-300">
                  Date:{" "}
                  <span className="font-semibold text-white">
                    {formatDate(selectedAssessment.exam_date)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-[#121519] shadow-xl">
            <div className="flex flex-col gap-3 border-b border-white/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold text-white">Student Results</h2>

                <p className="mt-1 text-sm text-slate-500">
                  Enter scores, grades, and remarks for enrolled students.
                </p>
              </div>

              <button
                onClick={saveScores}
                disabled={saving || scoresLoading}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#f2bd19] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#ffd34f] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                Save Scores
              </button>
            </div>

            {scoresLoading ? (
              <div className="flex items-center justify-center py-16 text-slate-400">
                <Loader2 size={22} className="mr-2 animate-spin" />
                Loading students...
              </div>
            ) : scores.length === 0 ? (
              <div className="px-5 py-16 text-center text-slate-500">
                No students are enrolled in this class slot.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[950px] text-left">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-xs uppercase tracking-wider text-slate-500">
                      <th className="px-5 py-4">Roll No.</th>
                      <th className="px-5 py-4">Guardian</th>
                      <th className="px-5 py-4">Score</th>
                      <th className="px-5 py-4">Percentage</th>
                      <th className="px-5 py-4">Grade</th>
                      <th className="px-5 py-4">Remarks</th>
                    </tr>
                  </thead>

                  <tbody>
                    {scores.map((student) => {
                      const value =
                        student.marks_obtained === null ||
                        student.marks_obtained === undefined
                          ? ""
                          : student.marks_obtained;

                      const percentage =
                        value === "" || totalMarks <= 0
                          ? null
                          : ((Number(value) / totalMarks) * 100).toFixed(1);

                      return (
                        <tr
                          key={student.student_id}
                          className="border-b border-white/[0.04] last:border-0"
                        >
                          <td className="px-5 py-4 font-medium text-white">
                            {student.roll_number}
                          </td>

                          <td className="px-5 py-4 text-sm text-slate-400">
                            {student.guardian_name || "—"}
                          </td>

                          <td className="px-5 py-4">
                            <input
                              type="number"
                              min="0"
                              max={totalMarks}
                              value={value}
                              onChange={(event) =>
                                updateScore(
                                  student.student_id,
                                  event.target.value,
                                )
                              }
                              className="w-24 rounded-lg border border-white/[0.08] bg-[#0d1013] px-3 py-2 text-sm text-white outline-none transition focus:border-[#f2bd19]/60"
                            />
                          </td>

                          <td className="px-5 py-4 text-sm text-slate-400">
                            {percentage === null ? "—" : `${percentage}%`}
                          </td>

                          <td className="px-5 py-4">
                            <input
                              type="text"
                              maxLength={5}
                              value={student.grade || ""}
                              onChange={(event) =>
                                updateGrade(
                                  student.student_id,
                                  event.target.value,
                                )
                              }
                              placeholder="A"
                              className="w-20 rounded-lg border border-white/[0.08] bg-[#0d1013] px-3 py-2 text-sm text-white uppercase outline-none transition focus:border-[#f2bd19]/60"
                            />
                          </td>

                          <td className="px-5 py-4">
                            <input
                              type="text"
                              value={student.remarks || ""}
                              onChange={(event) =>
                                updateRemarks(
                                  student.student_id,
                                  event.target.value,
                                )
                              }
                              placeholder="Optional"
                              className="w-52 rounded-lg border border-white/[0.08] bg-[#0d1013] px-3 py-2 text-sm text-white outline-none transition focus:border-[#f2bd19]/60"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-full overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-220px] h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-[#f2bd19]/[0.035] blur-[130px]" />
        <div className="absolute bottom-[-260px] right-[-120px] h-[450px] w-[450px] rounded-full bg-[#f2bd19]/[0.018] blur-[120px]" />
      </div>

      <div className="relative space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[#f2bd19]">
              <Award size={14} />
              Academic Results
            </div>

            <h1 className="text-2xl font-semibold text-white">Reports</h1>

            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Create assessments and manage student academic results by subject,
              class time, and teacher.
            </p>
          </div>

          {(isAdmin || isTeacher) && (
            <button
              onClick={startCreate}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#f2bd19] px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-[#ffd34f]"
            >
              <Plus size={17} />
              Add Assessment
            </button>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.5fr]">
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-slate-500">
              Class Slot
            </label>

            <select
              value={selectedSlot}
              onChange={(event) => setSelectedSlot(event.target.value)}
              className="w-full rounded-lg border border-white/[0.08] bg-[#121519] px-3 py-2.5 text-sm text-white outline-none focus:border-[#f2bd19]/60"
            >
              <option value="">All class slots</option>

              {slots.map((slot) => (
                <option key={slot.class_slot_id} value={slot.class_slot_id}>
                  {slotLabel(slot)}
                </option>
              ))}
            </select>
          </div>

          <div className="hidden lg:block">
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-slate-500">
              Your Access
            </label>

            <div className="flex h-[42px] items-center rounded-lg border border-white/[0.08] bg-[#121519] px-3 text-sm text-slate-400">
              {isAdmin
                ? "Administrator — all class slots"
                : "Teacher — assigned class slots only"}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-slate-500">
              Search
            </label>

            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              />

              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search subject, teacher, room..."
                className="w-full rounded-lg border border-white/[0.08] bg-[#121519] py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-[#f2bd19]/60"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-[#121519] shadow-xl">
          <div className="border-b border-white/[0.06] px-5 py-4">
            <h2 className="font-semibold text-white">Assessments</h2>

            <p className="mt-1 text-sm text-slate-500">
              {filteredAssessments.length} assessment
              {filteredAssessments.length === 1 ? "" : "s"}
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 size={22} className="mr-2 animate-spin" />
              Loading Reports...
            </div>
          ) : filteredAssessments.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <Award className="mx-auto mb-3 text-slate-600" size={30} />

              <p className="text-sm text-slate-400">No assessments found.</p>

              {(isAdmin || isTeacher) && (
                <button
                  onClick={startCreate}
                  className="mt-4 text-sm font-medium text-[#f2bd19] hover:underline"
                >
                  Create your first assessment
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-white/[0.05]">
              {filteredAssessments.map((assessment) => (
                <div
                  key={assessment.id}
                  className="flex flex-col gap-4 px-5 py-4 transition hover:bg-white/[0.015] lg:flex-row lg:items-center lg:justify-between"
                >
                  <button
                    onClick={() => openAssessment(assessment)}
                    className="flex min-w-0 flex-1 items-center gap-4 text-left"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#f2bd19]/10 text-[#f2bd19]">
                      <Award size={18} />
                    </div>

                    <div className="min-w-0">
                      <h3 className="truncate font-medium text-white">
                        {assessment.name}
                      </h3>

                      <p className="mt-1 truncate text-sm text-slate-500">
                        {assessment.subject_name} ·{" "}
                        {formatTime(assessment.start_time)} –{" "}
                        {formatTime(assessment.end_time)} ·{" "}
                        {assessment.teacher_name}
                      </p>
                    </div>

                    <ChevronRight
                      size={17}
                      className="ml-auto shrink-0 text-slate-600"
                    />
                  </button>

                  <div className="flex items-center gap-3 lg:shrink-0">
                    <div className="text-right">
                      <div className="text-sm font-medium text-slate-300">
                        {assessment.score_count} scored
                      </div>

                      <div className="mt-1 text-xs text-slate-600">
                        {formatDate(assessment.exam_date)}
                      </div>
                    </div>

                    {isAdmin && (
                      <button
                        onClick={() => deleteAssessment(assessment)}
                        disabled={saving}
                        className="rounded-lg border border-red-500/10 p-2 text-slate-500 transition hover:border-red-500/30 hover:text-red-400"
                        title="Delete assessment"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-[#121519] shadow-xl">
          <div className="border-b border-white/[0.06] px-5 py-4">
            <h2 className="font-semibold text-white">Available Class Slots</h2>

            <p className="mt-1 text-sm text-slate-500">
              Assessments are attached to these exact subject time slots.
            </p>
          </div>

          {filteredSlots.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">
              No class slots found.
            </div>
          ) : (
            <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredSlots.map((slot) => (
                <button
                  key={slot.class_slot_id}
                  onClick={() => setSelectedSlot(String(slot.class_slot_id))}
                  className={`rounded-xl border p-4 text-left transition ${
                    String(selectedSlot) === String(slot.class_slot_id)
                      ? "border-[#f2bd19]/30 bg-[#f2bd19]/[0.06]"
                      : "border-white/[0.07] bg-[#0d1013] hover:border-white/[0.14]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-white">
                        {slot.subject_name}
                      </div>

                      <div className="mt-2 flex items-center gap-2 text-sm text-slate-400">
                        <Clock3 size={14} />
                        {formatTime(slot.start_time)} –{" "}
                        {formatTime(slot.end_time)}
                      </div>
                    </div>

                    <BookOpen size={17} className="text-[#f2bd19]" />
                  </div>

                  <div className="mt-3 text-xs text-slate-500">
                    Teacher: {slot.teacher_name}
                  </div>

                  <div className="mt-1 text-xs text-slate-600">
                    {slot.days}
                    {slot.room ? ` · ${slot.room}` : ""}
                    {" · "}
                    {slot.student_count} students
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-xl border border-white/[0.08] bg-[#121519] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <div>
                <h2 className="font-semibold text-white">Add Assessment</h2>

                <p className="mt-1 text-xs text-slate-500">
                  Attach the assessment to an exact subject time slot.
                </p>
              </div>

              <button
                onClick={() => setShowCreate(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-lg text-slate-500 transition hover:bg-white/[0.05] hover:text-white"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4 p-5">
              <div>
                <label className="mb-2 block text-sm text-slate-400">
                  Assessment Name
                </label>

                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      name: event.target.value,
                    })
                  }
                  placeholder="e.g. Monthly Test"
                  className="w-full rounded-lg border border-white/[0.08] bg-[#0d1013] px-3 py-2.5 text-sm text-white outline-none focus:border-[#f2bd19]/60"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-400">
                  Subject / Class Time
                </label>

                <select
                  value={form.class_slot_id}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      class_slot_id: event.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-white/[0.08] bg-[#0d1013] px-3 py-2.5 text-sm text-white outline-none focus:border-[#f2bd19]/60"
                >
                  <option value="">Select class slot</option>

                  {slots.map((slot) => (
                    <option key={slot.class_slot_id} value={slot.class_slot_id}>
                      {slotLabel(slot)}
                    </option>
                  ))}
                </select>
              </div>

              {selectedFormSlot && (
                <div className="rounded-lg border border-[#f2bd19]/10 bg-[#f2bd19]/[0.035] p-3 text-sm">
                  <div className="font-medium text-white">
                    {selectedFormSlot.subject_name}
                  </div>

                  <div className="mt-1 text-xs text-slate-500">
                    {formatTime(selectedFormSlot.start_time)} –{" "}
                    {formatTime(selectedFormSlot.end_time)}
                    {" · "}
                    {selectedFormSlot.days}
                    {selectedFormSlot.room ? ` · ${selectedFormSlot.room}` : ""}
                  </div>

                  <div className="mt-1 text-xs text-slate-500">
                    Teacher: {selectedFormSlot.teacher_name}
                  </div>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm text-slate-400">
                    Date
                  </label>

                  <input
                    type="date"
                    value={form.exam_date}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        exam_date: event.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-white/[0.08] bg-[#0d1013] px-3 py-2.5 text-sm text-white outline-none focus:border-[#f2bd19]/60"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-400">
                    Maximum Marks
                  </label>

                  <input
                    type="number"
                    min="1"
                    value={form.total_marks}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        total_marks: event.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-white/[0.08] bg-[#0d1013] px-3 py-2.5 text-sm text-white outline-none focus:border-[#f2bd19]/60"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-400">
                  Academic Year
                </label>

                <input
                  value={form.academic_year}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      academic_year: event.target.value,
                    })
                  }
                  placeholder="e.g. 2026-2027"
                  className="w-full rounded-lg border border-white/[0.08] bg-[#0d1013] px-3 py-2.5 text-sm text-white outline-none focus:border-[#f2bd19]/60"
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-white/[0.06] pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-lg border border-white/[0.08] px-4 py-2 text-sm text-slate-400 transition hover:text-white"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#f2bd19] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#ffd34f] disabled:opacity-50"
                >
                  {saving && <Loader2 size={16} className="animate-spin" />}
                  Create Assessment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
