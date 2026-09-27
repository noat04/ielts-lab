"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteArticle,
  deleteVocabulary,
  importVocabulary,
  loadContentWorkspace,
  parseVocabularyFile,
  saveArticle,
  saveTopic,
  saveVocabulary,
  slugify,
  type ContentArticle,
  type ContentWorkspace,
  type VocabularyEntry,
  type VocabularyImportRow,
  type VocabularyTopic,
  type WordType,
} from "@/lib/supabase/content";

type Modal = { kind: "article"; item?: ContentArticle } | { kind: "read"; item: ContentArticle } | { kind: "word"; item?: VocabularyEntry } | { kind: "topic" } | { kind: "import" } | null;
const WORD_TYPES: Array<{ value: WordType; label: string }> = [
  { value: "noun", label: "Danh từ" }, { value: "verb", label: "Động từ" }, { value: "adjective", label: "Tính từ" },
  { value: "adverb", label: "Trạng từ" }, { value: "idiom", label: "Idiom" }, { value: "phrasal_verb", label: "Phrasal verb" },
  { value: "phrase", label: "Cụm từ" }, { value: "pattern", label: "Pattern" }, { value: "preposition", label: "Giới từ" }, { value: "other", label: "Khác" },
];
const TYPE_LABEL = Object.fromEntries(WORD_TYPES.map((item) => [item.value, item.label]));

function formatDate(value: string) {
  return value ? new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value)) : "Bản nháp";
}

