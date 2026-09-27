import { getSupabase } from "@/lib/supabase/client";
import type { LearningPlan, PlanPhase, PlanResource } from "@/lib/supabase/planner";

export type SprintStatus = "PLANNED" | "IN_PROGRESS" | "REVIEW" | "COMPLETED";
export type SessionWorkflowStatus = "TODO" | "LEARNING" | "PRACTICING" | "REVIEWING" | "DONE";
export type TaskWorkflow = "STANDARD" | "LISTENING_PREDICTION" | "READING_EVIDENCE" | "SENTENCE_COMPLETION" | "WRITING_AREA" | "SPEAKING_CUE_CARD";

export type WeekSprint = {
  id: string; planId: string; weekNumber: number; startDate: string; endDate: string;
  title: string; objective: string; skillTargets: Record<string, number>; status: SprintStatus;
};

export type LearningSourceMapping = {
  id: string; planId: string; resourceId: string; documentTitle: string; unit: string; section: string;
  pageFrom: number | null; pageTo: number | null; audioTrack: string; scriptPage: number | null;
  exerciseFrom: string; exerciseTo: string; sourceUrl: string; notes: string;
};

export type SprintSession = {
  id: string; planId: string; weekSprintId: string; sourceMappingId: string; date: string;
  skill: string; title: string; objective: string; duration: number; targetScore: number | null;
  actualScore: number | null; workflowStatus: SessionWorkflowStatus; startedAt: string;
};

export type StudyTask = {
  id: string; lessonId: string; position: number; taskType: "warmup" | "practice" | "listening" | "reading" | "writing" | "speaking" | "review";
  title: string; instructions: string; question: string; answerType: "text" | "long_text" | "number" | "self_check";
  correctAnswer: string; points: number; metadata: Record<string, unknown>; workflowType: TaskWorkflow; workflowConfig: Record<string, unknown>;
};

export type TaskAttempt = {
  id: string; taskId: string; attemptNumber: number; userAnswer: string; isCorrect: boolean | null;
  score: number; feedback: string; evidence: string; submittedAt: string; structuredResponse: Record<string, string>;
  audioPath: string; audioDuration: number | null;
};

export type SessionResult = {
  id: string; lessonId: string; duration: number; total: number; correct: number; wrong: number;
  score: number | null; newBugs: number; notes: string; completedAt: string;
};

export type SprintWorkspace = {
  plan: LearningPlan | null; phases: PlanPhase[]; sprints: WeekSprint[]; sprint: WeekSprint | null;
  sessions: SprintSession[]; sources: LearningSourceMapping[]; tasks: StudyTask[];
  attempts: TaskAttempt[]; results: SessionResult[]; materials: PlanResource[];
};

