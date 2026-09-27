"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { SprintQualityPanel } from "@/components/SprintQuality";
import { PracticeFields, type RecordingValue } from "@/components/PracticeFields";
import { parseSprintFile, SPRINT_IMPORT_TEMPLATE, type SprintImportDraft } from "@/lib/sprint-import";
import {
  assignSourceToSession,
  completeSprintSession,
  createBugFromAttempt,
  createWeekSprint,
  deleteSourceMapping,
  deleteWeekSprint,
  deleteStudyTask,
  loadSprintWorkspace,
  logTaskStarted,
  saveSourceMapping,
  saveStudyTask,
  setSprintStatus,
  startSprintSession,
  submitTaskAttempt,
  updateSessionPlanningNotes,
  updateWeekSprint,
  uploadSpeakingRecording,
  type LearningSourceMapping,
  type SprintSession,
  type SprintWorkspace,
  type StudyTask,
  type TaskAttempt,
  type WeekSprintInput,
  type WeekSprint,
} from "@/lib/supabase/sprints";

type Modal = { kind: "week"; item?: WeekSprint } | { kind: "source"; item?: LearningSourceMapping } | { kind: "tasks"; session: SprintSession } | { kind: "session-note"; session: SprintSession } | null;
type ImportReport = { title: string; sessions: number; tasks: number; sources: number; warnings: string[] };
const SKILLS = ["Listening", "Reading", "Writing", "Speaking", "Grammar / Vocab"];

