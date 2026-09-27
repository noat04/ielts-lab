begin;

create table public.study_skill_catalog (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  slug text not null,
  kind text not null default 'ACTIVITY',
  parent_skill text,
  counts_toward_kpi boolean not null default false,
  color text not null default '#2f6b4f',
  icon text not null default '◎',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_skill_catalog_name_valid check (char_length(btrim(name)) between 1 and 80),
  constraint study_skill_catalog_slug_valid check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint study_skill_catalog_kind_valid check (kind in ('CORE', 'CUSTOM', 'ACTIVITY')),
  constraint study_skill_catalog_parent_valid check (
    parent_skill is null or parent_skill in ('Listening', 'Reading', 'Writing', 'Speaking', 'Grammar / Vocab', 'Review')
  ),
  constraint study_skill_catalog_color_valid check (color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint study_skill_catalog_system_core_valid check (user_id is not null or kind in ('CORE', 'ACTIVITY'))
);

create unique index study_skill_catalog_system_slug_unique
  on public.study_skill_catalog (slug) where user_id is null;
create unique index study_skill_catalog_user_slug_unique
  on public.study_skill_catalog (user_id, slug) where user_id is not null;
create index study_skill_catalog_user_active_idx
  on public.study_skill_catalog (user_id, is_active, name);

insert into public.study_skill_catalog (name, slug, kind, parent_skill, counts_toward_kpi, color, icon) values
  ('Listening', 'listening', 'CORE', 'Listening', true, '#2563eb', 'L'),
  ('Reading', 'reading', 'CORE', 'Reading', true, '#7c3aed', 'R'),
  ('Writing', 'writing', 'CORE', 'Writing', true, '#c2410c', 'W'),
  ('Speaking', 'speaking', 'CORE', 'Speaking', true, '#be185d', 'S'),
  ('Grammar / Vocab', 'grammar-vocab', 'CORE', 'Grammar / Vocab', true, '#15803d', 'G'),
  ('Mock Test', 'mock-test', 'ACTIVITY', 'Review', false, '#334155', 'M'),
  ('Review', 'review', 'ACTIVITY', 'Review', false, '#64748b', '↻'),
  ('Deep Study', 'deep-study', 'ACTIVITY', 'Review', false, '#0f766e', 'D'),
  ('Review & Evaluation', 'review-evaluation', 'ACTIVITY', 'Review', false, '#a16207', 'E')
on conflict do nothing;

alter table public.daily_lessons
  add column if not exists skill_catalog_id uuid references public.study_skill_catalog (id) on delete set null;

alter table public.daily_lessons drop constraint if exists daily_lessons_skill_valid;
alter table public.daily_lessons add constraint daily_lessons_skill_valid check (
  skill in ('Listening', 'Reading', 'Writing', 'Speaking', 'Grammar / Vocab', 'Mock Test', 'Review')
);

create or replace function public.ielts_lab_slugify_skill(p_value text)
returns text language sql immutable set search_path = '' as $$
  select trim(both '-' from regexp_replace(lower(btrim($1)), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function public.ielts_lab_resolve_lesson_skill()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_catalog public.study_skill_catalog;
  v_slug text;
begin
  if new.skill_catalog_id is not null then
    select * into v_catalog from public.study_skill_catalog where id = new.skill_catalog_id;
    if v_catalog.id is null or (v_catalog.user_id is not null and v_catalog.user_id <> new.user_id) then
      raise exception 'Skill catalog entry is not available for this user';
    end if;
  else
    select * into v_catalog from public.study_skill_catalog
    where is_active and (user_id = new.user_id or user_id is null) and lower(name) = lower(btrim(new.skill))
    order by (user_id = new.user_id) desc limit 1;
  end if;

  if v_catalog.id is null and new.skill not in ('Listening', 'Reading', 'Writing', 'Speaking', 'Grammar / Vocab', 'Mock Test', 'Review') then
    v_slug := public.ielts_lab_slugify_skill(new.skill);
    if v_slug = '' then raise exception 'Skill name is invalid'; end if;
    begin
      insert into public.study_skill_catalog (user_id, name, slug, kind, parent_skill, counts_toward_kpi)
      values (new.user_id, btrim(new.skill), v_slug, 'ACTIVITY', 'Review', false)
      returning * into v_catalog;
    exception when unique_violation then
      select * into v_catalog from public.study_skill_catalog where user_id = new.user_id and slug = v_slug;
    end;
  end if;

  if v_catalog.id is not null then
    new.skill_catalog_id := v_catalog.id;
    new.skill := case
      when v_catalog.kind = 'CORE' then v_catalog.name
      when v_catalog.counts_toward_kpi and v_catalog.parent_skill is not null then v_catalog.parent_skill
      else 'Review'
    end;
  end if;
  return new;
end;
$$;

create trigger daily_lessons_resolve_skill
before insert or update of skill, skill_catalog_id on public.daily_lessons
for each row execute function public.ielts_lab_resolve_lesson_skill();

update public.daily_lessons lesson set skill_catalog_id = catalog.id
from public.study_skill_catalog catalog
where catalog.user_id is null and catalog.kind = 'CORE'
  and lower(catalog.name) = lower(lesson.skill) and lesson.skill_catalog_id is null;

create trigger study_skill_catalog_set_updated_at before update on public.study_skill_catalog
for each row execute function public.ielts_lab_set_updated_at();

alter table public.study_skill_catalog enable row level security;
create policy "study_skill_catalog_visible" on public.study_skill_catalog for select to authenticated
using (user_id is null or user_id = (select auth.uid()));
create policy "study_skill_catalog_insert_own" on public.study_skill_catalog for insert to authenticated
with check (user_id = (select auth.uid()) and kind <> 'CORE');
create policy "study_skill_catalog_update_own" on public.study_skill_catalog for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and kind <> 'CORE');
create policy "study_skill_catalog_delete_own" on public.study_skill_catalog for delete to authenticated
using (user_id = (select auth.uid()));

grant select, insert, update, delete on table public.study_skill_catalog to authenticated;
revoke all on function public.ielts_lab_slugify_skill(text) from public, anon;
grant execute on function public.ielts_lab_slugify_skill(text) to authenticated;

commit;
