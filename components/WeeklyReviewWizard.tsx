"use client";

import { useMemo, useState } from "react";
import {
  generateNextWeek,
  saveWeeklyRetrospective,
  scheduleBugRetest,
  type QualityBug,
  type SprintQuality,
} from "@/lib/supabase/quality";
import type { SprintSession, WeekSprint } from "@/lib/supabase/sprints";

const SKILLS = ["Listening", "Reading", "Writing", "Speaking", "Grammar / Vocab"];
const STEPS = ["Tổng kết", "Kỹ năng", "Sổ lỗi", "Nhìn lại", "Tuần kế tiếp"];
const SEVERITY_WEIGHT: Record<QualityBug["severity"], number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function percent(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${Math.round(value)}%`;
}

function reviewLevel(score: number | null | undefined) {
  if (score === null || score === undefined) return { code: "NO_DATA", label: "Chưa đủ dữ liệu", note: "Hãy hoàn thành và chấm thêm session để có đánh giá chính xác." };
  if (score >= 90) return { code: "EXCELLENT", label: "Xuất sắc", note: "Khối lượng và chất lượng học đang cân bằng rất tốt." };
  if (score >= 75) return { code: "GOOD", label: "Tốt", note: "Bạn đang đi đúng hướng; chỉ cần xử lý các điểm yếu nổi bật." };
  if (score >= 50) return { code: "NEEDS_ATTENTION", label: "Cần chú ý", note: "Nên giảm độ dàn trải và tập trung vào một kỹ năng trọng yếu." };
  return { code: "AT_RISK", label: "Cần điều chỉnh", note: "Nên giảm tải tuần tới, ưu tiên bài nền tảng và retest lỗi cũ." };
}

function lines(items: string[]) {
  return items.join("\n");
}

export function WeeklyReviewWizard({
  userId,
  sprint,
  sessions,
  quality,
  onClose,
  onSprintGenerated,
}: {
  userId: string;
  sprint: WeekSprint;
  sessions: SprintSession[];
  quality: SprintQuality;
  onClose: () => void;
  onSprintGenerated: (sprintId: string) => Promise<void>;
}) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [generatedSprintId, setGeneratedSprintId] = useState("");
  const [retro, setRetro] = useState({
    energyScore: quality.retrospective?.energyScore ?? 3,
    confidenceScore: quality.retrospective?.confidenceScore ?? 3,
    wins: lines(quality.retrospective?.wins ?? []),
    challenges: lines(quality.retrospective?.challenges ?? []),
    stopDoing: quality.retrospective?.stopDoing ?? "",
    startDoing: quality.retrospective?.startDoing ?? "",
    continueDoing: quality.retrospective?.continueDoing ?? "",
    nextWeekFocus: quality.retrospective?.nextWeekFocus ?? "",
  });

  const activeBugs = useMemo(() => quality.bugs
    .filter((bug) => bug.lifecycle !== "RESOLVED")
    .sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity] || b.occurrences - a.occurrences), [quality.bugs]);
  const skillRanking = useMemo(() => [...quality.skillKpis].sort((a, b) => {
    if (a.actual === null) return 1;
    if (b.actual === null) return -1;
    return a.actual - b.actual;
  }), [quality.skillKpis]);
  const weakest = skillRanking.find((item) => item.actual !== null) ?? skillRanking[0];
  const unfinished = sessions.filter((session) => session.workflowStatus !== "DONE");
  const completed = sessions.length - unfinished.length;
  const level = reviewLevel(quality.kpi?.overall);
  const dueRetests = quality.retests.filter((item) => item.result === "PENDING");

  const suggestedFocus = useMemo(() => {
    const parts: string[] = [];
    if (weakest) parts.push(`Ưu tiên ${weakest.skill}${weakest.actual === null ? "" : ` (${Math.round(weakest.actual)}%)`}`);
    if (activeBugs[0]) parts.push(`sửa lỗi ${activeBugs[0].code}: ${activeBugs[0].rootCause || activeBugs[0].errorType}`);
    if (unfinished.length) parts.push(`hoàn thành ${unfinished.length} session carry-over`);
    return parts.join("; ") || sprint.objective || "Duy trì nhịp học và củng cố lỗi cũ";
  }, [activeBugs, sprint.objective, unfinished.length, weakest]);

  const [nextWeek, setNextWeek] = useState(() => ({
    startDate: addDays(sprint.endDate, 1),
    title: `Week ${sprint.weekNumber + 1}`,
    objective: quality.retrospective?.nextWeekFocus || suggestedFocus,
    targets: Object.fromEntries(SKILLS.map((skill) => {
      const kpi = quality.skillKpis.find((item) => item.skill === skill);
      const baseline = sprint.skillTargets[skill] ?? 65;
      const progressive = kpi?.actual === null || kpi?.actual === undefined ? baseline : Math.round(kpi.actual + 5);
      return [skill, Math.max(40, Math.min(90, Math.max(baseline, progressive)))];
    })),
  }));

  function next() {
    if (step === 3 && !retro.nextWeekFocus.trim()) {
      setRetro((current) => ({ ...current, nextWeekFocus: suggestedFocus }));
      setNextWeek((current) => ({ ...current, objective: current.objective.trim() || suggestedFocus }));
    }
    setStep((current) => Math.min(STEPS.length - 1, current + 1));
    setError("");
  }

  async function finish() {
    if (!nextWeek.startDate || !nextWeek.title.trim() || !nextWeek.objective.trim()) {
      setError("Hãy điền ngày bắt đầu, tên tuần và trọng tâm trước khi tạo kế hoạch.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (generatedSprintId) {
        await onSprintGenerated(generatedSprintId);
        return;
      }
      await saveWeeklyRetrospective(userId, sprint.id, {
        ...retro,
        nextWeekFocus: retro.nextWeekFocus.trim() || nextWeek.objective.trim(),
      });
      const sprintId = await generateNextWeek(userId, sprint.id, nextWeek);
      setGeneratedSprintId(sprintId);
      const retestCandidates = activeBugs.slice(0, 3);
      await Promise.allSettled(retestCandidates.map((bug, index) =>
        scheduleBugRetest(userId, bug.id, sprintId, addDays(nextWeek.startDate, [1, 3, 5][index]))
      ));
      await onSprintGenerated(sprintId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể hoàn tất đánh giá tuần.");
      setBusy(false);
    }
  }

  return <div className="modal-backdrop weekly-review-backdrop" onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) onClose(); }}>
    <section className="weekly-review-wizard">
      <header className="review-header">
        <div><small>WEEKLY LEARNING REVIEW</small><h2>Đánh giá Week {sprint.weekNumber}</h2><p>Đánh giá bằng dữ liệu thật, sau đó duyệt kế hoạch tuần kế tiếp.</p></div>
        <button disabled={busy} onClick={onClose}>×</button>
      </header>

      <nav className="review-steps" aria-label="Các bước đánh giá tuần">
        {STEPS.map((label, index) => <button key={label} className={index === step ? "active" : index < step ? "done" : ""} onClick={() => setStep(index)}><i>{index < step ? "✓" : index + 1}</i><span>{label}</span></button>)}
      </nav>

      {error && <div className="review-error">{error}</div>}

      <div className="review-body">
        {step === 0 && <section className="review-screen">
          <div className="review-title"><span className={`review-level ${level.code.toLowerCase()}`}>{level.code.replaceAll("_", " ")}</span><h3>{level.label}</h3><p>{level.note}</p></div>
          <div className="review-metrics">
            <ReviewMetric label="Overall quality" value={percent(quality.kpi?.overall)} note="Tổng hợp các KPI"/>
            <ReviewMetric label="Hoàn thành" value={`${completed}/${sessions.length}`} note={percent(quality.kpi?.adherence)}/>
            <ReviewMetric label="Thời gian" value={`${quality.kpi?.actualMinutes ?? 0}′`} note={`Mục tiêu ${quality.kpi?.plannedMinutes ?? 0} phút`}/>
            <ReviewMetric label="Độ chính xác" value={percent(quality.kpi?.taskAccuracy)} note="Attempt mới nhất"/>
          </div>
          <div className="review-session-columns">
            <article><h4>Đã hoàn thành</h4>{sessions.filter((item) => item.workflowStatus === "DONE").map((item) => <p key={item.id}><span>✓</span>{item.title}<small>{item.skill} · {item.duration} phút</small></p>)}{completed === 0 && <em>Chưa có session hoàn thành.</em>}</article>
            <article><h4>Cần carry-over</h4>{unfinished.map((item) => <p key={item.id}><span>→</span>{item.title}<small>{item.skill} · {item.workflowStatus}</small></p>)}{unfinished.length === 0 && <em>Không có session tồn đọng.</em>}</article>
          </div>
        </section>}

        {step === 1 && <section className="review-screen">
          <div className="review-title"><span className="review-level">SKILL ANALYSIS</span><h3>Điểm mạnh và điểm cần ưu tiên</h3><p>Kết quả được tính từ attempt, thời gian học, session hoàn thành và số lỗi.</p></div>
          <div className="review-skill-list">
            {skillRanking.map((item, index) => <article key={item.skill} className={index === 0 && item.actual !== null ? "weakest" : ""}>
              <header><b>{item.skill}</b><span>{item.status === "PASS" ? "Đạt" : item.status === "NOT_MET" ? "Chưa đạt" : "Thiếu dữ liệu"}</span></header>
              <strong>{percent(item.actual)}<small> mục tiêu {percent(item.target)}</small></strong>
              <div className="review-progress"><i style={{ width: `${Math.max(0, Math.min(100, item.actual ?? 0))}%` }}/></div>
              <footer><span>{item.correctAttempts}/{item.totalAttempts} đúng</span><span>{item.studyMinutes} phút</span><span>{item.bugCount} lỗi</span></footer>
            </article>)}
          </div>
          <div className="review-insight"><b>Đề xuất trọng tâm</b><p>{weakest ? `${weakest.skill} đang là kỹ năng cần ưu tiên. Dành nhiều thời gian hơn cho bài có chấm điểm và chữa lỗi ngay sau attempt.` : "Chưa đủ dữ liệu để xác định kỹ năng yếu nhất."}</p></div>
        </section>}

        {step === 2 && <section className="review-screen">
          <div className="review-title"><span className="review-level">ERROR REVIEW</span><h3>Lỗi cần mang sang tuần sau</h3><p>Ưu tiên theo mức nghiêm trọng và số lần tái diễn. Tối đa ba lỗi đầu sẽ được lên lịch retest.</p></div>
          <div className="review-error-summary"><span><b>{activeBugs.length}</b> lỗi active</span><span><b>{dueRetests.length}</b> retest đang chờ</span><span><b>{quality.kpi?.resolvedBugs ?? 0}</b> lỗi resolved tuần này</span><span><b>{percent(quality.kpi?.retestPass)}</b> retest pass</span></div>
          <div className="review-bug-list">
            {activeBugs.slice(0, 8).map((bug, index) => <article key={bug.id}><i>{index < 3 ? "RETEST" : bug.severity}</i><div><small>{bug.skill} · {bug.errorType} · lặp {bug.occurrences} lần</small><b>{bug.code} · {bug.rootCause || "Chưa ghi nguyên nhân gốc"}</b><p>{bug.refactorRule || "Cần bổ sung quy tắc tránh lặp lại lỗi."}</p></div><span className={`lifecycle ${bug.lifecycle.toLowerCase()}`}>{bug.lifecycle.replace("_", " ")}</span></article>)}
            {!activeBugs.length && <div className="planner-empty">Không có lỗi active. Tuần tới có thể tập trung mở rộng kỹ năng.</div>}
          </div>
        </section>}

        {step === 3 && <section className="review-screen">
          <div className="review-title"><span className="review-level">SELF REFLECTION</span><h3>Bổ sung góc nhìn của bạn</h3><p>Dữ liệu cho biết điều gì đã xảy ra; phần nhìn lại giúp giải thích vì sao.</p></div>
          <div className="review-form-grid">
            <ScorePicker label="Năng lượng" value={retro.energyScore} onChange={(value) => setRetro({ ...retro, energyScore: value })}/>
            <ScorePicker label="Mức tự tin" value={retro.confidenceScore} onChange={(value) => setRetro({ ...retro, confidenceScore: value })}/>
            <label className="wide">Điểm làm tốt · mỗi dòng một ý<textarea rows={3} value={retro.wins} onChange={(event) => setRetro({ ...retro, wins: event.target.value })}/></label>
            <label className="wide">Khó khăn · mỗi dòng một ý<textarea rows={3} value={retro.challenges} onChange={(event) => setRetro({ ...retro, challenges: event.target.value })}/></label>
            <label>Dừng làm<textarea rows={3} value={retro.stopDoing} onChange={(event) => setRetro({ ...retro, stopDoing: event.target.value })}/></label>
            <label>Bắt đầu làm<textarea rows={3} value={retro.startDoing} onChange={(event) => setRetro({ ...retro, startDoing: event.target.value })}/></label>
            <label>Tiếp tục làm<textarea rows={3} value={retro.continueDoing} onChange={(event) => setRetro({ ...retro, continueDoing: event.target.value })}/></label>
            <label>Trọng tâm tuần tới<textarea rows={3} placeholder={suggestedFocus} value={retro.nextWeekFocus} onChange={(event) => { setRetro({ ...retro, nextWeekFocus: event.target.value }); setNextWeek({ ...nextWeek, objective: event.target.value }); }}/></label>
          </div>
        </section>}

        {step === 4 && <section className="review-screen">
          <div className="review-title"><span className="review-level">PLAN PREVIEW</span><h3>Duyệt kế hoạch Week {sprint.weekNumber + 1}</h3><p>Session chưa xong sẽ được carry-over; ngày trống được sinh theo lịch học cá nhân.</p></div>
          <div className="next-week-preview">
            <div className="review-form-grid">
              <label>Ngày bắt đầu<input type="date" value={nextWeek.startDate} onChange={(event) => setNextWeek({ ...nextWeek, startDate: event.target.value })}/></label>
              <label>Tên tuần<input value={nextWeek.title} onChange={(event) => setNextWeek({ ...nextWeek, title: event.target.value })}/></label>
              <label className="wide">Mục tiêu tuần<textarea rows={3} value={nextWeek.objective} onChange={(event) => setNextWeek({ ...nextWeek, objective: event.target.value })}/></label>
              {SKILLS.map((skill) => <label key={skill}>Target {skill}<input type="number" min="0" max="100" value={nextWeek.targets[skill]} onChange={(event) => setNextWeek({ ...nextWeek, targets: { ...nextWeek.targets, [skill]: Number(event.target.value) } })}/></label>)}
            </div>
            <aside className="plan-rationale"><h4>Kế hoạch sẽ bao gồm</h4><p><b>{unfinished.length}</b><span>session chưa hoàn thành được carry-over</span></p><p><b>{Math.min(3, activeBugs.length)}</b><span>lỗi ưu tiên được lên lịch retest</span></p><p><b>{weakest?.skill ?? "Review"}</b><span>kỹ năng cần ưu tiên theo KPI</span></p><p><b>{retro.energyScore}/5</b><span>mức năng lượng để bạn cân đối tải học</span></p><small>Bạn vẫn có thể chỉnh sửa từng session sau khi tuần mới được tạo.</small></aside>
          </div>
        </section>}
      </div>

      <footer className="review-footer">
        <button disabled={busy || step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}>← Quay lại</button>
        <span>Bước {step + 1}/{STEPS.length}</span>
        {step < STEPS.length - 1
          ? <button className="primary" disabled={busy} onClick={next}>Tiếp tục →</button>
          : <button className="primary" disabled={busy} onClick={() => void finish()}>{busy ? "Đang tạo tuần mới…" : "Xác nhận và tạo tuần mới"}</button>}
      </footer>
    </section>
  </div>;
}

function ReviewMetric({ label, value, note }: { label: string; value: string; note: string }) {
  return <article><small>{label}</small><b>{value}</b><span>{note}</span></article>;
}

function ScorePicker({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <div className="score-picker"><b>{label}</b><span>{[1, 2, 3, 4, 5].map((score) => <button type="button" className={value === score ? "active" : ""} key={score} onClick={() => onChange(score)}>{score}</button>)}</span><small>1 thấp · 5 rất tốt</small></div>;
}
