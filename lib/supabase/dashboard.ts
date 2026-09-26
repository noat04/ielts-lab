import { DASHBOARD_DATA } from "@/lib/dashboard-data";
import { getSupabase } from "@/lib/supabase/client";

export type Skill = "Listening" | "Reading" | "Writing" | "Speaking" | "Grammar / Vocab";
export type BugStatus = "OPEN" | "DONE";
export type SessionStatus = "planned" | "completed";

export type Bug = {
  stt: number;
  date: string;
  skill: Skill;
  id: string;
  original: string;
  cause: string;
  fix: string;
  example: string;
  status: BugStatus;
  custom: boolean;
  key: string;
};

export type StudySession = {
  id: string;
  date: string;
  skill: Skill;
  duration: number;
  title: string;
  note: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
};

export type WeekProgress = {
  week: string;
  month: string;
  total: number;
  completed: number;
  completedMinutes: number;
  bugUpdates: number;
  skills: string[];
  notes: string[];
};

export type TestResult = {
  id: string;
  label: string;
  type: string;
  listeningRaw: number | null;
  listeningBand: number | null;
  readingRaw: number | null;
  readingBand: number | null;
  writingBand: number | null;
  speakingBand: number | null;
  overall: number | null;
  conclusion: string | null;
};

export type PracticeExercise = {
  id: string;
  prompt: string;
  answer: string;
  hint: string;
  completed: boolean;
};

export type GoalState = {
  currentBand: number;
  targetBand: number;
  stretchBand: number;
  deadline: string;
  targetSessions: number;
};

export type DashboardCloudData = {
  activePlanId: string | null;
  goals: GoalState;
  bugs: Bug[];
  sessions: StudySession[];
  weeks: WeekProgress[];
  tests: TestResult[];
  exercises: PracticeExercise[];
  theory: Record<string, { label: string; source: string; tip: string }>;
  sources: Record<string, { title: string; url: string }>;
};

const STORAGE_KEY = "ielts-lab-nextjs-v1";

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

async function importSnapshot(userId: string) {
  const client = getSupabase();
  const { data: imported, error: importCheckError } = await client
    .from("data_imports")
    .select("id")
    .eq("source_type", "snapshot")
    .eq("source_name", "dashboard-data.ts")
    .maybeSingle();
  throwIfError(importCheckError);
  if (imported) return;

  const { error: goalError } = await client.from("study_goals").upsert({
    user_id: userId,
    current_band: DASHBOARD_DATA.goals.baseline,
    target_band: DASHBOARD_DATA.goals.target,
    stretch_band: DASHBOARD_DATA.goals.stretch,
    target_sessions: DASHBOARD_DATA.goals.totalSessions,
  }, { onConflict: "user_id" });
  throwIfError(goalError);

  const { error: bugsError } = await client.from("bugs").upsert(
    DASHBOARD_DATA.bugs.map((bug) => ({
      user_id: userId,
      code: bug.id,
      detected_on: bug.date,
      skill: bug.skill,
      original_text: bug.original,
      cause: bug.cause,
      correction: bug.fix,
      example: bug.example,
      status: bug.status,
      origin: "snapshot",
      source_position: bug.stt,
    })),
    { onConflict: "user_id,code" },
  );
  throwIfError(bugsError);

  const { error: weeksError } = await client.from("weekly_progress").upsert(
    DASHBOARD_DATA.weeks.map((week, index) => ({
      user_id: userId,
      week_number: index + 1,
      month_number: Math.floor(index / 4) + 1,
      total_sessions: week.total,
      completed_sessions: week.completed,
      planned_minutes: week.plannedMinutes,
      completed_minutes: week.completedMinutes,
      bug_updates: week.bugUpdates,
      skills: week.skills,
      notes: week.notes,
    })),
    { onConflict: "user_id,week_number" },
  );
  throwIfError(weeksError);

  const { error: testsError } = await client.from("test_results").upsert(
    DASHBOARD_DATA.tests.map((test, index) => ({
      user_id: userId,
      source_key: `snapshot-test-${index + 1}`,
      label: test.label,
      test_type: test.type,
      listening_raw: asNumber(test.listeningRaw),
      listening_band: asNumber(test.listeningBand),
      reading_raw: asNumber(test.readingRaw),
      reading_band: asNumber(test.readingBand),
      writing_band: asNumber(test.writingBand),
      speaking_band: asNumber(test.speakingBand),
      average_band: asNumber(test.average),
      overall_band: asNumber(test.overall),
      conclusion: test.conclusion,
      origin: "snapshot",
    })),
    { onConflict: "user_id,source_key" },
  );
  throwIfError(testsError);

  const { error: exercisesError } = await client.from("practice_exercises").upsert(
    DASHBOARD_DATA.todayExercises.map((exercise, index) => ({
      user_id: userId,
      exercise_key: `snapshot-exercise-${index + 1}`,
      prompt: exercise.prompt,
      answer: exercise.answer,
      hint: exercise.hint,
      sort_order: index,
      is_active: true,
      origin: "snapshot",
    })),
    { onConflict: "user_id,exercise_key" },
  );
  throwIfError(exercisesError);

  const { error: theoryError } = await client.from("theory_notes").upsert(
    Object.entries(DASHBOARD_DATA.theory).map(([code, theory]) => ({
      user_id: userId,
      code,
      label: theory.label,
      source: theory.source,
      tip: theory.tip,
    })),
    { onConflict: "user_id,code" },
  );
  throwIfError(theoryError);

  const resourceType: Record<string, string> = {
    notes: "document",
    tracker: "spreadsheet",
    book: "book",
  };
  const { error: resourcesError } = await client.from("learning_resources").upsert(
    Object.entries(DASHBOARD_DATA.sources).map(([key, source], index) => ({
      user_id: userId,
      resource_key: key,
      title: source.title,
      url: source.url,
      resource_type: resourceType[key] || "other",
      sort_order: index,
    })),
    { onConflict: "user_id,resource_key" },
  );
  throwIfError(resourcesError);

  const { error: importedError } = await client.from("data_imports").upsert({
    user_id: userId,
    source_type: "snapshot",
    source_name: "dashboard-data.ts",
    source_generated_at: DASHBOARD_DATA.generatedAt,
    metadata: { version: 1 },
  }, { onConflict: "user_id,source_type,source_name" });
  throwIfError(importedError);
}

