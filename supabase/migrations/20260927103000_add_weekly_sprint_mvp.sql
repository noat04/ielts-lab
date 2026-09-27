begin;

create table public.week_sprints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id uuid not null,
  week_number integer not null,
  start_date date not null,
  end_date date not null,
  title text not null,
  objective text not null default '',
  skill_targets jsonb not null default '{}'::jsonb,
  status text not null default 'PLANNED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, plan_id) references public.learning_plans (user_id, id) on delete cascade,
  constraint week_sprints_number_valid check (week_number between 1 and 520),
  constraint week_sprints_dates_valid check (end_date >= start_date),
  constraint week_sprints_title_not_blank check (char_length(btrim(title)) between 1 and 160),
  constraint week_sprints_targets_object check (jsonb_typeof(skill_targets) = 'object'),
  constraint week_sprints_status_valid check (status in ('PLANNED', 'IN_PROGRESS', 'REVIEW', 'COMPLETED')),
  unique (user_id, plan_id, week_number),
  unique (user_id, id)
);

create table public.learning_source_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id uuid not null,
  resource_id uuid,
  document_title text not null,
  unit text not null default '',
  section text not null default '',
  page_from integer,
  page_to integer,
  audio_track text not null default '',
  script_page integer,
  exercise_from text not null default '',
  exercise_to text not null default '',
  source_url text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, plan_id) references public.learning_plans (user_id, id) on delete cascade,
  constraint learning_source_document_not_blank check (char_length(btrim(document_title)) between 1 and 200),
  constraint learning_source_pages_valid check (
    (page_from is null or page_from > 0)
    and (page_to is null or page_to > 0)
    and (page_from is null or page_to is null or page_to >= page_from)
    and (script_page is null or script_page > 0)
  ),
  unique (user_id, id)
);

alter table public.daily_lessons add constraint daily_lessons_user_id_id_unique unique (user_id, id);
alter table public.bugs add constraint bugs_user_id_id_unique unique (user_id, id);

alter table public.daily_lessons
  add column week_sprint_id uuid,
  add column source_mapping_id uuid,
  add column objective text not null default '',
  add column target_score numeric(5, 2),
  add column actual_score numeric(5, 2),
  add column workflow_status text not null default 'TODO',
  add column started_at timestamptz,
  add constraint daily_lessons_week_sprint_fk foreign key (user_id, week_sprint_id)
    references public.week_sprints (user_id, id) on delete set null (week_sprint_id),
  add constraint daily_lessons_source_mapping_fk foreign key (user_id, source_mapping_id)
    references public.learning_source_mappings (user_id, id) on delete set null (source_mapping_id),
  add constraint daily_lessons_scores_valid check (
    (target_score is null or target_score between 0 and 100)
    and (actual_score is null or actual_score between 0 and 100)
  ),
  add constraint daily_lessons_workflow_status_valid check (
    workflow_status in ('TODO', 'LEARNING', 'PRACTICING', 'REVIEWING', 'DONE')
  );

create table public.study_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lesson_id uuid not null,
  position integer not null default 0,
  task_type text not null default 'practice',
  title text not null,
  instructions text not null default '',
  question text not null,
  answer_type text not null default 'text',
  correct_answer text not null default '',
  points numeric(6, 2) not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, lesson_id) references public.daily_lessons (user_id, id) on delete cascade,
  constraint study_tasks_position_valid check (position >= 0),
  constraint study_tasks_type_valid check (task_type in ('warmup', 'practice', 'listening', 'reading', 'writing', 'speaking', 'review')),
  constraint study_tasks_title_not_blank check (char_length(btrim(title)) between 1 and 160),
  constraint study_tasks_question_not_blank check (char_length(btrim(question)) > 0),
  constraint study_tasks_answer_type_valid check (answer_type in ('text', 'long_text', 'number', 'self_check')),
  constraint study_tasks_points_valid check (points >= 0),
  constraint study_tasks_metadata_object check (jsonb_typeof(metadata) = 'object'),
  unique (user_id, id)
);

