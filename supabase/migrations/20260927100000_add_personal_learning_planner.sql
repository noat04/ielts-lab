begin;

create table public.learning_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  description text not null default '',
  start_date date not null default current_date,
  end_date date not null,
  exam_date date,
  current_band numeric(2, 1) not null default 5.0,
  target_band numeric(2, 1) not null default 6.5,
  weekly_minutes integer not null default 300,
  study_days smallint[] not null default '{1,2,3,4,5}',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_plans_title_not_blank check (char_length(btrim(title)) between 1 and 120),
  constraint learning_plans_dates_valid check (end_date >= start_date and (exam_date is null or exam_date >= start_date)),
  constraint learning_plans_bands_valid check (
    current_band between 0 and 9
    and target_band between 0 and 9
    and current_band <= target_band
    and mod(current_band * 10, 5) = 0
    and mod(target_band * 10, 5) = 0
  ),
  constraint learning_plans_weekly_minutes_valid check (weekly_minutes between 30 and 10080),
  constraint learning_plans_study_days_valid check (
    cardinality(study_days) between 1 and 7
    and study_days <@ array[0,1,2,3,4,5,6]::smallint[]
  ),
  constraint learning_plans_status_valid check (status in ('draft', 'active', 'completed', 'archived')),
  unique (user_id, id)
);

create table public.plan_phases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id uuid not null,
  title text not null,
  description text not null default '',
  start_date date not null,
  end_date date not null,
  position integer not null default 0,
  status text not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, plan_id)
    references public.learning_plans (user_id, id)
    on delete cascade,
  constraint plan_phases_title_not_blank check (char_length(btrim(title)) between 1 and 120),
  constraint plan_phases_dates_valid check (end_date >= start_date),
  constraint plan_phases_status_valid check (status in ('planned', 'active', 'completed')),
  unique (user_id, plan_id, id)
);

create table public.daily_lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id uuid not null,
  phase_id uuid,
  lesson_date date not null default current_date,
  title text not null,
  description text not null default '',
  skill text not null,
  duration_minutes integer not null default 30,
  priority text not null default 'medium',
  status text not null default 'todo',
  resource_url text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, plan_id)
    references public.learning_plans (user_id, id)
    on delete cascade,
  foreign key (user_id, plan_id, phase_id)
    references public.plan_phases (user_id, plan_id, id)
    on delete set null (phase_id),
  constraint daily_lessons_title_not_blank check (char_length(btrim(title)) between 1 and 160),
  constraint daily_lessons_skill_valid check (
    skill in ('Listening', 'Reading', 'Writing', 'Speaking', 'Grammar / Vocab', 'Mock Test', 'Review')
  ),
  constraint daily_lessons_duration_valid check (duration_minutes between 5 and 1440),
  constraint daily_lessons_priority_valid check (priority in ('low', 'medium', 'high')),
  constraint daily_lessons_status_valid check (status in ('todo', 'in_progress', 'completed', 'skipped')),
  constraint daily_lessons_completed_at_valid check (status = 'completed' or completed_at is null)
);

create table public.exam_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id uuid not null,
  title text not null,
  exam_type text not null default 'mock',
  exam_date date not null,
  exam_time time,
  venue text not null default '',
  target_band numeric(2, 1),
  note text not null default '',
  status text not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, plan_id)
    references public.learning_plans (user_id, id)
    on delete cascade,
  constraint exam_events_title_not_blank check (char_length(btrim(title)) between 1 and 160),
  constraint exam_events_type_valid check (exam_type in ('official', 'mock', 'checkpoint')),
  constraint exam_events_band_valid check (target_band is null or target_band between 0 and 9),
  constraint exam_events_status_valid check (status in ('planned', 'completed', 'cancelled'))
);

alter table public.bugs add column plan_id uuid;
alter table public.study_sessions add column plan_id uuid;
alter table public.test_results add column plan_id uuid;
alter table public.learning_resources
  add column plan_id uuid,
  add column description text not null default '',
  add column is_primary boolean not null default false;