type LegacyState = {
  bugOverrides?: Record<string, BugStatus>;
  customBugs?: Array<Partial<Bug> & { id?: string }>;
  sessions?: Array<Partial<StudySession> & { id?: string }>;
  currentBand?: number;
  targetBand?: number;
  stretchBand?: number;
  deadline?: string;
  exercises?: Record<number, boolean>;
};

async function importLegacyLocalStorage(userId: string) {
  if (typeof window === "undefined") return;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  const client = getSupabase();
  const { data: imported, error: importCheckError } = await client
    .from("data_imports")
    .select("id")
    .eq("source_type", "local_storage")
    .eq("source_name", STORAGE_KEY)
    .maybeSingle();
  throwIfError(importCheckError);
  if (imported) return;

  let legacy: LegacyState;
  try {
    legacy = JSON.parse(raw) as LegacyState;
  } catch {
    return;
  }

  const { error: goalsError } = await client.from("study_goals").upsert({
    user_id: userId,
    current_band: legacy.currentBand ?? DASHBOARD_DATA.goals.baseline,
    target_band: legacy.targetBand ?? DASHBOARD_DATA.goals.target,
    stretch_band: legacy.stretchBand ?? DASHBOARD_DATA.goals.stretch,
    exam_date: legacy.deadline || null,
    target_sessions: DASHBOARD_DATA.goals.totalSessions,
  }, { onConflict: "user_id" });
  throwIfError(goalsError);

  if (legacy.bugOverrides && Object.keys(legacy.bugOverrides).length) {
    const { data: existingBugs, error } = await client.from("bugs").select("*");
    throwIfError(error);
    const changed = (existingBugs ?? [])
      .filter((bug) => legacy.bugOverrides?.[bug.code])
      .map((bug) => ({ ...bug, status: legacy.bugOverrides![bug.code] }));
    if (changed.length) {
      const { error: updateError } = await client.from("bugs").upsert(changed, {
        onConflict: "user_id,code",
      });
      throwIfError(updateError);
    }
  }

  if (legacy.customBugs?.length) {
    const { error } = await client.from("bugs").upsert(
      legacy.customBugs
        .filter((bug) => bug.id && bug.skill && bug.original && bug.cause && bug.fix)
        .map((bug, index) => ({
          user_id: userId,
          code: bug.id!,
          detected_on: bug.date || new Date().toISOString().slice(0, 10),
          skill: bug.skill!,
          original_text: bug.original!,
          cause: bug.cause!,
          correction: bug.fix!,
          example: bug.example || "",
          status: bug.status || "OPEN",
          origin: "import",
          source_position: bug.stt || DASHBOARD_DATA.bugs.length + index + 1,
        })),
      { onConflict: "user_id,code" },
    );
    throwIfError(error);
  }

  if (legacy.sessions?.length) {
    const { error } = await client.from("study_sessions").upsert(
      legacy.sessions
        .filter((session) => session.date && session.skill && session.title)
        .map((session, index) => ({
          user_id: userId,
          source_key: `local-${session.id || index}`,
          study_date: session.date!,
          skill: session.skill!,
          duration_minutes: session.duration || 30,
          title: session.title!,
          note: session.note || "",
          status: session.status || "planned",
          origin: "import",
        })),
      { onConflict: "user_id,source_key" },
    );
    throwIfError(error);
  }

  if (legacy.exercises) {
    const { data: exercises, error: exercisesError } = await client
      .from("practice_exercises")
      .select("id,sort_order")
      .eq("is_active", true)
      .order("sort_order");
    throwIfError(exercisesError);
    const progress = (exercises ?? []).map((exercise) => {
      const completed = Boolean(legacy.exercises?.[exercise.sort_order]);
      return {
        user_id: userId,
        exercise_id: exercise.id,
        completed,
        completed_at: completed ? new Date().toISOString() : null,
      };
    });
    if (progress.length) {
      const { error } = await client.from("exercise_progress").upsert(progress, {
        onConflict: "user_id,exercise_id",
      });
      throwIfError(error);
    }
  }

  const { error: importedError } = await client.from("data_imports").upsert({
    user_id: userId,
    source_type: "local_storage",
    source_name: STORAGE_KEY,
    metadata: { importedAt: new Date().toISOString() },
  }, { onConflict: "user_id,source_type,source_name" });
  throwIfError(importedError);
}