function throwIfError(error: { message: string } | null) { if (error) throw new Error(error.message); }
function mapPlan(row: Record<string, any>): LearningPlan { return { id: row.id, title: row.title, description: row.description, startDate: row.start_date, endDate: row.end_date, examDate: row.exam_date || "", currentBand: Number(row.current_band), targetBand: Number(row.target_band), weeklyMinutes: row.weekly_minutes, studyDays: row.study_days, status: row.status }; }
function mapPhase(row: Record<string, any>): PlanPhase { return { id: row.id, planId: row.plan_id, title: row.title, description: row.description, startDate: row.start_date, endDate: row.end_date, position: row.position, status: row.status }; }
function mapSprint(row: Record<string, any>): WeekSprint { return { id: row.id, planId: row.plan_id, weekNumber: row.week_number, startDate: row.start_date, endDate: row.end_date, title: row.title, objective: row.objective, skillTargets: row.skill_targets ?? {}, status: row.status }; }
function mapSource(row: Record<string, any>): LearningSourceMapping { return { id: row.id, planId: row.plan_id, resourceId: row.resource_id || "", documentTitle: row.document_title, unit: row.unit, section: row.section, pageFrom: row.page_from, pageTo: row.page_to, audioTrack: row.audio_track, scriptPage: row.script_page, exerciseFrom: row.exercise_from, exerciseTo: row.exercise_to, sourceUrl: row.source_url || "", notes: row.notes }; }
function mapMaterial(row: Record<string, any>): PlanResource { return { id: row.id, planId: row.plan_id, key: row.resource_key, title: row.title, url: row.url, type: row.resource_type, description: row.description, primary: row.is_primary, storagePath: row.storage_path || "", mimeType: row.mime_type || "", fileSize: row.file_size ?? null, provider: row.source_provider ?? (row.storage_path ? "LOCAL_STORAGE" : "EXTERNAL_LINK"), externalFileId: row.external_file_id || "", originalFilename: row.original_filename || "", previewUrl: row.preview_url || "", folder: row.folder_name || "Chưa phân loại", tags: row.tags ?? [], skills: row.skills ?? [], accessStatus: row.access_status ?? "READY", favorite: Boolean(row.is_favorite), lastOpenedAt: row.last_opened_at || "", createdAt: row.created_at }; }
function mapSession(row: Record<string, any>): SprintSession { return { id: row.id, planId: row.plan_id, weekSprintId: row.week_sprint_id || "", sourceMappingId: row.source_mapping_id || "", date: row.lesson_date, skill: row.skill, title: row.title, objective: row.objective, duration: row.duration_minutes, targetScore: row.target_score === null ? null : Number(row.target_score), actualScore: row.actual_score === null ? null : Number(row.actual_score), workflowStatus: row.workflow_status, startedAt: row.started_at || "" }; }
function mapTask(row: Record<string, any>): StudyTask { return { id: row.id, lessonId: row.lesson_id, position: row.position, taskType: row.task_type, title: row.title, instructions: row.instructions, question: row.question, answerType: row.answer_type, correctAnswer: row.correct_answer, points: Number(row.points), metadata: row.metadata ?? {}, workflowType: row.workflow_type ?? "STANDARD", workflowConfig: row.workflow_config ?? {} }; }
function mapAttempt(row: Record<string, any>): TaskAttempt { return { id: row.id, taskId: row.task_id, attemptNumber: row.attempt_number, userAnswer: row.user_answer, isCorrect: row.is_correct, score: Number(row.score), feedback: row.feedback, evidence: row.evidence, submittedAt: row.submitted_at, structuredResponse: row.structured_response ?? {}, audioPath: row.audio_path || "", audioDuration: row.audio_duration_seconds }; }
function mapResult(row: Record<string, any>): SessionResult { return { id: row.id, lessonId: row.lesson_id, duration: row.duration_minutes, total: row.total_questions, correct: row.correct_answers, wrong: row.wrong_answers, score: row.score_percent === null ? null : Number(row.score_percent), newBugs: row.new_bugs, notes: row.notes, completedAt: row.completed_at }; }