create table public.task_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid not null,
  attempt_number integer not null default 1,
  user_answer text not null default '',
  is_correct boolean,
  score numeric(6, 2) not null default 0,
  feedback text not null default '',
  evidence text not null default '',
  submitted_at timestamptz not null default now(),
  foreign key (user_id, task_id) references public.study_tasks (user_id, id) on delete cascade,
  constraint task_attempts_number_valid check (attempt_number > 0),
  constraint task_attempts_score_valid check (score >= 0),
  unique (user_id, task_id, attempt_number),
  unique (user_id, id)
);

create table public.session_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lesson_id uuid not null,
  duration_minutes integer not null,
  total_questions integer not null default 0,
  correct_answers integer not null default 0,
  wrong_answers integer not null default 0,
  score_percent numeric(5, 2),
  new_bugs integer not null default 0,
  strong_points text[] not null default '{}',
  weak_points text[] not null default '{}',
  notes text not null default '',
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, lesson_id) references public.daily_lessons (user_id, id) on delete cascade,
  constraint session_results_duration_valid check (duration_minutes between 1 and 1440),
  constraint session_results_counts_valid check (
    total_questions >= 0 and correct_answers >= 0 and wrong_answers >= 0
    and correct_answers + wrong_answers <= total_questions and new_bugs >= 0
  ),
  constraint session_results_score_valid check (score_percent is null or score_percent between 0 and 100),
  unique (user_id, lesson_id),
  unique (user_id, id)
);

alter table public.study_sessions
  add column daily_lesson_id uuid,
  add constraint study_sessions_daily_lesson_fk foreign key (user_id, daily_lesson_id)
    references public.daily_lessons (user_id, id) on delete set null (daily_lesson_id),
  add constraint study_sessions_daily_lesson_unique unique (user_id, daily_lesson_id);

alter table public.bugs
  add column daily_lesson_id uuid,
  add column task_attempt_id uuid,
  add column error_type text,
  add column root_cause text not null default '',
  add column refactor_rule text not null default '',
  add constraint bugs_daily_lesson_fk foreign key (user_id, daily_lesson_id)
    references public.daily_lessons (user_id, id) on delete set null (daily_lesson_id),
  add constraint bugs_task_attempt_fk foreign key (user_id, task_attempt_id)
    references public.task_attempts (user_id, id) on delete set null (task_attempt_id),
  add constraint bugs_task_attempt_unique unique (user_id, task_attempt_id);

create index week_sprints_plan_date_idx on public.week_sprints (plan_id, start_date desc);
create index learning_source_mappings_plan_idx on public.learning_source_mappings (plan_id, document_title);
create index daily_lessons_week_sprint_idx on public.daily_lessons (week_sprint_id, lesson_date);
create index study_tasks_lesson_position_idx on public.study_tasks (lesson_id, position);
create index task_attempts_task_date_idx on public.task_attempts (task_id, submitted_at desc);
create index session_results_lesson_idx on public.session_results (lesson_id);
create index bugs_daily_lesson_idx on public.bugs (daily_lesson_id);

create trigger week_sprints_set_updated_at before update on public.week_sprints
for each row execute function public.ielts_lab_set_updated_at();
create trigger learning_source_mappings_set_updated_at before update on public.learning_source_mappings
for each row execute function public.ielts_lab_set_updated_at();
create trigger study_tasks_set_updated_at before update on public.study_tasks
for each row execute function public.ielts_lab_set_updated_at();
create trigger session_results_set_updated_at before update on public.session_results
for each row execute function public.ielts_lab_set_updated_at();

alter table public.week_sprints enable row level security;
alter table public.learning_source_mappings enable row level security;
alter table public.study_tasks enable row level security;
alter table public.task_attempts enable row level security;
alter table public.session_results enable row level security;

