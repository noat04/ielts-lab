begin;

alter table public.daily_lessons
  add column if not exists study_time time;

alter table public.exam_events
  add constraint exam_events_user_id_id_unique unique (user_id, id);

create table public.study_reminder_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  enabled boolean not null default true,
  browser_notifications boolean not null default false,
  default_study_time time not null default '19:00',
  lesson_lead_minutes integer not null default 30,
  exam_lead_minutes integer not null default 1440,
  time_zone text not null default 'Asia/Bangkok',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_reminder_lesson_lead_valid check (lesson_lead_minutes between 0 and 10080),
  constraint study_reminder_exam_lead_valid check (exam_lead_minutes between 0 and 43200),
  constraint study_reminder_time_zone_not_blank check (char_length(btrim(time_zone)) between 1 and 100)
);

create table public.study_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id uuid not null,
  lesson_id uuid,
  exam_id uuid,
  reminder_type text not null,
  title text not null,
  scheduled_for timestamptz not null,
  snoozed_until timestamptz,
  status text not null default 'SCHEDULED',
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, plan_id) references public.learning_plans (user_id, id) on delete cascade,
  foreign key (user_id, lesson_id) references public.daily_lessons (user_id, id) on delete cascade,
  foreign key (user_id, exam_id) references public.exam_events (user_id, id) on delete cascade,
  constraint study_reminders_one_source check (num_nonnulls(lesson_id, exam_id) = 1),
  constraint study_reminders_type_valid check (reminder_type in ('LESSON', 'EXAM')),
  constraint study_reminders_source_matches_type check (
    (reminder_type = 'LESSON' and lesson_id is not null and exam_id is null)
    or (reminder_type = 'EXAM' and exam_id is not null and lesson_id is null)
  ),
  constraint study_reminders_status_valid check (status in ('SCHEDULED', 'SNOOZED', 'DISMISSED')),
  constraint study_reminders_title_not_blank check (char_length(btrim(title)) between 1 and 200),
  unique (lesson_id),
  unique (exam_id)
);

create index study_reminders_user_due_idx
  on public.study_reminders (user_id, status, scheduled_for);
create index study_reminders_plan_due_idx
  on public.study_reminders (plan_id, scheduled_for);

create trigger study_reminder_settings_set_updated_at
before update on public.study_reminder_settings
for each row execute function public.ielts_lab_set_updated_at();

create trigger study_reminders_set_updated_at
before update on public.study_reminders
for each row execute function public.ielts_lab_set_updated_at();

create or replace function public.ielts_lab_reminder_timestamp(
  p_date date,
  p_time time,
  p_time_zone text,
  p_lead_minutes integer
) returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (($1 + $2) at time zone $3) - make_interval(mins => $4);
$$;

create or replace function public.ielts_lab_sync_lesson_reminder()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_settings public.study_reminder_settings;
  v_scheduled_for timestamptz;
begin
  if new.status in ('completed', 'skipped') then
    update public.study_reminders
    set status = 'DISMISSED', snoozed_until = null
    where lesson_id = new.id;
    return new;
  end if;

  select * into v_settings
  from public.study_reminder_settings
  where user_id = new.user_id;

  v_scheduled_for := public.ielts_lab_reminder_timestamp(
    new.lesson_date,
    coalesce(new.study_time, v_settings.default_study_time, '19:00'::time),
    coalesce(v_settings.time_zone, 'Asia/Bangkok'),
    coalesce(v_settings.lesson_lead_minutes, 30)
  );

  insert into public.study_reminders (
    user_id, plan_id, lesson_id, reminder_type, title, scheduled_for
  ) values (
    new.user_id, new.plan_id, new.id, 'LESSON', new.title, v_scheduled_for
  )
  on conflict (lesson_id) do update set
    plan_id = excluded.plan_id,
    title = excluded.title,
    scheduled_for = excluded.scheduled_for,
    notified_at = case
      when public.study_reminders.scheduled_for is distinct from excluded.scheduled_for then null
      else public.study_reminders.notified_at
    end;

  if tg_op = 'UPDATE' and old.status in ('completed', 'skipped') then
    update public.study_reminders
    set status = 'SCHEDULED', snoozed_until = null, notified_at = null
    where lesson_id = new.id;
  end if;

  return new;
end;
$$;

create or replace function public.ielts_lab_sync_exam_reminder()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_settings public.study_reminder_settings;
  v_scheduled_for timestamptz;
begin
  if new.status in ('completed', 'cancelled') then
    update public.study_reminders
    set status = 'DISMISSED', snoozed_until = null
    where exam_id = new.id;
    return new;
  end if;

  select * into v_settings
  from public.study_reminder_settings
  where user_id = new.user_id;

  v_scheduled_for := public.ielts_lab_reminder_timestamp(
    new.exam_date,
    coalesce(new.exam_time, '09:00'::time),
    coalesce(v_settings.time_zone, 'Asia/Bangkok'),
    coalesce(v_settings.exam_lead_minutes, 1440)
  );

  insert into public.study_reminders (
    user_id, plan_id, exam_id, reminder_type, title, scheduled_for
  ) values (
    new.user_id, new.plan_id, new.id, 'EXAM', new.title, v_scheduled_for
  )
  on conflict (exam_id) do update set
    plan_id = excluded.plan_id,
    title = excluded.title,
    scheduled_for = excluded.scheduled_for,
    notified_at = case
      when public.study_reminders.scheduled_for is distinct from excluded.scheduled_for then null
      else public.study_reminders.notified_at
    end;

  if tg_op = 'UPDATE' and old.status in ('completed', 'cancelled') then
    update public.study_reminders
    set status = 'SCHEDULED', snoozed_until = null, notified_at = null
    where exam_id = new.id;
  end if;

  return new;