alter table public.bugs add constraint bugs_plan_owner_fk
  foreign key (user_id, plan_id) references public.learning_plans (user_id, id) on delete set null (plan_id);
alter table public.study_sessions add constraint study_sessions_plan_owner_fk
  foreign key (user_id, plan_id) references public.learning_plans (user_id, id) on delete set null (plan_id);
alter table public.test_results add constraint test_results_plan_owner_fk
  foreign key (user_id, plan_id) references public.learning_plans (user_id, id) on delete set null (plan_id);
alter table public.learning_resources add constraint learning_resources_plan_owner_fk
  foreign key (user_id, plan_id) references public.learning_plans (user_id, id) on delete cascade;

create index learning_plans_user_id_idx on public.learning_plans (user_id);
create index learning_plans_user_status_idx on public.learning_plans (user_id, status, created_at desc);
create index plan_phases_user_id_idx on public.plan_phases (user_id);
create index plan_phases_plan_position_idx on public.plan_phases (plan_id, position);
create index daily_lessons_user_id_idx on public.daily_lessons (user_id);
create index daily_lessons_plan_date_idx on public.daily_lessons (plan_id, lesson_date, status);
create index exam_events_user_id_idx on public.exam_events (user_id);
create index exam_events_plan_date_idx on public.exam_events (plan_id, exam_date);
create index bugs_plan_id_idx on public.bugs (plan_id);
create index study_sessions_plan_id_idx on public.study_sessions (plan_id);
create index test_results_plan_id_idx on public.test_results (plan_id);
create index learning_resources_plan_id_idx on public.learning_resources (plan_id);

create trigger learning_plans_set_updated_at
before update on public.learning_plans
for each row execute function public.ielts_lab_set_updated_at();

create trigger plan_phases_set_updated_at
before update on public.plan_phases
for each row execute function public.ielts_lab_set_updated_at();

create trigger daily_lessons_set_updated_at
before update on public.daily_lessons
for each row execute function public.ielts_lab_set_updated_at();

create trigger exam_events_set_updated_at
before update on public.exam_events
for each row execute function public.ielts_lab_set_updated_at();

alter table public.learning_plans enable row level security;
alter table public.plan_phases enable row level security;
alter table public.daily_lessons enable row level security;
alter table public.exam_events enable row level security;

revoke all on table public.learning_plans from anon, authenticated;
revoke all on table public.plan_phases from anon, authenticated;
revoke all on table public.daily_lessons from anon, authenticated;
revoke all on table public.exam_events from anon, authenticated;

grant select, insert, update, delete on table public.learning_plans to authenticated;
grant select, insert, update, delete on table public.plan_phases to authenticated;
grant select, insert, update, delete on table public.daily_lessons to authenticated;
grant select, insert, update, delete on table public.exam_events to authenticated;

create policy "learning_plans_select_own" on public.learning_plans for select to authenticated
using ((select auth.uid()) = user_id);
create policy "learning_plans_insert_own" on public.learning_plans for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "learning_plans_update_own" on public.learning_plans for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "learning_plans_delete_own" on public.learning_plans for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "plan_phases_select_own" on public.plan_phases for select to authenticated
using ((select auth.uid()) = user_id);
create policy "plan_phases_insert_own" on public.plan_phases for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "plan_phases_update_own" on public.plan_phases for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "plan_phases_delete_own" on public.plan_phases for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "daily_lessons_select_own" on public.daily_lessons for select to authenticated
using ((select auth.uid()) = user_id);
create policy "daily_lessons_insert_own" on public.daily_lessons for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "daily_lessons_update_own" on public.daily_lessons for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "daily_lessons_delete_own" on public.daily_lessons for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "exam_events_select_own" on public.exam_events for select to authenticated
using ((select auth.uid()) = user_id);
create policy "exam_events_insert_own" on public.exam_events for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "exam_events_update_own" on public.exam_events for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "exam_events_delete_own" on public.exam_events for delete to authenticated
using ((select auth.uid()) = user_id);

commit;