export function ContentHub({ userId }: { userId: string }) {
  const [workspace, setWorkspace] = useState<ContentWorkspace | null>(null);
  const [section, setSection] = useState<"articles" | "vocabulary">("articles");
  const [modal, setModal] = useState<Modal>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [topicFilter, setTopicFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const reload = useCallback(async () => {
    setLoading(true); setError("");
    try { setWorkspace(await loadContentWorkspace()); }
    catch (err) { setError(err instanceof Error ? err.message : "Không thể tải nội dung cộng đồng."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  async function run(action: () => Promise<void>) {
    setSaving(true); setError("");
    try { await action(); setModal(null); await reload(); }
    catch (err) { setError(err instanceof Error ? err.message : "Không thể lưu nội dung."); }
    finally { setSaving(false); }
  }

  const vocabulary = useMemo(() => (workspace?.vocabulary ?? []).filter((item) => {
    const text = `${item.term} ${item.meaning} ${item.example} ${item.tags.join(" ")}`.toLowerCase();
    return (!search || text.includes(search.toLowerCase())) && (topicFilter === "all" || item.topicId === topicFilter) && (typeFilter === "all" || item.wordType === typeFilter);
  }), [workspace, search, topicFilter, typeFilter]);

  if (loading && !workspace) return <main className="content-page"><div className="planner-loading">Đang tải nội dung cộng đồng…</div></main>;
  if (!workspace) return <main className="content-page"><div className="planner-loading"><p>{error}</p><button className="primary" onClick={() => void reload()}>Thử lại</button></div></main>;

  return <main className="content-page">
    <section className="content-hero"><div><p className="eyebrow">IELTS COMMUNITY LIBRARY</p><h1>Chia sẻ kiến thức.<br/><em>Học nhanh hơn.</em></h1><p>Viết mẹo làm bài chuẩn SEO và cùng xây thư viện từ vựng theo chủ đề.</p></div><aside><button className={section === "articles" ? "active" : ""} onClick={() => setSection("articles")}>Bài viết</button><button className={section === "vocabulary" ? "active" : ""} onClick={() => setSection("vocabulary")}>Từ vựng</button></aside></section>
    {error && <div className="status-banner"><span>{error}</span><button onClick={() => setError("")}>×</button></div>}

    {section === "articles" && <>
      <section className="community-heading"><div><p className="eyebrow">MẸO LÀM BÀI</p><h2>Bài viết mới nhất</h2><p>Bản nháp chỉ tác giả nhìn thấy; bài xuất bản được chia sẻ cho cộng đồng.</p></div><button className="primary" onClick={() => setModal({ kind: "article" })}>＋ Tạo bài viết</button></section>
      <section className="article-grid">{workspace.articles.map((article) => <article key={article.id} className="article-card">{article.featuredImageUrl && <div className="article-cover" style={{ backgroundImage: `url(${article.featuredImageUrl})` }}/>}<div><small>{article.isSystem ? "HƯỚNG DẪN HỆ THỐNG · " : ""}{article.category} · {article.readingMinutes} phút đọc</small><h3>{article.title}</h3><p>{article.excerpt || article.content.slice(0, 150)}</p><div className="tag-row">{article.tags.slice(0, 4).map((tag) => <i key={tag}>#{tag}</i>)}</div><footer><span><b className={article.status}>{article.status === "published" ? "Đã xuất bản" : article.status === "draft" ? "Bản nháp" : "Lưu trữ"}</b><small>{formatDate(article.publishedAt || article.updatedAt)}</small></span><aside><button onClick={() => setModal({ kind: "read", item: article })}>Đọc</button>{article.authorId === userId && <><button onClick={() => setModal({ kind: "article", item: article })}>Sửa</button><button className="delete" onClick={() => { if (confirm(`Xóa bài “${article.title}”?`)) void run(() => deleteArticle(article.id)); }}>Xóa</button></>}</aside></footer></div></article>)}{!workspace.articles.length && <div className="planner-empty">Chưa có bài viết. Hãy chia sẻ mẹo đầu tiên.</div>}</section>
    </>}

    {section === "vocabulary" && <>
      <section className="community-heading"><div><p className="eyebrow">VOCABULARY LIBRARY</p><h2>Từ vựng theo chủ đề</h2><p>{workspace.vocabulary.length} mục từ · {workspace.topics.length} chủ đề cộng đồng</p></div><aside><button onClick={() => setModal({ kind: "topic" })}>＋ Chủ đề</button><button onClick={() => setModal({ kind: "import" })}>⇧ Nhập Excel/CSV</button><button className="primary" onClick={() => setModal({ kind: "word" })}>＋ Thêm từ</button></aside></section>
      <section className="vocab-toolbar"><input placeholder="Tìm từ, nghĩa, ví dụ…" value={search} onChange={(event) => setSearch(event.target.value)}/><select value={topicFilter} onChange={(event) => setTopicFilter(event.target.value)}><option value="all">Mọi chủ đề</option>{workspace.topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}</select><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">Mọi từ loại</option>{WORD_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></section>
      <section className="vocab-table"><header><span>Từ vựng</span><span>Phân loại</span><span>Nghĩa & ví dụ</span><span/></header>{vocabulary.map((entry) => <article key={entry.id}><div><b>{entry.term}</b><small>{entry.pronunciation || "—"}</small></div><div><i>{TYPE_LABEL[entry.wordType]}</i><small>{entry.topicName} · {entry.level}</small></div><div><b>{entry.meaning}</b><p>{entry.example || entry.notes || "Chưa có ví dụ."}</p></div><aside>{entry.authorId === userId && <><button onClick={() => setModal({ kind: "word", item: entry })}>Sửa</button><button className="delete" onClick={() => { if (confirm(`Xóa từ “${entry.term}”?`)) void run(() => deleteVocabulary(entry.id)); }}>Xóa</button></>}</aside></article>)}{!vocabulary.length && <div className="planner-empty">Không có từ phù hợp với bộ lọc.</div>}</section>
    </>}

    {modal?.kind === "article" && <HubModal title={modal.item ? "Chỉnh sửa bài viết" : "Tạo bài viết chuẩn SEO"} wide onClose={() => setModal(null)}><ArticleForm initial={modal.item} saving={saving} onSave={(input) => run(() => saveArticle(userId, input, modal.item?.id).then(() => undefined))}/></HubModal>}
    {modal?.kind === "read" && <HubModal title={modal.item.title} wide onClose={() => setModal(null)}><ArticleReader article={modal.item}/></HubModal>}
    {modal?.kind === "word" && <HubModal title={modal.item ? "Chỉnh sửa từ vựng" : "Thêm từ vựng"} onClose={() => setModal(null)}><VocabularyForm initial={modal.item} topics={workspace.topics} saving={saving} onSave={(input) => run(() => saveVocabulary(userId, input, modal.item?.id).then(() => undefined))}/></HubModal>}
    {modal?.kind === "topic" && <HubModal title="Tạo chủ đề từ vựng" onClose={() => setModal(null)}><TopicForm saving={saving} onSave={(name, description) => run(() => saveTopic(userId, name, description).then(() => undefined))}/></HubModal>}
    {modal?.kind === "import" && <HubModal title="Nhập nhanh từ Excel / CSV" wide onClose={() => setModal(null)}><VocabularyImporter saving={saving} onImport={(rows, source) => run(() => importVocabulary(userId, rows, source).then(() => undefined))}/></HubModal>}
  </main>;
}

function HubModal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className={`modal-card ${wide ? "hub-modal-wide" : ""}`}><header><div><small>COMMUNITY CONTENT</small><h2>{title}</h2></div><button onClick={onClose}>×</button></header>{children}</div></div>;
}

type ArticleInput = Omit<ContentArticle, "id" | "authorId" | "isSystem" | "publishedAt" | "updatedAt" | "readingMinutes">;
function ArticleForm({ initial, saving, onSave }: { initial?: ContentArticle; saving: boolean; onSave: (input: ArticleInput) => void }) {
  const [title, setTitle] = useState(initial?.title ?? ""); const [slug, setSlug] = useState(initial?.slug ?? "");
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? ""); const [content, setContent] = useState(initial?.content ?? "");
  const [keyword, setKeyword] = useState(initial?.focusKeyword ?? ""); const [seoTitle, setSeoTitle] = useState(initial?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(initial?.seoDescription ?? ""); const [preview, setPreview] = useState(false);
  const effectiveSlug = slug || slugify(title); const lowerKeyword = keyword.trim().toLowerCase();
  const checks = [
    { ok: title.length >= 30 && title.length <= 65, label: "Tiêu đề 30–65 ký tự" },
    { ok: seoDescription.length >= 120 && seoDescription.length <= 160, label: "Meta description 120–160 ký tự" },
    { ok: Boolean(lowerKeyword && `${title} ${excerpt} ${content}`.toLowerCase().includes(lowerKeyword)), label: "Có từ khóa trọng tâm" },
    { ok: /^##?\s/m.test(content), label: "Có tiêu đề H2/H3" }, { ok: excerpt.length >= 80, label: "Có đoạn mô tả hấp dẫn" },
  ];
  const score = Math.round(checks.filter((item) => item.ok).length / checks.length * 100);
  function insert(markup: string) { setContent((current) => `${current}${current ? "\n\n" : ""}${markup}`); }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); onSave({ title: title.trim(), slug: effectiveSlug, excerpt: excerpt.trim(), content, contentFormat: String(form.get("contentFormat")) as ArticleInput["contentFormat"], category: String(form.get("category")).trim(), tags: String(form.get("tags")).split(",").map((item) => item.trim()).filter(Boolean), featuredImageUrl: String(form.get("image")).trim(), focusKeyword: keyword.trim(), seoTitle: seoTitle.trim(), seoDescription: seoDescription.trim(), canonicalUrl: String(form.get("canonical")).trim(), schemaType: String(form.get("schemaType")) as ArticleInput["schemaType"], status: String(form.get("status")) as ArticleInput["status"] }); }
  return <form className="article-editor" onSubmit={submit}><div className="editor-main"><div className="form-grid"><label className="wide">Tiêu đề bài viết<input required maxLength={180} value={title} onChange={(event) => { setTitle(event.target.value); if (!initial) setSlug(""); }}/></label><label className="wide">Đường dẫn bài viết<div className="slug-field"><span>/bai-viet/</span><input required value={effectiveSlug} onChange={(event) => setSlug(slugify(event.target.value))}/></div></label><label className="wide">Mô tả ngắn<textarea required rows={3} value={excerpt} onChange={(event) => setExcerpt(event.target.value)}/></label></div><div className="editor-toolbar"><button type="button" onClick={() => insert("## Tiêu đề phần")}>H2</button><button type="button" onClick={() => insert("### Tiêu đề nhỏ")}>H3</button><button type="button" onClick={() => insert("**nội dung in đậm**")}>B</button><button type="button" onClick={() => insert("- Ý thứ nhất\n- Ý thứ hai")}>Danh sách</button><button type="button" onClick={() => insert("> Mẹo quan trọng")}>Trích dẫn</button><button type="button" onClick={() => insert("[Tên liên kết](https://example.com)")}>Liên kết</button><button type="button" className={preview ? "active" : ""} onClick={() => setPreview((value) => !value)}>{preview ? "Soạn thảo" : "Xem trước"}</button></div>{preview ? <MarkdownPreview content={content}/> : <textarea className="content-editor" required value={content} onChange={(event) => setContent(event.target.value)} placeholder={'## Mẹo làm bài\n\nViết nội dung tại đây…'}/>}<div className="form-grid editor-options"><label>Chuyên mục<input name="category" defaultValue={initial?.category ?? "Mẹo làm bài"}/></label><label>Tags<input name="tags" defaultValue={initial?.tags.join(", ")}/></label><label className="wide">Ảnh đại diện URL<input name="image" type="url" defaultValue={initial?.featuredImageUrl}/></label><label>Định dạng<select name="contentFormat" defaultValue={initial?.contentFormat ?? "markdown"}><option value="markdown">Markdown</option><option value="html">HTML</option></select></label><label>Schema<select name="schemaType" defaultValue={initial?.schemaType ?? "Article"}><option>Article</option><option>HowTo</option><option>FAQPage</option></select></label><label>Trạng thái<select name="status" defaultValue={initial?.status ?? "draft"}><option value="draft">Bản nháp</option><option value="published">Xuất bản</option><option value="archived">Lưu trữ</option></select></label><label className="wide">Canonical URL<input name="canonical" type="url" defaultValue={initial?.canonicalUrl}/></label></div></div><aside className="seo-panel"><div className={`seo-score ${score >= 80 ? "good" : score >= 50 ? "medium" : "low"}`}><b>{score}</b><span>SEO score</span></div><label>Từ khóa trọng tâm<input value={keyword} onChange={(event) => setKeyword(event.target.value)}/></label><label>SEO title<input maxLength={70} value={seoTitle} placeholder={title} onChange={(event) => setSeoTitle(event.target.value)}/><small>{seoTitle.length}/70</small></label><label>Meta description<textarea rows={5} maxLength={170} value={seoDescription} onChange={(event) => setSeoDescription(event.target.value)}/><small>{seoDescription.length}/160</small></label><div className="seo-checks">{checks.map((check) => <p key={check.label} className={check.ok ? "ok" : ""}>{check.ok ? "✓" : "○"} {check.label}</p>)}</div><button className="primary submit" disabled={saving}>{saving ? "Đang lưu…" : initial ? "Lưu bài viết" : "Tạo bài viết"}</button></aside></form>;
}

function MarkdownPreview({ content }: { content: string }) {
  return <article className="markdown-preview">{content.split(/\n/).map((line, index) => line.startsWith("### ") ? <h3 key={index}>{line.slice(4)}</h3> : line.startsWith("## ") ? <h2 key={index}>{line.slice(3)}</h2> : line.startsWith("# ") ? <h1 key={index}>{line.slice(2)}</h1> : line.startsWith("- ") ? <li key={index}>{line.slice(2)}</li> : line.startsWith("> ") ? <blockquote key={index}>{line.slice(2)}</blockquote> : <p key={index}>{line || <br/>}</p>)}</article>;
}

function ArticleReader({ article }: { article: ContentArticle }) {
  return <article className="article-reader">{article.featuredImageUrl && <img src={article.featuredImageUrl} alt=""/>}<div className="tag-row">{article.tags.map((tag) => <i key={tag}>#{tag}</i>)}</div><p className="lead">{article.excerpt}</p><MarkdownPreview content={article.content}/><footer><span>{article.category}</span><span>{article.readingMinutes} phút đọc</span></footer></article>;
}

type WordInput = Omit<VocabularyEntry, "id" | "authorId" | "topicName" | "source">;
function VocabularyForm({ initial, topics, saving, onSave }: { initial?: VocabularyEntry; topics: VocabularyTopic[]; saving: boolean; onSave: (input: WordInput) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const split = (key: string) => String(form.get(key)).split(/[|,;]/).map((item) => item.trim()).filter(Boolean); onSave({ topicId: String(form.get("topicId")), term: String(form.get("term")).trim(), wordType: String(form.get("wordType")) as WordType, meaning: String(form.get("meaning")).trim(), pronunciation: String(form.get("pronunciation")).trim(), example: String(form.get("example")).trim(), level: String(form.get("level")) as VocabularyEntry["level"], collocations: split("collocations"), synonyms: split("synonyms"), antonyms: split("antonyms"), tags: split("tags"), notes: String(form.get("notes")).trim(), status: String(form.get("status")) as VocabularyEntry["status"] }); }
  return <form className="planner-form" onSubmit={submit}><div className="form-grid"><label>Chủ đề<select name="topicId" required defaultValue={initial?.topicId ?? topics[0]?.id}><option value="">Chọn chủ đề</option>{topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}</select></label><label>Từ loại<select name="wordType" defaultValue={initial?.wordType ?? "noun"}>{WORD_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label><label className="wide">Từ / cụm từ<input name="term" required defaultValue={initial?.term}/></label><label className="wide">Nghĩa<input name="meaning" required defaultValue={initial?.meaning}/></label><label>Phiên âm<input name="pronunciation" defaultValue={initial?.pronunciation}/></label><label>Trình độ<select name="level" defaultValue={initial?.level ?? "B1"}>{["A1", "A2", "B1", "B2", "C1", "C2", "IELTS"].map((level) => <option key={level}>{level}</option>)}</select></label><label className="wide">Ví dụ<textarea name="example" rows={3} defaultValue={initial?.example}/></label><label>Collocations<input name="collocations" defaultValue={initial?.collocations.join(", ")}/></label><label>Từ đồng nghĩa<input name="synonyms" defaultValue={initial?.synonyms.join(", ")}/></label><label>Từ trái nghĩa<input name="antonyms" defaultValue={initial?.antonyms.join(", ")}/></label><label>Tags<input name="tags" defaultValue={initial?.tags.join(", ")}/></label><label>Trạng thái<select name="status" defaultValue={initial?.status ?? "published"}><option value="published">Xuất bản</option><option value="draft">Bản nháp</option><option value="archived">Lưu trữ</option></select></label><label className="wide">Ghi chú<textarea name="notes" rows={3} defaultValue={initial?.notes}/></label></div><button className="primary submit" disabled={saving || !topics.length}>{topics.length ? saving ? "Đang lưu…" : "Lưu từ vựng" : "Hãy tạo chủ đề trước"}</button></form>;
}

function TopicForm({ saving, onSave }: { saving: boolean; onSave: (name: string, description: string) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); onSave(String(form.get("name")).trim(), String(form.get("description")).trim()); }
  return <form className="planner-form" onSubmit={submit}><div className="form-grid"><label className="wide">Tên chủ đề<input name="name" required placeholder="Ví dụ: Environment"/></label><label className="wide">Mô tả<textarea name="description" rows={4}/></label></div><button className="primary submit" disabled={saving}>{saving ? "Đang tạo…" : "Tạo chủ đề"}</button></form>;
}

function VocabularyImporter({ saving, onImport }: { saving: boolean; onImport: (rows: VocabularyImportRow[], source: "csv" | "xlsx") => void }) {
  const [rows, setRows] = useState<VocabularyImportRow[]>([]); const [errors, setErrors] = useState<string[]>([]); const [source, setSource] = useState<"csv" | "xlsx">("csv"); const [reading, setReading] = useState(false); const [localError, setLocalError] = useState("");
  async function selectFile(file?: File) { if (!file) return; setReading(true); setLocalError(""); try { const parsed = await parseVocabularyFile(file); setRows(parsed.rows); setErrors(parsed.errors); setSource(file.name.toLowerCase().endsWith(".csv") ? "csv" : "xlsx"); } catch (err) { setLocalError(err instanceof Error ? err.message : "Không thể đọc file."); setRows([]); } finally { setReading(false); } }
  function downloadTemplate() { const csv = 'topic,word,type,meaning,pronunciation,example,level,collocations,synonyms,antonyms,tags,notes\nEnvironment,sustainable,adjective,bền vững,/səˈsteɪ.nə.bəl/,Sustainable development is essential.,B2,sustainable growth,durable,,IELTS|Writing,\n'; const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "vocabulary-template.csv"; anchor.click(); URL.revokeObjectURL(url); }
  return <div className="importer"><div className="import-guide"><p><b>Cột bắt buộc:</b> topic, word, meaning.</p><p><b>Type hỗ trợ:</b> noun, verb, adjective, adverb, idiom, phrasal_verb, phrase, pattern, preposition.</p><button onClick={downloadTemplate}>↓ Tải file CSV mẫu</button></div><label className="file-drop"><input type="file" accept=".csv,.xlsx" onChange={(event) => void selectFile(event.target.files?.[0])}/><b>{reading ? "Đang đọc file…" : "Chọn hoặc kéo file CSV/XLSX vào đây"}</b><small>Tối đa 10 MB · 2.000 dòng mỗi lần</small></label>{localError && <p className="form-error">{localError}</p>}{errors.length > 0 && <div className="import-errors"><b>{errors.length} dòng chưa hợp lệ</b>{errors.slice(0, 5).map((error) => <p key={error}>{error}</p>)}</div>}{rows.length > 0 && <><div className="import-summary"><b>{rows.length} từ hợp lệ</b><span>{new Set(rows.map((row) => row.topic)).size} chủ đề · nguồn {source.toUpperCase()}</span></div><div className="import-preview"><table><thead><tr><th>Chủ đề</th><th>Từ</th><th>Loại</th><th>Nghĩa</th><th>Level</th></tr></thead><tbody>{rows.slice(0, 12).map((row, index) => <tr key={`${row.term}-${index}`}><td>{row.topic}</td><td>{row.term}</td><td>{row.wordType}</td><td>{row.meaning}</td><td>{row.level}</td></tr>)}</tbody></table></div><button className="primary submit" disabled={saving} onClick={() => onImport(rows, source)}>{saving ? "Đang nhập…" : `Nhập ${rows.length} từ vào thư viện`}</button></>}</div>;
}
