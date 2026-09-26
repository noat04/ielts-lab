begin;

create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 100),
  timezone text not null default 'Asia/Bangkok',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.study_goals (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  current_band numeric(2, 1) not null default 5.0,
  target_band numeric(2, 1) not null default 6.5,
  stretch_band numeric(2, 1) not null default 7.5,
  exam_date date,
  target_sessions integer not null default 168,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_goals_band_range check (
    current_band between 0 and 9
    and target_band between 0 and 9
    and stretch_band between 0 and 9
  ),
  constraint study_goals_half_band_steps check (
    mod(current_band * 10, 5) = 0
    and mod(target_band * 10, 5) = 0
    and mod(stretch_band * 10, 5) = 0
  ),
  constraint study_goals_order check (
    current_band <= target_band and target_band <= stretch_band
  ),
  constraint study_goals_target_sessions_positive check (target_sessions > 0)
);

create table public.bugs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  code text not null,
  detected_on date not null default current_date,
  skill text not null,
  original_text text not null,
  cause text not null,
  correction text not null,
  example text not null default '',
  status text not null default 'OPEN',
  origin text not null default 'user',
  source_position integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bugs_code_not_blank check (char_length(btrim(code)) between 1 and 64),
  constraint bugs_skill_valid check (
    skill in ('Listening', 'Reading', 'Writing', 'Speaking', 'Grammar / Vocab')
  ),
  constraint bugs_status_valid check (status in ('OPEN', 'DONE')),
  constraint bugs_origin_valid check (origin in ('snapshot', 'user', 'import')),
  constraint bugs_source_position_positive check (
    source_position is null or source_position > 0
  ),
  unique (user_id, code)
);

create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  study_date date not null default current_date,
  skill text not null,
  duration_minutes integer not null,
  title text not null,
  note text not null default '',
  status text not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_sessions_skill_valid check (
    skill in ('Listening', 'Reading', 'Writing', 'Speaking', 'Grammar / Vocab')
  ),
  constraint study_sessions_duration_valid check (duration_minutes between 1 and 1440),
  constraint study_sessions_title_not_blank check (char_length(btrim(title)) between 1 and 120),
  constraint study_sessions_note_length check (char_length(note) <= 2000),
  constraint study_sessions_status_valid check (status in ('planned', 'completed'))
);

create table public.weekly_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_number integer not null,
  month_number integer not null,
  total_sessions integer not null default 7,
  completed_sessions integer not null default 0,
  planned_minutes integer not null default 0,
  completed_minutes integer not null default 0,
  bug_updates integer not null default 0,
  skills text[] not null default '{}',
  notes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_progress_week_valid check (week_number between 1 and 104),
  constraint weekly_progress_month_valid check (month_number between 1 and 24),
  constraint weekly_progress_counts_valid check (
    total_sessions > 0
    and completed_sessions between 0 and total_sessions
    and planned_minutes >= 0
    and completed_minutes >= 0
    and bug_updates >= 0
  ),
  unique (user_id, week_number)
);

create table public.test_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null,
  test_type text not null,
  test_date date,
  listening_raw smallint,
  listening_band numeric(2, 1),
  reading_raw smallint,
  reading_band numeric(2, 1),
  writing_band numeric(2, 1),
  speaking_band numeric(2, 1),
  average_band numeric(3, 2),
  overall_band numeric(2, 1),
  conclusion text,
  origin text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint test_results_label_not_blank check (char_length(btrim(label)) between 1 and 160),
  constraint test_results_raw_scores_valid check (
    (listening_raw is null or listening_raw between 0 and 40)
    and (reading_raw is null or reading_raw between 0 and 40)
  ),
  constraint test_results_bands_valid check (
    (listening_band is null or listening_band between 0 and 9)
    and (reading_band is null or reading_band between 0 and 9)
    and (writing_band is null or writing_band between 0 and 9)
    and (speaking_band is null or speaking_band between 0 and 9)
    and (average_band is null or average_band between 0 and 9)
    and (overall_band is null or overall_band between 0 and 9)
  ),
  constraint test_results_origin_valid check (origin in ('snapshot', 'user', 'import'))
);

create table public.practice_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exercise_key text not null,
  prompt text not null,
  answer text not null,
  hint text not null default '',
  skill text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  origin text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint practice_exercises_key_not_blank check (
    char_length(btrim(exercise_key)) between 1 and 100
  ),
  constraint practice_exercises_skill_valid check (
    skill is null or skill in ('Listening', 'Reading', 'Writing', 'Speaking', 'Grammar / Vocab')
  ),
  constraint practice_exercises_origin_valid check (origin in ('snapshot', 'user', 'import')),
  unique (user_id, exercise_key),
  unique (user_id, id)
);

