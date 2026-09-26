begin;

create table public.content_articles (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  slug text not null,
  excerpt text not null default '',
  content text not null default '',
  content_format text not null default 'markdown',
  category text not null default 'Mẹo làm bài',
  tags text[] not null default '{}',
  featured_image_url text,
  focus_keyword text not null default '',
  seo_title text not null default '',
  seo_description text not null default '',
  canonical_url text,
  schema_type text not null default 'Article',
  status text not null default 'draft',
  reading_minutes integer not null default 1,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_articles_title_not_blank check (char_length(btrim(title)) between 1 and 180),
  constraint content_articles_slug_valid check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint content_articles_format_valid check (content_format in ('markdown', 'html')),
  constraint content_articles_schema_valid check (schema_type in ('Article', 'HowTo', 'FAQPage')),
  constraint content_articles_status_valid check (status in ('draft', 'published', 'archived')),
  constraint content_articles_reading_time_valid check (reading_minutes between 1 and 180),
  unique (slug)
);

create table public.vocabulary_topics (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  slug text not null,
  description text not null default '',
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vocabulary_topics_name_not_blank check (char_length(btrim(name)) between 1 and 100),
  constraint vocabulary_topics_slug_valid check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  unique (slug)
);

create table public.vocabulary_entries (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  topic_id uuid not null references public.vocabulary_topics (id) on delete cascade,
  term text not null,
  word_type text not null default 'other',
  meaning text not null,
  pronunciation text not null default '',
  example text not null default '',
  level text not null default 'B1',
  collocations text[] not null default '{}',
  synonyms text[] not null default '{}',
  antonyms text[] not null default '{}',
  tags text[] not null default '{}',
  notes text not null default '',
  status text not null default 'published',
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vocabulary_entries_term_not_blank check (char_length(btrim(term)) between 1 and 160),
  constraint vocabulary_entries_meaning_not_blank check (char_length(btrim(meaning)) > 0),
  constraint vocabulary_entries_type_valid check (
    word_type in ('noun', 'verb', 'adjective', 'adverb', 'idiom', 'phrasal_verb', 'phrase', 'pattern', 'preposition', 'other')
  ),
  constraint vocabulary_entries_level_valid check (level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'IELTS')),
  constraint vocabulary_entries_status_valid check (status in ('draft', 'published', 'archived')),
  constraint vocabulary_entries_source_valid check (source in ('manual', 'csv', 'xlsx')),
  unique (author_id, topic_id, term, word_type)
);

create index content_articles_status_date_idx on public.content_articles (status, published_at desc);
create index content_articles_author_date_idx on public.content_articles (author_id, updated_at desc);
create index content_articles_category_idx on public.content_articles (category);
create index vocabulary_topics_public_name_idx on public.vocabulary_topics (is_public, name);
create index vocabulary_entries_topic_type_idx on public.vocabulary_entries (topic_id, word_type, term);
create index vocabulary_entries_status_idx on public.vocabulary_entries (status, created_at desc);

create trigger content_articles_set_updated_at
before update on public.content_articles
for each row execute function public.ielts_lab_set_updated_at();

create trigger vocabulary_topics_set_updated_at
before update on public.vocabulary_topics
for each row execute function public.ielts_lab_set_updated_at();

create trigger vocabulary_entries_set_updated_at
before update on public.vocabulary_entries
for each row execute function public.ielts_lab_set_updated_at();

alter table public.content_articles enable row level security;
alter table public.vocabulary_topics enable row level security;
alter table public.vocabulary_entries enable row level security;

revoke all on table public.content_articles from anon, authenticated;
revoke all on table public.vocabulary_topics from anon, authenticated;
revoke all on table public.vocabulary_entries from anon, authenticated;
grant select on table public.content_articles, public.vocabulary_topics, public.vocabulary_entries to anon;
grant select, insert, update, delete on table public.content_articles, public.vocabulary_topics, public.vocabulary_entries to authenticated;

create policy "articles_read_published_or_own" on public.content_articles for select
using (status = 'published' or (select auth.uid()) = author_id);
create policy "articles_insert_own" on public.content_articles for insert to authenticated
with check ((select auth.uid()) = author_id);
create policy "articles_update_own" on public.content_articles for update to authenticated
using ((select auth.uid()) = author_id) with check ((select auth.uid()) = author_id);
create policy "articles_delete_own" on public.content_articles for delete to authenticated
using ((select auth.uid()) = author_id);

create policy "topics_read_public_or_own" on public.vocabulary_topics for select
using (is_public or (select auth.uid()) = created_by);
create policy "topics_insert_own" on public.vocabulary_topics for insert to authenticated
with check ((select auth.uid()) = created_by);
create policy "topics_update_own" on public.vocabulary_topics for update to authenticated
using ((select auth.uid()) = created_by) with check ((select auth.uid()) = created_by);
create policy "topics_delete_own" on public.vocabulary_topics for delete to authenticated
using ((select auth.uid()) = created_by);

create policy "vocabulary_read_published_or_own" on public.vocabulary_entries for select
using (status = 'published' or (select auth.uid()) = author_id);
create policy "vocabulary_insert_own" on public.vocabulary_entries for insert to authenticated
with check ((select auth.uid()) = author_id);
create policy "vocabulary_update_own" on public.vocabulary_entries for update to authenticated
using ((select auth.uid()) = author_id) with check ((select auth.uid()) = author_id);
create policy "vocabulary_delete_own" on public.vocabulary_entries for delete to authenticated
using ((select auth.uid()) = author_id);

commit;