function localISO(date = new Date()) { return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function mondayISO() { const date = new Date(); const day = date.getDay(); date.setDate(date.getDate() - (day === 0 ? 6 : day - 1)); return localISO(date); }
function formatDate(value: string) { return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" }).format(new Date(`${value}T12:00:00`)); }

export function WeeklySprint({ userId }: { userId: string }) {
  const [workspace, setWorkspace] = useState<SprintWorkspace | null>(null);
  const [selectedSprintId, setSelectedSprintId] = useState<string>();
  const [modal, setModal] = useState<Modal>(null);
  const [runner, setRunner] = useState<SprintSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [importReport, setImportReport] = useState<ImportReport | null>(null);

  const reload = useCallback(async (sprintId?: string) => {
    setLoading(true); setError("");
    try { const data = await loadSprintWorkspace(sprintId); setWorkspace(data); setSelectedSprintId(data.sprint?.id); }
    catch (err) { setError(err instanceof Error ? err.message : "Không thể tải Sprint học tập."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  async function run(action: () => Promise<void | string>, sprintId?: string) {
    setSaving(true); setError("");
    try { const nextSprintId = await action(); setModal(null); await reload(typeof nextSprintId === "string" ? nextSprintId : sprintId ?? selectedSprintId); }
    catch (err) { setError(err instanceof Error ? err.message : "Không thể lưu thay đổi."); }
    finally { setSaving(false); }
  }

  if (loading && !workspace) return <main className="sprint-page"><div className="planner-loading">Đang tải Weekly Sprint…</div></main>;
  if (!workspace) return <main className="sprint-page"><div className="planner-loading"><p>{error}</p><button className="primary" onClick={() => void reload()}>Thử lại</button></div></main>;
  if (!workspace.plan) return <main className="sprint-page"><div className="planner-onboarding"><section><p className="eyebrow">WEEKLY SPRINT</p><h1>Hãy tạo lộ trình trước</h1><p>Sprint cần thuộc một lộ trình đang hoạt động.</p></section></div></main>;

  const sprint = workspace.sprint;
  const completed = workspace.sessions.filter((item) => item.workflowStatus === "DONE").length;
  const total = workspace.sessions.length;
  const scoreResults = workspace.results.filter((item) => item.score !== null);
  const average = scoreResults.length ? scoreResults.reduce((sum, item) => sum + (item.score ?? 0), 0) / scoreResults.length : null;

  if (!sprint) return <main className="sprint-page"><section className="sprint-empty"><p className="eyebrow">SPRINT-BASED LEARNING</p><h1>Bắt đầu tuần học đầu tiên</h1><p>Website sẽ tạo các session T2–CN từ lịch rảnh trong lộ trình. Sau đó bạn map tài liệu và thêm bài tập cho từng ngày.</p><button className="primary" onClick={() => setModal({ kind: "week" })}>Tạo Weekly Sprint</button></section>{modal?.kind === "week" && <SprintModal title="Tạo Weekly Sprint" onClose={() => setModal(null)}><WeekForm saving={saving} defaultTitle="Week 1" studyDays={workspace.plan.studyDays} onSave={(input, report) => run(async () => { const created = await createWeekSprint(userId, workspace.plan!, workspace.phases, input); setSelectedSprintId(created.id); if (report) setImportReport(report); return created.id; }, selectedSprintId)}/></SprintModal>}</main>;

  return <main className="sprint-page">
    <section className="sprint-head"><div><p className="eyebrow">WEEK {sprint.weekNumber} · {formatDate(sprint.startDate)} → {formatDate(sprint.endDate)}</p><h1>{sprint.title}</h1><p>{sprint.objective || "Chưa đặt mục tiêu cho tuần."}</p></div><aside><select value={selectedSprintId} onChange={(event) => { setSelectedSprintId(event.target.value); void reload(event.target.value); }}>{workspace.sprints.map((item) => <option key={item.id} value={item.id}>Week {item.weekNumber} · {item.title}</option>)}</select><b className={`sprint-status ${sprint.status.toLowerCase()}`}>{sprint.status.replace("_", " ")}</b><button onClick={() => setModal({ kind: "week" })}>＋ Tuần mới</button><button onClick={() => setModal({ kind: "week", item: sprint })}>Sửa tuần</button><button className="delete" disabled={saving} onClick={() => { if (confirm(`Xóa “${sprint.title}” cùng toàn bộ session, task và kết quả trong tuần?`)) void run(async () => { await deleteWeekSprint(sprint.id); setSelectedSprintId(undefined); }, undefined); }}>Xóa tuần</button>{sprint.status === "REVIEW" && <button className="primary" onClick={() => void run(() => setSprintStatus(sprint.id, "COMPLETED"))}>Hoàn tất tuần</button>}</aside></section>
    {error && <div className="status-banner"><span>{error}</span><button onClick={() => setError("")}>×</button></div>}

    <section className="sprint-summary"><article><small>SESSION HOÀN THÀNH</small><b>{completed}/{total}</b><div className="phase-track"><i style={{ width: `${total ? completed / total * 100 : 0}%` }}/></div></article><article><small>ĐIỂM TRUNG BÌNH</small><b>{average === null ? "—" : `${average.toFixed(0)}%`}</b><span>Từ session đã chấm</span></article><article><small>LỖI MỚI</small><b>{workspace.results.reduce((sum, item) => sum + item.newBugs, 0)}</b><span>Tự động từ attempt sai</span></article><article><small>THỜI GIAN</small><b>{workspace.results.reduce((sum, item) => sum + item.duration, 0)}</b><span>phút đã học</span></article></section>

    <section className="kpi-strip"><div><p className="eyebrow">WEEKLY TARGETS</p><h2>KPI mục tiêu</h2></div>{SKILLS.map((skill) => <article key={skill}><span>{skill}</span><b>{sprint.skillTargets[skill] ? `${sprint.skillTargets[skill]}%` : "—"}</b></article>)}</section>

    <section className="sprint-layout"><div className="sprint-sessions"><div className="section-heading"><div><p className="eyebrow">DAILY STUDY SESSIONS</p><h2>Kế hoạch T2–CN</h2></div></div>{workspace.sessions.map((session) => { const source = workspace.sources.find((item) => item.id === session.sourceMappingId); const taskCount = workspace.tasks.filter((item) => item.lessonId === session.id).length; const result = workspace.results.find((item) => item.lessonId === session.id); return <article className={`sprint-session ${session.workflowStatus.toLowerCase()}`} key={session.id}><time><b>{new Intl.DateTimeFormat("vi-VN", { weekday: "short" }).format(new Date(`${session.date}T12:00:00`))}</b>{formatDate(session.date)}</time><div className="session-copy"><small>{session.skill} · {session.duration} PHÚT · TARGET {session.targetScore ?? "—"}%</small><h3>{session.title}</h3><p>{session.objective}</p>{session.planningNotes && <blockquote className="session-planning-note"><b>Ghi chú chuẩn bị:</b> {session.planningNotes}</blockquote>}{source ? <div className="source-chip"><b>{source.documentTitle}</b><span>{[source.unit, source.section, source.pageFrom ? `Trang ${source.pageFrom}${source.pageTo ? `–${source.pageTo}` : ""}` : "", source.audioTrack].filter(Boolean).join(" · ")}</span>{source.sourceUrl && <a href={source.sourceUrl} target="_blank" rel="noreferrer">Open Material ↗</a>}</div> : <em>Chưa map tài liệu</em>}</div><aside><span className="workflow-badge">{session.workflowStatus}</span>{result && <b>{result.score === null ? "DONE" : `${result.score.toFixed(0)}%`}</b>}<select value={session.sourceMappingId} onChange={(event) => void run(() => assignSourceToSession(session.id, event.target.value))}><option value="">Chọn tài liệu</option>{workspace.sources.map((item) => <option key={item.id} value={item.id}>{item.documentTitle} · {item.unit}</option>)}</select><button onClick={() => setModal({ kind: "session-note", session })}>{session.planningNotes ? "Sửa ghi chú" : "＋ Ghi chú"}</button><button onClick={() => setModal({ kind: "tasks", session })}>Tasks ({taskCount})</button><button className="primary" disabled={!taskCount || session.workflowStatus === "DONE"} onClick={() => setRunner(session)}>{session.workflowStatus === "TODO" ? "Start Session" : session.workflowStatus === "DONE" ? "Completed" : "Continue"}</button></aside></article>; })}{!workspace.sessions.length && <div className="planner-empty">Sprint chưa có session.</div>}</div>

      <aside className="source-library"><div className="section-heading"><div><p className="eyebrow">SOURCE MAPPING</p><h2>Tài liệu</h2></div><button onClick={() => setModal({ kind: "source" })}>＋ Thêm</button></div>{workspace.sources.map((source) => <article key={source.id}><small>{source.documentTitle}</small><b>{[source.unit, source.section].filter(Boolean).join(" · ") || "Tài liệu học"}</b><p>{source.pageFrom ? `Trang ${source.pageFrom}${source.pageTo ? `–${source.pageTo}` : ""}` : "Chưa đặt trang"}{source.audioTrack ? ` · ${source.audioTrack}` : ""}</p>{source.sourceUrl && <a href={source.sourceUrl} target="_blank" rel="noreferrer">Mở tài liệu ↗</a>}<footer><button onClick={() => setModal({ kind: "source", item: source })}>Sửa</button><button className="delete" disabled={saving} onClick={() => { if (confirm(`Xóa Source Mapping “${source.documentTitle}”? Các session đang dùng sẽ trở về trạng thái chưa map tài liệu.`)) void run(() => deleteSourceMapping(source.id)); }}>Xóa</button></footer></article>)}{!workspace.sources.length && <div className="planner-empty">Thêm sách, unit, trang và audio track để map vào session.</div>}</aside>
    </section>

    <SprintQualityPanel userId={userId} planId={workspace.plan.id} sprint={sprint} sessions={workspace.sessions} onSprintGenerated={async (sprintId) => { setSelectedSprintId(sprintId); await reload(sprintId); }}/>

    {modal?.kind === "week" && <SprintModal title={modal.item ? "Sửa Weekly Sprint" : "Tạo tuần học kế tiếp"} onClose={() => setModal(null)}><WeekForm saving={saving} initial={modal.item} defaultTitle={`Week ${(workspace.sprints[0]?.weekNumber ?? 0) + 1}`} studyDays={workspace.plan.studyDays} onSave={(input, report) => run(async () => { if (modal.item) { await updateWeekSprint(modal.item.id, input); return modal.item.id; } const created = await createWeekSprint(userId, workspace.plan!, workspace.phases, input); setSelectedSprintId(created.id); if (report) setImportReport(report); return created.id; }, selectedSprintId)}/></SprintModal>}
    {modal?.kind === "source" && <SprintModal title={modal.item ? "Sửa Source Mapping" : "Thêm Source Mapping"} onClose={() => setModal(null)}><SourceForm saving={saving} materials={workspace.materials} initial={modal.item} onSave={(input) => run(() => saveSourceMapping(userId, workspace.plan!.id, input, modal.item?.id).then(() => undefined))}/></SprintModal>}
    {modal?.kind === "tasks" && <SprintModal title={`Tasks · ${modal.session.title}`} wide onClose={() => setModal(null)}><TaskManager userId={userId} session={modal.session} tasks={workspace.tasks.filter((item) => item.lessonId === modal.session.id)} saving={saving} onChange={(action) => run(action)}/></SprintModal>}
    {modal?.kind === "session-note" && <SprintModal title={`Ghi chú · ${modal.session.title}`} onClose={() => setModal(null)}><SessionPlanningNoteForm session={modal.session} saving={saving} onSave={(notes) => run(() => updateSessionPlanningNotes(modal.session.id, notes))}/></SprintModal>}
    {runner && <SessionRunner userId={userId} planId={workspace.plan.id} sprintId={sprint.id} session={runner} source={workspace.sources.find((item) => item.id === runner.sourceMappingId)} tasks={workspace.tasks.filter((item) => item.lessonId === runner.id)} attempts={workspace.attempts} onClose={() => setRunner(null)} onDone={async () => { setRunner(null); await reload(sprint.id); }}/>} 
    {importReport && <SprintModal title="Kết quả nhập Weekly Sprint" onClose={() => setImportReport(null)}><section className="planner-form"><div className="sprint-summary"><article><small>SESSION</small><b>{importReport.sessions}</b></article><article><small>TASK</small><b>{importReport.tasks}</b></article><article><small>SOURCE MAPPING</small><b>{importReport.sources}</b></article></div><p><b>{importReport.title}</b> đã được tạo. Bạn có thể sửa Source Mapping trong thư viện bên phải và mở “Tasks” tại từng session để xử lý nội dung chưa đúng.</p>{importReport.warnings.length > 0 && <details open><summary>{importReport.warnings.length} cảnh báo cần kiểm tra</summary>{importReport.warnings.map((warning) => <p key={warning}>{warning}</p>)}</details>}<button className="primary submit" onClick={() => setImportReport(null)}>Đã hiểu</button></section></SprintModal>}
  </main>;
}

function SprintModal({ title, children, onClose, wide = false }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) { return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className={`modal-card ${wide ? "hub-modal-wide" : ""}`}><header><div><small>WEEKLY SPRINT MVP</small><h2>{title}</h2></div><button onClick={onClose}>×</button></header>{children}</div></div>; }

function WeekForm({ saving, defaultTitle, initial, studyDays, onSave }: { saving: boolean; defaultTitle: string; initial?: WeekSprint; studyDays: number[]; onSave: (input: WeekSprintInput, report?: ImportReport) => void }) {
  const [draft, setDraft] = useState<Omit<SprintImportDraft, "warnings"> & { warnings: string[] }>({
    title: initial?.title ?? defaultTitle,
    startDate: initial?.startDate ?? mondayISO(),
    objective: initial?.objective ?? "",
    targets: initial?.skillTargets ?? Object.fromEntries(SKILLS.map((skill) => [skill, 65])),
    sessions: [],
    warnings: [],
  });
  const [fileName, setFileName] = useState("");
  const [importError, setImportError] = useState("");
  const [readingFile, setReadingFile] = useState(false);
  const [planningNotes, setPlanningNotes] = useState<Record<string, string>>({});
  const generatedStudyDates = useMemo(() => Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(`${draft.startDate}T12:00:00`);
    date.setDate(date.getDate() + offset);
    return { date: localISO(date), day: date.getDay(), label: new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" }).format(date) };
  }).filter((item) => studyDays.includes(item.day)), [draft.startDate, studyDays]);

  async function importFile(file?: File) {
    if (!file) return;
    setReadingFile(true); setImportError("");
    try {
      const parsed = parseSprintFile(file.name, await file.text());
      setDraft(parsed);
      setFileName(file.name);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Không thể đọc file Sprint.");
      setFileName("");
    } finally {
      setReadingFile(false);
    }
  }

  function downloadTemplate() {
    const blob = new Blob([SPRINT_IMPORT_TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "weekly-sprint-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const end = new Date(`${draft.startDate}T12:00:00`);
    end.setDate(end.getDate() + 6);
    const endDate = localISO(end);
    const outside = draft.sessions.find((session) => session.date < draft.startDate || session.date > endDate);
    if (outside) {
      setImportError(`Session “${outside.title}” nằm ngoài tuần ${draft.startDate}–${endDate}. Hãy sửa ngày bắt đầu hoặc nhập lại file.`);
      return;
    }
    const input = { title: draft.title.trim(), startDate: draft.startDate, objective: draft.objective.trim(), targets: draft.targets, sessions: initial ? undefined : draft.sessions, planningNotes: initial ? undefined : planningNotes };
    const report = draft.sessions.length ? { title: input.title, sessions: draft.sessions.length, tasks: draft.sessions.reduce((sum, session) => sum + session.tasks.length, 0), sources: draft.sessions.filter((session) => Boolean(session.sourceTitle || session.sourceUrl)).length, warnings: draft.warnings } : undefined;
    onSave(input, report);
  }

  return <form className="planner-form" onSubmit={submit}>
    {!initial && <section className="sprint-file-import">
      <div><small>QUICK SPRINT IMPORT</small><b>Nhập kế hoạch từ file</b><p>Hỗ trợ `.csv`, `.txt`, `.text`, `.md` · tối đa 1 MB.</p></div>
      <label className="sprint-file-picker"><input type="file" accept=".csv,.txt,.text,.md,text/csv,text/plain,text/markdown" onChange={(event) => void importFile(event.target.files?.[0])}/><span>{readingFile ? "Đang đọc file…" : "Chọn file"}</span></label>
      <button type="button" onClick={downloadTemplate}>Tải CSV mẫu</button>
    </section>}
    {importError && <p className="import-inline-error">{importError}</p>}
    {fileName && <section className="sprint-import-preview"><header><span><small>ĐÃ ĐỌC FILE</small><b>{fileName}</b></span><strong>{draft.sessions.length} session</strong></header>{draft.sessions.length > 0 && <div>{draft.sessions.slice(0, 5).map((session, index) => <p key={`${session.date}-${index}`}><time>{session.date}{session.studyTime ? ` · ${session.studyTime}` : ""}</time><b>{session.skill} · {session.title}</b><span>{session.duration} phút · {session.tasks.length} task{session.sourceTitle || session.sourceUrl ? " · có tài liệu" : ""}</span></p>)}{draft.sessions.length > 5 && <em>+ {draft.sessions.length - 5} session khác</em>}</div>}{!draft.sessions.length && <p className="import-fallback">File không có session hợp lệ; hệ thống sẽ tự sinh lịch theo ngày học trong lộ trình.</p>}{draft.warnings.length > 0 && <details><summary>{draft.warnings.length} cảnh báo khi đọc file</summary>{draft.warnings.map((warning) => <p key={warning}>{warning}</p>)}</details>}</section>}
    <div className="form-grid">
      <label>Ngày bắt đầu<input name="startDate" type="date" required value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })}/></label>
      <label>Tên Sprint<input name="title" required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })}/></label>
      <label className="wide">Mục tiêu tuần<textarea name="objective" rows={3} required placeholder="Ví dụ: Tự làm Reading Section 2 khi bấm giờ" value={draft.objective} onChange={(event) => setDraft({ ...draft, objective: event.target.value })}/></label>
      {SKILLS.map((skill) => <label key={skill}>Target {skill}<input name={`target-${skill}`} type="number" min="0" max="100" value={draft.targets[skill] ?? 65} onChange={(event) => setDraft({ ...draft, targets: { ...draft.targets, [skill]: Number(event.target.value) } })}/></label>)}
    </div>
    {!initial && draft.sessions.length === 0 && <section className="session-notes-planner"><header><small>GHI CHÚ THEO NGÀY HỌC</small><b>Chuẩn bị riêng cho từng session</b><p>Chỉ những ngày rảnh đã chọn trong lộ trình mới được tạo session.</p></header><div className="form-grid">{generatedStudyDates.map((item) => <label className="wide" key={item.date}><span>{item.label}</span><textarea rows={2} value={planningNotes[item.date] ?? ""} onChange={(event) => setPlanningNotes((current) => ({ ...current, [item.date]: event.target.value }))} placeholder="Ví dụ: Ôn transcript bài cũ, mang Cambridge 18, làm bài không dùng từ điển…"/></label>)}</div>{!generatedStudyDates.length && <p className="import-inline-error">Lộ trình chưa có ngày học phù hợp trong tuần này.</p>}</section>}
    <button className="primary submit" disabled={saving || readingFile}>{saving ? "Đang lưu…" : initial ? "Lưu thay đổi" : draft.sessions.length ? `Tạo Sprint với ${draft.sessions.length} session` : "Tạo Sprint và Daily Sessions"}</button>
  </form>;
}

function SessionPlanningNoteForm({ session, saving, onSave }: { session: SprintSession; saving: boolean; onSave: (notes: string) => void }) {
  const [notes, setNotes] = useState(session.planningNotes);
  return <form className="planner-form" onSubmit={(event) => { event.preventDefault(); onSave(notes); }}><p className="form-note">Ghi chú này dùng để chuẩn bị trước buổi học và khác với ghi chú kết quả khi kết thúc session.</p><div className="form-grid"><label className="wide">Ghi chú chuẩn bị<textarea rows={6} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Tài liệu cần mang, phần cần ôn trước, cách làm bài hoặc lưu ý cá nhân…"/></label></div><button className="primary submit" disabled={saving}>{saving ? "Đang lưu…" : "Lưu ghi chú"}</button></form>;
}

function SourceForm({ saving, materials, initial, onSave }: { saving: boolean; materials: SprintWorkspace["materials"]; initial?: LearningSourceMapping; onSave: (input: Omit<LearningSourceMapping, "id" | "planId">) => void }) {
  const number = (form: FormData, key: string) => String(form.get(key) || "") ? Number(form.get(key)) : null;
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const resourceId = String(form.get("resourceId")); const material = materials.find((item) => item.id === resourceId); onSave({ resourceId, documentTitle: String(form.get("documentTitle")).trim() || material?.title || "Tài liệu học", unit: String(form.get("unit")).trim(), section: String(form.get("section")).trim(), pageFrom: number(form, "pageFrom"), pageTo: number(form, "pageTo"), audioTrack: String(form.get("audioTrack")).trim(), scriptPage: number(form, "scriptPage"), exerciseFrom: String(form.get("exerciseFrom")).trim(), exerciseTo: String(form.get("exerciseTo")).trim(), sourceUrl: String(form.get("sourceUrl")).trim(), notes: String(form.get("notes")).trim() }); }
  return <form className="planner-form" onSubmit={submit}><div className="form-grid"><label className="wide">Chọn từ kho tài liệu<select name="resourceId" defaultValue={initial?.resourceId}><option value="">Nhập tài liệu thủ công</option>{materials.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.folder}</option>)}</select></label><label className="wide">Tên tài liệu<input name="documentTitle" defaultValue={initial?.documentTitle} placeholder="Để trống để dùng tên tài liệu đã chọn"/></label><label>Unit<input name="unit" defaultValue={initial?.unit} placeholder="Unit 5"/></label><label>Section<input name="section" defaultValue={initial?.section} placeholder="Reading Section 2"/></label><label>Trang từ<input name="pageFrom" type="number" min="1" defaultValue={initial?.pageFrom ?? ""}/></label><label>Đến trang<input name="pageTo" type="number" min="1" defaultValue={initial?.pageTo ?? ""}/></label><label>Audio track<input name="audioTrack" defaultValue={initial?.audioTrack} placeholder="Track 12"/></label><label>Script page<input name="scriptPage" type="number" min="1" defaultValue={initial?.scriptPage ?? ""}/></label><label>Exercise từ<input name="exerciseFrom" defaultValue={initial?.exerciseFrom} placeholder="Q1–5"/></label><label>Exercise đến<input name="exerciseTo" defaultValue={initial?.exerciseTo} placeholder="Q10–13"/></label><label className="wide">Link mở tài liệu<input name="sourceUrl" type="url" defaultValue={initial?.sourceUrl} placeholder="Tự lấy từ tài liệu đã chọn nếu để trống"/></label><label className="wide">Ghi chú<textarea name="notes" rows={3} defaultValue={initial?.notes}/></label></div><button className="primary submit" disabled={saving}>{saving ? "Đang lưu…" : "Lưu Source Mapping"}</button></form>;
}

