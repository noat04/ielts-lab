"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { DASHBOARD_DATA } from "@/lib/dashboard-data";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { LearningPlanner } from "@/components/LearningPlanner";
import { ContentHub } from "@/components/ContentHub";
import { WeeklySprint } from "@/components/WeeklySprint";
import { StudyReminderCenter } from "@/components/StudyReminderCenter";
import {
  deleteBugRecord,
  deleteSessionRecord,
  loadDashboard,
  prepareUserDashboard,
  saveBugRecord,
  saveSessionRecord,
  setBugStatus,
  setExerciseProgress,
  setSessionStatus,
  updateGoals,
  type Bug,
  type BugStatus,
  type DashboardCloudData,
  type SessionStatus,
  type Skill,
  type StudySession,
} from "@/lib/supabase/dashboard";

type Tab = "overview" | "sprint" | "planner" | "content" | "bugs" | "journey";

const BUG_SKILLS: Skill[] = ["Grammar / Vocab", "Reading", "Writing", "Speaking", "Listening"];
const ALL_SKILLS: Skill[] = ["Listening", "Reading", "Writing", "Speaking", "Grammar / Vocab"];
const SKILL_LABEL: Record<Skill, string> = {
  Listening: "Listening",
  Reading: "Reading",
  Writing: "Writing",
  Speaking: "Speaking",
  "Grammar / Vocab": "Grammar–Vocab",
};

