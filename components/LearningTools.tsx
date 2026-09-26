"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  generateAutomaticSchedule,
  loadLearningInsight,
  requestAiRecommendations,
  saveDiagnosticAssessment,
  saveTestResult,
  uploadLearningMaterial,
  type DiagnosticAssessment,
  type LearningInsight,
  type LearningRecommendation,
  type TestResultInput,
} from "@/lib/supabase/learning-tools";
import { saveLesson, type LearningPlan, type PlanPhase } from "@/lib/supabase/planner";

type ToolModal = "diagnostic" | "schedule" | "test" | "upload" | null;
const CORE_SKILLS = ["Listening", "Reading", "Writing", "Speaking", "Grammar / Vocab"];

function todayISO() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function nextStudyDate(plan: LearningPlan) {
  const date = new Date();
  for (let index = 0; index < 8; index += 1) {
    if (plan.studyDays.includes(date.getDay())) return todayFrom(date);
    date.setDate(date.getDate() + 1);
  }
  return todayISO();
}

function todayFrom(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function LearningTools({
  userId,
  plan,
  phases,
  onChanged,
}: {
  userId: string;
  plan: LearningPlan;
  phases: PlanPhase[];
  onChanged: () => Promise<void>;
}) {
  const [insight, setInsight] = useState<LearningInsight | null>(null);
  const [recommendations, setRecommendations] = useState<LearningRecommendation[]>([]);
  const [modal, setModal] = useState<ToolModal>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      const data = await loadLearningInsight(plan.id);
      setInsight(data);
      setRecommendations(data.recommendations);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải công cụ học tập.");
    }
  }, [plan.id]);

  useEffect(() => { void reload(); }, [reload]);

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      setModal(null);
      setMessage(success);
      await Promise.all([reload(), onChanged()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể hoàn thành thao tác.");
    } finally {
      setBusy(false);
    }
  }

  async function askCoach() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const items = await requestAiRecommendations(plan.id);
      setRecommendations(items);
      setMessage("AI Coach đã phân tích dữ liệu học mới nhất.");
    } catch (err) {
      setError(`${err instanceof Error ? err.message : "AI Coach chưa sẵn sàng."} Đang giữ đề xuất phân tích cục bộ.`);
    } finally {
      setBusy(false);
    }
  }

  async function addRecommendation(item: LearningRecommendation) {
    await run(async () => {
      const date = nextStudyDate(plan);
      const phase = phases.find((entry) => date >= entry.startDate && date <= entry.endDate);
      await saveLesson(userId, plan.id, {
        phaseId: phase?.id ?? "",
        date,
        title: item.title,
        description: item.reason,
        skill: CORE_SKILLS.includes(item.skill) ? item.skill : "Review",
        duration: item.duration,
        priority: item.priority,
        status: "todo",
        resourceUrl: "",
      });
    }, "Đã thêm đề xuất vào lịch học.");
  }

  return <>
    <section className="learning-toolkit">
      <div className="section-heading"><div><p className="eyebrow">LEARNING CONTROL CENTER</p><h2>Công cụ học tập thông minh</h2></div></div>
      {(message || error) && <div className={error ? "tool-message error" : "tool-message"}>{error || message}</div>}
      <div className="tool-grid">
        <article><span>01</span><small>ĐÁNH GIÁ ĐẦU VÀO</small><b>{insight?.assessment ? `Band ${insight.assessment.estimatedBand.toFixed(1)}` : "Chưa đánh giá"}</b><p>Xác định điểm xuất phát của bốn kỹ năng.</p><button onClick={() => setModal("diagnostic")}>{insight?.assessment ? "Đánh giá lại" : "Bắt đầu"}</button></article>
        <article><span>02</span><small>LỊCH HỌC TỰ ĐỘNG</small><b>{plan.weeklyMinutes} phút/tuần</b><p>Tạo lịch theo ngày rảnh, điểm yếu và sổ lỗi.</p><button onClick={() => setModal("schedule")}>Sinh lịch học</button></article>
        <article><span>03</span><small>KẾT QUẢ LUYỆN ĐỀ</small><b>{insight?.latestOverall ? `Band ${insight.latestOverall.toFixed(1)}` : `${insight?.testCount ?? 0} kết quả`}</b><p>Lưu điểm và tự tính band Listening, Reading.</p><button onClick={() => setModal("test")}>Nhập kết quả</button></article>
        <article><span>04</span><small>SUPABASE STORAGE</small><b>Tài liệu riêng</b><p>Tải PDF, Word, audio, video tối đa 50 MB.</p><button onClick={() => setModal("upload")}>Tải tài liệu</button></article>
      </div>
    </section>

    <section className="coach-panel">
      <div className="section-heading"><div><p className="eyebrow">AI LEARNING COACH</p><h2>Đề xuất từ dữ liệu học thật</h2><p>{insight?.openBugCount ?? 0} lỗi mở · phân tích điểm đầu vào và lịch sử luyện đề</p></div><button className="primary" disabled={busy} onClick={() => void askCoach()}>{busy ? "Đang phân tích…" : "✦ Phân tích bằng AI"}</button></div>
      <div className="recommendation-grid">{recommendations.map((item, index) => <article key={`${item.skill}-${index}`}><small>{item.priority.toUpperCase()} · {item.skill}</small><h3>{item.title}</h3><p>{item.reason}</p><footer><span>{item.duration} phút</span><button onClick={() => void addRecommendation(item)}>＋ Thêm vào lịch</button></footer></article>)}{!recommendations.length && <div className="planner-empty">Hãy hoàn thành đánh giá đầu vào hoặc thêm lỗi để nhận đề xuất.</div>}</div>
    </section>

    {modal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setModal(null); }}><div className="modal-card"><header><div><small>LEARNING TOOLS</small><h2>{modal === "diagnostic" ? "Đánh giá đầu vào" : modal === "schedule" ? "Sinh lịch học tự động" : modal === "test" ? "Nhập kết quả luyện đề" : "Tải tài liệu lên Storage"}</h2></div><button disabled={busy} onClick={() => setModal(null)}>×</button></header>
      {modal === "diagnostic" && <DiagnosticForm initial={insight?.assessment ?? undefined} busy={busy} onSave={(input) => run(() => saveDiagnosticAssessment(userId, plan.id, input).then(() => undefined), "Đã cập nhật band đầu vào và lộ trình.")}/>} 
      {modal === "schedule" && <ScheduleForm busy={busy} onSave={(weeks) => run(async () => { const count = await generateAutomaticSchedule(userId, plan, phases, weeks); setMessage(`Đã tạo hoặc cập nhật ${count} bài học.`); }, "Đã tạo lịch học tự động.")}/>} 
      {modal === "test" && <TestForm busy={busy} onSave={(input) => run(() => saveTestResult(userId, plan.id, input), "Đã lưu kết quả luyện đề.")}/>} 
      {modal === "upload" && <UploadForm busy={busy} onSave={(file, description) => run(() => uploadLearningMaterial(userId, plan.id, file, description).then(() => undefined), "Đã tải tài liệu lên Supabase Storage.")}/>} 
    </div></div>}
  </>;
}

