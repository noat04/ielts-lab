begin;

alter table public.learning_resources
  add column source_provider text not null default 'EXTERNAL_LINK',
  add column external_file_id text,
  add column original_filename text,
  add column preview_url text,
  add column folder_name text not null default 'Chưa phân loại',
  add column tags text[] not null default '{}',
  add column skills text[] not null default '{}',
  add column access_status text not null default 'READY',
  add column is_favorite boolean not null default false,
  add column last_opened_at timestamptz,
  add column metadata jsonb not null default '{}'::jsonb,
  add constraint learning_resources_provider_valid check (
    source_provider in ('LOCAL_STORAGE', 'GOOGLE_DRIVE', 'EXTERNAL_LINK')
  ),
  add constraint learning_resources_access_status_valid check (
    access_status in ('READY', 'PROCESSING', 'BROKEN', 'ARCHIVED')
  ),
  add constraint learning_resources_folder_not_blank check (
    char_length(btrim(folder_name)) between 1 and 100
  ),
  add constraint learning_resources_skills_valid check (
    skills <@ array['Listening', 'Reading', 'Writing', 'Speaking', 'Grammar / Vocab', 'General']::text[]
  ),
  add constraint learning_resources_metadata_object check (jsonb_typeof(metadata) = 'object');

alter table public.learning_resources
  add constraint learning_resources_user_id_id_unique unique (user_id, id);

alter table public.learning_source_mappings
  add constraint learning_source_mappings_resource_owner_fk
  foreign key (user_id, resource_id) references public.learning_resources (user_id, id)
  on delete set null (resource_id);

update public.learning_resources
set source_provider = case
    when storage_path is not null then 'LOCAL_STORAGE'
    when url ilike '%drive.google.com%' or url ilike '%docs.google.com%' then 'GOOGLE_DRIVE'
    else 'EXTERNAL_LINK'
  end,
  original_filename = case when storage_path is not null then title else original_filename end,
  folder_name = case when btrim(folder_name) = '' then 'Chưa phân loại' else folder_name end;

create index learning_resources_library_idx
  on public.learning_resources (user_id, plan_id, source_provider, folder_name);
create index learning_resources_tags_idx on public.learning_resources using gin (tags);
create index learning_resources_skills_idx on public.learning_resources using gin (skills);

commit;
