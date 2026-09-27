import { getSupabase } from "@/lib/supabase/client";

export type PlanStatus = "draft" | "active" | "completed" | "archived";
export type LessonStatus = "todo" | "in_progress" | "completed" | "skipped";

export type LearningPlan = {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  examDate: string;
  currentBand: number;
  targetBand: number;
  weeklyMinutes: number;
  studyDays: number[];
  status: PlanStatus;
};

export type PlanPhase = {
  id: string;
  planId: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  position: number;
  status: "planned" | "active" | "completed";
};

export type DailyLesson = {
  id: string;
  planId: string;
  phaseId: string;
  date: string;
  studyTime: string;
  title: string;
  description: string;
  skill: string;
  duration: number;
  priority: "low" | "medium" | "high";
  status: LessonStatus;
  resourceUrl: string;
};

export type ExamEvent = {
  id: string;
  planId: string;
  title: string;
  type: "official" | "mock" | "checkpoint";
  date: string;
  time: string;
  venue: string;
  targetBand: number | null;
  note: string;
  status: "planned" | "completed" | "cancelled";
};

export type PlanResource = {
  id: string;
  planId: string;
  key: string;
  title: string;
  url: string;
  type: "document" | "spreadsheet" | "book" | "audio" | "video" | "other";
  description: string;
  primary: boolean;
  storagePath: string;
  mimeType: string;
  fileSize: number | null;
  provider: "LOCAL_STORAGE" | "GOOGLE_DRIVE" | "EXTERNAL_LINK";
  externalFileId: string;
  originalFilename: string;
  previewUrl: string;
  folder: string;
  tags: string[];
  skills: string[];
  accessStatus: "READY" | "PROCESSING" | "BROKEN" | "ARCHIVED";
  favorite: boolean;
  lastOpenedAt: string;
  createdAt: string;
};

export type PlannerWorkspace = {
  plans: LearningPlan[];
  plan: LearningPlan | null;
  phases: PlanPhase[];
  lessons: DailyLesson[];
  exams: ExamEvent[];
  resources: PlanResource[];
};

type PlanInput = Omit<LearningPlan, "id" | "status"> & { status?: PlanStatus };
type PhaseInput = Omit<PlanPhase, "id" | "planId">;
type LessonInput = Omit<DailyLesson, "id" | "planId">;
type ExamInput = Omit<ExamEvent, "id" | "planId">;
export type ResourceInput = Omit<PlanResource, "id" | "planId" | "key" | "storagePath" | "mimeType" | "fileSize" | "lastOpenedAt" | "createdAt">;

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function mapPlan(row: Record<string, any>): LearningPlan {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startDate: row.start_date,
    endDate: row.end_date,
    examDate: row.exam_date || "",
    currentBand: Number(row.current_band),
    targetBand: Number(row.target_band),
    weeklyMinutes: row.weekly_minutes,
    studyDays: row.study_days,
    status: row.status,
  };
}

function mapPhase(row: Record<string, any>): PlanPhase {
  return {
    id: row.id,
    planId: row.plan_id,
    title: row.title,
    description: row.description,
    startDate: row.start_date,
    endDate: row.end_date,
    position: row.position,
    status: row.status,
  };
}

function mapLesson(row: Record<string, any>): DailyLesson {
  return {
    id: row.id,
    planId: row.plan_id,
    phaseId: row.phase_id || "",
    date: row.lesson_date,
    studyTime: row.study_time?.slice(0, 5) || "",
    title: row.title,
    description: row.description,
    skill: row.skill,
    duration: row.duration_minutes,
    priority: row.priority,
    status: row.status,
    resourceUrl: row.resource_url || "",
  };
}

function mapExam(row: Record<string, any>): ExamEvent {
  return {
    id: row.id,
    planId: row.plan_id,
    title: row.title,
    type: row.exam_type,
    date: row.exam_date,
    time: row.exam_time?.slice(0, 5) || "",
    venue: row.venue,
    targetBand: row.target_band === null ? null : Number(row.target_band),
    note: row.note,
    status: row.status,
  };
}

