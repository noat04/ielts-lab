"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { WeeklyReviewWizard } from "@/components/WeeklyReviewWizard";
import {
  generateNextWeek,
  loadSprintQuality,
  recordBugRetest,
  saveWeeklyRetrospective,
  scheduleBugRetest,
  updateBugQuality,
  type QualityBug,
  type SprintQuality,
} from "@/lib/supabase/quality";
import type { SprintSession, WeekSprint } from "@/lib/supabase/sprints";

const SKILLS = ["Listening", "Reading", "Writing", "Speaking", "Grammar / Vocab"];

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function percent(value: number | null) {
  return value === null ? "—" : `${Math.round(value)}%`;
}

function splitLines(items?: string[]) {
  return (items ?? []).join("\n");
}

export function SprintQualityPanel({
  userId,
  planId,
  sprint,
  sessions,
  onSprintGenerated,
}: {
  userId: string;
  planId: string;
  sprint: WeekSprint;
  sessions: SprintSession[];
  onSprintGenerated: (sprintId: string) => Promise<void>;
}) {
  const [quality, setQuality] = useState<SprintQuality | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retestBug, setRetestBug] = useState<QualityBug | null>(null);
  const [showRetro, setShowRetro] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [showReviewWizard, setShowReviewWizard] = useState(false);

  const reload = useCallback(async () => {
    setError("");
    try {
      setQuality(await loadSprintQuality(planId, sprint.id, sessions.map((item) => item.id)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tải dữ liệu chất lượng học tập.");
    }
  }, [planId, sessions, sprint.id]);

  useEffect(() => { void reload(); }, [reload]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể lưu thay đổi."); }
    finally { setBusy(false); }
  }

  const activeBugs = useMemo(() => quality?.bugs.filter((bug) => bug.lifecycle !== "RESOLVED") ?? [], [quality]);
  const kpi = quality?.kpi;

  return <section className="quality-zone">
    <div className="section-heading quality-heading">
      <div><p className="eyebrow">PHASE 2 · LEARNING QUALITY</p><h2>Đo chất lượng, không chỉ đếm giờ</h2><p>KPI được tính từ session, attempt, retest và carry-over thực tế.</p></div>
      <button disabled={busy} onClick={() => void reload()}>↻ Tính lại KPI</button>
    </div>
    {error && <div className="status-banner"><span>{error}</span><button onClick={() => setError("")}>×</button></div>}

    <div className="review-launcher"><div><span>WEEKLY REVIEW</span><h3>Sẵn sàng tổng kết và lên kế hoạch tuần sau?</h3><p>Đi qua 5 bước: KPI, kỹ năng, lỗi, tự đánh giá và duyệt kế hoạch mới.</p></div><button className="primary" disabled={!quality || busy} onClick={() => setShowReviewWizard(true)}>Bắt đầu Weekly Review →</button></div>

    <div className="quality-kpis">
      <KpiCard label="Overall quality" value={percent(kpi?.overall ?? null)} detail={kpi ? `Cập nhật ${new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(kpi.calculatedAt))}` : "Chưa có dữ liệu"}/>
      <KpiCard label="Adherence" value={percent(kpi?.adherence ?? null)} detail={`${kpi?.completedSessions ?? 0}/${kpi?.plannedSessions ?? 0} session`}/>
      <KpiCard label="Task accuracy" value={percent(kpi?.taskAccuracy ?? null)} detail="Theo attempt mới nhất"/>
      <KpiCard label="Time completion" value={percent(kpi?.timeCompletion ?? null)} detail={`${kpi?.actualMinutes ?? 0}/${kpi?.plannedMinutes ?? 0} phút`}/>
      <KpiCard label="Retest pass" value={percent(kpi?.retestPass ?? null)} detail={`${kpi?.resolvedBugs ?? 0}/${kpi?.newBugs ?? 0} lỗi tuần đã resolved`}/>
      <KpiCard label="Carry-over" value={String(kpi?.carryOver ?? 0)} detail="Session chuyển từ tuần trước"/>
    </div>

    <div className="skill-kpi-board">
      <div><p className="eyebrow">SKILL KPI</p><h3>Hiệu suất theo kỹ năng</h3></div>
      {quality?.skillKpis.map((item) => <article key={item.skill}><header><b>{item.skill}</b><span className={`skill-kpi-status ${item.status.toLowerCase()}`}>{item.status.replace("_", " ")}</span></header><strong>{percent(item.actual)}<small> / target {percent(item.target)}</small></strong><footer><span>{item.correctAttempts}/{item.totalAttempts} đúng</span><span>{item.studyMinutes} phút</span><span>{item.bugCount} lỗi</span></footer></article>)}
    </div>

    <div className="quality-grid">
      <section className="bug-lifecycle-card">
        <div className="section-heading"><div><p className="eyebrow">BUG LIFECYCLE</p><h2>Lỗi cần xử lý</h2></div><b>{activeBugs.length} active</b></div>
        <div className="quality-bug-list">
          {activeBugs.slice(0, 8).map((bug) => {
            const pending = quality?.retests.find((item) => item.bugId === bug.id && item.result === "PENDING");
            return <article key={bug.id}>
              <header><div><small>{bug.skill} · {bug.code}</small><b>{bug.rootCause}</b></div><span className={`lifecycle ${bug.lifecycle.toLowerCase()}`}>{bug.lifecycle.replace("_", " ")}</span></header>
              <p><strong>Rule:</strong> {bug.refactorRule || "Chưa có quy tắc sửa lỗi."}</p>
              <div className="bug-quality-controls">
                <select aria-label="Loại lỗi" value={bug.errorType} disabled={busy} onChange={(event) => void run(() => updateBugQuality(bug.id, { errorType: event.target.value }))}>
                  {quality?.errorTypes.map((type) => <option key={type.code} value={type.code}>{type.label}</option>)}
                </select>
                <select aria-label="Mức độ" value={bug.severity} disabled={busy} onChange={(event) => void run(() => updateBugQuality(bug.id, { severity: event.target.value as QualityBug["severity"] }))}>
                  <option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option>
                </select>
                {pending
                  ? <button className="primary" onClick={() => setRetestBug(bug)}>Retest · {pending.scheduledFor}</button>
                  : <button onClick={() => void run(() => scheduleBugRetest(userId, bug.id, sprint.id, addDays(new Date().toISOString().slice(0, 10), 3)))}>Lên lịch +3 ngày</button>}
              </div>
            </article>;
          })}
          {!activeBugs.length && <div className="planner-empty">Không còn lỗi active trong lộ trình. Hãy giữ nhịp retest để tránh tái phạm.</div>}
        </div>
      </section>

      <aside className="quality-actions">
        <article><p className="eyebrow">WEEKLY RETROSPECTIVE</p><h3>Nhìn lại tuần học</h3><p>Ghi wins, blockers và thay đổi cụ thể cho tuần tới.</p><button className={quality?.retrospective ? "" : "primary"} onClick={() => setShowRetro(true)}>{quality?.retrospective ? "Xem / sửa retrospective" : "Viết retrospective"}</button></article>
        <article><p className="eyebrow">NEXT WEEK GENERATOR</p><h3>Carry-over có kiểm soát</h3><p>Chỉ session chưa hoàn thành được sao chép; task và source mapping được giữ nguyên.</p><button className="primary" disabled={busy} onClick={() => setShowGenerator(true)}>Tạo tuần kế tiếp →</button></article>
      </aside>
    </div>

    {retestBug && <QualityModal title={`Retest · ${retestBug.code}`} onClose={() => setRetestBug(null)}><RetestForm bug={retestBug} busy={busy} onSubmit={(result, answer, notes) => run(async () => { await recordBugRetest(retestBug.id, sprint.id, result, answer, notes); setRetestBug(null); })}/></QualityModal>}
    {showRetro && <QualityModal title="Weekly Retrospective" onClose={() => setShowRetro(false)} wide><RetrospectiveForm initial={quality?.retrospective ?? null} busy={busy} onSubmit={(input) => run(async () => { await saveWeeklyRetrospective(userId, sprint.id, input); setShowRetro(false); })}/></QualityModal>}
    {showGenerator && <QualityModal title="Carry-over & Next Week" onClose={() => setShowGenerator(false)}><NextWeekForm sprint={sprint} busy={busy} focus={quality?.retrospective?.nextWeekFocus ?? ""} onSubmit={async (input) => {
      setBusy(true); setError("");
      try { const nextId = await generateNextWeek(userId, sprint.id, input); setShowGenerator(false); await onSprintGenerated(nextId); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể tạo tuần kế tiếp."); }
      finally { setBusy(false); }
    }}/></QualityModal>}
    {showReviewWizard && quality && <WeeklyReviewWizard userId={userId} sprint={sprint} sessions={sessions} quality={quality} onClose={() => setShowReviewWizard(false)} onSprintGenerated={onSprintGenerated}/>}
  </section>;
}

function KpiCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article><small>{label}</small><b>{value}</b><span>{detail}</span></article>;
}

function QualityModal({ title, children, onClose, wide = false }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className={`modal-card ${wide ? "hub-modal-wide" : ""}`}><header><div><small>LEARNING QUALITY</small><h2>{title}</h2></div><button onClick={onClose}>×</button></header>{children}</div></div>;
}

function RetestForm({ bug, busy, onSubmit }: { bug: QualityBug; busy: boolean; onSubmit: (result: "PASS" | "FAIL", answer: string, notes: string) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null; const result = submitter?.value === "FAIL" ? "FAIL" : "PASS"; onSubmit(result, String(form.get("answer")).trim(), String(form.get("notes")).trim()); }
  return <form className="planner-form" onSubmit={submit}><div className="retest-reference"><small>CÂU SAI CŨ</small><p>{bug.original}</p><small>ĐÁP ÁN / CÁCH SỬA</small><p>{bug.correction}</p><small>REFACTOR RULE</small><p>{bug.refactorRule}</p></div><div className="form-grid"><label className="wide">Câu trả lời lần này<textarea name="answer" rows={4} required/></label><label className="wide">Bằng chứng / ghi chú<textarea name="notes" rows={3} required/></label></div><div className="retest-actions"><button type="submit" name="result" value="FAIL" disabled={busy}>Chưa đạt · Reopen</button><button type="submit" name="result" value="PASS" className="primary" disabled={busy}>Đạt · Resolve bug</button></div></form>;
}

function RetrospectiveForm({ initial, busy, onSubmit }: { initial: SprintQuality["retrospective"]; busy: boolean; onSubmit: (input: { energyScore: number; confidenceScore: number; wins: string; challenges: string; stopDoing: string; startDoing: string; continueDoing: string; nextWeekFocus: string }) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); onSubmit({ energyScore: Number(form.get("energy")), confidenceScore: Number(form.get("confidence")), wins: String(form.get("wins")), challenges: String(form.get("challenges")), stopDoing: String(form.get("stopDoing")).trim(), startDoing: String(form.get("startDoing")).trim(), continueDoing: String(form.get("continueDoing")).trim(), nextWeekFocus: String(form.get("focus")).trim() }); }
  return <form className="planner-form" onSubmit={submit}><div className="form-grid"><label>Năng lượng (1–5)<input name="energy" type="number" min="1" max="5" defaultValue={initial?.energyScore ?? 3}/></label><label>Tự tin (1–5)<input name="confidence" type="number" min="1" max="5" defaultValue={initial?.confidenceScore ?? 3}/></label><label className="wide">Wins · mỗi dòng một ý<textarea name="wins" rows={3} defaultValue={splitLines(initial?.wins)}/></label><label className="wide">Challenges · mỗi dòng một ý<textarea name="challenges" rows={3} defaultValue={splitLines(initial?.challenges)}/></label><label>Stop doing<textarea name="stopDoing" rows={3} defaultValue={initial?.stopDoing}/></label><label>Start doing<textarea name="startDoing" rows={3} defaultValue={initial?.startDoing}/></label><label>Continue doing<textarea name="continueDoing" rows={3} defaultValue={initial?.continueDoing}/></label><label>Trọng tâm tuần tới<textarea name="focus" rows={3} required defaultValue={initial?.nextWeekFocus}/></label></div><button className="primary submit" disabled={busy}>Lưu retrospective</button></form>;
}