grant select, insert, update, delete on table public.week_sprints to authenticated;
grant select, insert, update, delete on table public.learning_source_mappings to authenticated;
grant select, insert, update, delete on table public.study_tasks to authenticated;
grant select, insert, update, delete on table public.task_attempts to authenticated;
grant select, insert, update, delete on table public.session_results to authenticated;

create policy "week_sprints_own_all" on public.week_sprints for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "learning_source_mappings_own_all" on public.learning_source_mappings for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "study_tasks_own_all" on public.study_tasks for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "task_attempts_own_all" on public.task_attempts for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "session_results_own_all" on public.session_results for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.ielts_lab_complete_session(
  p_lesson_id uuid,
  p_duration_minutes integer,
  p_notes text default ''
)
returns public.session_results
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_lesson public.daily_lessons;
  v_total integer;
  v_correct integer;
  v_wrong integer;
  v_bug_count integer;
  v_score numeric(5, 2);
  v_result public.session_results;
  v_session_skill text;
begin
  select * into v_lesson from public.daily_lessons
  where id = p_lesson_id and user_id = v_user_id;
  if v_lesson.id is null then raise exception 'Lesson not found'; end if;

  select count(*), count(*) filter (where a.is_correct is true), count(*) filter (where a.is_correct is false)
  into v_total, v_correct, v_wrong
  from public.study_tasks t
  left join lateral (
    select is_correct from public.task_attempts
    where user_id = v_user_id and task_id = t.id
    order by attempt_number desc limit 1
  ) a on true
  where t.user_id = v_user_id and t.lesson_id = p_lesson_id;

  select count(*) into v_bug_count from public.bugs
  where user_id = v_user_id and daily_lesson_id = p_lesson_id;
  v_score := case when v_total > 0 then round((v_correct::numeric / v_total::numeric) * 100, 2) else null end;

  insert into public.session_results (
    user_id, lesson_id, duration_minutes, total_questions, correct_answers,
    wrong_answers, score_percent, new_bugs, notes, completed_at
  ) values (
    v_user_id, p_lesson_id, p_duration_minutes, v_total, v_correct,
    v_wrong, v_score, v_bug_count, coalesce(p_notes, ''), now()
  )
  on conflict (user_id, lesson_id) do update set
    duration_minutes = excluded.duration_minutes,
    total_questions = excluded.total_questions,
    correct_answers = excluded.correct_answers,
    wrong_answers = excluded.wrong_answers,
    score_percent = excluded.score_percent,
    new_bugs = excluded.new_bugs,
    notes = excluded.notes,
    completed_at = excluded.completed_at
  returning * into v_result;

  update public.daily_lessons set
    status = 'completed', workflow_status = 'DONE', actual_score = v_score,
    completed_at = now()
  where id = p_lesson_id and user_id = v_user_id;

  v_session_skill := case
    when v_lesson.skill in ('Listening', 'Reading', 'Writing', 'Speaking', 'Grammar / Vocab') then v_lesson.skill
    else 'Grammar / Vocab'
  end;
  insert into public.study_sessions (
    user_id, daily_lesson_id, plan_id, study_date, skill, duration_minutes,
    title, note, status, origin, source_key
  ) values (
    v_user_id, p_lesson_id, v_lesson.plan_id, v_lesson.lesson_date, v_session_skill,
    p_duration_minutes, v_lesson.title, coalesce(p_notes, ''), 'completed', 'user',
    'session-result-' || p_lesson_id::text
  )
  on conflict (user_id, daily_lesson_id) do update set
    duration_minutes = excluded.duration_minutes,
    note = excluded.note,
    status = 'completed',
    updated_at = now();

  if v_lesson.week_sprint_id is not null then
    update public.week_sprints set status = case when status = 'PLANNED' then 'IN_PROGRESS' else status end
    where id = v_lesson.week_sprint_id and user_id = v_user_id;
  end if;
  return v_result;
end;
$$;

revoke all on function public.ielts_lab_complete_session(uuid, integer, text) from public;
grant execute on function public.ielts_lab_complete_session(uuid, integer, text) to authenticated;

commit;