function todayISO() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function formatDate(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function theoryKey(bug: Bug) {
  if (bug.id.startsWith("ARTICLE")) return "ARTICLE";
  if (bug.id.startsWith("PHRASAL")) return "PHRASAL";
  if (bug.id.startsWith("PREP")) return "PREP";
  if (bug.id.startsWith("TENSE")) return "TENSE";
  if (bug.id.startsWith("READ")) return "READ";
  if (bug.id.startsWith("SPEAK")) return "SPEAK";
  if (bug.id.startsWith("LIST")) return "LIST";
  return bug.skill === "Grammar / Vocab" ? "PREP" : bug.skill === "Listening" ? "LIST" : bug.skill === "Speaking" ? "SPEAK" : "READ";
}

export function IeltsDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [recoveringPassword, setRecoveringPassword] = useState(false);
  const [cloudData, setCloudData] = useState<DashboardCloudData | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [appError, setAppError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [sessionModal, setSessionModal] = useState<{ status: SessionStatus; session?: StudySession } | null>(null);
  const [bugModal, setBugModal] = useState<Bug | "new" | null>(null);
  const [showSources, setShowSources] = useState(false);
  const [skillFilter, setSkillFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [journalFilter, setJournalFilter] = useState<string>("all");
  const [bugLimit, setBugLimit] = useState(15);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    void supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setAuthReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === "PASSWORD_RECOVERY") setRecoveringPassword(true);
      setAuthReady(true);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const refreshDashboard = useCallback(async (userId: string) => {
    setLoadingData(true);
    setAppError("");
    try {
      await prepareUserDashboard(userId);
      setCloudData(await loadDashboard());
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "Không thể tải dữ liệu Supabase.");
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (user) void refreshDashboard(user.id);
    else setCloudData(null);
  }, [refreshDashboard, user]);

  const goals = cloudData?.goals ?? {
    currentBand: DASHBOARD_DATA.goals.baseline,
    targetBand: DASHBOARD_DATA.goals.target,
    stretchBand: DASHBOARD_DATA.goals.stretch,
    deadline: "",
    targetSessions: DASHBOARD_DATA.goals.totalSessions,
  };
  const bugs = cloudData?.bugs ?? [];
  const sessions = cloudData?.sessions ?? [];
  const weeks = cloudData?.weeks ?? [];
  const tests = cloudData?.tests ?? [];
  const exercises = cloudData?.exercises ?? [];
  const statusOf = (bug: Bug): BugStatus => bug.status;
  const openBugs = bugs.filter((bug) => statusOf(bug) === "OPEN");
  const doneCount = bugs.length - openBugs.length;
  const fixedRate = bugs.length ? Math.round((doneCount / bugs.length) * 100) : 0;
  const localCompleted = sessions.filter((session) => session.status === "completed").length;
  const completedTotal = weeks.reduce((total, week) => total + week.completed, 0) + localCompleted;
  const learningRate = Math.min(100, (completedTotal / goals.targetSessions) * 100);

  const openBySkill = Object.fromEntries(BUG_SKILLS.map((skill) => [skill, openBugs.filter((bug) => bug.skill === skill).length])) as Record<string, number>;
  const allBySkill = Object.fromEntries(BUG_SKILLS.map((skill) => [skill, bugs.filter((bug) => bug.skill === skill).length])) as Record<string, number>;
  const prioritySkill = BUG_SKILLS.reduce((best, skill) => openBySkill[skill] > openBySkill[best] ? skill : best, BUG_SKILLS[0]);
  const latestOpen = [...openBugs].sort((a, b) => b.date.localeCompare(a.date) || b.stt - a.stt)[0];

  const filteredBugs = bugs
    .filter((bug) => skillFilter === "all" || bug.skill === skillFilter)
    .filter((bug) => statusFilter === "all" || statusOf(bug) === statusFilter)
    .filter((bug) => [bug.id, bug.original, bug.cause, bug.fix, bug.example].join(" ").toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (statusOf(a) !== statusOf(b)) return statusOf(a) === "OPEN" ? -1 : 1;
      return b.date.localeCompare(a.date) || b.stt - a.stt;
    });

  const journal = [...sessions]
    .filter((session) => journalFilter === "all" || session.status === journalFilter)
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));

  const nextSession = [...sessions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .find((session) => session.status === "planned" && session.date >= todayISO());

  async function saveDeadline(deadline: string) {
    if (!user || !cloudData) return;
    setCloudData({ ...cloudData, goals: { ...cloudData.goals, deadline } });
    try {
      await updateGoals(user.id, { deadline });
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "Không thể lưu ngày thi.");
      await refreshDashboard(user.id);
    }
  }

  async function toggleBug(bug: Bug) {
    const next: BugStatus = statusOf(bug) === "OPEN" ? "DONE" : "OPEN";
    try {
      await setBugStatus(bug.key, next);
      setCloudData((current) => current ? {
        ...current,
        bugs: current.bugs.map((item) => item.key === bug.key ? { ...item, status: next } : item),
      } : current);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "Không thể cập nhật lỗi.");
    }
  }

  async function saveSession(payload: Omit<StudySession, "id" | "createdAt" | "updatedAt">, existing?: StudySession) {
    if (!user) return;
    try {
      const saved = await saveSessionRecord(user.id, payload, existing?.id, cloudData?.activePlanId);
      setCloudData((current) => current ? {
        ...current,
        sessions: existing
          ? current.sessions.map((item) => item.id === existing.id ? saved : item)
          : [...current.sessions, saved],
      } : current);
      setSessionModal(null);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "Không thể lưu buổi học.");
    }
  }

  async function toggleSession(session: StudySession) {
    const status: SessionStatus = session.status === "completed" ? "planned" : "completed";
    try {
      await setSessionStatus(session.id, status);
      setCloudData((current) => current ? {
        ...current,
        sessions: current.sessions.map((item) => item.id === session.id ? { ...item, status } : item),
      } : current);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "Không thể cập nhật buổi học.");
    }
  }

  async function deleteSession(session: StudySession) {
    if (!window.confirm(`Xóa buổi học “${session.title}”?`)) return;
    try {
      await deleteSessionRecord(session.id);
      setCloudData((current) => current ? {
        ...current,
        sessions: current.sessions.filter((item) => item.id !== session.id),
      } : current);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "Không thể xóa buổi học.");
    }
  }

  async function saveBug(payload: Omit<Bug, "stt" | "custom" | "key">, existing?: Bug) {
    if (!user) return "Bạn cần đăng nhập.";
    const customCount = bugs.filter((bug) => bug.custom).length;
    const code = payload.id || `${payload.skill === "Grammar / Vocab" ? "GRAM" : payload.skill.slice(0, 5).toUpperCase()}_CUSTOM_${customCount + 1}`;
    if (bugs.some((bug) => bug.id === code && bug.key !== existing?.key)) return "Mã lỗi đã tồn tại.";
    try {
      const saved = await saveBugRecord(user.id, { ...payload, id: code }, existing?.key, cloudData?.activePlanId);
      setCloudData((current) => current ? {
        ...current,
        bugs: existing
          ? current.bugs.map((bug) => bug.key === existing.key ? saved : bug)
          : [...current.bugs, saved],
      } : current);
      setBugModal(null);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Không thể lưu lỗi.";
    }
  }

  async function deleteBug(bug: Bug) {
    if (!bug.custom) return;
    if (!window.confirm(`Xóa lỗi ${bug.id}?`)) return;
    try {
      await deleteBugRecord(bug.key);
      setCloudData((current) => current ? {
        ...current,
        bugs: current.bugs.filter((item) => item.key !== bug.key),
      } : current);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "Không thể xóa lỗi.");
    }
  }

  async function toggleExercise(exerciseId: string, completed: boolean) {
    if (!user) return;
    try {
      await setExerciseProgress(user.id, exerciseId, completed);
      setCloudData((current) => current ? {
        ...current,
        exercises: current.exercises.map((exercise) => exercise.id === exerciseId ? { ...exercise, completed } : exercise),
      } : current);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "Không thể cập nhật bài tập.");
    }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setCloudData(null);
  }

  if (!isSupabaseConfigured) return <SupabaseConfigurationRequired/>;
  if (!authReady) return <LoadingScreen label="Đang kiểm tra đăng nhập…"/>;
  if (!user) return <AuthScreen/>;
  if (recoveringPassword) return <PasswordRecoveryScreen onDone={() => setRecoveringPassword(false)}/>;
  if (loadingData && !cloudData) return <LoadingScreen label="Đang đồng bộ dữ liệu Supabase…"/>;
  if (!cloudData) return <LoadingScreen label={appError || "Chưa thể tải dữ liệu."} retry={() => void refreshDashboard(user.id)}/>;

  const latestTest = tests.find((test) => test.listeningRaw !== null || test.readingRaw !== null || test.overall !== null);
  const latestRawScore = latestTest?.listeningRaw ?? latestTest?.readingRaw;

  function theoryFor(bug: Bug) {
    return cloudData?.theory[theoryKey(bug)] || {
      label: "Ghi chú cá nhân",
      tip: bug.example || "Chưa có ghi chú lý thuyết.",
      source: "IELTS Lab",
    };
  }

  return (
    <div className="shell">
      <header className="topbar">
        <button className="brand" onClick={() => setTab("overview")}><span>IL</span><b>IELTS LAB<small>PERSONAL DASHBOARD</small></b></button>
        <nav>
          {(["overview", "sprint", "planner", "content", "bugs", "journey"] as Tab[]).map((item) => (
            <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
              {item === "overview" ? "Tổng quan" : item === "sprint" ? "Sprint" : item === "planner" ? "Lộ trình" : item === "content" ? "Nội dung" : item === "bugs" ? "Sổ lỗi" : "Hành trình"}{item === "bugs" && <i>{openBugs.length}</i>}
            </button>
          ))}
        </nav>
        <aside className="top-actions"><StudyReminderCenter userId={user.id} onOpenPlanner={() => setTab("planner")}/><button className="outline" onClick={() => setShowSources(true)}>↻ <span>Nguồn dữ liệu</span></button><button className="outline sign-out" onClick={() => void signOut()}>Đăng xuất</button></aside>
      </header>

      {appError && <div className="status-banner" role="alert"><span>{appError}</span><button onClick={() => setAppError("")}>×</button></div>}

      {tab === "overview" && (
        <main>
          <section className="hero">
            <div><p className="eyebrow">IELTS STUDY SYSTEM · 30–60 PHÚT/NGÀY</p><h1>Small sessions.<br/><em>Visible progress.</em></h1><p>Mỗi lỗi là một tín hiệu. Mỗi buổi học ngắn là một bước gần hơn tới Band 6.5–7.5.</p></div>
            <div className="data-ready"><i/><span><b>Đã đồng bộ với Supabase</b><small>{user.email || "Tài khoản IELTS Lab"} · Snapshot {formatDate(DASHBOARD_DATA.generatedAt.slice(0, 10))}</small></span></div>
          </section>

          <section className="goal-grid">
            <article className="goal-card dark"><label>MỤC TIÊU BAND</label><strong>{goals.targetBand.toFixed(1)} <i>→ {goals.stretchBand.toFixed(1)}</i></strong><p>Mục tiêu gần · Mục tiêu mở rộng</p></article>
            <article className="goal-card"><label>BAND HIỆN TẠI</label><strong>{goals.currentBand.toFixed(1)}</strong><div className="track"><i style={{ width: `${Math.min(100, ((goals.currentBand - 4) / Math.max(.5, goals.targetBand - 4)) * 100)}%` }}/></div><p>Ước tính từ dữ liệu nền tảng</p></article>
            <article className="goal-card"><label>TIẾN ĐỘ HỌC</label><strong>{learningRate.toFixed(1)}%</strong><div className="track gold"><i style={{ width: `${learningRate}%` }}/></div><p>{completedTotal}/{goals.targetSessions} buổi hoàn thành</p></article>
            <article className="goal-card"><label>NGÀY THI DỰ KIẾN</label><input type="date" value={goals.deadline} onChange={(event) => void saveDeadline(event.target.value)}/><p>Lưu trên Supabase</p></article>
          </section>

          <section className="quick-actions">
            <div><i/><span><b>{nextSession ? `${formatDate(nextSession.date)} · ${nextSession.title}` : "Chưa có lịch học cá nhân"}</b><small>{nextSession ? `${SKILL_LABEL[nextSession.skill]} · ${nextSession.duration} phút` : "Lên lịch hoặc ghi lại buổi học hôm nay."}</small></span></div>
            <aside><button onClick={() => setSessionModal({ status: "planned" })}>＋ Lên lịch</button><button onClick={() => setSessionModal({ status: "completed" })}>＋ Ghi nhật ký</button><button className="accent" onClick={() => setBugModal("new")}>＋ Thêm lỗi</button></aside>
          </section>

          <section className="overview-grid">
            <article className="practice-card">
              <div className="card-top"><span>✦ GỢI Ý HÔM NAY</span><i>30 phút</i></div>
              <h2>{SKILL_LABEL[prioritySkill]}: vá lỗi ưu tiên</h2><p>{openBySkill[prioritySkill]} lỗi đang OPEN — nhiều nhất trong sổ lỗi hiện tại.</p>
              <div className="steps"><span><b>05&apos;</b>Recall</span><span><b>15&apos;</b>Apply</span><span><b>10&apos;</b>Refactor</span></div>
              <div className="exercises">
                {exercises.map((exercise) => <label key={exercise.id}><input type="checkbox" checked={exercise.completed} onChange={() => void toggleExercise(exercise.id, !exercise.completed)}/><span><b>{exercise.prompt}</b><small>Gợi ý: {exercise.hint} · Đáp án: {exercise.answer}</small></span></label>)}
              </div>
            </article>
            <article className="health-card">
              <div className="card-top"><span>SỨC KHỎE SỔ LỖI</span><button onClick={() => setTab("bugs")}>Xem tất cả →</button></div>
              <div className="donut-row"><div className="donut" style={{ background: `conic-gradient(#174b3c 0 ${fixedRate}%, #e5ae43 ${fixedRate}% 100%)` }}><span><b>{fixedRate}%</b><small>đã sửa</small></span></div><div><p><i className="done"/>DONE <b>{doneCount}</b></p><p><i className="open"/>OPEN <b>{openBugs.length}</b></p></div></div>
              <SkillBars values={openBySkill}/>
            </article>
          </section>
        </main>
      )}

      {tab === "planner" && <LearningPlanner userId={user.id}/>}

      {tab === "sprint" && <WeeklySprint userId={user.id}/>}

      {tab === "content" && <ContentHub userId={user.id}/>}

      {tab === "bugs" && (
        <main>
          <section className="page-head"><div><p className="eyebrow">IELTS BUG TRACKER</p><h1>Sổ lỗi cá nhân</h1><p>Tìm nguyên nhân, sửa đúng và luyện lại có chủ đích.</p></div><aside><button className="primary" onClick={() => setBugModal("new")}>＋ Thêm lỗi mới</button><b>{openBugs.length}<small>lỗi đang mở</small></b></aside></section>
          <section className="insight-grid"><article><div className="mini-donut" style={{ background: `conic-gradient(#174b3c 0 ${fixedRate}%, #e5ae43 ${fixedRate}% 100%)` }}><b>{fixedRate}%</b></div><span><small>Tỷ lệ đã sửa</small><b>{doneCount}/{bugs.length} lỗi</b></span></article><article><small>PHÂN BỐ THEO KỸ NĂNG</small><SkillBars values={allBySkill}/></article><article className="priority"><small>ƯU TIÊN GẦN NHẤT</small><b>{latestOpen?.id}</b><p>{latestOpen?.cause}</p></article></section>
          <section className="tracker">
            <div className="toolbar"><div>{["all", ...BUG_SKILLS].map((skill) => <button key={skill} className={skillFilter === skill ? "active" : ""} onClick={() => { setSkillFilter(skill); setBugLimit(15); }}>{skill === "all" ? "Tất cả" : SKILL_LABEL[skill as Skill]}</button>)}</div><aside><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm mã lỗi, nguyên nhân…"/><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Mọi trạng thái</option><option>OPEN</option><option>DONE</option></select></aside></div>
            <div className="bug-list">
              {filteredBugs.slice(0, bugLimit).map((bug) => {
                const theory = theoryFor(bug);
                return <article className="bug-row" key={bug.custom ? bug.key : bug.id}><div className="bug-name"><i>{bug.skill === "Grammar / Vocab" ? "GV" : bug.skill[0]}</i><span><b>{bug.id}</b><small>{formatDate(bug.date)} · {SKILL_LABEL[bug.skill]}</small>{bug.custom && <em>TỰ THÊM</em>}</span></div><div className="bug-diff"><p>{bug.cause}</p><span><s>{bug.original}</s> → <b>{bug.fix}</b></span></div><div className="theory"><b>{theory.label}</b><p>{theory.tip}</p><small>{theory.source}</small></div><div className="row-actions"><button className={statusOf(bug).toLowerCase()} onClick={() => toggleBug(bug)}>● {statusOf(bug)}</button>{bug.custom && <><button onClick={() => setBugModal(bug)}>Sửa</button><button className="delete" onClick={() => deleteBug(bug)}>Xóa</button></>}</div></article>;
              })}
              {!filteredBugs.length && <div className="empty">Không có lỗi phù hợp với bộ lọc.</div>}
            </div>
            {bugLimit < filteredBugs.length && <button className="load-more" onClick={() => setBugLimit((value) => value + 15)}>Xem thêm · {filteredBugs.length - bugLimit} lỗi</button>}
          </section>
        </main>
      )}

      {tab === "journey" && (
        <main>
          <section className="page-head"><div><p className="eyebrow">LEARNING JOURNEY</p><h1>Hành trình học tập</h1><p>Lịch cá nhân, ghi chú và tiến độ 24 tuần.</p></div><aside><b>{completedTotal}<small>/{goals.targetSessions} buổi hoàn thành</small></b></aside></section>
          <section className="journal-panel">
            <div className="journal-head"><div><p className="eyebrow">LỊCH & NHẬT KÝ CÁ NHÂN</p><h2>Buổi học của bạn</h2><p>Lên lịch trước, ghi chú sau buổi học và đánh dấu hoàn thành.</p></div><aside><button onClick={() => setSessionModal({ status: "planned" })}>＋ Lên lịch</button><button className="primary" onClick={() => setSessionModal({ status: "completed" })}>＋ Ghi buổi học</button></aside></div>
            <div className="journal-filter"><span><b>{sessions.filter((item) => item.status === "planned").length}</b> đã lên lịch</span><span><b>{localCompleted}</b> đã hoàn thành</span><select value={journalFilter} onChange={(event) => setJournalFilter(event.target.value)}><option value="all">Tất cả</option><option value="planned">Đã lên lịch</option><option value="completed">Đã hoàn thành</option></select></div>
            <div className="journal-list">{journal.map((session) => <article key={session.id}><time><b>{session.date.slice(8)}</b>THÁNG {Number(session.date.slice(5,7))}</time><div><small>{SKILL_LABEL[session.skill]} · {session.duration} PHÚT · {session.status === "completed" ? "HOÀN THÀNH" : "ĐÃ LÊN LỊCH"}</small><b>{session.title}</b><p>{session.note || "Chưa có ghi chú."}</p></div><aside><button onClick={() => toggleSession(session)}>{session.status === "completed" ? "Mở lại" : "Hoàn thành"}</button><button onClick={() => setSessionModal({ status: session.status, session })}>Sửa</button><button className="delete" onClick={() => deleteSession(session)}>Xóa</button></aside></article>)}{!journal.length && <div className="empty">Chưa có buổi học cá nhân.</div>}</div>
          </section>
          <section className="journey-grid"><article><div className="card-top"><span>TIẾN ĐỘ TRÊN SUPABASE</span><i>{weeks.length} tuần</i></div><div className="weeks">{weeks.map((week) => <div key={week.week}><b>{week.week.replace("Tuần ", "W")}</b><span><strong>{week.month} · {week.completed}/{week.total} buổi</strong><i><em style={{ width: `${(week.completed / week.total) * 100}%` }}/></i></span><small>{week.completedMinutes} phút</small></div>)}</div></article><article><div className="card-top"><span>KẾT QUẢ LUYỆN ĐỀ</span><i>Supabase</i></div><div className="score"><b>{latestRawScore ?? "—"}{latestRawScore !== null && latestRawScore !== undefined && <small>/40</small>}</b><span>{latestTest ? `${latestTest.type} · ${latestTest.label}` : "Chưa có kết quả"}</span></div><p className="notice">{latestTest?.conclusion || "Thêm kết quả luyện đề để theo dõi tiến bộ."}</p></article></section>
        </main>
      )}

      <footer><b>IELTS LAB</b><span>Small sessions. Visible progress.</span><span>Dữ liệu được bảo vệ bởi Supabase RLS</span></footer>

      {sessionModal && <SessionModal initial={sessionModal.session} status={sessionModal.status} onClose={() => setSessionModal(null)} onSave={saveSession}/>} 
      {bugModal && <BugModal initial={bugModal === "new" ? undefined : bugModal} onClose={() => setBugModal(null)} onSave={saveBug}/>} 
      {showSources && <SourceModal sources={cloudData.sources} onClose={() => setShowSources(false)}/>} 
    </div>
  );
}

