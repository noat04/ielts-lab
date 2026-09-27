import { getSupabase } from "@/lib/supabase/client";

export type BugLifecycle = "OPEN" | "FIXING" | "RETEST_DUE" | "RESOLVED" | "REOPENED";
export type RetestResult = "PENDING" | "PASS" | "FAIL";

export type ErrorType = {
  code: string;
  category: "COMPREHENSION" | "LANGUAGE" | "PRODUCTION" | "PROCESS";
  label: string;
  description: string;
};

export type QualityBug = {
  id: string;
  code: string;
  skill: string;
  original: string;
  correction: string;
  errorType: string;
  rootCause: string;
  refactorRule: string;
  lifecycle: BugLifecycle;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  occurrences: number;
  nextRetestAt: string;
};

export type BugRetest = {
  id: string;
  bugId: string;
  sprintId: string;
  scheduledFor: string;
  result: RetestResult;
  notes: string;
  testedAt: string;
};

export type SprintKpi = {
  plannedSessions: number;
  completedSessions: number;
  adherence: number | null;
  plannedMinutes: number;
  actualMinutes: number;
  timeCompletion: number | null;
  taskAccuracy: number | null;
  retestPass: number | null;
  newBugs: number;
  resolvedBugs: number;
  carryOver: number;
  overall: number | null;
  calculatedAt: string;
};

export type WeeklyRetrospective = {
  energyScore: number;
  confidenceScore: number;
  wins: string[];
  challenges: string[];
  stopDoing: string;
  startDoing: string;
  continueDoing: string;
  nextWeekFocus: string;
};

export type SkillKpi = {
  skill: string;
  metric: "ACCURACY" | "SELF_CHECK" | "COMPLETION";
  target: number | null;
  actual: number | null;
  status: "NO_DATA" | "NOT_MET" | "PASS";
  completedSessions: number;
  totalAttempts: number;
  correctAttempts: number;
  studyMinutes: number;
  bugCount: number;
};

export type SprintQuality = {
  errorTypes: ErrorType[];
  bugs: QualityBug[];
  retests: BugRetest[];
  kpi: SprintKpi | null;
  skillKpis: SkillKpi[];
  retrospective: WeeklyRetrospective | null;
};

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function nullableNumber(value: unknown) {
  return value === null || value === undefined ? null : Number(value);
}

function mapKpi(row: Record<string, any>): SprintKpi {
  return {
    plannedSessions: row.planned_sessions,
    completedSessions: row.completed_sessions,
    adherence: nullableNumber(row.adherence_percent),
    plannedMinutes: row.planned_minutes,
    actualMinutes: row.actual_minutes,
    timeCompletion: nullableNumber(row.time_completion_percent),
    taskAccuracy: nullableNumber(row.task_accuracy_percent),
    retestPass: nullableNumber(row.retest_pass_percent),
    newBugs: row.new_bugs,
    resolvedBugs: row.resolved_bugs,
    carryOver: row.carry_over_count,
    overall: nullableNumber(row.overall_score),
    calculatedAt: row.calculated_at,
  };
}

export async function loadSprintQuality(planId: string, sprintId: string, _lessonIds: string[]): Promise<SprintQuality> {
  const client = getSupabase();
  const [kpiResult, skillKpiResult] = await Promise.all([
    client.rpc("ielts_lab_refresh_sprint_kpis", { p_sprint_id: sprintId }),
    client.rpc("ielts_lab_refresh_skill_kpis", { p_sprint_id: sprintId }),
  ]);
  throwIfError(kpiResult.error); throwIfError(skillKpiResult.error);

  const [typesResult, bugsResult, retestsResult, retroResult] = await Promise.all([
    client.from("error_type_catalog").select("*").order("sort_order"),
    client.from("bugs").select("*").eq("plan_id", planId).order("detected_on", { ascending: false }),
    client.from("bug_retests").select("*").eq("sprint_id", sprintId).order("scheduled_for"),
    client.from("weekly_retrospectives").select("*").eq("sprint_id", sprintId).maybeSingle(),
  ]);
  [typesResult, bugsResult, retestsResult, retroResult].forEach((result) => throwIfError(result.error));

  return {
    errorTypes: (typesResult.data ?? []).map((row) => ({ code: row.code, category: row.category, label: row.label, description: row.description })),
    bugs: (bugsResult.data ?? []).map((row) => ({
      id: row.id,
      code: row.code,
      skill: row.skill,
      original: row.original_text,
      correction: row.correction,
      errorType: row.error_type || "OTHER",
      rootCause: row.root_cause || row.cause,
      refactorRule: row.refactor_rule || "",
      lifecycle: row.lifecycle_status,
      severity: row.severity,
      occurrences: row.occurrence_count,
      nextRetestAt: row.next_retest_at || "",
    })),
    retests: (retestsResult.data ?? []).map((row) => ({ id: row.id, bugId: row.bug_id, sprintId: row.sprint_id || "", scheduledFor: row.scheduled_for, result: row.result, notes: row.notes, testedAt: row.tested_at || "" })),
    kpi: kpiResult.data ? mapKpi(kpiResult.data) : null,
    skillKpis: (skillKpiResult.data ?? []).map((row: Record<string, any>) => ({
      skill: row.skill,
      metric: row.metric,
      target: nullableNumber(row.target_value),
      actual: nullableNumber(row.actual_value),
      status: row.status,
      completedSessions: row.completed_sessions,
      totalAttempts: row.total_attempts,
      correctAttempts: row.correct_attempts,
      studyMinutes: row.study_minutes,
      bugCount: row.bug_count,
    })),
    retrospective: retroResult.data ? {
      energyScore: retroResult.data.energy_score,
      confidenceScore: retroResult.data.confidence_score,
      wins: retroResult.data.wins,
      challenges: retroResult.data.challenges,
      stopDoing: retroResult.data.stop_doing,
      startDoing: retroResult.data.start_doing,
      continueDoing: retroResult.data.continue_doing,
      nextWeekFocus: retroResult.data.next_week_focus,
    } : null,
  };
}

