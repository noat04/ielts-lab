import { getSupabase } from "@/lib/supabase/client";
import type { LearningPlan, PlanPhase, PlanResource } from "@/lib/supabase/planner";

export type DiagnosticAssessment = {
  id: string;
  listeningRaw: number;
  readingRaw: number;
  writingBand: number;
  speakingBand: number;
  estimatedBand: number;
  studyExperience: "beginner" | "returning" | "experienced";
  difficultSkills: string[];
  notes: string;
  completedAt: string;
};

export type TestResultInput = {
  label: string;
  type: "full" | "listening" | "reading" | "writing" | "speaking";
  date: string;
  listeningRaw: number | null;
  readingRaw: number | null;
  writingBand: number | null;
  speakingBand: number | null;
  conclusion: string;
};

export type LearningRecommendation = {
  title: string;
  reason: string;
  skill: string;
  duration: number;
  priority: "high" | "medium" | "low";
};

export type LearningInsight = {
  assessment: DiagnosticAssessment | null;
  testCount: number;
  latestOverall: number | null;
  openBugCount: number;
  recommendations: LearningRecommendation[];
};

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function rawToBand(raw: number, skill: "Listening" | "Reading") {
  const thresholds = skill === "Listening"
    ? [[39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6], [18, 5.5], [16, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5], [0, 2]]
    : [[39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5], [15, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5], [0, 2]];
  return thresholds.find(([minimum]) => raw >= minimum)?.[1] ?? 0;
}

function roundHalf(value: number) {
  return Math.round(value * 2) / 2;
}

function mapAssessment(row: Record<string, any>): DiagnosticAssessment {
  return {
    id: row.id,
    listeningRaw: row.listening_raw,
    readingRaw: row.reading_raw,
    writingBand: Number(row.writing_band),
    speakingBand: Number(row.speaking_band),
    estimatedBand: Number(row.estimated_band),
    studyExperience: row.study_experience,
    difficultSkills: row.difficult_skills ?? [],
    notes: row.notes,
    completedAt: row.completed_at,
  };
}

export async function saveDiagnosticAssessment(
  userId: string,
  planId: string,
  input: Omit<DiagnosticAssessment, "id" | "estimatedBand" | "completedAt">,
) {
  const client = getSupabase();
  const listeningBand = rawToBand(input.listeningRaw, "Listening");
  const readingBand = rawToBand(input.readingRaw, "Reading");
  const estimatedBand = roundHalf((listeningBand + readingBand + input.writingBand + input.speakingBand) / 4);
  const planResult = await client.from("learning_plans").select("target_band").eq("id", planId).single();
  throwIfError(planResult.error);
  if (!planResult.data) throw new Error("Không tìm thấy lộ trình để cập nhật band đầu vào.");
  const targetBand = Math.max(Number(planResult.data.target_band), estimatedBand);
  const { data, error } = await client.from("diagnostic_assessments").insert({
    user_id: userId,
    plan_id: planId,
    listening_raw: input.listeningRaw,
    reading_raw: input.readingRaw,
    writing_band: input.writingBand,
    speaking_band: input.speakingBand,
    estimated_band: estimatedBand,
    study_experience: input.studyExperience,
    difficult_skills: input.difficultSkills,
    notes: input.notes,
  }).select().single();
  throwIfError(error);

  const [planUpdate, goalUpdate] = await Promise.all([
    client.from("learning_plans").update({ current_band: estimatedBand, target_band: targetBand }).eq("id", planId),
    client.from("study_goals").upsert({
      user_id: userId,
      current_band: estimatedBand,
      target_band: targetBand,
      stretch_band: Math.max(targetBand, 7.5),
    }, { onConflict: "user_id" }),
  ]);
  throwIfError(planUpdate.error);
  throwIfError(goalUpdate.error);
  return mapAssessment(data);
}

function fallbackRecommendations(
  assessment: DiagnosticAssessment | null,
  bugs: Array<{ skill: string; cause: string }>,
): LearningRecommendation[] {
  const bugCounts = new Map<string, number>();
  bugs.forEach((bug) => bugCounts.set(bug.skill, (bugCounts.get(bug.skill) ?? 0) + 1));
  const scores: Record<string, number> = assessment ? {
    Listening: rawToBand(assessment.listeningRaw, "Listening"),
    Reading: rawToBand(assessment.readingRaw, "Reading"),
    Writing: assessment.writingBand,
    Speaking: assessment.speakingBand,
  } : {};
  const skills = ["Listening", "Reading", "Writing", "Speaking", "Grammar / Vocab"];
  return skills
    .map((skill) => ({ skill, weakness: (9 - (scores[skill] ?? 5)) * 2 + (bugCounts.get(skill) ?? 0) }))
    .sort((a, b) => b.weakness - a.weakness)
    .slice(0, 3)
    .map(({ skill }, index) => ({
      title: index === 0 ? `Ưu tiên vá lỗ hổng ${skill}` : `Luyện tập có chủ đích: ${skill}`,
      reason: bugCounts.get(skill)
        ? `Bạn đang có ${bugCounts.get(skill)} lỗi mở ở kỹ năng này. Hãy chữa lỗi trước khi làm đề mới.`
        : `Điểm đầu vào cho thấy đây là kỹ năng cần được củng cố trong chu kỳ học tiếp theo.`,
      skill,
      duration: index === 0 ? 45 : 30,
      priority: index === 0 ? "high" : "medium",
    }));
}

