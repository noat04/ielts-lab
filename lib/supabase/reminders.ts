import { getSupabase } from "@/lib/supabase/client";

export type ReminderStatus = "SCHEDULED" | "SNOOZED" | "DISMISSED";

export type StudyReminderSettings = {
  enabled: boolean;
  browserNotifications: boolean;
  pushNotifications: boolean;
  emailNotifications: boolean;
  defaultStudyTime: string;
  lessonLeadMinutes: number;
  examLeadMinutes: number;
  timeZone: string;
};

export type StudyReminder = {
  id: string;
  planId: string;
  lessonId: string;
  examId: string;
  type: "LESSON" | "EXAM";
  title: string;
  scheduledFor: string;
  snoozedUntil: string;
  status: ReminderStatus;
  notifiedAt: string;
};

const DEFAULT_SETTINGS: StudyReminderSettings = {
  enabled: true,
  browserNotifications: false,
  pushNotifications: false,
  emailNotifications: false,
  defaultStudyTime: "19:00",
  lessonLeadMinutes: 30,
  examLeadMinutes: 1440,
  timeZone: "Asia/Bangkok",
};

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function mapSettings(row: Record<string, any>): StudyReminderSettings {
  return {
    enabled: row.enabled,
    browserNotifications: row.browser_notifications,
    pushNotifications: row.push_notifications ?? false,
    emailNotifications: row.email_notifications ?? false,
    defaultStudyTime: row.default_study_time?.slice(0, 5) || "19:00",
    lessonLeadMinutes: row.lesson_lead_minutes,
    examLeadMinutes: row.exam_lead_minutes,
    timeZone: row.time_zone,
  };
}

function mapReminder(row: Record<string, any>): StudyReminder {
  return {
    id: row.id,
    planId: row.plan_id,
    lessonId: row.lesson_id || "",
    examId: row.exam_id || "",
    type: row.reminder_type,
    title: row.title,
    scheduledFor: row.scheduled_for,
    snoozedUntil: row.snoozed_until || "",
    status: row.status,
    notifiedAt: row.notified_at || "",
  };
}

export function reminderEffectiveAt(reminder: StudyReminder) {
  return reminder.status === "SNOOZED" && reminder.snoozedUntil
    ? reminder.snoozedUntil
    : reminder.scheduledFor;
}

export async function loadStudyReminders(userId: string) {
  const client = getSupabase();
  const settingsResult = await client
    .from("study_reminder_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  throwIfError(settingsResult.error);

  let settings = settingsResult.data ? mapSettings(settingsResult.data) : DEFAULT_SETTINGS;
  if (!settingsResult.data) {
    const created = await client.from("study_reminder_settings").insert({
      user_id: userId,
      enabled: DEFAULT_SETTINGS.enabled,
      browser_notifications: DEFAULT_SETTINGS.browserNotifications,
      push_notifications: DEFAULT_SETTINGS.pushNotifications,
      email_notifications: DEFAULT_SETTINGS.emailNotifications,
      default_study_time: DEFAULT_SETTINGS.defaultStudyTime,
      lesson_lead_minutes: DEFAULT_SETTINGS.lessonLeadMinutes,
      exam_lead_minutes: DEFAULT_SETTINGS.examLeadMinutes,
      time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_SETTINGS.timeZone,
    }).select().single();
    throwIfError(created.error);
    settings = mapSettings(created.data);
  }

  const oldest = new Date(Date.now() - 7 * 86400000).toISOString();
  const reminderResult = await client
    .from("study_reminders")
    .select("*")
    .neq("status", "DISMISSED")
    .gte("scheduled_for", oldest)
    .order("scheduled_for", { ascending: true })
    .limit(40);
  throwIfError(reminderResult.error);

  return {
    settings,
    reminders: (reminderResult.data ?? []).map(mapReminder),
  };
}

export async function saveStudyReminderSettings(userId: string, settings: StudyReminderSettings) {
  try {
    new Intl.DateTimeFormat("vi-VN", { timeZone: settings.timeZone }).format();
  } catch {
    throw new Error("Múi giờ không hợp lệ. Ví dụ: Asia/Bangkok.");
  }
  const client = getSupabase();
  const result = await client.from("study_reminder_settings").upsert({
    user_id: userId,
    enabled: settings.enabled,
    browser_notifications: settings.browserNotifications,
    push_notifications: settings.pushNotifications,
    email_notifications: settings.emailNotifications,
    default_study_time: settings.defaultStudyTime,
    lesson_lead_minutes: settings.lessonLeadMinutes,
    exam_lead_minutes: settings.examLeadMinutes,
    time_zone: settings.timeZone,
  }, { onConflict: "user_id" }).select().single();
  throwIfError(result.error);
  const refreshResult = await client.rpc("ielts_lab_refresh_study_reminders");
  throwIfError(refreshResult.error);
  return mapSettings(result.data);
}

export async function savePushSubscription(userId: string, subscription: PushSubscription) {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("Push subscription không hợp lệ.");
  const { error } = await getSupabase().from("push_subscriptions").upsert({
    user_id: userId,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth_key: json.keys.auth,
    user_agent: navigator.userAgent,
    active: true,
  }, { onConflict: "endpoint" });
  throwIfError(error);
}

export async function disablePushSubscription(endpoint: string) {
  const { error } = await getSupabase().from("push_subscriptions").update({ active: false }).eq("endpoint", endpoint);
  throwIfError(error);
}

export async function dismissStudyReminder(id: string) {
  const { error } = await getSupabase().from("study_reminders").update({
    status: "DISMISSED",
    snoozed_until: null,
  }).eq("id", id);
  throwIfError(error);
}

export async function snoozeStudyReminder(id: string, minutes: number) {
  const snoozedUntil = new Date(Date.now() + minutes * 60000).toISOString();
  const { error } = await getSupabase().from("study_reminders").update({
    status: "SNOOZED",
    snoozed_until: snoozedUntil,
    notified_at: null,
  }).eq("id", id);
  throwIfError(error);
  return snoozedUntil;
}

export async function markStudyReminderNotified(id: string) {
  const notifiedAt = new Date().toISOString();
  const { error } = await getSupabase().from("study_reminders").update({ notified_at: notifiedAt }).eq("id", id);
  throwIfError(error);
  return notifiedAt;
}
