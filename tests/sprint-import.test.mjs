import test from "node:test";
import assert from "node:assert/strict";
import { parseSprintFile } from "../lib/sprint-import.ts";

test("CSV import creates sessions, source mappings and tasks", () => {
  const csv = `sprint_title,start_date,sprint_objective,date,time,skill,session_title,duration,source_title,source_url,tasks
Week A,2026-09-28,Improve Reading,2026-09-28,19:30,Reading,Matching headings,45,Cambridge 18,https://example.com/book,"Warm up::Predict headings::::warmup::text;;Q1::Choose A::A::reading::text"`;
  const draft = parseSprintFile("week.csv", csv);
  assert.equal(draft.title, "Week A");
  assert.equal(draft.sessions.length, 1);
  assert.equal(draft.sessions[0].sourceTitle, "Cambridge 18");
  assert.equal(draft.sessions[0].tasks.length, 2);
  assert.equal(draft.sessions[0].tasks[1].correctAnswer, "A");
});

test("import rejects unsupported files and ignores sessions outside the sprint", () => {
  assert.throws(() => parseSprintFile("week.docx", "x"), /\.csv/);
  const text = `# Week B
start_date: 2026-09-28
2026-10-10 | Reading | Outside | 30`;
  const draft = parseSprintFile("week.md", text);
  assert.equal(draft.sessions.length, 0);
  assert.equal(draft.warnings.length, 1);
});