export async function loadLearningInsight(planId: string): Promise<LearningInsight> {
  const client = getSupabase();
  const [assessment, tests, bugs] = await Promise.all([
    client.from("diagnostic_assessments").select("*").eq("plan_id", planId).order("completed_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("test_results").select("overall_band").eq("plan_id", planId).order("test_date", { ascending: false }),
    client.from("bugs").select("skill,cause").eq("plan_id", planId).eq("status", "OPEN"),
  ]);
  [assessment, tests, bugs].forEach((result) => throwIfError(result.error));
  const mappedAssessment = assessment.data ? mapAssessment(assessment.data) : null;
  const latestWithBand = (tests.data ?? []).find((row) => row.overall_band !== null);
  return {
    assessment: mappedAssessment,
    testCount: tests.data?.length ?? 0,
    latestOverall: latestWithBand ? Number(latestWithBand.overall_band) : null,
    openBugCount: bugs.data?.length ?? 0,
    recommendations: fallbackRecommendations(mappedAssessment, bugs.data ?? []),
  };
}

function dateISO(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export async function generateAutomaticSchedule(
  userId: string,
  plan: LearningPlan,
  phases: PlanPhase[],
  weeks: number,
) {
  const client = getSupabase();
  const [assessmentResult, bugsResult] = await Promise.all([
    client.from("diagnostic_assessments").select("*").eq("plan_id", plan.id).order("completed_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("bugs").select("skill").eq("plan_id", plan.id).eq("status", "OPEN"),
  ]);
  throwIfError(assessmentResult.error);
  throwIfError(bugsResult.error);
  const assessment = assessmentResult.data ? mapAssessment(assessmentResult.data) : null;
  const bugCounts = new Map<string, number>();
  (bugsResult.data ?? []).forEach((row) => bugCounts.set(row.skill, (bugCounts.get(row.skill) ?? 0) + 1));
  const band: Record<string, number> = assessment ? {
    Listening: rawToBand(assessment.listeningRaw, "Listening"),
    Reading: rawToBand(assessment.readingRaw, "Reading"),
    Writing: assessment.writingBand,
    Speaking: assessment.speakingBand,
  } : { Listening: plan.currentBand, Reading: plan.currentBand, Writing: plan.currentBand, Speaking: plan.currentBand };
  const skills = ["Listening", "Reading", "Writing", "Speaking", "Grammar / Vocab"]
    .sort((a, b) => ((9 - (band[b] ?? plan.currentBand)) * 2 + (bugCounts.get(b) ?? 0)) - ((9 - (band[a] ?? plan.currentBand)) * 2 + (bugCounts.get(a) ?? 0)));

  const start = new Date(`${plan.startDate > dateISO(new Date()) ? plan.startDate : dateISO(new Date())}T12:00:00`);
  const requestedEnd = new Date(start);
  requestedEnd.setDate(requestedEnd.getDate() + weeks * 7 - 1);
  const planEnd = new Date(`${plan.endDate}T12:00:00`);
  const end = requestedEnd < planEnd ? requestedEnd : planEnd;
  const minutes = Math.max(15, Math.round(plan.weeklyMinutes / Math.max(1, plan.studyDays.length) / 5) * 5);
  const rows = [];
  let sequence = 0;
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    if (!plan.studyDays.includes(cursor.getDay())) continue;
    const date = dateISO(cursor);
    const skill = skills[sequence % skills.length];
    const phase = phases.find((item) => date >= item.startDate && date <= item.endDate);
    const hasBugs = (bugCounts.get(skill) ?? 0) > 0;
    rows.push({
      user_id: userId,
      plan_id: plan.id,
      phase_id: phase?.id ?? null,
      lesson_date: date,
      title: hasBugs ? `Chữa lỗi và luyện lại ${skill}` : `Luyện ${skill} theo mục tiêu`,
      description: hasBugs
        ? `Ôn sổ lỗi ${skill}, làm lại ví dụ sai và áp dụng vào một bài luyện mới.`
        : `Một phiên học tập trung theo lộ trình Band ${plan.currentBand.toFixed(1)} → ${plan.targetBand.toFixed(1)}.`,
      skill,
      duration_minutes: minutes,
      priority: sequence < 2 ? "high" : "medium",
      status: "todo",
      generation_source: "automatic",
      source_key: `auto-${plan.id}-${date}`,
    });
    sequence += 1;
  }
  if (!rows.length) throw new Error("Không tìm thấy ngày học phù hợp trong khoảng thời gian đã chọn.");
  const sourceKeys = rows.map((row) => row.source_key);
  const existing = await client.from("daily_lessons").select("source_key").eq("plan_id", plan.id).in("source_key", sourceKeys);
  throwIfError(existing.error);
  const existingKeys = new Set((existing.data ?? []).map((row) => row.source_key));
  const newRows = rows.filter((row) => !existingKeys.has(row.source_key));
  if (!newRows.length) return 0;
  const { error } = await client.from("daily_lessons").insert(newRows);
  throwIfError(error);
  return newRows.length;
}

export async function saveTestResult(userId: string, planId: string, input: TestResultInput) {
  const client = getSupabase();
  const listeningBand = input.listeningRaw === null ? null : rawToBand(input.listeningRaw, "Listening");
  const readingBand = input.readingRaw === null ? null : rawToBand(input.readingRaw, "Reading");
  const bands = [listeningBand, readingBand, input.writingBand, input.speakingBand].filter((value): value is number => value !== null);
  const average = bands.length ? bands.reduce((sum, value) => sum + value, 0) / bands.length : null;
  const overall = bands.length === 4 && average !== null ? roundHalf(average) : null;
  const { error } = await client.from("test_results").insert({
    user_id: userId,
    plan_id: planId,
    label: input.label,
    test_type: input.type,
    test_date: input.date,
    listening_raw: input.listeningRaw,
    listening_band: listeningBand,
    reading_raw: input.readingRaw,
    reading_band: readingBand,
    writing_band: input.writingBand,
    speaking_band: input.speakingBand,
    average_band: average,
    overall_band: overall,
    conclusion: input.conclusion,
    origin: "user",
  });
  throwIfError(error);
}

function safeFileName(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
}

export async function uploadLearningMaterial(userId: string, planId: string, file: File, description: string): Promise<PlanResource> {
  if (file.size > 50 * 1024 * 1024) throw new Error("Tệp vượt quá giới hạn 50 MB.");
  const client = getSupabase();
  const path = `${userId}/${planId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const upload = await client.storage.from("learning-materials").upload(path, file, { contentType: file.type || undefined });
  throwIfError(upload.error);
  const type = file.type.startsWith("audio/") ? "audio" : file.type.startsWith("video/") ? "video" : "document";
  const { data, error } = await client.from("learning_resources").insert({
    user_id: userId,
    plan_id: planId,
    resource_key: `upload-${crypto.randomUUID()}`,
    title: file.name,
    url: `storage:${path}`,
    resource_type: type,
    description,
    storage_path: path,
    mime_type: file.type || null,
    file_size: file.size,
    source_provider: "LOCAL_STORAGE",
    original_filename: file.name,
    folder_name: "IELTS",
  }).select().single();
  if (error) {
    await client.storage.from("learning-materials").remove([path]);
    throwIfError(error);
  }
  const signed = await client.storage.from("learning-materials").createSignedUrl(path, 3600);
  return {
    id: data.id,
    planId: data.plan_id,
    key: data.resource_key,
    title: data.title,
    url: signed.data?.signedUrl ?? "",
    type: data.resource_type,
    description: data.description,
    primary: data.is_primary,
    storagePath: path,
    mimeType: data.mime_type ?? "",
    fileSize: data.file_size,
    provider: data.source_provider ?? "LOCAL_STORAGE",
    externalFileId: data.external_file_id ?? "",
    originalFilename: data.original_filename ?? file.name,
    previewUrl: signed.data?.signedUrl ?? "",
    folder: data.folder_name ?? "Chưa phân loại",
    tags: data.tags ?? [],
    skills: data.skills ?? [],
    accessStatus: data.access_status ?? "READY",
    favorite: Boolean(data.is_favorite),
    lastOpenedAt: data.last_opened_at ?? "",
    createdAt: data.created_at,
  };
}

export async function requestAiRecommendations(planId: string): Promise<LearningRecommendation[]> {
  const { data, error } = await getSupabase().functions.invoke("learning-coach", { body: { planId } });
  throwIfError(error);
  if (!Array.isArray(data?.recommendations)) throw new Error("AI không trả về danh sách đề xuất hợp lệ.");
  return data.recommendations;
}