function mapResource(row: Record<string, any>): PlanResource {
  return {
    id: row.id,
    planId: row.plan_id,
    key: row.resource_key,
    title: row.title,
    url: row.url,
    type: row.resource_type,
    description: row.description,
    primary: row.is_primary,
    storagePath: row.storage_path || "",
    mimeType: row.mime_type || "",
    fileSize: row.file_size ?? null,
    provider: row.source_provider ?? (row.storage_path ? "LOCAL_STORAGE" : "EXTERNAL_LINK"),
    externalFileId: row.external_file_id || "",
    originalFilename: row.original_filename || "",
    previewUrl: row.preview_url || "",
    folder: row.folder_name || "Chưa phân loại",
    tags: row.tags ?? [],
    skills: row.skills ?? [],
    accessStatus: row.access_status ?? "READY",
    favorite: Boolean(row.is_favorite),
    lastOpenedAt: row.last_opened_at || "",
    createdAt: row.created_at,
  };
}

export async function loadPlannerWorkspace(selectedPlanId?: string): Promise<PlannerWorkspace> {
  const client = getSupabase();
  const { data: planRows, error: plansError } = await client
    .from("learning_plans")
    .select("*")
    .order("created_at", { ascending: false });
  throwIfError(plansError);
  const plans = (planRows ?? []).map(mapPlan);
  const plan = plans.find((item) => item.id === selectedPlanId)
    || plans.find((item) => item.status === "active")
    || plans[0]
    || null;
  if (!plan) return { plans, plan: null, phases: [], lessons: [], exams: [], resources: [] };

  const [phases, lessons, exams, resources] = await Promise.all([
    client.from("plan_phases").select("*").eq("plan_id", plan.id).order("position"),
    client.from("daily_lessons").select("*").eq("plan_id", plan.id).order("lesson_date"),
    client.from("exam_events").select("*").eq("plan_id", plan.id).order("exam_date"),
    client.from("learning_resources").select("*").eq("plan_id", plan.id).order("sort_order"),
  ]);
  [phases, lessons, exams, resources].forEach((result) => throwIfError(result.error));
  return {
    plans,
    plan,
    phases: (phases.data ?? []).map(mapPhase),
    lessons: (lessons.data ?? []).map(mapLesson),
    exams: (exams.data ?? []).map(mapExam),
    resources: await Promise.all((resources.data ?? []).map(async (row) => {
      const resource = mapResource(row);
      if (!resource.storagePath) return resource;
      const { data } = await client.storage.from("learning-materials").createSignedUrl(resource.storagePath, 3600);
      return { ...resource, url: data?.signedUrl || "", previewUrl: data?.signedUrl || "" };
    })),
  };
}

function starterPhases(startDate: string, endDate: string): Array<Omit<PhaseInput, "position" | "status">> {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  const totalDays = Math.max(3, Math.round((end.getTime() - start.getTime()) / 86400000));
  const firstEnd = new Date(start.getTime() + Math.floor(totalDays / 3) * 86400000);
  const secondStart = new Date(firstEnd.getTime() + 86400000);
  const secondEnd = new Date(start.getTime() + Math.floor(totalDays * 2 / 3) * 86400000);
  const thirdStart = new Date(secondEnd.getTime() + 86400000);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  return [
    { title: "Xây nền tảng", description: "Đánh giá đầu vào, củng cố ngữ pháp, từ vựng và kỹ thuật cơ bản.", startDate, endDate: iso(firstEnd) },
    { title: "Phát triển kỹ năng", description: "Luyện chuyên sâu Listening, Reading, Writing và Speaking.", startDate: iso(secondStart), endDate: iso(secondEnd) },
    { title: "Luyện đề & về đích", description: "Mock test, chữa lỗi có hệ thống và tối ưu chiến thuật phòng thi.", startDate: iso(thirdStart), endDate },
  ];
}

