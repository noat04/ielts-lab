"use client";

import { useEffect, useRef, useState } from "react";
import type { StudyTask } from "@/lib/supabase/sprints";

export type RecordingValue = { blob: Blob; durationSeconds: number } | null;

export function PracticeFields({ task, answer, evidence, selfCorrect, structured, recording, onAnswer, onEvidence, onSelfCorrect, onStructured, onRecording }: {
  task: StudyTask;
  answer: string;
  evidence: string;
  selfCorrect: boolean;
  structured: Record<string, string>;
  recording: RecordingValue;
  onAnswer: (value: string) => void;
  onEvidence: (value: string) => void;
  onSelfCorrect: (value: boolean) => void;
  onStructured: (value: Record<string, string>) => void;
  onRecording: (value: RecordingValue) => void;
}) {
  const set = (key: string, value: string) => onStructured({ ...structured, [key]: value });
  const field = (label: string, key: string, placeholder = "") => <label>{label}<input value={structured[key] ?? ""} onChange={(event) => set(key, event.target.value)} placeholder={placeholder}/></label>;
  const area = (label: string, key: string, placeholder = "") => <label className="wide">{label}<textarea rows={3} value={structured[key] ?? ""} onChange={(event) => set(key, event.target.value)} placeholder={placeholder}/></label>;

  return <div className="practice-fields">
    {task.workflowType === "LISTENING_PREDICTION" && <><div className="workflow-tip"><b>ANCHOR → TARGET → PARAPHRASE → DISTRACTOR → ANSWER</b><span>Dự đoán trước khi nghe, sau đó mới nhập đáp án.</span></div><div className="form-grid">{field("Anchor words", "anchors", "product / consumers")}<label>Target type<select value={structured.targetType ?? "NOUN"} onChange={(event) => set("targetType", event.target.value)}><option>NOUN</option><option>VERB</option><option>ADJECTIVE</option><option>NUMBER</option><option>NAME</option><option>PHRASE</option></select></label>{area("Predicted meaning", "predictedMeaning")}{area("Paraphrase nhận ra", "paraphrase")}{area("Distractor cần tránh", "distractor")}</div></>}
    {task.workflowType === "READING_EVIDENCE" && <><div className="workflow-tip"><b>KEYWORD → PREDICT PARAPHRASE → LOCATE → EVIDENCE → ANSWER</b><span>Buộc lưu dấu vết tìm đáp án thay vì chỉ chọn phương án.</span></div><div className="form-grid">{field("Keyword", "keyword")}{field("Paragraph", "paragraph", "A / B / C / D")}{area("Predict paraphrase", "predictedParaphrase")}{area("Evidence line", "evidenceLine")}</div></>}
    {task.workflowType === "SENTENCE_COMPLETION" && <><div className="workflow-tip"><b>WORD TYPE → GRAMMAR PATTERN → MEANING → SCAN → ANSWER</b><span>Hoàn thành grammar prediction trước khi scan bài.</span></div><div className="form-grid"><label>Word type<select value={structured.wordType ?? "NOUN"} onChange={(event) => set("wordType", event.target.value)}><option>NOUN</option><option>VERB</option><option>ADJECTIVE</option><option>ADVERB</option><option>NUMBER</option><option>PHRASE</option></select></label>{field("Grammar pattern", "grammarPattern", "both NOUN and NOUN")}{area("Predicted meaning", "predictedMeaning")}</div></>}
    {task.workflowType === "WRITING_AREA" && <><div className="workflow-tip"><b>TOPIC → BRAINSTORM → S + V + O → A-R-E-A → PARAGRAPH</b><span>Xây câu và lập luận trước khi viết đoạn hoàn chỉnh.</span></div><div className="form-grid">{area("Brainstorm", "brainstorm")}{area("Core idea", "idea")}{field("Subject", "subject")}{field("Verb", "verb")}{area("Object / complement", "object")}{area("Assertion", "assertion")}{area("Reason", "reason")}{area("Explanation", "explanation")}{area("Example", "example")}</div></>}
    {task.workflowType === "SPEAKING_CUE_CARD" && <><div className="workflow-tip"><b>CUE CARD → 1-MINUTE NOTES → SENTENCE LIBRARY → RECORD → RETRY</b><span>Ghi ý ngắn, nói thành tiếng rồi tự phân tích.</span></div><div className="form-grid">{area("1-minute notes", "notes", "watch · grandfather · 20 years · family memory")}{area("Sentence library / chunks", "sentenceLibrary", "I think… / The main reason is… / For example…")}{area("Vấn đề sau khi nghe lại", "problems", "pauses, tense, incomplete sentences…")}</div><SpeakingRecorder value={recording} onChange={onRecording}/></>}

    {task.answerType === "long_text" ? <textarea rows={8} value={answer} onChange={(event) => onAnswer(event.target.value)} placeholder={task.workflowType === "WRITING_AREA" ? "Build paragraph…" : "Nhập bài làm…"}/> : task.answerType === "self_check" ? <label className="self-check"><input type="checkbox" checked={selfCorrect} onChange={(event) => onSelfCorrect(event.target.checked)}/> Tôi đã hoàn thành đúng yêu cầu và tự kiểm tra</label> : <input value={answer} onChange={(event) => onAnswer(event.target.value)} placeholder="Nhập câu trả lời…"/>}
    <label className="evidence-field">Evidence / vị trí tìm thấy đáp án<textarea rows={2} value={evidence} onChange={(event) => onEvidence(event.target.value)}/></label>
  </div>;
}

function SpeakingRecorder({ value, onChange }: { value: RecordingValue; onChange: (value: RecordingValue) => void }) {
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const [recording, setRecording] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => () => { stream.current?.getTracks().forEach((track) => track.stop()); if (url) URL.revokeObjectURL(url); }, [url]);

  async function start() {
    setError("");
    try {
      const microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = microphone; chunks.current = []; startedAt.current = Date.now();
      const next = new MediaRecorder(microphone);
      recorder.current = next;
      next.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      next.onstop = () => {
        const blob = new Blob(chunks.current, { type: next.mimeType || "audio/webm" });
        const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
        if (url) URL.revokeObjectURL(url);
        setUrl(URL.createObjectURL(blob)); onChange({ blob, durationSeconds });
        microphone.getTracks().forEach((track) => track.stop()); setRecording(false);
      };
      next.start(); setRecording(true);
    } catch { setError("Không thể truy cập microphone. Hãy cấp quyền ghi âm cho trình duyệt."); }
  }

  function stop() { if (recorder.current?.state === "recording") recorder.current.stop(); }

  return <div className="speaking-recorder"><div><small>SPEAKING RECORDING</small><b>{recording ? "Đang ghi âm…" : value ? `${value.durationSeconds} giây` : "Chưa có bản ghi"}</b></div>{recording ? <button type="button" onClick={stop}>■ Dừng</button> : <button type="button" onClick={() => void start()}>{value ? "↻ Ghi lại" : "● Bắt đầu ghi"}</button>}{url && <audio controls src={url}/>} {error && <span>{error}</span>}</div>;
}
