import webpush from "npm:web-push@3.6.7";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };

async function rest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  if (!response.ok) throw new Error(await response.text());
  return response.status === 204 ? null : response.json();
}

async function recordDelivery(userId: string, reminderId: string, channel: "PUSH" | "EMAIL", status: "SENT" | "FAILED", message: string) {
  await rest("reminder_deliveries?on_conflict=reminder_id,channel", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: userId, reminder_id: reminderId, channel, status, provider_message: message.slice(0, 1000), sent_at: status === "SENT" ? new Date().toISOString() : null }),
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  if (!serviceKey || !supabaseUrl) return Response.json({ error: "Supabase service configuration is missing" }, { status: 503 });
  const expectedSecret = Deno.env.get("REMINDER_CRON_SECRET");
  if (!expectedSecret || request.headers.get("x-cron-secret") !== expectedSecret) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date().toISOString();
  const settings = await rest("study_reminder_settings?enabled=eq.true&or=(push_notifications.eq.true,email_notifications.eq.true)&select=user_id,push_notifications,email_notifications");
  const enabledByUser = new Map(settings.map((item: Record<string, unknown>) => [item.user_id, item]));
  if (!enabledByUser.size) return Response.json({ due: 0, push: 0, email: 0 });
  const reminders = await rest(`study_reminders?status=neq.DISMISSED&scheduled_for=lte.${encodeURIComponent(now)}&select=id,user_id,title,reminder_type,scheduled_for,snoozed_until,status&limit=500`);
  const due = reminders.filter((item: Record<string, string>) => enabledByUser.has(item.user_id) && (!item.snoozed_until || item.status !== "SNOOZED" || item.snoozed_until <= now));
  let pushSent = 0;
  let emailSent = 0;

  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  if (vapidPublic && vapidPrivate) webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com", vapidPublic, vapidPrivate);

  for (const reminder of due) {
    const config = enabledByUser.get(reminder.user_id) as Record<string, boolean>;
    const deliveries = await rest(`reminder_deliveries?reminder_id=eq.${reminder.id}&status=eq.SENT&select=channel`);
    const delivered = new Set(deliveries.map((item: Record<string, string>) => item.channel));
    let deliveredNow = false;

    if (config.push_notifications && !delivered.has("PUSH") && vapidPublic && vapidPrivate) {
      const subscriptions = await rest(`push_subscriptions?user_id=eq.${reminder.user_id}&active=eq.true&select=id,endpoint,p256dh,auth_key`);
      try {
        if (!subscriptions.length) throw new Error("No active push subscription");
        const payload = JSON.stringify({ title: reminder.reminder_type === "EXAM" ? "Nhắc lịch thi IELTS" : "Đến giờ học IELTS", body: reminder.title, url: "/", tag: `ielts-lab-${reminder.id}` });
        const results = await Promise.allSettled(subscriptions.map((subscription: Record<string, string>) => webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth_key } }, payload)));
        const successful = results.filter((result) => result.status === "fulfilled").length;
        for (let index = 0; index < results.length; index += 1) {
          const result = results[index];
          if (result.status === "rejected" && [404, 410].includes(result.reason?.statusCode)) await rest(`push_subscriptions?id=eq.${subscriptions[index].id}`, { method: "PATCH", body: JSON.stringify({ active: false }) });
        }
        if (!successful) throw new Error("All push endpoints rejected the notification");
        await recordDelivery(reminder.user_id, reminder.id, "PUSH", "SENT", `Delivered to ${successful} subscription(s)`);
        pushSent += 1; deliveredNow = true;
      } catch (error) {
        await recordDelivery(reminder.user_id, reminder.id, "PUSH", "FAILED", error instanceof Error ? error.message : "Push failed");
      }
    }

    if (config.email_notifications && !delivered.has("EMAIL") && Deno.env.get("RESEND_API_KEY")) {
      try {
        const userResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users/${reminder.user_id}`, { headers });
        if (!userResponse.ok) throw new Error(await userResponse.text());
        const user = await userResponse.json();
        if (!user.email) throw new Error("User has no email");
        const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: Deno.env.get("REMINDER_FROM_EMAIL") ?? "IELTS Lab <onboarding@resend.dev>", to: [user.email], subject: reminder.reminder_type === "EXAM" ? "Nhắc lịch thi IELTS" : "Đến giờ học IELTS", text: `${reminder.title}\n\nMở IELTS Lab để xem và xử lý lịch học.` }) });
        if (!response.ok) throw new Error(await response.text());
        const result = await response.json();
        await recordDelivery(reminder.user_id, reminder.id, "EMAIL", "SENT", result.id ?? "Sent");
        emailSent += 1; deliveredNow = true;
      } catch (error) {
        await recordDelivery(reminder.user_id, reminder.id, "EMAIL", "FAILED", error instanceof Error ? error.message : "Email failed");
      }
    }
    if (deliveredNow) await rest(`study_reminders?id=eq.${reminder.id}`, { method: "PATCH", body: JSON.stringify({ notified_at: now }) });
  }
  return Response.json({ due: due.length, push: pushSent, email: emailSent });
});
