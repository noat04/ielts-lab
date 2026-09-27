"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { LearningTools } from "@/components/LearningTools";
import { PersonalResourceLibrary } from "@/components/PersonalResourceLibrary";
import {
  createLearningPlan,
  deleteExam,
  deleteLesson,
  deletePhase,
  loadPlannerWorkspace,
  saveExam,
  saveLesson,
  savePhase,
  setLessonStatus,
  updateLearningPlan,
  type DailyLesson,
  type ExamEvent,
  type LearningPlan,
  type PlanPhase,
  type PlannerWorkspace,
} from "@/lib/supabase/planner";

type ModalState =
  | { kind: "plan"; item?: LearningPlan }
  | { kind: "phase"; item?: PlanPhase }
  | { kind: "lesson"; item?: DailyLesson; date?: string }
  | { kind: "exam"; item?: ExamEvent }
  | null;

const DAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const SKILLS = ["Listening", "Reading", "Writing", "Speaking", "Grammar / Vocab", "Mock Test", "Review"];

function todayISO() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function futureISO(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function formatDate(value: string) {
  if (!value) return "Chưa đặt";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

export function LearningPlanner({ userId }: { userId: string }) {
  const [workspace, setWorkspace] = useState<PlannerWorkspace | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>();
  const [modal, setModal] = useState<ModalState>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async (planId?: string) => {
    setLoading(true);
    setError("");
    try {
      const data = await loadPlannerWorkspace(planId);
      setWorkspace(data);
      setSelectedPlanId(data.plan?.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải lộ trình.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(selectedPlanId); }, [reload]);

  const plan = workspace?.plan;
  const lessons = workspace?.lessons ?? [];
  const phases = workspace?.phases ?? [];
  const exams = workspace?.exams ?? [];
  const resources = workspace?.resources ?? [];
  const today = todayISO();
  const todayLessons = lessons.filter((lesson) => lesson.date === today);
  const upcomingLessons = lessons.filter((lesson) => lesson.date >= today && lesson.status !== "completed").slice(0, 8);
  const completedLessons = lessons.filter((lesson) => lesson.status === "completed");
  const completionRate = lessons.length ? Math.round(completedLessons.length / lessons.length * 100) : 0;
  const completedMinutes = completedLessons.reduce((sum, lesson) => sum + lesson.duration, 0);
  const upcomingExam = exams.find((exam) => exam.date >= today && exam.status === "planned");
  const daysToExam = upcomingExam ? Math.max(0, Math.ceil((new Date(`${upcomingExam.date}T12:00:00`).getTime() - Date.now()) / 86400000)) : null;

  const phaseProgress = useMemo(() => Object.fromEntries(phases.map((phase) => {
    const phaseLessons = lessons.filter((lesson) => lesson.phaseId === phase.id);
    const done = phaseLessons.filter((lesson) => lesson.status === "completed").length;
    return [phase.id, phaseLessons.length ? Math.round(done / phaseLessons.length * 100) : 0];
  })), [lessons, phases]);

  async function run(action: () => Promise<void>, planId?: string) {
    setSaving(true);
    setError("");
    try {
      await action();
      setModal(null);
      await reload(planId || selectedPlanId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể lưu thay đổi.");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !workspace) return <section className="planner-loading">Đang tải lộ trình cá nhân…</section>;
  if (!workspace) return <section className="planner-loading"><p>{error || "Không thể tải dữ liệu."}</p><button className="primary" onClick={() => void reload()}>Thử lại</button></section>;

  if (!plan) {
    return <main className="planner-onboarding"><section><p className="eyebrow">PERSONAL LEARNING ROADMAP</p><h1>Tạo lộ trình học của riêng bạn</h1><p>Thiết lập mục tiêu, thời gian học và ngày thi. Hệ thống sẽ tạo ba giai đoạn khởi đầu để bạn tùy chỉnh từ A–Z.</p>{error && <p className="form-error">{error}</p>}<PlanForm saving={saving} onSave={(input) => run(async () => { const created = await createLearningPlan(userId, input); setSelectedPlanId(created.id); }, selectedPlanId)}/></section></main>;
  }

  return <main className="planner-page">
    <section className="planner-head">
      <div><p className="eyebrow">PERSONAL LEARNING ROADMAP</p><h1>{plan.title}</h1><p>{plan.description || "Lộ trình học tập cá nhân của bạn."}</p></div>
      <aside><select value={selectedPlanId} onChange={(event) => { setSelectedPlanId(event.target.value); void reload(event.target.value); }}>{workspace.plans.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><button onClick={() => setModal({ kind: "plan", item: plan })}>Chỉnh sửa</button><button className="primary" onClick={() => setModal({ kind: "plan" })}>＋ Lộ trình mới</button></aside>
    </section>

    {error && <div className="status-banner" role="alert"><span>{error}</span><button onClick={() => setError("")}>×</button></div>}

    <section className="planner-stats">
      <article><small>TIẾN ĐỘ BÀI HỌC</small><b>{completionRate}%</b><span>{completedLessons.length}/{lessons.length} bài hoàn thành</span></article>
      <article><small>THỜI GIAN ĐÃ HỌC</small><b>{completedMinutes}</b><span>phút trong lộ trình</span></article>
      <article><small>MỤC TIÊU BAND</small><b>{plan.currentBand.toFixed(1)} → {plan.targetBand.toFixed(1)}</b><span>{plan.weeklyMinutes} phút/tuần</span></article>
      <article className="accent"><small>KỲ THI TIẾP THEO</small><b>{daysToExam === null ? "—" : daysToExam}</b><span>{upcomingExam ? `${upcomingExam.title} · ${formatDate(upcomingExam.date)}` : "Chưa có lịch thi"}</span></article>
    </section>

    <LearningTools userId={userId} plan={plan} phases={phases} onChanged={() => reload(plan.id)}/>

    <section className="today-board">
      <div className="section-heading"><div><p className="eyebrow">HÔM NAY · {formatDate(today)}</p><h2>Bài học theo ngày</h2></div><button className="primary" onClick={() => setModal({ kind: "lesson", date: today })}>＋ Thêm bài hôm nay</button></div>
      <div className="today-lessons">{todayLessons.map((lesson) => <LessonRow key={lesson.id} lesson={lesson} onToggle={() => void run(() => setLessonStatus(lesson.id, lesson.status === "completed" ? "todo" : "completed"))} onEdit={() => setModal({ kind: "lesson", item: lesson })} onDelete={() => { if (confirm(`Xóa bài “${lesson.title}”?`)) void run(() => deleteLesson(lesson.id)); }}/>) }{!todayLessons.length && <div className="planner-empty">Hôm nay chưa có bài học. Hãy thêm một việc nhỏ và cụ thể.</div>}</div>
    </section>

    <section className="roadmap-panel">
      <div className="section-heading"><div><p className="eyebrow">TỪ A ĐẾN Z</p><h2>Các giai đoạn</h2></div><button onClick={() => setModal({ kind: "phase" })}>＋ Thêm giai đoạn</button></div>
      <div className="phase-grid">{phases.map((phase, index) => <article key={phase.id}><span className="phase-number">{String(index + 1).padStart(2, "0")}</span><small>{formatDate(phase.startDate)} — {formatDate(phase.endDate)}</small><h3>{phase.title}</h3><p>{phase.description}</p><div className="phase-track"><i style={{ width: `${phaseProgress[phase.id]}%` }}/></div><footer><b>{phaseProgress[phase.id]}%</b><span><button onClick={() => setModal({ kind: "phase", item: phase })}>Sửa</button><button className="delete" onClick={() => { if (confirm(`Xóa giai đoạn “${phase.title}”?`)) void run(() => deletePhase(phase.id)); }}>Xóa</button></span></footer></article>)}</div>
    </section>

    <section className="planner-columns">
      <article className="planner-panel"><div className="section-heading"><div><p className="eyebrow">LỊCH HỌC</p><h2>Bài học sắp tới</h2></div><button onClick={() => setModal({ kind: "lesson" })}>＋ Thêm</button></div><div className="planner-list">{upcomingLessons.map((lesson) => <LessonRow key={lesson.id} lesson={lesson} onToggle={() => void run(() => setLessonStatus(lesson.id, "completed"))} onEdit={() => setModal({ kind: "lesson", item: lesson })} onDelete={() => { if (confirm(`Xóa bài “${lesson.title}”?`)) void run(() => deleteLesson(lesson.id)); }}/>) }{!upcomingLessons.length && <div className="planner-empty">Chưa có bài học sắp tới.</div>}</div></article>
      <article className="planner-panel"><div className="section-heading"><div><p className="eyebrow">LỊCH THI CỬ</p><h2>Kỳ thi & kiểm tra</h2></div><button onClick={() => setModal({ kind: "exam" })}>＋ Thêm</button></div><div className="exam-list">{exams.map((exam) => <div key={exam.id}><time><b>{exam.date.slice(8)}</b>THÁNG {Number(exam.date.slice(5, 7))}</time><span><small>{exam.type.toUpperCase()} · {exam.time || "Chưa đặt giờ"}</small><b>{exam.title}</b><p>{exam.venue || exam.note || `Mục tiêu Band ${exam.targetBand ?? plan.targetBand}`}</p></span><aside><button onClick={() => setModal({ kind: "exam", item: exam })}>Sửa</button><button className="delete" onClick={() => { if (confirm(`Xóa lịch thi “${exam.title}”?`)) void run(() => deleteExam(exam.id)); }}>Xóa</button></aside></div>)}{!exams.length && <div className="planner-empty">Chưa có kỳ thi hoặc checkpoint.</div>}</div></article>
    </section>

    <PersonalResourceLibrary userId={userId} planId={plan.id} resources={resources} onChanged={() => reload(plan.id)}/>

    {modal?.kind === "plan" && <PlannerModal title={modal.item ? "Chỉnh sửa lộ trình" : "Tạo lộ trình mới"} onClose={() => setModal(null)}><PlanForm initial={modal.item} saving={saving} onSave={(input) => run(async () => { const saved = modal.item ? await updateLearningPlan(userId, modal.item.id, input) : await createLearningPlan(userId, input); setSelectedPlanId(saved.id); }, modal.item?.id)}/></PlannerModal>}
    {modal?.kind === "phase" && <PlannerModal title={modal.item ? "Chỉnh sửa giai đoạn" : "Thêm giai đoạn"} onClose={() => setModal(null)}><PhaseForm initial={modal.item} plan={plan} position={phases.length} saving={saving} onSave={(input) => run(() => savePhase(userId, plan.id, input, modal.item?.id).then(() => undefined))}/></PlannerModal>}
    {modal?.kind === "lesson" && <PlannerModal title={modal.item ? "Chỉnh sửa bài học" : "Thêm bài học"} onClose={() => setModal(null)}><LessonForm initial={modal.item} initialDate={modal.date} phases={phases} saving={saving} onSave={(input) => run(() => saveLesson(userId, plan.id, input, modal.item?.id).then(() => undefined))}/></PlannerModal>}
    {modal?.kind === "exam" && <PlannerModal title={modal.item ? "Chỉnh sửa lịch thi" : "Thêm kỳ thi"} onClose={() => setModal(null)}><ExamForm initial={modal.item} targetBand={plan.targetBand} saving={saving} onSave={(input) => run(() => saveExam(userId, plan.id, input, modal.item?.id).then(() => undefined))}/></PlannerModal>}
  </main>;
}

function LessonRow({ lesson, onToggle, onEdit, onDelete }: { lesson: DailyLesson; onToggle: () => void; onEdit: () => void; onDelete: () => void }) {
  return <div className={`lesson-row ${lesson.status}`}><button className="lesson-check" onClick={onToggle}>{lesson.status === "completed" ? "✓" : "○"}</button><time>{formatDate(lesson.date)}{lesson.studyTime && <small>{lesson.studyTime}</small>}</time><span><small>{lesson.skill} · {lesson.duration} phút · {lesson.priority}</small><b>{lesson.title}</b><p>{lesson.description || "Chưa có ghi chú."}</p></span><aside><button onClick={onEdit}>Sửa</button><button className="delete" onClick={onDelete}>Xóa</button></aside></div>;
}

function PlannerModal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="modal-card"><header><div><small>PERSONAL ROADMAP</small><h2>{title}</h2></div><button onClick={onClose}>×</button></header>{children}</div></div>;
}

function PlanForm({ initial, saving, onSave }: { initial?: LearningPlan; saving: boolean; onSave: (input: Omit<LearningPlan, "id" | "status"> & { status?: LearningPlan["status"] }) => void }) {
  const [days, setDays] = useState<number[]>(initial?.studyDays || [1, 2, 3, 4, 5]);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); onSave({ title: String(form.get("title")).trim(), description: String(form.get("description")).trim(), startDate: String(form.get("startDate")), endDate: String(form.get("endDate")), examDate: String(form.get("examDate")), currentBand: Number(form.get("currentBand")), targetBand: Number(form.get("targetBand")), weeklyMinutes: Number(form.get("weeklyMinutes")), studyDays: days, status: String(form.get("status") || "active") as LearningPlan["status"] }); }
  return <form className="planner-form" onSubmit={submit}><div className="form-grid"><label className="wide">Tên lộ trình<input name="title" required maxLength={120} defaultValue={initial?.title || "IELTS Personal Roadmap"}/></label><label className="wide">Mô tả<textarea name="description" rows={3} defaultValue={initial?.description}/></label><label>Ngày bắt đầu<input name="startDate" type="date" required defaultValue={initial?.startDate || todayISO()}/></label><label>Ngày kết thúc<input name="endDate" type="date" required defaultValue={initial?.endDate || futureISO(168)}/></label><label>Ngày thi dự kiến<input name="examDate" type="date" defaultValue={initial?.examDate}/></label><label>Phút học mỗi tuần<input name="weeklyMinutes" type="number" min={30} max={10080} required defaultValue={initial?.weeklyMinutes || 300}/></label><label>Band hiện tại<select name="currentBand" defaultValue={initial?.currentBand || 5}>{Array.from({ length: 19 }, (_, index) => index / 2).map((band) => <option key={band}>{band}</option>)}</select></label><label>Band mục tiêu<select name="targetBand" defaultValue={initial?.targetBand || 6.5}>{Array.from({ length: 19 }, (_, index) => index / 2).map((band) => <option key={band}>{band}</option>)}</select></label>{initial && <label>Trạng thái<select name="status" defaultValue={initial.status}><option value="active">Đang học</option><option value="draft">Bản nháp</option><option value="completed">Hoàn thành</option><option value="archived">Lưu trữ</option></select></label>}<label className="wide">Ngày học trong tuần<div className="day-picker">{DAY_LABELS.map((label, day) => <button type="button" key={label} className={days.includes(day) ? "active" : ""} onClick={() => setDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort())}>{label}</button>)}</div></label></div><button className="primary submit" disabled={saving || !days.length}>{saving ? "Đang lưu…" : initial ? "Lưu thay đổi" : "Tạo lộ trình"}</button></form>;
}

function PhaseForm({ initial, plan, position, saving, onSave }: { initial?: PlanPhase; plan: LearningPlan; position: number; saving: boolean; onSave: (input: Omit<PlanPhase, "id" | "planId">) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); onSave({ title: String(form.get("title")).trim(), description: String(form.get("description")).trim(), startDate: String(form.get("startDate")), endDate: String(form.get("endDate")), position: initial?.position ?? position, status: String(form.get("status")) as PlanPhase["status"] }); }
  return <form className="planner-form" onSubmit={submit}><div className="form-grid"><label className="wide">Tên giai đoạn<input name="title" required defaultValue={initial?.title}/></label><label className="wide">Mục tiêu giai đoạn<textarea name="description" rows={3} defaultValue={initial?.description}/></label><label>Bắt đầu<input name="startDate" type="date" required defaultValue={initial?.startDate || plan.startDate}/></label><label>Kết thúc<input name="endDate" type="date" required defaultValue={initial?.endDate || plan.endDate}/></label><label>Trạng thái<select name="status" defaultValue={initial?.status || "planned"}><option value="planned">Sắp tới</option><option value="active">Đang học</option><option value="completed">Hoàn thành</option></select></label></div><button className="primary submit" disabled={saving}>{saving ? "Đang lưu…" : "Lưu giai đoạn"}</button></form>;
}

function LessonForm({ initial, initialDate, phases, saving, onSave }: { initial?: DailyLesson; initialDate?: string; phases: PlanPhase[]; saving: boolean; onSave: (input: Omit<DailyLesson, "id" | "planId">) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); onSave({ phaseId: String(form.get("phaseId")), date: String(form.get("date")), studyTime: String(form.get("studyTime")), title: String(form.get("title")).trim(), description: String(form.get("description")).trim(), skill: String(form.get("skill")), duration: Number(form.get("duration")), priority: String(form.get("priority")) as DailyLesson["priority"], status: String(form.get("status")) as DailyLesson["status"], resourceUrl: String(form.get("resourceUrl")).trim() }); }
  return <form className="planner-form" onSubmit={submit}><div className="form-grid"><label>Ngày học<input name="date" type="date" required defaultValue={initial?.date || initialDate || todayISO()}/></label><label>Giờ học<input name="studyTime" type="time" defaultValue={initial?.studyTime}/><small>Để trống sẽ dùng giờ nhắc mặc định.</small></label><label>Kỹ năng<select name="skill" defaultValue={initial?.skill || "Listening"}>{SKILLS.map((skill) => <option key={skill}>{skill}</option>)}</select></label><label className="wide">Tên bài học<input name="title" required maxLength={160} defaultValue={initial?.title}/></label><label>Giai đoạn<select name="phaseId" defaultValue={initial?.phaseId || ""}><option value="">Không gắn giai đoạn</option>{phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.title}</option>)}</select></label><label>Thời lượng<input name="duration" type="number" min={5} max={1440} defaultValue={initial?.duration || 30}/></label><label>Ưu tiên<select name="priority" defaultValue={initial?.priority || "medium"}><option value="low">Thấp</option><option value="medium">Vừa</option><option value="high">Cao</option></select></label><label>Trạng thái<select name="status" defaultValue={initial?.status || "todo"}><option value="todo">Cần làm</option><option value="in_progress">Đang học</option><option value="completed">Hoàn thành</option><option value="skipped">Bỏ qua</option></select></label><label className="wide">Link tài liệu<input name="resourceUrl" type="url" defaultValue={initial?.resourceUrl}/></label><label className="wide">Nội dung / ghi chú<textarea name="description" rows={4} defaultValue={initial?.description}/></label></div><button className="primary submit" disabled={saving}>{saving ? "Đang lưu…" : "Lưu bài học"}</button></form>;
}