export async function createLearningPlan(userId: string, input: PlanInput): Promise<LearningPlan> {
  const client = getSupabase();
  const { data, error } = await client.from("learning_plans").insert({
    user_id: userId,
    title: input.title,
    description: input.description,
    start_date: input.startDate,
    end_date: input.endDate,
    exam_date: input.examDate || null,
    current_band: input.currentBand,
    target_band: input.targetBand,
    weekly_minutes: input.weeklyMinutes,
    study_days: input.studyDays,
    status: input.status || "active",
  }).select().single();
  throwIfError(error);
  const plan = mapPlan(data);

  const phases = starterPhases(plan.startDate, plan.endDate);
  const { error: phasesError } = await client.from("plan_phases").insert(phases.map((phase, index) => ({
    user_id: userId,
    plan_id: plan.id,
    title: phase.title,
    description: phase.description,
    start_date: phase.startDate,
    end_date: phase.endDate,
    position: index,
    status: index === 0 ? "active" : "planned",
  })));
  throwIfError(phasesError);

  const { error: goalError } = await client.from("study_goals").upsert({
    user_id: userId,
    current_band: input.currentBand,
    target_band: input.targetBand,
    stretch_band: Math.max(input.targetBand, 7.5),
    exam_date: input.examDate || null,
  }, { onConflict: "user_id" });
  throwIfError(goalError);
  return plan;
}

export async function updateLearningPlan(userId: string, id: string, input: PlanInput): Promise<LearningPlan> {
  const client = getSupabase();
  const { data, error } = await client.from("learning_plans").update({
    title: input.title,
    description: input.description,
    start_date: input.startDate,
    end_date: input.endDate,
    exam_date: input.examDate || null,
    current_band: input.currentBand,
    target_band: input.targetBand,
    weekly_minutes: input.weeklyMinutes,
    study_days: input.studyDays,
    status: input.status || "active",
  }).eq("id", id).select().single();
  throwIfError(error);
  const { error: goalError } = await client.from("study_goals").upsert({
    user_id: userId,
    current_band: input.currentBand,
    target_band: input.targetBand,
    stretch_band: Math.max(input.targetBand, 7.5),
    exam_date: input.examDate || null,
  }, { onConflict: "user_id" });
  throwIfError(goalError);
  return mapPlan(data);
}

export async function savePhase(userId: string, planId: string, input: PhaseInput, id?: string): Promise<PlanPhase> {
  const client = getSupabase();
  const payload = { user_id: userId, plan_id: planId, title: input.title, description: input.description, start_date: input.startDate, end_date: input.endDate, position: input.position, status: input.status };
  const query = id ? client.from("plan_phases").update(payload).eq("id", id) : client.from("plan_phases").insert(payload);
  const { data, error } = await query.select().single();
  throwIfError(error);
  return mapPhase(data);
}

export async function deletePhase(id: string) {
  const { error } = await getSupabase().from("plan_phases").delete().eq("id", id);
  throwIfError(error);
}

export async function saveLesson(userId: string, planId: string, input: LessonInput, id?: string): Promise<DailyLesson> {
  const client = getSupabase();
  const payload = { user_id: userId, plan_id: planId, phase_id: input.phaseId || null, lesson_date: input.date, study_time: input.studyTime || null, title: input.title, description: input.description, skill: input.skill, duration_minutes: input.duration, priority: input.priority, status: input.status, resource_url: input.resourceUrl || null, completed_at: input.status === "completed" ? new Date().toISOString() : null };
  const query = id ? client.from("daily_lessons").update(payload).eq("id", id) : client.from("daily_lessons").insert(payload);
  const { data, error } = await query.select().single();
  throwIfError(error);
  return mapLesson(data);
}

export async function setLessonStatus(id: string, status: LessonStatus) {
  const { error } = await getSupabase().from("daily_lessons").update({ status, completed_at: status === "completed" ? new Date().toISOString() : null }).eq("id", id);
  throwIfError(error);
}

export async function deleteLesson(id: string) {
  const { error } = await getSupabase().from("daily_lessons").delete().eq("id", id);
  throwIfError(error);
}

export async function saveExam(userId: string, planId: string, input: ExamInput, id?: string): Promise<ExamEvent> {
  const client = getSupabase();
  const payload = { user_id: userId, plan_id: planId, title: input.title, exam_type: input.type, exam_date: input.date, exam_time: input.time || null, venue: input.venue, target_band: input.targetBand, note: input.note, status: input.status };
  const query = id ? client.from("exam_events").update(payload).eq("id", id) : client.from("exam_events").insert(payload);
  const { data, error } = await query.select().single();
  throwIfError(error);
  return mapExam(data);
}

export async function deleteExam(id: string) {
  const { error } = await getSupabase().from("exam_events").delete().eq("id", id);
  throwIfError(error);
}

