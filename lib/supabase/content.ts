import { getSupabase } from "@/lib/supabase/client";

export type ArticleStatus = "draft" | "published" | "archived";
export type ContentArticle = {
  id: string;
  authorId: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  contentFormat: "markdown" | "html";
  category: string;
  tags: string[];
  featuredImageUrl: string;
  focusKeyword: string;
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  schemaType: "Article" | "HowTo" | "FAQPage";
  status: ArticleStatus;
  readingMinutes: number;
  publishedAt: string;
  updatedAt: string;
};

export type VocabularyTopic = {
  id: string;
  createdBy: string;
  name: string;
  slug: string;
  description: string;
  isPublic: boolean;
};

export type WordType = "noun" | "verb" | "adjective" | "adverb" | "idiom" | "phrasal_verb" | "phrase" | "pattern" | "preposition" | "other";
export type VocabularyEntry = {
  id: string;
  authorId: string;
  topicId: string;
  topicName: string;
  term: string;
  wordType: WordType;
  meaning: string;
  pronunciation: string;
  example: string;
  level: "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | "IELTS";
  collocations: string[];
  synonyms: string[];
  antonyms: string[];
  tags: string[];
  notes: string;
  status: ArticleStatus;
  source: "manual" | "csv" | "xlsx";
};

export type VocabularyImportRow = {
  topic: string;
  term: string;
  wordType: WordType;
  meaning: string;
  pronunciation: string;
  example: string;
  level: VocabularyEntry["level"];
  collocations: string[];
  synonyms: string[];
  antonyms: string[];
  tags: string[];
  notes: string;
};

export type ContentWorkspace = { articles: ContentArticle[]; topics: VocabularyTopic[]; vocabulary: VocabularyEntry[] };

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function list(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value ?? "").split(/[|;,]/).map((item) => item.trim()).filter(Boolean);
}

function mapArticle(row: Record<string, any>): ContentArticle {
  return {
    id: row.id, authorId: row.author_id, title: row.title, slug: row.slug, excerpt: row.excerpt,
    content: row.content, contentFormat: row.content_format, category: row.category, tags: row.tags ?? [],
    featuredImageUrl: row.featured_image_url ?? "", focusKeyword: row.focus_keyword, seoTitle: row.seo_title,
    seoDescription: row.seo_description, canonicalUrl: row.canonical_url ?? "", schemaType: row.schema_type,
    status: row.status, readingMinutes: row.reading_minutes, publishedAt: row.published_at ?? "", updatedAt: row.updated_at,
  };
}

function mapTopic(row: Record<string, any>): VocabularyTopic {
  return { id: row.id, createdBy: row.created_by, name: row.name, slug: row.slug, description: row.description, isPublic: row.is_public };
}

function mapVocabulary(row: Record<string, any>): VocabularyEntry {
  const topic = Array.isArray(row.vocabulary_topics) ? row.vocabulary_topics[0] : row.vocabulary_topics;
  return {
    id: row.id, authorId: row.author_id, topicId: row.topic_id, topicName: topic?.name ?? "Chưa phân loại",
    term: row.term, wordType: row.word_type, meaning: row.meaning, pronunciation: row.pronunciation,
    example: row.example, level: row.level, collocations: row.collocations ?? [], synonyms: row.synonyms ?? [],
    antonyms: row.antonyms ?? [], tags: row.tags ?? [], notes: row.notes, status: row.status, source: row.source,
  };
}

export async function loadContentWorkspace(): Promise<ContentWorkspace> {
  const client = getSupabase();
  const [articles, topics, vocabulary] = await Promise.all([
    client.from("content_articles").select("*").order("updated_at", { ascending: false }),
    client.from("vocabulary_topics").select("*").order("name"),
    client.from("vocabulary_entries").select("*,vocabulary_topics(name)").order("term").limit(2000),
  ]);
  [articles, topics, vocabulary].forEach((result) => throwIfError(result.error));
  return { articles: (articles.data ?? []).map(mapArticle), topics: (topics.data ?? []).map(mapTopic), vocabulary: (vocabulary.data ?? []).map(mapVocabulary) };
}