function TaskManager({ userId, session, tasks, saving, onChange }: { userId: string; session: SprintSession; tasks: StudyTask[]; saving: boolean; onChange: (action: () => Promise<void>) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); onChange(() => saveStudyTask(userId, session.id, { taskType: String(form.get("taskType")) as StudyTask["taskType"], workflowType: String(form.get("workflowType")) as StudyTask["workflowType"], title: String(form.get("title")).trim(), instructions: String(form.get("instructions")).trim(), question: String(form.get("question")).trim(), answerType: String(form.get("answerType")) as StudyTask["answerType"], correctAnswer: String(form.get("correctAnswer")).trim(), points: Number(form.get("points")), metadata: {}, workflowConfig: {} }, tasks.length).then(() => undefined)); }
  const defaultType = ["Listening", "Reading", "Writing", "Speaking"].includes(session.skill) ? session.skill.toLowerCase() : session.skill === "Review" ? "review" : "practice";
  const defaultWorkflow = session.skill === "Listening" ? "LISTENING_PREDICTION" : session.skill === "Reading" ? "READING_EVIDENCE" : session.skill === "Writing" ? "WRITING_AREA" : session.skill === "Speaking" ? "SPEAKING_CUE_CARD" : "SENTENCE_COMPLETION";
  return <div className="task-manager"><div className="task-list-edit">{tasks.map((task, index) => <article key={task.id}><span>{index + 1}</span><div><small>{task.taskType} · {task.workflowType.replaceAll("_", " ")} · {task.answerType}</small><b>{task.title}</b><p>{task.question}</p></div><button className="delete" onClick={() => { if (confirm("Xóa task này?")) onChange(() => deleteStudyTask(task.id)); }}>Xóa</button></article>)}{!tasks.length && <div className="planner-empty">Chưa có task. Thêm câu hỏi đầu tiên bên dưới.</div>}</div><form className="planner-form task-form" onSubmit={submit}><h3>Thêm task</h3><div className="form-grid"><label>Loại task<select name="taskType" defaultValue={defaultType}><option value="warmup">Warm-up</option><option value="practice">Practice</option><option value="listening">Listening</option><option value="reading">Reading</option><option value="writing">Writing</option><option value="speaking">Speaking</option><option value="review">Review</option></select></label><label>Workflow<select name="workflowType" defaultValue={defaultWorkflow}><option value="STANDARD">Standard</option><option value="LISTENING_PREDICTION">Listening Prediction</option><option value="READING_EVIDENCE">Reading Evidence</option><option value="SENTENCE_COMPLETION">Sentence Completion</option><option value="WRITING_AREA">Writing A-R-E-A</option><option value="SPEAKING_CUE_CARD">Speaking Cue Card</option></select></label><label>Kiểu trả lời<select name="answerType" defaultValue={["Writing", "Speaking"].includes(session.skill) ? "self_check" : "text"}><option value="text">Câu trả lời ngắn</option><option value="long_text">Bài viết dài</option><option value="number">Số</option><option value="self_check">Tự đánh giá</option></select></label><label className="wide">Tên task<input name="title" required placeholder="Q1 – Sentence Completion"/></label><label className="wide">Hướng dẫn<input name="instructions" placeholder="Đọc câu hỏi và dự đoán từ loại trước khi scan"/></label><label className="wide">Câu hỏi<textarea name="question" rows={3} required/></label><label className="wide">Đáp án chuẩn<textarea name="correctAnswer" rows={2}/></label><label>Điểm<input name="points" type="number" min="0" step="0.5" defaultValue="1"/></label></div><button className="primary submit" disabled={saving}>{saving ? "Đang lưu…" : "＋ Thêm task"}</button></form></div>;
}