function DiagnosticForm({ initial, busy, onSave }: { initial?: DiagnosticAssessment; busy: boolean; onSave: (input: Omit<DiagnosticAssessment, "id" | "estimatedBand" | "completedAt">) => void }) {
  const [difficult, setDifficult] = useState<string[]>(initial?.difficultSkills ?? []);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({
      listeningRaw: Number(form.get("listeningRaw")), readingRaw: Number(form.get("readingRaw")),
      writingBand: Number(form.get("writingBand")), speakingBand: Number(form.get("speakingBand")),
      studyExperience: String(form.get("experience")) as DiagnosticAssessment["studyExperience"],
      difficultSkills: difficult, notes: String(form.get("notes")).trim(),
    });
  }
  return <form className="planner-form" onSubmit={submit}><p className="form-note">Listening và Reading nhập số câu đúng trên 40. Writing và Speaking nhập band tự đánh giá gần nhất.</p><div className="form-grid"><label>Listening /40<input name="listeningRaw" type="number" min="0" max="40" required defaultValue={initial?.listeningRaw ?? 20}/></label><label>Reading /40<input name="readingRaw" type="number" min="0" max="40" required defaultValue={initial?.readingRaw ?? 20}/></label><label>Writing band<input name="writingBand" type="number" min="0" max="9" step="0.5" required defaultValue={initial?.writingBand ?? 5}/></label><label>Speaking band<input name="speakingBand" type="number" min="0" max="9" step="0.5" required defaultValue={initial?.speakingBand ?? 5}/></label><label>Kinh nghiệm<select name="experience" defaultValue={initial?.studyExperience ?? "beginner"}><option value="beginner">Mới bắt đầu</option><option value="returning">Học lại sau gián đoạn</option><option value="experienced">Đã luyện IELTS</option></select></label><label className="wide">Kỹ năng cảm thấy khó<div className="skill-picker">{CORE_SKILLS.map((skill) => <button type="button" key={skill} className={difficult.includes(skill) ? "active" : ""} onClick={() => setDifficult((current) => current.includes(skill) ? current.filter((item) => item !== skill) : [...current, skill])}>{skill}</button>)}</div></label><label className="wide">Ghi chú<textarea name="notes" rows={3} defaultValue={initial?.notes}/></label></div><button className="primary submit" disabled={busy}>{busy ? "Đang tính band…" : "Lưu kết quả đánh giá"}</button></form>;
}