export async function savePlanResource(userId: string, planId: string, input: ResourceInput, id?: string): Promise<PlanResource> {
  const client = getSupabase();
  const payload = {
    user_id: userId,
    plan_id: planId,
    title: input.title,
    url: input.url,
    resource_type: input.type,
    description: input.description,
    is_primary: input.primary,
    source_provider: input.provider,
    external_file_id: input.externalFileId || null,
    original_filename: input.originalFilename || null,
    preview_url: input.previewUrl || null,
    folder_name: input.folder || "Chưa phân loại",
    tags: input.tags,
    skills: input.skills,
    access_status: input.accessStatus,
    is_favorite: input.favorite,
    ...(id ? {} : { resource_key: `plan-${planId}-${Date.now().toString(36)}` }),
  };
  const query = id ? client.from("learning_resources").update(payload).eq("id", id) : client.from("learning_resources").insert(payload);
  const { data, error } = await query.select().single();
  throwIfError(error);
  return mapResource(data);
}

function safeFileName(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
}

export function parseGoogleDriveUrl(value: string) {
  const url = value.trim();
  const match = url.match(/\/(?:file\/d|document\/d|spreadsheets\/d|presentation\/d)\/([a-zA-Z0-9_-]+)/)
    ?? url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  const id = match?.[1] ?? "";
  const kind = url.includes("docs.google.com/document") ? "document" : url.includes("docs.google.com/spreadsheets") ? "spreadsheets" : url.includes("docs.google.com/presentation") ? "presentation" : "file";
  const previewUrl = !id ? url : kind === "file"
    ? `https://drive.google.com/file/d/${id}/preview`
    : `https://docs.google.com/${kind}/d/${id}/preview`;
  return { id, previewUrl };
}

export async function uploadPlanResource(userId: string, planId: string, file: File, input: Omit<ResourceInput, "url" | "provider" | "externalFileId" | "originalFilename" | "previewUrl">) {
  if (file.size > 50 * 1024 * 1024) throw new Error("Tệp vượt quá giới hạn 50 MB.");
  const allowed = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"];
  if (!allowed.includes(file.type) && !/\.(pdf|doc|docx|txt)$/i.test(file.name)) throw new Error("Thư viện hiện hỗ trợ PDF, DOC, DOCX và TXT.");
  const client = getSupabase();
  const path = `${userId}/${planId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const upload = await client.storage.from("learning-materials").upload(path, file, { contentType: file.type || undefined });
  throwIfError(upload.error);
  const payload = {
    user_id: userId, plan_id: planId, resource_key: `upload-${crypto.randomUUID()}`,
    title: input.title || file.name, url: `storage:${path}`, resource_type: input.type,
    description: input.description, is_primary: input.primary, storage_path: path,
    mime_type: file.type || null, file_size: file.size, source_provider: "LOCAL_STORAGE",
    original_filename: file.name, folder_name: input.folder || "Chưa phân loại", tags: input.tags,
    skills: input.skills, access_status: "READY", is_favorite: input.favorite,
  };
  const result = await client.from("learning_resources").insert(payload).select().single();
  if (result.error) { await client.storage.from("learning-materials").remove([path]); throwIfError(result.error); }
  return mapResource(result.data);
}

export async function markResourceOpened(id: string) {
  const { error } = await getSupabase().from("learning_resources").update({ last_opened_at: new Date().toISOString() }).eq("id", id);
  throwIfError(error);
}

export async function deletePlanResource(resource: PlanResource) {
  const client = getSupabase();
  if (!resource.storagePath) {
    const { error } = await client.from("learning_resources").delete().eq("id", resource.id);
    throwIfError(error);
    return;
  }
  const archived = await client.from("learning_resources").update({ access_status: "ARCHIVED" }).eq("id", resource.id);
  throwIfError(archived.error);
  const removed = await client.storage.from("learning-materials").remove([resource.storagePath]);
  if (removed.error) {
    await client.from("learning_resources").update({ access_status: resource.accessStatus || "READY" }).eq("id", resource.id);
    throw new Error(`Không thể xóa file khỏi Storage; metadata đã được khôi phục. ${removed.error.message}`);
  }
  const deleted = await client.from("learning_resources").delete().eq("id", resource.id);
  if (deleted.error) throw new Error(`File đã được xóa khỏi Storage nhưng metadata chưa thể xóa: ${deleted.error.message}`);
}