end;
$$;

create trigger daily_lessons_sync_reminder
after insert or update of plan_id, lesson_date, study_time, title, status on public.daily_lessons
for each row execute function public.ielts_lab_sync_lesson_reminder();

create trigger exam_events_sync_reminder
after insert or update of plan_id, exam_date, exam_time, title, status on public.exam_events
for each row execute function public.ielts_lab_sync_exam_reminder();

create or replace function public.ielts_lab_refresh_study_reminders()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_settings public.study_reminder_settings;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_settings
  from public.study_reminder_settings
  where user_id = v_user_id;

  insert into public.study_reminders (
    user_id, plan_id, lesson_id, reminder_type, title, scheduled_for
  )
  select
    lesson.user_id,
    lesson.plan_id,
    lesson.id,
    'LESSON',
    lesson.title,
    public.ielts_lab_reminder_timestamp(
      lesson.lesson_date,
      coalesce(lesson.study_time, v_settings.default_study_time, '19:00'::time),
      coalesce(v_settings.time_zone, 'Asia/Bangkok'),
      coalesce(v_settings.lesson_lead_minutes, 30)
    )
  from public.daily_lessons lesson
  where lesson.user_id = v_user_id
    and lesson.status not in ('completed', 'skipped')
  on conflict (lesson_id) do update set
    plan_id = excluded.plan_id,
    title = excluded.title,
    scheduled_for = excluded.scheduled_for,
    notified_at = case
      when public.study_reminders.scheduled_for is distinct from excluded.scheduled_for then null
      else public.study_reminders.notified_at
    end;

  insert into public.study_reminders (
    user_id, plan_id, exam_id, reminder_type, title, scheduled_for
  )
  select
    exam.user_id,
    exam.plan_id,
    exam.id,
    'EXAM',
    exam.title,
    public.ielts_lab_reminder_timestamp(
      exam.exam_date,
      coalesce(exam.exam_time, '09:00'::time),
      coalesce(v_settings.time_zone, 'Asia/Bangkok'),
      coalesce(v_settings.exam_lead_minutes, 1440)
    )
  from public.exam_events exam
  where exam.user_id = v_user_id
    and exam.status = 'planned'
  on conflict (exam_id) do update set
    plan_id = excluded.plan_id,
    title = excluded.title,
    scheduled_for = excluded.scheduled_for,
    notified_at = case
      when public.study_reminders.scheduled_for is distinct from excluded.scheduled_for then null
      else public.study_reminders.notified_at
    end;

  update public.study_reminders reminder
  set status = 'DISMISSED', snoozed_until = null
  where reminder.user_id = v_user_id
    and (
      (reminder.lesson_id is not null and exists (
        select 1 from public.daily_lessons lesson
        where lesson.id = reminder.lesson_id and lesson.status in ('completed', 'skipped')
      ))
      or (reminder.exam_id is not null and exists (
        select 1 from public.exam_events exam
        where exam.id = reminder.exam_id and exam.status in ('completed', 'cancelled')
      ))
    );
end;
$$;

insert into public.study_reminder_settings (user_id)
select id from auth.users
on conflict (user_id) do nothing;

insert into public.study_reminders (
  user_id, plan_id, lesson_id, reminder_type, title, scheduled_for
)
select
  lesson.user_id,
  lesson.plan_id,
  lesson.id,
  'LESSON',
  lesson.title,
  public.ielts_lab_reminder_timestamp(
    lesson.lesson_date,
    coalesce(lesson.study_time, settings.default_study_time, '19:00'::time),
    coalesce(settings.time_zone, 'Asia/Bangkok'),
    coalesce(settings.lesson_lead_minutes, 30)
  )
from public.daily_lessons lesson
left join public.study_reminder_settings settings on settings.user_id = lesson.user_id
where lesson.status not in ('completed', 'skipped')
on conflict (lesson_id) do nothing;

insert into public.study_reminders (
  user_id, plan_id, exam_id, reminder_type, title, scheduled_for
)
select
  exam.user_id,
  exam.plan_id,
  exam.id,
  'EXAM',
  exam.title,
  public.ielts_lab_reminder_timestamp(
    exam.exam_date,
    coalesce(exam.exam_time, '09:00'::time),
    coalesce(settings.time_zone, 'Asia/Bangkok'),
    coalesce(settings.exam_lead_minutes, 1440)
  )
from public.exam_events exam
left join public.study_reminder_settings settings on settings.user_id = exam.user_id
where exam.status = 'planned'
on conflict (exam_id) do nothing;

alter table public.study_reminder_settings enable row level security;
alter table public.study_reminders enable row level security;

revoke all on table public.study_reminder_settings from anon, authenticated;
revoke all on table public.study_reminders from anon, authenticated;
grant select, insert, update, delete on table public.study_reminder_settings to authenticated;
grant select, insert, update, delete on table public.study_reminders to authenticated;

create policy "study_reminder_settings_select_own"
on public.study_reminder_settings for select to authenticated
using ((select auth.uid()) = user_id);
create policy "study_reminder_settings_insert_own"
on public.study_reminder_settings for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "study_reminder_settings_update_own"
on public.study_reminder_settings for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "study_reminder_settings_delete_own"
on public.study_reminder_settings for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "study_reminders_select_own"
on public.study_reminders for select to authenticated
using ((select auth.uid()) = user_id);
create policy "study_reminders_insert_own"
on public.study_reminders for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "study_reminders_update_own"
on public.study_reminders for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "study_reminders_delete_own"
on public.study_reminders for delete to authenticated
using ((select auth.uid()) = user_id);

revoke all on function public.ielts_lab_refresh_study_reminders() from public, anon;
grant execute on function public.ielts_lab_refresh_study_reminders() to authenticated;

commit;