type ArticleInput = Omit<ContentArticle, "id" | "authorId" | "publishedAt" | "updatedAt" | "readingMinutes">;
export async function saveArticle(userId: string, input: ArticleInput, id?: string) {
  const client = getSupabase();
  const wordCount = input.content.trim().split(/\s+/).filter(Boolean).length;
  const payload = {
    author_id: userId, title: input.title, slug: input.slug || slugify(input.title), excerpt: input.excerpt,
    content: input.content, content_format: input.contentFormat, category: input.category, tags: input.tags,
    featured_image_url: input.featuredImageUrl || null, focus_keyword: input.focusKeyword,
    seo_title: input.seoTitle, seo_description: input.seoDescription, canonical_url: input.canonicalUrl || null,
    schema_type: input.schemaType, status: input.status, reading_minutes: Math.max(1, Math.ceil(wordCount / 220)),
    published_at: input.status === "published" ? new Date().toISOString() : null,
  };
  const query = id ? client.from("content_articles").update(payload).eq("id", id) : client.from("content_articles").insert(payload);
  const { data, error } = await query.select().single();
  throwIfError(error);
  return mapArticle(data);
}

export async function deleteArticle(id: string) {
  const { error } = await getSupabase().from("content_articles").delete().eq("id", id);
  throwIfError(error);
}

export async function saveTopic(userId: string, name: string, description = "") {
  const { data, error } = await getSupabase().from("vocabulary_topics").insert({ created_by: userId, name, slug: slugify(name), description, is_public: true }).select().single();
  throwIfError(error);
  return mapTopic(data);
}

type VocabularyInput = Omit<VocabularyEntry, "id" | "authorId" | "topicName" | "source"> & { source?: VocabularyEntry["source"] };
export async function saveVocabulary(userId: string, input: VocabularyInput, id?: string) {
  const client = getSupabase();
  const payload = {
    author_id: userId, topic_id: input.topicId, term: input.term, word_type: input.wordType, meaning: input.meaning,
    pronunciation: input.pronunciation, example: input.example, level: input.level, collocations: input.collocations,
    synonyms: input.synonyms, antonyms: input.antonyms, tags: input.tags, notes: input.notes,
    status: input.status, source: input.source ?? "manual",
  };
  const query = id ? client.from("vocabulary_entries").update(payload).eq("id", id) : client.from("vocabulary_entries").insert(payload);
  const { data, error } = await query.select("*,vocabulary_topics(name)").single();
  throwIfError(error);
  return mapVocabulary(data);
}

export async function deleteVocabulary(id: string) {
  const { error } = await getSupabase().from("vocabulary_entries").delete().eq("id", id);
  throwIfError(error);
}

function normalizeHeader(value: unknown) {
  return slugify(String(value ?? "")).replace(/-/g, "_");
}

const typeAliases: Record<string, WordType> = {
  noun: "noun", danh_tu: "noun", verb: "verb", dong_tu: "verb", adjective: "adjective", tinh_tu: "adjective",
  adverb: "adverb", trang_tu: "adverb", idiom: "idiom", thanh_ngu: "idiom", phrasal_verb: "phrasal_verb",
  cum_dong_tu: "phrasal_verb", phrase: "phrase", cum_tu: "phrase", pattern: "pattern", mau_cau: "pattern",
  preposition: "preposition", gioi_tu: "preposition", parameter: "pattern", other: "other", khac: "other",
};