function ExamForm({ initial, targetBand, saving, onSave }: { initial?: ExamEvent; targetBand: number; saving: boolean; onSave: (input: Omit<ExamEvent, "id" | "planId">) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); onSave({ title: String(form.get("title")).trim(), type: String(form.get("type")) as ExamEvent["type"], date: String(form.get("date")), time: String(form.get("time")), venue: String(form.get("venue")).trim(), targetBand: Number(form.get("targetBand")), note: String(form.get("note")).trim(), status: String(form.get("status")) as ExamEvent["status"] }); }
  return <form className="planner-form" onSubmit={submit}><div className="form-grid"><label className="wide">Tên kỳ thi<input name="title" required defaultValue={initial?.title || "IELTS Mock Test"}/></label><label>Loại<select name="type" defaultValue={initial?.type || "mock"}><option value="official">Thi chính thức</option><option value="mock">Mock test</option><option value="checkpoint">Checkpoint</option></select></label><label>Ngày<input name="date" type="date" required defaultValue={initial?.date || futureISO(30)}/></label><label>Giờ<input name="time" type="time" defaultValue={initial?.time}/></label><label>Band mục tiêu<input name="targetBand" type="number" min={0} max={9} step={0.5} defaultValue={initial?.targetBand ?? targetBand}/></label><label className="wide">Địa điểm<input name="venue" defaultValue={initial?.venue}/></label><label>Trạng thái<select name="status" defaultValue={initial?.status || "planned"}><option value="planned">Đã lên lịch</option><option value="completed">Hoàn thành</option><option value="cancelled">Đã hủy</option></select></label><label className="wide">Ghi chú<textarea name="note" rows={3} defaultValue={initial?.note}/></label></div><button className="primary submit" disabled={saving}>{saving ? "Đang lưu…" : "Lưu lịch thi"}</button></form>;
}