export async function prepareUserDashboard(userId: string) {
  await importSnapshot(userId);
  await importLegacyLocalStorage(userId);
}

export async function loadDashboard(): Promise<DashboardCloudData> {
  const client = getSupabase();
  const [activePlan, goals, bugs, sessions, weeks, tests, exercises, progress, theory, sources] = await Promise.all([
    client.from("learning_plans").select("id").eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("study_goals").select("*").single(),
    client.from("bugs").select("*").order("detected_on", { ascending: false }),
    client.from("study_sessions").select("*").order("study_date", { ascending: false }),
    client.from("weekly_progress").select("*").order("week_number"),
    client.from("test_results").select("*").order("created_at", { ascending: false }),
    client.from("practice_exercises").select("*").eq("is_active", true).order("sort_order"),
    client.from("exercise_progress").select("exercise_id,completed"),
    client.from("theory_notes").select("*"),
    client.from("learning_resources").select("*").order("sort_order"),
  ]);

  [activePlan, goals, bugs, sessions, weeks, tests, exercises, progress, theory, sources]
    .forEach((result) => throwIfError(result.error));

  const completedExercises = new Map(
    (progress.data ?? []).map((row) => [row.exercise_id, Boolean(row.completed)]),
  );

  return {
    activePlanId: activePlan.data?.id ?? null,
    goals: {
      currentBand: Number(goals.data.current_band),
      targetBand: Number(goals.data.target_band),
      stretchBand: Number(goals.data.stretch_band),
      deadline: goals.data.exam_date || "",
      targetSessions: goals.data.target_sessions,
    },
    bugs: (bugs.data ?? []).map((row) => ({
      stt: row.source_position || 0,
      date: row.detected_on,
      skill: row.skill as Skill,
      id: row.code,
      original: row.original_text,
      cause: row.cause,
      fix: row.correction,
      example: row.example,
      status: row.status as BugStatus,
      custom: row.origin !== "snapshot",
      key: row.id,
    })),
    sessions: (sessions.data ?? []).map((row) => ({
      id: row.id,
      date: row.study_date,
      skill: row.skill as Skill,
      duration: row.duration_minutes,
      title: row.title,
      note: row.note,
      status: row.status as SessionStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    weeks: (weeks.data ?? []).map((row) => ({
      week: `Tuần ${row.week_number}`,
      month: `Tháng ${row.month_number}`,
      total: row.total_sessions,
      completed: row.completed_sessions,
      completedMinutes: row.completed_minutes,
      bugUpdates: row.bug_updates,
      skills: row.skills,
      notes: row.notes,
    })),
    tests: (tests.data ?? []).map((row) => ({
      id: row.id,
      label: row.label,
      type: row.test_type,
      listeningRaw: row.listening_raw,
      listeningBand: row.listening_band === null ? null : Number(row.listening_band),
      readingRaw: row.reading_raw,
      readingBand: row.reading_band === null ? null : Number(row.reading_band),
      writingBand: row.writing_band === null ? null : Number(row.writing_band),
      speakingBand: row.speaking_band === null ? null : Number(row.speaking_band),
      overall: row.overall_band === null ? null : Number(row.overall_band),
      conclusion: row.conclusion,
    })),
    exercises: (exercises.data ?? []).map((row) => ({
      id: row.id,
      prompt: row.prompt,
      answer: row.answer,
      hint: row.hint,
      completed: completedExercises.get(row.id) || false,
    })),
    theory: Object.fromEntries((theory.data ?? []).map((row) => [row.code, {
      label: row.label,
      source: row.source,
      tip: row.tip,
    }])),
    sources: Object.fromEntries((sources.data ?? []).map((row) => [row.resource_key, {
      title: row.title,
      url: row.url,
    }])),
  };
}

export async function updateGoals(userId: string, patch: Partial<GoalState>) {
  const client = getSupabase();
  const payload: Record<string, unknown> = { user_id: userId };
  if (patch.currentBand !== undefined) payload.current_band = patch.currentBand;
  if (patch.targetBand !== undefined) payload.target_band = patch.targetBand;
  if (patch.stretchBand !== undefined) payload.stretch_band = patch.stretchBand;
  if (patch.deadline !== undefined) payload.exam_date = patch.deadline || null;
  if (patch.targetSessions !== undefined) payload.target_sessions = patch.targetSessions;
  const { error } = await client.from("study_goals").upsert(payload, { onConflict: "user_id" });
  throwIfError(error);
}

export async function setBugStatus(id: string, status: BugStatus) {
  const { error } = await getSupabase().from("bugs").update({ status }).eq("id", id);
  throwIfError(error);
}

export async function saveBugRecord(
  userId: string,
  bug: Omit<Bug, "stt" | "custom" | "key">,
  existingId?: string,
  planId?: string | null,
): Promise<Bug> {
  const client = getSupabase();
  const payload = {
    user_id: userId,
    code: bug.id,
    detected_on: bug.date,
    skill: bug.skill,
    original_text: bug.original,
    cause: bug.cause,
    correction: bug.fix,
    example: bug.example,
    status: bug.status,
    origin: "user",
    plan_id: planId || null,
  };
  const query = existingId
    ? client.from("bugs").update(payload).eq("id", existingId)
    : client.from("bugs").insert(payload);
  const { data, error } = await query.select().single();
  throwIfError(error);
  return {
    stt: data.source_position || 0,
    date: data.detected_on,
    skill: data.skill as Skill,
    id: data.code,
    original: data.original_text,
    cause: data.cause,
    fix: data.correction,
    example: data.example,
    status: data.status as BugStatus,
    custom: true,
    key: data.id,
  };
}

export async function deleteBugRecord(id: string) {
  const { error } = await getSupabase().from("bugs").delete().eq("id", id);
  throwIfError(error);
}

export async function saveSessionRecord(
  userId: string,
  session: Omit<StudySession, "id" | "createdAt" | "updatedAt">,
  existingId?: string,
  planId?: string | null,
): Promise<StudySession> {
  const client = getSupabase();
  const payload = {
    user_id: userId,
    study_date: session.date,
    skill: session.skill,
    duration_minutes: session.duration,
    title: session.title,
    note: session.note,
    status: session.status,
    origin: "user",
    plan_id: planId || null,
  };
  const query = existingId
    ? client.from("study_sessions").update(payload).eq("id", existingId)
    : client.from("study_sessions").insert(payload);
  const { data, error } = await query.select().single();
  throwIfError(error);
  return {
    id: data.id,
    date: data.study_date,
    skill: data.skill as Skill,
    duration: data.duration_minutes,
    title: data.title,
    note: data.note,
    status: data.status as SessionStatus,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function setSessionStatus(id: string, status: SessionStatus) {
  const { error } = await getSupabase().from("study_sessions").update({ status }).eq("id", id);
  throwIfError(error);
}

export async function deleteSessionRecord(id: string) {
  const { error } = await getSupabase().from("study_sessions").delete().eq("id", id);
  throwIfError(error);
}

export async function setExerciseProgress(userId: string, exerciseId: string, completed: boolean) {
  const { error } = await getSupabase().from("exercise_progress").upsert({
    user_id: userId,
    exercise_id: exerciseId,
    completed,
    completed_at: completed ? new Date().toISOString() : null,
  }, { onConflict: "user_id,exercise_id" });
  throwIfError(error);
}