function SkillBars({ values }: { values: Record<string, number> }) {
  const max = Math.max(1, ...Object.values(values));
  return <div className="skill-bars">{BUG_SKILLS.map((skill) => <div key={skill}><span>{SKILL_LABEL[skill]}</span><i><em style={{ width: `${(values[skill] / max) * 100}%` }}/></i><b>{values[skill]}</b></div>)}</div>;
}

function SessionModal({ initial, status, onClose, onSave }: { initial?: StudySession; status: SessionStatus; onClose: () => void; onSave: (payload: Omit<StudySession, "id" | "createdAt" | "updatedAt">, existing?: StudySession) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    await onSave({ date: String(form.get("date")), skill: String(form.get("skill")) as Skill, duration: Number(form.get("duration")), status: String(form.get("status")) as SessionStatus, title: String(form.get("title")).trim(), note: String(form.get("note")).trim() }, initial);
    setSaving(false);
  }
  return <Modal onClose={onClose}><form onSubmit={submit}><header><div><small>{status === "completed" ? "NHẬT KÝ HỌC TẬP" : "LỊCH HỌC CÁ NHÂN"}</small><h2>{initial ? "Chỉnh sửa buổi học" : status === "completed" ? "Ghi nhật ký buổi học" : "Lên lịch buổi học"}</h2></div><button type="button" onClick={onClose}>×</button></header><div className="form-grid"><label>Ngày học<input name="date" type="date" required defaultValue={initial?.date || todayISO()}/></label><label>Kỹ năng<select name="skill" defaultValue={initial?.skill || "Listening"}>{ALL_SKILLS.map((skill) => <option key={skill}>{skill}</option>)}</select></label><label>Thời lượng<select name="duration" defaultValue={initial?.duration || 30}>{[30,45,60,90,120].map((value) => <option key={value} value={value}>{value} phút</option>)}</select></label><label>Trạng thái<select name="status" defaultValue={initial?.status || status}><option value="planned">Đã lên lịch</option><option value="completed">Đã hoàn thành</option></select></label><label className="wide">Nội dung / mục tiêu<input name="title" required maxLength={120} defaultValue={initial?.title}/></label><label className="wide">Ghi chú<textarea name="note" rows={4} maxLength={600} defaultValue={initial?.note}/></label></div><button className="primary submit" type="submit" disabled={saving}>{saving ? "Đang lưu…" : "Lưu buổi học"}</button></form></Modal>;
}

