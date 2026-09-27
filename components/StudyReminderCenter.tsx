"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  dismissStudyReminder,
  loadStudyReminders,
  markStudyReminderNotified,
  reminderEffectiveAt,
  saveStudyReminderSettings,
  snoozeStudyReminder,
  type StudyReminder,
  type StudyReminderSettings,
} from "@/lib/supabase/reminders";

function formatReminderDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function reminderLabel(reminder: StudyReminder) {
  const timestamp = new Date(reminderEffectiveAt(reminder)).getTime();
  const difference = timestamp - Date.now();
  if (difference <= 0) return "Đến giờ";
  if (difference < 3600000) return `Còn ${Math.max(1, Math.ceil(difference / 60000))} phút`;
  if (difference < 86400000) return `Còn ${Math.ceil(difference / 3600000)} giờ`;
  return `Còn ${Math.ceil(difference / 86400000)} ngày`;
}

export function StudyReminderCenter({ userId, onOpenPlanner }: { userId: string; onOpenPlanner: () => void }) {
  const [settings, setSettings] = useState<StudyReminderSettings | null>(null);
  const [draft, setDraft] = useState<StudyReminderSettings | null>(null);
  const [reminders, setReminders] = useState<StudyReminder[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const notifying = useRef(new Set<string>());

  const refresh = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const data = await loadStudyReminders(userId);
      setSettings(data.settings);
      setDraft((current) => current ?? data.settings);
      setReminders(data.reminders);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải lịch nhắc.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh(true);
    const timer = window.setInterval(() => void refresh(), 60000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!settings?.enabled || !settings.browserNotifications || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const due = reminders.filter((reminder) =>
      !reminder.notifiedAt
      && new Date(reminderEffectiveAt(reminder)).getTime() <= Date.now()
      && !notifying.current.has(reminder.id)
    );
    due.forEach((reminder) => {
      notifying.current.add(reminder.id);
      const notification = new Notification(reminder.type === "EXAM" ? "Nhắc lịch thi IELTS" : "Đến giờ học IELTS", {
        body: reminder.title,
        tag: `ielts-lab-${reminder.id}`,
      });
      notification.onclick = () => { window.focus(); setOpen(true); };
      void markStudyReminderNotified(reminder.id)
        .then((notifiedAt) => setReminders((current) => current.map((item) => item.id === reminder.id ? { ...item, notifiedAt } : item)))
        .catch(() => notifying.current.delete(reminder.id));
    });
  }, [reminders, settings]);

  const activeReminders = useMemo(() => [...reminders].sort((a, b) =>
    reminderEffectiveAt(a).localeCompare(reminderEffectiveAt(b))
  ), [reminders]);
  const dueCount = settings?.enabled
    ? activeReminders.filter((reminder) => new Date(reminderEffectiveAt(reminder)).getTime() <= Date.now()).length
    : 0;

  async function enableBrowserNotifications() {
    if (!draft || typeof Notification === "undefined") {
      setError("Trình duyệt này không hỗ trợ thông báo.");
      return;
    }
    if (draft.browserNotifications) {
      setDraft({ ...draft, browserNotifications: false });
      setError("");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setError("Quyền thông báo chưa được cấp trong trình duyệt.");
      return;
    }
    setDraft({ ...draft, browserNotifications: true });
    setError("");
  }

  async function saveSettings() {
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      const saved = await saveStudyReminderSettings(userId, draft);
      setSettings(saved);
      setDraft(saved);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể lưu cài đặt nhắc lịch.");
    } finally {
      setSaving(false);
    }
  }

  async function dismiss(reminder: StudyReminder) {
    try {
      await dismissStudyReminder(reminder.id);
      setReminders((current) => current.filter((item) => item.id !== reminder.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể bỏ qua lời nhắc.");
    }
  }

  async function snooze(reminder: StudyReminder, minutes: number) {
    try {
      const snoozedUntil = await snoozeStudyReminder(reminder.id, minutes);
      setReminders((current) => current.map((item) => item.id === reminder.id
        ? { ...item, status: "SNOOZED", snoozedUntil, notifiedAt: "" }
        : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể hoãn lời nhắc.");
    }
  }

  return <>
    <button className="reminder-bell" onClick={() => setOpen(true)} aria-label="Mở nhắc lịch học">
      <span>🔔</span><span className="reminder-bell-label">Nhắc lịch</span>{dueCount > 0 && <i>{dueCount > 9 ? "9+" : dueCount}</i>}
    </button>
    {open && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="reminder-center">
        <header><div><small>STUDY REMINDER CENTER</small><h2>Nhắc lịch học</h2><p>Lịch được đồng bộ từ bài học và kỳ thi đã lên kế hoạch.</p></div><button onClick={() => setOpen(false)}>×</button></header>
        {error && <div className="reminder-error">{error}</div>}
        {loading || !draft ? <div className="reminder-empty">Đang tải lịch nhắc…</div> : <>
          <div className="reminder-layout">
            <div className="reminder-list">
              <div className="reminder-list-head"><b>Sắp tới & cần xử lý</b><span>{activeReminders.length} lời nhắc</span></div>
              {activeReminders.map((reminder) => {
                const due = new Date(reminderEffectiveAt(reminder)).getTime() <= Date.now();
                return <article key={reminder.id} className={due ? "due" : ""}>
                  <span className="reminder-icon">{reminder.type === "EXAM" ? "◎" : "◷"}</span>
                  <div><small>{reminder.type === "EXAM" ? "KỲ THI / KIỂM TRA" : "BÀI HỌC"} · {reminderLabel(reminder)}</small><b>{reminder.title}</b><p>{formatReminderDate(reminderEffectiveAt(reminder))}{reminder.status === "SNOOZED" ? " · Đã hoãn" : ""}</p></div>
                  <aside><button onClick={() => void snooze(reminder, 15)}>＋15 phút</button><button onClick={() => void snooze(reminder, 60)}>＋1 giờ</button><button className="dismiss" onClick={() => void dismiss(reminder)}>Bỏ qua</button></aside>
                </article>;
              })}
              {!activeReminders.length && <div className="reminder-empty">Không có lịch học hoặc kỳ thi nào cần nhắc.</div>}
              <button className="reminder-open-planner" onClick={() => { setOpen(false); onOpenPlanner(); }}>Mở lộ trình và lịch học →</button>
            </div>
            <form className="reminder-settings" onSubmit={(event) => { event.preventDefault(); void saveSettings(); }}>
              <h3>Cài đặt nhắc lịch</h3>
              <label className="reminder-toggle"><span><b>Bật nhắc lịch</b><small>Hiển thị lịch sắp tới và quá hạn.</small></span><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}/></label>
              <label>Giờ học mặc định<input type="time" value={draft.defaultStudyTime} onChange={(event) => setDraft({ ...draft, defaultStudyTime: event.target.value })}/></label>
              <label>Nhắc trước bài học<select value={draft.lessonLeadMinutes} onChange={(event) => setDraft({ ...draft, lessonLeadMinutes: Number(event.target.value) })}><option value={0}>Đúng giờ</option><option value={15}>15 phút</option><option value={30}>30 phút</option><option value={60}>1 giờ</option><option value={1440}>1 ngày</option></select></label>
              <label>Nhắc trước kỳ thi<select value={draft.examLeadMinutes} onChange={(event) => setDraft({ ...draft, examLeadMinutes: Number(event.target.value) })}><option value={60}>1 giờ</option><option value={1440}>1 ngày</option><option value={2880}>2 ngày</option><option value={10080}>1 tuần</option></select></label>
              <label>Múi giờ<input value={draft.timeZone} onChange={(event) => setDraft({ ...draft, timeZone: event.target.value })}/></label>
              <div className="browser-notification"><b>Thông báo trình duyệt</b><small>{typeof Notification === "undefined" ? "Không được hỗ trợ" : Notification.permission === "granted" ? "Đã được cấp quyền" : "Cần bạn cấp quyền"}</small><button type="button" onClick={() => void enableBrowserNotifications()}>{draft.browserNotifications ? "Tắt thông báo" : "Bật thông báo"}</button></div>
              <button className="primary" disabled={saving}>{saving ? "Đang lưu…" : "Lưu cài đặt"}</button>
              <p className="reminder-note">Thông báo trình duyệt hoạt động khi website đang mở. Lịch vẫn được lưu trên Supabase để bạn xem lại trên mọi thiết bị.</p>
            </form>
          </div>
        </>}
      </section>
    </div>}
  </>;
}