export async function loadSprintWorkspace(selectedSprintId?: string): Promise<SprintWorkspace> {
  const client = getSupabase();
  const plansResult = await client.from("learning_plans").select("*").order("created_at", { ascending: false });
  throwIfError(plansResult.error);
  const planRows = plansResult.data ?? [];
  const planRow = planRows.find((row) => row.status === "active") ?? planRows[0];
  if (!planRow) return { plan: null, phases: [], sprints: [], sprint: null, sessions: [], sources: [], tasks: [], attempts: [], results: [], materials: [] };
  const plan = mapPlan(planRow);
  const [phasesResult, sprintsResult, sourcesResult, materialsResult] = await Promise.all([
    client.from("plan_phases").select("*").eq("plan_id", plan.id).order("position"),
    client.from("week_sprints").select("*").eq("plan_id", plan.id).order("start_date", { ascending: false }),
    client.from("learning_source_mappings").select("*").eq("plan_id", plan.id).order("document_title"),
    client.from("learning_resources").select("*").eq("plan_id", plan.id).neq("access_status", "ARCHIVED").order("title"),
  ]);
  [phasesResult, sprintsResult, sourcesResult, materialsResult].forEach((result) => throwIfError(result.error));
  const materials = await Promise.all((materialsResult.data ?? []).map(async (row) => { const material = mapMaterial(row); if (!material.storagePath) return material; const signed = await client.storage.from("learning-materials").createSignedUrl(material.storagePath, 3600); return { ...material, url: signed.data?.signedUrl || "", previewUrl: signed.data?.signedUrl || "" }; }));
  const sources = (sourcesResult.data ?? []).map(mapSource).map((source) => { const material = materials.find((item) => item.id === source.resourceId); return material ? { ...source, documentTitle: source.documentTitle || material.title, sourceUrl: source.sourceUrl || material.previewUrl || material.url } : source; });
  const sprints = (sprintsResult.data ?? []).map(mapSprint);
  const today = new Date().toISOString().slice(0, 10);
  const sprint = sprints.find((item) => item.id === selectedSprintId)
    ?? sprints.find((item) => today >= item.startDate && today <= item.endDate)
    ?? sprints.find((item) => item.status !== "COMPLETED") ?? sprints[0] ?? null;
  if (!sprint) return { plan, phases: (phasesResult.data ?? []).map(mapPhase), sprints, sprint: null, sessions: [], sources, tasks: [], attempts: [], results: [], materials };
  const sessionsResult = await client.from("daily_lessons").select("*").eq("week_sprint_id", sprint.id).order("lesson_date");
  throwIfError(sessionsResult.error);
  const sessions = (sessionsResult.data ?? []).map(mapSession);
  const lessonIds = sessions.map((item) => item.id);
  if (!lessonIds.length) return { plan, phases: (phasesResult.data ?? []).map(mapPhase), sprints, sprint, sessions, sources, tasks: [], attempts: [], results: [], materials };
  const [tasksResult, resultsResult] = await Promise.all([
    client.from("study_tasks").select("*").in("lesson_id", lessonIds).order("position"),
    client.from("session_results").select("*").in("lesson_id", lessonIds),
  ]);
  [tasksResult, resultsResult].forEach((result) => throwIfError(result.error));
  const tasks = (tasksResult.data ?? []).map(mapTask);
  const taskIds = tasks.map((item) => item.id);
  let attempts: TaskAttempt[] = [];
  if (taskIds.length) {
    const attemptsResult = await client.from("task_attempts").select("*").in("task_id", taskIds).order("attempt_number");
    throwIfError(attemptsResult.error);
    attempts = (attemptsResult.data ?? []).map(mapAttempt);
  }
  return { plan, phases: (phasesResult.data ?? []).map(mapPhase), sprints, sprint, sessions, sources, tasks, attempts, results: (resultsResult.data ?? []).map(mapResult), materials };
}

function iso(date: Date) { return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
const SKILL_BY_DAY: Record<number, string> = { 1: "Listening", 2: "Reading", 3: "Writing", 4: "Speaking", 5: "Grammar / Vocab", 6: "Review", 0: "Review" };

export async function createWeekSprint(userId: string, plan: LearningPlan, phases: PlanPhase[], input: { startDate: string; title: string; objective: string; targets: Record<string, number> }) {
  const client = getSupabase();
  const latest = await client.from("week_sprints").select("week_number").eq("plan_id", plan.id).order("week_number", { ascending: false }).limit(1).maybeSingle();
  throwIfError(latest.error);
  const weekNumber = (latest.data?.week_number ?? 0) + 1;
  const start = new Date(`${input.startDate}T12:00:00`); const end = new Date(start); end.setDate(end.getDate() + 6);
  const sprintInsert = await client.from("week_sprints").insert({ user_id: userId, plan_id: plan.id, week_number: weekNumber, start_date: input.startDate, end_date: iso(end), title: input.title || `Week ${weekNumber}`, objective: input.objective, skill_targets: input.targets, status: "PLANNED" }).select().single();
  throwIfError(sprintInsert.error);
  const sprint = mapSprint(sprintInsert.data);
  const sessions = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(start); date.setDate(start.getDate() + offset);
    if (!plan.studyDays.includes(date.getDay())) continue;
    const dateValue = iso(date); const skill = SKILL_BY_DAY[date.getDay()] ?? "Review";
    const phase = phases.find((item) => dateValue >= item.startDate && dateValue <= item.endDate);
    sessions.push({ user_id: userId, plan_id: plan.id, phase_id: phase?.id ?? null, week_sprint_id: sprint.id, lesson_date: dateValue, title: `${skill} · Week ${weekNumber}`, description: input.objective, objective: `Hoàn thành phiên ${skill} theo mục tiêu tuần.`, skill, duration_minutes: Math.max(15, Math.round(plan.weeklyMinutes / Math.max(1, plan.studyDays.length))), priority: "medium", status: "todo", workflow_status: "TODO", target_score: input.targets[skill] ?? null, generation_source: "automatic", source_key: `sprint-${sprint.id}-${dateValue}` });
  }
  if (sessions.length) {
    const inserted = await client.from("daily_lessons").insert(sessions);
    if (inserted.error) {
      await client.from("week_sprints").delete().eq("id", sprint.id);
      throwIfError(inserted.error);
    }
  }
  return sprint;
}