function BugModal({ initial, onClose, onSave }: { initial?: Bug; onClose: () => void; onSave: (payload: Omit<Bug, "stt" | "custom" | "key">, existing?: Bug) => Promise<string | null> }) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    const result = await onSave({ date: String(form.get("date")), skill: String(form.get("skill")) as Bug["skill"], id: String(form.get("code")).trim().toUpperCase().replace(/\s+/g, "_"), original: String(form.get("original")).trim(), cause: String(form.get("cause")).trim(), fix: String(form.get("fix")).trim(), example: String(form.get("example")).trim(), status: String(form.get("status")) as BugStatus }, initial);
    setSaving(false);
    if (result) setError(result);
  }
  return <Modal onClose={onClose}><form onSubmit={submit}><header><div><small>IELTS BUG TRACKER</small><h2>{initial ? "Chỉnh sửa lỗi" : "Thêm lỗi mới"}</h2></div><button type="button" onClick={onClose}>×</button></header><div className="form-grid"><label>Ngày phát hiện<input name="date" type="date" required defaultValue={initial?.date || todayISO()}/></label><label>Kỹ năng<select name="skill" defaultValue={initial?.skill || "Listening"}>{BUG_SKILLS.map((skill) => <option key={skill}>{skill}</option>)}</select></label><label>Mã lỗi<input name="code" defaultValue={initial?.id} placeholder="Tự tạo nếu để trống"/></label><label>Trạng thái<select name="status" defaultValue={initial?.status || "OPEN"}><option>OPEN</option><option>DONE</option></select></label><label className="wide">Mô tả lỗi gốc<input name="original" required defaultValue={initial?.original}/></label><label className="wide">Nguyên nhân sai<textarea name="cause" rows={3} required defaultValue={initial?.cause}/></label><label className="wide">Bản sửa chuẩn<input name="fix" required defaultValue={initial?.fix}/></label><label className="wide">Ví dụ / ghi chú<textarea name="example" rows={3} defaultValue={initial?.example}/></label></div>{error && <p className="form-error">{error}</p>}<button className="primary submit" type="submit" disabled={saving}>{saving ? "Đang lưu…" : "Lưu vào sổ lỗi"}</button></form></Modal>;
}