export async function updateBugQuality(bugId: string, patch: { errorType?: string; lifecycle?: BugLifecycle; severity?: QualityBug["severity"]; nextRetestAt?: string | null }) {
  const payload: Record<string, unknown> = {};
  if (patch.errorType !== undefined) payload.error_type = patch.errorType;
  if (patch.lifecycle !== undefined) payload.lifecycle_status = patch.lifecycle;
  if (patch.severity !== undefined) payload.severity = patch.severity;
  if (patch.nextRetestAt !== undefined) payload.next_retest_at = patch.nextRetestAt || null;
  const { error } = await getSupabase().from("bugs").update(payload).eq("id", bugId);
  throwIfError(error);
}

export async function scheduleBugRetest(userId: string, bugId: string, sprintId: string, scheduledFor: string) {
  const client = getSupabase();
  const existing = await client.from("bug_retests").select("id").eq("bug_id", bugId).eq("result", "PENDING").order("scheduled_for").limit(1).maybeSingle();
  throwIfError(existing.error);
  const payload = { user_id: userId, bug_id: bugId, sprint_id: sprintId, scheduled_for: scheduledFor, result: "PENDING" };
  const result = existing.data
    ? await client.from("bug_retests").update(payload).eq("id", existing.data.id)
    : await client.from("bug_retests").insert(payload);
  throwIfError(result.error);
  await updateBugQuality(bugId, { lifecycle: "RETEST_DUE", nextRetestAt: scheduledFor });
}

export async function recordBugRetest(bugId: string, sprintId: string, result: "PASS" | "FAIL", answer: string, notes: string) {
  const response = await getSupabase().rpc("ielts_lab_record_bug_retest", {
    p_bug_id: bugId,
    p_sprint_id: sprintId,
    p_result: result,
    p_answer: answer,
    p_notes: notes,
  });
  throwIfError(response.error);
}

function lines(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

export async function saveWeeklyRetrospective(userId: string, sprintId: string, input: Omit<WeeklyRetrospective, "wins" | "challenges"> & { wins: string; challenges: string }) {
  const { error } = await getSupabase().from("weekly_retrospectives").upsert({
    user_id: userId,
    sprint_id: sprintId,
    energy_score: input.energyScore,
    confidence_score: input.confidenceScore,
    wins: lines(input.wins),
    challenges: lines(input.challenges),
    stop_doing: input.stopDoing,
    start_doing: input.startDoing,
    continue_doing: input.continueDoing,
    next_week_focus: input.nextWeekFocus,
  }, { onConflict: "user_id,sprint_id" });
  throwIfError(error);
}

export async function generateNextWeek(userId: string, fromSprintId: string, input: { startDate: string; title: string; objective: string; targets: Record<string, number> }) {
  const client = getSupabase();
  const result = await client.rpc("ielts_lab_generate_next_week", {
    p_from_sprint_id: fromSprintId,
    p_start_date: input.startDate,
    p_title: input.title,
    p_objective: input.objective,
    p_targets: input.targets,
  });
  throwIfError(result.error);
  const events = await client.from("learning_events").insert([
    { user_id: userId, event_type: "WEEK_COMPLETED", entity_type: "week_sprint", entity_id: fromSprintId, sprint_id: fromSprintId, payload: {} },
    { user_id: userId, event_type: "NEXT_WEEK_GENERATED", entity_type: "week_sprint", entity_id: result.data, sprint_id: result.data, payload: { from_sprint_id: fromSprintId } },
  ]);
  throwIfError(events.error);
  return result.data as string;
}
