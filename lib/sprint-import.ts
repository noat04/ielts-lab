export const SPRINT_IMPORT_SKILLS = ["Listening", "Reading", "Writing", "Speaking", "Grammar / Vocab", "Mock Test", "Review"] as const;

export type ImportedSprintSession = {
  date: string;
  studyTime: string;
  skill: string;
  title: string;
  objective: string;
  duration: number;
  targetScore: number | null;
  sourceTitle: string;
  sourceUrl: string;
  tasks: ImportedSprintTask[];
};

export type ImportedSprintTask = {
  title: string;
  question: string;
  correctAnswer: string;
  taskType: "warmup" | "practice" | "listening" | "reading" | "writing" | "speaking" | "review";
  answerType: "text" | "long_text" | "number" | "self_check";
};

export type SprintImportDraft = {
  title: string;
  startDate: string;
  objective: string;
  targets: Record<string, number>;
  sessions: ImportedSprintSession[];
  warnings: string[];
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function localISO(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function nextMonday() {
  const date = new Date();
  const offset = date.getDay() === 0 ? 1 : 8 - date.getDay();
  date.setDate(date.getDate() + offset);
  return localISO(date);
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
}

function mapSkill(value: string) {
  const key = normalize(value);
  const aliases: Record<string, string> = {
    listening: "Listening", nghe: "Listening",
    reading: "Reading", doc: "Reading",
    writing: "Writing", viet: "Writing",
    speaking: "Speaking", noi: "Speaking",
    grammar: "Grammar / Vocab", vocab: "Grammar / Vocab", grammar_vocab: "Grammar / Vocab", ngu_phap_tu_vung: "Grammar / Vocab",
    mock: "Mock Test", mock_test: "Mock Test", thi_thu: "Mock Test",
    review: "Review", on_tap: "Review",
  };
  return aliases[key] ?? SPRINT_IMPORT_SKILLS.find((skill) => normalize(skill) === key) ?? "";
}

function parseNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseCsvLine(line: string, delimiter = ",") {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') { current += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === delimiter && !quoted) { values.push(current.trim()); current = ""; }
    else current += character;
  }
  values.push(current.trim());
  return values;
}

function studyTime(value: string, warnings: string[], label: string) {
  if (!value) return "";
  if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return value;
  warnings.push(`${label}: giờ học “${value}” không hợp lệ và đã được bỏ qua.`);
  return "";
}

function valueOf(row: Record<string, string>, ...keys: string[]) {
  for (const key of keys) if (row[key]?.trim()) return row[key].trim();
  return "";
}

function defaultTaskType(skill: string): ImportedSprintTask["taskType"] {
  const mapped: Record<string, ImportedSprintTask["taskType"]> = { Listening: "listening", Reading: "reading", Writing: "writing", Speaking: "speaking", Review: "review" };
  return mapped[skill] ?? "practice";
}

function parseTasks(value: string, skill: string, warnings: string[], label: string) {
  if (!value.trim()) return [];
  return value.split(";;").flatMap((raw, index) => {
    const [title, question = "", correctAnswer = "", rawType = "", rawAnswerType = ""] = raw.split("::").map((item) => item.trim());
    if (!title) { warnings.push(`${label}, task ${index + 1}: thiếu tên task.`); return []; }
    const taskType = (["warmup", "practice", "listening", "reading", "writing", "speaking", "review"].includes(normalize(rawType)) ? normalize(rawType) : defaultTaskType(skill)) as ImportedSprintTask["taskType"];
    const answerType = (["text", "long_text", "number", "self_check"].includes(normalize(rawAnswerType)) ? normalize(rawAnswerType) : ["writing", "speaking"].includes(taskType) ? "self_check" : "text") as ImportedSprintTask["answerType"];
    return [{ title, question: question || title, correctAnswer, taskType, answerType }];
  });
}

function defaultTargets() {
  return Object.fromEntries(SPRINT_IMPORT_SKILLS.slice(0, 5).map((skill) => [skill, 65]));
}

function parseCsv(content: string): SprintImportDraft {
  const warnings: string[] = [];
  const rawLines = content.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (rawLines.length < 2) throw new Error("CSV cần có một dòng tiêu đề và ít nhất một dòng dữ liệu.");
  const delimiter = (rawLines[0].match(/;/g)?.length ?? 0) > (rawLines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const headers = parseCsvLine(rawLines[0], delimiter).map(normalize);
  const rows = rawLines.slice(1).map((line) => {
    const cells = parseCsvLine(line, delimiter);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
  const first = rows[0];
  const targets = defaultTargets();
  for (const skill of SPRINT_IMPORT_SKILLS.slice(0, 5)) {
    const key = `target_${normalize(skill)}`;
    const raw = valueOf(first, key);
    if (raw) targets[skill] = Math.max(0, Math.min(100, parseNumber(raw, 65)));
  }
  const sessions = rows.flatMap((row, index) => {
    const date = valueOf(row, "date", "session_date", "lesson_date", "ngay", "ngay_hoc");
    const skill = mapSkill(valueOf(row, "skill", "ky_nang"));
    const title = valueOf(row, "session_title", "lesson_title", "title", "ten_bai", "bai_hoc");
    if (!date && !skill && !title) return [];
    if (!validDate(date) || !skill || !title) {
      warnings.push(`Dòng ${index + 2}: bỏ qua vì thiếu ngày YYYY-MM-DD, kỹ năng hợp lệ hoặc tên bài.`);
      return [];
    }
    const duration = Math.max(5, Math.min(1440, parseNumber(valueOf(row, "duration", "duration_minutes", "minutes", "thoi_luong"), 30)));
    const targetRaw = valueOf(row, "target_score", "session_target", "muc_tieu_diem");
    const label = `Dòng ${index + 2}`;
    return [{
      date,
      studyTime: studyTime(valueOf(row, "time", "study_time", "gio_hoc"), warnings, label),
      skill,
      title,
      objective: valueOf(row, "session_objective", "lesson_objective", "objective", "muc_tieu_bai"),
      duration,
      targetScore: targetRaw ? Math.max(0, Math.min(100, parseNumber(targetRaw, 65))) : null,
      sourceTitle: valueOf(row, "source_title", "document_title", "tai_lieu"),
      sourceUrl: valueOf(row, "source_url", "material_url", "link_tai_lieu"),
      tasks: parseTasks(valueOf(row, "tasks", "study_tasks", "bai_tap"), skill, warnings, label),
    }];
  });
  const dates = sessions.map((item) => item.date).sort();
  const startDate = valueOf(first, "start_date", "sprint_start", "ngay_bat_dau") || dates[0] || nextMonday();
  return {
    title: valueOf(first, "sprint_title", "week_title", "ten_tuan") || "Weekly Sprint nhập từ CSV",
    startDate,
    objective: valueOf(first, "sprint_objective", "week_objective", "muc_tieu_tuan") || "Hoàn thành kế hoạch học đã nhập.",
    targets,
    sessions,
    warnings,
  };
}

function metadataValue(lines: string[], aliases: string[]) {
  for (const line of lines) {
    const clean = line.replace(/^\s*[-*#]+\s*/, "");
    const separator = clean.indexOf(":");
    if (separator < 0) continue;
    if (aliases.includes(normalize(clean.slice(0, separator)))) return clean.slice(separator + 1).trim();
  }
  return "";
}

function parseText(content: string): SprintImportDraft {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const warnings: string[] = [];
  const targets = defaultTargets();
  for (const skill of SPRINT_IMPORT_SKILLS.slice(0, 5)) {
    const value = metadataValue(lines, [`target_${normalize(skill)}`, `muc_tieu_${normalize(skill)}`]);
    if (value) targets[skill] = Math.max(0, Math.min(100, parseNumber(value, 65)));
  }

  let sessionLines = lines.filter((line) => /^[-*]?\s*\d{4}-\d{2}-\d{2}\s*\|/.test(line));
  const tableHeaderIndex = lines.findIndex((line) => line.includes("|") && ["date", "ngay"].includes(normalize(line.split("|").filter(Boolean)[0] || "")));
  if (tableHeaderIndex >= 0) sessionLines = lines.slice(tableHeaderIndex + 1).filter((line) => line.includes("|") && !/^\|?\s*[-:]+/.test(line));

  const sessions = sessionLines.flatMap((line, index) => {
    const cells = line.replace(/^[-*]\s*/, "").split("|").map((cell) => cell.trim()).filter((cell, cellIndex, all) => cell || (cellIndex > 0 && cellIndex < all.length - 1));
    const [date, rawSkill, title, durationRaw, objective = "", rawStudyTime = "", targetRaw = "", sourceTitle = "", sourceUrl = "", rawTasks = ""] = cells;
    const skill = mapSkill(rawSkill || "");
    if (!validDate(date || "") || !skill || !title) {
      warnings.push(`Session ${index + 1}: bỏ qua vì dữ liệu không hợp lệ.`);
      return [];
    }
    return [{
      date,
      studyTime: studyTime(rawStudyTime, warnings, `Session ${index + 1}`),
      skill,
      title,
      objective,
      duration: Math.max(5, Math.min(1440, parseNumber(durationRaw, 30))),
      targetScore: targetRaw ? Math.max(0, Math.min(100, parseNumber(targetRaw, 65))) : null,
      sourceTitle,
      sourceUrl,
      tasks: parseTasks(rawTasks, skill, warnings, `Session ${index + 1}`),
    }];
  });
  const dates = sessions.map((item) => item.date).sort();
  const title = metadataValue(lines, ["title", "sprint_title", "week_title", "ten_tuan"])
    || lines.find((line) => /^#\s+/.test(line))?.replace(/^#+\s*/, "")
    || "Weekly Sprint nhập từ văn bản";
  return {
    title,
    startDate: metadataValue(lines, ["start_date", "sprint_start", "ngay_bat_dau"]) || dates[0] || nextMonday(),
    objective: metadataValue(lines, ["objective", "sprint_objective", "week_objective", "muc_tieu_tuan"]) || "Hoàn thành kế hoạch học đã nhập.",
    targets,
    sessions,
    warnings,
  };
}

export function parseSprintFile(fileName: string, content: string): SprintImportDraft {
  if (content.length > 1024 * 1024) throw new Error("File vượt quá giới hạn 1 MB.");
  const extension = fileName.toLowerCase().split(".").pop();
  if (!extension || !["csv", "txt", "text", "md"].includes(extension)) throw new Error("Chỉ hỗ trợ file .csv, .txt, .text hoặc .md.");
  const draft = extension === "csv" ? parseCsv(content) : parseText(content);
  if (!validDate(draft.startDate)) throw new Error("Ngày bắt đầu phải theo định dạng YYYY-MM-DD.");
  const end = addDays(draft.startDate, 6);
  const sessions = draft.sessions.filter((session) => {
    if (session.date >= draft.startDate && session.date <= end) return true;
    draft.warnings.push(`Bỏ qua “${session.title}” vì ngày học nằm ngoài tuần ${draft.startDate}–${end}.`);
    return false;
  });
  if (sessions.length > 100) draft.warnings.push(`File có ${sessions.length} session; chỉ 100 session đầu tiên được sử dụng.`);
  return { ...draft, sessions: sessions.slice(0, 100) };
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localISO(date);
}

export const SPRINT_IMPORT_TEMPLATE = `sprint_title,start_date,sprint_objective,target_listening,target_reading,target_writing,target_speaking,target_grammar_vocab,date,time,skill,session_title,duration,target_score,session_objective,source_title,source_url,tasks
IELTS Week 1,2026-09-28,Củng cố Reading và Listening,70,70,65,65,70,2026-09-28,19:00,Listening,Listening Section 1,45,70,Làm đề và chữa distractor,Cambridge IELTS,https://example.com/listening,"Prediction::Dự đoán từ loại::::warmup::text;;Questions 1-5::Nghe và trả lời Q1-5::sample answer::listening::text"
IELTS Week 1,2026-09-28,Củng cố Reading và Listening,70,70,65,65,70,2026-09-30,19:30,Reading,Matching Headings,60,70,Tìm evidence và phân tích paraphrase,Cambridge IELTS,https://example.com/reading,"Matching headings::Chọn heading phù hợp::A::reading::text"`;