function SourceModal({ sources, onClose }: { sources: Record<string, { title: string; url: string }>; onClose: () => void }) {
  return <Modal onClose={onClose}><div><header><div><small>ĐỒNG BỘ SUPABASE</small><h2>Nguồn dữ liệu</h2></div><button onClick={onClose}>×</button></header><p className="modal-copy">Snapshot ban đầu và các thao tác mới được lưu riêng theo tài khoản trên Supabase. Google Sheet chỉ còn là nguồn tham khảo.</p><div className="sources">{Object.values(sources).map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.title}><b>{source.title}</b><span>Mở nguồn ↗</span></a>)}</div><button className="primary submit" onClick={onClose}>Đã hiểu</button></div></Modal>;
}

function SupabaseConfigurationRequired() {
  return <main className="auth-shell"><section className="auth-card"><span className="auth-mark">IL</span><p className="eyebrow">SUPABASE CONFIGURATION</p><h1>Thiếu biến môi trường</h1><p>Mở <code>.env.local</code> và thay hai placeholder bằng Project URL cùng Publishable Key của Supabase, sau đó khởi động lại ứng dụng.</p><pre>NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co{"\n"}NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...</pre></section></main>;
}

function LoadingScreen({ label, retry }: { label: string; retry?: () => void }) {
  return <main className="auth-shell"><section className="auth-card loading-card"><span className="loading-dot"/><h1>{label}</h1>{retry && <button className="primary" onClick={retry}>Thử lại</button>}</section></main>;
}

