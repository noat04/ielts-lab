"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  deletePlanResource,
  markResourceOpened,
  parseGoogleDriveUrl,
  savePlanResource,
  uploadPlanResource,
  type PlanResource,
  type ResourceInput,
} from "@/lib/supabase/planner";

const SKILLS = ["Listening", "Reading", "Writing", "Speaking", "Grammar / Vocab", "General"];

function fileSize(value: number | null) {
  if (value === null) return "";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function providerLabel(resource: PlanResource) {
  return resource.provider === "LOCAL_STORAGE" ? "SUPABASE FILE" : resource.provider === "GOOGLE_DRIVE" ? "GOOGLE DRIVE" : "WEB LINK";
}

export function PersonalResourceLibrary({ userId, planId, resources, onChanged }: { userId: string; planId: string; resources: PlanResource[]; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState<PlanResource | "new" | null>(null);
  const [preview, setPreview] = useState<PlanResource | null>(null);
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState("ALL");
  const [folder, setFolder] = useState("ALL");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const folders = useMemo(() => [...new Set(resources.map((item) => item.folder))].sort(), [resources]);
  const filtered = resources.filter((item) => provider === "ALL" || item.provider === provider)
    .filter((item) => folder === "ALL" || item.folder === folder)
    .filter((item) => [item.title, item.description, item.folder, ...item.tags, ...item.skills].join(" ").toLowerCase().includes(search.toLowerCase()));

  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); setEditing(null); await onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể lưu tài liệu."); }
    finally { setBusy(false); }
  }

  function open(resource: PlanResource) {
    void markResourceOpened(resource.id);
    if (resource.provider === "GOOGLE_DRIVE" || resource.mimeType === "application/pdf") setPreview(resource);
    else window.open(resource.url, "_blank", "noopener,noreferrer");
  }

  return <section className="resource-panel personal-library">
    <div className="section-heading"><div><p className="eyebrow">PERSONAL MATERIAL LIBRARY</p><h2>Kho tài liệu của bạn</h2><p>Upload PDF/DOCX hoặc lưu tài liệu Google Drive để dùng lại trong lộ trình và Sprint.</p></div><button className="primary" onClick={() => setEditing("new")}>＋ Thêm tài liệu</button></div>
    {error && <div className="status-banner"><span>{error}</span><button onClick={() => setError("")}>×</button></div>}
    <div className="library-toolbar"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên, tag, kỹ năng…"/><select value={provider} onChange={(event) => setProvider(event.target.value)}><option value="ALL">Tất cả nguồn</option><option value="LOCAL_STORAGE">File của tôi</option><option value="GOOGLE_DRIVE">Google Drive</option><option value="EXTERNAL_LINK">Web link</option></select><select value={folder} onChange={(event) => setFolder(event.target.value)}><option value="ALL">Tất cả thư mục</option>{folders.map((item) => <option key={item}>{item}</option>)}</select><span><b>{filtered.length}</b> tài liệu</span></div>
    <div className="resource-grid enhanced">{filtered.map((resource) => <article key={resource.id} className={resource.favorite ? "favorite" : ""}><header><span>{resource.provider === "LOCAL_STORAGE" ? "FILE" : resource.provider === "GOOGLE_DRIVE" ? "DRIVE" : "LINK"}</span>{resource.favorite && <b>★</b>}</header><small>{providerLabel(resource)} · {resource.type.toUpperCase()}{resource.primary ? " · CHÍNH" : ""}</small><h3>{resource.title}</h3><p>{resource.description || resource.originalFilename || resource.url}</p><div className="resource-meta"><span>▱ {resource.folder}</span>{resource.fileSize !== null && <span>{fileSize(resource.fileSize)}</span>}{resource.skills.map((skill) => <i key={skill}>{skill}</i>)}</div>{Boolean(resource.tags.length) && <div className="resource-tags">{resource.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}<footer><button className="resource-open" onClick={() => open(resource)}>{resource.provider === "LOCAL_STORAGE" && resource.mimeType !== "application/pdf" ? "Tải xuống ↗" : "Xem tài liệu ↗"}</button><span><button onClick={() => setEditing(resource)}>Sửa</button><button className="delete" onClick={() => { if (confirm(`Xóa tài liệu “${resource.title}”?`)) void run(() => deletePlanResource(resource)); }}>Xóa</button></span></footer></article>)}{!filtered.length && <div className="planner-empty">Chưa có tài liệu phù hợp. Bạn có thể upload PDF/DOCX hoặc thêm link Google Drive.</div>}</div>

    {editing && <LibraryModal title={editing === "new" ? "Thêm tài liệu cá nhân" : "Chỉnh sửa tài liệu"} onClose={() => !busy && setEditing(null)}><MaterialForm initial={editing === "new" ? undefined : editing} folders={folders} busy={busy} onUpload={(file, input) => run(() => uploadPlanResource(userId, planId, file, input).then(() => undefined))} onSave={(input) => run(() => savePlanResource(userId, planId, input, editing === "new" ? undefined : editing.id).then(() => undefined))}/></LibraryModal>}
    {preview && <LibraryModal title={preview.title} onClose={() => setPreview(null)} wide><div className="material-preview"><iframe title={preview.title} src={preview.previewUrl || preview.url}/><footer><span>{providerLabel(preview)} · {preview.folder}</span><a href={preview.url} target="_blank" rel="noreferrer">Mở trong tab mới ↗</a></footer></div></LibraryModal>}
  </section>;
}

function LibraryModal({ title, children, onClose, wide = false }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className={`modal-card ${wide ? "hub-modal-wide" : ""}`}><header><div><small>PERSONAL MATERIAL LIBRARY</small><h2>{title}</h2></div><button onClick={onClose}>×</button></header>{children}</div></div>;
}

function MaterialForm({ initial, folders, busy, onSave, onUpload }: { initial?: PlanResource; folders: string[]; busy: boolean; onSave: (input: ResourceInput) => void; onUpload: (file: File, input: Omit<ResourceInput, "url" | "provider" | "externalFileId" | "originalFilename" | "previewUrl">) => void }) {
  const [mode, setMode] = useState<PlanResource["provider"]>(initial?.provider ?? "LOCAL_STORAGE");
  const [skills, setSkills] = useState<string[]>(initial?.skills ?? []);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const common = { title: String(form.get("title")).trim(), type: String(form.get("type")) as PlanResource["type"], description: String(form.get("description")).trim(), primary: form.get("primary") === "on", folder: String(form.get("folder")).trim() || "Chưa phân loại", tags: String(form.get("tags")).split(",").map((item) => item.trim()).filter(Boolean), skills, accessStatus: "READY" as const, favorite: form.get("favorite") === "on" };
    if (mode === "LOCAL_STORAGE" && !initial) { const file = form.get("file"); if (file instanceof File && file.size) onUpload(file, common); return; }
    const rawUrl = mode === "LOCAL_STORAGE" ? `storage:${initial?.storagePath}` : String(form.get("url")).trim();
    const drive = mode === "GOOGLE_DRIVE" ? parseGoogleDriveUrl(rawUrl) : { id: "", previewUrl: rawUrl };
    if (mode === "GOOGLE_DRIVE" && !drive.id) { const input = event.currentTarget.elements.namedItem("url") as HTMLInputElement | null; input?.setCustomValidity("Link Google Drive không hợp lệ."); input?.reportValidity(); return; }
    onSave({ ...common, url: rawUrl, provider: mode, externalFileId: drive.id, originalFilename: initial?.originalFilename ?? "", previewUrl: drive.previewUrl });
  }
  return <form className="planner-form material-form" onSubmit={submit}><div className="source-mode">{initial ? <span>Nguồn: <b>{providerLabel(initial)}</b></span> : <><button type="button" className={mode === "LOCAL_STORAGE" ? "active" : ""} onClick={() => setMode("LOCAL_STORAGE")}>↑ Upload PDF/DOCX</button><button type="button" className={mode === "GOOGLE_DRIVE" ? "active" : ""} onClick={() => setMode("GOOGLE_DRIVE")}>Google Drive</button><button type="button" className={mode === "EXTERNAL_LINK" ? "active" : ""} onClick={() => setMode("EXTERNAL_LINK")}>Link khác</button></>}</div>{mode === "GOOGLE_DRIVE" && <p className="form-note">Hãy bật quyền “Anyone with the link” trên Google Drive nếu muốn mở tài liệu trực tiếp trong website.</p>}<div className="form-grid">{mode === "LOCAL_STORAGE" && !initial && <label className="wide upload-drop">Chọn file PDF, DOC hoặc DOCX<input name="file" type="file" required accept=".pdf,.doc,.docx,.txt"/><span>Tối đa 50 MB · lưu riêng tư trong Supabase Storage</span></label>}{mode !== "LOCAL_STORAGE" && <label className="wide">Đường dẫn {mode === "GOOGLE_DRIVE" ? "Google Drive" : "tài liệu"}<input name="url" type="url" required defaultValue={initial?.provider === mode ? initial.url : ""} onInput={(event) => event.currentTarget.setCustomValidity("")} placeholder={mode === "GOOGLE_DRIVE" ? "https://drive.google.com/file/d/…/view" : "https://…"}/></label>}<label className="wide">Tên tài liệu<input name="title" required defaultValue={initial?.title} placeholder="Complete IELTS 6.5–7.5"/></label><label>Loại<select name="type" defaultValue={initial?.type ?? "document"}><option value="document">Tài liệu</option><option value="spreadsheet">Bảng tính</option><option value="book">Sách</option><option value="audio">Audio</option><option value="video">Video</option><option value="other">Khác</option></select></label><label>Thư mục<input name="folder" list="material-folders" defaultValue={initial?.folder ?? "IELTS"}/><datalist id="material-folders">{folders.map((item) => <option key={item} value={item}/>)}</datalist></label><label className="wide">Tags, cách nhau bằng dấu phẩy<input name="tags" defaultValue={initial?.tags.join(", ")} placeholder="cambridge, reading, section-2"/></label><label className="wide">Kỹ năng<div className="skill-picker">{SKILLS.map((skill) => <button type="button" key={skill} className={skills.includes(skill) ? "active" : ""} onClick={() => setSkills((current) => current.includes(skill) ? current.filter((item) => item !== skill) : [...current, skill])}>{skill}</button>)}</div></label><label className="wide">Mô tả<textarea name="description" rows={3} defaultValue={initial?.description}/></label><label className="check-label"><input name="favorite" type="checkbox" defaultChecked={initial?.favorite}/>Yêu thích</label><label className="check-label"><input name="primary" type="checkbox" defaultChecked={initial?.primary}/>Tài liệu chính</label></div><button className="primary submit" disabled={busy}>{busy ? "Đang lưu…" : mode === "LOCAL_STORAGE" && !initial ? "Upload và lưu tài liệu" : "Lưu tài liệu"}</button></form>;
}
