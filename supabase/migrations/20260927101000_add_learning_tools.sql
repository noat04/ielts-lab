begin;

create table public.diagnostic_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id uuid not null,
  listening_raw smallint not null,
  reading_raw smallint not null,
  writing_band numeric(2, 1) not null,
  speaking_band numeric(2, 1) not null,
  estimated_band numeric(2, 1) not null,
  study_experience text not null default 'beginner',
  difficult_skills text[] not null default '{}',
  notes text not null default '',
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (user_id, plan_id)
    references public.learning_plans (user_id, id)
    on delete cascade,
  constraint diagnostic_raw_scores_valid check (
    listening_raw between 0 and 40 and reading_raw between 0 and 40
  ),
  constraint diagnostic_bands_valid check (
    writing_band between 0 and 9
    and speaking_band between 0 and 9
    and estimated_band between 0 and 9
  ),
  constraint diagnostic_experience_valid check (
    study_experience in ('beginner', 'returning', 'experienced')
  )
);

alter table public.daily_lessons
  add column generation_source text not null default 'manual',
  add column source_key text;

alter table public.daily_lessons
  add constraint daily_lessons_generation_source_valid
    check (generation_source in ('manual', 'automatic', 'ai')),
  add constraint daily_lessons_source_key_unique unique (user_id, source_key);

alter table public.learning_resources
  add column storage_path text,
  add column mime_type text,
  add column file_size bigint;

alter table public.learning_resources
  add constraint learning_resources_file_size_valid
    check (file_size is null or file_size between 0 and 52428800);

create index diagnostic_assessments_plan_date_idx
  on public.diagnostic_assessments (plan_id, completed_at desc);

alter table public.diagnostic_assessments enable row level security;
revoke all on table public.diagnostic_assessments from anon, authenticated;
grant select, insert, update, delete on table public.diagnostic_assessments to authenticated;

create policy "diagnostic_assessments_select_own"
on public.diagnostic_assessments for select to authenticated
using ((select auth.uid()) = user_id);

create policy "diagnostic_assessments_insert_own"
on public.diagnostic_assessments for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "diagnostic_assessments_update_own"
on public.diagnostic_assessments for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "diagnostic_assessments_delete_own"
on public.diagnostic_assessments for delete to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'learning-materials',
  'learning-materials',
  false,
  52428800,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'audio/mpeg',
    'audio/mp4',
    'video/mp4',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "learning_materials_select_own"
on storage.objects for select to authenticated
using (
  bucket_id = 'learning-materials'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "learning_materials_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'learning-materials'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "learning_materials_update_own"
on storage.objects for update to authenticated
using (
  bucket_id = 'learning-materials'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'learning-materials'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "learning_materials_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'learning-materials'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

commit;