function ScheduleForm({ busy, onSave }: { busy: boolean; onSave: (weeks: number) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); onSave(Number(new FormData(event.currentTarget).get("weeks"))); }
  return <form className="planner-form" onSubmit={submit}><p className="form-note">Lịch được phân bổ theo ngày học đã chọn. Chạy lại sẽ cập nhật bài tự động cùng ngày, không tạo trùng.</p><div className="form-grid"><label className="wide">Số tuần muốn tạo<select name="weeks" defaultValue="4"><option value="2">2 tuần</option><option value="4">4 tuần</option><option value="8">8 tuần</option><option value="12">12 tuần</option></select></label></div><button className="primary submit" disabled={busy}>{busy ? "Đang tạo lịch…" : "Tạo lịch học"}</button></form>;
}

function optionalNumber(form: FormData, key: string) {
  const value = String(form.get(key) ?? "");
  return value === "" ? null : Number(value);
}

function TestForm({ busy, onSave }: { busy: boolean; onSave: (input: TestResultInput) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); onSave({ label: String(form.get("label")).trim(), type: String(form.get("type")) as TestResultInput["type"], date: String(form.get("date")), listeningRaw: optionalNumber(form, "listeningRaw"), readingRaw: optionalNumber(form, "readingRaw"), writingBand: optionalNumber(form, "writingBand"), speakingBand: optionalNumber(form, "speakingBand"), conclusion: String(form.get("conclusion")).trim() }); }
  return <form className="planner-form" onSubmit={submit}><div className="form-grid"><label className="wide">Tên bài thi<input name="label" required defaultValue="IELTS Mock Test"/></label><label>Loại bài<select name="type" defaultValue="full"><option value="full">Full test</option><option value="listening">Listening</option><option value="reading">Reading</option><option value="writing">Writing</option><option value="speaking">Speaking</option></select></label><label>Ngày làm bài<input name="date" type="date" required defaultValue={todayISO()}/></label><label>Listening /40<input name="listeningRaw" type="number" min="0" max="40"/></label><label>Reading /40<input name="readingRaw" type="number" min="0" max="40"/></label><label>Writing band<input name="writingBand" type="number" min="0" max="9" step="0.5"/></label><label>Speaking band<input name="speakingBand" type="number" min="0" max="9" step="0.5"/></label><label className="wide">Nhận xét<textarea name="conclusion" rows={3}/></label></div><button className="primary submit" disabled={busy}>{busy ? "Đang lưu…" : "Lưu kết quả"}</button></form>;
}

function UploadForm({ busy, onSave }: { busy: boolean; onSave: (file: File, description: string) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const file = form.get("file"); if (file instanceof File && file.size) onSave(file, String(form.get("description")).trim()); }
  return <form className="planner-form" onSubmit={submit}><p className="form-note">Tệp được lưu trong bucket riêng tư và chỉ tài khoản của bạn có thể mở.</p><div className="form-grid"><label className="wide">Chọn tệp<input name="file" type="file" required accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.mp3,.m4a,.mp4,.jpg,.jpeg,.png,.webp"/></label><label className="wide">Mô tả<textarea name="description" rows={3}/></label></div><button className="primary submit" disabled={busy}>{busy ? "Đang tải lên…" : "Tải lên Supabase Storage"}</button></form>;
}