export function matrixToVocabularyRows(matrix: unknown[][]) {
  if (matrix.length < 2) throw new Error("File cần có một hàng tiêu đề và ít nhất một hàng dữ liệu.");
  const headers = matrix[0].map(normalizeHeader);
  const aliases: Record<string, string[]> = {
    topic: ["topic", "chu_de"], term: ["word", "term", "tu", "tu_vung"], wordType: ["type", "word_type", "tu_loai"],
    meaning: ["meaning", "nghia"], pronunciation: ["pronunciation", "phonetic", "phien_am"], example: ["example", "vi_du"],
    level: ["level", "trinh_do"], collocations: ["collocations", "collocation"], synonyms: ["synonyms", "dong_nghia"],
    antonyms: ["antonyms", "trai_nghia"], tags: ["tags", "tag"], notes: ["notes", "ghi_chu"],
  };
  const index = (key: string) => headers.findIndex((header) => aliases[key].includes(header));
  const get = (row: unknown[], key: string) => index(key) < 0 ? "" : String(row[index(key)] ?? "").trim();
  const errors: string[] = [];
  const rows: VocabularyImportRow[] = [];
  matrix.slice(1).forEach((row, offset) => {
    const topic = get(row, "topic"); const term = get(row, "term"); const meaning = get(row, "meaning");
    if (!topic && !term && !meaning) return;
    if (!topic || !term || !meaning) { errors.push(`Dòng ${offset + 2}: thiếu topic, word hoặc meaning.`); return; }
    const rawType = normalizeHeader(get(row, "wordType") || "other");
    const rawLevel = get(row, "level").toUpperCase() || "B1";
    rows.push({
      topic, term, meaning, wordType: typeAliases[rawType] ?? "other", pronunciation: get(row, "pronunciation"),
      example: get(row, "example"), level: (["A1", "A2", "B1", "B2", "C1", "C2", "IELTS"].includes(rawLevel) ? rawLevel : "B1") as VocabularyEntry["level"],
      collocations: list(get(row, "collocations")), synonyms: list(get(row, "synonyms")), antonyms: list(get(row, "antonyms")),
      tags: list(get(row, "tags")), notes: get(row, "notes"),
    });
  });
  return { rows, errors };
}

export function parseCsv(text: string): unknown[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [",", ";", "\t"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { field += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { row.push(field); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export async function parseVocabularyFile(file: File) {
  if (file.size > 10 * 1024 * 1024) throw new Error("File nhập vượt quá giới hạn 10 MB.");
  if (file.name.toLowerCase().endsWith(".csv")) return matrixToVocabularyRows(parseCsv(await file.text()));
  const form = new FormData(); form.append("file", file);
  const { data, error } = await getSupabase().functions.invoke("parse-vocabulary-file", { body: form });
  throwIfError(error);
  if (!Array.isArray(data?.rows)) throw new Error("Không đọc được dữ liệu từ file Excel.");
  return matrixToVocabularyRows(data.rows);
}

export async function importVocabulary(userId: string, rows: VocabularyImportRow[], source: "csv" | "xlsx") {
  if (rows.length > 2000) throw new Error("Mỗi lần chỉ nhập tối đa 2.000 từ.");
  const client = getSupabase();
  const topicNames = [...new Set(rows.map((row) => row.topic))];
  const topicMap = new Map<string, string>();
  for (const name of topicNames) {
    const slug = slugify(name);
    const existing = await client.from("vocabulary_topics").select("id").eq("slug", slug).maybeSingle();
    throwIfError(existing.error);
    if (existing.data) topicMap.set(name, existing.data.id);
    else {
      const created = await saveTopic(userId, name);
      topicMap.set(name, created.id);
    }
  }
  const payload = rows.map((row) => ({
    author_id: userId, topic_id: topicMap.get(row.topic), term: row.term, word_type: row.wordType, meaning: row.meaning,
    pronunciation: row.pronunciation, example: row.example, level: row.level, collocations: row.collocations,
    synonyms: row.synonyms, antonyms: row.antonyms, tags: row.tags, notes: row.notes, status: "published", source,
  }));
  const { error } = await client.from("vocabulary_entries").upsert(payload, { onConflict: "author_id,topic_id,term,word_type" });
  throwIfError(error);
  return payload.length;
}