function SessionRunner({ userId, planId, sprintId, session, source, tasks, attempts, onClose, onDone }: { userId: string; planId: string; sprintId: string; session: SprintSession; source?: LearningSourceMapping; tasks: StudyTask[]; attempts: TaskAttempt[]; onClose: () => void; onDone: () => Promise<void> }) {
  const [index, setIndex] = useState(0); const [answer, setAnswer] = useState(""); const [evidence, setEvidence] = useState(""); const [selfCorrect, setSelfCorrect] = useState(false); const [structured, setStructured] = useState<Record<string, string>>({}); const [recording, setRecording] = useState<RecordingValue>(null); const [localAttempts, setLocalAttempts] = useState(attempts); const [wrongAttempt, setWrongAttempt] = useState<TaskAttempt | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [startedAt] = useState(Date.now());
  const task = tasks[index]; const latest = task ? [...localAttempts].reverse().find((item) => item.taskId === task.id) : undefined;
  const attemptedIds = new Set(localAttempts.map((item) => item.taskId)); const allAttempted = tasks.every((item) => attemptedIds.has(item.id));
  useEffect(() => { if (session.workflowStatus === "TODO") void startSprintSession(session.id, sprintId).catch((err) => setError(err instanceof Error ? err.message : "Không thể bắt đầu session.")); }, [session.id, session.workflowStatus, sprintId]);
  useEffect(() => { if (task) void logTaskStarted(userId, sprintId, session.id, task.id).catch((err) => setError(err instanceof Error ? err.message : "Không thể ghi nhận task.")); }, [index, session.id, sprintId, task, userId]);
  function resetInput() { setAnswer(""); setEvidence(""); setSelfCorrect(false); setStructured({}); setRecording(null); }
  async function submit() { if (!task) return; setBusy(true); setError(""); try { const result = await submitTaskAttempt(userId, task, answer, selfCorrect, evidence, structured); setLocalAttempts((current) => [...current, result]); if (recording) { try { await uploadSpeakingRecording(userId, result.id, recording.blob, recording.durationSeconds); } catch (uploadError) { setError(uploadError instanceof Error ? `Đã lưu attempt nhưng chưa tải được ghi âm: ${uploadError.message}` : "Đã lưu attempt nhưng chưa tải được ghi âm."); } } if (!result.isCorrect) { setWrongAttempt(result); await createBugFromAttempt(userId, planId, session, task, result, { errorType: "OTHER", rootCause: "Chưa phân tích", refactorRule: "Cần phân tích trước lần luyện tiếp theo.", evidence }); } else if (index < tasks.length - 1) { setIndex(index + 1); resetInput(); } } catch (err) { setError(err instanceof Error ? err.message : "Không thể nộp câu trả lời."); } finally { setBusy(false); } }
  async function commitBug(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!task || !wrongAttempt) return; const form = new FormData(event.currentTarget); setBusy(true); try { await createBugFromAttempt(userId, planId, session, task, wrongAttempt, { errorType: String(form.get("errorType")), rootCause: String(form.get("rootCause")).trim(), refactorRule: String(form.get("refactorRule")).trim(), evidence }); setWrongAttempt(null); if (index < tasks.length - 1) { setIndex(index + 1); resetInput(); } } catch (err) { setError(err instanceof Error ? err.message : "Không thể tạo bug."); } finally { setBusy(false); } }
  async function finish(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); try { const elapsed = Math.max(1, Math.round((Date.now() - startedAt) / 60000)); await completeSprintSession(session.id, sprintId, Number(form.get("duration")) || elapsed, String(form.get("notes")).trim()); await onDone(); } catch (err) { setError(err instanceof Error ? err.message : "Không thể kết thúc session."); setBusy(false); } }
  return <div className="session-runner"><header><div><p className="eyebrow">DAILY STUDY SESSION · {session.skill}</p><h1>{session.title}</h1><p>Goal: {session.targetScore ?? "—"}% · Estimated: {session.duration} phút</p></div><button onClick={onClose}>×</button></header><div className="runner-progress">{tasks.map((item, taskIndex) => <button key={item.id} className={`${taskIndex === index ? "active" : ""} ${attemptedIds.has(item.id) ? "done" : ""}`} onClick={() => { setIndex(taskIndex); resetInput(); }}>{taskIndex + 1}</button>)}</div>{session.planningNotes && <section className="runner-source"><div><small>GHI CHÚ CHUẨN BỊ</small><b>{session.planningNotes}</b></div></section>}{source && <section className="runner-source"><div><small>MATERIAL</small><b>{source.documentTitle}</b><span>{[source.unit, source.section, source.pageFrom ? `Pages ${source.pageFrom}–${source.pageTo ?? source.pageFrom}` : "", source.audioTrack].filter(Boolean).join(" · ")}</span></div>{source.sourceUrl && <a href={source.sourceUrl} target="_blank" rel="noreferrer">Open Material ↗</a>}</section>}{error && <div className="status-banner">{error}</div>}
    {!allAttempted && task && <section className="runner-task"><small>{task.taskType.toUpperCase()} · {task.workflowType.replaceAll("_", " ")} · TASK {index + 1}/{tasks.length}</small><h2>{task.title}</h2><p>{task.instructions}</p><div className="question-box">{task.question}</div><PracticeFields task={task} answer={answer} evidence={evidence} selfCorrect={selfCorrect} structured={structured} recording={recording} onAnswer={setAnswer} onEvidence={setEvidence} onSelfCorrect={setSelfCorrect} onStructured={setStructured} onRecording={setRecording}/>{latest && <div className={latest.isCorrect ? "answer-feedback correct" : "answer-feedback wrong"}><b>{latest.isCorrect ? "✓ Correct" : "✕ Chưa đúng"}</b><span>Đáp án chuẩn: {task.correctAnswer || "Tự đánh giá"}</span></div>}<button className="primary" disabled={busy || (task.answerType !== "self_check" && !answer.trim()) || (task.answerType === "self_check" && !selfCorrect) || (task.workflowType === "SPEAKING_CUE_CARD" && !recording)} onClick={() => void submit()}>{busy ? "Đang chấm…" : "Submit & Check"}</button></section>}
    {wrongAttempt && task && <form className="bug-commit" onSubmit={commitBug}><p className="eyebrow">ERROR DETECTED → COMMIT BUG</p><h2>Phân tích lỗi trước khi tiếp tục</h2><div className="form-grid"><label>Error type<select name="errorType"><optgroup label="Listening / Reading"><option>ANCHOR</option><option>TARGET</option><option>LOCATING</option><option>PARAPHRASE</option><option>DISTRACTOR</option><option>SOUND</option><option>ATTRIBUTION</option><option>ANSWER_BOUNDARY</option></optgroup><optgroup label="Language"><option>GRAMMAR_PREDICTION</option><option>VOCABULARY</option><option>GRAMMAR</option><option>SUBJECT_VERB</option><option>TENSE</option><option>ARTICLE</option><option>WORD_FORM</option><option>WORD_CHOICE</option><option>COLLOCATION</option><option>SPELLING</option></optgroup><optgroup label="Writing / Speaking"><option>TASK_RESPONSE</option><option>COHERENCE</option><option>CONNECTOR</option><option>PAUSE</option><option>REPETITION</option><option>INCOMPLETE_SENTENCE</option><option>PRONUNCIATION</option></optgroup><optgroup label="Process"><option>TIME</option><option>INSTRUCTION</option><option>OTHER</option></optgroup></select></label><label className="wide">Root cause<textarea name="rootCause" required rows={3} placeholder="Tại sao bạn sai?"/></label><label className="wide">Refactor rule<textarea name="refactorRule" required rows={2} placeholder="Lần sau cần làm gì khác?"/></label></div><button className="primary submit" disabled={busy}>Lưu vào Sổ lỗi & tiếp tục</button></form>}
    {allAttempted && !wrongAttempt && <form className="runner-finish" onSubmit={finish}><p className="eyebrow">END SESSION</p><h2>Hoàn tất và tạo Study Log</h2><div className="runner-result"><article><b>{tasks.length}</b><span>tasks</span></article><article><b>{localAttempts.filter((item) => item.isCorrect).length}</b><span>correct attempts</span></article><article><b>{localAttempts.filter((item) => item.isCorrect === false).length}</b><span>wrong attempts</span></article></div><div className="form-grid"><label>Thời lượng thực tế<input name="duration" type="number" min="1" max="1440" defaultValue={session.duration}/></label><label className="wide">Ghi chú cuối buổi<textarea name="notes" rows={4}/></label></div><button className="primary submit" disabled={busy}>{busy ? "Đang tạo Study Log…" : "End Session"}</button></form>}
  </div>;
}