function AuthScreen() {
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email")).trim();
    const password = String(form.get("password") ?? "");
    setSubmitting(true);
    setError("");
    setMessage("");
    if (mode === "forgot") {
      const result = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      setSubmitting(false);
      if (result.error) setError(result.error.message);
      else setMessage("Đã gửi liên kết đặt lại mật khẩu. Hãy kiểm tra hộp thư và thư rác.");
      return;
    }
    const result = mode === "signin" ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password });
    setSubmitting(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    if (mode === "signup" && !result.data.session) {
      setMessage("Đã tạo tài khoản. Hãy kiểm tra email để xác nhận đăng ký.");
    }
  }

  return <main className="auth-shell"><section className="auth-card"><span className="auth-mark">IL</span><p className="eyebrow">IELTS LAB · SUPABASE</p><h1>{mode === "signin" ? "Đăng nhập" : mode === "signup" ? "Tạo tài khoản" : "Quên mật khẩu"}</h1><p>{mode === "forgot" ? "Nhập email để nhận liên kết đặt lại mật khẩu." : "Dữ liệu học tập được đồng bộ riêng tư theo tài khoản của bạn."}</p><form onSubmit={submit}><label>Email<input name="email" type="email" autoComplete="email" required/></label>{mode !== "forgot" && <label>Mật khẩu<input name="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={6} required/></label>}{error && <p className="form-error">{error}</p>}{message && <p className="form-success">{message}</p>}<button className="primary" type="submit" disabled={submitting}>{submitting ? "Đang xử lý…" : mode === "signin" ? "Đăng nhập" : mode === "signup" ? "Đăng ký" : "Gửi liên kết đặt lại"}</button></form>{mode === "signin" && <button className="auth-switch" onClick={() => { setMode("forgot"); setError(""); setMessage(""); }}>Quên mật khẩu?</button>}<button className="auth-switch" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setMessage(""); }}>{mode === "signin" ? "Chưa có tài khoản? Đăng ký" : "Quay lại đăng nhập"}</button></section></main>;
}

function PasswordRecoveryScreen({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));
    const confirmation = String(form.get("confirmation"));
    if (password !== confirmation) { setError("Hai mật khẩu chưa khớp."); return; }
    setSaving(true); setError("");
    const result = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (result.error) setError(result.error.message);
    else onDone();
  }
  return <main className="auth-shell"><section className="auth-card"><span className="auth-mark">IL</span><p className="eyebrow">PASSWORD RECOVERY</p><h1>Đặt mật khẩu mới</h1><form onSubmit={submit}><label>Mật khẩu mới<input name="password" type="password" autoComplete="new-password" minLength={6} required/></label><label>Nhập lại mật khẩu<input name="confirmation" type="password" autoComplete="new-password" minLength={6} required/></label>{error && <p className="form-error">{error}</p>}<button className="primary" disabled={saving}>{saving ? "Đang cập nhật…" : "Cập nhật mật khẩu"}</button></form></section></main>;
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="modal-card">{children}</div></div>;
}