export async function saveSourceMapping(userId: string, planId: string, input: Omit<LearningSourceMapping, "id" | "planId">, id?: string) {
  const client = getSupabase(); const payload = { user_id: userId, plan_id: planId, resource_id: input.resourceId || null, document_title: input.documentTitle, unit: input.unit, section: input.section, page_from: input.pageFrom, page_to: input.pageTo, audio_track: input.audioTrack, script_page: input.scriptPage, exercise_from: input.exerciseFrom, exercise_to: input.exerciseTo, source_url: input.sourceUrl || null, notes: input.notes };
  const query = id ? client.from("learning_source_mappings").update(payload).eq("id", id) : client.from("learning_source_mappings").insert(payload);
  const { data, error } = await query.select().single(); throwIfError(error); return mapSource(data);
}

export async function assignSourceToSession(sessionId: string, sourceId: string) {
  const { error } = await getSupabase().from("daily_lessons").update({ source_mapping_id: sourceId || null }).eq("id", sessionId); throwIfError(error);
}

type TaskInput = Omit<StudyTask, "id" | "lessonId" | "position" | "metadata" | "workflowConfig"> & { metadata?: Record<string, unknown>; workflowConfig?: Record<string, unknown> };
export async function saveStudyTask(userId: string, lessonId: string, input: TaskInput, position: number, id?: string) {
  const client = getSupabase(); const payload = { user_id: userId, lesson_id: lessonId, position, task_type: input.taskType, title: input.title, instructions: input.instructions, question: input.question, answer_type: input.answerType, correct_answer: input.correctAnswer, points: input.points, metadata: input.metadata ?? {}, workflow_type: input.workflowType, workflow_config: input.workflowConfig ?? {} };
  const query = id ? client.from("study_tasks").update(payload).eq("id", id) : client.from("study_tasks").insert(payload);
  const { data, error } = await query.select().single(); throwIfError(error); return mapTask(data);
}

export async function deleteStudyTask(id: string) { const { error } = await getSupabase().from("study_tasks").delete().eq("id", id); throwIfError(error); }

export async function startSprintSession(sessionId: string, sprintId: string) {
  const client = getSupabase(); const [session, sprint] = await Promise.all([
    client.from("daily_lessons").update({ workflow_status: "LEARNING", status: "in_progress", started_at: new Date().toISOString() }).eq("id", sessionId),
    client.from("week_sprints").update({ status: "IN_PROGRESS" }).eq("id", sprintId).eq("status", "PLANNED"),
  ]); throwIfError(session.error); throwIfError(sprint.error);
}

export async function logTaskStarted(userId: string, sprintId: string, sessionId: string, taskId: string) {
  const { error } = await getSupabase().from("learning_events").insert({ user_id: userId, event_type: "TASK_STARTED", entity_type: "study_task", entity_id: taskId, sprint_id: sprintId, lesson_id: sessionId, payload: {} });
  throwIfError(error);
}