function NextWeekForm({ sprint, focus, busy, onSubmit }: { sprint: WeekSprint; focus: string; busy: boolean; onSubmit: (input: { startDate: string; title: string; objective: string; targets: Record<string, number> }) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); onSubmit({ startDate: String(form.get("startDate")), title: String(form.get("title")).trim(), objective: String(form.get("objective")).trim(), targets: Object.fromEntries(SKILLS.map((skill) => [skill, Number(form.get(`target-${skill}`))])) }); }
  return <form className="planner-form" onSubmit={submit}><p className="generator-note">Các session chưa <b>DONE</b> sẽ được ưu tiên và mang theo task. Những ngày trống được tạo theo lịch học trong lộ trình.</p><div className="form-grid"><label>Ngày bắt đầu<input name="startDate" type="date" required defaultValue={addDays(sprint.endDate, 1)}/></label><label>Tên tuần<input name="title" required defaultValue={`Week ${sprint.weekNumber + 1}`}/></label><label className="wide">Trọng tâm<input name="objective" required defaultValue={focus || sprint.objective}/></label>{SKILLS.map((skill) => <label key={skill}>Target {skill}<input name={`target-${skill}`} type="number" min="0" max="100" defaultValue={sprint.skillTargets[skill] ?? 65}/></label>)}</div><button className="primary submit" disabled={busy}>{busy ? "Đang sinh lịch…" : "Hoàn tất tuần & tạo Next Week"}</button></form>;
}