create table public.exercise_progress (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exercise_id uuid not null,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_id),
  foreign key (user_id, exercise_id)
    references public.practice_exercises (user_id, id)
    on delete cascade,
  constraint exercise_progress_completed_at_consistent check (
    completed or completed_at is null
  )
);

create table public.theory_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  code text not null,
  label text not null,
  source text not null default '',
  tip text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint theory_notes_code_not_blank check (char_length(btrim(code)) between 1 and 50),
  unique (user_id, code)
);

create table public.learning_resources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  resource_key text not null,
  title text not null,
  url text not null,
  resource_type text not null default 'other',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_resources_key_not_blank check (
    char_length(btrim(resource_key)) between 1 and 100
  ),
  constraint learning_resources_url_not_blank check (char_length(btrim(url)) > 0),
  constraint learning_resources_type_valid check (
    resource_type in ('document', 'spreadsheet', 'book', 'audio', 'video', 'other')
  ),
  unique (user_id, resource_key)
);

create table public.data_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_type text not null,
  source_name text not null,
  source_generated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  constraint data_imports_source_type_valid check (
    source_type in ('local_storage', 'snapshot', 'google_docs', 'google_sheets', 'manual', 'other')
  ),
  constraint data_imports_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index bugs_user_id_idx on public.bugs (user_id);
create index bugs_user_status_date_idx on public.bugs (user_id, status, detected_on desc);
create index bugs_user_skill_status_idx on public.bugs (user_id, skill, status);
create index study_sessions_user_id_idx on public.study_sessions (user_id);
create index study_sessions_user_status_date_idx
  on public.study_sessions (user_id, status, study_date desc);
create index weekly_progress_user_id_idx on public.weekly_progress (user_id);
create index test_results_user_id_idx on public.test_results (user_id);
create index test_results_user_date_idx
  on public.test_results (user_id, test_date desc nulls last, created_at desc);
create index practice_exercises_user_id_idx on public.practice_exercises (user_id);
create index practice_exercises_user_active_order_idx
  on public.practice_exercises (user_id, is_active, sort_order);
create index exercise_progress_user_id_idx on public.exercise_progress (user_id);
create index theory_notes_user_id_idx on public.theory_notes (user_id);
create index learning_resources_user_id_idx on public.learning_resources (user_id);
create index data_imports_user_id_idx on public.data_imports (user_id);
create index data_imports_user_imported_at_idx
  on public.data_imports (user_id, imported_at desc);

create or replace function public.ielts_lab_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.ielts_lab_set_updated_at() from public;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.ielts_lab_set_updated_at();

create trigger study_goals_set_updated_at
before update on public.study_goals
for each row execute function public.ielts_lab_set_updated_at();

create trigger bugs_set_updated_at
before update on public.bugs
for each row execute function public.ielts_lab_set_updated_at();

create trigger study_sessions_set_updated_at
before update on public.study_sessions
for each row execute function public.ielts_lab_set_updated_at();

create trigger weekly_progress_set_updated_at
before update on public.weekly_progress
for each row execute function public.ielts_lab_set_updated_at();

create trigger test_results_set_updated_at
before update on public.test_results
for each row execute function public.ielts_lab_set_updated_at();

create trigger practice_exercises_set_updated_at
before update on public.practice_exercises
for each row execute function public.ielts_lab_set_updated_at();

create trigger exercise_progress_set_updated_at
before update on public.exercise_progress
for each row execute function public.ielts_lab_set_updated_at();

create trigger theory_notes_set_updated_at
before update on public.theory_notes
for each row execute function public.ielts_lab_set_updated_at();

create trigger learning_resources_set_updated_at
before update on public.learning_resources
for each row execute function public.ielts_lab_set_updated_at();

create or replace function public.ielts_lab_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;

  insert into public.study_goals (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke execute on function public.ielts_lab_handle_new_user() from public;

drop trigger if exists ielts_lab_on_auth_user_created on auth.users;
create trigger ielts_lab_on_auth_user_created
after insert on auth.users
for each row execute function public.ielts_lab_handle_new_user();

insert into public.profiles (id, display_name)
select
  id,
  coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name')
from auth.users
on conflict (id) do nothing;

insert into public.study_goals (user_id)
select id from auth.users
on conflict (user_id) do nothing;

comment on table public.bugs is
  'IELTS bug tracker. Frontend mapping: code=id, detected_on=date, original_text=original, correction=fix.';
comment on table public.weekly_progress is
  'Imported or calculated progress for each week in the IELTS study plan.';
comment on table public.data_imports is
  'Audit trail for snapshot, localStorage, and Google data imports.';

commit;
