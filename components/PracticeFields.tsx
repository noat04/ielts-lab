"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { StudyTask } from "@/lib/supabase/sprints";

export type RecordingValue = { blob: Blob; durationSeconds: number } | null;

export function PracticeFields({ task, answer, evidence, selfCorrect, structured, recording, onAnswer, onEvidence, onSelfCorrect, onStructured, onRecording, onSubmit, submitDisabled = false }: {
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
  onSubmit?: () => void;
  submitDisabled?: boolean;
}) {
  const answerField = useRef<HTMLTextAreaElement | null>(null);
  const set = (key: string, value: string) => onStructured({ ...structured, [key]: value });
  const field = (label: string, key: string, placeholder = "") => <label>{label}<input value={structured[key] ?? ""} onChange={(event) => set(key, event.target.value)} placeholder={placeholder}/></label>;
  const area = (label: string, key: string, placeholder = "") => <label className="wide">{label}<textarea rows={3} value={structured[key] ?? ""} onChange={(event) => set(key, event.target.value)} placeholder={placeholder}/></label>;

  useEffect(() => { answerField.current?.focus(); }, [task.id]);

  const evidenceGuide = task.workflowType === "LISTENING_PREDICTION"
    ? { placeholder: "Ví dụ: Track 23 · 01:42 · speaker nói ‘guided walk’ sau anchor ‘afternoon’", templates: ["Track __ · __:__", "Anchor: __ → nghe thấy: __"] }
    : task.workflowType === "READING_EVIDENCE" || task.workflowType === "SENTENCE_COMPLETION"
      ? { placeholder: "Ví dụ: Đoạn C · dòng 4–6 · ‘the number declined sharply…’", templates: ["Đoạn __ · dòng __", "Trang __ · câu chứa: __"] }
      : task.workflowType === "WRITING_AREA"
        ? { placeholder: "Ví dụ: Body 1 · câu 2 · dùng AREA / số liệu hoặc nguồn hỗ trợ ý", templates: ["Đoạn __ · câu __", "Ví dụ / nguồn: __"] }
        : task.workflowType === "SPEAKING_CUE_CARD"
          ? { placeholder: "Ví dụ: 00:35 · ngập ngừng sau ‘because’; cần sửa thì quá khứ", templates: ["Mốc __:__ · vấn đề: __", "Câu cần nghe lại: __"] }
          : { placeholder: "Ghi trang, đoạn, dòng, timestamp hoặc câu chứa bằng chứng…", templates: ["Trang __ · dòng __", "Vị trí: __"] };

  function appendEvidence(template: string) {
    onEvidence(evidence.trim() ? `${evidence.trim()}\n${template}` : template);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && onSubmit && !submitDisabled) {
      event.preventDefault();
      onSubmit();
    }
  }

  return <div className="practice-fields" onKeyDown={handleKeyDown}>
    {task.workflowType === "LISTENING_PREDICTION" && <><div className="workflow-tip"><b>ANCHOR → TARGET → PARAPHRASE → DISTRACTOR → ANSWER</b><span>Dự đoán trước khi nghe, sau đó mới nhập đáp án.</span></div><div className="form-grid">{field("Anchor words", "anchors", "product / consumers")}<label>Target type<select value={structured.targetType ?? "NOUN"} onChange={(event) => set("targetType", event.target.value)}><option>NOUN</option><option>VERB</option><option>ADJECTIVE</option><option>NUMBER</option><option>NAME</option><option>PHRASE</option></select></label>{area("Predicted meaning", "predictedMeaning")}{area("Paraphrase nhận ra", "paraphrase")}{area("Distractor cần tránh", "distractor")}</div></>}
    {task.workflowType === "READING_EVIDENCE" && <><div className="workflow-tip"><b>KEYWORD → PREDICT PARAPHRASE → LOCATE → EVIDENCE → ANSWER</b><span>Buộc lưu dấu vết tìm đáp án thay vì chỉ chọn phương án.</span></div><div className="form-grid">{field("Keyword", "keyword")}{field("Paragraph", "paragraph", "A / B / C / D")}{area("Predict paraphrase", "predictedParaphrase")}{area("Evidence line", "evidenceLine")}</div></>}
    {task.workflowType === "SENTENCE_COMPLETION" && <><div className="workflow-tip"><b>WORD TYPE → GRAMMAR PATTERN → MEANING → SCAN → ANSWER</b><span>Hoàn thành grammar prediction trước khi scan bài.</span></div><div className="form-grid"><label>Word type<select value={structured.wordType ?? "NOUN"} onChange={(event) => set("wordType", event.target.value)}><option>NOUN</option><option>VERB</option><option>ADJECTIVE</option><option>ADVERB</option><option>NUMBER</option><option>PHRASE</option></select></label>{field("Grammar pattern", "grammarPattern", "both NOUN and NOUN")}{area("Predicted meaning", "predictedMeaning")}</div></>}
    {task.workflowType === "WRITING_AREA" && <><div className="workflow-tip"><b>TOPIC → BRAINSTORM → S + V + O → A-R-E-A → PARAGRAPH</b><span>Xây câu và lập luận trước khi viết đoạn hoàn chỉnh.</span></div><div className="form-grid">{area("Brainstorm", "brainstorm")}{area("Core idea", "idea")}{field("Subject", "subject")}{field("Verb", "verb")}{area("Object / complement", "object")}{area("Assertion", "assertion")}{area("Reason", "reason")}{area("Explanation", "explanation")}{area("Example", "example")}</div></>}
    {task.workflowType === "SPEAKING_CUE_CARD" && <><div className="workflow-tip"><b>CUE CARD → 1-MINUTE NOTES → SENTENCE LIBRARY → RECORD → RETRY</b><span>Ghi ý ngắn, nói thành tiếng rồi tự phân tích.</span></div><div className="form-grid">{area("1-minute notes", "notes", "watch · grandfather · 20 years · family memory")}{area("Sentence library / chunks", "sentenceLibrary", "I think… / The main reason is… / For example…")}{area("Vấn đề sau khi nghe lại", "problems", "pauses, tense, incomplete sentences…")}</div><SpeakingRecorder value={recording} onChange={onRecording}/></>}

    <div className="response-workspace">
      <label className="answer-field"><span><b>Câu trả lời của bạn</b><small>{task.answerType === "long_text" ? "Viết nội dung hoàn chỉnh" : "Có thể nhập nhiều đáp án, mỗi đáp án một dòng"}</small></span>{task.answerType === "self_check" ? <span className="self-check"><input type="checkbox" checked={selfCorrect} onChange={(event) => onSelfCorrect(event.target.checked)}/> Tôi đã hoàn thành đúng yêu cầu và tự kiểm tra</span> : <textarea ref={answerField} rows={task.answerType === "long_text" ? 10 : 4} value={answer} onChange={(event) => onAnswer(event.target.value)} placeholder={task.workflowType === "WRITING_AREA" ? "Viết đoạn hoặc bài làm tại đây…" : "Ví dụ:\nQ11. guided walk\nQ12. 15 pounds"}/>}</label>
      <label className="evidence-field"><span><b>Evidence / vị trí tìm thấy đáp án</b><small>Không cần chép cả đoạn, chỉ ghi đủ để tìm lại nhanh</small></span><textarea rows={task.answerType === "long_text" ? 10 : 4} value={evidence} onChange={(event) => onEvidence(event.target.value)} placeholder={evidenceGuide.placeholder}/><span className="evidence-templates">{evidenceGuide.templates.map((template) => <button type="button" key={template} onClick={() => appendEvidence(template)}>＋ {template}</button>)}</span></label>
    </div>
    <p className="submit-shortcut">Mẹo: nhấn <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Enter</kbd> để nộp bài.</p>
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