function normalizeAnswer(value: string) { return value.trim().toLocaleLowerCase().replace(/\s+/g, " "); }
export async function submitTaskAttempt(userId: string, task: StudyTask, answer: string, selfCorrect?: boolean, evidence = "", structuredResponse: Record<string, string> = {}) {
  const client = getSupabase(); const latest = await client.from("task_attempts").select("attempt_number").eq("task_id", task.id).order("attempt_number", { ascending: false }).limit(1).maybeSingle(); throwIfError(latest.error);
  const isCorrect = task.answerType === "self_check" ? Boolean(selfCorrect) : normalizeAnswer(answer) === normalizeAnswer(task.correctAnswer);
  const { data, error } = await client.from("task_attempts").insert({ user_id: userId, task_id: task.id, attempt_number: (latest.data?.attempt_number ?? 0) + 1, user_answer: answer, is_correct: isCorrect, score: isCorrect ? task.points : 0, feedback: isCorrect ? "Đáp án đúng." : "Cần phân tích lỗi và thử lại.", evidence, structured_response: structuredResponse }).select().single();
  throwIfError(error); return mapAttempt(data);
}

export async function uploadSpeakingRecording(userId: string, attemptId: string, audio: Blob, durationSeconds: number) {
  const client = getSupabase();
  const contentType = (audio.type || "audio/webm").split(";")[0];
  const extension = contentType.includes("ogg") ? "ogg" : contentType.includes("mp4") ? "m4a" : "webm";
  const path = `${userId}/${attemptId}.${extension}`;
  const upload = await client.storage.from("speaking-recordings").upload(path, audio, { contentType, upsert: true });
  throwIfError(upload.error);
  const update = await client.from("task_attempts").update({ audio_path: path, audio_duration_seconds: Math.max(1, Math.round(durationSeconds)) }).eq("id", attemptId);
  throwIfError(update.error);
  return path;
}

export async function createBugFromAttempt(userId: string, planId: string, session: SprintSession, task: StudyTask, attempt: TaskAttempt, input: { errorType: string; rootCause: string; refactorRule: string; evidence: string }) {
  const skill = ["Listening", "Reading", "Writing", "Speaking", "Grammar / Vocab"].includes(session.skill) ? session.skill : "Grammar / Vocab";
  const code = `${skill === "Grammar / Vocab" ? "GRAM" : skill.toUpperCase()}_${Date.now().toString(36).toUpperCase()}`;
  const client = getSupabase();
  const existing = await client.from("bugs").select("id").eq("task_attempt_id", attempt.id).maybeSingle();
  throwIfError(existing.error);
  const payload = { user_id: userId, plan_id: planId, daily_lesson_id: session.id, task_attempt_id: attempt.id, detected_on: new Date().toISOString().slice(0, 10), skill, original_text: attempt.userAnswer || "(blank)", cause: input.rootCause, correction: task.correctAnswer || "Self review", example: input.evidence, status: "OPEN", lifecycle_status: "OPEN", origin: "user", error_type: input.errorType || "OTHER", root_cause: input.rootCause, refactor_rule: input.refactorRule };
  const { error } = existing.data
    ? await client.from("bugs").update(payload).eq("id", existing.data.id)
    : await client.from("bugs").insert({ ...payload, code });
  throwIfError(error);
}

export async function completeSprintSession(sessionId: string, sprintId: string, duration: number, notes: string) {
  const client = getSupabase(); const result = await client.rpc("ielts_lab_complete_session", { p_lesson_id: sessionId, p_duration_minutes: duration, p_notes: notes }); throwIfError(result.error);
  const remaining = await client.from("daily_lessons").select("id", { count: "exact", head: true }).eq("week_sprint_id", sprintId).neq("workflow_status", "DONE"); throwIfError(remaining.error);
  if ((remaining.count ?? 0) === 0) { const update = await client.from("week_sprints").update({ status: "REVIEW" }).eq("id", sprintId); throwIfError(update.error); }
  return result.data;
}

export async function setSprintStatus(id: string, status: SprintStatus) { const { error } = await getSupabase().from("week_sprints").update({ status }).eq("id", id); throwIfError(error); }
